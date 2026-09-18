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
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); api.defaults.adapter = originalAdapter; useSession.getState().signOut(); nav.search = ''; });

it.each([true, false])('금액 공개=%s: 미확인·0·금액과 날짜/수단을 구별하고 추가 조회하지 않는다', async (canSeeAmounts) => {
  useSession.getState().signIn('fixture', me);
  const data: Accounting = {
    summary: { sent: null, collected: null, unpaid: null, overdue: null, net: null, todo: 0, canSeeAmounts },
    invoices: [], payouts: [], expenses: [], expenseTotals: [], payCategories: [],
    payments: [
      { id: 1, studentName: '미확인 학생', paidOn: null, amount: null, method: null, category: 'etc', categoryLabel: '기타' },
      { id: 2, studentName: '영원 학생', paidOn: '2026-09-11', amount: canSeeAmounts ? 0 : null, method: 'cash', category: 'etc', categoryLabel: '기타' },
      { id: 3, studentName: '입금 학생', paidOn: '2026-09-11', amount: canSeeAmounts ? 123400 : null, method: 'bank', category: 'etc', categoryLabel: '기타' },
      { id: 4, studentName: '다른 수단', paidOn: null, amount: null, method: 'card', category: 'etc', categoryLabel: '기타' },
      { id: 5, studentName: '기존 이체', paidOn: '2026-09-11', amount: null, method: 'transfer', category: 'etc', categoryLabel: '기타' },
    ],
  };
  const get = vi.fn(async config => ({ config, status: 200, statusText: 'OK', headers: {}, data }));
  api.defaults.adapter = get;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '들어온 돈 5' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '들어온 돈 5' }));
  const cells = (name: string) => within(view.getByText(name).closest('tr')!).getAllByRole('cell').map(c => c.textContent);
  // 칸 차례 — 입금일 · 학생 · **분류**(C71) · 금액 · 수단
  expect(cells('미확인 학생').slice(0, 5)).toEqual(['미확인', '미확인 학생', '기타', canSeeAmounts ? '미확인' : '가려짐', '미확인']);
  expect(cells('영원 학생').slice(0, 5)).toEqual(['2026-09-11', '영원 학생', '기타', canSeeAmounts ? '0원' : '가려짐', '현금']);
  expect(cells('입금 학생')[3]).toBe(canSeeAmounts ? '123,400원' : '가려짐');
  expect(cells('입금 학생')[4]).toBe('계좌');
  expect(cells('다른 수단')[4]).toBe('card');
  expect(cells('기존 이체')[4]).toBe('계좌');
  expect(view.container.textContent).not.toContain('null');
  expect(get).toHaveBeenCalledTimes(1);
});

/**
 * §52·§56 회계 머리 **여섯 칸** — 원문의 낱말과 차례 그대로인가 (C43).
 *
 * 값은 손대지 않는다. 화면이 「보낸 청구서 − 받은 돈」을 다시 빼면 같은 이름의 숫자가
 * 두 곳에서 나오게 되므로, 서버가 준 `unpaid` 를 **그대로** 보여 주는지까지 본다 (D-R18).
 */
const HEAD_LABELS = ['보낸 청구서', '받은 돈', '못 받은 돈', '기한 지남', '남은 돈', '손봐야 할 것'];

function mount(summary: Accounting['summary']) {
  useSession.getState().signIn('fixture', me);
  const data: Accounting = { summary, invoices: [], payouts: [], expenses: [], expenseTotals: [], payments: [], payCategories: [] };
  api.defaults.adapter = (async (config: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('머리 여섯 칸은 원문의 낱말과 차례 그대로이고, 서버가 준 값을 다시 계산하지 않는다', async () => {
  // §52 원본 표본 — 7,214,000 − 4,377,400 = 2,836,600 이 원문 안에서 닫힌다
  const view = mount({
    sent: 7214000, collected: 4377400, unpaid: 2836600,
    overdue: 1170000, net: -3052172, todo: 6, canSeeAmounts: true,
  });
  await waitFor(() => expect(view.getByText('6건')).toBeTruthy());

  const heads = HEAD_LABELS.map(l => view.getByText(l).parentElement!);
  expect(heads.map(h => h.textContent)).toEqual([
    '보낸 청구서7,214,000원',
    '받은 돈4,377,400원',
    '못 받은 돈2,836,600원',
    '기한 지남1,170,000원',
    '남은 돈−3,052,172원',
    '손봐야 할 것6건납부 기한이 지난 청구서',
  ]);
  // 차례도 원문 그대로다 — 못 받은 돈은 받은 돈 **뒤**에 온다
  const order = [...view.container.querySelectorAll('div')].map(d => d.textContent);
  expect(order.filter(t => HEAD_LABELS.includes(t ?? ''))).toEqual(HEAD_LABELS);
});

it('서버가 「못 받은 돈」을 다르게 주면 화면은 그 값을 그대로 쓴다 — 빼서 고치지 않는다', async () => {
  const view = mount({ sent: 1000, collected: 400, unpaid: 999, overdue: 0, net: 0, todo: 0, canSeeAmounts: true });
  await waitFor(() => expect(view.getByText('999원')).toBeTruthy());
  expect(view.getByText('못 받은 돈').parentElement!.textContent).toBe('못 받은 돈999원');
});

it('금액 권한이 없으면 다섯 칸은 가려지고 「손봐야 할 것」은 건수라 그대로 보인다 (D-R39)', async () => {
  const view = mount({ sent: null, collected: null, unpaid: null, overdue: null, net: null, todo: 4, canSeeAmounts: false });
  await waitFor(() => expect(view.getByText('4건')).toBeTruthy());
  expect(HEAD_LABELS.slice(0, 5).map(l => view.getByText(l).parentElement!.textContent))
    .toEqual(['보낸 청구서가려짐', '받은 돈가려짐', '못 받은 돈가려짐', '기한 지남가려짐', '남은 돈가려짐']);
  expect(view.getByText('손봐야 할 것').parentElement!.textContent).toContain('4건');
});

/**
 * §57 강사료 정산 — 상태 칩은 **서버 결론 하나**만 읽는다 (N-27 · 대표 결정 2026-09-12).
 *
 * 전에는 `payout.state === 'confirmed'` 일 때만 「확정」이라 했다. 그 낱말에 정본이 없어
 * 시드가 넣은 확정 정산(`confirmed_by` 가 채워진 행)이 「대기」로 보이고 있었다.
 */
const payout = (confirmed: boolean): Accounting['payouts'][number] => ({
  id: 1, staffId: 6, staffName: '이다현', yearMonth: '2026-08', hours: '48.00',
  gross: 2016000, lateRepCut: 25000, incomeTax: 59730, localTax: 5973, net: 1925297, confirmed,
});

it.each([
  { confirmed: true, label: '확정' },
  { confirmed: false, label: '대기' },
])('정산 상태 칩은 확정 여부 하나만 읽는다 — %o', async ({ confirmed, label }) => {
  useSession.getState().signIn('fixture', me);
  const data: Accounting = {
    summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
    invoices: [], payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [payout(confirmed)],
  };
  api.defaults.adapter = (async (config: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '강사료 정산 1' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '강사료 정산 1' }));
  const row = within(view.getByText('이다현').closest('tr')!);
  expect(row.getAllByRole('cell').at(-1)!.textContent).toBe(label);
});

/**
 * 탭 밖에 있던 정산 설명이 **어느 탭을 열어도 따라붙고 있었다** (C66).
 *
 * 청구서 표 밑에 「정산은 …」이 서 있으면, 읽는 사람은 그 말이 **이 표에 대한 설명**이라고 읽는다.
 */
it('정산 설명은 정산 탭에서만 선다 — 청구서 탭에 따라붙지 않는다', async () => {
  useSession.getState().signIn('fixture', me);
  const data: Accounting = {
    summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
    invoices: [], payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [payout(true)],
  };
  api.defaults.adapter = (async (config: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '강사료 정산 1' })).toBeTruthy());
  expect(view.queryByText(/정산은/)).toBeNull();
  fireEvent.click(view.getByRole('button', { name: '강사료 정산 1' }));
  expect(view.getByText(/정산은/)).toBeTruthy();
});

/**
 * §55 의 **분류 여섯** — 대표 결정 2026-09-13 (N-37 ③ 「Entity, DTO 의 정합성과 단일 진실원 해결」).
 * 저장된 칸이 아니라 서버가 읽어 만든 값이고, **건수가 0이어도 칩이 선다**(분류는 어휘다).
 */
it('분류 칩 여섯은 건수가 0이어도 서고 낱말은 서버가 준 것이다', async () => {
  useSession.getState().signIn('fixture', me);
  const data: Accounting = {
    summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
    invoices: [], payments: [], expenses: [], expenseTotals: [], payouts: [],
    payCategories: [
      { key: 'tuition', label: '수업료', count: 2, amount: 100 },
      { key: 'gpa', label: 'GPA 관리비', count: 0, amount: 0 },
      { key: 'consulting', label: '컨설팅비', count: 0, amount: 0 },
      { key: 'diag_intake', label: '진단고사 · 상담', count: 0, amount: 0 },
      { key: 'exam_fee', label: '시험 응시료', count: 0, amount: 0 },
      { key: 'etc', label: '기타', count: 1, amount: 30 },
    ],
  };
  api.defaults.adapter = (async (config: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '들어온 돈 0' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '들어온 돈 0' }));
  expect(view.getByText('수업료 2')).toBeTruthy();
  // 0 인 분류도 사라지지 않는다 — 「이 학원은 GPA 관리를 안 한다」고 말하게 된다
  expect(view.getByText('GPA 관리비 0')).toBeTruthy();
  expect(view.getByText('시험 응시료 0')).toBeTruthy();
  expect(view.getByText('기타 1')).toBeTruthy();
});

/**
 * 알림의 「이월 발생 → 회계」 링크는 `/accounting?tab=tuition&month=YYYY-MM` 이다 (C92 · M-125).
 * 링크가 탭에 닿지 않으면 죽은 링크다 — 탭과 달을 복원하고, 형식이 틀린 달은 버린다.
 */
it('?tab=tuition&month= 링크는 수업료 탭을 그 달로 연다 — 틀린 달은 이번 달로 돌아간다 (C92)', async () => {
  useSession.getState().signIn('fixture', me);
  nav.search = 'tab=tuition&month=2026-08';
  const accounting: Accounting = {
    summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
    invoices: [], payments: [], expenses: [], expenseTotals: [], payouts: [], payCategories: [],
  };
  const calls: string[] = [];
  api.defaults.adapter = (async (config: { url?: string; params?: Record<string, string> }) => {
    calls.push(`${config.url}${config.params?.month ? `?month=${config.params.month}` : ''}`);
    const data = config.url?.includes('/tuition')
      ? { month: '2026-08', today: '2026-09-18', daysPast: 31, daysLeft: 0, canSeeAmounts: true,
          doneCount: 0, totalCount: 0, canceledCount: 0, deductedCount: 0, doneAmount: 0, carryAmount: 0, carriedInCount: 0, carriedInAmount: 0, items: [] }
      : accounting;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(calls.some((c) => c.includes('/accounting/tuition?month=2026-08'))).toBe(true));
  expect(view.getByText('8월 수업 진행')).toBeTruthy();

  cleanup();
  nav.search = 'tab=tuition&month=2026-13';
  calls.length = 0;
  const client2 = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client2);
  render(<QueryClientProvider client={client2}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(calls.some((c) => c.endsWith('/accounting/tuition'))).toBe(true));
  expect(calls.some((c) => c.includes('month=2026-13'))).toBe(false);
});
