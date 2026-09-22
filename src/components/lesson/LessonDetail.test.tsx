/** @file-guide
 * 목적: LessonDetail.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, within } from '@testing-library/react';
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
  useStudentPause: () => ({ mutate: vi.fn(), isPending: false }),
  useWithdrawStudent: () => ({ mutate: vi.fn(), isPending: false }),
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
  extra: false,
  attendanceMode: 'manage',
  attendance: null,
  students: [{ id: 1, name: '기존학생', grade: '10', droppedOnce: false, paused: false }],
};

const result: RosterResult = {
  effScope: 'this', unavailable: [],
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

  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ])('GPA 관리 링크는 관리자 화면=%s·전체 수정=%s일 때 표시=%s다', (admin, edit, visible) => {
    permissions.canAdminPage = admin;
    permissions.canEdit = edit;
    const view = render(<LessonDetail occ={{ ...occurrence, kindKey: 'gpa' }} onClose={() => undefined} />);
    const link = view.queryByRole('link', { name: 'GPA 관리 보드 열기 →' });
    expect(Boolean(link)).toBe(visible);
    expect(Boolean(view.queryByText(/배정·잔여·회차 소비/))).toBe(visible);
    if (visible) expect(link?.getAttribute('href')).toBe('/gpa');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('일반 수업에는 GPA 관리 링크가 없다', () => {
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    expect(view.queryByRole('link', { name: 'GPA 관리 보드 열기 →' })).toBeNull();
  });

  it('GPA 상세를 연 채 관리자 권한을 잃으면 링크와 설명이 함께 사라진다', () => {
    const props = { occ: { ...occurrence, kindKey: 'gpa' as const }, onClose: () => undefined };
    const view = render(<LessonDetail {...props} />);
    expect(view.getByRole('link', { name: 'GPA 관리 보드 열기 →' })).toBeTruthy();
    permissions.canAdminPage = false;
    view.rerender(<LessonDetail {...props} />);
    expect(view.queryByRole('link', { name: 'GPA 관리 보드 열기 →' })).toBeNull();
    expect(view.queryByText(/배정·잔여·회차 소비/)).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  /** 휴강 창의 낱말은 서버 코드표다 — 이 파일은 그 표를 그대로 넘겨 계약만 본다 (C92 · D-R18) */
  const cancelMeta = {
    cancelReasons: [
      { key: 'student_absent' as const, label: '학생 결석', deductible: true },
      { key: 'academy' as const, label: '학원 사정', deductible: false },
    ],
    cancelTreats: [
      { key: 'carry' as const, label: '이월', sub: '다음 달로' },
      { key: 'deduct' as const, label: '차감', sub: '이번 달 소진' },
      { key: 'makeup' as const, label: '보강 이관', sub: '보강 회차' },
    ],
  };

  it('휴강 창을 연 채 권한을 잃으면 창도 사라진다', () => {
    const props = { occ: occurrence, onClose: () => undefined, ...cancelMeta };
    const view = render(<LessonDetail {...props} />);
    fireEvent.click(view.getByRole('button', { name: '휴강' }));
    expect(view.getByRole('dialog', { name: /^휴강 — / })).toBeTruthy();
    permissions.canEdit = false;
    view.rerender(<LessonDetail {...props} />);
    expect(view.queryByRole('dialog', { name: /^휴강 — / })).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('휴강은 사유·처리·메모를 이번 회차 계약으로 보낸다 — 처리 기본은 첫 줄(이월) (C-30)', () => {
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} {...cancelMeta} />);
    fireEvent.click(view.getByRole('button', { name: '휴강' }));
    const dialog = view.getByRole('dialog', { name: /^휴강 — / });
    // 사유를 고르기 전에는 보낼 수 없다
    const submit = within(dialog).getByRole('button', { name: '휴강' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('사유'), { target: { value: 'student_absent' } });
    fireEvent.change(within(dialog).getByLabelText('메모'), { target: { value: '  아침에 발열로 연락  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '휴강' }));
    expect(mutate).toHaveBeenCalledWith(
      {
        kind: 'delete', serId: 3,
        body: { scope: 'this', onDate: '2026-09-03', cancelKind: 'student_absent', cancelTreat: 'carry', memo: '아침에 발열로 연락' },
      },
      expect.any(Object),
    );
  });

  it('차감은 서버가 deductible 이라 한 사유에서만 고를 수 있다 — 학원 사정이면 잠기고 이월로 돌아간다 (C-31 · C-32)', () => {
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} {...cancelMeta} />);
    fireEvent.click(view.getByRole('button', { name: '휴강' }));
    const dialog = view.getByRole('dialog', { name: /^휴강 — / });
    const deduct = within(dialog).getByRole('radio', { name: /차감/ }) as HTMLInputElement;
    expect(deduct.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('사유'), { target: { value: 'student_absent' } });
    expect(deduct.disabled).toBe(false);
    fireEvent.click(deduct);
    expect(deduct.checked).toBe(true);
    // 사유를 학원 사정으로 바꾸면 차감이 다시 잠기고 처리는 이월로 돌아간다
    fireEvent.change(within(dialog).getByLabelText('사유'), { target: { value: 'academy' } });
    expect(deduct.disabled).toBe(true);
    expect((within(dialog).getByRole('radio', { name: /이월/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: '휴강' }));
    expect(mutate).toHaveBeenCalledWith(
      { kind: 'delete', serId: 3, body: { scope: 'this', onDate: '2026-09-03', cancelKind: 'academy', cancelTreat: 'carry', memo: undefined } },
      expect.any(Object),
    );
  });

  it('「그날 전체」를 켜면 날짜 하나로 day-cancel 을 보낸다 — 회차를 화면이 세지 않는다 (C-33)', () => {
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} {...cancelMeta} />);
    fireEvent.click(view.getByRole('button', { name: '휴강' }));
    const dialog = view.getByRole('dialog', { name: /^휴강 — / });
    fireEvent.change(within(dialog).getByLabelText('사유'), { target: { value: 'academy' } });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: '그날 전체 휴강' }));
    expect(mutate).toHaveBeenCalledWith(
      { kind: 'dayCancel', body: { date: '2026-09-03', cancelKind: 'academy', cancelTreat: 'carry', memo: undefined } },
      expect.any(Object),
    );
  });

  it('보강 이관은 날짜·시각을 받아 makeup 으로 보낸다 — 시각 기본은 원래 회차와 같은 길이 · 같은 날은 거절 · 그날 전체는 숨는다 (C-34)', () => {
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} {...cancelMeta} />);
    fireEvent.click(view.getByRole('button', { name: '휴강' }));
    const dialog = view.getByRole('dialog', { name: /^휴강 — / });
    fireEvent.change(within(dialog).getByLabelText('사유'), { target: { value: 'academy' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /보강 이관/ }));
    // 보강 칸이 열리고 그날 전체는 사라진다 — 회차마다 보강 날짜가 다르다
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    const submit = within(dialog).getByRole('button', { name: '휴강 · 보강 잡기' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // 날짜가 비었다
    expect((within(dialog).getByLabelText('시작') as HTMLInputElement).value).toBe('10:00');
    expect((within(dialog).getByLabelText('끝') as HTMLInputElement).value).toBe('11:00');
    // 같은 날은 안 된다 — 시각만 바꾸는 것은 이동이다
    fireEvent.change(within(dialog).getByLabelText('날짜'), { target: { value: '2026-09-03' } });
    expect(within(dialog).getByText(/같은 날이 아닙니다/)).toBeTruthy();
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('날짜'), { target: { value: '2026-09-05' } });
    fireEvent.change(within(dialog).getByLabelText('시작'), { target: { value: '16:00' } });
    fireEvent.change(within(dialog).getByLabelText('끝'), { target: { value: '17:00' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(mutate).toHaveBeenCalledWith(
      {
        kind: 'delete', serId: 3,
        body: {
          scope: 'this', onDate: '2026-09-03', cancelKind: 'academy', cancelTreat: 'makeup', memo: undefined,
          makeup: { date: '2026-09-05', startMin: 960, endMin: 1020 },
        },
      },
      expect.any(Object),
    );
  });

  it('보강 이관된 회차와 보강 회차는 서로를 가리키는 칩을 단다', () => {
    const view = render(
      <LessonDetail
        occ={{ ...occurrence, canceled: true, cancelKind: 'academy', cancelKindLabel: '학원 사정', cancelTreat: 'makeup', cancelTreatLabel: '보강 이관',
          makeupSerId: 9, makeupDate: '2026-09-05', makeupStartMin: 960 }}
        onClose={() => undefined} {...cancelMeta}
      />,
    );
    expect(view.getByText('휴강 · 학원 사정 · 보강 이관 → 2026-09-05 16:00')).toBeTruthy();
    view.unmount();
    const made = render(
      <LessonDetail occ={{ ...occurrence, serId: 9, date: '2026-09-05', onDate: '2026-09-05', recurring: false, makeupOfDate: '2026-09-03' }}
        recurring={false} onClose={() => undefined} {...cancelMeta} />,
    );
    expect(made.getByText('보강 · 2026-09-03 회차')).toBeTruthy();
  });

  it('강사 화면(관리자 아님)에는 「그날 전체」가 없다', () => {
    permissions.canAdminPage = false;
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} {...cancelMeta} />);
    fireEvent.click(view.getByRole('button', { name: '휴강' }));
    expect(within(view.getByRole('dialog', { name: /^휴강 — / })).queryByRole('checkbox')).toBeNull();
  });

  it('「반복 끝내기…」의 향후·모두는 사유 없이 기존 종료 계약이고, 「이번만」은 휴강 창으로 온다', () => {
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} {...cancelMeta} />);
    fireEvent.click(view.getByRole('button', { name: '반복 끝내기…' }));
    fireEvent.click(view.getByRole('button', { name: /이번만/ }));
    expect(mutate).not.toHaveBeenCalled();
    expect(within(view.getByRole('dialog', { name: /^휴강 — / })).getByLabelText('사유')).toBeTruthy();
    fireEvent.keyDown(view.getByRole('dialog', { name: /^휴강 — / }), { key: 'Escape' });
    fireEvent.click(view.getByRole('button', { name: '반복 끝내기…' }));
    fireEvent.click(view.getByRole('button', { name: /향후/ }));
    expect(mutate).toHaveBeenCalledWith(
      { kind: 'delete', serId: 3, body: { scope: 'future', onDate: '2026-09-03' } },
      expect.any(Object),
    );
  });

  it('이미 휴강인 회차는 서버 낱말로 사유·처리를 적고 휴강 단추는 없다', () => {
    const view = render(
      <LessonDetail
        occ={{ ...occurrence, canceled: true, cancelKind: 'student_absent', cancelKindLabel: '학생 결석', cancelTreat: 'deduct', cancelTreatLabel: '차감' }}
        onClose={() => undefined} {...cancelMeta}
      />,
    );
    expect(view.getByText('휴강 · 학생 결석 · 차감')).toBeTruthy();
    expect(view.queryByRole('button', { name: '휴강' })).toBeNull();
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
  prep: [
    { key: 'fixed', label: '일정 확정', done: true, detail: '26년 8월 21일 금요일 08:00-09:00' },
    { key: 'teacher', label: '강사 배정', done: true, detail: 'Sophia' },
  ],
  prepDone: 2,
  prepTotal: 2,
  prepRemainLabel: '다 됐습니다',
      priced: false, unitPrice: null, total: null, canSeeAmounts: false,
      students: occurrence.students.map((s, i) => ({
        id: s.id, name: s.name, grade: s.grade ?? null, droppedOnce: s.droppedOnce, paused: false, ended: false,
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

/**
 * §12 준비 줄은 **서버가 만든 것을 그대로 그린다** (C82-b).
 *
 * 전에는 이 화면이 `STEPS` 표를 들고 `doneOf()` 로 스스로 판정했고, 판정을 못 하는 세 줄은
 * 「현황판에서 판정」이라 적고 있었다. 화면이 다시 판정하면 현황판과 갈린다 (D-R39).
 */
describe('§12 준비 줄 (C82-b)', () => {
  beforeEach(() => { permissions.canEdit = true; tracking.data = undefined; tracking.isLoading = false; });

  it('준비 줄·머리 숫자·부제를 서버가 준 대로 그린다 — 화면이 다시 세지 않는다', () => {
    tracking.data = {
      serId: occurrence.serId, onDate: occurrence.onDate, cap: 4, count: 1, canAdd: 3,
      capLabel: '정원 4명 · 3명 더 넣을 수 있습니다',
      prep: [
        { key: 'directive', label: '대표 지시 할 일', done: true, detail: '1/1 끝남' },
        { key: 'fixed', label: '일정 확정', done: true, detail: '26년 8월 21일 금요일 08:00-09:00' },
        { key: 'book', label: '교재 배정', done: false, detail: '이담흔 없음' },
        { key: 'zoomNoti', label: '줌 안내', done: false, detail: '학부모 없음 · 강사 대기' },
      ],
      // 일부러 줄 수(4)와 다른 값을 준다 — 화면이 몰래 세고 있으면 여기서 드러난다
      prepDone: 6, prepTotal: 9, prepRemainLabel: '3가지 남았습니다',
      priced: false, unitPrice: null, total: null, canSeeAmounts: false,
      students: [],
    };
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('준비 6 / 9');
    expect(text).toContain('3가지 남았습니다');
    expect(text).toContain('대표 지시 할 일');
    expect(text).toContain('1/1 끝남');
    expect(text).toContain('학부모 없음 · 강사 대기');
    // 화면이 스스로 판정하던 자리의 흔적이 남아 있지 않다
    expect(text).not.toContain('현황판에서 판정');
  });

  it('준비를 아직 못 받았으면 줄을 지어내지 않는다', () => {
    tracking.data = undefined;
    tracking.isLoading = true;
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('준비를 읽는 중입니다');
    expect(text).not.toContain('일정 확정');
  });
});

describe('휴원 (C92-c · C-36)', () => {
  it('휴원 중인 학생은 명단에 남되 「휴원」 칩이 붙는다 — 그날 인원·청구에서 빠지는 것은 서버가 센다', () => {
    tracking.data = undefined;
    const paused = { ...occurrence, students: [{ id: 1, name: '기존학생', grade: '10', droppedOnce: false, paused: true }] };
    const view = render(<LessonDetail occ={paused} onClose={() => undefined} />);
    const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('수강 학생 0명');
    expect(text).toContain('· 휴원 1');
    expect(view.getByText('기존학생')).toBeTruthy();
    expect(view.getByText('휴원')).toBeTruthy();
  });
});
