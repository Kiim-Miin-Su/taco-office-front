/** @file-guide
 * 목적: money.ts — MASKED, WonOpts, won, wonCompact, wonTone (util)
 * 책임/재사용: 현재 lib 계층의 순수 계산/표시 방어를 우선 재사용한다. UI·네트워크·DB 부수효과와 서버 업무 권위를 섞지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 금액 — **원화 문자열이 만들어지는 단 하나의 자리.**
 *
 * 배포 직전 리뷰에서 네 벌이 나왔다 (`accounting` · `reports` · `consulting` · `SettlementLines`)
 * 그리고 여섯 곳이 `toLocaleString('ko-KR')` 을 직접 부르고 있었다. 결과가 이미 갈려 있었다 —
 * 회계 요약 카드는 「12,400,000」, 두 줄 아래 표는 「12,400,000원」.
 *
 * **표기는 원문 컷 모양 「₩7,214,000」이다 (N-92 · W11 D).** 전에는 「7,214,000원」(뒤에 원)이었고
 * 대표 보고 카드(「₩-7,674,692」)와 컨설팅 §26 카드만 제 함수로 ₩ 를 붙여 **한 제품에 두 표기**가 섞여 있었다.
 * 이제 전 화면이 이 한 곳을 지난다 — 서버가 지은 **문장** 속 금액(「N원」)은 서버 몫이라 이번 범위 밖이다.
 *   · 0 은 「₩0」(원문 §69 「오늘 들어온 돈 ₩0」 · §28 「₩0」).
 *   · 음수는 **부호가 맨 앞**이다 — 「−₩95,000」. 원문 컷에 음수가 두 모양으로 나온다: 사람이 적은 차감 칩
 *     (§56 「차감 −₩95,000 · 세금 −₩165,058 · 리포트 −₩5,000」)은 빼기 기호(−)가 ₩ 앞이고, 계산된 잔액
 *     (§52~§57 「남은 돈 ₩-3,052,172」 · §71 「이익 ₩-7,674,692」)은 하이픈이 ₩ 뒤다(목업의 기본 숫자 모양).
 *     앞의 모양이 지금 규칙(빼기 기호 · 맨 앞)과 같아 그것 하나로 둔다 — 한 제품에서 음수가 두 모양이면 표가 흔들린다.
 *   · `unit: false` 는 ₩ 도 떼고 숫자만 — 원문 §55 입금 달력 칸 「840,000」.
 *   · 짧은 표기(만 · 억)는 컷에 없다 — 지금 규칙(「약 79.5만」)을 지키고 숫자 앞에 ₩ 만 붙인다.
 *
 * **`null` 은 0이 아니다.** 금액을 볼 수 없는 사람에게는 서버가 아예 `null` 로 내려보낸다 (D-R39).
 * 그것을 `?? 0` 으로 뭉개면 「₩0 이다」와 「가려졌다」가 같은 화면이 된다.
 */

/**
 * 숨긴 금액을 그리는 **낱말 한 벌** — 「비공개」 (W11 D).
 *
 * 금액 권한이 없어 서버가 null 로 준 칸도, 비공개 스위치(N-94 · 원문 §52~§57 탭 줄 「시급 비공개 · 컨설팅 비공개」)로
 * 가려진 줄도 같은 낱말이다. 한동안 권한은 「가려짐」 · 스위치는 「비공개」로 갈려 있어 컨설팅 화면과 회계 화면이
 * 같은 일을 다른 말로 불렀다. 원문 스위치 이름이 쓰는 낱말 하나로 모은다 — 「0」도 「모름」도 아니라 **보여 주지 않는다**는 뜻이다.
 * 화면에 이 낱말을 직접 적지 않는다 — 여기 한 곳만 고치면 전 화면이 따라온다.
 */
export const MASKED = '비공개';

export interface WonOpts {
  /** 앞에 「₩」을 붙일지. 기본 true — false 면 숫자만(입금 달력 칸 · 건수처럼 쓰는 자리) */
  unit?: boolean;
  /** 양수에도 부호(+)를 보일지 — 가산 · 더하는 줄에 쓴다. 음수는 언제나 − 가 붙는다 */
  signed?: boolean;
  /** null 일 때 보여 줄 글자. 기본 MASKED(「비공개」) — 불러오는 중이면 「—」를 넘긴다 */
  empty?: string;
}

export function won(n: number | null | undefined, o: WonOpts = {}): string {
  const { unit = true, signed = false, empty = MASKED } = o;
  if (n === null || n === undefined) return empty;
  // 하이픈이 아니라 빼기 기호(−) — 하이픈은 글자 폭이 달라 표의 숫자 열이 흔들린다
  const sign = signed && n > 0 ? '+' : n < 0 ? '−' : '';
  const body = Math.abs(n).toLocaleString('ko-KR');
  return `${sign}${unit ? '₩' : ''}${body}`;
}

/** 「약 ₩79.5만」 — 카드처럼 좁은 자리. 부호가 맨 앞이고 ₩ 는 숫자 바로 앞이다 */
export function wonCompact(n: number | null | undefined, empty = MASKED): string {
  if (n === null || n === undefined) return empty;
  const a = Math.abs(n);
  if (a < 10_000) return won(n);
  const sign = n < 0 ? '−' : '';
  if (a < 100_000_000) return `${sign}약 ₩${(a / 10_000).toFixed(a < 1_000_000 ? 1 : 0)}만`;
  return `${sign}약 ₩${(a / 100_000_000).toFixed(1)}억`;
}

/** 부호에 따른 색. 화면마다 삼항을 적지 않게 */
export const wonTone = (n: number | null | undefined): 'neutral' | 'success' | 'danger' =>
  n === null || n === undefined ? 'neutral' : n > 0 ? 'success' : n < 0 ? 'danger' : 'neutral';
