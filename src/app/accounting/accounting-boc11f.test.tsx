/** @file-guide
 * 목적: TBO-55 BOC-11f 최종 관리자 수정사항 p94·101·115와 Figma A22의 교재 판매·수단별 수수료 Front 경계를 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage와 기존 /meta·/books reader를 사용하고 신규 판매·수수료 계약 전 write 0과 업무 이동을 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Books, Me, Meta } from '@/api/types';
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
const seen: Array<{ method?: string; url?: string }> = [];

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
  api.defaults.adapter = (async (config: { method?: string; url?: string }) => {
    seen.push(config);
    const data = config.url === '/meta' ? meta : config.url === '/books' ? books : accounting;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('A22 교재 판매는 학생·기존 카탈로그를 연결하되 판매·재고·청구/PAY 계약 전 저장 성공을 만들지 않는다', async () => {
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

  expect(view.getByText('판매 합계 · 서버 계산 후 표시')).toBeTruthy();
  expect((view.getByLabelText('결제 수단') as HTMLSelectElement).disabled).toBe(true);
  expect((view.getByRole('button', { name: '교재 판매 저장 준비 중' }) as HTMLButtonElement).disabled).toBe(true);
  expect(view.getByText('교재 판매 원장을 대신하지 않습니다.')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '초기화' }));
  expect((view.getByLabelText('대상 학생') as HTMLSelectElement).value).toBe('');
  expect((view.getByLabelText('판매 교재') as HTMLSelectElement).value).toBe('');
  expect((view.getByLabelText('수량') as HTMLInputElement).value).toBe('1');
  expect((view.getByLabelText('개당 판매가') as HTMLInputElement).value).toBe('');
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});

it('수단별 수수료는 서버 집계·정책 snapshot 전 값을 추정하지 않고 교재·입금 화면으로 이동한다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: '결제 수단별 정산' })).toBeTruthy());
  const summary = view.getByRole('region', { name: '결제 수단별 집계 계약' });
  for (const label of ['건수', '금액 · 비중', '지급수수료', '순수납']) expect(within(summary).getByText(label)).toBeTruthy();
  expect(within(summary).getAllByText('—')).toHaveLength(4);
  expect(view.getByText(/수수료율과 반올림 기준을 화면에서 정하지 않습니다/)).toBeTruthy();

  fireEvent.click(view.getByRole('button', { name: '교재 목록 관리' }));
  expect(nav.push).toHaveBeenLastCalledWith('/books');
  fireEvent.click(view.getByRole('button', { name: '입금 기록 보기' }));
  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=record', { scroll: false });
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});
