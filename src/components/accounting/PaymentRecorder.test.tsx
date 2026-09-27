/** @file-guide
 * 목적: 분납 입금 패널 — 잔액 placeholder·서버 거절 문구·완납 잠금·2단 삭제 회귀 (A-D2 · C36-a).
 * 책임/재사용: 실제 PaymentRecorder/useCreatePayment/won 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Invoice, Me, Payment } from '@/api/types';
import { useSession } from '@/store/useSession';
import { PaymentRecorder } from './PaymentRecorder';

const me: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: 9, studentId: 11, studentName: '고은설', grade: 'G8', yearMonth: '2026-08', title: '8월 수업료',
  amount: 520000, paidAmount: 200000, remaining: 320000, state: 'partial', stateLabel: '일부 납부',
  invType: 'tuition', invTypeLabel: '수업료 청구',
  issuedOn: '2026-08-01', dueOn: '2026-08-21', paidAt: null, overdueDays: 0, lines: [], sentAt: null, canDeliver: false, canVoid: false, voidBlockedReason: null, voidReason: null,
  installments: [], nextDueOn: '2026-08-21', nextInstallmentSeq: null, ...over,
});
const line: Payment = {
  id: 3, invId: 9, studentId: 11, studentName: '고은설', amount: 200000, paidOn: '2026-08-23',
  method: 'transfer', reason: '1회차 분납', category: 'tuition', categoryLabel: '수업료',
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

function setup(invoices: Invoice[], payments: Payment[], adapter?: typeof api.defaults.adapter, initialInvId: number | null = null) {
  useSession.getState().signIn('fixture', me);
  if (adapter) api.defaults.adapter = adapter;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <PaymentRecorder invoices={invoices} payments={payments} initialInvId={initialInvId} />
    </QueryClientProvider>,
  );
}

it('잔액은 placeholder 로만 보이고 value 는 비어 있다 — 확인하지 않은 저장을 막는다 (ACCOUNTING §0)', () => {
  const view = setup([inv()], [line]);
  fireEvent.click(view.getByRole('button', { name: /고은설/ }));
  const amount = view.getByLabelText('이번에 들어온 금액') as HTMLInputElement;
  expect(amount.value).toBe('');
  expect(amount.placeholder).toBe('320000');
  expect(view.container.textContent).toContain('₩320,000');
  expect(view.getByRole('button', { name: '입금 기록' }).hasAttribute('disabled')).toBe(true);
});

it('등록은 입력한 금액 그대로 서버로 보내고, 누계는 화면이 더하지 않는다', async () => {
  const post = vi.fn(async (config) => ({ config, status: 201, statusText: 'Created', headers: {}, data: inv({ paidAmount: 320000, remaining: 200000 }) }));
  const view = setup([inv()], [line], post as never);
  fireEvent.click(view.getByRole('button', { name: /고은설/ }));
  fireEvent.change(view.getByLabelText('이번에 들어온 금액'), { target: { value: '120000' } });
  fireEvent.change(view.getByLabelText('입금일'), { target: { value: '2026-08-30' } });
  fireEvent.click(view.getByRole('button', { name: '입금 기록' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(post.mock.calls[0][0].data))).toEqual({
    invId: 9, amount: 120000, paidOn: '2026-08-30', method: 'transfer',
  });
});

it('서버 거절(OVERPAY) 문구를 그대로 그린다 — 화면이 초과를 다시 판정하지 않는다', async () => {
  const post = vi.fn(async () => {
    throw Object.assign(new Error('rejected'), {
      isAxiosError: true,
      response: { status: 409, data: { code: 'OVERPAY', message: '남은 금액은 320,000원입니다 — 그보다 많이 적을 수 없습니다' } },
    });
  });
  const view = setup([inv()], [line], post as never);
  fireEvent.click(view.getByRole('button', { name: /고은설/ }));
  fireEvent.change(view.getByLabelText('이번에 들어온 금액'), { target: { value: '999999' } });
  fireEvent.change(view.getByLabelText('입금일'), { target: { value: '2026-08-30' } });
  fireEvent.click(view.getByRole('button', { name: '입금 기록' }));
  await waitFor(() => expect(view.container.textContent).toContain('남은 금액은 320,000원입니다'));
});

it('삭제는 2단 확정이다 — 첫 번째 클릭으로는 요청이 나가지 않는다', async () => {
  const del = vi.fn(async (config) => ({ config, status: 200, statusText: 'OK', headers: {}, data: { ok: true } }));
  const view = setup([inv()], [line], del as never);
  fireEvent.click(view.getByRole('button', { name: /고은설/ }));
  fireEvent.click(view.getByRole('button', { name: '삭제' }));
  expect(del).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 삭제' }));
  await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
  expect(del.mock.calls[0][0].url).toContain('/accounting/payments/3');
});

it('완납된 청구서는 고를 수 없고, 줄을 더하거나 지우는 자리가 없다 (되돌리기 없음)', () => {
  const paid = inv({ paidAmount: 520000, remaining: 0, state: 'paid' });
  const view = setup([paid], [line]);
  expect(view.queryByRole('button', { name: /고은설/ })).toBeNull();
  expect(view.container.textContent).toContain('다 받았습니다');
});

/**
 * §53 ③ 「입금 완료 →」(W11 · N-28 ②) — 입금 기록을 **그 청구서를 고른 채** 연다. 금액 · 입금일은 여전히 사람이 적는다.
 */
it('처음 고를 청구서를 받으면 그 청구서가 골라진 채 열린다 — 금액 칸은 여전히 비어 있다', () => {
  const view = setup([inv({ id: 8, studentName: '강라율' }), inv()], [line], undefined, 9);
  expect(view.getByRole('button', { name: /고은설/ }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByRole('button', { name: /강라율/ }).getAttribute('aria-pressed')).toBe('false');
  expect(view.container.textContent).toContain('입금 기록 · 고은설');
  expect((view.getByLabelText('이번에 들어온 금액') as HTMLInputElement).value).toBe('');
});

/** 분납 일정(N-79) — 회차 · 예정일 · 금액 · 「받음」은 서버 값 그대로다. 지금 기한인 회차는 연체면 붉다 */
it('분납 청구서를 고르면 회차 일정이 서고, 채운 회차는 「받음」 · 지금 회차는 연체 빛깔이다', () => {
  const split = inv({
    amount: 520000, paidAmount: 200000, remaining: 320000, overdueDays: 3, nextDueOn: '2026-08-18', nextInstallmentSeq: 2,
    installments: [
      { seq: 1, dueOn: '2026-08-05', amount: 200000, covered: true },
      { seq: 2, dueOn: '2026-08-18', amount: 160000, covered: false },
      { seq: 3, dueOn: '2026-08-31', amount: 160000, covered: false },
    ],
  });
  const view = setup([split], [line], undefined, 9);
  const plan = view.getByRole('list', { name: '분납 일정' });
  const chips = [...plan.querySelectorAll('li')].map((li) => li.textContent);
  expect(chips).toEqual(['1회차 · 2026-08-05 · ₩200,000 · 받음', '2회차 · 2026-08-18 · ₩160,000', '3회차 · 2026-08-31 · ₩160,000']);
  expect(plan.querySelectorAll('li')[1].firstElementChild!.className).toContain('text-red');
});
