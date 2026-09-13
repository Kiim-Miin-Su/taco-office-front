/** @file-guide
 * 목적: §57 그 밖의 수입 — 줄은 어휘이고 숫자는 서버 것이다 (C66).
 * 책임/재사용: 실제 OtherIncome 을 쓰고 props 로만 상태를 준다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { OtherIncome as OtherIncomeData } from '@/api/types';
import { OtherIncome } from './OtherIncome';

const base: OtherIncomeData = {
  canSeeAmounts: true,
  rows: [
    {
      key: 'consulting', label: '컨설팅비', sub: '진학 컨설팅 · 인터뷰 준비',
      count: 6, unbilled: 2, amount: 8_400_000, paid: 800_000,
      items: [
        {
          invId: 11, studentName: '고은성', title: '대입 컨설팅 · 연간 패키지',
          stateLabel: '전달', unbilled: false, issuedOn: '2026-08-01', dueOn: '2026-08-20',
          amount: 4_800_000, paid: 0,
        },
        {
          invId: 12, studentName: '이하린', title: '보딩스쿨 EC 컨설팅 · 정기',
          stateLabel: '작성 중', unbilled: true, issuedOn: null, dueOn: null,
          amount: 600_000, paid: 0,
        },
      ],
    },
    {
      key: 'diag_intake', label: '진단고사 + 상담 비용', sub: '진단고사 · 입학 상담',
      count: 4, unbilled: 0, amount: 210_000, paid: 90_000, items: [],
    },
    {
      key: 'exam_fee', label: 'MAP + CAT', sub: 'MAP · CAT 응시료',
      count: 7, unbilled: 5, amount: 210_000, paid: 90_000, items: [],
    },
  ],
};
const clone = (): OtherIncomeData => JSON.parse(JSON.stringify(base)) as OtherIncomeData;

afterEach(cleanup);

it('줄 셋의 제목과 부제는 **서버가 준 낱말**이다 — 화면이 코드값을 찍지 않는다 (D-R18)', () => {
  const v = render(<OtherIncome data={clone()} />);
  expect(v.getByText('컨설팅비')).toBeTruthy();
  expect(v.getByText('진단고사 + 상담 비용')).toBeTruthy();
  expect(v.getByText('MAP + CAT')).toBeTruthy();
  expect(v.getByText('MAP · CAT 응시료')).toBeTruthy();
  expect(v.queryByText('exam_fee')).toBeNull();
});

it('줄이 0건이어도 **사라지지 않는다** — 종류는 어휘이지 데이터가 아니다', () => {
  const d = clone();
  d.rows = d.rows.map((r) => ({ ...r, count: 0, unbilled: 0, amount: 0, paid: 0, items: [] }));
  const v = render(<OtherIncome data={d} />);
  expect(v.getByText('진단고사 + 상담 비용')).toBeTruthy();
  expect(v.getAllByText('0건')).toHaveLength(3);
});

it('건수·금액·받음은 서버 값 그대로다 — 화면이 items 를 다시 더하지 않는다 (D-R37)', () => {
  const d = clone();
  // 줄이 둘뿐인데 서버가 6건이라 했다면 그것이 맞다 — 안 보이는 건까지 센 값이다
  const v = render(<OtherIncome data={d} />);
  expect(v.getByText('6건')).toBeTruthy();
  expect(v.getByText('8,400,000원')).toBeTruthy();
  expect(v.getByText('받음 800,000원')).toBeTruthy();
});

it('「청구 안 함」은 0 이면 뱃지를 달지 않는다 — 아무 말도 하지 않는 뱃지를 세우지 않는다', () => {
  const v = render(<OtherIncome data={clone()} />);
  expect(v.getByText('청구 안 함 2')).toBeTruthy();
  expect(v.getByText('청구 안 함 5')).toBeTruthy();
  expect(v.queryByText('청구 안 함 0')).toBeNull();
});

it('「누르면 자세히 봅니다」 — 눌러야 줄이 열린다', () => {
  const v = render(<OtherIncome data={clone()} />);
  expect(v.queryByText('고은성')).toBeNull();
  fireEvent.click(v.getByRole('button', { name: /컨설팅비/ }));
  expect(v.getByText('고은성')).toBeTruthy();
  expect(v.getByText('대입 컨설팅 · 연간 패키지')).toBeTruthy();
  // 상태 낱말도 서버 것이다
  expect(v.getByText('전달')).toBeTruthy();
  expect(v.getByText('작성 중')).toBeTruthy();
});

it('펼친 줄이 비면 왜 비었는지 말한다 — 빈 칸으로 두지 않는다', () => {
  const v = render(<OtherIncome data={clone()} />);
  fireEvent.click(v.getByRole('button', { name: /진단고사/ }));
  expect(v.getByText(/이 종류로 낸 청구서가 아직 없습니다/)).toBeTruthy();
});

it('금액을 못 보면 배너로 알리고 **건수는 그대로 보인다** (D-R39)', () => {
  const d = clone();
  d.canSeeAmounts = false;
  d.rows = d.rows.map((r) => ({
    ...r, amount: null, paid: null,
    items: r.items.map((i) => ({ ...i, amount: null, paid: null })),
  }));
  const v = render(<OtherIncome data={d} />);
  expect(v.getByText(/금액은 대표만 봅니다/)).toBeTruthy();
  expect(v.getByText('6건')).toBeTruthy();
  expect(v.getByText('청구 안 함 2')).toBeTruthy();
  expect(v.queryByText('8,400,000원')).toBeNull();
});
