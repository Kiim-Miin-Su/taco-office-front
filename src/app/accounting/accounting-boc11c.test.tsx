/** @file-guide
 * 목적: TBO-55 BOC-11C 연체 aging·독촉·수강 정지·해제의 생성 계약 화면을 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage로 A25 요약·정책 version·서버 capability·409 입력 보존을 검증한다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-11C-DELINQUENCY-SUSPENSION-2026-10-09.md · docs/AGENT.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/api/client';
import type {
  Accounting, DelinquencySuspensionItem, DelinquencySuspensionLedger, Me,
} from '@/api/types';
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
const accounting: Accounting = {
  families: [],
  summary: { sent: 350000, collected: 0, unpaid: 350000, overdue: 350000, net: 350000, todo: 2, canSeeAmounts: true },
  invoices: [], payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [], expenseCategories: [],
};
const candidate: DelinquencySuspensionItem = {
  studentId: 7, studentName: '양찬욱', studentTag: 'G10', contact: '보호자 010-****-5678',
  overdueDays: 16, outstanding: 350000, overdueInvoiceCount: 2,
  affectedSeriesCount: 2, affectedSeries: ['수학 1:1', '영어 1:1'], state: 'candidate', stateLabel: '보류 대상',
  version: 0, suspendedAt: null, suspendedBy: null,
  canRemind: true, canSuspend: true, canRelease: false, releaseBlockedReason: null,
  events: [],
};
const suspended: DelinquencySuspensionItem = {
  ...candidate, studentId: 8, studentName: '이하린', studentTag: 'G9', outstanding: 180000,
  affectedSeriesCount: 1, affectedSeries: ['과학 1:1'], state: 'suspended', stateLabel: '수강 정지',
  version: 2, suspendedAt: '2026-10-08T01:00:00.000Z', suspendedBy: '대표',
  canSuspend: false, canRelease: false, releaseBlockedReason: '기한이 지난 미수 잔액을 모두 확인한 뒤 해제할 수 있습니다',
  events: [{ action: 'suspended', fromState: 'candidate', toState: 'suspended', version: 2, actorId: 1, actor: '대표',
    reason: '연체 확인', overdueDays: 16, outstanding: 180000, affectedSeriesCount: 1, createdAt: '2026-10-08T01:00:00.000Z' }],
};
const ledger: DelinquencySuspensionLedger = {
  asOf: '2026-10-09',
  policy: { thresholdDays: 14, version: 1, updatedAt: null, updatedBy: null, canChange: true },
  totalReceivable: 530000, totalOverdue: 530000,
  aging: [
    { key: '1_30', label: '1~30일', studentCount: 2, outstanding: 530000 },
    { key: '31_60', label: '31~60일', studentCount: 0, outstanding: 0 },
    { key: '61_90', label: '61~90일', studentCount: 0, outstanding: 0 },
    { key: '91_plus', label: '90일 초과', studentCount: 0, outstanding: 0 },
  ],
  items: [candidate, suspended],
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

function mount(transitionError?: ApiError, ledgerData: DelinquencySuspensionLedger = ledger) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { method?: string; url?: string; data?: unknown }) => {
    seen.push(config);
    const method = config.method?.toLowerCase();
    const url = config.url ?? '';
    if (method === 'get' && url === '/accounting/delinquency-suspensions') {
      return { config, status: 200, statusText: 'OK', headers: {}, data: ledgerData };
    }
    if (method === 'post' && url === '/accounting/delinquency-suspensions/policy') {
      return { config, status: 201, statusText: 'Created', headers: {}, data: { ...ledger.policy, thresholdDays: 21, version: 2 } };
    }
    if (method === 'post' && url === '/accounting/delinquency-suspensions/remind-batch') {
      return { config, status: 201, statusText: 'Created', headers: {}, data: {
        remindedCount: 2, replayedCount: 0,
        items: [{ item: candidate, replayed: false }, { item: suspended, replayed: false }],
      } };
    }
    if (method === 'post' && url.includes('/delinquency-suspensions/')) {
      if (transitionError && url.endsWith('/suspend')) throw transitionError;
      const item = url.includes('/8/') ? suspended : candidate;
      return { config, status: 201, statusText: 'Created', headers: {}, data: { item, replayed: false } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: accounting };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('A25 원장은 네 aging 구간·서버 연락처·영향 수업·capability를 표시하고 독촉 이력을 기록한다', async () => {
  nav.search = 'tab=suspensions';
  const view = mount();
  expect(await view.findByRole('heading', { name: '연체 수강 정지 · 해제' })).toBeTruthy();
  expect((await view.findByText('전체 미수')).parentElement?.textContent).toContain('₩530,000');
  expect(view.getByText(/1~30일 · 2명/).parentElement?.textContent).toContain('₩530,000');
  const table = view.getByRole('table', { name: '연체 수강 정지 원장' });
  const candidateRow = within(table).getByText('양찬욱').closest('tr')!;
  expect(candidateRow.textContent).toContain('16일');
  expect(candidateRow.textContent).toContain('₩350,000');
  expect(candidateRow.textContent).toContain('보호자 010-****-5678');
  expect(candidateRow.textContent).toContain('수학 1:1, 영어 1:1');
  fireEvent.click(within(candidateRow).getByRole('button', { name: '독촉 기록' }));
  await waitFor(() => expect(seen.some(({ method, url, data }) => {
    if (method?.toLowerCase() !== 'post' || url !== '/accounting/delinquency-suspensions/7/remind') return false;
    const body = JSON.parse(String(data)) as { expectedVersion?: number; requestKey?: string };
    return body.expectedVersion === 0 && typeof body.requestKey === 'string';
  })).toBe(true));
  expect(await view.findByText(/납입 독촉 이력을 기록했습니다/)).toBeTruthy();
  expect((within(table).getByRole('button', { name: '정지 해제' }) as HTMLButtonElement).disabled).toBe(true);
  const suspendedRow = within(table).getByText('이하린').closest('tr')!;
  fireEvent.click(within(suspendedRow).getByRole('button', { name: '이력 1' }));
  expect(await view.findByText('수강 정지 · v2')).toBeTruthy();
  fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: '닫기' }));
  const cards = view.getByLabelText('연체 수강 정지 카드');
  expect(within(cards).getByText('양찬욱').closest('article')?.textContent).toContain('보호자 010-****-5678');
});

it('후보가 없어도 aging 요약과 기준 변경 경로를 유지한다', async () => {
  nav.search = 'tab=suspensions';
  const view = mount(undefined, {
    ...ledger,
    totalReceivable: 0,
    totalOverdue: 0,
    aging: ledger.aging.map((bucket) => ({ ...bucket, studentCount: 0, outstanding: 0 })),
    items: [],
  });
  expect(await view.findByText('표시할 항목이 없습니다')).toBeTruthy();
  expect(view.getByText('전체 미수').parentElement?.textContent).toContain('₩0');
  expect(view.getByLabelText('보류 기준 일')).toBeTruthy();
  expect((view.getByRole('button', { name: '전부 독촉 기록' }) as HTMLButtonElement).disabled).toBe(true);
});

it('대표 기준 저장과 전부 독촉은 current version·멱등키를 사용하고 외부 발송 완료를 주장하지 않는다', async () => {
  nav.search = 'tab=suspensions';
  const view = mount();
  const threshold = await view.findByLabelText('보류 기준 일');
  fireEvent.change(threshold, { target: { value: '21' } });
  fireEvent.click(view.getByRole('button', { name: '기준 저장' }));
  await waitFor(() => expect(seen.some(({ method, url, data }) => {
    if (method?.toLowerCase() !== 'post' || url !== '/accounting/delinquency-suspensions/policy') return false;
    const body = JSON.parse(String(data)) as { thresholdDays?: number; expectedVersion?: number; requestKey?: string };
    return body.thresholdDays === 21 && body.expectedVersion === 1 && typeof body.requestKey === 'string';
  })).toBe(true));

  fireEvent.click(view.getByRole('button', { name: '전부 독촉 기록' }));
  const dialog = await view.findByRole('dialog');
  expect(within(dialog).getByText(/외부 문자나 전화 발송 완료로 표시하지 않습니다/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: '전체 기록' }));
  await waitFor(() => expect(seen.some(({ method, url, data }) => {
    if (method?.toLowerCase() !== 'post' || url !== '/accounting/delinquency-suspensions/remind-batch') return false;
    const body = JSON.parse(String(data)) as { items?: Array<{ studentId?: number; expectedVersion?: number; requestKey?: string }> };
    return body.items?.length === 2 && body.items.every((item) => (
      typeof item.studentId === 'number' && typeof item.expectedVersion === 'number' && typeof item.requestKey === 'string'
    ));
  })).toBe(true));
  expect(await view.findByText('2명의 납입 독촉 이력을 기록했습니다.')).toBeTruthy();
});

it('409 version 충돌은 정지 사유를 보존하고 최신 원장을 다시 읽게 한다', async () => {
  nav.search = 'tab=suspensions';
  const view = mount(new ApiError('DELINQUENCY_STALE', '다른 담당자가 먼저 처리했습니다.', 409));
  const table = await view.findByRole('table', { name: '연체 수강 정지 원장' });
  const row = within(table).getByText('양찬욱').closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: '수강 정지' }));
  const dialog = await view.findByRole('dialog');
  const reason = within(dialog).getByLabelText('처리 사유') as HTMLTextAreaElement;
  fireEvent.change(reason, { target: { value: '장기 연체 확인' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '수강 정지' }));
  expect(await within(dialog).findByText('다른 담당자가 먼저 처리했습니다.')).toBeTruthy();
  expect(reason.value).toBe('장기 연체 확인');

  const readsBefore = seen.filter(({ method, url }) => method?.toLowerCase() === 'get' && url === '/accounting/delinquency-suspensions').length;
  fireEvent.click(within(dialog).getByRole('button', { name: '최신 원장 다시 불러오기' }));
  await waitFor(() => expect(seen.filter(({ method, url }) => method?.toLowerCase() === 'get' && url === '/accounting/delinquency-suspensions').length).toBeGreaterThan(readsBefore));
  expect(reason.value).toBe('장기 연체 확인');
});
