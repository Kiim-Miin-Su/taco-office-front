/** @file-guide
 * 목적: TBO-55 BOC-11c 연체 수강 정지·해제의 Front 계약 경계를 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage로 A25 후보 검토·URL·임계일 초안과 생성 계약 부재 시 업무 write 0을 검증한다.
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
const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 42, studentId: 7, studentName: '양찬욱', grade: 'G10', studentTag: 'G10', yearMonth: '2026-10',
  title: '2026년 10월 수업료 청구', amount: 250000, paidAmount: 0, state: 'sent', stateLabel: '보냄',
  invType: 'tuition', invTypeLabel: '수업료 청구', issuedOn: '2026-10-01', dueOn: '2026-09-21', paidAt: null,
  remaining: 250000, overdueDays: 16, lines: [], installments: [], nextDueOn: '2026-09-21', nextInstallmentSeq: null,
  sentAt: '2026-10-01T01:00:00.000Z', canDeliver: false, canVoid: false, voidBlockedReason: null,
  voidReason: null, notice: null, ...over,
});
const accounting: Accounting = {
  families: [],
  summary: { sent: 350000, collected: 0, unpaid: 350000, overdue: 350000, net: 350000, todo: 2, canSeeAmounts: true },
  invoices: [
    invoice(),
    invoice({ id: 43, amount: 100000, remaining: 100000, overdueDays: 15, title: '2026년 9월 교재비' }),
    invoice({ id: 44, studentId: 8, studentName: '이하린', studentTag: 'G9', overdueDays: 13, remaining: 180000 }),
  ],
  payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [], expenseCategories: [],
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

it('A25 수강 정지는 최종 PPTX의 14일 후보와 효력을 보여 주되 독촉·정지·해제 쓰기를 잠근다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('button', { name: '정리 · 기준' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '정리 · 기준' }));
  const tabs = view.getByRole('group', { name: '회계 탭' });
  fireEvent.click(within(tabs).getByRole('button', { name: '수강 정지' }));

  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=suspensions', { scroll: false });
  expect(view.getByRole('heading', { name: '연체 수강 정지 · 해제' })).toBeTruthy();
  const table = view.getByRole('table');
  const row = within(table).getByText('양찬욱').closest('tr')!;
  expect(row.textContent).toContain('16일 연체');
  expect(row.textContent).toContain('₩350,000');
  expect(row.textContent).toContain('2건');
  expect(row.textContent).toContain('보류 대상');
  expect(within(table).queryByText('이하린')).toBeNull();
  for (const name of ['납입 독촉 계약 준비 중', '수강 정지 계약 준비 중']) {
    expect((within(row).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  }
  expect(view.getByText(/기존 일정은 유지하고 새 일정 저장만 차단/)).toBeTruthy();
  expect(view.getByText(/입금 확인 뒤 해제하면 즉시 원복/)).toBeTruthy();
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});

it('?tab=suspensions는 임계일을 화면 초안으로만 바꾸고 정책 저장과 서버 성공을 만들지 않는다', async () => {
  nav.search = 'tab=suspensions';
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: '연체 수강 정지 · 해제' })).toBeTruthy());

  expect((view.getByLabelText('보류 기준 일') as HTMLInputElement).value).toBe('14');
  expect(within(view.getByRole('table')).getByText('양찬욱')).toBeTruthy();
  fireEvent.change(view.getByLabelText('보류 기준 일'), { target: { value: '17' } });
  expect(view.queryByText('양찬욱')).toBeNull();
  expect(view.getByText('현재 조회값에서 기준을 넘은 학생이 없습니다')).toBeTruthy();
  expect((view.getByRole('button', { name: '기준 저장 계약 준비 중' }) as HTMLButtonElement).disabled).toBe(true);

  for (const field of ['후보 판정 · threshold version', '영향 수업 · 신규 배정 차단', '정지 · 해제 version', 'actual actor · 이력 · 알림']) {
    expect(view.getByText(field)).toBeTruthy();
  }
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});
