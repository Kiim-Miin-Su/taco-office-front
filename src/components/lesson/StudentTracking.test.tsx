/** @file-guide
 * 목적: §79 학생 트래킹 — 값과 낱말을 화면이 다시 만들지 않는다 (C55).
 * 책임/재사용: 실제 StudentTracking 을 쓰고 질의 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { LessonTracking } from '@/api/types';
import { MASKED } from '@/lib/money';

const state: { data: LessonTracking | undefined; isLoading: boolean; isError: boolean } = {
  data: undefined, isLoading: false, isError: false,
};
const mutate = vi.fn();
const withdrawMutate = vi.fn();
const noteMutate = vi.fn();
const permissions: { canEdit: boolean; canMoney: boolean } = { canEdit: true, canMoney: false };
vi.mock('@/api/queries', () => ({
  useLessonTracking: () => state,
  useStudentPause: () => ({ mutate, isPending: false }),
  useWithdrawStudent: () => ({ mutate: withdrawMutate, isPending: false }),
  useAddTrackingNote: () => ({ mutate: noteMutate, isPending: false }),
}));
vi.mock('@/store/useSession', () => ({ useCan: (name: string) => (name === 'canMoney' ? permissions.canMoney : permissions.canEdit) }));

const { StudentTracking } = await import('./StudentTracking');

const base: LessonTracking = {
  serId: 3, onDate: '2026-09-11', cap: 4, count: 3, canAdd: 1,
  capLabel: '정원 4명 · 1명 더 넣을 수 있습니다',
  prep: [
    { key: 'fixed', label: '일정 확정', done: true, detail: '26년 8월 21일 금요일 08:00-09:00' },
    { key: 'teacher', label: '강사 배정', done: true, detail: 'Sophia' },
  ],
  prepDone: 2,
  prepTotal: 2,
  prepRemainLabel: '다 됐습니다',
  priced: true, unitPrice: 80000, total: 240000, canSeeAmounts: true,
  students: [{
    id: 18, name: '문채원', grade: '고3', droppedOnce: false, paused: false, ended: false,
    bookCount: 1, progressAverage: 25, progressKnownBooks: 1,
    guided: false, attendDone: 12, attendTotal: 13, unpaid: 1170000,
    reports: [
      { repId: 70, onDate: '2026-09-10', subjectName: 'SAT Math', teacherName: '박도윤',
        onTime: true, onTimeLabel: '정시', excerpt: '도함수 응용 6제', homework: 'p.162' },
      { repId: 63, onDate: '2026-09-03', subjectName: 'SAT Math', teacherName: '박도윤',
        onTime: false, onTimeLabel: '지연', excerpt: '극한', homework: null },
    ],
    notes: [], noteCount: 0,
  }],
};

const setup = (d: LessonTracking | undefined, o?: { isLoading?: boolean; isError?: boolean }) => {
  state.data = d; state.isLoading = o?.isLoading ?? false; state.isError = o?.isError ?? false;
  return render(<StudentTracking serId={3} onDate="2026-09-11" />);
};
afterEach(() => { cleanup(); mutate.mockReset(); withdrawMutate.mockReset(); noteMutate.mockReset(); permissions.canEdit = true; permissions.canMoney = false; });

it('정원 · 단가 칩 줄은 여기서 다시 그리지 않는다 — 원문 §79 는 명단 바로 위에 둔다 (LessonDetail 이 같은 질의로 그린다)', () => {
  const v = setup(base);
  expect(v.queryByText('정원 4명 · 1명 더 넣을 수 있습니다')).toBeNull();
  expect(v.queryByText('3명')).toBeNull();
  expect(v.queryByText(/수업당/)).toBeNull();
});

it('원문 §12 #10 · §79 #6 — 부제 「최신 리포트 · 교재 진도 · 변경」, 「정시」 초록 · 「지연」 호박 글자, 「시간표」 강조 테두리', () => {
  const v = setup(base);
  expect(v.getByText('최신 리포트 · 교재 진도 · 변경')).toBeTruthy();
  expect(v.getByText('정시').className).toContain('text-green');
  expect(v.getByRole('button', { name: '시간표' }).className).toContain('border-primary');
});

it('「정시 / 지연」 낱말도 서버가 준 것이다 — 제출 시각을 화면에서 견주지 않는다', () => {
  const v = setup(base);
  expect(v.getByText('정시')).toBeTruthy();
  expect(v.getByText('지연')).toBeTruthy();
  expect(v.getByText('최신 리포트 2건')).toBeTruthy();
});

it('금액을 못 보는 사람에게는 단가도 미수도 숨긴 금액 낱말(「비공개」)이다 (D-R39)', () => {
  const v = setup({ ...base, canSeeAmounts: false, unitPrice: null, total: null,
    students: [{ ...base.students[0], unpaid: null }] });
  // 학생 카드의 미수 칸이 가려진다 (단가 칩은 명단 머리로 옮겼다 — LessonDetail.test 가 본다)
  expect(v.getByText(MASKED)).toBeTruthy();
  expect(v.queryByText(/1,170,000/)).toBeNull();
});

it('미수 ₩0 과 숨긴 금액 낱말을 구분한다 — 0 을 감춤으로 읽지 않는다', () => {
  const v = setup({ ...base, students: [{ ...base.students[0], unpaid: 0 }] });
  expect(v.queryByText(MASKED)).toBeNull();
  expect(v.getByText('—')).toBeTruthy();
});

it('출결이 하나도 확정 안 됐으면 0/0 이 아니라 — 로 둔다', () => {
  const v = setup({ ...base, students: [{ ...base.students[0], attendDone: 0, attendTotal: 0 }] });
  expect(v.queryByText('0/0')).toBeNull();
});

it('진도 평균의 미확인 null과 실제 0%를 구분한다', () => {
  const unknown = setup({ ...base, students: [{ ...base.students[0], progressAverage: null, progressKnownBooks: 0 }] });
  expect(unknown.queryByText('0%')).toBeNull();
  cleanup();
  const zero = setup({ ...base, students: [{ ...base.students[0], progressAverage: 0, progressKnownBooks: 1 }] });
  expect(zero.getByText('0%')).toBeTruthy();
});

it('권한이 없으면 트래킹 칸을 비우고 이유를 적는다', () => {
  const v = setup(undefined, { isError: true });
  expect(v.getByText('학생 트래킹은 매니저 이상만 볼 수 있습니다.')).toBeTruthy();
});

it('쓴 리포트가 없으면 빈 상태를 보인다', () => {
  const v = setup({ ...base, students: [{ ...base.students[0], reports: [] }] });
  expect(v.getByText('쓴 리포트가 없습니다')).toBeTruthy();
});

/* ── 휴원 · 복귀 (C92-c · C-36 · C-37) ─────────────────────────────────── */

it('휴원 중인 학생은 「휴원」 칩과 기간 칩이 서고 「복귀」만 눌린다 — 판정은 서버의 paused·resumed 다', () => {
  const v = setup({ ...base, students: [{
    ...base.students[0], paused: true,
    pause: { id: 5, fromDate: '2026-09-01', toDate: '2026-09-30', reason: '가족 여행', resumed: false },
  }] });
  expect(v.getByText('휴원')).toBeTruthy();
  expect(v.getByText('휴원 9/1 ~ 9/30')).toBeTruthy();
  expect(v.getByRole('button', { name: '복귀' })).toBeTruthy();
  expect(v.queryByRole('button', { name: '휴원' })).toBeNull();
});

it('복귀 처리된 기간은 「복귀 처리됨」으로 남고 다시 「휴원」을 잡을 수 있다 — 기간은 이력이다', () => {
  const v = setup({ ...base, students: [{
    ...base.students[0], paused: true,
    pause: { id: 5, fromDate: '2026-09-01', toDate: '2026-09-14', reason: null, resumed: true },
  }] });
  expect(v.getByText('휴원 9/1 ~ 9/14 · 복귀 처리됨')).toBeTruthy();
  expect(v.getByRole('button', { name: '휴원' })).toBeTruthy();
  expect(v.queryByRole('button', { name: '복귀' })).toBeNull();
});

it('「휴원」 창은 열어 둔 회차 날짜를 시작일로 채우고 종료일·사유를 붙여 보낸다 — 종료일이 앞서면 못 보낸다', () => {
  const v = setup(base);
  fireEvent.click(v.getByRole('button', { name: '휴원' }));
  const dialog = v.getByRole('dialog', { name: /^휴원 — / });
  const from = within(dialog).getByLabelText('시작일') as HTMLInputElement;
  expect(from.value).toBe('2026-09-11');
  const to = within(dialog).getByLabelText('종료일');
  fireEvent.change(to, { target: { value: '2026-09-10' } });
  expect(within(dialog).getByText('종료일이 시작일보다 앞입니다')).toBeTruthy();
  expect((within(dialog).getByRole('button', { name: '휴원' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(to, { target: { value: '2026-09-30' } });
  fireEvent.change(within(dialog).getByLabelText('사유'), { target: { value: ' 가족 여행 ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '휴원' }));
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate.mock.calls[0][0]).toEqual({
    kind: 'pause', studentId: 18, body: { fromDate: '2026-09-11', toDate: '2026-09-30', reason: '가족 여행' },
  });
});

it('「복귀」 창은 복귀일 하나를 보내고 시작일 이전은 막는다 — 겹침·범위의 최종 판정은 서버다', () => {
  const v = setup({ ...base, students: [{
    ...base.students[0], paused: true,
    pause: { id: 5, fromDate: '2026-09-01', toDate: null, reason: null, resumed: false },
  }] });
  fireEvent.click(v.getByRole('button', { name: '복귀' }));
  const dialog = v.getByRole('dialog', { name: /^복귀 — / });
  expect(within(dialog).getByText('휴원 9/1 ~')).toBeTruthy();
  const on = within(dialog).getByLabelText('복귀일');
  fireEvent.change(on, { target: { value: '2026-09-01' } });
  expect((within(dialog).getByRole('button', { name: '복귀' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(on, { target: { value: '2026-09-15' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '복귀' }));
  expect(mutate.mock.calls[0][0]).toEqual({ kind: 'resume', studentId: 18, pauseId: 5, body: { resumeOn: '2026-09-15' } });
});

it('canCrudAll 이 없으면 「휴원」·「복귀」 단추가 서지 않는다 (D-R39)', () => {
  permissions.canEdit = false;
  const v = setup({ ...base, students: [{
    ...base.students[0], paused: true,
    pause: { id: 5, fromDate: '2026-09-01', toDate: null, reason: null, resumed: false },
  }] });
  expect(v.queryByRole('button', { name: '휴원' })).toBeNull();
  expect(v.queryByRole('button', { name: '복귀' })).toBeNull();
  expect(v.getByText('휴원 9/1 ~')).toBeTruthy();
});

/* ── 수강 종료 (C94-c · H-80 · N-136) ─────────────────────────────────── */

it('「수강 종료」는 회계 권한(canMoney)에만 선다 — 창은 회차 날짜를 마지막 수업일로 채우고 서버에 미리 본다', () => {
  permissions.canMoney = true;
  const v = setup(base);
  fireEvent.click(v.getByRole('button', { name: '수강 종료' }));
  const dialog = v.getByRole('dialog', { name: /^수강 종료 — / });
  expect((within(dialog).getByLabelText('마지막 수업일') as HTMLInputElement).value).toBe('2026-09-11');
  // 미리보기를 서버에 묻는다 — 「이 수업만」이 기본이라 serIds 가 든다
  expect(withdrawMutate).toHaveBeenCalledWith(
    { kind: 'preview', body: { studentId: 18, endedOn: '2026-09-11', serIds: [3] } }, expect.anything(),
  );
  // 미리보기가 오기 전에는 보낼 수 없다 — 값은 서버 것이다
  expect((within(dialog).getByRole('button', { name: '수강 종료' }) as HTMLButtonElement).disabled).toBe(true);
  cleanup();
  permissions.canMoney = false;
  const noMoney = setup(base);
  expect(noMoney.queryByRole('button', { name: '수강 종료' })).toBeNull();
});

it('종료 뒤 회차의 카드는 「종료 M/D」 칩으로 남고 휴원·복귀·종료 단추가 서지 않는다 — 판정은 서버의 ended·endedOn 이다', () => {
  permissions.canMoney = true;
  const v = setup({ ...base, students: [{ ...base.students[0]!, ended: true, endedOn: '2026-09-05' }] });
  expect(v.getByText('종료 9/5')).toBeTruthy();
  expect(v.queryByRole('button', { name: '수강 종료' })).toBeNull();
  expect(v.queryByRole('button', { name: '휴원' })).toBeNull();
  cleanup();
  // 아직 오지 않은 종료일은 「종료 예정」
  const soon = setup({ ...base, students: [{ ...base.students[0]!, ended: false, endedOn: '2026-09-30' }] });
  expect(soon.getByText('종료 예정 9/30')).toBeTruthy();
  expect(soon.queryByRole('button', { name: '수강 종료' })).toBeNull();
});

it('인수인계 메모 (N-36 ②) — 서버가 준 줄을 누가 · 언제와 함께 그대로 보이고, 한 줄 더하기는 학생 · 수업 · 글만 보낸다', () => {
  const notes = [
    { id: 2, body: '어머니가 9월 SAT 는 미루고 10월로 — 다음 강사는 모의고사부터', authorName: '김민선', createdAt: '2026-09-11T14:05:00+09:00' },
    { id: 1, body: '숙제는 카톡으로 사진 확인', authorName: null, createdAt: '2026-09-01T09:00:00+09:00' },
  ];
  const v = setup({ ...base, students: [{ ...base.students[0]!, notes, noteCount: 23 }] });
  const card = v.getByText('어머니가 9월 SAT 는 미루고 10월로 — 다음 강사는 모의고사부터').closest('li')!;
  expect(card.textContent).toContain('김민선 · 2026-09-11 14:05');
  expect(v.getByText('— · 2026-09-01 09:00')).toBeTruthy();
  // 줄 수는 서버가 센 것 — 실린 둘보다 많으면 「최근 N줄만」이라 적는다
  expect(v.getByText(/인수인계 메모 23줄/)).toBeTruthy();
  expect(v.getByText('최근 2줄만 보입니다 · 전체 23줄')).toBeTruthy();

  const input = v.getByLabelText('문채원 인수인계 메모') as HTMLInputElement;
  const send = v.getByRole('button', { name: '남기기' }) as HTMLButtonElement;
  // 빈 글은 보낼 수 없다 — 서버도 400(NOTE_EMPTY)이다
  expect(send.disabled).toBe(true);
  fireEvent.change(input, { target: { value: '  다음 수업은 20분 일찍  ' } });
  fireEvent.click(send);
  expect(noteMutate).toHaveBeenCalledWith({ studentId: 18, serId: 3, body: '다음 수업은 20분 일찍' }, expect.anything());
});

it('인수인계 메모 더하기 칸은 canCrudAll 에만 선다 — 읽기는 그대로 (D-R39)', () => {
  permissions.canEdit = false;
  const v = setup(base);
  expect(v.getByText('아직 남긴 인수인계 메모가 없습니다')).toBeTruthy();
  expect(v.queryByRole('button', { name: '남기기' })).toBeNull();
});
