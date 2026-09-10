/** @file-guide
 * 목적: LessonDetail.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence, RosterResult } from '@/api/types';

const { mutate, permissions } = vi.hoisted(() => ({ mutate: vi.fn(), permissions: { canEdit: true } }));

vi.mock('@/api/queries', () => ({
  useScheduleWrite: () => ({ mutate, isPending: false }),
  useAttendanceWrite: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/store/useSession', () => ({ useCan: () => permissions.canEdit }));

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
  attendanceMode: 'manage',
  attendance: null,
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
  beforeEach(() => { mutate.mockReset(); permissions.canEdit = true; });

  it('없는 회차 오류에 시간/자원 충돌 해결 안내를 덧붙이지 않는다', () => {
    mutate.mockImplementationOnce((_write, options) => options.onError({ response: { data: { message: '해당 회차가 없습니다' } } }));
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '이 회차만 빼기' }));
    expect(view.getByText('해당 회차가 없습니다')).toBeTruthy();
    expect(view.queryByText(/시간이나 자원을 바꿔/)).toBeNull();
  });

  it('강사는 상세를 읽지만 휴강·취소 및 명단 변경 버튼은 보이지 않는다', () => {
    permissions.canEdit = false;
    const view = render(<LessonDetail occ={{ ...occurrence, attendanceMode: 'readonly' }} onClose={() => undefined} />);
    expect(view.getByText('기존학생')).toBeTruthy();
    expect(view.queryByRole('button', { name: '휴강 · 취소' })).toBeNull();
    expect(view.queryByRole('button', { name: '이 회차만 빼기' })).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('휴강 범위 선택 중 권한을 잃으면 열린 쓰기 대화상자도 사라진다', () => {
    const props = { occ: occurrence, onClose: () => undefined };
    const view = render(<LessonDetail {...props} />);
    fireEvent.click(view.getByRole('button', { name: '휴강 · 취소' }));
    expect(view.getByRole('button', { name: /이번만/ })).toBeTruthy();
    permissions.canEdit = false;
    view.rerender(<LessonDetail {...props} />);
    expect(view.queryByRole('button', { name: /이번만/ })).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('매니저는 기존 휴강 범위 계약으로 저장할 수 있다', () => {
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '휴강 · 취소' }));
    fireEvent.click(view.getByRole('button', { name: /이번만/ }));
    expect(mutate).toHaveBeenCalledWith(
      { kind: 'delete', serId: 3, body: { scope: 'this', onDate: '2026-09-03' } },
      expect.any(Object),
    );
  });

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
