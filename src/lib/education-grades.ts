/** @file-guide
 * 목적: 생성 DTO의 세 교육체계 학년 projection을 화면 공용 선택지로 읽는다.
 * 책임/재사용: 대응·정렬·표시 문구를 계산하지 않는다. 롤링 배포에서는 필드 존재만 안전하게 판별한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { EducationGradeOption, Meta } from '@/api/types';
import type { StudentDirectoryRow } from '@/api/students';

export type EducationGradeSource = Partial<Pick<Meta, 'educationGrades'>>;

function sourceRows(source: EducationGradeSource | null | undefined): readonly EducationGradeOption[] | null {
  return Array.isArray(source?.educationGrades) ? source.educationGrades : null;
}

/** `educationGrades` 배열 자체가 있으면 빈 배열도 신형 계약으로 본다. 화면이 옛 literal 목록으로 조용히 후퇴하지 않게 한다. */
export function hasEducationGradeContract(source: EducationGradeSource | null | undefined): boolean {
  return sourceRows(source) !== null;
}

/**
 * 권고안 채택(BOC-01D-02): Backend DTO/OpenAPI 생성 타입을 직접 읽고 서버 순서를 보존한다.
 * 필드나 문구가 바뀌면 수기 interface를 고치지 말고 Backend DTO와 생성물을 먼저 갱신한다.
 */
export function educationGradeOptions(source: EducationGradeSource | null | undefined): EducationGradeOption[] {
  return [...(sourceRows(source) ?? [])];
}

export function educationGradeOption(source: EducationGradeSource | null | undefined, value: string | null | undefined): EducationGradeOption | null {
  if (!value) return null;
  return educationGradeOptions(source).find((item) => item.value === value) ?? null;
}

/** 목록 row의 명시 display가 우선이고, 다음은 같은 서버 projection, 마지막은 원문값이다. 미상값을 자동 변환하지 않는다. */
export function educationGradeListLabel(
  source: EducationGradeSource | null | undefined,
  row: Partial<Pick<StudentDirectoryRow, 'gradeDisplay'>> | null | undefined,
  raw: string | null | undefined,
): string {
  const display = row?.gradeDisplay?.trim();
  if (display) return display;
  return educationGradeOption(source, raw)?.listLabel ?? raw ?? '미상';
}
