import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';

const mocks = vi.hoisted(() => ({ occurrences: vi.fn(), write: vi.fn() }));
vi.mock('@/store/useSession', () => ({ useCan: () => true }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/cal/SessionEditor', () => ({ SessionEditor: () => null }));
vi.mock('@/components/cal/TeacherSchedule', () => ({ TeacherSchedule: () => null }));
vi.mock('@/components/lesson/LessonDetail', () => ({ LessonDetail: () => null }));
vi.mock('@/api/queries', () => ({
  useOccurrences: mocks.occurrences,
  useScheduleWrite: () => ({ mutate: mocks.write }),
  useHorizon: () => ({ data: { from: '2026-01-01', to: '2026-12-31' } }),
  useMeta: () => ({ data: {
    kinds: [{ key: 'class', name: '수업' }], subs: [], rooms: [],
    students: [{ id: 1, name: '선택 학생', grade: 'G10' }, { id: 2, name: '다른 학생' }],
    staff: [{ id: 11, name: '선택 강사' }, { id: 22, name: '다른 강사' }],
  } }),
}));

import SchedulePage from './page';

const items: Occurrence[] = [1, 2].map((id) => ({
  serId: id, date: '2026-09-01', onDate: '2026-09-01', startMin: 600 + id * 60,
  endMin: 660 + id * 60, kindKey: 'class', title: id === 1 ? '선택된 수업' : '다른 수업',
  teacherId: id * 11, mode: 'offline', canceled: false, hasException: false, recurring: false,
  repState: 'plan', written: false, attendanceMode: 'unavailable', attendance: null,
  students: [{ id, name: id === 1 ? '선택 학생' : '다른 학생', droppedOnce: false }],
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
  mocks.occurrences.mockReturnValue({ data: { items }, isLoading: false, isError: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe('관리자 날짜 선택의 일간 진입과 pane 보존', () => {
  it.each(['주간', '월간'])('%s 날짜 클릭은 해당 날짜 일간으로 전환한다', (viewName) => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: viewName }));
    fireEvent.click(view.getByRole('button', { name: '2026-09-02 (수) 날짜 선택' }));

    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-02', to: '2026-09-02' });
    expect(view.getByText('시각')).toBeTruthy();
    expect(view.queryByRole('button', { name: '2026-09-02 (수) 날짜 선택' })).toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('분할된 오른쪽 월간의 날짜 선택이 왼쪽 날짜·보기를 변경하지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '월간' }));
    fireEvent.click(view.getByRole('button', { name: '표 분할' }));
    const left = view.container.querySelector<HTMLElement>('[data-calendar-pane="0"]')!;
    const right = view.container.querySelector<HTMLElement>('[data-calendar-pane="1"]')!;
    fireEvent.pointerDown(right);
    fireEvent.click(within(right).getByRole('button', { name: '오른쪽 표 다음 기간' }));
    const leftBefore = left.innerHTML;
    fireEvent.click(within(right).getByRole('button', { name: '2026-10-05 (월) 날짜 선택' }));

    expect(left.innerHTML).toBe(leftBefore);
    expect(within(left).getByText('2026년 9월')).toBeTruthy();
    expect(within(left).getByRole('button', { name: '2026-09-01 (화) 날짜 선택' })).toBeTruthy();
    expect(within(right).getByText('10/5 (월)')).toBeTruthy();
    expect(within(right).getByText('시각')).toBeTruthy();
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-10-05' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([
    ['학생별', /^선택 학생/],
    ['선생님별', /^선택 강사/],
  ])('%s 날짜 클릭은 선택된 사람과 개인표를 유지한다', (viewName, personName) => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: viewName }));
    fireEvent.click(view.getByRole('button', { name: personName }));
    fireEvent.click(view.getByRole('button', { name: '2026-09-02 (수) 날짜 선택' }));

    expect(view.getByRole('button', { name: /선택된 수업/ })).toBeTruthy();
    expect(view.queryByRole('button', { name: /다른 수업/ })).toBeNull();
    expect(view.getByRole('button', { name: '2026-09-02 (수) 날짜 선택' })).toBeTruthy();
    expect(view.queryByText('시각')).toBeNull();
    expect(view.queryByText('사람을 고르세요')).toBeNull();
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-09-06' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
