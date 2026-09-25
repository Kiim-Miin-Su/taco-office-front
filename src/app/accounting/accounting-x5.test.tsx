/** @file-guide
 * 목적: 회계 잔여 물결(x5) 화면 회귀 — 「+ 청구서」(C-03) · 머리 윗줄/채움(C-05) · 종류 칩(53-02) · 「자세히 ›」 줄 표시(52-03) · 강사료 이번 달(56-04).
 * 책임/재사용: 실제 AccountingPage/useAccounting/Table/StatCard를 사용하고 셸의 다른 조회만 제외한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Invoice, Me, PayoutSheet } from '@/api/types';
import { todayKst } from '@/lib/calendar';
import { useSession } from '@/store/useSession';
import AccountingPage from './page';

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
const me: Me = { id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true };

const originalAdapter = api.defaults.adapter;
const originalScroll = Element.prototype.scrollIntoView;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter;
  useSession.getState().signOut(); nav.search = ''; Element.prototype.scrollIntoView = originalScroll;
});

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 42, studentId: 7, studentName: '양찬욱', grade: 'G10', yearMonth: '2026-08',
  title: '2026년 8월 수업료 청구', amount: 250000, paidAmount: 0, state: 'sent', stateLabel: '보냄',
  invType: 'tuition', invTypeLabel: '수업료 청구',
  issuedOn: '2026-09-12', dueOn: null, paidAt: null, remaining: 250000, overdueDays: 0,
  sentAt: null, canDeliver: false, canVoid: false, voidBlockedReason: null, voidReason: null, lines: [], ...over,
});

const accounting = (todo = 0, invoices: Invoice[] = []): Accounting => ({
  summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo, canSeeAmounts: true },
  invoices, payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [], expenseCategories: [],
});

function mount(handler: (config: { url?: string; params?: Record<string, string> }) => unknown) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; params?: Record<string, string> }) => ({
    config, status: 200, statusText: 'OK', headers: {}, data: handler(config),
  })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('청구서 표에 「종류」 칩이 서고 낱말은 서버의 invTypeLabel 이다 (53-02)', async () => {
  const view = mount(() => accounting(0, [inv({ id: 42 }), inv({ id: 43, invType: 'consulting', invTypeLabel: '컨설팅비 청구', studentName: '김하늘' })]));
  await waitFor(() => expect(view.getByText('김하늘')).toBeTruthy());
  const typeOf = (name: string) => view.getByText(name).closest('tr')!.querySelectorAll('td')[2].textContent;
  expect(typeOf('양찬욱')).toBe('수업료 청구');
  expect(typeOf('김하늘')).toBe('컨설팅비 청구');
  expect(view.getAllByRole('columnheader').map((h) => h.textContent)).toContain('종류');
});

it('?tab=inv&invId= 로 오면 그 청구서 줄만 옅게 칠하고 화면 가운데로 부른다 (52-03)', async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  nav.search = 'tab=inv&invId=43';
  const view = mount(() => accounting(0, [inv({ id: 42 }), inv({ id: 43, studentName: '김하늘' })]));
  await waitFor(() => expect(view.getByText('김하늘')).toBeTruthy());
  expect(view.getByText('김하늘').closest('tr')!.className).toContain('inv-focus');
  expect(view.getByText('양찬욱').closest('tr')!.className).not.toContain('inv-focus');
  await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'center' }));
});

it('틀린 invId 는 버린다 — 어느 줄도 칠하지 않는다', async () => {
  nav.search = 'tab=inv&invId=abc';
  const view = mount(() => accounting(0, [inv({ id: 42 })]));
  await waitFor(() => expect(view.getByText('양찬욱')).toBeTruthy());
  expect(view.container.querySelector('.inv-focus')).toBeNull();
});

it('탭 줄 오른쪽 「+ 청구서」는 다른 탭에서도 청구서 탭으로 가며 발행 칸을 연다 (C-03)', async () => {
  const view = mount(() => accounting());
  await waitFor(() => expect(view.getByRole('button', { name: '들어온 돈 0' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '들어온 돈 0' }));
  expect(view.queryByText('새 청구서 발행')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: '+ 청구서' }));
  await waitFor(() => expect(view.getByText('새 청구서 발행')).toBeTruthy());
  // 발행 칸 안의 제 단추는 「닫기」로 바뀐다 — 두 단추가 같은 칸을 쥔다
  fireEvent.click(view.getByRole('button', { name: '닫기' }));
  expect(view.queryByText('새 청구서 발행')).toBeNull();
});

it('머리 칸은 윗변 색 줄을 긋고 「손봐야 할 것」은 건이 있을 때만 채운다 (C-05)', async () => {
  const card = (v: ReturnType<typeof mount>, label: string) => v.getByText(label).parentElement!.className;
  const view = mount(() => accounting(6));
  await waitFor(() => expect(view.getByText('6건')).toBeTruthy());
  expect(card(view, '보낸 청구서')).toContain('border-t-blue');
  expect(card(view, '받은 돈')).toContain('border-t-green');
  expect(card(view, '못 받은 돈')).toContain('border-t-orange');
  expect(card(view, '기한 지남')).toContain('border-t-red');
  expect(card(view, '남은 돈')).toContain('border-t-red');
  expect(card(view, '손봐야 할 것')).toContain('bg-red/10');

  cleanup();
  const empty = mount(() => accounting(0));
  await waitFor(() => expect(empty.getByText('0건')).toBeTruthy());
  expect(card(empty, '손봐야 할 것')).not.toContain('bg-red/10');
});

it('강사료 정산은 이번 달 시트부터 연다 (56-04)', async () => {
  const months: Array<string | undefined> = [];
  const month = todayKst().slice(0, 7);
  const sheet: PayoutSheet = {
    month, today: todayKst(), monthEnded: false, rows: [], unwrittenCount: 0, netTotal: 0, canSeeAmounts: true,
    writtenMinutes: 0, unwrittenMinutes: 0, grossTotal: 0, lateCutTotal: 0, taxTotal: 0,
  };
  const view = mount((config) => {
    if (config.url === '/accounting/payouts') { months.push(config.params?.month); return sheet; }
    return accounting();
  });
  await waitFor(() => expect(view.getByRole('button', { name: '강사료 정산' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '강사료 정산' }));
  await waitFor(() => expect(months).toHaveLength(1));
  expect(months[0]).toBe(month);
});
