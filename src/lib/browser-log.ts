/** @file-guide
 * 목적: browser-log.ts — 민감정보 없이 브라우저 복구·진단 이벤트를 같은 형식으로 남기는 공용 로거
 * 책임/재사용: 화면은 event와 허용된 작은 metadata만 넘긴다. 요청 config, 헤더, 토큰, 사용자 입력은 기록하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

export type BrowserLogDetails = Readonly<Record<string, string | number | boolean | null>>;
export type BrowserLogLevel = 'info' | 'warn';

/** SSR에서는 아무것도 쓰지 않고, 브라우저에서만 검색 가능한 TACO prefix를 사용한다. */
export function browserLog(
  event: string,
  details: BrowserLogDetails,
  level: BrowserLogLevel = 'info',
): void {
  if (typeof window === 'undefined') return;
  if (level === 'warn') console.warn(`[TACO] ${event}`, details);
  else console.info(`[TACO] ${event}`, details);
}
