/** @file-guide
 * 목적: 학년 projection은 서버 문구·순서를 그대로 쓰고 미상/legacy 값을 추정 변환하지 않는지 검증한다.
 * 책임/재사용: 실제 education-grades selector만 호출한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import type { Meta } from '@/api/types';
import { educationGradeListLabel, educationGradeOption, educationGradeOptions, hasEducationGradeContract } from './education-grades';

const projection = {
  educationGrades: [
    { value: 'Y6', system: 'GB', systemLabel: '영국 Year', optionLabel: 'Y6 (= G5)', equivalenceHint: '= G5 · 초5', listLabel: 'Y6 · G5', sort: 5 },
    { value: 'G5', system: 'US', systemLabel: '미국 Grade', optionLabel: 'G5 (= Y6)', equivalenceHint: '= Y6 · 초5', listLabel: 'G5 · Y6', sort: 5 },
  ],
} satisfies Partial<Pick<Meta, 'educationGrades'>>;

describe('교육체계 학년 projection', () => {
  it('서버의 값·문구·순서를 계산 없이 그대로 보존한다', () => {
    expect(hasEducationGradeContract(projection)).toBe(true);
    expect(educationGradeOptions(projection)).toEqual(projection.educationGrades);
    expect(educationGradeOption(projection, 'Y6')?.equivalenceHint).toBe('= G5 · 초5');
  });

  it('배열이 없으면 구형 계약이고, 빈 배열은 신형 계약의 빈 결과다', () => {
    expect(hasEducationGradeContract({})).toBe(false);
    expect(hasEducationGradeContract({ educationGrades: [] })).toBe(true);
    expect(educationGradeOptions({ educationGrades: [] })).toEqual([]);
  });

  it('목록의 명시 display가 우선이고 미상 원문은 자동 대응하지 않는다', () => {
    expect(educationGradeListLabel(projection, { gradeDisplay: 'Y6 · G5 · 검수값' }, 'Y6')).toBe('Y6 · G5 · 검수값');
    expect(educationGradeListLabel(projection, {}, 'Y6')).toBe('Y6 · G5');
    expect(educationGradeListLabel(projection, {}, '9학년')).toBe('9학년');
  });
});
