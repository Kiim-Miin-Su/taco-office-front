/** @file-guide
 * 목적: §28 컨설팅 회계 — 화면이 뺄셈도 판정도 다시 하지 않는다 (C58).
 * 책임/재사용: 실제 ConsultingAccounting 을 쓰고 쓰기 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ConsAccounting as Dto } from '@/api/types';

const { pay, conv } = vi.hoisted(() => ({ pay: vi.fn(), conv: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useAddConsPayment: () => ({ mutate: pay, reset: vi.fn(), isPending: false, isError: false, error: null }),
  useConsToInvoice: () => ({ mutate: conv, reset: vi.fn(), isPending: false, isError: false, error: null }),
}));

const { ConsultingAccounting } = await import('./ConsultingAccounting');

/** 원문 컷과 같은 모양 — 두 건, 하나는 받은 게 없고 하나는 일부 받았다 */
const base: Dto = {
  canSeeAmounts: true,
  totalAmount: 1700000, totalPaid: 400000, totalDue: 1300000,
  items: [
    {
      id: 1, studentName: '민제인', consType: 'essay', stage: 'contract', stageLabel: '계약',
      amount: 900000, paid: 0, due: 900000, payments: [], invId: null, canInvoice: false,
    },
    {
      id: 2, studentName: '고은성', consType: 'admissions', stage: 'running', stageLabel: '진행',
      amount: 800000, paid: 400000, due: 400000,
      payments: [{ id: 7, amount: 400000, paidOn: '2026-07-12', memo: '계약금', byName: '김민수' }],
      invId: null, canInvoice: true,
    },
  ],
};
const clone = (): Dto => JSON.parse(JSON.stringify(base)) as Dto;

afterEach(() => { cleanup(); pay.mockReset(); conv.mockReset(); });

/** 카드 라벨 옆에 붙은 큰 숫자 하나 — 표의 같은 숫자와 헷갈리지 않게 카드 안에서만 찾는다 */
const card = (v: ReturnType<typeof render>, label: string): string =>
  v.getByText(label).parentElement!.querySelector('div:nth-child(2)')!.textContent ?? '';

it('머리 세 칸은 서버가 준 값 그대로다 — 화면이 줄을 더하지 않는다 (D-R37)', () => {
  const v = render(<ConsultingAccounting data={clone()} />);
  expect(card(v, '계약 금액')).toBe('1,700,000원');
  expect(card(v, '받은 돈')).toBe('400,000원');
  expect(card(v, '남은 돈')).toBe('1,300,000원');
});

it('서버의 합계가 줄과 안 맞아도 화면은 서버 값을 그린다 — 조용히 고치지 않는다', () => {
  const d = clone();
  d.totalDue = 999; // 서버가 이렇게 줬다면 그건 서버에서 볼 일이다
  const v = render(<ConsultingAccounting data={d} />);
  expect(card(v, '남은 돈')).toBe('999원');
});

it('단계 낱말도 서버가 준 것을 쓴다 — 코드값이 새지 않는다 (D-R18)', () => {
  const d = clone();
  d.items[0] = { ...d.items[0], stageLabel: '서버가 준 말' };
  const v = render(<ConsultingAccounting data={d} />);
  expect(v.getByText('서버가 준 말')).toBeTruthy();
  expect(v.getByText('진행')).toBeTruthy();
  expect(v.queryByText('running')).toBeNull();
  expect(v.queryByText('contract')).toBeNull();
});

it('납부 기록이 없으면 —, 있으면 날짜와 금액을 한 칸에 적는다', () => {
  const v = render(<ConsultingAccounting data={clone()} />);
  expect(v.getByText('—')).toBeTruthy();
  expect(v.getByText('07-12 400,000원')).toBeTruthy();
});

it('금액이 가려지면 배너로 알리고 계약 칸에 「가려짐」을 적는다 — 0 원으로 뭉개지 않는다', () => {
  const d = clone();
  d.canSeeAmounts = false;
  d.totalAmount = null; d.totalPaid = null; d.totalDue = null;
  d.items = d.items.map((r) => ({ ...r, amount: null, paid: null, due: null, payments: [], canInvoice: false }));
  const v = render(<ConsultingAccounting data={d} />);
  expect(v.getAllByText('가려짐').length).toBeGreaterThan(0);
  expect(v.queryByText('0원')).toBeNull();
});

it('납부 넣기 — 화면은 서버에 보낼 세 값만 모은다', () => {
  const v = render(<ConsultingAccounting data={clone()} />);
  fireEvent.click(v.getAllByRole('button', { name: '납부 넣기' })[1]);
  fireEvent.change(v.getByLabelText('받은 금액'), { target: { value: '100000' } });
  fireEvent.change(v.getByLabelText('받은 날'), { target: { value: '2026-09-01' } });
  fireEvent.change(v.getByLabelText('메모'), { target: { value: '2회차' } });
  fireEvent.click(v.getByRole('button', { name: '넣기' }));
  expect(pay).toHaveBeenCalledTimes(1);
  expect(pay.mock.calls[0][0]).toEqual({ consId: 2, amount: 100000, paidOn: '2026-09-01', memo: '2회차' });
});

it('날짜 없이 또는 0 원으로는 넣을 수 없다 — 0 원은 기록이 아니라 실수다', () => {
  const v = render(<ConsultingAccounting data={clone()} />);
  fireEvent.click(v.getAllByRole('button', { name: '납부 넣기' })[0]);
  expect(v.getByRole('button', { name: '넣기' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(v.getByLabelText('받은 금액'), { target: { value: '0' } });
  fireEvent.change(v.getByLabelText('받은 날'), { target: { value: '2026-09-01' } });
  expect(v.getByRole('button', { name: '넣기' }).hasAttribute('disabled')).toBe(true);
});

it('종료된 건은 납부 단추가 잠긴다', () => {
  const d = clone();
  d.items[0] = { ...d.items[0], stage: 'done', stageLabel: '종료' };
  const v = render(<ConsultingAccounting data={d} />);
  expect(v.getAllByRole('button', { name: '납부 넣기' })[0].hasAttribute('disabled')).toBe(true);
});

it('「청구서로 전환」은 서버의 canInvoice 를 따른다 — 화면이 단계를 다시 읽지 않는다 (D-R39)', () => {
  const v = render(<ConsultingAccounting data={clone()} />);
  fireEvent.click(v.getAllByRole('button', { name: '열기' })[0]);
  expect(v.getByRole('button', { name: '청구서로 전환' }).hasAttribute('disabled')).toBe(true);
  expect(v.getByText('계약 5단계(수납)부터, 남은 돈이 있을 때 전환합니다')).toBeTruthy();
});

it('전환할 수 있는 건은 눌리고, 누르면 그 건 하나만 보낸다', () => {
  const v = render(<ConsultingAccounting data={clone()} />);
  fireEvent.click(v.getAllByRole('button', { name: '열기' })[1]);
  fireEvent.click(v.getByRole('button', { name: '청구서로 전환' }));
  expect(conv).toHaveBeenCalledWith({ consId: 2 });
});

it('이미 전환한 건은 청구서 번호를 보여 주고 다시 눌리지 않는다', () => {
  const d = clone();
  d.items[1] = { ...d.items[1], invId: 42, canInvoice: false };
  const v = render(<ConsultingAccounting data={d} />);
  fireEvent.click(v.getAllByRole('button', { name: '열기' })[1]);
  expect(v.getByText('청구서 #42 로 전환되었습니다')).toBeTruthy();
  expect(v.getByRole('button', { name: '청구서로 전환' }).hasAttribute('disabled')).toBe(true);
});

it('열기 서랍은 납부 기록을 한 줄도 빼지 않고 보여 준다', () => {
  const v = render(<ConsultingAccounting data={clone()} />);
  fireEvent.click(v.getAllByRole('button', { name: '열기' })[1]);
  expect(v.getByText('2026-07-12')).toBeTruthy();
  expect(v.getByText('계약금')).toBeTruthy();
  expect(v.getByText('김민수')).toBeTruthy();
});
