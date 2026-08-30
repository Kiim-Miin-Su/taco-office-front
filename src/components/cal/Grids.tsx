/**
 * 격자 셋 — **배치만** 한다. 칸의 생김새와 행동은 전부 `CalCell` 이 갖는다.
 *
 * §7 일간   가로 강의실 × 세로 시간 · 현재 시각 빨간 선
 * §8 주간   요일 7칸 · 요일별 건수
 * §9 월간   달력 · 최대 3건 + 「+N건 더」
 *
 * 세 격자가 다른 것은 **칸을 어디에 놓는가**뿐이다. 색·취소·온라인 표시는
 * `EventBlock` 하나가 정하고, 오늘 표시·빈 칸 클릭·넘침 접기는 `CalCell` 하나가 정한다.
 */
'use client';
import { useMemo } from 'react';
import { CalCell } from './CalCell';

/** 빈 칸이 매번 새 배열을 만들면 CalCell 이 매번 다시 그려진다 */
const EMPTY: Occurrence[] = [];
import { cn } from '../ui/cn';
import { KO_DOW, dowOf, hhmm, nowMinKst, timeRange, todayKst, weekDays } from '@/lib/calendar';
import type { Occurrence } from '@/api/types';

export interface GridProps {
  date: string;
  items: Occurrence[];
  subName?: (o: Occurrence) => string | undefined;
  onOpen?: (o: Occurrence) => void;
  onAdd?: (date: string) => void;
  onPickDate?: (date: string) => void;
}

const byDate = (items: Occurrence[]) => {
  const m = new Map<string, Occurrence[]>();
  for (const o of items) {
    if (!m.has(o.date)) m.set(o.date, []);
    m.get(o.date)!.push(o);
  }
  for (const v of m.values()) v.sort((a, b) => a.startMin - b.startMin);
  return m;
};

/* ── §7 일간 — 가로 강의실 × 세로 시간 ───────────────────────────────── */

export interface DayGridProps extends GridProps {
  /** 세로 열 — 강의실이 기본이고, 선생님별 보기는 강사로 바꿔 준다 */
  columns: Array<{ id: number | null; name: string }>;
  columnOf: (o: Occurrence) => number | null;
}

export function DayGrid({ date, items, columns, columnOf, subName, onOpen, onAdd }: DayGridProps) {
  const today = useMemo(() => items.filter((o) => o.date === date), [items, date]);
  const { from, to } = timeRange(today);
  const hours = Math.ceil((to - from) / 60);

  /**
   * 칸마다 하루치를 다시 훑지 않는다.
   *
   * 원래는 `today.filter(...)` 가 `시각 × 열` 안에 있어서 (13시간 × 7열 ≈ 91번)
   * 한 번 그릴 때마다 하루치를 91번 스캔했다. 서랍을 여닫기만 해도 그 일이 다시 돌았다.
   * 한 번 훑어 `열-시각` 칸으로 나눠 두면 각 칸은 자기 배열을 꺼내 쓰기만 하면 된다.
   */
  const cells = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of today) {
      const slot = from + Math.floor((o.startMin - from) / 60) * 60;
      const k = `${columnOf(o)}-${slot}`;
      const arr = m.get(k);
      if (arr) arr.push(o); else m.set(k, [o]);
    }
    return m;
  }, [today, from, columnOf]);
  const now = nowMinKst();
  const showNow = date === todayKst() && now >= from && now <= to;

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <div className="min-w-[720px]">
        <div className="grid border-b border-line bg-inset text-[11px] font-bold text-fg-subtle"
             style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(120px, 1fr))` }}>
          <div className="border-r border-line p-1.5">시각</div>
          {columns.map((c) => (
            <div key={String(c.id)} className="border-r border-line p-1.5">{c.name}</div>
          ))}
        </div>

        <div className="relative grid"
             style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(120px, 1fr))` }}>
          {Array.from({ length: hours }, (_, h) => {
            const min = from + h * 60;
            return (
              <div key={min} className="contents">
                <div className="border-b border-r border-line p-1.5 text-[11px] text-fg-subtle">{hhmm(min)}</div>
                {columns.map((c) => (
                  <CalCell
                    key={`${c.id}-${min}`}
                    date={date}
                    items={cells.get(`${c.id}-${min}`) ?? EMPTY}
                    subName={subName}
                    onOpen={onOpen}
                    onAdd={onAdd}
                    compact
                    className="min-h-[56px]"
                  />
                ))}
              </div>
            );
          })}

          {/* 지금 이 순간 — 빨간 선 (§7) */}
          {showNow ? (
            <div
              className="pointer-events-none absolute left-[56px] right-0 border-t-2 border-red"
              style={{ top: `${((now - from) / 60) * 56}px` }}
            >
              <span className="absolute -top-2 left-1 rounded bg-red px-1 text-[10px] font-bold text-white">
                {hhmm(now)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── §8 주간 — 요일 7칸 ──────────────────────────────────────────────── */

export function WeekGrid({ date, items, subName, onOpen, onAdd, onPickDate }: GridProps) {
  const days = weekDays(date);
  const map = byDate(items);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="grid grid-cols-7 border-b border-line bg-inset">
        {days.map((d) => {
          const n = map.get(d)?.length ?? 0;
          return (
            <button key={d} type="button" onClick={() => onPickDate?.(d)}
              className="border-r border-line p-2 text-left transition-colors last:border-r-0 hover:bg-blue/5">
              <div className={cn('text-[11px] font-bold', dowOf(d) === 0 ? 'text-red' : dowOf(d) === 6 ? 'text-blue' : 'text-fg-subtle')}>
                {KO_DOW[dowOf(d)]}
              </div>
              <div className="text-[13px] font-bold text-fg">{+d.slice(8, 10)}</div>
              <div className="text-[10px] text-fg-subtle">{n ? `${n}건` : '—'}</div>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => (
          <CalCell key={d} date={d} items={map.get(d) ?? []} subName={subName}
                   onOpen={onOpen} onAdd={onAdd} className="min-h-[220px]" compact />
        ))}
      </div>
    </div>
  );
}

/* ── §9 월간 — 달력 · 최대 3건 ───────────────────────────────────────── */

export function MonthGrid({ date, items, grid, subName, onOpen, onAdd, onPickDate }: GridProps & { grid: string[] }) {
  const map = byDate(items);
  const mon = date.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="grid grid-cols-7 border-b border-line bg-inset">
        {KO_DOW.map((k, i) => (
          <div key={k} className={cn('border-r border-line p-1.5 text-[11px] font-bold last:border-r-0',
            i === 0 ? 'text-red' : i === 6 ? 'text-blue' : 'text-fg-subtle')}>{k}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((d) => (
          <CalCell key={d} date={d} head={+d.slice(8, 10)} items={map.get(d) ?? []}
                   subName={subName} max={3} onOpen={onOpen} onAdd={onAdd} onMore={onPickDate}
                   muted={d.slice(0, 7) !== mon} compact />
        ))}
      </div>
    </div>
  );
}
