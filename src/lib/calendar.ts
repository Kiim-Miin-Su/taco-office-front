/**
 * 달력 계산 — **순수 함수만.** 화면은 여기서 나온 배열을 그리기만 한다.
 *
 * 일간·주간·월간·학생별·선생님별 다섯 보기가 **같은 범위를 한 번 읽고**
 * 여기서 나눈다 (`AGENT.md §6.1-2`). 보기마다 fetch 하면 전환할 때마다 왕복이 생기고,
 * 같은 날짜가 보기마다 다른 응답에서 오면 색이 갈린다.
 */

export type View = 'day' | 'week' | 'month' | 'student' | 'teacher';

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
