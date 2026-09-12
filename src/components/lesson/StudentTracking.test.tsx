/** @file-guide
 * 목적: §79 학생 트래킹 — 값과 낱말을 화면이 다시 만들지 않는다 (C55).
 * 책임/재사용: 실제 StudentTracking 을 쓰고 질의 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { LessonTracking } from '@/api/types';

const state: { data: LessonTracking | undefined; isLoading: boolean; isError: boolean } = {
  data: undefined, isLoading: false, isError: false,
};
vi.mock('@/api/queries', () => ({ useLessonTracking: () => state }));

const { StudentTracking } = await import('./StudentTracking');

const base: LessonTracking = {
  serId: 3, onDate: '2026-09-11', cap: 4, count: 3, canAdd: 1,
  capLabel: '정원 4명 · 1명 더 넣을 수 있습니다',
  priced: true, unitPrice: 80000, total: 240000, canSeeAmounts: true,
  students: [{
    id: 18, name: '문채원', grade: '고3', droppedOnce: false,
    bookCount: 1, guided: false, attendDone: 12, attendTotal: 13, unpaid: 1170000,
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
afterEach(() => { cleanup(); });

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
