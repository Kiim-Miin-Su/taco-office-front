/** @file-guide
 * 목적: AppShell-autosave.test.tsx — 관리자 머리줄 「자동 저장됨 · HH:MM」(원문 g1 S3 · N-69 · W11 R2) 자리와 값의 회귀.
 * 책임/재사용: 셸 조립 대역은 AppShell.test 와 같은 모양으로 두고 이 한 자리만 본다. 저장 규칙은 lib/autosave 시험이 본다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, render, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Me } from '@/api/types';
import { clearAllDrafts, draftKey, writeDraft } from '@/lib/autosave';
import { useSession } from '@/store/useSession';
import { AppShell } from './AppShell';

const mocks = vi.hoisted(() => ({ drawer: vi.fn(), unwritten: vi.fn(), scheduleWrite: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/reports', useRouter: () => ({ back: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/api/client', () => ({ api: { post: vi.fn() }, setAccessToken: vi.fn() }));
// 셸이 부르는 나머지 조회 훅은 진짜를 쓰되 꺼진 채(창을 열 때만 읽는다) — 이 시험은 머리줄 한 자리만 본다
vi.mock('@/api/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/queries')>()),
  useDrawer: mocks.drawer,
  useUnwritten: mocks.unwritten,
  useScheduleWrite: mocks.scheduleWrite,
  useTeacherShell: () => ({ data: undefined }),
  useTeacherNotiRead: () => ({ mutate: vi.fn(), isPending: false }),
  useMeta: () => ({ data: undefined }),
}));
vi.mock('@/components/drawer/AppDrawer', () => ({ AppDrawer: () => null }));

const me: Me = {
  id: 1, name: '김민선', role: 'ceo', roleLabel: '대표', title: '대표', canAdminPage: true, canCrudAll: true,
  canMoney: true, canWage: true, canApprove: true, canSeeProfit: true, canHide: true,
  canCrudAttendance: true, canGpaPack: true,
};

const shell = () => render(<QueryClientProvider client={new QueryClient()}><AppShell><p>본문</p></AppShell></QueryClientProvider>);

beforeEach(() => {
  window.localStorage.clear();
  clearAllDrafts();
  useSession.setState({ me, ready: true });
  mocks.drawer.mockReturnValue({ data: { approvalFlow: { canView: true, tiles: [], back: [], waiting: [], mine: [], total: 4, backCount: 0 } } });
  mocks.unwritten.mockReturnValue({ data: { total: 0 } });
  mocks.scheduleWrite.mockReturnValue({ mutate: vi.fn(), isPending: false });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
});
afterEach(() => { cleanup(); useSession.setState({ me: null, ready: false }); Reflect.deleteProperty(document, 'fullscreenElement'); });

it('「보는 법」과 「승인 대기」 사이에 「자동 저장됨 · —」이 서고, 이 브라우저에 쓰던 글을 남기면 그 시각(KST)으로 바뀐다', () => {
  const view = shell();
  const header = view.getByRole('banner');
  const status = within(header).getByTestId('autosave-status');
  expect(status.textContent).toBe('자동 저장됨 · —');
  expect(status.getAttribute('title')).toBe('자동 저장됨 · —');
  // 원문 차례 — 보는 법 → 자동 저장됨 → 승인 대기
  const guide = within(header).getByRole('button', { name: '보는 법' });
  const approval = within(header).getByRole('button', { name: '승인 대기 4' });
  expect(guide.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(status.compareDocumentPosition(approval) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // 단추가 아니다 — 누를 것이 없다
  expect(within(status).queryByRole('button')).toBeNull();

  act(() => { writeDraft(draftKey(1, 'exec-memo', 'day:2026-09-25'), { mkt: '메모' }, 'new|none|[]', Date.parse('2026-09-25T09:41:00+09:00')); });
  expect(status.textContent).toBe('자동 저장됨 · 09:41');
  act(() => { clearAllDrafts(); });
  expect(status.textContent).toBe('자동 저장됨 · —');
});

it('1536 미만에서는 세우지 않는다 — 업무 탭 10개가 먼저다 (W11 QA · 스케줄 1366 에서 「대표 보고」가 다시 가려졌다 · B-1r 규칙)', () => {
  const status = within(shell().getByRole('banner')).getByTestId('autosave-status');
  // jsdom 은 Tailwind 를 계산하지 않는다 — 폭 분기는 클래스로 본다(보이는지는 실브라우저 QA 가 nav 폭으로 잰다)
  const cls = status.className.split(/\s+/);
  expect(cls).toContain('hidden');
  expect(cls).toContain('min-[1536px]:block');
  expect(cls).not.toContain('block');
});

it('강사 표면(강사 덱 머리줄)에는 세우지 않는다 — 원문 강사 머리줄에 없는 자리다', () => {
  useSession.setState({ me: { ...me, canAdminPage: false, role: 'teacher' }, ready: true });
  expect(shell().queryByTestId('autosave-status')).toBeNull();
});
