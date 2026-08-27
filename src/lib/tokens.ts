/**
 * 토큰 키 목록 — src/styles/tokens.css 에서 생성했습니다.
 *
 * 색 **값**은 여기 없습니다. 값은 CSS 변수에만 있고, 이 파일은 키만 압니다.
 * 그래야 색을 바꿀 때 고칠 곳이 tokens.css 한 곳으로 남습니다 (D-R41).
 */

export const KIND_KEYS = ['class', 'mock', 'gpa', 'study', 'consult', 'diagx', 'consulting', 'meeting'] as const;
export type KindKey = (typeof KIND_KEYS)[number];

export const SUB_KEYS = ['map-read', 'map-math', 'sat-read', 'sat-math', 'writing', 'vocab', 'ap-chem', 'interview', 'read-lab', 'study-room', 'gpa-care', 'mock-sat', 'mock-map', 'diag', 'intake', 'admissions', 'mt-pl', 'mt-cs', 'mt-mk', 'mt-dv', 'mt-pg'] as const;
export type SubKey = (typeof SUB_KEYS)[number];

/** 캘린더 블록처럼 색을 런타임에 주입하는 곳 — Tailwind 는 bg-[color:var(--c)] 로 받는다 */
export const kindVar = (k: KindKey): string => `var(--kind-${k})`;
export const subVar = (k: SubKey): string => `var(--sub-${k})`;
