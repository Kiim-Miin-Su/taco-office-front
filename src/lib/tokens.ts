/**
 * 토큰 키 목록 — src/styles/tokens.css 에서 생성했습니다.
 *
 * 기본 색 값은 CSS 변수에만 있다. 관리자 일정의 런타임 색은 Meta를 우선하며,
 * 코드표가 없거나 잘못된 응답일 때만 기존 CSS 기본값으로 복구한다 (§88·§89).
 */
import type { Meta, Occurrence } from '@/api/types';

export const KIND_KEYS = ['class', 'mock', 'gpa', 'study', 'consult', 'diagx', 'consulting', 'meeting'] as const;
export type KindKey = (typeof KIND_KEYS)[number];

export const SUB_KEYS = ['map-read', 'map-math', 'sat-read', 'sat-math', 'writing', 'vocab', 'ap-chem', 'interview', 'read-lab', 'study-room', 'gpa-care', 'mock-sat', 'mock-map', 'diag', 'intake', 'admissions', 'mt-pl', 'mt-cs', 'mt-mk', 'mt-dv', 'mt-pg'] as const;
export type SubKey = (typeof SUB_KEYS)[number];

/** 캘린더 블록처럼 색을 런타임에 주입하는 곳 — Tailwind 는 bg-[color:var(--c)] 로 받는다 */
export const kindVar = (k: KindKey): string => `var(--kind-${k})`;
export const subVar = (k: SubKey): string => `var(--sub-${k})`;

/** 같은 Meta lookup을 이름·색·범례가 공유한다. 서버 DTO의 새 복사본은 만들지 않는다. */
export interface CalendarCodeLookup {
  subs: ReadonlyMap<string, Meta['subs'][number]>;
  kinds: ReadonlyMap<string, Meta['kinds'][number]>;
}

export type CalendarColorOf = (occ: Pick<Occurrence, 'subKey' | 'kindKey'>) => string;

const validColor = (color: unknown): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);

/** SUB API → 알려진 SUB 기본값 → KIND API → 알려진 KIND 기본값 → 중립. */
export function calendarEventColor(occ: Pick<Occurrence, 'subKey' | 'kindKey'>, codes: CalendarCodeLookup): string {
  const subColor = occ.subKey ? codes.subs.get(occ.subKey)?.color : undefined;
  if (validColor(subColor)) return subColor;
  const sub = SUB_KEYS.find((key) => key === occ.subKey);
  if (sub) return subVar(sub);

  const kindColor = codes.kinds.get(occ.kindKey)?.color;
  if (validColor(kindColor)) return kindColor;
  const kind = KIND_KEYS.find((key) => key === occ.kindKey);
  return kind ? kindVar(kind) : 'var(--fg-subtle)';
}
