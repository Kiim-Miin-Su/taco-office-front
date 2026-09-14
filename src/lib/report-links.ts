/** @file-guide
 * 목적: 리포트 화면과 스케줄 화면이 공유하는 회차 deep-link를 한 곳에서 만든다.
 * 책임/재사용: URL 직렬화만 소유한다. ID·날짜 검증은 목적지의 url-state 방어함수가 다시 수행한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

export function hrefForScheduleOccurrence(row: { serId: number; onDate: string; date: string }): string {
  const params = new URLSearchParams({
    serId: String(row.serId),
    onDate: row.onDate,
    date: row.date,
  });
  return `/schedule?${params.toString()}`;
}

/** 과거 NOTI의 `/reports/unwritten` 링크를 깨지 않되 알 수 없는 segment는 안전한 기본 탭으로 보낸다. */
export function hrefForLegacyReportSection(section: string): string {
  const mapped = section === 'unwritten' ? 'unwritten'
    : section === 'weekly' ? 'weekly'
      : section === 'deliveries' ? 'delivery'
        : section === 'history' ? 'history' : null;
  return mapped === 'unwritten' || mapped === null ? '/reports' : `/reports?section=${mapped}`;
}

export function hrefForLegacyReportDetail(serId: number, onDate: string): string {
  const params = new URLSearchParams({ serId: String(serId), onDate });
  return `/reports?${params.toString()}`;
}
