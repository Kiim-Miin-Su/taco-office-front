/** @file-guide
 * 목적: student-profile-period.test.ts — 학생 기간 정밀도·현재상태·겹침 Front preview 회귀.
 * 책임/재사용: Backend 공용 규칙과 같은 입력/경계 fixture를 검증하며 테스트 안에 계산 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeStudentPeriod, studentPeriodState, studentPeriodsOverlap,
} from './student-profile-period';

describe('BO-03C-02 학생 기간 Front preview', () => {
  it.each([
    [{ from: '2020', fromPrecision: 'year', to: '2021', toPrecision: 'year' }, '2020-01-01', '2021-12-31'],
    [{ from: '2020-02', fromPrecision: 'month', to: '2020-02', toPrecision: 'month' }, '2020-02-01', '2020-02-29'],
    [{ from: '2020-02-03', fromPrecision: 'day', to: null, toPrecision: null }, '2020-02-03', null],
  ] as const)('원래 정밀도를 보존하면서 포함 경계를 계산한다', (input, from, to) => {
    expect(normalizeStudentPeriod(input)).toEqual({
      ...input, from, to, fromDerived: false, toDerived: false,
    });
  });

  it('종료가 시작보다 앞서면 거절한다', () => {
    expect(() => normalizeStudentPeriod({
      from: '2026-10', fromPrecision: 'month', to: '2026-09', toPrecision: 'month',
    })).toThrow('종료일은 시작일보다 앞설 수 없습니다');
  });

  it('현재·과거·미래를 KST 기준일에 대해 구분한다', () => {
    expect(studentPeriodState(normalizeStudentPeriod({
      from: '2025', fromPrecision: 'year', to: '2025', toPrecision: 'year',
    }), '2026-10-06')).toBe('past');
    expect(studentPeriodState(normalizeStudentPeriod({
      from: '2026-10', fromPrecision: 'month', to: null, toPrecision: null,
    }), '2026-10-06')).toBe('current');
    expect(studentPeriodState(normalizeStudentPeriod({
      from: '2027', fromPrecision: 'year', to: null, toPrecision: null,
    }), '2026-10-06')).toBe('future');
  });

  it('포함 경계이므로 2020~2021과 2021~2023을 겹침으로 표시한다', () => {
    const left = normalizeStudentPeriod({ from: '2020', fromPrecision: 'year', to: '2021', toPrecision: 'year' });
    const right = normalizeStudentPeriod({ from: '2021', fromPrecision: 'year', to: '2023', toPrecision: 'year' });
    expect(studentPeriodsOverlap(left, right)).toBe(true);
  });
});
