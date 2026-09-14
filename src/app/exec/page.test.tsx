/** @file-guide
 * 목적: 대표 보고 4뷰와 §73 결재함 — 이동만(N-12)·살펴볼 것 합계·x/6 기재 회귀.
 * 책임/재사용: 실제 ExecPage/useExec 를 쓰고 셸의 다른 조회만 어댑터로 막는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Exec, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import ExecPage from './page';

const nav = vi.hoisted(() => ({ push: vi.fn(), search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};

const data: Exec = {
  from: '2026-08-21', to: '2026-08-21',
  stats: [{ key: 'lessons', label: '진행한 수업', value: 20, unit: '회', money: false }],
  reports: [],
  areas: [
    { key: 'money', label: '회계', review: '납부 기한이 지난 청구서 수', count: 2, go: '/accounting' },
    { key: 'mkt', label: '마케팅', review: '없음 (정보성)', count: 0, go: '/ops' },
    { key: 'ops', label: '운영', review: '결재 대기 + 기한 지난 할 일', count: 1, go: '/ops' },
    { key: 'consulting', label: '컨설팅', review: '수납 전이라 진행이 잠긴 계약', count: 1, go: '/consulting' },
    { key: 'complaint', label: '컴플레인', review: '아직 안 끝난 건', count: 2, go: '/ops' },
    { key: 'lesson', label: '수업', review: '교재·안내·줌·리포트가 덜 된 수업', count: 17, go: '/board' },
  ],
  reviewCount: 23,
  filled: 0,
  inbox: [
    { id: 1, rptType: 'day', onDate: '2026-08-21', label: '26년 8월 21일 금요일', state: 'draft', apState: 'waiting', filled: 0, reviewCount: 23, rejectReason: null, go: 'day' },
    { id: 2, rptType: 'week', onDate: '2026-08-17', label: '08-17 ~ 08-23', state: 'rej', apState: 'back', filled: 2, reviewCount: 49, rejectReason: '숫자만으로는 모를 것', go: 'week' },
  ],
  canSeeAmounts: true,
  computedAt: '2026-08-21T00:00:00.000Z',
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); nav.push.mockClear(); nav.search = '';
});

function setup() {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = vi.fn(async (config) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return { ...render(<QueryClientProvider client={client}><ExecPage /></QueryClientProvider>), client };
}

it('머리의 살펴볼 것은 6영역 배지의 합이고, 정보성 영역은 ✓ 로 보인다 (§69 — 23 = 2+0+1+1+2+17)', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('살펴볼 것 23'));
  expect(view.container.textContent).toContain('담당 0/6 기재');
  const sum = data.areas.reduce((a, x) => a + x.count, 0);
  expect(sum).toBe(data.reviewCount);
  // 마케팅은 0 이라 숫자 대신 ✓
  expect(view.getByRole('button', { name: /마케팅/ }).textContent).toContain('✓');
});

it('영역을 누르면 그 화면으로 간다 — 대표 보고 안에서 처리하지 않는다 (D-R27)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: /회계/ })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: /회계/ }));
  expect(nav.push).toHaveBeenCalledWith('/accounting');
});

it('결재함은 되돌아온 것을 먼저 보이고 사유를 그대로 적는다 (§75 순서)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: /결재함/ })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: /결재함/ }));
  expect(view.container.textContent).toContain('되돌아온 것 · 1건');
  expect(view.container.textContent).toContain('숫자만으로는 모를 것');
  expect(view.container.textContent).toContain('2/6 적음');
  // N-12 — 결재함에는 승인·반려가 없다
  expect(view.queryByRole('button', { name: '승인' })).toBeNull();
  expect(view.queryByRole('button', { name: '반려' })).toBeNull();
});

it('결재함 줄을 누르면 그 기간의 보고로 이동만 한다 (N-12)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: /결재함/ })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: /결재함/ }));
  fireEvent.click(view.getByRole('button', { name: /08-17 ~ 08-23/ }));
  await waitFor(() => expect(view.container.textContent).toContain('08-17 ~ 08-23'));
  // 주간 뷰로 옮겨 왔다 — 기간 내비가 보인다
  expect(view.getByRole('button', { name: '오늘' })).toBeTruthy();
  expect(nav.push).not.toHaveBeenCalled();
});

it('§75 report deep link의 view/date를 초기화하고 브라우저 URL 변경에도 동기화한다', async () => {
  nav.search = 'view=week&date=2026-08-17&rpt=2';
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('08-17 ~ 08-23'));
  expect(view.getByRole('button', { name: /주간/ }).getAttribute('aria-pressed')).toBe('true');

  nav.search = 'view=month&date=2026-09-01&rpt=3';
  view.rerender(<QueryClientProvider client={view.client}><ExecPage /></QueryClientProvider>);
  await waitFor(() => expect(view.container.textContent).toContain('2026년 9월'));
  expect(view.getByRole('button', { name: /월간/ }).getAttribute('aria-pressed')).toBe('true');
});
