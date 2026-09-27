/** @file-guide
 * 목적: §55 들어온 돈 — 기간 이동·요약·일요일 시작 입금 달력·분류 칩·분류별·미수 전체 회귀 (w5 · 55-01 · 55-02 · 55-03 · 55-05).
 * 책임/재사용: 실제 PaymentFlow/useCashflow 를 쓰고 네트워크만 어댑터로 갈아 끼운다. 표본 수는 원본 §55 컷의 8월 그대로다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Cashflow, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { PaymentFlow } from './PaymentFlow';
import { MASKED } from '@/lib/money';

const me: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};

/** 원본 §55 — 2026년 8월 · 오늘 21일 · 11건 · 청구 5,287,300 = 입금 3,964,000 + 예정 1,323,300 */
const AUG: Cashflow = {
  from: '2026-08-01', to: '2026-08-31', label: '2026년 8월', dayCount: 31, category: null, today: '2026-08-21',
  count: 11, billed: 5287300, paid: 3964000, expected: 1323300,
  days: [
    { date: '2026-08-01', amount: 840000, paidAmount: 840000, expectedAmount: 0, count: 1, expectedCount: 0 },
    { date: '2026-08-05', amount: 1100000, paidAmount: 1100000, expectedAmount: 0, count: 1, expectedCount: 0 },
    { date: '2026-08-10', amount: 90000, paidAmount: 90000, expectedAmount: 0, count: 1, expectedCount: 0 },
    { date: '2026-08-22', amount: 150000, paidAmount: 0, expectedAmount: 150000, count: 1, expectedCount: 1 },
    { date: '2026-08-31', amount: 1053300, paidAmount: 0, expectedAmount: 1053300, count: 2, expectedCount: 2 },
  ],
  categories: [
    { key: 'tuition', label: '수업료', count: 2, billed: 1053300, paid: 0, rate: 0 },
    { key: 'gpa', label: 'GPA 관리비', count: 2, billed: 1560000, paid: 1560000, rate: 100 },
    { key: 'consulting', label: '컨설팅비', count: 2, billed: 1900000, paid: 1900000, rate: 100 },
    { key: 'diag_intake', label: '진단고사 · 상담', count: 2, billed: 300000, paid: 150000, rate: 50 },
    { key: 'exam_fee', label: '시험 응시료', count: 2, billed: 210000, paid: 90000, rate: 43 },
    { key: 'etc', label: '기타', count: 1, billed: 264000, paid: 264000, rate: 100 },
  ],
  open: [
    { invId: 1, seq: null, studentName: '양찬욱', partLabel: '전액', amount: 1170000, dueOn: '2026-07-31', whenLabel: '21일 연체', tone: 'danger' },
    { invId: 2, seq: null, studentName: '서지호', partLabel: '전액', amount: 150000, dueOn: '2026-08-22', whenLabel: 'D-1', tone: 'warning' },
    { invId: 3, seq: null, studentName: '고은성', partLabel: '잔액', amount: 413300, dueOn: '2026-08-31', whenLabel: 'D-10', tone: null },
  ],
  canSeeAmounts: true,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let calls: Array<Record<string, string> | undefined> = [];

beforeEach(() => {
  // 「오늘」만 원본 컷의 날로 고정한다 — 타이머는 진짜로 둔다(질의 라이브러리가 쓴다)
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); calls = [];
  vi.useRealTimers();
});

function setup(make: (params?: Record<string, string>) => Cashflow = () => AUG) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; params?: Record<string, string> }) => {
    calls.push(config.params);
    return { config, status: 200, statusText: 'OK', headers: {}, data: make(config.params) };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><PaymentFlow /></QueryClientProvider>);
}
const flat = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ');

it('월간이 기본이고 요약·달력은 서버가 센 수를 그대로 그린다 — 일요일 시작 · 기간 밖 칸은 비운다 (55-01 · 55-02)', async () => {
  const view = setup();
  // 기간 낱말은 서버의 것 — 이동기와 「분류별」 머리 두 자리에 같은 낱말이 선다
  await waitFor(() => expect(view.getAllByText('2026년 8월')).toHaveLength(2));
  expect(calls[0]).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  expect(view.getByText('31일')).toBeTruthy();
  expect(view.getByRole('button', { name: '월간' }).getAttribute('aria-pressed')).toBe('true');
  const sum = flat(view.getByRole('group', { name: '기간 요약' }));
  expect(sum).toBe('11건₩5,287,300청구₩3,964,000입금₩1,323,300예정');

  const cal = view.getByRole('group', { name: '입금 달력' });
  expect(within(cal).getAllByText(/^[일월화수목금토]$/).map((e) => e.textContent)).toEqual(['일', '월', '화', '수', '목', '금', '토']);
  // 8월 1일은 토요일 — 앞의 여섯 칸은 비어 있고 7월 날짜는 없다. 날짜 칸은 딱 31개
  const cells = cal.querySelectorAll('[data-date]');
  expect(cells).toHaveLength(31);
  expect(cal.querySelector('[data-date="2026-07-31"]')).toBeNull();
  expect(cells[0].getAttribute('data-date')).toBe('2026-08-01');
  expect(cal.querySelectorAll('[aria-hidden="true"].min-h-\\[76px\\]').length).toBe(6 + 5);
  // 날마다 합계 · 짙기(가장 큰 날에 견준 세 단계) · 예정 배지 · 오늘 칸
  const day = (iso: string) => cal.querySelector(`[data-date="${iso}"]`)!;
  expect(flat(day('2026-08-05'))).toBe('51,100,000');
  expect(day('2026-08-05').className).toContain('bg-blue/40');
  expect(day('2026-08-10').className).toContain('bg-blue/10');
  expect(day('2026-08-03').className).not.toContain('bg-blue');
  expect(within(day('2026-08-31') as HTMLElement).getByLabelText('예정 2건').textContent).toBe('2');
  expect(within(day('2026-08-22') as HTMLElement).getByLabelText('예정 1건')).toBeTruthy();
  expect(day('2026-08-21').className).toContain('ring-amber');
  expect(day('2026-08-20').className).not.toContain('ring-amber');
});

it('오른쪽 분류별과 미수 전체 — 금액 · 비율 · 줄 바탕 · 낱말은 서버가 준다 (55-03)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('region', { name: '분류별' })).toBeTruthy());
  const by = view.getByRole('region', { name: '분류별' });
  expect(flat(by)).toContain('분류별 2026년 8월');
  const lines = within(by).getAllByRole('listitem').map((li) => flat(li));
  expect(lines).toEqual([
    '수업료₩1,053,3000%', 'GPA 관리비₩1,560,000100%', '컨설팅비₩1,900,000100%',
    '진단고사 · 상담₩300,00050%', '시험 응시료₩210,00043%', '기타₩264,000100%',
  ]);
  const open = view.getByRole('region', { name: '미수 전체' });
  expect(flat(open)).toContain('기간과 무관');
  const rows = within(open).getAllByRole('listitem');
  expect(rows.map((r) => flat(r))).toEqual(['양찬욱전액₩1,170,00021일 연체', '서지호전액₩150,000D-1', '고은성잔액₩413,300D-10']);
  expect(rows[0].className).toContain('bg-red/10');
  expect(rows[1].className).toContain('bg-amber/10');
  expect(rows[2].className).toContain('bg-card');
});

it('‹ › 오늘 · 일간/주간/전체는 기간만 바꿔 다시 묻는다 — 전체는 달력 없이 합계만 (55-01)', async () => {
  const view = setup((p) => ({ ...AUG, from: p?.from ?? null, to: p?.to ?? null, label: p?.from ? `${p.from} ~ ${p.to}` : '전체', dayCount: p?.from ? 7 : null }));
  await waitFor(() => expect(calls).toHaveLength(1));
  fireEvent.click(view.getByRole('button', { name: '다음 기간' }));
  await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-09-01', to: '2026-09-30' }));
  fireEvent.click(view.getByRole('button', { name: '오늘' }));
  fireEvent.click(view.getByRole('button', { name: '주간' }));
  // 주는 월요일부터 — 스케줄 기간과 같은 함수
  await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-08-17', to: '2026-08-23' }));
  fireEvent.click(view.getByRole('button', { name: '이전 기간' }));
  await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-08-10', to: '2026-08-16' }));
  fireEvent.click(view.getByRole('button', { name: '일간' }));
  await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-08-14', to: '2026-08-14' }));
  fireEvent.click(view.getByRole('button', { name: '전체' }));
  await waitFor(() => expect(calls.at(-1)).toEqual({}));
  await waitFor(() => expect(view.getByText(/전체 기간은 날짜 달력 없이/)).toBeTruthy());
  expect(view.queryByRole('group', { name: '입금 달력' })).toBeNull();
  expect((view.getByRole('button', { name: '이전 기간' }) as HTMLButtonElement).disabled).toBe(true);
  expect((view.getByRole('button', { name: '다음 기간' }) as HTMLButtonElement).disabled).toBe(true);
});

it('분류 칩은 누르는 필터다 — 칩의 수는 고른 분류와 무관하고, 다시 누르면 전체로 돌아간다 (55-05)', async () => {
  const view = setup((p) => ({ ...AUG, category: p?.category ?? null, count: p?.category ? 2 : 11 }));
  await waitFor(() => expect(view.getByRole('button', { name: '전체 11' })).toBeTruthy());
  const group = view.getByRole('group', { name: '분류' });
  expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(
    ['전체 11', '수업료 2', 'GPA 관리비 2', '컨설팅비 2', '진단고사 · 상담 2', '시험 응시료 2', '기타 1'],
  );
  fireEvent.click(view.getByRole('button', { name: '컨설팅비 2' }));
  await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-08-01', to: '2026-08-31', category: 'consulting' }));
  await waitFor(() => expect(view.getByRole('button', { name: '컨설팅비 2' }).getAttribute('aria-pressed')).toBe('true'));
  // 칩 줄은 흔들리지 않는다 — 「전체」는 여전히 여섯 칸의 합
  expect(view.getByRole('button', { name: '전체 11' }).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(view.getByRole('button', { name: '컨설팅비 2' }));
  await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-08-01', to: '2026-08-31' }));
});

it('금액을 못 보면 요약은 숨긴 금액 낱말(「비공개」)이고 달력 칸은 건수로 적는다 (D-R39)', async () => {
  const masked: Cashflow = {
    ...AUG, canSeeAmounts: false, billed: null, paid: null, expected: null,
    days: AUG.days.map((d) => ({ ...d, amount: null, paidAmount: null, expectedAmount: null })),
    categories: AUG.categories.map((c) => ({ ...c, billed: null, paid: null, rate: null })),
    open: AUG.open.map((o) => ({ ...o, amount: null })),
  };
  const view = setup(() => masked);
  // 기간 낱말은 서버의 것 — 이동기와 「분류별」 머리 두 자리에 같은 낱말이 선다
  await waitFor(() => expect(view.getAllByText('2026년 8월')).toHaveLength(2));
  expect(flat(view.getByRole('group', { name: '기간 요약' }))).toBe(`11건${MASKED}청구${MASKED}입금${MASKED}예정`);
  const cal = view.getByRole('group', { name: '입금 달력' });
  expect(flat(cal.querySelector('[data-date="2026-08-31"]'))).toBe('312건2');
  expect(flat(view.getByRole('region', { name: '분류별' }))).not.toContain('%');
  expect(flat(view.getByRole('region', { name: '분류별' }))).toContain('—');
});

/**
 * 분납(N-79 · W11) — 한 청구서의 **못 채운 회차마다 한 줄**이다. 원문 §55 「고은성 2회차 ₩413,300 D-10 · 고은성 3회차 ₩413,300 D-40」.
 * 줄의 열쇠는 (청구서 · 회차)라 같은 청구서의 두 줄이 한 줄로 접히지 않는다. 「N회차」 낱말 · 금액 · 「D-N」은 서버 값이다.
 */
it('분납 청구서는 못 채운 회차마다 한 줄 — 같은 청구서의 두 회차가 둘 다 선다 (N-79)', async () => {
  const view = setup(() => ({
    ...AUG,
    open: [
      { invId: 3, seq: 2, studentName: '고은성', partLabel: '2회차', amount: 413300, dueOn: '2026-08-31', whenLabel: 'D-10', tone: null },
      { invId: 3, seq: 3, studentName: '고은성', partLabel: '3회차', amount: 413300, dueOn: '2026-09-30', whenLabel: 'D-40', tone: null },
    ],
  }));
  await waitFor(() => expect(view.getByRole('region', { name: '미수 전체' })).toBeTruthy());
  const rows = within(view.getByRole('region', { name: '미수 전체' })).getAllByRole('listitem');
  expect(rows.map((r) => flat(r))).toEqual(['고은성2회차₩413,300D-10', '고은성3회차₩413,300D-40']);
});

it('요약 옆에 「+ 결제 등록」이 선다 — 청구서 없이 들어온 돈(A-D1 ②)을 적는 자리', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('group', { name: '기간 요약' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '+ 결제 등록' }));
  expect(await view.findByRole('dialog', { name: '결제 등록' })).toBeTruthy();
});
