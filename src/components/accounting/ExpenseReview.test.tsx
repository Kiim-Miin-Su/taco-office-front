/** @file-guide
 * 목적: 법인카드 심사 패널 — 신청 금액 placeholder·증액 잠금·영수증/자기 승인 차단·2단 확정 회귀 (A-D3 · C36-b).
 * 책임/재사용: 실제 ExpenseReview/useReviewExpense/won 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Expense, ExpenseTotal, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { ExpenseReview } from './ExpenseReview';

const me: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};

const card = (over: Partial<Expense> = {}): Expense => ({
  id: 7, spendOn: '2026-09-08', category: 'ent', categoryLabel: '접대비', merchant: '카페 서초',
  purpose: '학부모 간담회 다과', requestedAmount: 145000, amount: null, reason: null, hasReceipt: true,
  requesterId: 4, requesterName: '정은채', filedById: 4, filedByName: '정은채',
  state: 'pending', reviewerName: null, reviewedAt: null, ...over,
});
const approved: Expense = card({
  id: 1, category: 'rent', categoryLabel: '임대료', merchant: '강남 임대', requestedAmount: null,
  amount: 1400000, hasReceipt: true, state: 'approved', reviewerName: '김민선',
});

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

function setup(expenses: Expense[], adapter?: typeof api.defaults.adapter, totals: ExpenseTotal[] = []) {
  useSession.getState().signIn('fixture', me);
  if (adapter) api.defaults.adapter = adapter;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ExpenseReview expenses={expenses} totals={totals} me={me} />
    </QueryClientProvider>,
  );
}

it('신청 금액은 placeholder 로만 보이고 확정 칸은 비어 있다 (A-1 · 대표 지시 2026-08-25)', () => {
  const view = setup([card(), approved]);
  fireEvent.click(view.getByRole('button', { name: /카페 서초/ }));
  const amount = view.getByLabelText('확정 금액') as HTMLInputElement;
  expect(amount.value).toBe('');
  expect(amount.placeholder).toBe('145000');
});

/**
 * 분류별 합계는 **서버가 준 것을 그대로 보여 준다** (C43-b · 대표 지시 「전부 단일 진실원」).
 * 전에는 화면이 지출 줄을 직접 더했다 — 머리의 「남은 돈」과 같은 돈을 두 곳에서 세는 일이었다.
 */
it('분류별 합계는 화면이 더하지 않는다 — 줄이 몇 개든 서버 숫자를 쓴다', () => {
  const view = setup(
    [card(), approved],
    undefined,
    [{ category: 'ent', categoryLabel: '접대비', sum: 1400000 }],
  );
  expect(view.container.textContent).toContain('1,400,000원');
  // 대기 중인 145,000 은 서버가 안 보냈으니 합계에도 없다
  expect(view.container.textContent).not.toContain('1,545,000원');
});

it('서버가 합계를 안 보내면 없다고 말한다 — 줄에서 다시 세지 않는다', () => {
  const view = setup([card(), approved], undefined, []);
  expect(view.container.textContent).toContain('확정된 지출이 없습니다');
});

it('증액은 버튼이 잠기고 이유를 말한다 — 재신청으로 보낸다 (A-D3)', () => {
  const view = setup([card()]);
  fireEvent.click(view.getByRole('button', { name: /카페 서초/ }));
  fireEvent.change(view.getByLabelText('확정 금액'), { target: { value: '145001' } });
  expect(view.getByRole('button', { name: '승인' }).hasAttribute('disabled')).toBe(true);
  expect(view.container.textContent).toContain('증액은 재신청으로 처리합니다');
});

it('감액은 사유가 채워져야 승인이 열린다 (A-3)', () => {
  const view = setup([card()]);
  fireEvent.click(view.getByRole('button', { name: /카페 서초/ }));
  fireEvent.change(view.getByLabelText('확정 금액'), { target: { value: '100000' } });
  expect(view.getByRole('button', { name: '승인' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '영수증 금액과 다름' } });
  expect(view.getByRole('button', { name: '승인' }).hasAttribute('disabled')).toBe(false);
});

it('영수증이 없으면 승인이 열리지 않고, 본인 신청은 둘 다 잠긴다 (A-4 · A-5)', () => {
  const noReceipt = setup([card({ hasReceipt: false })]);
  fireEvent.click(noReceipt.getByRole('button', { name: /카페 서초/ }));
  fireEvent.change(noReceipt.getByLabelText('확정 금액'), { target: { value: '145000' } });
  expect(noReceipt.getByRole('button', { name: '승인' }).hasAttribute('disabled')).toBe(true);
  expect(noReceipt.container.textContent).toContain('영수증이 없습니다');
  cleanup();

  const own = setup([card({ requesterId: me.id, requesterName: '대표' })]);
  fireEvent.click(own.getByRole('button', { name: /카페 서초/ }));
  fireEvent.change(own.getByLabelText('확정 금액'), { target: { value: '145000' } });
  fireEvent.change(own.getByLabelText('사유'), { target: { value: '확인함' } });
  expect(own.getByRole('button', { name: '승인' }).hasAttribute('disabled')).toBe(true);
  expect(own.getByRole('button', { name: '반려' }).hasAttribute('disabled')).toBe(true);
  expect(own.container.textContent).toContain('본인이 올린 신청입니다');
});

it('승인은 2단 확정이고 서버에는 decision·amount 만 나간다', async () => {
  const post = vi.fn(async (config) => ({ config, status: 200, statusText: 'OK', headers: {}, data: card({ state: 'approved', amount: 145000 }) }));
  const view = setup([card()], post as never);
  fireEvent.click(view.getByRole('button', { name: /카페 서초/ }));
  fireEvent.change(view.getByLabelText('확정 금액'), { target: { value: '145000' } });
  fireEvent.click(view.getByRole('button', { name: '승인' }));
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 승인' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[0][0].url).toContain('/accounting/expenses/7/review');
  expect(JSON.parse(String(post.mock.calls[0][0].data))).toEqual({ decision: 'approve', amount: 145000 });
});
