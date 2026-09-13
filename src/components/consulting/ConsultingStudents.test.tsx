/** @file-guide
 * 목적: §27 컨설팅 학생별 — 화면이 세지 않는다 (C59).
 * 책임/재사용: 실제 ConsultingStudents 를 쓰고 props 로만 상태를 준다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ConsStudent } from '@/api/types';
import { ConsultingStudents } from './ConsultingStudents';

/** 원문 컷과 같은 모양 — 고은성(G12) 1건 · 민제인(G10) 1건 */
const students: ConsStudent[] = [
  {
    studentId: 5, name: '고은성', grade: 'G12', caseCount: 1, amount: 800000, paid: 400000,
    cases: [{
      id: 1, consType: 'admissions', stage: 'running', stageLabel: '진행',
      createdOn: '2026-07-12', endOn: '2026-10-10', ownerName: '김범준',
      sessionsLogged: 2, sessions: 6, itemsDone: 4, itemsTotal: 7,
      amount: 800000, paid: 400000,
      items: [
        { id: 11, seq: 1, label: '지원서 작성', required: true, done: true, source: 'template', doneBy: '김범준', doneOn: '2026-08-01' },
        { id: 12, seq: 2, label: '추천서 2부', required: true, done: false, source: 'template', doneBy: null, doneOn: null },
      ],
    }],
  },
  {
    studentId: 6, name: '민제인', grade: 'G10', caseCount: 1, amount: 900000, paid: 0,
    cases: [{
      id: 2, consType: 'essay', stage: 'contract', stageLabel: '계약',
      createdOn: '2026-08-02', endOn: null, ownerName: null,
      sessionsLogged: 0, sessions: null, itemsDone: 0, itemsTotal: 0,
      amount: 900000, paid: 0, items: [],
    }],
  },
];
const clone = (): ConsStudent[] => JSON.parse(JSON.stringify(students)) as ConsStudent[];

afterEach(cleanup);

it('건수는 서버가 준 caseCount 다 — 배열 길이를 다시 세지 않는다 (D-R37)', () => {
  const d = clone();
  d[0].caseCount = 3; // 서버가 이렇게 말했다면 그것이 맞다(안 보이는 건은 이미 빠졌다)
  const v = render(<ConsultingStudents items={d} />);
  expect(v.getByText('3')).toBeTruthy();
});

it('회차·항목 숫자도 서버가 준 값 그대로다', () => {
  const v = render(<ConsultingStudents items={clone()} />);
  expect(v.getByText('2 / 6')).toBeTruthy();
  expect(v.getByText('4 / 7')).toBeTruthy();
});

it('약정 회차가 없으면 「—」 — 0 으로 적지 않는다', () => {
  const v = render(<ConsultingStudents items={clone()} />);
  fireEvent.click(v.getByRole('button', { name: /민제인/ }));
  expect(v.getByText('0 / —')).toBeTruthy();
});

it('끝낸 항목에 줄을 긋는다 — 원문 컷의 그어진 칩이 끝난 것이다', () => {
  const v = render(<ConsultingStudents items={clone()} />);
  expect(v.getByText('지원서 작성').className).toContain('line-through');
  expect(v.getByText('추천서 2부').className).not.toContain('line-through');
});

it('내용이 잠겨 항목 줄이 안 와도 숫자는 말해 준다 — 「항목이 없다」와 구분한다', () => {
  const d = clone();
  d[0].cases[0] = { ...d[0].cases[0], items: [] };
  const v = render(<ConsultingStudents items={d} />);
  expect(v.getByText('4 / 7')).toBeTruthy();
  expect(v.getByText(/공개 범위 밖입니다/)).toBeTruthy();
});

it('금액을 못 보면 「가려짐」 — 0 원으로 뭉개지 않는다 (D-R39)', () => {
  const d = clone().map((s) => ({
    ...s, amount: null, paid: null,
    cases: s.cases.map((c) => ({ ...c, amount: null, paid: null })),
  }));
  const v = render(<ConsultingStudents items={d} />);
  expect(v.getAllByText('가려짐').length).toBeGreaterThan(0);
  expect(v.queryByText('0원 / 0원')).toBeNull();
});

it('학생을 고르면 오른쪽이 그 학생으로 바뀐다 — 처음에는 첫 줄이다', () => {
  const v = render(<ConsultingStudents items={clone()} />);
  expect(v.getByRole('heading', { name: '고은성' })).toBeTruthy();
  fireEvent.click(v.getByRole('button', { name: /민제인/ }));
  expect(v.getByRole('heading', { name: '민제인' })).toBeTruthy();
});

it('고른 학생이 목록에서 사라지면 선택을 놓는다 — 빈 오른쪽 칸을 남기지 않는다', () => {
  const v = render(<ConsultingStudents items={clone()} />);
  fireEvent.click(v.getByRole('button', { name: /민제인/ }));
  expect(v.getByRole('heading', { name: '민제인' })).toBeTruthy();
  v.rerender(<ConsultingStudents items={[clone()[0]]} />);
  expect(v.getByRole('heading', { name: '고은성' })).toBeTruthy();
  expect(v.queryByRole('heading', { name: '민제인' })).toBeNull();
});

it('「열기」는 그 건의 id 를 올려보낸다', () => {
  const onOpen = vi.fn();
  const v = render(<ConsultingStudents items={clone()} onOpen={onOpen} />);
  fireEvent.click(v.getAllByRole('button', { name: '열기' })[0]);
  expect(onOpen).toHaveBeenCalledWith(1);
});

it('볼 수 있는 컨설팅이 없으면 그 말을 한다 — 빈 칸을 남기지 않는다', () => {
  const v = render(<ConsultingStudents items={[]} />);
  expect(v.getByText('볼 수 있는 컨설팅이 없습니다.')).toBeTruthy();
});
