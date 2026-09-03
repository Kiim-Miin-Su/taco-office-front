/**
 * 달력 계산 — **순수 함수만.** 화면은 여기서 나온 배열을 그리기만 한다.
 *
 * 일간·주간·월간·학생별·선생님별 다섯 보기가 **같은 범위를 한 번 읽고**
 * 여기서 나눈다 (`AGENT.md §6.1-2`). 보기마다 fetch 하면 전환할 때마다 왕복이 생기고,
 * 같은 날짜가 보기마다 다른 응답에서 오면 색이 갈린다.
 */

export type View = 'day' | 'week' | 'month' | 'student' | 'teacher';

/** 기본/분할이 함께 쓰는 표 상태. 표마다 독립이고 페이지 reducer만 소유한다 (§4.1). */
export interface CalendarPaneState {
  view: View;
  date: string;
  personId: number | null;
}

export type CalendarPaneIndex = 0 | 1;

/** divider 입력을 실제 컨테이너 기준 최소 pane 폭으로 제한한다 (§4.2). */
export function clampSplitRatio(
  ratio: number,
  containerWidth: number,
  minPaneWidth = 152,
): number {
  if (!Number.isFinite(ratio) || !Number.isFinite(containerWidth) || containerWidth <= 0) return 0.5;
  const minRatio = Math.min(0.5, minPaneWidth / containerWidth);
  return Math.max(minRatio, Math.min(1 - minRatio, ratio));
}

/** 분할은 현재 표 전체를 복제한다. 얕은 객체지만 값이 원시값뿐이라 두 표는 독립이다. */
export function splitPanes(current: CalendarPaneState): [CalendarPaneState, CalendarPaneState] {
  return [{ ...current }, { ...current }];
}

/** 분할 해제는 focus된 표 하나만 남긴다. */
export function unsplitPanes(
  panes: readonly CalendarPaneState[],
  focused: CalendarPaneIndex,
): [CalendarPaneState] {
  return [{ ...(panes[focused] ?? panes[0]) }];
}

/** 한쪽 표를 고쳐도 반대쪽 참조가 바뀌지 않게 배열과 대상 객체만 교체한다. */
export function updatePane(
  panes: readonly CalendarPaneState[],
  index: CalendarPaneIndex,
  patch: Partial<CalendarPaneState>,
): CalendarPaneState[] {
  return panes.map((pane, i) => i === index ? { ...pane, ...patch } : pane);
}

/** pane별로 읽지 않고 필요한 최소~최대 범위를 한 요청으로 묶는다 (§4 · §6.1-2). */
export function boundingRange(panes: readonly CalendarPaneState[]): { from: string; to: string } {
  const ranges = panes.map((pane) => boundsOf(pane.view, pane.date));
  return {
    from: ranges.reduce((min, range) => range.from < min ? range.from : min, ranges[0].from),
    to: ranges.reduce((max, range) => range.to > max ? range.to : max, ranges[0].to),
  };
}

/** KST 고정 (D-R12) — 관리자 화면의 모든 시각은 서울 시간이다 */
export const todayKst = (): string =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number): string =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export const dowOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** 그 주의 월요일 */
export const mondayOf = (iso: string): string => addDays(iso, dowOf(iso) === 0 ? -6 : 1 - dowOf(iso));

/** 월요일부터 7일 */
export const weekDays = (iso: string): string[] => {
  const m = mondayOf(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(m, i));
};

/** 달력 격자 — 그 달을 덮는 월요일 시작 6주(또는 5주) */
export function monthGrid(iso: string): string[] {
  const first = `${iso.slice(0, 7)}-01`;
  const start = mondayOf(first);
  const lastDay = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate();
  const last = `${iso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
  const end = addDays(mondayOf(last), 6);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * 보기가 필요로 하는 **하나의 범위**.
 * 학생별·선생님별은 주간과 같은 범위를 쓴다 — 왼쪽에서 사람만 고를 뿐이다.
 */
export function boundsOf(view: View, date: string): { from: string; to: string } {
  if (view === 'day') return { from: date, to: date };
  if (view === 'month') {
    const g = monthGrid(date);
    return { from: g[0], to: g[g.length - 1] };
  }
  const w = weekDays(date);
  return { from: w[0], to: w[6] };
}

/** 보기를 옮길 때 날짜가 얼마나 움직이나 */
export function step(view: View, date: string, dir: -1 | 1): string {
  if (view === 'day') return addDays(date, dir);
  if (view === 'month') {
    const y = +date.slice(0, 4);
    const m = +date.slice(5, 7) - 1 + dir;
    const d = new Date(Date.UTC(y, m, 1));
    return d.toISOString().slice(0, 10);
  }
  return addDays(date, 7 * dir);
}

export const hhmm = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const KO_DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → '8/31 (월)' */
export const label = (iso: string): string =>
  `${+iso.slice(5, 7)}/${+iso.slice(8, 10)} (${KO_DOW[dowOf(iso)]})`;

/** 지금이 몇 분인가 — 오늘 칸의 빨간 선 위치 (§7) */
export const nowMinKst = (): number => {
  const n = new Date(Date.now() + 9 * 3600 * 1000);
  return n.getUTCHours() * 60 + n.getUTCMinutes();
};

/**
 * 격자에 그릴 시간 범위.
 * 수업이 몰려 있으면 앞뒤 1시간만 남기고 좁힌다 — 다만 **6시간은 유지**한다 (§10).
 */
export function timeRange(mins: Array<{ startMin: number; endMin: number }>): { from: number; to: number } {
  if (!mins.length) return { from: 9 * 60, to: 22 * 60 };
  const lo = Math.min(...mins.map((m) => m.startMin));
  const hi = Math.max(...mins.map((m) => m.endMin));
  let from = Math.max(0, Math.floor((lo - 60) / 60) * 60);
  let to = Math.min(24 * 60, Math.ceil((hi + 60) / 60) * 60);
  if (to - from < 360) {
    const mid = (from + to) / 2;
    from = Math.max(0, Math.floor((mid - 180) / 60) * 60);
    to = Math.min(24 * 60, from + 360);
  }
  return { from, to };
}

/* ── 상호작용 산수 (TBO-41 · CALENDAR §5) — 격자·드래그가 이것만 부른다 ── */

/** 스냅은 15분, 셀 실체는 30분이다 (§2.5 · §5) */
export const SNAP_MIN = 15;
export const SLOT_MIN = 30;
/** 시간당 픽셀 — 헤더와 본문이 같은 값을 쓴다. 각자 계산하면 1px 씩 어긋난다 (§2.5) */
export const HOUR_PX = 56;

export const snap15 = (m: number): number => Math.round(m / SNAP_MIN) * SNAP_MIN;

/** 드래그 델타(px) → 분. 15분 스냅까지 여기서 한다 — 화면이 다시 계산하지 않는다 */
export const minutesFromPx = (px: number): number => snap15((px / HOUR_PX) * 60);

/** 폼과 드래그가 공유하는 수업 시각 계약. 서버의 lessonTimeIssue와 같은 경계다. */
export function lessonTimeIssue(startMin: number, endMin: number): string | null {
  if (startMin < 0 || startMin >= 1440 || endMin > 1440) return '수업 시각은 같은 날 안에 있어야 합니다';
  const duration = endMin - startMin;
  return duration < 10 || duration > 480 ? '길이는 10분에서 8시간 사이여야 합니다 (§5)' : null;
}

/** 블록 길이 제약 — 10~480분 (§5) · 자정을 넘지 않는다 */
export const clampEnd = (startMin: number, endMin: number): number =>
  Math.min(24 * 60, Math.max(startMin + 10, Math.min(startMin + 480, endMin)));

export interface MoveTarget {
  date?: string;
  startMin?: number;
  /** 컬럼 축이 강사면 강사가, 강의실이면 강의실이 바뀐다 (§4.4 · §2.3) */
  teacherId?: number | null;
  roomId?: number | null;
}

/** PATCH 에 실을 것 — **바뀐 필드만**. 아무것도 안 바뀌면 null, 그때는 부르지 않는다 */
export function movePatch(
  o: { date: string; startMin: number; endMin: number; teacherId?: number | null; roomId?: number | null },
  t: MoveTarget,
): { date?: string; startMin?: number; endMin?: number; teacherId?: number | null; roomId?: number | null } | null {
  const out: ReturnType<typeof movePatch> = {};
  if (t.date !== undefined && t.date !== o.date) out!.date = t.date;
  if (t.startMin !== undefined) {
    const s = Math.max(0, Math.min(24 * 60 - 10, snap15(t.startMin)));
    if (s !== o.startMin) {
      out!.startMin = s;
      out!.endMin = clampEnd(s, s + (o.endMin - o.startMin)); // 길이 유지
    }
  }
  if (t.teacherId !== undefined && t.teacherId !== (o.teacherId ?? null)) out!.teacherId = t.teacherId;
  if (t.roomId !== undefined && t.roomId !== (o.roomId ?? null)) out!.roomId = t.roomId;
  return Object.keys(out!).length ? out : null;
}

/** 리사이즈 — 끝 시각만 바뀐다 (§5 C-3) */
export function resizePatch(
  o: { startMin: number; endMin: number },
  deltaPx: number,
): { endMin: number } | null {
  const end = clampEnd(o.startMin, snap15(o.endMin + (deltaPx / HOUR_PX) * 60));
  return end === o.endMin ? null : { endMin: end };
}

/**
 * 같은 컬럼에서 시간이 겹치는 블록 묶음 (§4.5 — 폭을 N등분하지 않는다).
 * 첫 건만 그리고 나머지는 「+N」으로 접는 것이 화면의 일이고, 묶는 것은 여기의 일이다.
 */
export function overlapClusters<T extends { startMin: number; endMin: number }>(items: T[]): T[][] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: T[][] = [];
  let cur: T[] = [];
  let curEnd = -1;
  for (const it of sorted) {
    if (cur.length && it.startMin < curEnd) {
      cur.push(it);
      curEnd = Math.max(curEnd, it.endMin);
    } else {
      if (cur.length) out.push(cur);
      cur = [it];
      curEnd = it.endMin;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** rrule 문자열 — 서버 `formatRule()` 이 정한 형식만 쓴다. 다른 형식은 회차가 통째로 사라진다 */
const DOW_CODE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export function buildRrule(days: number[]): string {
  if (!days.length) return 'ONCE';
  return `WEEKLY:${[...days].sort((a, b) => a - b).map((d) => DOW_CODE[d]).join(',')}`;
}

/** 'HH:MM' ↔ 분 — 폼 입력용. 표시는 hhmm() 그대로 */
export const parseHm = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const n = +m[1] * 60 + +m[2];
  return n >= 0 && n < 24 * 60 ? n : null;
};

/* ── 선택 · 앱 내부 클립보드 (TBO-41E · CALENDAR §5.2) ─────────────── */

/** 같은 회차가 분할 표에 여러 번 보여도 한 선택으로 묶는 키다. */
export interface OccurrenceIdentity {
  serId: number;
  onDate: string;
  date: string;
  startMin: number;
  endMin: number;
}

export const occurrenceKey = (o: Pick<OccurrenceIdentity, 'serId' | 'onDate'>): string =>
  `${o.serId}|${o.onDate}`;

export type SelectMode = 'single' | 'range' | 'toggle';

const byOccurrenceTime = <T extends OccurrenceIdentity>(a: T, b: T): number =>
  a.date.localeCompare(b.date) || a.startMin - b.startMin || a.serId - b.serId;

/**
 * 클릭 선택 규칙의 단일 출처. EventBlock 은 modifier 만 전달하고 선택 집합 계산은 여기서 한다.
 * range 는 마지막 선택을 anchor 로 삼고, toggle 은 해당 회차만 넣거나 뺀다.
 */
export function selectOccurrenceKeys<T extends OccurrenceIdentity>(
  items: T[],
  selected: string[],
  target: T,
  mode: SelectMode,
): string[] {
  const key = occurrenceKey(target);
  if (mode === 'single') return [key];
  if (mode === 'toggle') {
    return selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key];
  }

  const sorted = [...items].sort(byOccurrenceTime);
  const anchor = selected[selected.length - 1];
  const a = sorted.findIndex((o) => occurrenceKey(o) === anchor);
  const b = sorted.findIndex((o) => occurrenceKey(o) === key);
  if (a < 0 || b < 0) return [key];
  const range = sorted.slice(Math.min(a, b), Math.max(a, b) + 1).map(occurrenceKey);
  return [...new Set([...selected, ...range])];
}

/** 선택 순서가 아니라 화면의 날짜·시각 순서로 돌려준다 — 복사 기준점과 표시 순서를 맞춘다. */
export function selectedOccurrences<T extends OccurrenceIdentity>(items: T[], selected: string[]): T[] {
  const want = new Set(selected);
  return items.filter((o) => want.has(occurrenceKey(o))).sort(byOccurrenceTime);
}

export interface RelativePlacement<T> {
  source: T;
  date: string;
  startMin: number;
  endMin: number;
  offsetDays: number;
  offsetMinutes: number;
}

/**
 * 붙여넣기 프리뷰 산수. 저장 payload 는 원본 참조만 보내고 서버 `copyMany()`가 다시 계산하지만,
 * 화면 프리뷰도 같은 기준(가장 이른 날짜·시각)을 써야 손을 놓은 자리와 저장 결과가 일치한다.
 */
export function relativePlacements<T extends OccurrenceIdentity>(
  items: T[],
  targetDate: string,
  targetStartMin: number,
): RelativePlacement<T>[] {
  const sorted = [...items].sort(byOccurrenceTime);
  const base = sorted[0];
  if (!base) return [];
  return sorted.map((source) => {
    const offsetDays = Math.round(
      (new Date(`${source.date}T00:00:00Z`).getTime() - new Date(`${base.date}T00:00:00Z`).getTime()) / 86400000,
    );
    const offsetMinutes = source.startMin - base.startMin;
    const startMin = targetStartMin + offsetMinutes;
    return {
      source,
      date: addDays(targetDate, offsetDays),
      startMin,
      endMin: startMin + (source.endMin - source.startMin),
      offsetDays,
      offsetMinutes,
    };
  });
}

/** C-7 다중 이동 — 잡은 블록 대비 날짜·분 delta를 선택 전체에 같은 값으로 적용한다. */
export function movePlacements<T extends OccurrenceIdentity>(
  items: T[],
  anchor: T,
  targetDate: string,
  targetStartMin: number,
): RelativePlacement<T>[] | null {
  const deltaDays = Math.round(
    (new Date(`${targetDate}T00:00:00Z`).getTime() - new Date(`${anchor.date}T00:00:00Z`).getTime()) / 86400000,
  );
  const deltaMinutes = snap15(targetStartMin) - anchor.startMin;
  const placed = items.map((source) => ({
    source,
    date: addDays(source.date, deltaDays),
    startMin: source.startMin + deltaMinutes,
    endMin: source.endMin + deltaMinutes,
    offsetDays: deltaDays,
    offsetMinutes: deltaMinutes,
  }));
  return placed.some((x) => x.startMin < 0 || x.endMin > 24 * 60) ? null : placed;
}
