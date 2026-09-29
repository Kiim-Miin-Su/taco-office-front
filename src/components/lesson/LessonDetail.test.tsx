/** @file-guide
 * 목적: LessonDetail.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonTracking, Meta, Occurrence, RosterResult } from '@/api/types';
import { ApiError } from '@/api/client';

const { mutate, permissions, tracking } = vi.hoisted(() => ({
  mutate: vi.fn(),
  permissions: { canEdit: true, canAdminPage: true },
  /** §79 는 명단 줄의 「교재 N · 안내 없음」과 오른쪽 트래킹 칸이 **같은 질의**를 읽는다 (C55) */
  tracking: { data: undefined as LessonTracking | undefined, isLoading: false, isError: false },
}));

vi.mock('@/api/queries', () => ({
  useScheduleWrite: () => ({ mutate, isPending: false }),
  // 「일정 수정」 창이 409 뒤 한 번 묻는 겹침 설명 — 이 파일은 계약만 본다
  fetchConflicts: vi.fn(async () => []),
  fetchConflictPreview: vi.fn(async () => ({ conflicts: [], freeLine: null })),
  useAttendanceWrite: () => ({ mutate: vi.fn(), isPending: false }),
  // §79 학생 트래킹은 창을 열 때만 도는 별도 질의다 — 이 파일은 명단 계약만 본다 (C55)
  useLessonTracking: () => tracking,
  useStudentPause: () => ({ mutate: vi.fn(), isPending: false }),
  useWithdrawStudent: () => ({ mutate: vi.fn(), isPending: false }),
  // §79 학생 카드의 인수인계 메모 더하기(N-36 ②) — 이 파일은 명단 계약만 본다
  useAddTrackingNote: () => ({ mutate: vi.fn(), isPending: false }),
  // 바닥 「+ 할 일」(W11 · N-71) — 서랍과 같은 쓰기. 이 파일은 명단 계약만 본다
  useDrawerWrite: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/store/useSession', () => ({
  useCan: (name: string) => name === 'canAdminPage' ? permissions.canAdminPage : permissions.canEdit,
  useSession: (pick: (s: { me: null }) => unknown) => pick({ me: null }),
}));

import { LessonDetail } from './LessonDetail';
import { MASKED } from '@/lib/money';

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
  students: [{ id: 1, name: '기존학생', grade: '10', droppedOnce: false, paused: false, late: false }],
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
  studentOverlaps: [],
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
    expect(view.queryByRole('button', { name: '휴강 · 수정' })).toBeNull();
    expect(view.queryByRole('button', { name: '이 회차만 빼기' })).toBeNull();
    expect(view.queryByRole('region', { name: '학생 트래킹' })).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('회차 학생의 서버 지각 현재값을 명단 배지로 표시한다', () => {
    const view = render(<LessonDetail occ={{
      ...occurrence,
      students: [{ ...occurrence.students[0], late: true }],
    }} onClose={() => undefined} />);
    const badge = view.getByText('지각');
    expect(badge.getAttribute('title')).toContain('출석은 유지');
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
      { key: 'student_absent' as const, label: '학생 결석', deductible: true, parentNotice: false },
      { key: 'academy' as const, label: '학원 사정', deductible: false, parentNotice: true },
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
    fireEvent.click(view.getByRole('button', { name: '휴강 · 수정' }));
    expect(view.getByRole('dialog', { name: /^휴강 — / })).toBeTruthy();
    permissions.canEdit = false;
    view.rerender(<LessonDetail {...props} />);
    expect(view.queryByRole('dialog', { name: /^휴강 — / })).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('휴강은 사유·처리·메모를 이번 회차 계약으로 보낸다 — 처리 기본은 첫 줄(이월) (C-30)', () => {
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} {...cancelMeta} />);
    fireEvent.click(view.getByRole('button', { name: '휴강 · 수정' }));
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
    fireEvent.click(view.getByRole('button', { name: '휴강 · 수정' }));
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
    fireEvent.click(view.getByRole('button', { name: '휴강 · 수정' }));
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
    fireEvent.click(view.getByRole('button', { name: '휴강 · 수정' }));
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
    fireEvent.click(view.getByRole('button', { name: '휴강 · 수정' }));
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
    expect(view.queryByRole('button', { name: '휴강 · 수정' })).toBeNull();
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

    // 원문 §79 — 후보 칩을 한 번 눌러 넣는다 (고르고 「넣기」 두 단계가 아니다). 쓰기 길은 그대로다
    fireEvent.click(view.getByRole('button', { name: '신규학생 넣기' }));

    expect(mutate).toHaveBeenCalledWith(
      { kind: 'roster', serId: 3, body: { op: 'add', onDate: '2026-09-03', studentId: 2 } },
      expect.any(Object),
    );
    expect(view.getByText('명단을 반영했습니다 · 2/4명 · 1인 ₩45,000(2인 구간) · 수업당 ₩90,000')).toBeTruthy();
    expect(view.getByText('수업 안내가 필요합니다')).toBeTruthy();
    expect(view.getByText('교재 배부 확인이 필요합니다')).toBeTruthy();
  });

  it('학생 넣기는 이름으로 찾아 후보를 좁히고, 이미 명단에 있는 학생은 후보에 없다 (§79)', async () => {
    const view = render(
      <LessonDetail
        occ={occurrence}
        allStudents={[{ id: 1, name: '기존학생' }, { id: 2, name: '강라율', grade: 'G7' }, { id: 4, name: '고은설', grade: 'G8' }]}
        onClose={() => undefined}
      />,
    );
    const search = view.getByRole('searchbox', { name: '넣을 학생 이름으로 찾기' });
    expect(search.getAttribute('placeholder')).toBe('이름으로 찾기 · 전체 2명');
    expect(view.queryByRole('button', { name: '기존학생 넣기' })).toBeNull();
    expect(view.getByRole('button', { name: '강라율 넣기' }).textContent).toContain('G7');
    // select 와 「넣기」 두 단계 입력은 없다
    expect(view.queryByRole('combobox')).toBeNull();

    fireEvent.change(search, { target: { value: '고은' } });
    await waitFor(() => expect(view.queryByRole('button', { name: '강라율 넣기' })).toBeNull());
    fireEvent.click(view.getByRole('button', { name: '고은설 넣기' }));
    expect(mutate).toHaveBeenCalledWith(
      { kind: 'roster', serId: 3, body: { op: 'add', onDate: '2026-09-03', studentId: 4 } },
      expect.any(Object),
    );

    fireEvent.change(search, { target: { value: '없는이름' } });
    expect(await view.findByText('「없는이름」에 맞는 학생이 없습니다')).toBeTruthy();
  });

  it('B-20 정원 초과는 서버 409 뒤 확인 창을 열고, 확인한 요청에만 confirmOverCapacity를 보낸다', () => {
    mutate
      .mockImplementationOnce((_write, options) => options.onError(new ApiError(
        'ROSTER_CAP_CONFIRM_REQUIRED', '정원 4명이 찼습니다. 그래도 넣을까요?', 409,
      )))
      .mockImplementationOnce((_write, options) => options.onSuccess(result));
    const view = render(
      <LessonDetail occ={occurrence} allStudents={[{ id: 1, name: '기존학생' }, { id: 2, name: '신규학생' }]}
        onClose={() => undefined} />,
    );

    fireEvent.click(view.getByRole('button', { name: '신규학생 넣기' }));
    expect(mutate).toHaveBeenNthCalledWith(1,
      { kind: 'roster', serId: 3, body: { op: 'add', onDate: '2026-09-03', studentId: 2 } },
      expect.any(Object));
    const dialog = view.getByRole('dialog', { name: '정원 초과 확인' });
    expect(within(dialog).getByText('정원 4명이 찼습니다. 그래도 넣을까요?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '그래도 넣기' }));
    expect(mutate).toHaveBeenNthCalledWith(2,
      { kind: 'roster', serId: 3, body: { op: 'add', onDate: '2026-09-03', studentId: 2, confirmOverCapacity: true } },
      expect.any(Object));
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
        unpaid: null, reports: [], notes: [], noteCount: 0,
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

/**
 * §12 바닥 주 단추 「일정 수정」 — 이미 있는 `PATCH /schedule/{id}` 를 새 일정 창의 편집 모드와
 * 반복 범위 창으로 잇는다. 쓰기 길은 `useScheduleWrite` 의 patch 하나뿐이다.
 */
describe('§12 일정 수정', () => {
  const editMeta = {
    staff: [{ id: 7, name: '강사' }, { id: 8, name: '다른 강사' }],
    rooms: [{ id: 1, name: '강의실 1' }, { id: 2, name: '강의실 2' }],
  } as unknown as Meta;

  beforeEach(() => {
    mutate.mockReset();
    permissions.canEdit = true;
    permissions.canAdminPage = true;
    tracking.data = undefined;
  });

  it('관리 권한이 있고 휴강이 아닌 회차에만 서며, 누르면 지금 값으로 채운 편집 창이 열린다', () => {
    const view = render(<LessonDetail occ={occurrence} meta={editMeta} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '일정 수정' }));
    const dialog = view.getByRole('dialog', { name: /^일정 수정 — AP Chemistry · 2026-09-03/ });
    expect((within(dialog).getByLabelText('시작') as HTMLInputElement).value).toBe('10:00');
    expect((within(dialog).getByLabelText('강사') as HTMLSelectElement).value).toBe('7');
    view.unmount();

    const canceled = render(<LessonDetail occ={{ ...occurrence, canceled: true }} meta={editMeta} onClose={() => undefined} />);
    expect(canceled.queryByRole('button', { name: '일정 수정' })).toBeNull();
    canceled.unmount();

    // 코드표를 안 넘기는 화면에서는 세우지 않는다 — 강사·강의실 목록 없이 여는 편집 창은 반쪽이다
    const noMeta = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    expect(noMeta.queryByRole('button', { name: '일정 수정' })).toBeNull();
    noMeta.unmount();

    permissions.canEdit = false;
    const teacher = render(<LessonDetail occ={occurrence} meta={editMeta} onClose={() => undefined} />);
    expect(teacher.queryByRole('button', { name: '일정 수정' })).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('편집 창을 연 채 권한을 잃으면 창도 사라진다', () => {
    const props = { occ: occurrence, meta: editMeta, onClose: () => undefined };
    const view = render(<LessonDetail {...props} />);
    fireEvent.click(view.getByRole('button', { name: '일정 수정' }));
    expect(view.getByRole('dialog', { name: /^일정 수정/ })).toBeTruthy();
    permissions.canEdit = false;
    view.rerender(<LessonDetail {...props} />);
    expect(view.queryByRole('dialog', { name: /^일정 수정/ })).toBeNull();
  });

  it('반복 수업은 범위를 고른 뒤 patch 하나로 보내고, 성공하면 결과를 「일정 수정」으로 넘긴 채 창을 닫는다', async () => {
    const written = { effScope: 'this', log: [], projected: 1, serIds: [3], unavailable: [], undoToken: 'u9' };
    mutate.mockImplementationOnce((_write, options) => options.onSuccess(written));
    const onWritten = vi.fn();
    const view = render(<LessonDetail occ={occurrence} meta={editMeta} onWritten={onWritten} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '일정 수정' }));
    const dialog = view.getByRole('dialog', { name: /^일정 수정/ });
    fireEvent.change(within(dialog).getByLabelText('끝'), { target: { value: '11:30' } });
    fireEvent.change(within(dialog).getByLabelText('강의실'), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    const onlyThis = await view.findByRole('button', { name: /이번만/ });
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(onlyThis);

    expect(mutate).toHaveBeenCalledWith(
      // 시각은 짝으로 간다 — 끝만 보내면 「향후·모두」에서 시작이 규칙값으로 읽혀 길이가 바뀐다
      { kind: 'patch', serId: 3, body: { startMin: 600, endMin: 690, roomId: 2, scope: 'this', onDate: '2026-09-03' } },
      expect.any(Object),
    );
    expect(onWritten).toHaveBeenCalledWith(written, '일정 수정');
    expect(view.queryByRole('dialog', { name: /^일정 수정/ })).toBeNull();
  });
});

describe('휴원 (C92-c · C-36)', () => {
  it('휴원 중인 학생은 명단에 남되 「휴원」 칩이 붙는다 — 그날 인원·청구에서 빠지는 것은 서버가 센다', () => {
    tracking.data = undefined;
    const paused = { ...occurrence, students: [{ id: 1, name: '기존학생', grade: '10', droppedOnce: false, paused: true, late: false }] };
    const view = render(<LessonDetail occ={paused} onClose={() => undefined} />);
    const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('수강 학생 0명');
    expect(text).toContain('· 휴원 1');
    expect(view.getByText('기존학생')).toBeTruthy();
    expect(view.getByText('휴원')).toBeTruthy();
  });
});

/**
 * 원문 §12·§79 — 화면 가운데 **큰 창 두 칸**(왼쪽 준비 · 오른쪽 학생 트래킹) + 바닥 단추 줄.
 * 서랍(오른쪽 520px 한 칸)에 세로로 쌓던 것을 공용 `WideDialog` 로 옮겼다. 낱말·판정은 그대로 서버 것이다.
 */
describe('§12·§79 큰 창 두 칸', () => {
  const trackingOf = (over: Partial<LessonTracking> = {}): LessonTracking => ({
    serId: occurrence.serId, onDate: occurrence.onDate, cap: 4, count: 1, canAdd: 3,
    capLabel: '정원 4명 · 3명 더 넣을 수 있습니다',
    prep: [
      { key: 'directive', label: '대표 지시 할 일', done: true, detail: '1/1 끝남' },
      { key: 'fixed', label: '일정 확정', done: true, detail: '26년 9월 3일 목요일 10:00-11:00' },
      { key: 'teacher', label: '강사 배정', done: true, detail: '강사' },
      { key: 'roster', label: '수강 학생', done: true, detail: '1명 / 정원 4명 · 기존학생' },
      { key: 'book', label: '교재 배정', done: false, detail: '기존학생 없음' },
      { key: 'feedback', label: '강사 피드백', done: false, detail: '아직 없습니다' },
    ],
    prepDone: 4, prepTotal: 6, prepRemainLabel: '2가지 남았습니다',
    priced: true, unitPrice: 45000, total: 45000, canSeeAmounts: true,
    students: [],
    ...over,
  });
  const editMeta = {
    staff: [{ id: 7, name: '강사' }], rooms: [{ id: 1, name: '강의실 1' }], zaccs: [],
  } as unknown as Meta;

  beforeEach(() => {
    mutate.mockReset();
    permissions.canEdit = true;
    permissions.canAdminPage = true;
    tracking.data = undefined;
    tracking.isLoading = false;
  });

  it('제목 · 종류 칩 · 긴 날짜 한 줄 머리, 오른쪽 학생 트래킹, 바닥 「닫기 · 휴강 · 수정 · 일정 수정」', () => {
    tracking.data = trackingOf();
    const view = render(<LessonDetail occ={occurrence} kindName="수업" meta={editMeta} onClose={() => undefined} />);
    const dialog = view.getByRole('dialog', { name: 'AP Chemistry' });
    // 서랍(aside)이 아니라 가운데 창이다
    expect(view.container.ownerDocument.querySelector('aside')).toBeNull();
    const text = (dialog.textContent ?? '').replace(/\s+/g, ' ');
    // 원문 「26년 8월 21일 금요일 16:00 – 17:30 · 1.5시간 · 현장 1호 · 양찬욱, …」 모양
    expect(text).toContain('26년 9월 3일 목요일 10:00 – 11:00 · 1시간 · 현장 강의실 1 · 기존학생');
    expect(within(dialog).getByText('수업')).toBeTruthy();
    expect(within(dialog).getByRole('region', { name: '학생 트래킹' })).toBeTruthy();
    // 머리 × 와 바닥 「닫기」 — 원문 컷에 둘 다 있다
    expect(within(dialog).getAllByRole('button', { name: '닫기' })).toHaveLength(2);
    expect(within(dialog).getByRole('button', { name: '휴강 · 수정' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '일정 수정' })).toBeTruthy();
  });

  it('B-20 확인 뒤 초과 인원은 서버 문장을 danger 칩으로 표시한다', () => {
    tracking.data = trackingOf({ count: 5, cap: 4, canAdd: 0, capLabel: '정원 4명 · 1명 넘었습니다' });
    const view = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    expect(view.getByText('정원 4명 · 1명 넘었습니다').className).toContain('text-red');
  });

  it('길이가 한 시간이 아니면 「1.5시간」처럼 적고, 강사 화면(준비 없음)은 머리에 강사를 적는다', () => {
    permissions.canAdminPage = false;
    permissions.canEdit = false;
    const view = render(<LessonDetail occ={{ ...occurrence, endMin: 690 }} onClose={() => undefined} />);
    const text = (view.getByRole('dialog', { name: 'AP Chemistry' }).textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('10:00 – 11:30 · 1.5시간 · 현장 강의실 1 · 강사 · 기존학생');
    // 준비를 못 읽어도 명단은 따로 선다
    expect(view.getByRole('region', { name: '수강 학생' })).toBeTruthy();
  });

  it('원문 §79 — 「수강 학생」 준비 줄이 ▼ 로 펼쳐지고 그 안에 정원·단가 칩과 명단이 선다', () => {
    tracking.data = trackingOf();
    const view = render(<LessonDetail occ={occurrence} kindName="수업" onClose={() => undefined} />);
    const row = view.getByRole('button', { name: /^수강 학생/ });
    expect(row.getAttribute('aria-expanded')).toBe('true');
    // 칩 줄은 명단 머리에 있다 — 오른쪽 트래킹 칸에는 없다 (같은 질의 · 한 곳에만 그린다)
    const panel = row.parentElement as HTMLElement;
    expect(within(panel).getByText('정원 4명 · 3명 더 넣을 수 있습니다')).toBeTruthy();
    expect(within(panel).getByText('1인 ₩45,000 · 수업당 ₩45,000')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: '이 회차만 빼기' })).toBeTruthy();
    const track = view.getByRole('region', { name: '학생 트래킹' });
    expect(within(track).queryByText(/정원 4명/)).toBeNull();
    // 준비 줄 안에 섰으니 따로 서는 명단 칸은 없다 — 명단은 한 벌이다
    expect(view.queryByRole('region', { name: '수강 학생' })).toBeNull();

    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(view.queryByRole('button', { name: '이 회차만 빼기' })).toBeNull();
    fireEvent.click(row);
    expect(view.getByRole('button', { name: '이 회차만 빼기' })).toBeTruthy();
  });

  it('금액을 못 보면 단가 칩이 숨긴 금액 낱말(「비공개」)이고, 단가표가 없으면 그 사실을 적는다 (D-R39)', () => {
    tracking.data = trackingOf({ canSeeAmounts: false, unitPrice: null, total: null });
    const hidden = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    expect(hidden.getByText(`1인 ${MASKED} · 수업당 ${MASKED}`)).toBeTruthy();
    hidden.unmount();
    tracking.data = trackingOf({ priced: false, unitPrice: null, total: null });
    const none = render(<LessonDetail occ={occurrence} onClose={() => undefined} />);
    expect(none.getByText('단가표 미등록 — 가격은 표시하지 않습니다')).toBeTruthy();
  });

  it('원문 §12 준비 줄 ▶ — 교재는 /books, 피드백은 그 리포트, 시간·강사 줄은 같은 창의 「일정 수정」, 지시 줄은 누르지 않는다', () => {
    tracking.data = trackingOf();
    const view = render(<LessonDetail occ={occurrence} kindName="수업" meta={editMeta} onClose={() => undefined} />);
    expect(view.getByRole('link', { name: /^교재 배정/ }).getAttribute('href')).toBe('/books');
    expect(view.getByRole('link', { name: /^강사 피드백/ }).getAttribute('href')).toBe('/reports?serId=3&onDate=2026-09-03');
    expect(view.queryByRole('link', { name: /^대표 지시/ })).toBeNull();
    expect(view.queryByRole('button', { name: /^대표 지시/ })).toBeNull();
    // 완료 줄은 초록, 미완 줄은 분홍 — 원문 §12 의 줄 톤
    expect(view.getByRole('link', { name: /^교재 배정/ }).className).toContain('bg-red/');
    expect(view.getByRole('button', { name: /^강사 배정/ }).className).toContain('bg-green/');
    fireEvent.click(view.getByRole('button', { name: /^강사 배정/ }));
    expect(view.getByRole('dialog', { name: /^일정 수정 — AP Chemistry/ })).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('휴강 회차 · 코드표 없는 화면에서는 시간·강사 줄도 편집 창을 열지 않는다 — 바닥 「일정 수정」과 같은 판정', () => {
    tracking.data = trackingOf();
    const view = render(<LessonDetail occ={{ ...occurrence, canceled: true }} meta={editMeta} onClose={() => undefined} />);
    expect(view.queryByRole('button', { name: /^강사 배정/ })).toBeNull();
    expect(view.queryByRole('button', { name: '일정 수정' })).toBeNull();
  });
});

/**
 * W11 — 회차 방식 전환(N-56) · 회차 메모(N-57) · 명단 넣기 학생 겹침 알림(N-58) · 출결 취소 ≠ 휴강(N-48).
 * 저장은 전부 기존 `useScheduleWrite` 의 patch · roster 하나다. 판정 · 문장은 서버 것이다.
 */
describe('W11 수업 상세 — 방식 · 메모 · 겹침 알림 · 출결 안내', () => {
  const meta = {
    staff: [{ id: 7, name: '강사' }], rooms: [{ id: 1, name: '강의실 1' }], zaccs: [{ id: 5, label: 'TN Zoom 1' }],
    kinds: [], cancelReasons: [], cancelTreats: [],
  } as unknown as Meta;

  beforeEach(() => {
    mutate.mockReset();
    permissions.canEdit = true;
    permissions.canAdminPage = true;
    tracking.data = undefined;
  });

  it('방식 토글은 그 방식이 골라진 「일정 수정」 창을 연다 — 온라인이면 강의실은 보내지 않고 고른 줌 계정만 싣는다', async () => {
    const written = {
      effScope: 'this', projected: 1, serIds: [3], unavailable: [], studentOverlaps: [], undoToken: 'u1',
      log: ['2026-09-03 회차만 바꿨습니다', '온라인 수업으로 바꿨습니다', '강의실을 비웠습니다', '줌 계정을 배정했습니다'],
    };
    mutate.mockImplementationOnce((_write, options) => options.onSuccess(written));
    const onWritten = vi.fn();
    const view = render(<LessonDetail occ={occurrence} meta={meta} onWritten={onWritten} onClose={() => undefined} />);
    const toggle = within(view.getByRole('group', { name: '이 회차 수업 방식' }));
    expect(toggle.getByRole('button', { name: '현장' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle.getByRole('button', { name: '온라인' }));

    const dialog = view.getByRole('dialog', { name: /^일정 수정/ });
    expect(within(within(dialog).getByRole('group', { name: '수업 방식' })).getByRole('button', { name: '온라인' })
      .getAttribute('aria-pressed')).toBe('true');
    expect((within(dialog).getByLabelText('강의실') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('줌 계정'), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    fireEvent.click(await view.findByRole('button', { name: /이번만/ }));

    expect(mutate).toHaveBeenCalledWith(
      { kind: 'patch', serId: 3, body: { mode: 'online', zaccId: 5, scope: 'this', onDate: '2026-09-03' } },
      expect.any(Object),
    );
    // 함께 바뀐 것은 서버 문장 그대로 부르는 쪽에 넘긴다
    expect(onWritten).toHaveBeenCalledWith(written, '방식 전환', written.log);
  });

  it('회차 메모는 그 회차 줄로 보이고, 메모만 고치면 범위를 묻지 않고 「이번만」으로 보낸다 (N-57)', async () => {
    const written = { effScope: 'this', log: ['회차 메모를 적었습니다'], projected: 1, serIds: [3], unavailable: [], studentOverlaps: [] };
    mutate.mockImplementationOnce((_write, options) => options.onSuccess(written));
    const onWritten = vi.fn();
    const withMemo = { ...occurrence, memo: '모의고사 오답 리뷰 우선' };
    const view = render(<LessonDetail occ={withMemo} meta={meta} onWritten={onWritten} onClose={() => undefined} />);
    expect(view.container.querySelector('[data-occ-memo]')!.textContent).toContain('모의고사 오답 리뷰 우선');

    fireEvent.click(view.getByRole('button', { name: '일정 수정' }));
    const dialog = view.getByRole('dialog', { name: /^일정 수정/ });
    const memo = within(dialog).getByLabelText('회차 메모 (이번 회차만)') as HTMLInputElement;
    expect(memo.value).toBe('모의고사 오답 리뷰 우선');
    expect(memo.maxLength).toBe(200);
    fireEvent.change(memo, { target: { value: '  숙제 먼저  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

    // 반복 수업이어도 범위 창이 뜨지 않는다 — 메모는 그 회차 하나의 것이다
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      { kind: 'patch', serId: 3, body: { memo: '숙제 먼저', scope: 'this', onDate: '2026-09-03' } },
      expect.any(Object),
    ));
    expect(view.queryByRole('button', { name: /이번만/ })).toBeNull();
    expect(onWritten).toHaveBeenCalledWith(written, '회차 메모');
  });

  it('메모를 비우면 지운다(null) — 빈 글을 저장하지 않는다', async () => {
    const withMemo = { ...occurrence, memo: '지울 메모' };
    const view = render(<LessonDetail occ={withMemo} meta={meta} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '일정 수정' }));
    const dialog = view.getByRole('dialog', { name: /^일정 수정/ });
    fireEvent.change(within(dialog).getByLabelText('회차 메모 (이번 회차만)'), { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      { kind: 'patch', serId: 3, body: { memo: null, scope: 'this', onDate: '2026-09-03' } },
      expect.any(Object),
    ));
  });

  it('명단에 넣은 학생이 같은 시각 다른 수업에도 있으면 막지 않고 알린다 — role=status (N-58)', () => {
    mutate.mockImplementationOnce((_write, options) => options.onSuccess({
      ...result, needGuide: [], needBook: [],
      studentOverlaps: [{
        serId: 3, date: '2026-09-03', studentId: 2, studentName: '신규학생', otherSerId: 9,
        otherTitle: 'SAT Math', otherStartMin: 630, otherEndMin: 720,
      }],
    }));
    const view = render(
      <LessonDetail occ={occurrence} allStudents={[{ id: 2, name: '신규학생' }]} onClose={() => undefined} />,
    );
    fireEvent.click(view.getByRole('button', { name: '신규학생 넣기' }));
    const warn = view.container.querySelector('[data-student-overlaps]') as HTMLElement;
    expect(warn.getAttribute('role')).toBe('status');
    expect(warn.textContent).toContain('신규학생 · 9/3 (목) 10:30–12:00 SAT Math');
    expect(view.queryByRole('alert')).toBeNull();
  });

  it('출결에서 「취소」를 고르면 「청구는 휴강 창에서」와 휴강 창 여는 단추가 선다 — 출결은 청구를 바꾸지 않는다 (N-48)', () => {
    const ended = { ...occurrence, attendanceMode: 'manage' as const };
    const view = render(
      <LessonDetail occ={ended} meta={meta} cancelReasons={cancelReasonsW11} cancelTreats={cancelTreatsW11} onClose={() => undefined} />,
    );
    fireEvent.click(view.getByRole('button', { name: '출결 확정' }));
    const dialog = within(view.getByRole('dialog', { name: '출결 확정' }));
    expect(dialog.queryByText('청구는 휴강 창에서')).toBeNull();
    fireEvent.click(dialog.getByRole('button', { name: /^취소/ }));
    expect(dialog.getByText('청구는 휴강 창에서')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: '휴강 창 열기' }));
    expect(view.getByRole('dialog', { name: /^휴강 — / })).toBeTruthy();
    expect(view.queryByRole('dialog', { name: '출결 확정' })).toBeNull();
    // 이 화면은 휴강을 쓰지 않는다 — 여는 것까지다
    expect(mutate).not.toHaveBeenCalled();
  });

  it('휴강을 쓸 수 없으면 안내 줄만 서고 여는 단추는 없다', () => {
    permissions.canEdit = false;
    const ended = { ...occurrence, attendanceMode: 'manage' as const };
    const view = render(<LessonDetail occ={ended} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '출결 확정' }));
    const dialog = within(view.getByRole('dialog', { name: '출결 확정' }));
    fireEvent.click(dialog.getByRole('button', { name: /^취소/ }));
    expect(dialog.getByText('청구는 휴강 창에서')).toBeTruthy();
    expect(dialog.queryByRole('button', { name: '휴강 창 열기' })).toBeNull();
  });
});

const cancelReasonsW11 = [{ key: 'student_absent' as const, label: '학생 결석', deductible: true, parentNotice: false }];
const cancelTreatsW11 = [{ key: 'carry' as const, label: '이월', sub: '다음 달로' }];
