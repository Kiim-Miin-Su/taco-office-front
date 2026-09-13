/** @file-guide
 * 목적: §54 수업료 계산 — 화면이 계산하지 않는다 (C65).
 * 책임/재사용: 실제 TuitionTable 을 쓰고 props 로만 상태를 준다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Tuition } from '@/api/types';
import { TuitionTable } from './TuitionTable';

const base: Tuition = {
  month: '2026-08', today: '2026-08-21', daysPast: 21, daysLeft: 10,
  doneCount: 196, totalCount: 288, canceledCount: 5,
  doneAmount: 29_911_667, carryAmount: 870_000,
  canSeeAmounts: true,
  items: [
    {
      studentId: 1, name: '이하린', grade: 'G9',
      done: 8, total: 11, percent: 73, canceled: 2,
      unitPrice: 140_000, unitPriceOverride: true, priceCount: 1,
      carryable: false, carriedAt: null, carriedIn: 0,
      doneAmount: 1_365_000, carryAmount: 420_000,
      lines: [
        { subKey: 'sat-read', label: 'SAT Reading', count: 8, unitPrice: 140_000, amount: 1_120_000 },
      ],
    },
    {
      studentId: 2, name: '김태린', grade: 'G5',
      done: 13, total: 20, percent: 65, canceled: 0,
      unitPrice: 120_000, unitPriceOverride: false, priceCount: 1,
      carryable: false, carriedAt: null, carriedIn: 0,
      doneAmount: 2_220_000, carryAmount: 0,
      lines: [],
    },
  ],
};
const clone = (): Tuition => JSON.parse(JSON.stringify(base)) as Tuition;

afterEach(cleanup);

/** 컷의 상자는 **값이 위 · 이름이 아래**다 — 이름으로 찾아 바로 앞 형제를 읽는다 */
const headBox = (v: ReturnType<typeof render>, label: string) => {
  // 표의 열 머리에도 같은 낱말이 있다 — 상자 묶음 안에서만 찾는다
  const boxes = v.container.querySelector('.grid')!;
  const el = [...boxes.querySelectorAll('div')].find((d) => d.textContent === label)!;
  return el.previousElementSibling!.textContent ?? '';
};

it('머리 다섯 칸은 서버가 준 값 그대로다 — 화면이 줄을 더하지 않는다 (D-R37)', () => {
  const v = render(<TuitionTable data={clone()} />);
  expect(headBox(v, '한 수업')).toBe('196');
  expect(headBox(v, '이번 달 전체')).toBe('288');
  expect(headBox(v, '결강 · 휴강')).toBe('5');
  expect(headBox(v, '지금까지 금액')).toBe('29,911,667원');
  expect(headBox(v, '다음 달로 넘길 돈')).toBe('870,000원');
});

it('퍼센트도 서버가 준 값이다 — 화면이 done/total 을 다시 나누지 않는다', () => {
  const d = clone();
  // 서버가 이렇게 말했다면 그것이 맞다 — 화면이 8/11 을 다시 나누면 이 값이 안 보인다
  d.items[0].percent = 99;
  const v = render(<TuitionTable data={d} />);
  expect(v.getByText('99%')).toBeTruthy();
  expect(v.queryByText('73%')).toBeNull();
});

it('원문 표의 머리 한 줄을 서버 값으로 적는다 — 「오늘 08-21 기준 · 21일 지남 · 10일 남음」', () => {
  const v = render(<TuitionTable data={clone()} />);
  expect(v.getByText('8월 수업 진행')).toBeTruthy();
  expect(v.getByText('오늘 08-21 기준 · 21일 지남 · 10일 남음')).toBeTruthy();
});

it('「개별 단가」와 「일반」을 갈라 적는다 — 예외인지 한눈에 보여야 한다', () => {
  const v = render(<TuitionTable data={clone()} />);
  expect(v.getByText('개별 단가')).toBeTruthy();
  expect(v.getByText('일반')).toBeTruthy();
});

it('값이 둘이어도 **컷 그대로 대표 단가를 적는다** — 컷의 이하린 줄이 이미 그 모양이다', () => {
  const d = clone();
  d.items[0].priceCount = 2; // SAT 14만 + 모의 4.5만
  const v = render(<TuitionTable data={d} />);
  // 8 × 140,000 = 1,120,000 ≠ 1,365,000 인 줄을 원문이 그대로 보여 준다 — 정확한 줄은 「내역」에 있다
  expect(v.getByText('140,000원')).toBeTruthy();
  expect(v.getByText('개별 단가')).toBeTruthy();
});

it('칸 이름은 컷의 낱말이다 — 「시급」', () => {
  const v = render(<TuitionTable data={clone()} />);
  expect(v.getByText('시급')).toBeTruthy();
  expect(v.queryByText('단가')).toBeNull();
});

it('단가표에 그 과목이 없으면 「단가 없음」 — 0원으로 꾸미지 않는다', () => {
  const d = clone();
  d.items[1].priceCount = 0;
  d.items[1].unitPrice = 0;
  const v = render(<TuitionTable data={d} />);
  expect(v.getByText('단가 없음')).toBeTruthy();
});

it('결강이 없으면 「—」 · 있으면 붉게 센다 — 0 을 적지 않는다', () => {
  const v = render(<TuitionTable data={clone()} />);
  expect(v.getByText('2')).toBeTruthy();
  expect(v.getAllByText('—').length).toBeGreaterThan(0);
});

it('넘길 돈이 0 이면 「—」 — 0원으로 적지 않는다', () => {
  const v = render(<TuitionTable data={clone()} />);
  expect(v.getByText('420,000원')).toBeTruthy();
  expect(v.queryByText('0원')).toBeNull();
});

it('금액을 못 보면 배너로 알리고 「가려짐」을 적는다 — 0 으로 뭉개지 않는다 (D-R39)', () => {
  const d = clone();
  d.canSeeAmounts = false;
  d.doneAmount = null; d.carryAmount = null;
  d.items = d.items.map((r) => ({ ...r, unitPrice: null, doneAmount: null, carryAmount: null, lines: [] }));
  const v = render(<TuitionTable data={d} />);
  expect(v.getByText(/서버가 값을 내려보내지 않으므로/)).toBeTruthy();
  expect(v.getAllByText('가려짐').length).toBeGreaterThan(0);
});

it('「내역」은 청구서가 쓸 바로 그 줄을 보여 준다', () => {
  const v = render(<TuitionTable data={clone()} />);
  fireEvent.click(v.getAllByRole('button', { name: '내역' })[0]);
  expect(v.getByText('SAT Reading')).toBeTruthy();
  expect(v.getByText('8회 × 140,000원')).toBeTruthy();
  expect(v.getByText(/청구서 생성 시 이 계산 결과를 씁니다/)).toBeTruthy();
});

it('줄이 비면 왜 비었는지 말한다 — 「0원으로 꾸미지 않는다」', () => {
  const v = render(<TuitionTable data={clone()} />);
  fireEvent.click(v.getAllByRole('button', { name: '내역' })[1]);
  expect(v.getByText(/0원으로 꾸미지 않습니다/)).toBeTruthy();
});

it('막대의 보조 설명이 간 것·결강·남은 것을 갈라 말한다', () => {
  const v = render(<TuitionTable data={clone()} />);
  expect(v.getByLabelText('간 것 8회 · 결강 2회 · 남은 것 3회')).toBeTruthy();
});

it('막대의 길이와 밑에 적은 값이 **같은 분모**다 — 반쯤 찬 막대에 75% 라고 적지 않는다', () => {
  const d = clone();
  // 결강 2회를 분모에 섞으면 8/(8+2+1)… 로 막대만 짧아지고 숫자는 73% 로 남는다
  d.items[0].percent = 73;
  const v = render(<TuitionTable data={d} />);
  const bar = v.getByLabelText('간 것 8회 · 결강 2회 · 남은 것 3회');
  expect((bar.firstElementChild as HTMLElement).style.width).toBe('73%');
  expect(v.getByText('73%')).toBeTruthy();
  // 막대는 한 토막이다 — 결강은 제 칸에서 센다
  expect(bar.children.length).toBe(1);
});

/**
 * 대표 결정 2026-09-13 (N-39): 「이월 처리는 **수업이 결제 됐으나 정해진 시수가 채워지지 않은
 * 경우**」. 그 판정은 서버가 한다 — 화면이 「완납인가」를 다시 읽으면 **단추가 서는 줄과 서버가
 * 받아 주는 줄이 갈려** 「눌리는데 거절당하는 단추」가 된다.
 */
it('「이월 처리」는 **서버가 된다고 한 줄에만** 선다', () => {
  const d = clone();
  d.items[0].carryable = true;
  const v = render(<TuitionTable data={d} onCarry={() => {}} />);
  expect(v.getAllByRole('button', { name: '이월 처리' })).toHaveLength(1);
});

it('넘길 돈이 있어도 **서버가 아니라면** 단추가 서지 않는다 — 돈을 안 받았으면 넘길 것이 없다', () => {
  const d = clone();
  // 결강 2회 · 넘길 돈 420,000원이지만 청구서가 완납이 아니다
  d.items[0].carryable = false;
  const v = render(<TuitionTable data={d} onCarry={() => {}} />);
  expect(v.getByText('420,000원')).toBeTruthy();
  expect(v.queryByRole('button', { name: '이월 처리' })).toBeNull();
});

it('누르면 그 학생으로 알린다', () => {
  const d = clone();
  d.items[0].carryable = true;
  const asked: number[] = [];
  const v = render(<TuitionTable data={d} onCarry={(id) => asked.push(id)} />);
  fireEvent.click(v.getByRole('button', { name: '이월 처리' }));
  expect(asked).toEqual([1]);
});

it('이미 넘긴 달은 단추 대신 **넘긴 날**을 적는다 — 한 달은 한 번만 넘긴다', () => {
  const d = clone();
  d.items[0].carryable = false;
  d.items[0].carriedAt = '2026-09-01 10:20';
  const v = render(<TuitionTable data={d} onCarry={() => {}} />);
  expect(v.getByText('넘김 09-01')).toBeTruthy();
  expect(v.queryByRole('button', { name: '이월 처리' })).toBeNull();
});

it('지난달에서 **넘어온 돈**은 그 줄에 적는다 — 이 달이 받은 것이다', () => {
  const d = clone();
  d.items[1].carriedIn = 70_000;
  const v = render(<TuitionTable data={d} />);
  expect(v.getByText('이월 받음 70,000원')).toBeTruthy();
});
