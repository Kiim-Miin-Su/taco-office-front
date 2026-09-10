/** @file-guide
 * 목적: BoardViews.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardTeacherRow, BoardWeek, CheckMark } from '@/api/types';
import { BoardMarks, MonthBoard, WeekBoard } from './BoardViews';

const marks: CheckMark[] = [
  { key: 'book', done: true, na: false },
  { key: 'guide', done: false, na: false, note: '1건 덜 됨' },
  { key: 'zoom', done: false, na: true },
  { key: 'report', done: true, na: false },
];

describe('BoardViews', () => {
  it('해당 없음은 비활성 컨트롤이 아닌 정보이므로 공용 중립 글자색을 흐리지 않는다', () => {
    const view = render(<BoardMarks marks={marks} />);
    const badge = view.getByText('줌');
    expect(badge.classList.contains('text-fg-2')).toBe(true);
    expect(badge.classList.contains('border-line')).toBe(true);
    expect(badge.className).not.toMatch(/(?:^|\s)(?:\S+:)?opacity-/);
    expect(badge.style.opacity).toBe('');
  });

  it('주간 점 마크도 색에만 의존하지 않고 네 상태를 읽을 수 있다', () => {
    const view = render(<BoardMarks marks={marks} variant="dots" />);
    expect(view.getByRole('img').getAttribute('aria-label')).toBe(
      '교재 완료, 안내 미완료, 줌 해당 없음, 리포트 완료',
    );
  });

  it('주간 요일 칸은 날짜와 강사 id로 일간 드릴다운한다', () => {
    const onDay = vi.fn();
    const rows: BoardTeacherRow[] = [
      {
        teacherId: 7,
        teacherName: '김강사',
        missing: 1,
        days: [{ date: '2026-09-01', lessons: 2, marks, missing: 1 }],
      },
    ];
    const view = render(
      <WeekBoard rows={rows} days={['2026-09-01']} loading={false} onDay={onDay} />,
    );

    fireEvent.click(view.getByRole('button', { name: /김강사.*2개 수업/ }));
    expect(onDay).toHaveBeenCalledWith('2026-09-01', 7);
  });

  it('월간 주차는 같은 계약의 주간 화면으로 드릴다운한다', () => {
    const onWeek = vi.fn();
    const weeks: BoardWeek[] = [
      {
        from: '2026-08-31',
        to: '2026-09-06',
        label: '9월 1주',
        lessons: 3,
        marks: [
          { key: 'book', done: 2, total: 3, missing: 1 },
          { key: 'guide', done: 3, total: 3, missing: 0 },
          { key: 'zoom', done: 1, total: 1, missing: 0 },
          { key: 'report', done: 2, total: 3, missing: 1 },
        ],
        missing: 2,
      },
    ];
    const view = render(<MonthBoard weeks={weeks} loading={false} onWeek={onWeek} />);

    fireEvent.click(view.getByRole('button', { name: '9월 1주' }));
    expect(onWeek).toHaveBeenCalledWith('2026-08-31');
  });
});
