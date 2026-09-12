/** @file-guide
 * 목적: §21 목적지 「줌 계정 관리」 — 서버가 센 값을 그대로 그리고, 비밀은 화면에 오지 않는다 (C48).
 * 책임/재사용: 실제 ZoomAccountsPage/useZoom 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me, ZoomBoard } from '@/api/types';
import { useSession } from '@/store/useSession';
import ZoomAccountsPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '관리자', role: 'admin', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const board: ZoomBoard = {
  onDate: '2026-08-21', fromHour: 8, toHour: 21,
  accounts: [
    { id: 1, label: 'Boarding', loginEmail: 'a@tn.kr', joinUrl: 'https://zoom.us/j/1', meetingId: '111 2222', active: true, usedCount: 3, hasSecret: true },
    { id: 2, label: 'Study', loginEmail: 'b@tn.kr', joinUrl: 'https://zoom.us/j/2', meetingId: null, active: false, usedCount: 0, hasSecret: false },
  ],
  rows: [
    { zaccId: 1, label: 'Boarding', slots: Array.from({ length: 14 }, (_, i) => ({ hour: 8 + i, busy: i === 2 ? 1 : 0 })) },
  ],
  freeNow: 5, fullHours: 1,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

function setup(data: ZoomBoard = board) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><ZoomAccountsPage /></QueryClientProvider>);
}

it('머리 숫자는 서버가 센 값을 그대로 쓴다 — 화면이 다시 세지 않는다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('a@tn.kr')).toBeTruthy());
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('5개');   // 지금 가능
  expect(text).toContain('1칸');   // 만석 시간대
  expect(text).toContain('2개');   // 계정 수 (꺼진 것 포함)
  expect(text).toContain('2026-08-21');
});

it('비밀은 **저장돼 있는가**만 말한다 — 값은 어디에도 없다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('a@tn.kr')).toBeTruthy());
  expect(view.getByText('저장됨')).toBeTruthy();
  expect(view.getByText('없음')).toBeTruthy();
  expect(JSON.stringify(board)).not.toContain('loginSecret');
});

it('꺼진 계정도 목록에 남는다 — 이미 붙은 회차가 있기 때문이다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('b@tn.kr')).toBeTruthy());
  expect(view.getByText('꺼짐')).toBeTruthy();
  expect(view.getByRole('button', { name: '켜기' })).toBeTruthy();
});

it('격자는 서버가 준 시간 범위를 그대로 쓴다 — 8시부터 21시까지 14칸', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('a@tn.kr')).toBeTruthy());
  const grid = view.container.querySelectorAll('table')[0];
  const heads = [...grid.querySelectorAll('th')].map((h) => h.textContent);
  expect(heads).toEqual(['계정', ...Array.from({ length: 14 }, (_, i) => String(8 + i).padStart(2, '0'))]);
});
