/** @file-guide
 * 목적: 회계 입금 표의 미확인/권한 가림/0원과 생성 nullable 계약 소비 회귀 · §55 기간 칩 · §56 카드/상세 연결.
 * 책임/재사용: 실제 AccountingPage/useAccounting/Table/won을 사용하고 셸의 다른 조회만 제외한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Me, PayoutSheet, PayoutSheetRow } from '@/api/types';
import type { Cashflow } from '@/components/accounting/accounting-queries';
import { monthBounds, todayKst } from '@/lib/calendar';
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
    invoices: [], payouts: [], expenses: [], expenseTotals: [], payCategories: [], expenseCategories: [],
    payments: [
      { id: 1, studentName: '미확인 학생', paidOn: null, amount: null, method: null, category: 'etc', categoryLabel: '기타' },
      { id: 2, studentName: '영원 학생', paidOn: '2026-09-11', amount: canSeeAmounts ? 0 : null, method: 'cash', category: 'etc', categoryLabel: '기타' },
      { id: 3, studentName: '입금 학생', paidOn: '2026-09-11', amount: canSeeAmounts ? 123400 : null, method: 'bank', category: 'etc', categoryLabel: '기타' },
      { id: 4, studentName: '다른 수단', paidOn: null, amount: null, method: 'card', category: 'etc', categoryLabel: '기타' },
      { id: 5, studentName: '기존 이체', paidOn: '2026-09-11', amount: null, method: 'transfer', category: 'etc', categoryLabel: '기타' },
    ],
  };
  // §55 들어온 돈은 기간 질의(`/accounting/cashflow`)를 **그 탭에서 한 번** 더 부른다 — 입금 줄 표는 추가 조회가 없다
  const get = vi.fn(async (config: { url?: string }) => ({
    config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/accounting/cashflow' ? flowOf(canSeeAmounts) : data,
  }));
  api.defaults.adapter = get as never;
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
  await waitFor(() => expect(view.getByRole('group', { name: '기간 요약' })).toBeTruthy());
  const urls = get.mock.calls.map(([c]) => c.url);
  expect(urls.filter((u) => u === '/accounting')).toHaveLength(1);
  expect(urls.filter((u) => u === '/accounting/cashflow')).toHaveLength(1);
});

/** §55 기간 요약 표본 — 금액 권한을 따라 금액만 null 이다 */
function flowOf(canSeeAmounts: boolean, over: Partial<Cashflow> = {}): Cashflow {
  const m = (v: number) => (canSeeAmounts ? v : null);
  return {
    from: '2026-09-01', to: '2026-09-30', label: '2026년 9월', dayCount: 30, category: null, today: '2026-09-11',
    count: 0, billed: m(0), paid: m(0), expected: m(0), days: [], categories: [], open: [], canSeeAmounts, ...over,
  };
}

/**
 * §52·§56 회계 머리 **여섯 칸** — 원문의 낱말과 차례 그대로인가 (C43).
 *
 * 값은 손대지 않는다. 화면이 「보낸 청구서 − 받은 돈」을 다시 빼면 같은 이름의 숫자가
 * 두 곳에서 나오게 되므로, 서버가 준 `unpaid` 를 **그대로** 보여 주는지까지 본다 (D-R18).
 */
const HEAD_LABELS = ['보낸 청구서', '받은 돈', '못 받은 돈', '기한 지남', '남은 돈', '손봐야 할 것'];

function mount(summary: Accounting['summary']) {
  useSession.getState().signIn('fixture', me);
  const data: Accounting = { summary, invoices: [], payouts: [], expenses: [], expenseTotals: [], payments: [], payCategories: [], expenseCategories: [] };
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
 * C94-b 부터 이 탭은 **달의 시트**(`GET /accounting/payouts?month=`)다 — 그 탭을 열 때만 부르고, 줄의 `confirmed` 하나를 읽는다.
 */
const sheetRow = (confirmed: boolean): PayoutSheetRow => ({
  staffId: 6, staffName: '이다현', yearMonth: '2026-08',
  writtenCount: 48, writtenMinutes: 2880, unwrittenCount: 0, unwrittenMinutes: 0, canceledCount: 0, naCount: 0, noRateCount: 0,
  gross: 2016000, lateCut: 25000, incomeTax: 59730, localTax: 5973, net: 1925297, unwrittenAmount: 0,
  saved: confirmed, savedDiffers: false, savedNet: confirmed ? 1925297 : null,
  confirmed, confirmedAt: confirmed ? '2026-09-03T02:00:00.000Z' : null, confirmedBy: confirmed ? '김민선' : null, canConfirm: !confirmed,
});
const sheetOf = (confirmed: boolean): PayoutSheet => ({
  month: '2026-08', today: '2026-09-18', monthEnded: true, rows: [sheetRow(confirmed)], unwrittenCount: 0, netTotal: 1925297, canSeeAmounts: true,
  writtenMinutes: 2880, unwrittenMinutes: 0, grossTotal: 2016000, lateCutTotal: 25000, taxTotal: 65703,
});
/** §56 상세 — 그 사람의 줄은 시트의 그 줄이다 */
const detailOf = (confirmed: boolean) => ({
  staffId: 6, staffName: '이다현', month: '2026-08', row: sheetRow(confirmed), rates: [{ fromDate: '2026-01-01', rate: 42000 }], lessons: [],
});
const EMPTY: Accounting = {
  summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
  invoices: [], payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [], expenseCategories: [],
};

it.each([
  { confirmed: true, label: '확정 · 김민선' },
  { confirmed: false, label: '대기' },
])('정산 상태 칩은 확정 여부 하나만 읽는다 — 시트는 그 탭을 열 때만 부른다 — %o', async ({ confirmed, label }) => {
  useSession.getState().signIn('fixture', me);
  const sheetGet = vi.fn();
  api.defaults.adapter = (async (config: { url?: string }) => {
    if (config.url === '/accounting/payouts') { sheetGet(); return { config, status: 200, statusText: 'OK', headers: {}, data: sheetOf(confirmed) }; }
    if (config.url === '/accounting/payouts/6') return { config, status: 200, statusText: 'OK', headers: {}, data: detailOf(confirmed) };
    return { config, status: 200, statusText: 'OK', headers: {}, data: EMPTY };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '강사료 정산' })).toBeTruthy());
  expect(sheetGet).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: '강사료 정산' }));
  await waitFor(() => expect(view.getByRole('button', { name: '이다현 자세히 보기' })).toBeTruthy());
  expect(sheetGet).toHaveBeenCalledTimes(1);
  // 왼쪽 카드에 상태 칩이 선다
  expect(within(view.getByRole('button', { name: '이다현 자세히 보기' })).getByText(label)).toBeTruthy();
  // 「지급 확정」 단추는 서버의 canConfirm 그대로 — 상세 머리에 서고, 확정된 사람에게는 없다
  fireEvent.click(view.getByRole('button', { name: '이다현 자세히 보기' }));
  await waitFor(() => expect(view.getByText('2026-01-01부터 42,000원/시간')).toBeTruthy());
  const head = within(view.getByRole('heading', { name: '이다현 · 8월 정산' }).closest('header')!);
  expect(head.getByText(label)).toBeTruthy();
  expect(head.queryByRole('button', { name: '지급 확정' }) === null).toBe(confirmed);
});

/** 단가표 (C94-d) — 그 탭을 열 때만 부르고, 「지금」은 서버의 current 다 */
it('단가표는 그 탭을 열 때만 부른다 — 회계를 열어 바로 다른 탭으로 가는 사람이 값을 치르지 않는다 (C94-d)', async () => {
  useSession.getState().signIn('fixture', me);
  const ratesGet = vi.fn();
  api.defaults.adapter = (async (config: { url?: string }) => {
    if (config.url === '/accounting/rates') {
      ratesGet();
      return { config, status: 200, statusText: 'OK', headers: {}, data: { rates: [{ id: 1, kindKey: 'class', kindName: '수업', kindExtra: false, subKey: null, subName: null, heads: 1, unitPrice: 60000, fromDate: '2026-01-01', current: true }], studentRates: [] } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: EMPTY };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '단가표' })).toBeTruthy());
  expect(ratesGet).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: '단가표' }));
  await waitFor(() => expect(view.getByText('60,000원')).toBeTruthy());
  expect(ratesGet).toHaveBeenCalledTimes(1);
  expect(view.getByText('지금')).toBeTruthy();
  expect(view.getByRole('button', { name: '+ 단가 등록' })).toBeTruthy();
  expect(view.getByRole('button', { name: '+ 예외 등록' })).toBeTruthy();
});

/**
 * 탭 밖에 있던 정산 설명이 **어느 탭을 열어도 따라붙고 있었다** (C66).
 *
 * 청구서 표 밑에 「정산은 …」이 서 있으면, 읽는 사람은 그 말이 **이 표에 대한 설명**이라고 읽는다.
 */
it('정산 설명은 정산 탭에서만 선다 — 청구서 탭에 따라붙지 않는다', async () => {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string }) => ({
    config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/accounting/payouts' ? sheetOf(true) : EMPTY,
  })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '강사료 정산' })).toBeTruthy());
  expect(view.queryByText(/정산은/)).toBeNull();
  fireEvent.click(view.getByRole('button', { name: '강사료 정산' }));
  expect(view.getByText(/정산은/)).toBeTruthy();
});

/**
 * §55 의 **분류 여섯** — 대표 결정 2026-09-13 (N-37 ③ 「Entity, DTO 의 정합성과 단일 진실원 해결」).
 * 저장된 칸이 아니라 서버가 읽어 만든 값이고, **건수가 0이어도 칩이 선다**(분류는 어휘다).
 * w5 — 칩은 이제 **고른 기간(기본 이번 달)의 수**이고 누르면 그 분류로 다시 묻는다(55-01 · 55-05).
 * 전 기간 수를 세던 옛 칩줄은 사라졌다 — 같은 이름(「수업료 2」)이 두 숫자가 되지 않게.
 */
it('분류 칩 여섯은 이번 달 기간으로 묻고 건수가 0이어도 서며, 누르면 그 분류로 다시 묻는다 (55-01 · 55-05)', async () => {
  useSession.getState().signIn('fixture', me);
  const data: Accounting = {
    summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
    invoices: [], payments: [], expenses: [], expenseTotals: [], payouts: [], expenseCategories: [],
    // 전 기간 칩의 원천 — 이 탭은 더 이상 이것으로 칩을 그리지 않는다
    payCategories: [{ key: 'tuition', label: '수업료', count: 9, amount: 900 }],
  };
  const categories: Cashflow['categories'] = [
    { key: 'tuition', label: '수업료', count: 2, billed: 100, paid: 100, rate: 100 },
    { key: 'gpa', label: 'GPA 관리비', count: 0, billed: 0, paid: 0, rate: 0 },
    { key: 'consulting', label: '컨설팅비', count: 0, billed: 0, paid: 0, rate: 0 },
    { key: 'diag_intake', label: '진단고사 · 상담', count: 0, billed: 0, paid: 0, rate: 0 },
    { key: 'exam_fee', label: '시험 응시료', count: 0, billed: 0, paid: 0, rate: 0 },
    { key: 'etc', label: '기타', count: 1, billed: 30, paid: 0, rate: 0 },
  ];
  const flows: Array<Record<string, string> | undefined> = [];
  api.defaults.adapter = (async (config: { url?: string; params?: Record<string, string> }) => {
    if (config.url === '/accounting/cashflow') {
      flows.push(config.params);
      return { config, status: 200, statusText: 'OK', headers: {}, data: flowOf(true, { categories, count: 3, category: config.params?.category ?? null }) };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '들어온 돈 0' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '들어온 돈 0' }));
  await waitFor(() => expect(view.getByRole('button', { name: '수업료 2' })).toBeTruthy());
  // 기본은 이번 달 — 1일부터 끝날까지(앞뒤 달을 섞지 않는다)
  expect(flows[0]).toEqual(monthBounds(todayKst()));
  // 0 인 분류도 사라지지 않는다 — 「이 학원은 GPA 관리를 안 한다」고 말하게 된다
  expect(view.getByRole('button', { name: 'GPA 관리비 0' })).toBeTruthy();
  expect(view.getByRole('button', { name: '시험 응시료 0' })).toBeTruthy();
  expect(view.getByRole('button', { name: '전체 3' }).getAttribute('aria-pressed')).toBe('true');
  // 전 기간 칩(「수업료 9」)은 없다
  expect(view.queryByText('수업료 9')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: '수업료 2' }));
  await waitFor(() => expect(flows.at(-1)).toEqual({ ...monthBounds(todayKst()), category: 'tuition' }));
  await waitFor(() => expect(view.getByRole('button', { name: '수업료 2' }).getAttribute('aria-pressed')).toBe('true'));
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
    invoices: [], payments: [], expenses: [], expenseTotals: [], payouts: [], payCategories: [], expenseCategories: [],
  };
  const calls: string[] = [];
  api.defaults.adapter = (async (config: { url?: string; params?: Record<string, string> }) => {
    calls.push(`${config.url}${config.params?.month ? `?month=${config.params.month}` : ''}`);
    const data = config.url?.includes('/tuition')
      ? { month: '2026-08', today: '2026-09-18', daysPast: 31, daysLeft: 0, canSeeAmounts: true,
          doneCount: 0, totalCount: 0, canceledCount: 0, deductedCount: 0, doneAmount: 0, carryAmount: 0, carriedInCount: 0, carriedInAmount: 0, items: [], close: null, canClose: false, canReopen: false }
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
