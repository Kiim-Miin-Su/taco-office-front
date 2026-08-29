/** 클래스 합치기 — 조건부 클래스를 화면마다 다르게 적지 않게 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
