/** @file-guide
 * 목적: §79 학생 트래킹 — 값과 낱말을 화면이 다시 만들지 않는다 (C55).
 * 책임/재사용: 실제 StudentTracking 을 쓰고 질의 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { LessonTracking } from '@/api/types';

const state: { data: LessonTracking | undefined; isLoading: boolean; isError: boolean } = {
  data: undefined, isLoading: false, isError: false,
};
const mutate = vi.fn();
const withdrawMutate = vi.fn();
const permissions: { canEdit: boolean; canMoney: boolean } = { canEdit: true, canMoney: false };
vi.mock('@/api/queries', () => ({
  useLessonTracking: () => state,
  useStudentPause: () => ({ mutate, isPending: false }),
  useWithdrawStudent: () => ({ mutate: withdrawMutate, isPending: false }),
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
  }],
};

const setup = (d: LessonTracking | undefined, o?: { isLoading?: boolean; isError?: boolean }) => {
  state.data = d; state.isLoading = o?.isLoading ?? false; state.isError = o?.isError ?? false;
  return render(<StudentTracking serId={3} onDate="2026-09-11" />);
};
afterEach(() => { cleanup(); mutate.mockReset(); withdrawMutate.mockReset(); permissions.canEdit = true; permissions.canMoney = false; });

it('머리줄 문장은 서버가 만든 것을 그대로 쓴다 — 화면이 정원 − 인원을 다시 하지 않는다', () => {
  const v = setup(base);
  expect(v.getByText('정원 4명 · 1명 더 넣을 수 있습니다')).toBeTruthy();
  expect(v.getByText('3명')).toBeTruthy();
});

it('「정시 / 지연」 낱말도 서버가 준 것이다 — 제출 시각을 화면에서 견주지 않는다', () => {
  const v = setup(base);
  expect(v.getByText('정시')).toBeTruthy();
  expect(v.getByText('지연')).toBeTruthy();
  expect(v.getByText('최신 리포트 2건')).toBeTruthy();
});

it('금액을 못 보는 사람에게는 단가도 미수도 「가려짐」이다 (D-R39)', () => {
  const v = setup({ ...base, canSeeAmounts: false, unitPrice: null, total: null,
    students: [{ ...base.students[0], unpaid: null }] });
  // 머리줄의 단가 칩과 학생 카드의 미수 칸 둘 다 가려진다
  expect(v.getByText('1인 가려짐 · 수업당 가려짐')).toBeTruthy();
  expect(v.getByText('가려짐')).toBeTruthy();
  expect(v.queryByText(/1,170,000/)).toBeNull();
});

it('미수 0원과 「가려짐」을 구분한다 — 0 을 감춤으로 읽지 않는다', () => {
  const v = setup({ ...base, students: [{ ...base.students[0], unpaid: 0 }] });
  expect(v.queryByText('가려짐')).toBeNull();
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

it('단가표가 없으면 가격 대신 그 사실을 적는다', () => {
  const v = setup({ ...base, priced: false, unitPrice: null, total: null });
  expect(v.getByText('단가표 미등록 — 가격은 표시하지 않습니다')).toBeTruthy();
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
