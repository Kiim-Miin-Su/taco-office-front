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
 *
 * lane 은 **셋까지**다(N-74) — 넘치면 셋만 나란히 두고 「+M」을 단다. 주간의 「+M」은 그날 일간으로 가고
 * (원문 §08 「날짜 머리 클릭 → 그날 일간」), 일간 기본 모양(날짜 한 열 · N-80)의 「+M」은 그 묶음을 펼친다.
 * 둘 다 `laneLayout` 한 함수를 쓴다.
 */
'use client';
import { useId, useMemo, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CalCell } from './CalCell';
import { EventBlock, blockDetailLines, type DragData } from './EventBlock';
import blockStyles from './EventBlock.module.css';
import { cn } from '../ui/cn';
import {
  HOUR_PX, KO_DOW, SLOT_MIN, dowOf, hhmm, laneLayout, longDateLabel, nowMinKst, occurrenceKey, overlapClusters,
  periodSummary, timeRange, todayKst, weekDays, type CalendarColAxis, type SelectMode,
} from '@/lib/calendar';
import type { Occurrence } from '@/api/types';
import type { CalendarColorOf } from '@/lib/tokens';

/** 빈 칸이 매번 새 배열을 만들면 CalCell 이 매번 다시 그려진다 */
const EMPTY: Occurrence[] = [];

/** 세로 축 낱말은 `lib/calendar` 한 곳이 갖는다 — 격자와 표 상태가 각자 정의하면 갈린다. */
export type ColAxis = CalendarColAxis;

/** 드롭 타깃 payload — 페이지의 onDragEnd 가 이 모양만 읽는다 */
export type DropData =
  | { type: 'slot'; paneId: number; date: string; colAxis: ColAxis; colId: number | null; slotMin: number }
  | { type: 'weekSlot'; paneId: number; date: string; slotMin: number }
  | { type: 'day'; date: string };

/** 생성 드래그 중 화면에 칠하는 범위. 저장 초안과 같은 계산 결과만 받는다. */
export interface CreatePreview {
  paneId: number;
  date: string;
  startMin: number;
  endMin: number;
  colAxis?: ColAxis;
  colId?: number | null;
}

export interface GridProps {
  date: string;
  items: Occurrence[];
  /** 분할 표의 동일 날짜·열을 구별하는 실제 pane identity. 단독 격자는 0. */
  paneId?: number;
  createPreview?: CreatePreview | null;
  creating?: boolean;
  subName?: (o: Occurrence) => string | undefined;
  /** 블록의 종류 배지·줌 계정 장소 줄 — 코드표 lookup 을 페이지가 한 벌로 내린다 (원문 §07·§08) */
  kindName?: (o: Occurrence) => string | undefined;
  zaccLabel?: (o: Occurrence) => string | undefined;
  /** 종류의 정원 — 블록의 정원 점(●●●○). 코드표 meta.kinds.cap 을 페이지가 한 벌로 내린다 */
  capOf?: (o: Occurrence) => number | undefined;
  /** 개인표(§10·§11) — 블록이 「과목 / 시간대 / 강사(학생별)·학생(선생님별)」 세 줄로 선다 */
  person?: 'student' | 'teacher';
  colorOf?: CalendarColorOf;
  onOpen?: (o: Occurrence) => void;
  onSelect?: (o: Occurrence, mode: SelectMode) => void;
  selected?: ReadonlySet<string>;
  /** 붙여넣기 커서가 놓인 날짜 — 목록형 보기의 대상 링 */
  cursorDate?: string | null;
  onAdd?: (date: string) => void;
  onSelectDate?: (date: string) => void;
  onPickDate?: (date: string) => void;
  /** 잡아서 옮길 수 있는가 — 권한(canCrudAll)을 페이지가 여기로 내린다 */
  interactive?: boolean;
  /** 그날의 공휴일 이름 — 원문 §09 월간 칸 칩 · §10 요일 머리 (서버 표 HOLIDAY · 페이지가 lookup 한 벌로 내린다) */
  holidaysOf?: (date: string) => readonly string[] | undefined;
  /**
   * 그날 겹쳐 볼 강사 불가 시간 — 원문 §07·§11 「가능 시간」(G37 · 관리자 읽기). 주면 시간 비례 격자가
   * 빗금 띠를 깔고, 일간 「빈 시간 찾기」는 그 시각을 빈 칸으로 치지 않는다. 막는 자료가 아니다(저장은 서버가 판정).
   */
  unavOf?: (date: string) => readonly UnavBand[] | undefined;
}

/** 격자에 까는 강사 불가 한 띠 — `label` 은 띠의 `title`(누가 · 몇 시 · 사유)이다 */
export interface UnavBand { startMin: number; endMin: number; label: string }

/** 불가 띠 한 칸 — 블록 아래·슬롯 위에 깔고 누르기는 통과시킨다(빈 칸 클릭·드롭을 막지 않는다) */
function UnavBands({ bands, px }: { bands: readonly UnavBand[] | undefined; px: (m: number) => number }) {
  if (!bands?.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {bands.map((b) => (
        <div key={`${b.startMin}-${b.endMin}-${b.label}`} data-unav={b.label} title={b.label} aria-label={b.label}
          className={cn('absolute inset-x-0', blockStyles.unavBand)}
          style={{ top: px(b.startMin), height: Math.max(4, px(b.endMin) - px(b.startMin)) }} />
      ))}
    </div>
  );
}

export interface WeekGridProps extends GridProps {
  /** 주간 빈 칸은 날짜만이 아니라 실제 30분 슬롯 시각까지 전달한다. */
  onAddAt?: (date: string, startMin: number) => void;
  onSelectAt?: (date: string, startMin: number) => void;
  /** 붙여넣기 커서도 날짜와 시각이 모두 같은 슬롯만 표시한다. */
  cursor?: { date: string; startMin: number } | null;
  /**
   * 요일 머리를 **어둡게** — 원문 §10·§11 개인표의 머리다. 전체 주간(§08)은 밝은 머리다.
   * 주지 않으면 밝은 머리.
   */
  dark?: boolean;
  /** 바닥 「합계 N회」 줄 — 원문 §10 개인표. 요일마다 「회 / 시간」(취소 제외 · 기간 집계와 같은 함수) */
  totals?: boolean;
  /**
   * 그릴 날짜 열 — 주지 않으면 그 주 7일. 일간 기본 모양(N-80 · 원문 §07 캡처 「날짜 한 열 + lane」)은
   * 그날 하루만 준다. lane 과 「+M」은 주간과 같은 함수다(N-74).
   */
  days?: readonly string[];
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
  /** 빈 슬롯을 더블클릭하면 그 시각으로 새 일정 (C-5 진입점) */
  onAddAt?: (date: string, startMin: number, colId: number | null) => void;
  onSelectAt?: (date: string, startMin: number, colId: number | null) => void;
  cursor?: { date: string; startMin: number; colAxis: ColAxis; colId: number | null } | null;
  /**
   * 원문 §07 「+ 빈 시간 찾기」 — 그 열(강의실)에 취소 아닌 수업이 걸치지 않은 30분 칸을 칠한다.
   * 이미 읽은 회차로 센다 · 「가능 시간」을 켜 `unavOf` 가 오면 강사 불가 시각도 빈 칸에서 뺀다(G37).
   */
  showFree?: boolean;
}

/** 30분 슬롯 하나 — **실제 노드**다. 드롭 타깃이자 셀 상태의 자리 (§2.5) */
function Slot({ paneId, date, colAxis, colId, slotMin, hourLine, active, free, createPreview, creating, onAddAt, onSelectAt }: {
  paneId: number; date: string; colAxis: ColAxis; colId: number | null; slotMin: number; hourLine: boolean;
  active?: boolean;
  /** 빈 시간 찾기가 켜졌고 이 칸이 비었다 */
  free?: boolean;
  createPreview?: CreatePreview | null;
  creating?: boolean;
  onAddAt?: (date: string, startMin: number, colId: number | null) => void;
  onSelectAt?: (date: string, startMin: number, colId: number | null) => void;
}) {
  const instanceId = useId();
  const d = useDroppable({
    id: `slot|${instanceId}|${date}|${colAxis}|${colId ?? 'null'}|${slotMin}`,
    data: { type: 'slot', paneId, date, colAxis, colId, slotMin } satisfies DropData,
  });
  const drag = useDraggable({
    id: `create-slot|${instanceId}|${date}|${colAxis}|${colId ?? 'null'}|${slotMin}`,
    data: { type: 'create', paneId, date, startMin: slotMin, colAxis, colId } satisfies DragData,
    disabled: !onAddAt,
  });
  const previewed = createPreview?.paneId === paneId && createPreview.date === date
    && createPreview.colAxis === colAxis && createPreview.colId === colId
    && slotMin >= createPreview.startMin && slotMin < createPreview.endMin;
  return (
    <button
      ref={(node) => { d.setNodeRef(node); drag.setNodeRef(node); }}
      {...(onAddAt ? drag.listeners : {})}
      {...(onAddAt ? drag.attributes : {})}
      type="button"
      aria-label={`${date} ${hhmm(slotMin)} ${colAxis === 'room' ? '강의실' : '강사'} ${colId ?? '미지정'} 빈 시간 선택`}
      data-free={free ? '' : undefined}
      data-create-preview-slot={previewed ? '' : undefined}
      onClick={() => onSelectAt?.(date, slotMin, colId)}
      onDoubleClick={() => onAddAt?.(date, slotMin, colId)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onAddAt?.(date, slotMin, colId);
      }}
      className={cn(
        'block w-full appearance-none border-r border-line p-0 text-left',
        // 정시는 실선, 30분은 옅은 선 — 15분에는 선을 긋지 않는다 (§2.5)
        hourLine ? 'border-b border-b-line' : 'border-b border-b-line/40',
        free && 'bg-green/[0.10]',
        onAddAt && 'touch-none select-none cursor-cell hover:bg-blue/[0.04]',
        active && 'bg-blue/10 ring-2 ring-inset ring-blue',
        previewed && 'bg-blue/20 ring-1 ring-inset ring-blue/50',
        d.isOver && !creating && 'bg-blue/10',
      )}
      style={{ height: HOUR_PX / 2 }}
    />
  );
}

/** 주간 30분 슬롯 — 월간의 날짜 drop과 분리해 세로 좌표를 잃지 않는다. */
function WeekSlot({ paneId, date, slotMin, hourLine, active, createPreview, creating, onAddAt, onSelectAt, interactive }: {
  paneId: number; date: string; slotMin: number; hourLine: boolean; active?: boolean;
  createPreview?: CreatePreview | null; creating?: boolean;
  onAddAt?: (date: string, startMin: number) => void; interactive?: boolean;
  onSelectAt?: (date: string, startMin: number) => void;
}) {
  const instanceId = useId();
  const drop = useDroppable({
    id: `week-slot|${instanceId}|${date}|${slotMin}`,
    data: { type: 'weekSlot', paneId, date, slotMin } satisfies DropData,
    disabled: !interactive,
  });
  const drag = useDraggable({
    id: `create-week-slot|${instanceId}|${date}|${slotMin}`,
    data: { type: 'create', paneId, date, startMin: slotMin } satisfies DragData,
    disabled: !interactive,
  });
  const previewed = createPreview?.paneId === paneId && createPreview.date === date
    && createPreview.colAxis === undefined
    && slotMin >= createPreview.startMin && slotMin < createPreview.endMin;
  return (
    <button
      ref={(node) => { drop.setNodeRef(node); drag.setNodeRef(node); }}
      {...(interactive ? drag.listeners : {})}
      {...(interactive ? drag.attributes : {})}
      type="button"
      aria-label={`${date} ${hhmm(slotMin)} 빈 시간 선택`}
      data-create-preview-slot={previewed ? '' : undefined}
      onClick={() => onSelectAt?.(date, slotMin)}
      onDoubleClick={() => onAddAt?.(date, slotMin)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onAddAt?.(date, slotMin);
      }}
      className={cn(
        'block w-full border-r border-line text-left',
        hourLine ? 'border-b border-b-line' : 'border-b border-b-line/40',
        onAddAt && 'touch-none select-none cursor-cell hover:bg-blue/[0.04]',
        active && 'bg-blue/10 ring-2 ring-inset ring-blue',
        previewed && 'bg-blue/20 ring-1 ring-inset ring-blue/50',
        drop.isOver && !creating && 'bg-blue/10',
      )}
      style={{ height: HOUR_PX / 2 }}
    />
  );
}

export function DayGrid({
  date, items, paneId = 0, createPreview, creating, columns, columnOf, colAxis, subName, kindName, zaccLabel, capOf, person, colorOf, onOpen, onSelect, selected, onAddAt, onSelectAt, cursor, interactive,
  showFree = false, unavOf,
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
  // 「가능 시간」을 켜 두면 강사가 불가로 적은 시각은 빈 시간이 아니다 (원문 §07 · G37)
  const bands = unavOf?.(date);
  const unavAt = (m: number) => Boolean(bands?.some((b) => b.startMin < m + SLOT_MIN && b.endMin > m));

  return (
    <div data-calendar-grid className="overflow-x-auto rounded-xl border border-line bg-card" onClick={() => setOpenCluster(null)}>
      <div className="min-w-[720px]">
        {/* 헤더와 본문이 같은 컬럼 폭 변수를 쓴다 — 각자 계산하면 1px 씩 어긋난다 (§2.5) */}
        <div className="grid border-b border-line bg-inset text-[11px] font-bold text-fg-subtle"
             style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(120px, 1fr))` }}>
          {/* 원문 §07 「한국 시간」 — 관리자 화면은 언제나 서울 시간이다 (D-R12) */}
          <div className="border-r border-line p-1.5">한국 시간</div>
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
                  <Slot key={m} paneId={paneId} date={date} colAxis={colAxis} colId={c.id} slotMin={m}
                        hourLine={(m + SLOT_MIN) % 60 === 0}
                        active={cursor?.date === date && cursor.startMin === m && cursor.colAxis === colAxis && cursor.colId === c.id}
                        createPreview={createPreview} creating={creating}
                        free={showFree && c.id !== null && !unavAt(m) && !mine.some((o) => !o.canceled && o.startMin < m + SLOT_MIN && o.endMin > m)}
                        onAddAt={interactive ? onAddAt : undefined}
                        onSelectAt={interactive ? onSelectAt : undefined} />
                ))}
                <UnavBands bands={bands} px={px} />

                {/* ② 블록 층 — 시간 비례로 얹는다. 겹침 묶음은 첫 건 + 「+N」 (§4.5) */}
                {clusters.map((cl) => {
                  const head = cl[0];
                  const key = `${c.id}|${head.serId}|${head.onDate}|${head.startMin}`;
                  const expanded = openCluster === key;
                  const rest = cl.length - 1;
                  const blockHeight = Math.max(20, px(head.endMin) - px(head.startMin) - 2);
                  return (
                    <div key={key}>
                      <div className="absolute inset-x-1 transition-[top,height]"
                           style={{ top: px(head.startMin) + 1, height: blockHeight }}>
                        {/* 세부 줄 수는 이 칸이 그린 높이가 정한다 — 블록이 제 높이를 넘치지 않는다 */}
                        <EventBlock occ={head} subName={subName?.(head)} kindName={kindName?.(head)} zaccLabel={zaccLabel?.(head)}
                                    cap={capOf?.(head)} person={person} hideTime
                                    color={colorOf?.(head)} compact={head.endMin - head.startMin < 45}
                                    lines={blockDetailLines(blockHeight)}
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
                            <EventBlock key={`${o.serId}|${o.onDate}`} occ={o} subName={subName?.(o)} kindName={kindName?.(o)}
                                        zaccLabel={zaccLabel?.(o)} color={colorOf?.(o)} compact
                                        onClick={() => { setOpenCluster(null); onOpen?.(o); }}
                                        onSelect={onSelect} selected={selected?.has(occurrenceKey(o))}
                                        draggable={interactive} resizable={interactive} />
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
  date, items, paneId = 0, createPreview, creating, subName, kindName, zaccLabel, capOf, person, colorOf, onOpen, onSelect, selected, onPickDate, interactive, onAddAt, onSelectAt, cursor,
  dark = false, totals = false, holidaysOf, unavOf, days: onlyDays,
}: WeekGridProps) {
  const days = onlyDays ?? weekDays(date);
  const single = days.length === 1;
  /** 일간(날짜 한 열)의 「+M」 — 그 묶음만 펼친다. 주간의 「+M」은 그날 일간으로 간다 */
  const [openCluster, setOpenCluster] = useState<string | null>(null);
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

  const cols = `56px repeat(${days.length}, minmax(112px, 1fr))`;

  return (
    <div data-png-expand data-calendar-grid className="overflow-x-auto rounded-xl border border-line bg-card" role="region"
      aria-label={single ? '일간 시간표' : '주간 시간표'} onClick={() => setOpenCluster(null)}>
      <div className={single ? 'min-w-[360px]' : 'min-w-[900px]'}>
        {/* 머리 — 개인표(§10·§11)는 어둡고, 전체 주간(§08)은 밝은 머리에 「17일 · 8건」 한 줄이다 */}
        <div className={cn('grid border-b border-line', dark ? 'bg-fg text-white' : 'bg-inset text-fg')}
             style={{ gridTemplateColumns: cols }}>
          <div className={cn('border-r p-2 text-[11px] font-bold', dark ? 'border-white/10 text-white/65' : 'border-line text-fg-subtle')}>
            한국 시간
          </div>
          {days.map((d) => {
            const n = map.get(d)?.length ?? 0;
            const dow = dowOf(d);
            const isToday = d === todayKst();
            const body = (
              <>
                {dark ? (
                  <>
                    <div className={cn('text-[11px] font-bold', !isToday && dow === 0 ? 'text-red-300' : !isToday && dow === 6 ? 'text-blue-300' : 'text-white/75')}>
                      {KO_DOW[dow]}
                    </div>
                    <div className="text-[14px] font-bold">{+d.slice(8, 10)}</div>
                    <div className={cn('text-[10px]', n ? 'font-bold text-amber-300' : 'text-white/70')}>{n ? `${n}건` : '—'}</div>
                  </>
                ) : single ? (
                  /* 원문 §07 캡처의 일간 머리 두 줄 「26년 8월 21일 금요일 / 일정 21건」 */
                  <>
                    <div className={cn('text-[13px] font-bold', isToday ? 'text-blue' : 'text-fg')}>{longDateLabel(d)}</div>
                    <div className="text-[11px] text-fg-subtle">일정 {n}건</div>
                  </>
                ) : (
                  <>
                    <div className={cn('text-[13px] font-bold', dow === 0 ? 'text-red' : dow === 6 ? 'text-blue' : 'text-fg')}>
                      {KO_DOW[dow]}
                    </div>
                    <div className={cn('text-[11px]', isToday ? 'font-bold text-blue' : 'text-fg-subtle')}>
                      {+d.slice(8, 10)}일 · {n}건
                    </div>
                  </>
                )}
                {/* 원문 §10 요일 머리 아래 「광복절 대체」 — 이름은 서버 표 그대로 */}
                {holidaysOf?.(d)?.map((name) => (
                  <div key={name} data-holiday={name} title={name}
                    className={cn('truncate text-[10px] font-bold', dark ? 'text-red-300' : 'text-red')}>{name}</div>
                ))}
              </>
            );
            const look = cn(
              'border-r px-2 py-1.5 text-center last:border-r-0',
              dark ? 'border-white/10' : 'border-line',
              dark && isToday && 'bg-blue',
              !dark && isToday && 'bg-blue/10',
            );
            // 날짜 머리 클릭 → 그날 일간(원문 §08). 날짜 한 열(일간)은 이미 그날이라 갈 곳이 없다 — 눌리지 않는 단추를 세우지 않는다
            return !single ? (
              <button key={d} type="button" onClick={() => onPickDate?.(d)}
                aria-label={`${d} (${KO_DOW[dow]}) 날짜 선택`}
                className={cn(look, 'transition-colors focus-visible:outline-blue', dark ? 'hover:bg-white/10' : 'hover:bg-blue/[0.06]')}>
                {body}
              </button>
            ) : (
              <div key={d} data-day-head={d} className={look}>{body}</div>
            );
          })}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: cols }}>
          <div className="relative border-r border-line bg-card" style={{ height }}>
            {slots.filter((m) => m % 60 === 0).map((m) => (dark ? (
              /* 원문 §10·§11 개인표 눈금 — 큰 「12」 아래 작은 「13」: 그 한 시간 칸이 몇 시에서 몇 시까지인가 */
              <div key={m} data-hour-tick={m} className="absolute inset-x-0 pt-1.5 text-center leading-none"
                   style={{ top: px(m) }}>
                <div data-hour-start className="text-[15px] font-bold text-fg">{hhmm(m).slice(0, 2)}</div>
                <div data-hour-end className="mt-0.5 text-[10px] font-bold text-fg-subtle">{hhmm(m + 60).slice(0, 2)}</div>
              </div>
            ) : (
              <div key={m} className="absolute inset-x-0 px-1.5 pt-1 text-[11px] font-bold text-fg-subtle"
                   style={{ top: px(m) }}>
                {hhmm(m)}
              </div>
            )))}
          </div>

          {days.map((d) => {
            const mine = map.get(d) ?? EMPTY;
            const clusters = overlapClusters(mine);
            return (
              <div key={d} data-week-date={d} className="relative" style={{ height }}>
                <div className="absolute inset-0">
                  {slots.map((m) => (
                    <WeekSlot key={m} paneId={paneId} date={d} slotMin={m} hourLine={(m + SLOT_MIN) % 60 === 0}
                      active={cursor?.date === d && cursor.startMin === m}
                      createPreview={createPreview} creating={creating}
                      onAddAt={interactive ? onAddAt : undefined}
                      onSelectAt={interactive ? onSelectAt : undefined} interactive={interactive} />
                  ))}
                </div>
                <UnavBands bands={unavOf?.(d)} px={px} />
                <div className="pointer-events-none absolute inset-0">
                  {clusters.flatMap((cluster) => {
                    // 셋까지 나란히, 넘치면 「+M」 — 일간(날짜 한 열)과 같은 함수다 (N-74)
                    const { shown, more } = laneLayout(cluster);
                    const head = shown[0];
                    const key = `${d}|${occurrenceKey(head)}|${head.startMin}`;
                    const expanded = openCluster === key;
                    const extras = more > 0 ? [(
                      <button key={`${key}|more`} type="button" data-lane-more={more}
                        aria-label={single ? `겹친 수업 ${cluster.length}건 펼치기` : `${d} 겹친 수업 ${more}건 더 — 그날 일간으로`}
                        title={single ? '겹친 수업을 모두 펼칩니다' : '그날 일간 표로 갑니다'}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (single) setOpenCluster(key); else onPickDate?.(d);
                        }}
                        className="pointer-events-auto absolute right-0.5 z-[2] rounded bg-fg px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
                        style={{ top: px(head.startMin) + 3 }}>
                        +{more}
                      </button>
                    ), expanded ? (
                      <div key={`${key}|open`} onClick={(event) => event.stopPropagation()}
                        className="pointer-events-auto absolute left-1 right-1 z-20 flex flex-col gap-1 rounded-lg border border-line bg-card p-1.5 shadow-lg"
                        style={{ top: px(head.startMin) + 3 }}>
                        {cluster.map((o) => (
                          <EventBlock key={occurrenceKey(o)} occ={o} subName={subName?.(o)} kindName={kindName?.(o)}
                            zaccLabel={zaccLabel?.(o)} color={colorOf?.(o)} compact
                            onClick={() => { setOpenCluster(null); onOpen?.(o); }}
                            onSelect={onSelect} selected={selected?.has(occurrenceKey(o))}
                            draggable={interactive} />
                        ))}
                      </div>
                    ) : null] : [];
                    return [...shown.map((o, lane) => {
                      // 명세의 겹친 수업은 감추지 않고 같은 시간대 안에서 평행 미리보기한다.
                      // 군집 폭을 한 번만 나눠 학생별·선생님별도 완전히 같은 배치를 소비한다.
                      const laneCount = shown.length;
                      const gap = 2;
                      const left = `calc(${(lane / laneCount) * 100}% + ${lane === 0 ? gap : gap / 2}px)`;
                      const width = `calc(${100 / laneCount}% - ${gap + gap / laneCount}px)`;
                      const blockHeight = Math.max(20, px(o.endMin) - px(o.startMin) - 2);
                      return (
                        <div key={`${occurrenceKey(o)}|${lane}`} data-week-event={occurrenceKey(o)}
                             className="pointer-events-auto absolute z-[1] transition-[top,height,left,width]"
                             style={{
                               top: px(o.startMin) + 1,
                               height: blockHeight,
                               left,
                               width,
                             }}>
                          <EventBlock occ={o} subName={subName?.(o)} kindName={kindName?.(o)} zaccLabel={zaccLabel?.(o)}
                                      cap={capOf?.(o)} person={person} hideTime
                                      color={colorOf?.(o)}
                                      compact={o.endMin - o.startMin < 45} lines={blockDetailLines(blockHeight)}
                                      onClick={() => onOpen?.(o)} onSelect={onSelect}
                                      selected={selected?.has(occurrenceKey(o))} draggable={interactive} />
                        </div>
                      );
                    }), ...extras];
                  })}
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

        {/* 원문 §10 바닥 「합계 1회」 — 요일마다 「회 / 시간」. 세는 함수는 기간 집계와 같은 periodSummary 다 (D-R11 · N-19) */}
        {totals ? (
          <div className="grid border-t border-line" role="row" aria-label="합계"
               style={{ gridTemplateColumns: cols }}>
            <div className="flex items-baseline gap-1 border-r border-line bg-fg px-2 py-2 text-white">
              <span className="text-[12px] font-bold">합계</span>
              <span className="text-[10px] text-white/70">{items.filter((o) => !o.canceled).length}회</span>
            </div>
            {days.map((d) => {
              const day = periodSummary(map.get(d) ?? EMPTY);
              const held = day.total - day.canceled;
              return (
                <div key={d} data-week-total={d} className="border-r border-line bg-inset px-2 py-2 text-center last:border-r-0">
                  {held ? (
                    <>
                      <div className="text-[13px] font-bold text-fg">{held}</div>
                      <div className="text-[10px] text-fg-subtle">{day.hours.toFixed(1)}h</div>
                    </>
                  ) : <div className="text-[12px] text-line-2">—</div>}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── §9 월간 — 달력 · 최대 3건 ───────────────────────────────────────── */

export function MonthGrid({
  date, items, grid, subName, kindName, colorOf, onOpen, onSelect, selected, cursorDate, onAdd, onSelectDate, onPickDate, interactive, holidaysOf,
}: GridProps & { grid: string[] }) {
  const map = byDate(items);
  const mon = date.slice(0, 7);
  return (
    <div data-calendar-grid className="overflow-hidden rounded-xl border border-line bg-card">
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
                   subName={subName} kindName={kindName} colorOf={colorOf} max={3} onOpen={onOpen} onSelect={onSelect} selected={selected}
                   active={cursorDate === d}
                   onAdd={onAdd} onSelectDate={onSelectDate} onPickDate={onPickDate} onMore={onPickDate}
                   muted={d.slice(0, 7) !== mon} compact holidays={holidaysOf?.(d)}
                   droppable={interactive} draggable={interactive} />
        ))}
      </div>
    </div>
  );
}
