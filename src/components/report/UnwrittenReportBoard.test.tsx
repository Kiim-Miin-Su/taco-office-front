/** @file-guide
 * 목적: §47 공용 보드의 강사 선택·같은 snapshot 필터·독촉 대상·일정 identity를 검증한다.
 * 책임/재사용: 서버 판정은 fixture로 받으며 컴포넌트가 새 집계를 만들지 않는지 확인한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Unwritten } from '@/api/types';
import { reportElapsedAgo, reportElapsedDays, UnwrittenReportBoard } from './UnwrittenReportBoard';

const data: Unwritten = {
  total: 3,
  penaltyTotal: 0,
  byTeacher: [
    { teacherId: 7, teacherName: 'Sophia', count: 2, oldestDate: '2026-08-01', over1h: 2, over4h: 1, penalty: 0 },
    { teacherId: 9, teacherName: 'KJ', count: 1, oldestDate: '2026-09-01', over1h: 1, over4h: 0, penalty: 0 },
  ],
  items: [
    { id: 1, serId: 101, date: '2026-08-02', onDate: '2026-08-01', startMin: 600, endMin: 660, subKey: 'vocab', kindKey: 'class', teacherId: 7, teacherName: 'Sophia', state: 'none', written: false, students: [{ id: 1, name: '이담흔', deliver: true }], minutesSinceEnd: 2880, penalty: 0 },
    { id: 2, serId: 102, date: '2026-08-03', onDate: '2026-08-03', startMin: 600, endMin: 660, subKey: 'gpa', kindKey: 'class', teacherId: 7, teacherName: 'Sophia', state: 'rej', written: true, students: [{ id: 2, name: '민제인', deliver: true }], minutesSinceEnd: 1440, penalty: 0 },
    { id: 3, serId: 103, date: '2026-09-02', onDate: '2026-09-01', startMin: 600, endMin: 660, subKey: 'vocab', kindKey: 'class', teacherId: 9, teacherName: 'KJ', state: 'none', written: false, students: [], minutesSinceEnd: 120, penalty: 0 },
  ],
};

const renderBoard = (onRemind = vi.fn()) => render(
  <UnwrittenReportBoard
    data={data}
    isLoading={false}
    isError={false}
    canRemind
    reminderPending={false}
    reminderMessage={null}
    subjectName={(key) => ({ vocab: 'Vocabulary', gpa: 'GPA 관리' })[key ?? ''] ?? '—'}
    onRemind={onRemind}
  />,
);

describe('UnwrittenReportBoard', () => {
  it('한 DTO에서 선택 강사의 미작성과 반려를 함께 보여 준다', () => {
    const view = renderBoard();
    expect(view.getByText('안 쓴 것 2건')).toBeTruthy();
    expect(view.getByText('미작성')).toBeTruthy();
    expect(view.getByText('반려')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: /KJ/ }));
    expect(view.getByText('안 쓴 것 1건')).toBeTruthy();
    expect(view.queryByText('이담흔')).toBeNull();
  });

  it('개별·전체 독촉은 선택 ID만 상위 mutation에 전달한다', () => {
    const onRemind = vi.fn();
    const view = renderBoard(onRemind);
    fireEvent.click(view.getByRole('button', { name: '독촉' }));
    fireEvent.click(view.getByRole('button', { name: '전부 독촉' }));
    expect(onRemind.mock.calls).toEqual([[7], []]);
  });

  it('일정 링크는 SER 원래 날짜와 실제 날짜를 모두 보존한다', () => {
    const view = renderBoard();
    expect(view.getAllByRole('link', { name: '일정' })[0].getAttribute('href'))
      .toBe('/schedule?serId=101&onDate=2026-08-01&date=2026-08-02');
  });

  it('경과 분은 표시만 일수로 바꾸며 음수는 오늘로 제한한다', () => {
    expect(reportElapsedDays(2880)).toBe('2일');
    expect(reportElapsedDays(-10)).toBe('오늘');
    expect(reportElapsedAgo(2880)).toBe('2일 전');
    expect(reportElapsedAgo(-10)).toBe('오늘');
  });
});
