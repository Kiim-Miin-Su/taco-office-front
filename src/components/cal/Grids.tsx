/**
 * 격자 셋 — **배치만** 한다. 칸의 생김새와 행동은 전부 `CalCell`·`EventBlock` 이 갖는다.
 *
 * §7 일간   시간 비례 격자 — 리프 컬럼 × **30분 슬롯을 실제 노드로** 반복한다 (`CALENDAR §2.5`).
 *           드롭 타깃이 셀이고, 셀 상태(불가·마감)를 칠할 자리가 셀이고, Figma 재현도 셀이다.
 *           눈속임(그라디언트 세로선)을 쓰지 않는다.
 * §8 주간   요일 7칸 · 요일별 건수 — 칸이 곧 날짜 드롭 타깃
 * §9 월간   달력 · 최대 3건 + 「+N건 더」 — 〃
 *
 * 겹침은 폭을 N등분하지 않는다 — 첫 건만 그리고 「+N」으로 접는다 (`CALENDAR §4.5`).
 */
'use client';
import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { CalCell } from './CalCell';
import { EventBlock } from './EventBlock';
import { cn } from '../ui/cn';
import {
  HOUR_PX, KO_DOW, SLOT_MIN, dowOf, hhmm, nowMinKst, overlapClusters, timeRange, todayKst, weekDays,
} from '@/lib/calendar';
import type { Occurrence } from '@/api/types';

/** 빈 칸이 매번 새 배열을 만들면 CalCell 이 매번 다시 그려진다 */
const EMPTY: Occurrence[] = [];

export type ColAxis = 'room' | 'teacher';

/** 드롭 타깃 payload — 페이지의 onDragEnd 가 이 모양만 읽는다 */
export type DropData =
  | { type: 'slot'; date: string; colAxis: ColAxis; colId: number | null; slotMin: number }
  | { type: 'day'; date: string };

export interface GridProps {
  date: string;
  items: Occurrence[];
  subName?: (o: Occurrence) => string | undefined;
  onOpen?: (o: Occurrence) => void;
  onAdd?: (date: string) => void;
  onPickDate?: (date: string) => void;
  /** 잡아서 옮길 수 있는가 — 권한(canCrudAll)을 페이지가 여기로 내린다 */
  interactive?: boolean;
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

/* ── §7 일간 — 리프 컬럼 × 30분 슬롯 (시간 비례) ─────────────────────── */

export interface DayGridProps extends GridProps {
  /** 세로 열 — 강의실이 기본이고, 선생님별 보기는 강사로 바꿔 준다 */
  columns: Array<{ id: number | null; name: string }>;
  columnOf: (o: Occurrence) => number | null;
  /** 이 축이 드롭에서 무엇을 바꾸는지 정한다 (§4.4) */
  colAxis: ColAxis;
  /** 빈 슬롯을 누르면 그 시각으로 새 일정 (C-5 진입점) */
  onAddAt?: (date: string, startMin: number, colId: number | null) => void;
}

/** 30분 슬롯 하나 — **실제 노드**다. 드롭 타깃이자 셀 상태의 자리 (§2.5) */
function Slot({ date, colAxis, colId, slotMin, hourLine, onAddAt }: {
  date: string; colAxis: ColAxis; colId: number | null; slotMin: number; hourLine: boolean;
  onAddAt?: (date: string, startMin: number, colId: number | null) => void;
}) {
  const d = useDroppable({
    id: `slot|${date}|${colId ?? 'null'}|${slotMin}`,
    data: { type: 'slot', date, colAxis, colId, slotMin } satisfies DropData,
  });
  return (
    <div
      ref={d.setNodeRef}
      onClick={() => onAddAt?.(date, slotMin, colId)}
      className={cn(
        'border-r border-line',
        // 정시는 실선, 30분은 옅은 선 — 15분에는 선을 긋지 않는다 (§2.5)
        hourLine ? 'border-b border-b-line' : 'border-b border-b-line/40',
        onAddAt && 'cursor-cell hover:bg-blue/[0.04]',
        d.isOver && 'bg-blue/10',
      )}
      style={{ height: HOUR_PX / 2 }}
    />
  );
}

export function DayGrid({
  date, items, columns, columnOf, colAxis, subName, onOpen, onAddAt, interactive,
}: DayGridProps) {
  const today = useMemo(() => items.filter((o) => o.date === date), [items, date]);
  const { from, to } = timeRange(today);
  const slots = useMemo(() => {
    const out: number[] = [];
    for (let m = from; m < to; m += SLOT_MIN) out.push(m);
    return out;
  }, [from, to]);

  /** 컬럼별로 한 번만 나눈다 — 슬롯마다 하루치를 다시 훑지 않는다 */
  const byCol = useMemo(() => {
    const m = new Map<number | null, Occurrence[]>();
    for (const o of today) {
      const k = columnOf(o);
      const arr = m.get(k);
      if (arr) arr.push(o); else m.set(k, [o]);
    }
    return m;
  }, [today, columnOf]);

  /** 펼친 겹침 묶음 — 「+N」을 누르면 그 슬롯만 펼친다 (§4.5) */
  const [openCluster, setOpenCluster] = useState<string | null>(null);

  const now = nowMinKst();
  const showNow = date === todayKst() && now >= from && now <= to;
  const px = (m: number) => ((m - from) / 60) * HOUR_PX;

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card" onClick={() => setOpenCluster(null)}>
      <div className="min-w-[720px]">
        {/* 헤더와 본문이 같은 컬럼 폭 변수를 쓴다 — 각자 계산하면 1px 씩 어긋난다 (§2.5) */}
        <div className="grid border-b border-line bg-inset text-[11px] font-bold text-fg-subtle"
             style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(120px, 1fr))` }}>
          <div className="border-r border-line p-1.5">시각</div>
          {columns.map((c) => (
            <div key={String(c.id)} className="border-r border-line p-1.5">{c.name}</div>
          ))}
        </div>

        <div className="relative grid"
             style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(120px, 1fr))` }}>
          {/* 시간 눈금 — 본문과 같은 HOUR_PX 로 그린다 */}
          <div className="relative border-r border-line" style={{ height: (to - from) / 60 * HOUR_PX }}>
            {slots.filter((m) => m % 60 === 0).map((m) => (
              <div key={m} className="absolute left-0 right-0 p-1.5 text-[11px] text-fg-subtle" style={{ top: px(m) }}>
                {hhmm(m)}
              </div>
            ))}
          </div>

          {columns.map((c) => {
            const mine = byCol.get(c.id) ?? EMPTY;
            const clusters = overlapClusters(mine);
            return (
              <div key={String(c.id)} className="relative">
                {/* ① 슬롯 층 — 실제 셀. 드롭과 빈 칸 클릭을 받는다 */}
                {slots.map((m) => (
                  <Slot key={m} date={date} colAxis={colAxis} colId={c.id} slotMin={m}
                        hourLine={(m + SLOT_MIN) % 60 === 0}
                        onAddAt={interactive ? onAddAt : undefined} />
                ))}

                {/* ② 블록 층 — 시간 비례로 얹는다. 겹침 묶음은 첫 건 + 「+N」 (§4.5) */}
                {clusters.map((cl) => {
                  const head = cl[0];
                  const key = `${c.id}|${head.serId}|${head.onDate}|${head.startMin}`;
                  const expanded = openCluster === key;
                  const rest = cl.length - 1;
                  return (
                    <div key={key}>
                      <div className="absolute inset-x-1 transition-[top,height]"
                           style={{ top: px(head.startMin) + 1, height: Math.max(20, px(head.endMin) - px(head.startMin) - 2) }}>
                        <EventBlock occ={head} subName={subName?.(head)} compact={head.endMin - head.startMin < 45}
                                    onClick={() => onOpen?.(head)}
                                    draggable={interactive} resizable={interactive} />
                      </div>
                      {rest > 0 && !expanded ? (
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); setOpenCluster(key); }}
                          className="absolute right-1 z-10 rounded bg-fg px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
                          style={{ top: px(head.startMin) + 3 }}>
                          +{rest}
                        </button>
                      ) : null}
                      {expanded ? (
                        <div onClick={(e) => e.stopPropagation()}
                             className="absolute left-1 right-1 z-20 flex flex-col gap-1 rounded-lg border border-line bg-card p-1.5 shadow-lg"
                             style={{ top: px(head.startMin) + 3 }}>
                          {cl.map((o) => (
                            <EventBlock key={`${o.serId}|${o.onDate}`} occ={o} subName={subName?.(o)} compact
                                        onClick={() => { setOpenCluster(null); onOpen?.(o); }} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 지금 이 순간 — 빨간 선 (§7) */}
          {showNow ? (
            <div className="pointer-events-none absolute left-[56px] right-0 z-10 border-t-2 border-red"
                 style={{ top: px(now) }}>
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

export function WeekGrid({ date, items, subName, onOpen, onAdd, onPickDate, interactive }: GridProps) {
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
          <CalCell key={d} date={d} items={map.get(d) ?? EMPTY} subName={subName}
                   onOpen={onOpen} onAdd={onAdd} className="min-h-[220px]" compact
                   droppable={interactive} draggable={interactive} />
        ))}
      </div>
    </div>
  );
}

/* ── §9 월간 — 달력 · 최대 3건 ───────────────────────────────────────── */

export function MonthGrid({ date, items, grid, subName, onOpen, onAdd, onPickDate, interactive }: GridProps & { grid: string[] }) {
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
          <CalCell key={d} date={d} head={+d.slice(8, 10)} items={map.get(d) ?? EMPTY}
                   subName={subName} max={3} onOpen={onOpen} onAdd={onAdd} onMore={onPickDate}
                   muted={d.slice(0, 7) !== mon} compact
                   droppable={interactive} draggable={interactive} />
        ))}
      </div>
    </div>
  );
}
