/** @file-guide
 * 목적: 회계 입금 표의 미확인/권한 가림/0원과 생성 nullable 계약 소비 회귀.
 * 책임/재사용: 실제 AccountingPage/useAccounting/Table/won을 사용하고 셸의 다른 조회만 제외한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import AccountingPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
const me: Me = { id: 1, name: '대표', role: 'ceo', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true };
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); api.defaults.adapter = originalAdapter; useSession.getState().signOut(); });

it.each([true, false])('금액 공개=%s: 미확인·0·금액과 날짜/수단을 구별하고 추가 조회하지 않는다', async (canSeeAmounts) => {
  useSession.getState().signIn('fixture', me);
  const data: Accounting = {
    summary: { invoiceCount: 0, billed: null, collected: null, outstanding: null, overdueCount: 0, canSeeAmounts },
    invoices: [], payouts: [],
    payments: [
      { id: 1, studentName: '미확인 학생', paidOn: null, amount: null, method: null },
      { id: 2, studentName: '영원 학생', paidOn: '2026-09-11', amount: canSeeAmounts ? 0 : null, method: 'cash' },
      { id: 3, studentName: '입금 학생', paidOn: '2026-09-11', amount: canSeeAmounts ? 123400 : null, method: 'bank' },
      { id: 4, studentName: '다른 수단', paidOn: null, amount: null, method: 'card' },
      { id: 5, studentName: '기존 이체', paidOn: '2026-09-11', amount: null, method: 'transfer' },
    ],
  };
  const get = vi.fn(async config => ({ config, status: 200, statusText: 'OK', headers: {}, data }));
  api.defaults.adapter = get;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '들어온 돈 5' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '들어온 돈 5' }));
  const cells = (name: string) => within(view.getByText(name).closest('tr')!).getAllByRole('cell').map(c => c.textContent);
  expect(cells('미확인 학생').slice(0, 4)).toEqual(['미확인', '미확인 학생', canSeeAmounts ? '미확인' : '가려짐', '미확인']);
  expect(cells('영원 학생').slice(0, 4)).toEqual(['2026-09-11', '영원 학생', canSeeAmounts ? '0원' : '가려짐', '현금']);
  expect(cells('입금 학생')[2]).toBe(canSeeAmounts ? '123,400원' : '가려짐');
  expect(cells('입금 학생')[3]).toBe('계좌');
  expect(cells('다른 수단')[3]).toBe('card');
  expect(cells('기존 이체')[3]).toBe('계좌');
  expect(view.container.textContent).not.toContain('null');
  expect(get).toHaveBeenCalledTimes(1);
});
