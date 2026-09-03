import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Occurrence, RosterResult } from '@/api/types';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('@/api/queries', () => ({
  useScheduleWrite: () => ({ mutate, isPending: false }),
}));
vi.mock('@/store/useSession', () => ({ useCan: () => true }));

import { LessonDetail } from './LessonDetail';

const occurrence: Occurrence = {
  serId: 3,
  date: '2026-09-03',
  onDate: '2026-09-03',
  startMin: 600,
  endMin: 660,
  kindKey: 'class',
  subKey: 'ap-chem',
  title: 'AP Chemistry',
  teacherId: 7,
  teacherName: '강사',
  roomId: 1,
  roomName: '강의실 1',
  zaccId: null,
  mode: 'offline',
  canceled: false,
  hasException: false,
  recurring: true,
  repState: 'plan',
  written: false,
  students: [{ id: 1, name: '기존학생', grade: '10', droppedOnce: false }],
};

const result: RosterResult = {
  effScope: 'this',
  log: ['학생 추가'],
  projected: 10,
  serIds: [3],
  count: 2,
  cap: 4,
  needGuide: ['신규학생'],
  needBook: ['신규학생'],
};

describe('LessonDetail 명단 결과', () => {
  it('명단 저장 응답의 인원·안내·교재 후속 작업을 추가 조회 없이 보여 준다', () => {
    mutate.mockImplementationOnce((_write, options) => options.onSuccess(result));
    const view = render(
      <LessonDetail
        occ={occurrence}
        allStudents={[{ id: 1, name: '기존학생' }, { id: 2, name: '신규학생' }]}
        onClose={() => undefined}
      />,
    );

    fireEvent.change(view.getByRole('combobox'), { target: { value: '2' } });
    fireEvent.click(view.getByRole('button', { name: '넣기' }));

    expect(mutate).toHaveBeenCalledWith(
      { kind: 'roster', serId: 3, body: { op: 'add', onDate: '2026-09-03', studentId: 2 } },
      expect.any(Object),
    );
    expect(view.getByText('명단을 반영했습니다 · 2/4명')).toBeTruthy();
    expect(view.getByText('수업 안내가 필요합니다')).toBeTruthy();
    expect(view.getByText('교재 배부 확인이 필요합니다')).toBeTruthy();
  });
});
