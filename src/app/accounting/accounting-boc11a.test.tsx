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
import type { Accounting, Me, PaymentEvidenceLedger, PayoutDisbursementLedger, StudentCumulative } from '@/api/types';
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
const cumulative: StudentCumulative = {
  asOf: '2026-10-09',
  recentMonths: ['2026-08', '2026-09', '2026-10'],
  canSeeAmounts: true,
  items: [{
    studentId: 19,
    studentName: '누적학생',
    studentTag: 'G10',
    registeredOn: '2026-07-01',
    periodFrom: '2026-07-01',
    periodTo: '2026-10-09',
    months: [
      { month: '2026-08', billed: 200000, collected: 50000 },
      { month: '2026-09', billed: 30000, collected: 20000 },
      { month: '2026-10', billed: 0, collected: 0 },
    ],
    totalBilled: 330000,
    totalCollected: 170000,
    receivable: 180000,
    monthlyAverageBilled: 76667,
    categories: [
      { key: 'tuition', label: '수업료', billed: 300000, collected: 150000, receivable: 150000 },
      { key: 'exam_fee', label: '시험 응시료', billed: 30000, collected: 0, receivable: 30000 },
      { key: 'etc', label: '기타', billed: 0, collected: 20000, receivable: 0 },
    ],
  }],
};
const evidence: PaymentEvidenceLedger = {
  month: '2026-10', unissuedCount: 1, issuedCount: 1, monthCloseBlockedCount: 1,
  items: [
    { payId: 31, evidenceId: null, paidOn: '2026-10-08', studentId: 19, studentName: '미발행학생', content: '10월 수업료', amount: 120000, status: 'unissued', version: 0, issuedAt: null, issuedBy: null, canceledAt: null, canceledBy: null, cancelReason: null, printRef: null },
    { payId: 32, evidenceId: 7, paidOn: '2026-10-07', studentId: 20, studentName: '발행학생', content: '교재비', amount: 30000, status: 'issued', version: 1, issuedAt: '2026-10-08T00:00:00.000Z', issuedBy: '대표', canceledAt: null, canceledBy: null, cancelReason: null, printRef: '/accounting/payment-evidence/32' },
  ],
};
const payoutLedger: PayoutDisbursementLedger = {
  months: [{
    month: '2026-09', totalCount: 2, paidCount: 1, totalAmount: 693823, paidAmount: 381965, unpaidAmount: 311858,
    items: [
      {
        payoutId: 81, staffId: 11, staffName: '지급강사A', yearMonth: '2026-09', hours: '8.00', gross: 400000,
        deduction: 5000, incomeTax: 11850, localTax: 1185, withholding: 13035, net: 381965,
        status: 'paid', version: 1, paidOn: '2026-10-09', paidAt: '2026-10-09T01:00:00.000Z', paidBy: '대표',
        method: 'bank_transfer', canceledAt: null, canceledBy: null, cancelReason: null, canPay: false, canCancel: true,
        accountId: 901, accountVersion: 1, accountLast4: '1234', accountReady: true,
        events: [{ action: 'paid', fromState: null, toState: 'paid', version: 1, actor: '대표', paidOn: '2026-10-09', method: 'bank_transfer', reason: null,
          accountId: 901, accountVersion: 1, accountLast4: '1234', createdAt: '2026-10-09T01:00:00.000Z' }],
      },
      {
        payoutId: 82, staffId: 12, staffName: '지급강사B', yearMonth: '2026-09', hours: '6.50', gross: 325000,
        deduction: 2500, incomeTax: 9675, localTax: 967, withholding: 10642, net: 311858,
        status: 'unpaid', version: 0, paidOn: null, paidAt: null, paidBy: null, method: null,
        canceledAt: null, canceledBy: null, cancelReason: null, accountId: 902, accountVersion: 1,
        accountLast4: '5678', accountReady: true, canPay: true, canCancel: false, events: [],
      },
    ],
  }],
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
    return {
      config, status: 200, statusText: 'OK', headers: {},
      data: config.url === '/accounting/student-cumulative' ? cumulative
        : config.url === '/accounting/payment-evidence' ? evidence
          : config.url === '/accounting/payout-ledger' ? payoutLedger : empty,
    };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('지급 원장은 확정 snapshot과 실제 지급을 분리해 읽고 개별·취소·일괄 writer를 호출한다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('button', { name: '들어온 돈' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '나간 돈' }));
  fireEvent.click(view.getByRole('button', { name: '지급 원장' }));
  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=ledger', { scroll: false });
  expect(await view.findByRole('heading', { name: '실제 지급 원장' })).toBeTruthy();
  expect(await view.findByText('지급강사A')).toBeTruthy();
  expect(view.getByText('지급강사B')).toBeTruthy();
  expect(view.getByText('1/2명')).toBeTruthy();
  expect(view.getByText(/지급 계좌와 뒤 4자리는 계좌 보호 계약에서 연결/)).toBeTruthy();
  expect(view.queryByText('저장 기능 준비 중')).toBeNull();

  fireEvent.click(view.getByRole('button', { name: '지급' }));
  fireEvent.click(view.getByRole('button', { name: '계좌이체 기록' }));
  await waitFor(() => expect(seen.some(({ method, url }) => method === 'post' && url === '/accounting/payout-ledger/82/pay')).toBe(true));

  fireEvent.click(view.getByRole('button', { name: '취소' }));
  fireEvent.change(view.getByLabelText('취소 사유'), { target: { value: '이체 오류' } });
  fireEvent.click(view.getByRole('button', { name: '취소 확정' }));
  await waitFor(() => expect(seen.some(({ method, url }) => method === 'post' && url === '/accounting/payout-ledger/81/cancel')).toBe(true));

  fireEvent.click(view.getByRole('button', { name: '미지급 1명 일괄 지급' }));
  fireEvent.click(view.getByRole('button', { name: '미지급 전원 기록' }));
  await waitFor(() => expect(seen.some(({ method, url }) => method === 'post' && url === '/accounting/payout-ledger/pay-batch')).toBe(true));
});

it('증빙 원장은 PAY 상태·월 마감 경고를 읽고 개별 발행 writer를 실제 호출한다', async () => {
  const view = mount();
  fireEvent.click(await view.findByRole('button', { name: '들어온 돈' }));
  fireEvent.click(view.getByRole('button', { name: '영수증 · 세금계산서' }));

  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=receipts', { scroll: false });
  expect(await view.findByText('⚠ 1건 남았습니다 · 월 마감 전에 끊어야 합니다.')).toBeTruthy();
  expect(view.getByText('미발행학생')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '끊음으로' }));
  await waitFor(() => expect(seen.some(({ method, url }) => method === 'post' && url === '/accounting/payment-evidence/31/issue')).toBe(true));

  fireEvent.click(view.getByRole('button', { name: '끊었음 1' }));
  fireEvent.click(view.getByRole('button', { name: '열기' }));
  expect(view.getByRole('dialog', { name: '입금 증빙' })).toBeTruthy();
  expect(view.getByText('2026-10-08 09:00 · 대표')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '창 닫기' }));
  fireEvent.click(view.getByRole('button', { name: '취소' }));
  fireEvent.change(view.getByLabelText('취소 사유'), { target: { value: '중복 발행' } });
  fireEvent.click(view.getByRole('button', { name: '취소 확정' }));
  await waitFor(() => expect(seen.some(({ method, url }) => method === 'post' && url === '/accounting/payment-evidence/32/cancel')).toBe(true));

  fireEvent.click(view.getByRole('button', { name: '전부 끊음으로' }));
  await waitFor(() => expect(seen.some(({ method, url }) => method === 'post' && url === '/accounting/payment-evidence/issue-batch')).toBe(true));
});

it('학생별 누적은 생성 계약을 읽어 최근 3개월·누적·미수·분류를 표시한다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('button', { name: '들어온 돈' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '들어온 돈' }));
  fireEvent.click(view.getByRole('button', { name: '학생별 누적' }));

  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=cumulative', { scroll: false });
  await waitFor(() => expect(seen.some(({ url }) => url === '/accounting/student-cumulative')).toBe(true));
  expect(view.getByRole('heading', { name: '학생별 누적 원장' })).toBeTruthy();
  expect(view.getByText('누적학생')).toBeTruthy();
  expect(view.getByText('월평균 매출 ₩76,667')).toBeTruthy();
  expect(view.getByText('시험 응시료')).toBeTruthy();
  expect(view.queryByText('저장 기능 준비 중')).toBeNull();
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
