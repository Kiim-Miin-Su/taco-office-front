/** @file-guide
 * 목적: TBO-55 BOC-11a 증빙·학생별 누적·지급 원장 Front 계약 경계와 URL 이동을 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage와 AccountingTabs를 사용하고 생성 계약이 없는 화면이 금액/완료 상태를 추정하지 않는지 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import AccountingPage from './page';

const nav = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null,
  canAdminPage: true, canCrudAll: true, canSeeProfit: true, canCrudAttendance: true,
  canMoney: true, canWage: true, canApprove: true, canHide: true, canGpaPack: true,
};
const empty: Accounting = {
  families: [],
  summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
  invoices: [], payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [], expenseCategories: [],
};
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const seen: Array<{ method?: string; url?: string }> = [];

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  api.defaults.adapter = originalAdapter;
  useSession.getState().signOut();
  nav.search = '';
  nav.replace.mockReset();
  seen.splice(0);
});

function mount() {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { method?: string; url?: string }) => {
    seen.push(config);
    return { config, status: 200, statusText: 'OK', headers: {}, data: empty };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it.each([
  ['영수증 · 세금계산서', 'receipts', '증빙 발행 원장', '입금 기록 보기'],
  ['학생별 누적', 'cumulative', '학생별 누적 원장', '못 받은 돈 보기'],
  ['지급 원장', 'ledger', '실제 지급 원장', '강사료 정산 보기'],
])('%s 화면은 URL로 이동하고 생성 계약이 없는 읽기·쓰기를 잠근다', async (label, tab, heading, backLabel) => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('button', { name: '들어온 돈' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: tab === 'ledger' ? '나간 돈' : '들어온 돈' }));
  const button = view.getByRole('button', { name: label }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.click(button);

  expect(nav.replace).toHaveBeenLastCalledWith(`/accounting?tab=${tab}`, { scroll: false });
  expect(view.getByRole('heading', { name: heading })).toBeTruthy();
  expect(view.getByText('저장 기능 준비 중')).toBeTruthy();
  expect(view.getByRole('button', { name: backLabel })).toBeTruthy();
  expect(view.queryByRole('button', { name: /발행 완료|일괄 지급|취소|삭제/ })).toBeNull();
});

it.each([
  ['receipts', '증빙 발행 원장'],
  ['cumulative', '학생별 누적 원장'],
  ['ledger', '실제 지급 원장'],
])('?tab=%s 직접 진입도 같은 화면을 열고 업무 쓰기를 만들지 않는다', async (tab, heading) => {
  nav.search = `tab=${tab}`;
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: heading })).toBeTruthy());
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});
