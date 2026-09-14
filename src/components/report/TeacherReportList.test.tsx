/** @file-guide
 * 목적: 강사 리포트 목록의 모바일 카드·웹 표가 같은 행과 선택 동작을 공유하는지 검증한다.
 * 책임/재사용: CSS breakpoint 자체가 아니라 두 표현의 데이터·액션 동등성을 확인한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReportRow } from '@/api/types';
import { TeacherReportList } from './TeacherReportList';

const row: ReportRow = {
  id: 1, serId: 11, date: '2026-09-14', onDate: '2026-09-14', startMin: 600, endMin: 660,
  subKey: 'writing', kindKey: 'class', teacherId: 7, teacherName: '김재훈', state: 'none', written: false,
  students: [{ id: 1, name: '학생A', deliver: true }], minutesSinceEnd: 30, penalty: 0,
};

it('모바일 카드와 웹 표가 같은 리포트를 열고 같은 상태를 표시한다', () => {
  const onOpen = vi.fn();
  const view = render(<TeacherReportList rows={[row]} subjectName={() => 'Writing'} onOpen={onOpen} />);
  expect(view.getAllByText('Writing')).toHaveLength(2);
  expect(view.getAllByText('미작성')).toHaveLength(2);
  fireEvent.click(view.getAllByRole('button', { name: /Writing/ })[0]);
  expect(onOpen).toHaveBeenCalledWith(row);
  const desktopAction = view.getByRole('button', { name: 'Writing 리포트 상세 열기' });
  expect(desktopAction.tagName).toBe('BUTTON');
  fireEvent.click(desktopAction);
  expect(onOpen).toHaveBeenCalledTimes(2);
});
