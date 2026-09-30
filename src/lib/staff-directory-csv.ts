/** @file-guide
 * 목적: staff-directory-csv.ts — 강사 표에서 선택한 비민감 열만 Excel용 CSV로 내보낸다.
 * 책임/재사용: 생성 API 타입을 쓰고 수식 주입·따옴표·개행을 셀 단위로 방어한다. 연락처·급여·계좌는 내보내지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { components } from '@/api/schema';

type StaffRow = components['schemas']['StaffDirectoryRowDto'];

function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  // Excel은 CSV 셀의 =,+,-,@를 수식으로 해석한다. 앞 공백/탭/개행 뒤의 수식도 막는다.
  if (/^[\t\r\n]/.test(text) || /^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** UTF-8 BOM·CRLF — Excel에서 한글을 보존한다. 명시한 일곱 열만 출력한다. */
export function staffDirectoryCsv(rows: readonly StaffRow[]): string {
  const header = ['ID', '한글 이름', '영문명', '직함', '상태', '입사일', '등록일'];
  const body = rows.map((row) => [
    row.id, row.name, row.englishName, row.title, row.active ? '사용 중' : '사용 중지', row.hiredOn, row.createdAt,
  ].map(csvCell).join(','));
  return `\uFEFF${[header.map(csvCell).join(','), ...body].join('\r\n')}\r\n`;
}
