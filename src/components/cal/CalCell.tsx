/**
 * 달력 칸 **하나**. 일간·주간·월간·학생별·선생님별이 **전부 이것만** 쓴다.
 *
 * 격자마다 칸을 따로 만들면 테두리 · 오늘 표시 · 빈 칸 클릭 · 넘침 접기가
 * 다섯 벌 생기고, 한 곳만 고쳐진다. 격자는 **배치만** 하고 칸의 생김새와 행동은 여기 있다.
 *
 * 칸이 아는 것은 셋뿐이다 — 날짜 · 그날 블록들 · 빈 곳을 눌렀을 때.
 * 도메인 판정(색·취소·온라인)은 `EventBlock` 이 갖는다 (V26 §2.3).
 */
'use client';
import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '../ui/cn';
import { EventBlock } from './EventBlock';
import { occurrenceKey, todayKst, type SelectMode } from '@/lib/calendar';
import type { Occurrence } from '@/api/types';

export interface CalCellProps {
  /** 이 칸의 날짜 — 오늘이면 스스로 표시한다 */
  date: string;
  /** 왼쪽 위 라벨. 월간은 날짜 숫자, 주간은 요일, 일간 격자는 없음 */
  head?: ReactNode;
  /** 이 칸에 그릴 회차 */
  items: Occurrence[];
  /** 과목 이름 — 코드표에서 온다. 화면이 색·이름을 만들지 않는다 (D-R18) */
  subName?: (o: Occurrence) => string | undefined;
  /** 몇 개까지 보이고 나머지는 「+N건 더」로 접는다 (§9 · §36) */
  max?: number;
  onOpen?: (o: Occurrence) => void;
  onSelect?: (o: Occurrence, mode: SelectMode) => void;
  selected?: ReadonlySet<string>;
  /** 빈 곳을 누르면 그 날짜로 일정 추가 (§7) */
  onAdd?: (date: string) => void;
  /** 접힌 것을 눌렀을 때 — 보통 그날 일간으로 간다 */
  onMore?: (date: string) => void;
  compact?: boolean;
  className?: string;
  /** 이 달 밖의 날짜 — 월간 격자에서 흐리게 */
  muted?: boolean;
  /** 앱 내부 붙여넣기 커서가 놓인 날짜 */
  active?: boolean;
  /** 날짜 드롭 타깃으로 등록한다 — 주간·월간은 칸이 곧 날짜다 (TBO-41 · §5) */
  droppable?: boolean;
  /** 칸 안의 블록을 잡을 수 있는가 */
  draggable?: boolean;
  children?: ReactNode;
}

export function CalCell({
  date, head, items, subName, max, onOpen, onSelect, selected, onAdd, onMore, compact, className, muted, active,
  droppable, draggable, children,
}: CalCellProps) {
  const drop = useDroppable({
    id: `day|${date}`,
    data: { type: 'day', date },
    disabled: !droppable,
  });
  const isToday = date === todayKst();
  const shown = max ? items.slice(0, max) : items;
  const hidden = items.length - shown.length;

  return (
    <div
      ref={drop.setNodeRef}
      className={cn(
        'relative flex min-h-[78px] flex-col gap-1 border-b border-r border-line p-1.5',
        muted && 'bg-inset/40',
        isToday && 'bg-blue/[0.04]',
        active && 'z-[1] ring-2 ring-inset ring-blue',
        onAdd && 'cursor-cell',
        drop.isOver && 'bg-blue/10',
        className,
      )}
      onClick={(e) => {
        // 블록을 눌렀을 때는 칸이 반응하지 않는다 — 두 동작이 겹치면 오작동으로 읽힌다
        if (e.target !== e.currentTarget) return;
        onAdd?.(date);
      }}
    >
      {head !== undefined ? (
        <div className={cn('flex items-center gap-1 text-[11px]', muted ? 'text-line-2' : 'text-fg-subtle')}>
          {isToday ? <span className="rounded bg-blue px-1 font-bold text-white">{head}</span> : <span>{head}</span>}
        </div>
      ) : null}

      {shown.map((o) => (
        <EventBlock
          key={`${o.serId}-${o.date}-${o.startMin}`}
          occ={o}
          subName={subName?.(o)}
          compact={compact}
          onClick={() => onOpen?.(o)}
          onSelect={onSelect}
          selected={selected?.has(occurrenceKey(o))}
          draggable={draggable}
        />
      ))}

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => onMore?.(date)}
          className="mt-auto rounded px-1 text-left text-[11px] font-bold text-fg-subtle hover:text-blue"
        >
          +{hidden}건 더
        </button>
      ) : null}

      {children}
    </div>
  );
}
