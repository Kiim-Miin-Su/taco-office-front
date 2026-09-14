/** @file-guide
 * 목적: LessonDetail.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonTracking, Occurrence, RosterResult } from '@/api/types';

const { mutate, permissions, tracking } = vi.hoisted(() => ({
  mutate: vi.fn(),
  permissions: { canEdit: true, canAdminPage: true },
  /** §79 는 명단 줄의 「교재 N · 안내 없음」과 오른쪽 트래킹 칸이 **같은 질의**를 읽는다 (C55) */
  tracking: { data: undefined as LessonTracking | undefined, isLoading: false, isError: false },
}));

vi.mock('@/api/queries', () => ({
  useScheduleWrite: () => ({ mutate, isPending: false }),
  useAttendanceWrite: () => ({ mutate: vi.fn(), isPending: false }),
  // §79 학생 트래킹은 창을 열 때만 도는 별도 질의다 — 이 파일은 명단 계약만 본다 (C55)
  useLessonTracking: () => tracking,
}));
vi.mock('@/store/useSession', () => ({
  useCan: (name: string) => name === 'canAdminPage' ? permissions.canAdminPage : permissions.canEdit,
}));

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
  repState: 'plan', ended: false,
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
  priced: true,
  unitPrice: 45000,
  total: 90000,
  tierHeads: 2,
  overrideCount: 0,
  needGuide: ['신규학생'],
  needBook: ['신규학생'],
};

describe('LessonDetail 명단 결과', () => {
  beforeEach(() => {
    mutate.mockReset();
    permissions.canEdit = true;
    permissions.canAdminPage = true;
  });

  it('없는 회차 오류에 시간/자원 충돌 해결 안내를 덧붙이지 않는다', () => {
    mutate.mockImplementationOnce((_write, options) => options.onError({ response: { data: { message: '해당 회차가 없습니다' } } }));
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '이 회차만 빼기' }));
    expect(view.getByText('해당 회차가 없습니다')).toBeTruthy();
    expect(view.queryByText(/시간이나 자원을 바꿔/)).toBeNull();
  });

  it('강사는 상세를 읽지만 휴강·취소 및 명단 변경 버튼은 보이지 않는다', () => {
    permissions.canEdit = false;
    permissions.canAdminPage = false;
    const view = render(<LessonDetail occ={{ ...occurrence, attendanceMode: 'readonly' }} onClose={() => undefined} />);
    expect(view.getByText('기존학생')).toBeTruthy();
    expect(view.queryByRole('button', { name: '휴강 · 취소' })).toBeNull();
    expect(view.queryByRole('button', { name: '이 회차만 빼기' })).toBeNull();
    expect(view.queryByRole('region', { name: '학생 트래킹' })).toBeNull();
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
    expect(view.getByText('명단을 반영했습니다 · 2/4명 · 1인 45,000원(2인 구간) · 수업당 90,000원')).toBeTruthy();
    expect(view.getByText('수업 안내가 필요합니다')).toBeTruthy();
    expect(view.getByText('교재 배부 확인이 필요합니다')).toBeTruthy();
  });
});

/**
 * §79 — 명단 줄의 「교재 N · 안내 없음」은 오른쪽 트래킹 칸과 **같은 값**에서 나온다 (C55).
 * 두 곳이 각자 세면 같은 학생이 왼쪽에서는 「교재 0」, 오른쪽에서는 「교재 1」이 된다.
 */
describe('§79 명단 줄의 교재 · 안내 칩', () => {
  beforeEach(() => { permissions.canEdit = true; tracking.data = undefined; });

  it('트래킹 값이 오기 전에는 칩을 그리지 않는다 — 0 을 지어내지 않는다', () => {
    const v = render(<LessonDetail occ={occurrence} onClose={() => {}} />);
    expect(v.queryByText(/^교재 \d+$/)).toBeNull();
    expect(v.queryByText('안내 없음')).toBeNull();
  });

  it('값이 오면 서버가 준 그대로 붙인다', () => {
    tracking.data = {
      serId: occurrence.serId, onDate: occurrence.onDate, cap: 4, count: 1, canAdd: 3,
      capLabel: '정원 4명 · 3명 더 넣을 수 있습니다',
      priced: false, unitPrice: null, total: null, canSeeAmounts: false,
      students: occurrence.students.map((s, i) => ({
        id: s.id, name: s.name, grade: s.grade ?? null, droppedOnce: s.droppedOnce,
        bookCount: i === 0 ? 2 : 0, progressAverage: null, progressKnownBooks: 0,
        guided: i === 0, attendDone: 0, attendTotal: 0,
        unpaid: null, reports: [],
      })),
    };
    const v = render(<LessonDetail occ={occurrence} onClose={() => {}} />);
    expect(v.getByText('교재 2')).toBeTruthy();
    expect(v.getByText('안내 됨')).toBeTruthy();
  });
});
