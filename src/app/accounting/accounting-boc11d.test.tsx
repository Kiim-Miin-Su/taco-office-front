/** @file-guide
 * 목적: TBO-55 BOC-11D-01 학생 환불·강사 지급 보호 계좌의 Front CRUD·마스킹·원문 폐기를 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage와 생성 계약을 사용해 입력→HTTP→재조회, 삭제·원문 확인·탭 이동을 검증한다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-11D1-PROTECTED-ACCOUNT-2026-10-09.md · docs/contracts/FILE-GUIDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Me, ProtectedAccount, ProtectedAccountLedger } from '@/api/types';
import { useSession } from '@/store/useSession';
import AccountingPage from './page';

const nav = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
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
const teacherAccount: ProtectedAccount = {
  id: 91, purpose: 'teacher_payout', targetId: 9, targetName: '이다현', targetTag: null,
  state: 'active', version: 1, last4: '7890', maskedAccountNumber: '**** 7890',
  updatedBy: '대표', updatedAt: '2026-10-09T01:00:00.000Z', canUpdate: true, canDelete: true, canReveal: true,
  events: [{ action: 'created', fromState: null, toState: 'active', version: 1, actor: '대표', reason: null, createdAt: '2026-10-09T01:00:00.000Z' }],
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

const bodyOf = (data: unknown): Record<string, unknown> => {
  if (typeof data === 'string') return JSON.parse(data) as Record<string, unknown>;
  return (data ?? {}) as Record<string, unknown>;
};

function mount(initialItems: ProtectedAccount[] = []) {
  useSession.getState().signIn('fixture', me);
  let ledger: ProtectedAccountLedger = {
    canRead: true, canWrite: true, canReveal: true,
    targets: [
      { purpose: 'teacher_payout', targetId: 9, targetName: '이다현', targetTag: null },
      { purpose: 'student_refund', targetId: 7, targetName: '양찬욱', targetTag: 'G10' },
    ],
    items: initialItems,
  };
  api.defaults.adapter = (async (config: { method?: string; url?: string; data?: unknown }) => {
    seen.push(config);
    const method = config.method?.toLowerCase() ?? 'get';
    if (config.url === '/accounting/protected-accounts' && method === 'get') {
      return { config, status: 200, statusText: 'OK', headers: {}, data: ledger };
    }
    if (config.url === '/accounting/protected-accounts' && method === 'post') {
      const body = bodyOf(config.data);
      const item: ProtectedAccount = {
        id: 92, purpose: body.purpose as ProtectedAccount['purpose'], targetId: Number(body.targetId),
        targetName: body.purpose === 'student_refund' ? '양찬욱' : '이다현', targetTag: body.purpose === 'student_refund' ? 'G10' : null,
        state: 'active', version: 1, last4: String(body.accountNumber).replace(/[\s-]/g, '').slice(-4),
        maskedAccountNumber: `**** ${String(body.accountNumber).replace(/[\s-]/g, '').slice(-4)}`,
        updatedBy: '대표', updatedAt: '2026-10-09T02:00:00.000Z', canUpdate: true, canDelete: true, canReveal: true,
        events: [{ action: 'created', fromState: null, toState: 'active', version: 1, actor: '대표', reason: null, createdAt: '2026-10-09T02:00:00.000Z' }],
      };
      ledger = { ...ledger, items: [...ledger.items, item] };
      return { config, status: 201, statusText: 'Created', headers: {}, data: { item, replayed: false } };
    }
    if (config.url === '/accounting/protected-accounts/91/reveal' && method === 'post') {
      return { config, status: 201, statusText: 'Created', headers: {}, data: {
        accountId: 91, purpose: 'teacher_payout', targetId: 9, targetName: '이다현', version: 1,
        bank: '하나은행', accountNumber: '1234567890', holder: '이다현', replayed: false,
      } };
    }
    if (config.url === '/accounting/protected-accounts/91/delete' && method === 'post') {
      const item: ProtectedAccount = {
        ...teacherAccount, state: 'deleted', version: 2, last4: null, maskedAccountNumber: null,
        canDelete: false, canReveal: false, updatedAt: '2026-10-09T03:00:00.000Z',
        events: [...teacherAccount.events, { action: 'deleted', fromState: 'active', toState: 'deleted', version: 2,
          actor: '대표', reason: '계좌 변경', createdAt: '2026-10-09T03:00:00.000Z' }],
      };
      ledger = { ...ledger, items: [item] };
      return { config, status: 201, statusText: 'Created', headers: {}, data: { item, replayed: false } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: accounting };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('A27 입력을 생성 DTO로 저장하고 성공 뒤 원문 초안을 지운 다음 masked current를 재조회한다', async () => {
  nav.search = 'tab=accounts';
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: '계좌 — 학생 환불 · 강사 지급' })).toBeTruthy());
  await waitFor(() => expect(view.getByRole('option', { name: '이다현' })).toBeTruthy());
  fireEvent.change(view.getByLabelText('대상 강사'), { target: { value: '9' } });
  fireEvent.change(view.getByLabelText('은행'), { target: { value: '하나은행' } });
  fireEvent.change(view.getByLabelText('계좌번호'), { target: { value: '123-456-7890' } });
  fireEvent.change(view.getByLabelText('예금주'), { target: { value: '이다현' } });

  const accountNo = view.getByLabelText('계좌번호') as HTMLInputElement;
  expect(accountNo.type).toBe('password');
  expect(accountNo.autocomplete).toBe('new-password');
  expect(view.getByText('저장 후 표시 · **** 7890')).toBeTruthy();
  expect(view.container.textContent).not.toContain('123-456-7890');
  fireEvent.click(view.getByRole('button', { name: '암호화 저장' }));

  await waitFor(() => expect(seen.some(({ method, url }) => method === 'post' && url === '/accounting/protected-accounts')).toBe(true));
  await waitFor(() => expect((view.getByLabelText('계좌번호') as HTMLInputElement).value).toBe(''));
  expect(await view.findByText('**** 7890')).toBeTruthy();
  const saved = seen.find(({ method, url }) => method === 'post' && url === '/accounting/protected-accounts');
  expect(bodyOf(saved?.data)).toMatchObject({ purpose: 'teacher_payout', targetId: 9, expectedVersion: 0 });

  fireEvent.click(within(view.getByRole('group', { name: '계좌 용도' })).getByRole('button', { name: '학생 환불' }));
  expect((view.getByLabelText('대상 학생') as HTMLSelectElement).value).toBe('');
  expect(view.getByRole('option', { name: '양찬욱 · G10' })).toBeTruthy();
});

it('masked 목록에서 사유 있는 원문 확인·삭제를 거쳐 원문을 닫을 때 폐기하고 지급 원장으로 이동한다', async () => {
  nav.search = 'tab=accounts';
  const view = mount([teacherAccount]);
  expect(await view.findByText('**** 7890')).toBeTruthy();
  expect(view.container.textContent).not.toContain('하나은행');

  fireEvent.click(view.getByRole('button', { name: '원문 확인' }));
  fireEvent.change(view.getByLabelText('확인 사유'), { target: { value: '지급 전 계좌 대조' } });
  fireEvent.click(view.getByRole('button', { name: '사유를 남기고 확인' }));
  expect(await view.findByText('1234567890')).toBeTruthy();
  expect(view.getByText(/하나은행/)).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '닫기' }));
  expect(view.queryByText('1234567890')).toBeNull();

  fireEvent.click(view.getByRole('button', { name: '삭제' }));
  fireEvent.change(view.getByLabelText('삭제 사유'), { target: { value: '계좌 변경' } });
  fireEvent.click(view.getByRole('button', { name: '원문 삭제' }));
  expect(await view.findByText('저장 원문 삭제됨')).toBeTruthy();
  expect(view.queryByRole('button', { name: '원문 확인' })).toBeNull();

  fireEvent.click(view.getByRole('button', { name: '지급 원장 보기' }));
  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=ledger', { scroll: false });
  expect(seen.some(({ method, url }) => method === 'post' && url === '/accounting/protected-accounts/91/reveal')).toBe(true);
  expect(seen.some(({ method, url }) => method === 'post' && url === '/accounting/protected-accounts/91/delete')).toBe(true);
  expect(view.queryByLabelText(/주민등록번호/)).toBeNull();
});
