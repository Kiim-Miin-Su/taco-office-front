/** @file-guide
 * 목적: design-system.ts — TokenRow, TOKEN_COLORS, CONTRAST_ADJUSTED, TOKEN_SIZES, TOKEN_LAYOUT 등 (util)
 * 책임/재사용: 현재 lib 계층의 순수 계산/표시 방어를 우선 재사용한다. UI·네트워크·DB 부수효과와 서버 업무 권위를 섞지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §85 디자인 토큰 · §86 컴포넌트 갤러리의 **이름표**.
 *
 * **값은 여기 없다.** 색도 치수도 `styles/tokens.css` 한 곳에만 있고(D-R41),
 * 화면은 실행 중에 그 변수를 읽어 보여 준다. 여기에 `#rrggbb` 를 적으면
 * 토큰이 두 벌이 되고 — 하필 **「토큰은 하나다」라고 주장하는 화면**이 그 증거가 된다.
 *
 * 이름과 쓰임새는 원문 §85 컷의 아홉 줄 그대로다.
 */

export interface TokenRow {
  /** CSS 변수 이름 — `--` 뒤 */
  key: string;
  /** 원문 §85 의 이름 */
  name: string;
  /** 원문 §85 의 쓰임새 한 줄 */
  use: string;
}

/** 색 9개 — 원문 컷의 차례 그대로 */
export const TOKEN_COLORS: readonly TokenRow[] = [
  { key: 'primary', name: '기본 색', use: '버튼 · 강조 · 링크' },
  { key: 'violet', name: '보라', use: '컨설팅 · GPA' },
  { key: 'green', name: '초록', use: '완료 · 정상' },
  { key: 'amber', name: '주황', use: '주의 · 대기' },
  { key: 'red', name: '빨강', use: '안 됨 · 지연 · 지우기' },
  { key: 'fg', name: '글자', use: '제목과 본문' },
  { key: 'fg-subtle', name: '흐린 글자', use: '설명 · 보조' },
  { key: 'line', name: '선', use: '카드 테두리 · 구분선' },
  { key: 'bg', name: '바탕', use: '화면 배경' },
];

/**
 * 명세서 §85 **컷**과 값이 다른 넷 — **숨기지 않고 화면이 말한다.**
 *
 * 2026-09-10 에 작은 글자 대비 4.5:1 을 맞추려고 이 넷을 컷보다 어둡게 잡았다
 * (`styles/tokens.css` 의 그날 기록). 나머지 다섯은 컷 값 그대로다.
 *
 * 2026-09-13 C60 에서 Figma 를 다시 맞춰 봤다 — `TACO v2 · Spec Foundations`(7438:2) 가
 * 같은 변수 이름(`--primary`·`--violet`·`--green`·`--amber` …)으로 **우리 값과 한 글자도 다르지 않게**
 * 묶여 있다. 값은 적지 않는다 — 여기 적는 순간 이 파일이 두 번째 토큰 표가 된다(회귀가 막는다).
 * 갈리는 것은 컷 하나뿐이고, 그 컷은 대비 보강 이전 판이다.
 * (Figma 의 옛 `Design System` 페이지(7140:45640)는 그보다 더 앞선 세대라 파랑/초록 600 계열이다 —
 *  그 페이지 자신이 「값이 갈리면 prototype/css/tokens.css 가 기준이다」라고 적어 두었다.)
 */
export const CONTRAST_ADJUSTED: readonly string[] = ['primary', 'violet', 'green', 'amber'];

/** 크기 · 모양 — 쓰는 값과 화면 틀을 갈라 둔다 (원문은 「5개」라 적는다 · N-34) */
export const TOKEN_SIZES: readonly TokenRow[] = [
  { key: 'r-sm', name: '모서리 (작게)', use: '단추 · 칩 · 입력칸' },
  { key: 'r-md', name: '모서리 (크게)', use: '카드 · 패널' },
  { key: 'gap', name: '사이', use: '요소와 요소' },
  { key: 'pad', name: '안쪽 여백', use: '카드 안' },
];
export const TOKEN_LAYOUT: readonly TokenRow[] = [
  { key: 'top-h', name: '머리 높이', use: '맨 위 줄' },
  { key: 'side-w', name: '옆 칸 너비', use: '펼친 옆 칸' },
  { key: 'side-rail-w', name: '옆 칸 너비 (접음)', use: '접은 옆 칸' },
  { key: 'hour-h', name: '한 시간 높이', use: '캘린더 한 칸' },
];

/** §86 갤러리 — 열두 종. 이름과 한 줄 설명은 원문 컷 그대로다. */
export interface GalleryRow {
  /** `component-usage.json` 의 키 */
  key: string;
  name: string;
  sub: string;
}
export const GALLERY: readonly GalleryRow[] = [
  { key: 'button', name: '버튼', sub: '기본 · 강조 · 작게 · 위험 · 못 누름' },
  { key: 'badge', name: '상태 배지', sub: '지금 어떤 상태인지' },
  { key: 'mark', name: '표시 마크', sub: '됐는지 · 안 됐는지 · 해당 없음' },
  { key: 'input', name: '입력칸', sub: '글자 · 고르기' },
  { key: 'field', name: '입력 묶음', sub: '라벨 + 입력칸 한 벌 · 가장 많이 씁니다' },
  { key: 'stat', name: '요약 카드', sub: '숫자를 크게' },
  { key: 'banner', name: '알림 상자', sub: '알려주기 · 조심하기' },
  { key: 'table', name: '표', sub: '여러 줄을 나란히' },
  { key: 'panel', name: '구역 제목', sub: '화면 안을 나눕니다' },
  { key: 'board', name: '주별 칸', sub: '요일마다 늘어놓기' },
  { key: 'overlay', name: '서랍 · 대화상자', sub: '옆에서 열기 · 가운데 띄우기' },
  { key: 'tabs', name: '갈래', sub: '보기 바꾸기' },
];

/**
 * 실행 중에 CSS 변수의 **실제 값**을 읽는다 — 화면에 적힌 값이 곧 화면이 쓰는 값이다.
 * 브라우저 밖(서버 렌더·시험)에서는 빈 문자열이라 화면이 「—」를 그린다.
 */
export function cssVarValue(key: string): string {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return '';
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim();
  } catch {
    return '';
  }
}

/** 「CSS 내보내기」 — 지금 화면이 쓰는 값을 그대로 적는다 */
export function tokensAsCss(rows: ReadonlyArray<readonly TokenRow[]>): string {
  const body = rows.flat().map((r) => `  --${r.key}: ${cssVarValue(r.key) || 'unset'};`).join('\n');
  return `:root {\n${body}\n}\n`;
}

/** 「토큰 JSON」 — 같은 값을 기계가 읽을 꼴로 */
export function tokensAsJson(rows: ReadonlyArray<readonly TokenRow[]>): string {
  const out: Record<string, string> = {};
  for (const r of rows.flat()) out[r.key] = cssVarValue(r.key);
  return `${JSON.stringify(out, null, 2)}\n`;
}
