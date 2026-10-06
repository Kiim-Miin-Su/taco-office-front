/** @file-guide
 * 목적: TBO-55 BOC-11e 최신 기준 단가·Kinder·학생 예외 Front 계약을 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage를 통해 시간당 입력, 기존 회당 이력 분리, 학생 예외 효력기간과 새 계약 전 write 0을 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Me, Meta, RateBook } from '@/api/types';
import { useSession } from '@/store/useSession';
import AccountingPage from './page';

const nav = vi.hoisted(() => ({ search: 'tab=rates', replace: vi.fn() }));
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
const accounting: Accounting = {
  families: [],
  summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
  invoices: [], payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [], expenseCategories: [],
};
const rates: RateBook = {
  rates: [{
    id: 11, kindKey: 'class', kindName: '수업', kindExtra: false,
    subKey: 'writing', subName: 'Writing', heads: 2, unitPrice: 33000,
    fromDate: '2026-01-01', current: true,
  }],
  studentRates: [{
    id: 5, studentId: 7, studentName: '정하람', kindKey: 'class', kindName: '수업',
    unitPrice: 54000, fromDate: '2026-04-06', reason: '형제 할인', byName: '김민수',
    createdAt: '2026-04-01T10:00:00+09:00', current: true,
  }],
};
const meta = {
  kinds: [{ key: 'class', name: '수업', extra: false }],
  subs: [{ key: 'writing', name: 'Writing', kindKey: 'class' }],
  students: [
    { id: 7, name: '정하람', grade: '10', tag: '10', label: '정하람 · 10' },
    { id: 8, name: '윤도현', grade: '11', tag: '11', label: '윤도현 · 11' },
  ],
  rooms: [], zaccs: [], staff: [], invTypes: [], cancelReasons: [], cancelTreats: [],
} as unknown as Meta;

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const seen: Array<{ method?: string; url?: string }> = [];

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  api.defaults.adapter = originalAdapter;
  useSession.getState().signOut();
  nav.search = 'tab=rates';
  nav.replace.mockReset();
  seen.splice(0);
});

function mount() {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { method?: string; url?: string }) => {
    seen.push(config);
    const data = config.url === '/accounting/rates' ? rates : config.url === '/meta' ? meta : accounting;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('A26 최신 기준 단가는 회당 legacy를 시간당으로 오인하지 않고 일반·Kinder·그룹 계약을 분리한다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: '기준 단가 — 시간당 · Kinder · 학생 예외' })).toBeTruthy());

  expect(view.getByText(/아래 기존 단가는/)).toBeTruthy();
  expect(view.getByText('Kinder 학생은 1명만')).toBeTruthy();
  expect(view.getByText('강사 급여 · 기본 시급 +10,000원/시간')).toBeTruthy();
  expect(view.getByText('그룹 가산 · 0원')).toBeTruthy();
  expect(view.getByText('기존 회당 단가 이력')).toBeTruthy();
  expect(view.getAllByText('₩33,000')).toHaveLength(2);

  const mode = view.getByRole('group', { name: '기준 단가 입력 종류' });
  fireEvent.click(within(mode).getByRole('button', { name: '그룹' }));
  expect(view.getByLabelText('정원')).toBeTruthy();
  expect(view.getByText('총액/시간 · 서버 재계산 후 표시')).toBeTruthy();
  expect((view.getByRole('button', { name: '시간당 단가 저장 준비 중' }) as HTMLButtonElement).disabled).toBe(true);
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});

it('학생 예외는 개별 시간당 단가·기준 대비 %·효력기간·사유와 versioned 수정·삭제 경계를 갖는다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: '기준 단가 — 시간당 · Kinder · 학생 예외' })).toBeTruthy());
  fireEvent.click(within(view.getByRole('group', { name: '기준 단가 입력 종류' })).getByRole('button', { name: '학생 예외' }));
  await waitFor(() => expect(view.getByRole('option', { name: '윤도현 · 11' })).toBeTruthy());

  fireEvent.change(view.getByLabelText('대상 학생'), { target: { value: '8' } });
  fireEvent.change(view.getByLabelText('개별 시간당 단가'), { target: { value: '52000' } });
  fireEvent.change(view.getByLabelText('언제부터'), { target: { value: '2026-11-01' } });
  fireEvent.change(view.getByLabelText('언제까지'), { target: { value: '2027-01-31' } });
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '형제 할인' } });

  expect(view.getByText('기준 대비 % · 서버 재계산 후 표시')).toBeTruthy();
  expect((view.getByRole('button', { name: '학생 예외 저장 준비 중' }) as HTMLButtonElement).disabled).toBe(true);
  expect(view.getAllByRole('button', { name: '수정 준비 중' }).length).toBeGreaterThan(0);
  expect(view.getAllByRole('button', { name: '삭제 준비 중' }).length).toBeGreaterThan(0);
  expect(view.getByText(/이미 확정된 청구와 급여는 바뀌지 않습니다/)).toBeTruthy();
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});
