import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('@/api/queries', () => ({
  useAttendanceWrite: () => ({ mutate, isPending: false }),
}));

import { AttendanceControl } from './AttendanceControl';

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
  repState: 'none',
  written: false,
  attendanceMode: 'manage',
  attendance: null,
  students: [],
};

describe('AttendanceControl', () => {
  beforeEach(() => mutate.mockReset());

  it('취소 사유를 고르기 전 저장을 막고 생성 DTO 그대로 보낸다', () => {
    const view = render(<AttendanceControl occ={occurrence} />);
    fireEvent.click(view.getByRole('button', { name: '출결 확정' }));
    fireEvent.click(view.getByRole('button', { name: /^취소 시수/ }));
    expect((view.getByRole('button', { name: '취소로 확정' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(view.getByRole('button', { name: '학생 결석' }));
    fireEvent.click(view.getByRole('button', { name: '취소로 확정' }));

    expect(mutate).toHaveBeenCalledWith(
      {
        action: 'save', serId: 3, onDate: '2026-09-03',
        body: { result: 'canceled', reason: 'student_absent' },
      },
      expect.any(Object),
    );
  });

  it('강사 읽기 전용은 수정 버튼 없이 서버 현재값을 보여준다', () => {
    const view = render(
      <AttendanceControl
        occ={{
          ...occurrence,
          attendanceMode: 'readonly',
          attendance: {
            id: 9,
            result: 'completed',
            reason: null,
            confirmedBy: 5,
            confirmedByName: '이매니저',
            confirmedAt: '2026-09-03T03:00:00.000Z',
            countsForPay: true,
          },
        }}
      />,
    );
    expect(view.getByText('수업 완료로 확정되었습니다.')).toBeTruthy();
    expect(view.getByText('출결 변경은 관리자 이상만 할 수 있습니다.')).toBeTruthy();
    expect(view.queryByRole('button', { name: '출결 정정' })).toBeNull();
  });

  it('관리자는 현재값을 초기화하는 단일 명령을 보낸다', () => {
    const view = render(
      <AttendanceControl
        occ={{
          ...occurrence,
          attendance: {
            id: 9,
            result: 'canceled',
            reason: 'holiday',
            confirmedBy: 5,
            confirmedByName: '이매니저',
            confirmedAt: '2026-09-03T03:00:00.000Z',
            countsForPay: false,
          },
        }}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: '초기화' }));
    expect(mutate).toHaveBeenCalledWith(
      { action: 'clear', serId: 3, onDate: '2026-09-03' },
      expect.any(Object),
    );
  });
});
