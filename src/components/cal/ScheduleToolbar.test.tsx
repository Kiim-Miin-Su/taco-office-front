/** @file-guide
 * 목적: §07~§11 공용 도구줄의 필터 projection과 접근 가능한 입력 계약을 회귀 검증한다.
 * 책임/재사용: 실제 ScheduleToolbar/selector를 사용하며 화면 필터 규칙을 테스트에 다시 구현하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Meta, Occurrence } from '@/api/types';
import {
  filterScheduleOccurrences, INITIAL_SCHEDULE_FILTERS, ScheduleToolbar,
  type ScheduleFilters,
} from './ScheduleToolbar';

afterEach(cleanup);

const meta: Meta = {
  kinds: [{ key: 'class', name: '수업', color: '#123456', cap: 4, grp: 'lesson', rep: true }],
  subs: [{ key: 'writing', name: 'Writing', color: '#654321' }],
  rooms: [{ id: 7, name: '강의실 7', branch: '본원' }], zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [],
  students: [{ id: 3, name: '학생 3' }],
  staff: [
    { id: 11, name: '강사 11', role: 'teacher', canAdminPage: false, canGpaPack: false },
    { id: 12, name: '관리자 12', role: 'admin', canAdminPage: true, canGpaPack: true },
  ],
};

function occurrence(patch: Partial<Occurrence> = {}): Occurrence {
  return {
    serId: 1, date: '2026-09-14', onDate: '2026-09-14', startMin: 600, endMin: 660,
    kindKey: 'class', subKey: 'writing', teacherId: 11, roomId: 7, mode: 'offline',
    canceled: false, hasException: false, recurring: false, repState: 'plan', ended: false, written: false,
    attendanceMode: 'unavailable', attendance: null,
    students: [{ id: 3, name: '학생 3', droppedOnce: false }],
    ...patch,
  };
}

describe('filterScheduleOccurrences', () => {
  it('서버 회차를 방식·종류·과목·강사·학생·강의실 축으로만 교집합 투영한다', () => {
    const target = occurrence();
    const filters: ScheduleFilters = {
      ...INITIAL_SCHEDULE_FILTERS,
      mode: 'offline', kindKey: 'class', subKey: 'writing', teacherId: 11, studentId: 3, roomId: 7,
    };
    const misses = [
      occurrence({ serId: 2, mode: 'online' }),
      occurrence({ serId: 3, kindKey: 'meeting' }),
      occurrence({ serId: 4, subKey: 'math' }),
      occurrence({ serId: 5, teacherId: 99 }),
      occurrence({ serId: 6, students: [{ id: 4, name: '학생 4', droppedOnce: false }] }),
      occurrence({ serId: 7, roomId: 8 }),
    ];

    expect(filterScheduleOccurrences([target, ...misses], filters)).toEqual([target]);
  });

  it('그날만 제외된 학생은 학생 필터 결과에 포함하지 않고 서버 사실은 변경하지 않는다', () => {
    const dropped = occurrence({ students: [{ id: 3, name: '학생 3', droppedOnce: true }] });
    const filters = { ...INITIAL_SCHEDULE_FILTERS, studentId: 3 };

    expect(filterScheduleOccurrences([dropped], filters)).toEqual([]);
    expect(dropped.students[0].droppedOnce).toBe(true);
  });
});

it('공용 도구줄은 native 입력과 기존 버튼으로 모든 제어값을 상위 상태에 위임한다', () => {
  const onFiltersChange = vi.fn();
  const onViewChange = vi.fn();
  const onSplit = vi.fn();
  const onExport = vi.fn();
  const view = render(
    <ScheduleToolbar view="day" filters={INITIAL_SCHEDULE_FILTERS} meta={meta} splitOn={false}
      onViewChange={onViewChange} onFiltersChange={onFiltersChange} onSplit={onSplit} onExport={onExport} />,
  );

  fireEvent.click(view.getByRole('button', { name: '주간' }));
  expect(onViewChange).toHaveBeenCalledWith('week');

  const teacher = view.getByRole('combobox', { name: '강사 필터' });
  expect(teacher.tagName).toBe('SELECT');
  expect(view.getByRole('option', { name: '관리자 12' })).toBeTruthy();
  fireEvent.change(view.getByRole('combobox', { name: '수업 종류 필터' }), { target: { value: 'class' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, kindKey: 'class' });
  fireEvent.change(view.getByRole('combobox', { name: '과목 필터' }), { target: { value: 'writing' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, subKey: 'writing' });
  fireEvent.change(teacher, { target: { value: '11' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, teacherId: 11 });
  fireEvent.change(view.getByRole('combobox', { name: '학생 필터' }), { target: { value: '3' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, studentId: 3 });
  fireEvent.change(view.getByRole('combobox', { name: '강의실 필터' }), { target: { value: '7' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, roomId: 7 });

  fireEvent.click(view.getByRole('button', { name: '온라인' }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, mode: 'online' });
  fireEvent.click(view.getByRole('button', { name: '촘촘' }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, density: 'compact' });

  fireEvent.click(view.getByRole('button', { name: '세로로 나누기' }));
  fireEvent.click(view.getByRole('button', { name: '현재 스케줄을 PNG로 저장' }));
  expect(onSplit).toHaveBeenCalledOnce();
  expect(onExport).toHaveBeenCalledOnce();
});
