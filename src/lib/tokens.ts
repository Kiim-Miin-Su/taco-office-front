/** @file-guide
 * 목적: tokens.ts — KIND_KEYS, KindKey, SUB_KEYS, SubKey, kindVar 등 (util)
 * 책임/재사용: 현재 lib 계층의 순수 계산/표시 방어를 우선 재사용한다. UI·네트워크·DB 부수효과와 서버 업무 권위를 섞지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

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

/**
 * 과목 하나의 표시색. 캘린더·교재처럼 과목색을 그리는 화면은 이 선택기만 쓴다.
 * 서버 Meta를 먼저 믿고, 알려진 키만 CSS 토큰으로 복구한다. 알 수 없는 키를 다른
 * 과목이나 수업 종류에 임의로 붙이지 않는다.
 */
export function subjectColor(subKey: string | null | undefined, subs: CalendarCodeLookup['subs']): string | null {
  if (!subKey) return null;
  const apiColor = subs.get(subKey)?.color;
  if (validColor(apiColor)) return apiColor;
  const known = SUB_KEYS.find((key) => key === subKey);
  return known ? subVar(known) : null;
}

/** SUB API → 알려진 SUB 기본값 → KIND API → 알려진 KIND 기본값 → 중립. */
export function calendarEventColor(occ: Pick<Occurrence, 'subKey' | 'kindKey'>, codes: CalendarCodeLookup): string {
  const color = subjectColor(occ.subKey, codes.subs);
  if (color) return color;

  const kindColor = codes.kinds.get(occ.kindKey)?.color;
  if (validColor(kindColor)) return kindColor;
  const kind = KIND_KEYS.find((key) => key === occ.kindKey);
  return kind ? kindVar(kind) : 'var(--fg-subtle)';
}
