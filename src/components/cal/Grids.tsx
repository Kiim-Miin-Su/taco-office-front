/** @file-guide
 * 목적: Grids.tsx — ColAxis, DropData, GridProps, DayGridProps, DayGrid 등 (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 격자 셋 — **배치만** 한다. 칸의 생김새와 행동은 전부 `CalCell`·`EventBlock` 이 갖는다.
 *
 * §7 일간   시간 비례 격자 — 리프 컬럼 × **30분 슬롯을 실제 노드로** 반복한다 (`CALENDAR §2.5`).
 *           드롭 타깃이 셀이고, 셀 상태(불가·마감)를 칠할 자리가 셀이고, Figma 재현도 셀이다.
 *           눈속임(그라디언트 세로선)을 쓰지 않는다.
 * §8 주간   공통 시간축 × 요일 7열 — 칸이 곧 날짜 드롭 타깃, 겹침은 평행 lane
 * §9 월간   달력 · 최대 3건 + 「+N건 더」 — 〃
 *
 * 일간의 강의실/강사 열은 첫 건 + 「+N」으로 접고, 주간의 날짜 열은 원문처럼
 * 평행 lane으로 미리 보여 준다. 두 보기는 같은 `overlapClusters` 결과를 소비한다.
 */
'use client';
import { useId, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { CalCell } from './CalCell';
import { EventBlock } from './EventBlock';
import { cn } from '../ui/cn';
import {
  HOUR_PX, KO_DOW, SLOT_MIN, dowOf, hhmm, nowMinKst, occurrenceKey, overlapClusters, timeRange,
  todayKst, weekDays, type CalendarColAxis, type SelectMode,
} from '@/lib/calendar';
import type { Occurrence } from '@/api/types';
import type { CalendarColorOf } from '@/lib/tokens';

/** 빈 칸이 매번 새 배열을 만들면 CalCell 이 매번 다시 그려진다 */
const EMPTY: Occurrence[] = [];

/** 세로 축 낱말은 `lib/calendar` 한 곳이 갖는다 — 격자와 표 상태가 각자 정의하면 갈린다. */
export type ColAxis = CalendarColAxis;

/** 드롭 타깃 payload — 페이지의 onDragEnd 가 이 모양만 읽는다 */
export type DropData =
  | { type: 'slot'; date: string; colAxis: ColAxis; colId: number | null; slotMin: number }
  | { type: 'weekSlot'; date: string; slotMin: number }
  | { type: 'day'; date: string };

export interface GridProps {
  date: string;
  items: Occurrence[];
  subName?: (o: Occurrence) => string | undefined;
  colorOf?: CalendarColorOf;
  onOpen?: (o: Occurrence) => void;
  onSelect?: (o: Occurrence, mode: SelectMode) => void;
  selected?: ReadonlySet<string>;
  /** 붙여넣기 커서가 놓인 날짜 — 목록형 보기의 대상 링 */
  cursorDate?: string | null;
  onAdd?: (date: string) => void;
  onPickDate?: (date: string) => void;
  /** 잡아서 옮길 수 있는가 — 권한(canCrudAll)을 페이지가 여기로 내린다 */
  interactive?: boolean;
}

export interface WeekGridProps extends GridProps {
  /** 주간 빈 칸은 날짜만이 아니라 실제 30분 슬롯 시각까지 전달한다. */
  onAddAt?: (date: string, startMin: number) => void;
  /** 붙여넣기 커서도 날짜와 시각이 모두 같은 슬롯만 표시한다. */
  cursor?: { date: string; startMin: number } | null;
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
  cursor?: { date: string; startMin: number; colAxis: ColAxis; colId: number | null } | null;
}

/** 30분 슬롯 하나 — **실제 노드**다. 드롭 타깃이자 셀 상태의 자리 (§2.5) */
function Slot({ date, colAxis, colId, slotMin, hourLine, active, onAddAt }: {
  date: string; colAxis: ColAxis; colId: number | null; slotMin: number; hourLine: boolean;
  active?: boolean;
  onAddAt?: (date: string, startMin: number, colId: number | null) => void;
}) {
  const instanceId = useId();
  const d = useDroppable({
    id: `slot|${instanceId}|${date}|${colAxis}|${colId ?? 'null'}|${slotMin}`,
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
        active && 'bg-blue/10 ring-2 ring-inset ring-blue',
        d.isOver && 'bg-blue/10',
      )}
      style={{ height: HOUR_PX / 2 }}
    />
  );
}

/** 주간 30분 슬롯 — 월간의 날짜 drop과 분리해 세로 좌표를 잃지 않는다. */
function WeekSlot({ date, slotMin, hourLine, active, onAddAt, interactive }: {
  date: string; slotMin: number; hourLine: boolean; active?: boolean;
  onAddAt?: (date: string, startMin: number) => void; interactive?: boolean;
}) {
  const instanceId = useId();
  const drop = useDroppable({
    id: `week-slot|${instanceId}|${date}|${slotMin}`,
    data: { type: 'weekSlot', date, slotMin } satisfies DropData,
    disabled: !interactive,
  });
  return (
    <button
      ref={drop.setNodeRef}
      type="button"
      aria-label={`${date} ${hhmm(slotMin)} 빈 시간 선택`}
      onClick={() => onAddAt?.(date, slotMin)}
      className={cn(
        'block w-full border-r border-line text-left',
        hourLine ? 'border-b border-b-line' : 'border-b border-b-line/40',
        onAddAt && 'cursor-cell hover:bg-blue/[0.04]',
        active && 'bg-blue/10 ring-2 ring-inset ring-blue',
        drop.isOver && 'bg-blue/10',
      )}
      style={{ height: HOUR_PX / 2 }}
    />
  );
}

export function DayGrid({
  date, items, columns, columnOf, colAxis, subName, colorOf, onOpen, onSelect, selected, onAddAt, cursor, interactive,
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
                        active={cursor?.date === date && cursor.startMin === m && cursor.colAxis === colAxis && cursor.colId === c.id}
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
                        <EventBlock occ={head} subName={subName?.(head)} color={colorOf?.(head)} compact={head.endMin - head.startMin < 45}
                                    onClick={() => onOpen?.(head)}
                                    onSelect={onSelect} selected={selected?.has(occurrenceKey(head))}
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
                            <EventBlock key={`${o.serId}|${o.onDate}`} occ={o} subName={subName?.(o)} color={colorOf?.(o)} compact
                                        onClick={() => { setOpenCluster(null); onOpen?.(o); }}
                                        onSelect={onSelect} selected={selected?.has(occurrenceKey(o))} />
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

/* ── §8·10·11 주간 — 공통 시간축 × 요일 7열 ─────────────────────────── */

export function WeekGrid({
  date, items, subName, colorOf, onOpen, onSelect, selected, onPickDate, interactive, onAddAt, cursor,
}: WeekGridProps) {
  const days = weekDays(date);
  const map = useMemo(() => byDate(items), [items]);
  // §08·10·11은 보기마다 별도 목록을 만들지 않는다. 같은 회차 배열에서 한 번 구한
  // 공통 범위를 7개 날짜 열이 공유해야 세로 좌표가 서로 어긋나지 않는다.
  const { from, to } = useMemo(() => timeRange(items), [items]);
  const slots = useMemo(() => {
    const out: number[] = [];
    for (let m = from; m < to; m += SLOT_MIN) out.push(m);
    return out;
  }, [from, to]);
  const height = ((to - from) / 60) * HOUR_PX;
  const px = (m: number) => ((m - from) / 60) * HOUR_PX;
  const now = nowMinKst();
  const showNow = days.includes(todayKst()) && now >= from && now <= to;

  return (
    <div data-png-expand className="overflow-x-auto rounded-xl border border-line bg-card" role="region" aria-label="주간 시간표">
      <div className="min-w-[900px]">
        <div className="grid border-b border-line bg-fg text-white"
             style={{ gridTemplateColumns: '56px repeat(7, minmax(112px, 1fr))' }}>
          <div className="border-r border-white/10 p-2 text-[11px] font-bold text-white/65">시간</div>
          {days.map((d) => {
            const n = map.get(d)?.length ?? 0;
            const dow = dowOf(d);
            const isToday = d === todayKst();
            return (
              <button key={d} type="button" onClick={() => onPickDate?.(d)}
                aria-label={`${d} (${KO_DOW[dow]}) 날짜 선택`}
                className={cn(
                  'border-r border-white/10 px-2 py-1.5 text-center transition-colors last:border-r-0 hover:bg-white/10 focus-visible:outline-blue',
                  isToday && 'bg-blue',
                )}>
                <div className={cn('text-[11px] font-bold', !isToday && dow === 0 ? 'text-red-300' : !isToday && dow === 6 ? 'text-blue-300' : 'text-white/75')}>
                  {KO_DOW[dow]}
                </div>
                <div className="text-[14px] font-bold">{+d.slice(8, 10)}</div>
                <div className={cn('text-[10px]', n ? 'font-bold text-amber-300' : 'text-white/70')}>{n ? `${n}건` : '—'}</div>
              </button>
            );
          })}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(112px, 1fr))' }}>
          <div className="relative border-r border-line bg-card" style={{ height }}>
            {slots.filter((m) => m % 60 === 0).map((m) => (
              <div key={m} className="absolute inset-x-0 px-1.5 pt-1 text-[11px] font-bold text-fg-subtle"
                   style={{ top: px(m) }}>
                {hhmm(m)}
              </div>
            ))}
          </div>

          {days.map((d) => {
            const mine = map.get(d) ?? EMPTY;
            const clusters = overlapClusters(mine);
            return (
              <div key={d} data-week-date={d} className="relative" style={{ height }}>
                <div className="absolute inset-0">
                  {slots.map((m) => (
                    <WeekSlot key={m} date={d} slotMin={m} hourLine={(m + SLOT_MIN) % 60 === 0}
                      active={cursor?.date === d && cursor.startMin === m}
                      onAddAt={interactive ? onAddAt : undefined} interactive={interactive} />
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-0">
                  {clusters.flatMap((cluster) => cluster.map((o, lane) => {
                    // 명세의 겹친 수업은 감추지 않고 같은 시간대 안에서 평행 미리보기한다.
                    // 군집 폭을 한 번만 나눠 학생별·선생님별도 완전히 같은 배치를 소비한다.
                    const laneCount = cluster.length;
                    const gap = 2;
                    const left = `calc(${(lane / laneCount) * 100}% + ${lane === 0 ? gap : gap / 2}px)`;
                    const width = `calc(${100 / laneCount}% - ${gap + gap / laneCount}px)`;
                    return (
                      <div key={`${occurrenceKey(o)}|${lane}`} data-week-event={occurrenceKey(o)}
                           className="pointer-events-auto absolute z-[1] transition-[top,height,left,width]"
                           style={{
                             top: px(o.startMin) + 1,
                             height: Math.max(20, px(o.endMin) - px(o.startMin) - 2),
                             left,
                             width,
                           }}>
                        <EventBlock occ={o} subName={subName?.(o)} color={colorOf?.(o)}
                                    compact={o.endMin - o.startMin < 45}
                                    onClick={() => onOpen?.(o)} onSelect={onSelect}
                                    selected={selected?.has(occurrenceKey(o))} draggable={interactive} />
                      </div>
                    );
                  }))}
                </div>
              </div>
            );
          })}

          {showNow ? (
            <div className="pointer-events-none absolute left-[56px] right-0 z-10 border-t-2 border-red"
                 style={{ top: px(now) }}>
              <span className="absolute -top-2 left-1 rounded bg-red px-1 text-[10px] font-bold text-white">{hhmm(now)}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── §9 월간 — 달력 · 최대 3건 ───────────────────────────────────────── */

export function MonthGrid({
  date, items, grid, subName, colorOf, onOpen, onSelect, selected, cursorDate, onAdd, onPickDate, interactive,
}: GridProps & { grid: string[] }) {
  const map = byDate(items);
  const mon = date.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="grid grid-cols-7 border-b border-line bg-inset">
        {grid.slice(0, 7).map((d) => {
          const dow = dowOf(d);
          return (
            <div key={d} className={cn('border-r border-line p-1.5 text-[11px] font-bold last:border-r-0',
              dow === 0 ? 'text-red' : dow === 6 ? 'text-blue' : 'text-fg-subtle')}>{KO_DOW[dow]}</div>
          );
        })}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((d) => (
          <CalCell key={d} date={d} head={+d.slice(8, 10)} items={map.get(d) ?? EMPTY}
                   subName={subName} colorOf={colorOf} max={3} onOpen={onOpen} onSelect={onSelect} selected={selected}
                   active={cursorDate === d}
                   onAdd={onAdd} onPickDate={onPickDate} onMore={onPickDate}
                   muted={d.slice(0, 7) !== mon} compact
                   droppable={interactive} draggable={interactive} />
        ))}
      </div>
    </div>
  );
}
