/** @file-guide
 * 목적: 서버가 내려주는 세 교육체계 학년 projection을 화면 공용 선택지로 좁혀 읽는다.
 * 책임/재사용: 대응·정렬·표시 문구를 계산하지 않는다. 생성 DTO 전 롤링 배포에서는 필드 존재만 안전하게 판별한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

export interface EducationGradeOption {
  value: string;
  system: 'US' | 'GB' | 'KR';
  systemLabel: string;
  optionLabel: string;
  equivalenceHint: string;
  listLabel: string;
  sort: number;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function sourceRows(source: unknown): unknown[] | null {
  if (!source || typeof source !== 'object') return null;
  const rows = (source as { educationGrades?: unknown }).educationGrades;
  return Array.isArray(rows) ? rows : null;
}

function option(row: unknown): EducationGradeOption | null {
  if (!row || typeof row !== 'object') return null;
  const item = row as Record<string, unknown>;
  const value = text(item.value);
  const system = text(item.system);
  const systemLabel = text(item.systemLabel);
  const optionLabel = text(item.optionLabel);
  const equivalenceHint = text(item.equivalenceHint);
  const listLabel = text(item.listLabel);
  const sort = item.sort;
  if (!value || !systemLabel || !optionLabel || !equivalenceHint || !listLabel || typeof sort !== 'number' || !Number.isFinite(sort)) return null;
  if (system !== 'US' && system !== 'GB' && system !== 'KR') return null;
  return { value, system, systemLabel, optionLabel, equivalenceHint, listLabel, sort };
}

/** `educationGrades` 배열 자체가 있으면 빈 배열도 신형 계약으로 본다. 화면이 옛 literal 목록으로 조용히 후퇴하지 않게 한다. */
export function hasEducationGradeContract(source: unknown): boolean {
  return sourceRows(source) !== null;
}

/** 서버 순서를 보존한다. 동등학년 대응과 미국 기준 정렬은 DTO가 소유하며 화면에서 다시 계산하지 않는다. */
export function educationGradeOptions(source: unknown): EducationGradeOption[] {
  return (sourceRows(source) ?? []).map(option).filter((item): item is EducationGradeOption => item !== null);
}

export function educationGradeOption(source: unknown, value: string | null | undefined): EducationGradeOption | null {
  if (!value) return null;
  return educationGradeOptions(source).find((item) => item.value === value) ?? null;
}

/** 목록 row의 명시 display가 우선이고, 다음은 같은 서버 projection, 마지막은 원문값이다. 미상값을 자동 변환하지 않는다. */
export function educationGradeListLabel(source: unknown, row: unknown, raw: string | null | undefined): string {
  if (row && typeof row === 'object') {
    const display = text((row as { gradeDisplay?: unknown }).gradeDisplay);
    if (display) return display;
  }
  return educationGradeOption(source, raw)?.listLabel ?? raw ?? '미상';
}
