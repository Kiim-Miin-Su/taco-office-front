/** @file-guide
 * 목적: exec-autosave.test.tsx — 대표 보고 메모(§69 여섯 칸)의 N-69 브라우저 자동 저장 연결 회귀(W11 R2).
 * 책임/재사용: 실제 ExecPage/useExec 를 어댑터 응답으로 돌린다. 저장 규칙 자체(키 · 덮지 않기 · 비우기)는 lib/autosave 시험이 본다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Exec, ExecReport, Me } from '@/api/types';
import { clearAllDrafts, draftKey, readDraft } from '@/lib/autosave';
import { useSession } from '@/store/useSession';
import ExecPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('view=day&date=2026-08-21'),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true, canApprove: true, canHide: true, canGpaPack: true,
} as Me;

const area = (key: string, label: string) => ({
  key, label, review: '—', count: 0, go: '/ops', headline: `${label} 한 줄`, tiles: [], itemsLabel: null, items: [],
  ownerId: null, ownerName: null, canSetOwner: false,
});

/** 서버 응답 모양 — 메모 칸 둘이면 충분하다(칸 · 순서는 서버 것) */
const exec = (reports: ExecReport[] = []) => ({
  from: '2026-08-21', to: '2026-08-21', periodKind: 'day', sheetTitle: '일일 업무 보고', periodLabel: '26년 8월 21일 금요일',
  head: [], stats: [], reports, areas: [area('money', '회계'), area('ops', '운영')],
  reviewCount: 0, filled: 0, inbox: [], canSeeAmounts: true, computedAt: '2026-08-21T00:00:00.000Z',
}) as unknown as Exec;

const KEY = draftKey(1, 'exec-memo', 'day:2026-08-21');
const clients: QueryClient[] = [];

function mount(data: Exec) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = vi.fn(async (config) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><ExecPage /></QueryClientProvider>);
}

const originalAdapter = api.defaults.adapter;
beforeEach(() => { window.localStorage.clear(); clearAllDrafts(); });
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

it('쓰던 메모는 잠깐 멈추면 이 브라우저에 남고(키 = 사용자 · 기간), 다시 열면 같은 서버 보고에서 되살아난다', async () => {
  const first = mount(exec());
  await waitFor(() => expect(first.getByRole('textbox', { name: '회계 메모' })).toBeTruthy());
  fireEvent.change(first.getByRole('textbox', { name: '회계 메모' }), { target: { value: '기한 지난 청구서 2건' } });
  await waitFor(() => expect(readDraft<Record<string, string>>(KEY)?.value).toEqual({ money: '기한 지난 청구서 2건' }), { timeout: 2000 });
  cleanup();

  const again = mount(exec());
  await waitFor(() => expect((again.getByRole('textbox', { name: '회계 메모' }) as HTMLTextAreaElement).value).toBe('기한 지난 청구서 2건'));
  expect(again.container.textContent).toContain('담당 1/6 기재');
});

it('이미 올린 보고(더 고칠 수 없음)에는 남아 있던 메모를 되살리지 않고 지운다 — 올린 글을 덮지 않는다', async () => {
  window.localStorage.setItem(KEY, JSON.stringify({ value: { money: '옛 메모' }, base: 'new|none|[]', savedAt: 1 }));
  const sent = {
    id: 9, rptType: 'day', onDate: '2026-08-21', state: 'sent', memos: [{ key: 'money', memo: '올린 메모' }, { key: 'ops', memo: '' }],
    filled: 1, sentAt: null, reviewedAt: null, rejectReason: null, sentByName: '김민수', reviewedByName: null,
    canReview: false, canWriteMemo: false, writeBlockedReason: '이미 올린 보고는 고칠 수 없습니다. 반려된 뒤에 다시 적어 주세요', canWithdraw: false,
  } as unknown as ExecReport;
  const view = mount(exec([sent]));
  await waitFor(() => expect((view.getByRole('textbox', { name: '회계 메모' }) as HTMLTextAreaElement).value).toBe('올린 메모'));
  expect(readDraft(KEY)).toBeNull();
});
