/** @file-guide
 * 목적: student-registration-route.test.ts — BOC-03b 공용 등록 route가 허용된 source와 숫자 lead ID만 URL에 싣는지 검증한다. (test)
 * 책임/재사용: 제품 helper를 직접 검증하며 이름·연락처 등 PII query를 허용하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import { parseStudentRegistrationContext, studentRegistrationHref } from './student-registration-route';

describe('BOC-03b 학생 등록 공용 route', () => {
  it('허용된 source와 양의 정수 lead ID만 직렬화한다', () => {
    expect(studentRegistrationHref('students')).toBe('/students/new?source=students');
    expect(studentRegistrationHref('schedule')).toBe('/students/new?source=schedule');
    expect(studentRegistrationHref('intake', 18)).toBe('/students/new?source=intake&lead=18');
    expect(studentRegistrationHref('intake', -1)).toBe('/students/new?source=intake');
  });

  it('알 수 없는 source와 잘못된 lead는 기본 학생 경로로 좁힌다', () => {
    expect(parseStudentRegistrationContext(new URLSearchParams('source=other&lead=18abc'))).toEqual({ source: 'students', leadId: null });
    expect(parseStudentRegistrationContext(new URLSearchParams('source=intake&lead=18'))).toEqual({ source: 'intake', leadId: 18 });
  });
});
