/**
 * 금액 — **원화 문자열이 만들어지는 단 하나의 자리.**
 *
 * 배포 직전 리뷰에서 네 벌이 나왔다 (`accounting` · `reports` · `consulting` · `SettlementLines`)
 * 그리고 여섯 곳이 `toLocaleString('ko-KR')` 을 직접 부르고 있었다. 결과가 이미 갈려 있었다 —
 * 회계 요약 카드는 「12,400,000」, 두 줄 아래 표는 「12,400,000원」.
 *
 * **`null` 은 0이 아니다.** 금액은 대표만 볼 수 있고, 볼 수 없는 사람에게는
 * 서버가 아예 `null` 로 내려보낸다 (D-R39). 그것을 `?? 0` 으로 뭉개면
 * 「0원이다」와 「가려졌다」가 같은 화면이 된다.
 */

/** 가려진 금액을 그리는 글자 — 「모름」이 아니라 「권한이 없다」는 뜻이다 */
export const MASKED = '가려짐';

export interface WonOpts {
  /** 뒤에 「원」을 붙일지. 기본 true */
  unit?: boolean;
  /** 부호를 보일지 — 지출·차감에 쓴다 */
  signed?: boolean;
  /** null 일 때 보여 줄 글자. 기본 MASKED */
  empty?: string;
}

export function won(n: number | null | undefined, o: WonOpts = {}): string {
  const { unit = true, signed = false, empty = MASKED } = o;
  if (n === null || n === undefined) return empty;
  const sign = signed && n > 0 ? '+' : n < 0 ? '−' : '';
  const body = Math.abs(n).toLocaleString('ko-KR');
  return `${sign}${body}${unit ? '원' : ''}`;
}

/** 「약 79.5만」 — 카드처럼 좁은 자리 */
export function wonCompact(n: number | null | undefined, empty = MASKED): string {
  if (n === null || n === undefined) return empty;
  const a = Math.abs(n);
  if (a < 10_000) return won(n);
  if (a < 100_000_000) return `${n < 0 ? '−' : ''}약 ${(a / 10_000).toFixed(a < 1_000_000 ? 1 : 0)}만`;
  return `${n < 0 ? '−' : ''}약 ${(a / 100_000_000).toFixed(1)}억`;
}

/** 부호에 따른 색. 화면마다 삼항을 적지 않게 */
export const wonTone = (n: number | null | undefined): 'neutral' | 'success' | 'danger' =>
  n === null || n === undefined ? 'neutral' : n > 0 ? 'success' : n < 0 ? 'danger' : 'neutral';
