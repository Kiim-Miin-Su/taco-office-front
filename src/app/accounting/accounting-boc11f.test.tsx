/** @file-guide
 * 목적: TBO-55 BOC-11f 최종 관리자 수정사항 p94·101·115와 Figma A22의 교재 판매·수단별 수수료 Front 경계를 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage와 생성 계약·기존 /meta·/books reader를 사용하고 판매·취소 input 경로와 업무 이동을 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ComponentProps, ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Books, Me, Meta } from '@/api/types';
import { BookSalesFeeBoundary, type BookSalesLedgerView } from '@/components/accounting/BookSalesFeeBoundary';
import { useSession } from '@/store/useSession';
import AccountingPage from './page';

const nav = vi.hoisted(() => ({ search: 'tab=sales', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null,
  canAdminPage: true, canCrudAll: true, canSeeProfit: true, canCrudAttendance: true,
  canMoney: true, canWage: true, canApprove: true, canHide: true, canGpaPack: true,
};
const accounting: Accounting = {
  families: [],
  summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
  invoices: [], payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [], expenseCategories: [],
};
const meta = {
  students: [
    { id: 7, name: '정하람', grade: '10', tag: '10', label: '정하람 · 10' },
    { id: 8, name: '윤도현', grade: '11', tag: '11', label: '윤도현 · 11' },
  ],
  rooms: [], zaccs: [], staff: [], invTypes: [], cancelReasons: [], cancelTreats: [], kinds: [], subs: [],
} as unknown as Meta;
const books = {
  items: [
    {
      id: 31, code: 'WR-G10-01', title: 'Writing Basics', subKey: 'writing', subName: 'Writing',
      edition: 'v2026.03', latestEdition: 'v2026.03', hasNewer: false, versId: 51, latestVersId: 51,
      hasFile: true, issueCount: 3,
    },
  ],
  bySub: { Writing: 1 }, newerCount: 0, noFileCount: 0, levels: [], grades: [],
  levelCounts: [], gradeCounts: [], subjects: [],
  unclassified: { key: 'none', label: '미분류', count: 0 }, examTags: [], newerBooks: [], noTeBooks: [],
  versionUploadMaxBytes: 10_000_000,
} as Books;

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const seen: Array<{ method?: string; url?: string; data?: unknown }> = [];

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  api.defaults.adapter = originalAdapter;
  useSession.getState().signOut();
  nav.search = 'tab=sales';
  nav.replace.mockReset();
  nav.push.mockReset();
  seen.splice(0);
});

function mount() {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { method?: string; url?: string; data?: unknown }) => {
    seen.push(config);
    const data = config.url === '/meta' ? meta
      : config.url === '/books' ? books
        : config.url === '/accounting/book-sales/401/cancel' && config.method === 'post'
          ? { item: { ...ledger.items[0], status: 'canceled', version: 2, canCancel: false }, replayed: false }
        : config.url === '/accounting/book-sales' && config.method === 'post'
          ? { item: ledger.items[0], replayed: false }
          : config.url === '/accounting/book-sales' ? ledger : accounting;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('A22 교재 판매는 학생·기존 카탈로그·생성 DTO를 연결하고 서버 결과로 원장을 갱신한다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: '교재 판매 · 결제 수수료' })).toBeTruthy());
  await waitFor(() => expect(view.getByRole('option', { name: '정하람 · 10' })).toBeTruthy());
  expect(view.getByRole('option', { name: 'WR-G10-01 · Writing Basics · v2026.03' })).toBeTruthy();

  fireEvent.change(view.getByLabelText('대상 학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('판매 교재'), { target: { value: '31' } });
  fireEvent.change(view.getByLabelText('수량'), { target: { value: '0' } });
  fireEvent.blur(view.getByLabelText('수량'));
  expect(view.getByText('1권 이상의 정수를 적어 주세요')).toBeTruthy();
  fireEvent.change(view.getByLabelText('개당 판매가'), { target: { value: '-1' } });
  fireEvent.blur(view.getByLabelText('개당 판매가'));
  expect(view.getByText('0원 이상의 정수로 적어 주세요')).toBeTruthy();
  fireEvent.change(view.getByLabelText('수량'), { target: { value: '2' } });
  fireEvent.change(view.getByLabelText('개당 판매가'), { target: { value: '25000' } });

  expect(view.getByText('판매 합계')).toBeTruthy();
  expect((view.getByLabelText('결제 수단') as HTMLSelectElement).disabled).toBe(false);
  expect(view.getByRole('option', { name: '계좌이체' })).toBeTruthy();
  expect(view.getByRole('option', { name: '현금' })).toBeTruthy();
  fireEvent.change(view.getByLabelText('결제 수단'), { target: { value: 'transfer' } });
  fireEvent.click(view.getByRole('button', { name: '교재 판매 저장' }));
  await waitFor(() => expect(seen.some((entry) => entry.method === 'post' && entry.url === '/accounting/book-sales')).toBe(true));
  const write = seen.find((entry) => entry.method === 'post' && entry.url === '/accounting/book-sales');
  expect(JSON.parse(String(write?.data))).toMatchObject({
    studentId: 7, bookId: 31, quantity: 2, unitPrice: 25_000, paymentMethod: 'transfer',
  });
  expect(JSON.parse(String(write?.data)).requestKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(view.getByText('교재 판매 원장을 대신하지 않습니다.')).toBeTruthy();
  await waitFor(() => expect((view.getByLabelText('대상 학생') as HTMLSelectElement).value).toBe(''));
  expect((view.getByLabelText('대상 학생') as HTMLSelectElement).value).toBe('');
  expect((view.getByLabelText('판매 교재') as HTMLSelectElement).value).toBe('');
  expect((view.getByLabelText('수량') as HTMLInputElement).value).toBe('1');
  expect((view.getByLabelText('개당 판매가') as HTMLInputElement).value).toBe('');
  expect((view.getByLabelText('결제 수단') as HTMLSelectElement).value).toBe('');
});

it('수단별 수수료는 서버 집계·정책 snapshot을 표시하고 교재·입금 화면으로 이동한다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: '판매 목록 · 결제 수단별 정산' })).toBeTruthy());
  expect(view.getByRole('region', { name: '결제 수단별 집계' })).toBeTruthy();
  expect(view.getByText('판매 원장 연결됨')).toBeTruthy();
  expect(view.getByText(/수수료와 취소 가능 여부를 화면에서 다시 판정하지 않습니다/)).toBeTruthy();

  fireEvent.click(view.getByRole('button', { name: '교재 목록 관리' }));
  expect(nav.push).toHaveBeenLastCalledWith('/books');
  fireEvent.click(view.getByRole('button', { name: '입금 기록 보기' }));
  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=record', { scroll: false });
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});

it('판매 취소는 목록의 서버 version과 사유·새 요청 키를 전용 경로로 보낸다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('button', { name: '상세' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '상세' }));
  fireEvent.click(within(view.getByRole('dialog', { name: '교재 판매 상세' })).getByRole('button', { name: '판매 취소' }));
  const cancel = view.getByRole('dialog', { name: '교재 판매 취소' });
  fireEvent.change(within(cancel).getByLabelText('취소 사유'), { target: { value: '중복 판매 정정' } });
  fireEvent.click(within(cancel).getByRole('button', { name: '취소 확정' }));
  await waitFor(() => expect(seen.some((entry) => entry.url === '/accounting/book-sales/401/cancel'
    && entry.method === 'post')).toBe(true));
  const write = seen.find((entry) => entry.url === '/accounting/book-sales/401/cancel' && entry.method === 'post');
  expect(JSON.parse(String(write?.data))).toMatchObject({ expectedVersion: 1, reason: '중복 판매 정정' });
  expect(JSON.parse(String(write?.data)).requestKey).toMatch(/^[0-9a-f-]{36}$/);
  await waitFor(() => expect(view.queryByRole('dialog', { name: '교재 판매 취소' })).toBeNull());
});

const ledger: BookSalesLedgerView = {
  items: [
    {
      id: 401,
      studentId: 7,
      soldOn: '2026-10-09',
      studentName: '정하람',
      studentTag: '10',
      bookId: 31,
      bookCode: 'WR-G10-01',
      bookTitle: 'Writing Basics',
      bookEdition: 'v2026.03',
      bookLabel: 'WR-G10-01 · Writing Basics · v2026.03',
      quantity: 2,
      unitPrice: 25_000,
      totalAmount: 50_000,
      feeAmount: 0,
      netAmount: 50_000,
      paymentMethod: 'transfer',
      feePolicy: {
        id: 1, version: 1, paymentMethod: 'transfer', calculation: 'fixed', value: 0,
        effectiveFrom: '2026-10-09', effectiveTo: null,
      },
      payId: 501,
      correctionPayId: null,
      status: 'completed',
      version: 1,
      canCancel: true,
      memo: null,
      createdBy: '대표',
      createdAt: '2026-10-09T00:00:00.000Z',
      canceledBy: null,
      canceledAt: null,
      canceledReason: null,
    },
  ],
  canCreate: true,
  totalCount: 1,
  totalAmount: 50_000,
  totalFeeAmount: 0,
  totalNetAmount: 50_000,
  methods: [
    { paymentMethod: 'transfer', count: 1, amount: 50_000, ratio: 100, feeAmount: 0, netAmount: 50_000 },
    { paymentMethod: 'cash', count: 0, amount: 0, ratio: 0, feeAmount: 0, netAmount: 0 },
  ],
};

function mountBoundary(overrides: Partial<ComponentProps<typeof BookSalesFeeBoundary>> = {}) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { method?: string; url?: string; data?: unknown }) => {
    seen.push(config);
    return { config, status: 200, statusText: 'OK', headers: {}, data: meta };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const props: ComponentProps<typeof BookSalesFeeBoundary> = {
    books,
    booksLoading: false,
    ledger,
    onOpenPayments: vi.fn(),
    onOpenBooks: vi.fn(),
    onCreate: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
  return {
    view: render(
      <QueryClientProvider client={client}>
        <BookSalesFeeBoundary {...props} />
      </QueryClientProvider>,
    ),
    props,
  };
}

it('판매 준비 화면은 서버 projection으로 목록·상세·취소를 열고 입력·재시도 상태를 보존한다', async () => {
  const onCreate = vi.fn();
  const onCancel = vi.fn();
  const onRetry = vi.fn();
  const { view } = mountBoundary({ onCreate, onCancel, onRetry, writeError: '최신 version과 다릅니다.' });
  await waitFor(() => expect(view.getByRole('option', { name: '정하람 · 10' })).toBeTruthy());

  fireEvent.change(view.getByLabelText('대상 학생'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('판매 교재'), { target: { value: '31' } });
  fireEvent.change(view.getByLabelText('수량'), { target: { value: '2' } });
  fireEvent.change(view.getByLabelText('개당 판매가'), { target: { value: '25000' } });
  fireEvent.change(view.getByLabelText('결제 수단'), { target: { value: 'cash' } });
  fireEvent.click(view.getByRole('button', { name: '교재 판매 저장' }));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ studentId: 7, bookId: 31, quantity: 2, unitPrice: 25_000, paymentMethod: 'cash' }),
  );
  expect((view.getByLabelText('결제 수단') as HTMLSelectElement).value).toBe('cash');
  fireEvent.click(view.getByRole('button', { name: '최신 판매 재조회' }));
  expect(onRetry).toHaveBeenCalledTimes(1);

  const summary = view.getByRole('region', { name: '결제 수단별 집계' });
  for (const label of ['건수', '금액 · 비중', '지급수수료', '순수납']) {
    expect(within(summary).getByText(label)).toBeTruthy();
  }
  expect(view.getAllByText('WR-G10-01 · Writing Basics · v2026.03')).toHaveLength(2);
  fireEvent.click(view.getByRole('button', { name: '상세' }));
  const detail = view.getByRole('dialog', { name: '교재 판매 상세' });
  expect(within(detail).getAllByText('₩50,000')).toHaveLength(2);
  fireEvent.click(within(detail).getByRole('button', { name: '판매 취소' }));

  const cancelDialog = view.getByRole('dialog', { name: '교재 판매 취소' });
  const reason = within(cancelDialog).getByLabelText('취소 사유');
  expect(cancelDialog.contains(document.activeElement)).toBe(true);
  fireEvent.change(reason, { target: { value: '중복 판매 정정' } });
  fireEvent.click(within(cancelDialog).getByRole('button', { name: '취소 확정' }));
  expect(onCancel).toHaveBeenCalledWith(ledger.items[0], '중복 판매 정정');
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});

it('판매 목록은 loading·empty·error를 분리하고 오류 재시도를 제공한다', () => {
  const loading = mountBoundary({ ledger: undefined, ledgerLoading: true });
  expect(loading.view.getByRole('status', { name: '교재 판매 목록 불러오는 중' })).toBeTruthy();
  loading.view.unmount();

  const empty = mountBoundary({ ledger: { ...ledger, items: [], totalCount: 0, totalAmount: 0, totalNetAmount: 0 } });
  expect(empty.view.getByText('표시할 교재 판매가 없습니다')).toBeTruthy();
  empty.view.unmount();

  const onRetry = vi.fn();
  const error = mountBoundary({ ledger: undefined, ledgerError: '일시적인 조회 오류', onRetry });
  expect(error.view.getByRole('alert').textContent).toContain('일시적인 조회 오류');
  fireEvent.click(error.view.getByRole('button', { name: '다시 시도' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
