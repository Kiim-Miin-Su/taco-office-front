/** @file-guide
 * 목적: URL identity 파라미터를 화면 상태로 복원할 때 쓰는 공용 입력 방어 함수
 * 책임/재사용: 문자열 형식만 검증한다. 권한·DB 존재 여부·업무 판정은 서버와 목적지 화면이 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

export function positiveQueryId(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function queryEnum<const T extends string>(value: string | null, values: readonly T[]): T | null {
  return value && values.includes(value as T) ? value as T : null;
}

export function queryIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : null;
}

