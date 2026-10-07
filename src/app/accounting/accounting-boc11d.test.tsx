/** @file-guide
 * 목적: TBO-55 BOC-11d 학생 환불·강사 지급 계좌의 Front 보안 경계를 회귀한다. (test)
 * 책임/재사용: 실제 AccountingPage로 A27 대상 선택·민감 초안 폐기·마스킹·원장 이동과 생성 계약 부재 시 업무 write 0을 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Invoice, Me, PayoutSheet } from '@/api/types';
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
const payoutSheet: PayoutSheet = {
  month: '2026-10', today: '2026-10-07', monthEnded: false, unwrittenCount: 0, netTotal: 0, canSeeAmounts: true,
  writtenMinutes: 0, unwrittenMinutes: 0, grossTotal: 0, lateCutTotal: 0, taxTotal: 0,
  bonusTotal: 0, correctionCount: 0, amountsHidden: false,
  rows: [{
    staffId: 9, staffName: '이다현', yearMonth: '2026-10', writtenCount: 0, writtenMinutes: 0,
    unwrittenCount: 0, unwrittenMinutes: 0, canceledCount: 0, naCount: 0, noRateCount: 0,
    gross: 0, lateCut: 0, incomeTax: 0, localTax: 0, net: 0, unwrittenAmount: 0,
    saved: false, savedDiffers: false, savedNet: null, confirmed: false, confirmedAt: null, confirmedBy: null,
    canConfirm: false, correctionCount: 0, correctionMinutes: 0, lateCount: 0, bonus: 0,
    amountsHidden: false, confirmBlockedReason: '달이 끝나지 않았습니다',
  }],
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
    const data = config.url === '/accounting/payouts' ? payoutSheet : accounting;
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
}

it('A27 계좌 입력은 기존 학생·강사 projection만 대상으로 쓰고 원문·저장 성공을 만들지 않는다', async () => {
  const view = mount();
  await waitFor(() => expect(view.getByRole('button', { name: '정리 · 기준' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '정리 · 기준' }));
  const tabs = view.getByRole('group', { name: '회계 탭' });
  fireEvent.click(within(tabs).getByRole('button', { name: '계좌' }));

  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=accounts', { scroll: false });
  expect(view.getByRole('heading', { name: '계좌 — 학생 환불 · 강사 지급' })).toBeTruthy();
  await waitFor(() => expect(view.getByRole('option', { name: '이다현' })).toBeTruthy());
  fireEvent.change(view.getByLabelText('대상 강사'), { target: { value: '9' } });
  fireEvent.change(view.getByLabelText('은행'), { target: { value: '하나은행' } });
  fireEvent.change(view.getByLabelText('계좌번호'), { target: { value: '123-456-7890' } });
  fireEvent.change(view.getByLabelText('예금주'), { target: { value: '이다현' } });

  const accountNo = view.getByLabelText('계좌번호') as HTMLInputElement;
  expect(accountNo.type).toBe('password');
  expect(accountNo.autocomplete).toBe('new-password');
  expect(view.getByText('저장 후 표시 예시 · **** 7890')).toBeTruthy();
  expect(view.container.textContent).not.toContain('123-456-7890');
  expect((view.getByRole('button', { name: '암호화 저장 기능 준비 중' }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(within(view.getByRole('group', { name: '계좌 용도' })).getByRole('button', { name: '학생 환불' }));
  expect((view.getByLabelText('대상 학생') as HTMLSelectElement).value).toBe('');
  expect((view.getByLabelText('은행') as HTMLInputElement).value).toBe('');
  expect((view.getByLabelText('계좌번호') as HTMLInputElement).value).toBe('');
  expect((view.getByLabelText('예금주') as HTMLInputElement).value).toBe('');
  expect(view.getByRole('option', { name: '양찬욱 · G10' })).toBeTruthy();
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});

it('?tab=accounts는 권한·암호화·마스킹·CRUD·실패 경계를 읽고 지급 원장으로 이동한다', async () => {
  nav.search = 'tab=accounts';
  const view = mount();
  await waitFor(() => expect(view.getByRole('heading', { name: '계좌 — 학생 환불 · 강사 지급' })).toBeTruthy());

  expect(view.getByText(/대표와 계좌 권한을 받은 회계 담당자만/)).toBeTruthy();
  expect(view.getByText(/전용 조회 기능이 준비되기 전에는 저장 계좌를 표시하지 않습니다/)).toBeTruthy();
  for (const field of [
    '암호화 값 · 암호화 키 버전 · 마지막 4자리', '조회 · 저장 · 원문 확인 권한',
    '생성 · 수정 · 삭제 변경 이력', '실제 처리자 · 중복 제출 방지 · 감사',
    '지급·환불 원장 연결 · 마스킹 기록', '암호화 키 누락·복호화 실패 시 접근 차단',
  ]) expect(view.getByText(field)).toBeTruthy();
  expect(view.queryByLabelText(/주민등록번호/)).toBeNull();

  fireEvent.click(view.getByRole('button', { name: '지급 원장 보기' }));
  expect(nav.replace).toHaveBeenLastCalledWith('/accounting?tab=ledger', { scroll: false });
  expect(seen.every(({ method }) => !method || method.toLowerCase() === 'get')).toBe(true);
});
