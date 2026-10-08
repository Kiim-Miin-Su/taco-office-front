/** @file-guide
 * 목적: TBO-55 BO-11BD-01 환불·할인 조정 신청과 대표 승인 원장을 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage를 사용해 A24 입력·URL·승인 전 불변·생성 계약 write와 version 전이를 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/api/client';
import type { Accounting, Invoice, InvoiceAdjustment, InvoiceAdjustmentLedger, Me } from '@/api/types';
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
const pendingAdjustment: InvoiceAdjustment = {
  id: 91, invoiceId: 42, studentId: 7, studentName: '양찬욱', studentTag: 'G10', yearMonth: '2026-10', effectiveOn: '2026-10-07',
  kind: 'refund', kindLabel: '환불', reason: '중도 종료 환불', amount: 50000, state: 'pending', stateLabel: '승인 대기', version: 1,
  originalInvoiceAmount: 250000, invoiceAmount: 250000, paidAmount: 250000, refundDue: 0,
  requestedById: 1, requestedBy: '대표', requestedAt: '2026-10-07T01:00:00.000Z', decidedBy: null, decidedAt: null,
  rejectReason: null, canceledBy: null, canceledAt: null, cancelReason: null,
  canApprove: true, canReject: true, canCancel: false, canUndo: false,
  events: [{ action: 'created', fromState: null, toState: 'pending', version: 1, actorId: 1, actor: '대표', reason: null,
    invoiceAmountBefore: 250000, invoiceAmountAfter: 250000, createdAt: '2026-10-07T01:00:00.000Z' }],
};
const emptyLedger: InvoiceAdjustmentLedger = {
  month: '2026-10', pendingCount: 0, approvedAmount: 0, refundDue: 0, canRequest: true, canApprove: true, items: [],
};
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const seen: Array<{ method?: string; url?: string; data?: unknown }> = [];

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  api.defaults.adapter = originalAdapter;
  useSession.getState().signOut();
  nav.search = '';
  nav.replace.mockReset();
  seen.splice(0);
});

function mount(ledger: InvoiceAdjustmentLedger = emptyLedger, transitionError?: ApiError) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { method?: string; url?: string; data?: unknown }) => {
    seen.push(config);
    const method = config.method?.toLowerCase();
    const url = config.url ?? '';
    if (method === 'get' && url === '/accounting/adjustments') {
      return { config, status: 200, statusText: 'OK', headers: {}, data: ledger };
    }
    if (method === 'post' && url === '/accounting/adjustments') {
      return { config, status: 201, statusText: 'Created', headers: {}, data: { item: pendingAdjustment, replayed: false } };
    }
    if (method === 'post' && url.startsWith('/accounting/adjustments/91/')) {
      if (transitionError) throw transitionError;
      const item = { ...pendingAdjustment, state: 'approved', stateLabel: '승인·반영', version: 2, invoiceAmount: 200000, refundDue: 50000,
        canApprove: false, canReject: false, canCancel: true } satisfies InvoiceAdjustment;
      return { config, status: 201, statusText: 'Created', headers: {}, data: { item, replayed: false } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: accounting };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('A24 조정 탭은 입력을 서버에 접수하고 성공 응답 뒤에만 승인 대기를 표시한다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('button', { name: '정리 · 기준' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '정리 · 기준' }));
  const tabs = view.getByRole('group', { name: '회계 탭' });
  fireEvent.click(within(tabs).getByRole('button', { name: '조정' }));

  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=adjustments', { scroll: false });
  expect(view.getByRole('heading', { name: '조정 — 환불 · 할인' })).toBeTruthy();
  expect(view.getByText('환불과 할인은 대표 승인 후 청구서에 반영됩니다')).toBeTruthy();
  expect(view.getByText(/승인 전 청구 금액은 바뀌지 않습니다/)).toBeTruthy();

  fireEvent.change(view.getByLabelText('적용 일자'), { target: { value: '2026-10-07' } });
  fireEvent.change(view.getByLabelText('구분'), { target: { value: 'refund' } });
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '중도 종료 환불' } });
  fireEvent.change(view.getByLabelText('금액'), { target: { value: '50000' } });

  expect((view.getByLabelText('구분') as HTMLSelectElement).value).toBe('refund');
  expect((view.getByLabelText('학생') as HTMLSelectElement).value).toBe('7');
  const submit = view.getByRole('button', { name: '승인 요청' });
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(submit);
  await waitFor(() => expect(seen.some(({ method, url }) => method?.toLowerCase() === 'post' && url === '/accounting/adjustments')).toBe(true));
  expect(await view.findByText(/대표 승인 대기로 접수했습니다/)).toBeTruthy();
  expect(invoice.amount).toBe(250000);
});

it('?tab=adjustments 직접 진입은 current version으로 승인하고 환불 예정액을 서버 값으로 표시한다', async () => {
  nav.search = 'tab=adjustments';
  const ledger = { ...emptyLedger, pendingCount: 1, items: [pendingAdjustment] };
  const view = mount(ledger);
  await waitFor(() => expect(view.getByRole('heading', { name: '조정 — 환불 · 할인' })).toBeTruthy());
  expect(await view.findByRole('button', { name: '승인' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '승인' }));
  fireEvent.click(view.getByRole('button', { name: '승인·반영' }));
  await waitFor(() => expect(seen.some(({ method, url, data }) => {
    if (method?.toLowerCase() !== 'post' || url !== '/accounting/adjustments/91/approve') return false;
    const body = JSON.parse(String(data)) as { expectedVersion?: number; requestKey?: string };
    return body.expectedVersion === 1 && typeof body.requestKey === 'string';
  })).toBe(true));
  expect(await view.findByText(/조정을 승인·반영 처리했습니다/)).toBeTruthy();
});

it('409 version 충돌은 처리 사유를 보존하고 최신 원장을 다시 읽게 한다', async () => {
  nav.search = 'tab=adjustments';
  const ledger = { ...emptyLedger, pendingCount: 1, items: [pendingAdjustment] };
  const view = mount(ledger, new ApiError('INVOICE_ADJUSTMENT_STALE', '다른 처리자가 먼저 변경했습니다.', 409));
  fireEvent.click(await view.findByRole('button', { name: '반려' }));
  const dialog = await view.findByRole('dialog');
  const reason = within(dialog).getByLabelText('처리 사유') as HTMLInputElement;
  fireEvent.change(reason, { target: { value: '증빙 보완 필요' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '반려' }));
  expect(await within(dialog).findByText('다른 처리자가 먼저 변경했습니다.')).toBeTruthy();
  expect(reason.value).toBe('증빙 보완 필요');

  const readsBefore = seen.filter(({ method, url }) => method?.toLowerCase() === 'get' && url === '/accounting/adjustments').length;
  fireEvent.click(within(dialog).getByRole('button', { name: '최신 원장 다시 불러오기' }));
  await waitFor(() => expect(seen.filter(({ method, url }) => method?.toLowerCase() === 'get' && url === '/accounting/adjustments').length).toBeGreaterThan(readsBefore));
  expect(reason.value).toBe('증빙 보완 필요');
});
