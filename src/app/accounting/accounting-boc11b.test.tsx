/** @file-guide
 * 목적: TBO-55 BOC-11b 환불·할인 조정 입력과 대표 승인 전 Front 계약 경계를 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage를 사용해 A24 입력·URL·승인 전 불변과 생성 계약 부재 시 업무 write 0을 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Invoice, Me } from '@/api/types';
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
const invoice: Invoice = {
  id: 42, studentId: 7, studentName: '양찬욱', grade: 'G10', studentTag: 'G10', yearMonth: '2026-10',
  title: '2026년 10월 수업료 청구', amount: 250000, paidAmount: 0, state: 'sent', stateLabel: '보냄',
  invType: 'tuition', invTypeLabel: '수업료 청구', issuedOn: '2026-10-01', dueOn: '2026-10-10', paidAt: null,
  remaining: 250000, overdueDays: 0, lines: [], installments: [], nextDueOn: '2026-10-10', nextInstallmentSeq: null,
  sentAt: '2026-10-01T01:00:00.000Z', canDeliver: false, canVoid: false, voidBlockedReason: null,
  voidReason: null, notice: null,
};
const accounting: Accounting = {
  families: [],
  summary: { sent: 250000, collected: 0, unpaid: 250000, overdue: 0, net: 250000, todo: 0, canSeeAmounts: true },
  invoices: [invoice], payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [], expenseCategories: [],
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
    return { config, status: 200, statusText: 'OK', headers: {}, data: accounting };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('A24 조정 탭은 최종 PPTX의 입력을 받고 대표 승인 전 청구 금액을 바꾸지 않는다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('button', { name: '정리 · 기준' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '정리 · 기준' }));
  const tabs = view.getByRole('group', { name: '회계 탭' });
  fireEvent.click(within(tabs).getByRole('button', { name: '조정' }));

  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=adjustments', { scroll: false });
  expect(view.getByRole('heading', { name: '조정 — 환불 · 할인' })).toBeTruthy();
  expect(view.getByText('환불과 할인은 대표 승인 후 반영됩니다')).toBeTruthy();
  expect(view.getByText(/승인 전 청구 금액은 바뀌지 않습니다/)).toBeTruthy();

  fireEvent.change(view.getByLabelText('적용 일자'), { target: { value: '2026-10-07' } });
  fireEvent.change(view.getByLabelText('구분'), { target: { value: 'refund' } });
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '중도 종료 환불' } });
  fireEvent.change(view.getByLabelText('금액'), { target: { value: '50000' } });

  expect((view.getByLabelText('구분') as HTMLSelectElement).value).toBe('refund');
  expect((view.getByLabelText('학생') as HTMLSelectElement).value).toBe('7');
  expect((view.getByRole('button', { name: '승인 요청 계약 준비 중' }) as HTMLButtonElement).disabled).toBe(true);
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});

it('?tab=adjustments 직접 진입도 같은 초안과 계약 필드를 열고 업무 write를 만들지 않는다', async () => {
  nav.search = 'tab=adjustments';
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: '조정 — 환불 · 할인' })).toBeTruthy());
  for (const field of ['requestKey · expectedVersion', '대표 승인 · 반려 사유', '청구 반영 · 취소 · 되돌리기', 'actual actor · 감사 · 알림']) {
    expect(view.getByText(field)).toBeTruthy();
  }
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});
