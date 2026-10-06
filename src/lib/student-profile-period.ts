/** @file-guide
 * 목적: student-profile-period.ts — 학생 기간 입력의 정밀도·포함 경계·현재상태·겹침 Front preview.
 * 책임/재사용: Backend student-profile-period의 순수 의미를 화면 입력 전에 미리 보여 준다. 저장 권한·revision·DB 제약은 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

export type StudentPeriodPrecision = 'year' | 'month' | 'day';
export type StudentPeriodState = 'past' | 'current' | 'future';

export interface StudentPeriodInput {
  readonly from: string;
  readonly to: string | null;
  readonly fromPrecision: StudentPeriodPrecision;
  readonly toPrecision: StudentPeriodPrecision | null;
}

export interface StudentPeriod extends StudentPeriodInput {
  readonly fromDerived: boolean;
  readonly toDerived: boolean;
}

function invalid(reason: string): never {
  throw new RangeError(`STUDENT_PERIOD_INVALID: ${reason}`);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function monthEnd(month: string): string {
  for (const day of ['31', '30', '29', '28']) {
    const date = `${month}-${day}`;
    if (isIsoDate(date)) return date;
  }
  return invalid('실제 달력 월이 아닙니다');
}

function normalizeBoundary(value: string, precision: StudentPeriodPrecision, side: 'from' | 'to'): string {
  let date: string;
  if (precision === 'year') {
    if (!/^\d{4}$/.test(value)) return invalid('연 정밀도는 YYYY입니다');
    date = `${value}-${side === 'from' ? '01-01' : '12-31'}`;
  } else if (precision === 'month') {
    if (!/^\d{4}-\d{2}$/.test(value) || !isIsoDate(`${value}-01`)) return invalid('월 정밀도는 실제 YYYY-MM입니다');
    date = side === 'from' ? `${value}-01` : monthEnd(value);
  } else {
    date = value;
  }
  if (!isIsoDate(date)) return invalid('날짜는 0001~9999년의 실제 달력 날짜여야 합니다');
  return date;
}

/** 화면 preview도 원입력 정밀도를 보존한다. 계산 경계를 실제 입력 날짜로 바꾸지 않는다. */
export function normalizeStudentPeriod(input: StudentPeriodInput): StudentPeriod {
  const from = normalizeBoundary(input.from, input.fromPrecision, 'from');
  if (input.to === null && input.toPrecision !== null) return invalid('무기한 종료의 정밀도는 NULL이어야 합니다');
  const to = input.to === null ? null : normalizeBoundary(input.to, input.toPrecision ?? invalid('종료 정밀도가 필요합니다'), 'to');
  if (to !== null && to < from) return invalid('종료일은 시작일보다 앞설 수 없습니다');
  return { ...input, from, to, fromDerived: false, toDerived: false };
}

/** 양끝 포함 기간이다. 종료일과 다른 시작일이 같은 날이면 겹친다. */
export function studentPeriodsOverlap(left: StudentPeriod, right: StudentPeriod): boolean {
  return (left.to === null || right.from <= left.to) && (right.to === null || left.from <= right.to);
}

export function studentPeriodState(period: StudentPeriod, asOf: string): StudentPeriodState {
  if (!isIsoDate(asOf)) return invalid('asOf는 실제 ISO 날짜여야 합니다');
  if (period.from > asOf) return 'future';
  if (period.to !== null && period.to < asOf) return 'past';
  return 'current';
}

export const STUDENT_PERIOD_STATE_LABEL: Readonly<Record<StudentPeriodState, string>> = {
  past: '과거', current: '현재', future: '미래',
};
