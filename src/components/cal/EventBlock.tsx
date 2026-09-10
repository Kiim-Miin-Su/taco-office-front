/** @file-guide
 * 목적: EventBlock.tsx — STATUS_LOOK, STATUS_LABEL, DragData, EventBlockProps, eventColorStyle 등 (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Cal/Event Block — 관리자 과목색과 기존 리포트 상태 표현을 공유하는 블록.
 *
 * 채널을 섞지 않는다 (관리자 v2 §07~11·§88·§89):
 *   색     = 과목 (없으면 수업 종류). color 미주입의 기존 소비자는 상태색 유지.
 *   테두리 = 어디서 하는가 (실선 현장 / 점선 온라인)
 *   사선   = 관리자 온라인. 취소는 별도 취소선·투명도.
 * 한 채널에 두 뜻을 실으면 읽을 수 없게 된다.
 *
 * 드래그(TBO-41 · §5): `dragData` 를 주면 잡아서 옮길 수 있고, `resizable` 이면
 * 하단 6px 핸들로 길이를 바꾼다. **판정과 저장은 페이지가 한다** — 블록은 잡히기만 한다.
 */
import { useId, type CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '../ui/cn';
import { hhmm, type SelectMode } from '@/lib/calendar';
import type { Occurrence } from '@/api/types';
import styles from './EventBlock.module.css';

/**
 * 강사 리포트 상태 → 색. TeacherSchedule이 같은 표를 읽는다.
 * 관리자 과목색은 이 표를 덮지 않고 검증된 Meta 색을 별도로 주입한다.
 */
export const STATUS_LOOK: Record<string, string> = {
  na: 'bg-inset text-fg-2 border-line',
  plan: 'bg-blue/10 text-blue border-blue/35',
  none: 'bg-red/10 text-red border-red/40',
  draft: 'bg-amber/10 text-amber border-amber/40',
  wait: 'bg-amber/10 text-amber border-amber/45',
  ok: 'bg-green/10 text-green border-green/40',
  rej: 'bg-violet/10 text-violet border-violet/40',
};

/** 범례에 쓰는 이름 — 순서가 곧 「안 씀 → 승인」 흐름이다 */
export const STATUS_LABEL: Array<[keyof typeof STATUS_LOOK, string]> = [
  ['none', '안 씀'], ['plan', '예정'], ['wait', '승인 대기'], ['ok', '승인'], ['rej', '반려'],
];

/** 드래그 payload — 페이지의 onDragEnd 가 이 모양만 읽는다 */
export interface DragData {
  type: 'move' | 'resize';
  occ: Occurrence;
}

export interface EventBlockProps {
  occ: Occurrence;
  subName?: string;
  /** 관리자 adapter의 검증된 과목/종류색. 생략하면 기존 리포트 상태 표현을 유지한다. */
  color?: string;
  compact?: boolean;
  onClick?: () => void;
  /** 선택 계산은 page → calendar.ts 한 경로가 한다. 블록은 modifier 의도만 전달한다. */
  onSelect?: (occ: Occurrence, mode: SelectMode) => void;
  selected?: boolean;
  /** 주면 잡을 수 있다 — 권한(canCrudAll)은 페이지가 판단해서 안 주는 것으로 표현한다 */
  draggable?: boolean;
  /** 시간 비례 격자에서만 켠다 (C-3) — 목록형 칸에는 길이 개념이 없다 */
  resizable?: boolean;
}

/** 블록·범례·드래그 미리보기가 같은 CSS 색 주입 경로를 사용한다. */
export const eventColorStyle = (color: string): CSSProperties => ({ '--event-color': color } as CSSProperties);

export function EventBlock({
  occ, subName, color, compact, onClick, onSelect, selected, draggable, resizable,
}: EventBlockProps) {
  const key = `${occ.serId}|${occ.onDate}`;
  // 선택은 회차 키를 공유하지만 같은 회차의 split 복제본은 서로 다른 DOM 노드다.
  const instanceId = useId();
  const move = useDraggable({
    id: `move|${instanceId}|${key}`,
    data: { type: 'move', occ } satisfies DragData,
    disabled: !draggable,
  });
  const resize = useDraggable({
    id: `resize|${instanceId}|${key}`,
    data: { type: 'resize', occ } satisfies DragData,
    disabled: !resizable,
  });

  const look = color ? styles.subject : (STATUS_LOOK[occ.repState] ?? STATUS_LOOK.na);
  const names = occ.students.map((s) => s.name).join(' · ');
  const dragging = move.isDragging || resize.isDragging;
  // 읽기 전용 블록도 상세를 여는 버튼이다. dnd-kit의 disabled attributes를 그대로
  // 펼치면 aria-disabled=true가 붙어 강사에게 상세 자체가 잠긴 것으로 노출된다.
  const moveAttributes = draggable ? move.attributes : {};
  const moveListeners = draggable ? move.listeners : {};

  return (
    <div
      ref={move.setNodeRef}
      {...moveListeners}
      {...moveAttributes}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        const mode: SelectMode = e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single';
        onSelect?.(occ, mode);
        // modifier 클릭은 선택만 한다. 일반 클릭은 기존 상세 열기 행동을 보존한다.
        if (mode === 'single') onClick?.();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        onSelect?.(occ, 'single');
        onClick?.();
      }}
      title={`${hhmm(occ.startMin)}–${hhmm(occ.endMin)} ${subName ?? occ.kindKey}${names ? ` · ${names}` : ''}`}
      style={color ? eventColorStyle(color) : undefined}
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden rounded-md border px-2 py-1 text-left transition-shadow hover:shadow-sm',
        // 온라인은 점선, 관리자 과목색 표현에는 같은 색의 사선도 더한다.
        occ.mode === 'online' ? 'border-dashed' : 'border-solid',
        color && occ.mode === 'online' && styles.online,
        occ.canceled && 'opacity-45 line-through',
        draggable && 'cursor-grab active:cursor-grabbing',
        // 낙관 반영 중인 원본 자리 — 고스트는 DragOverlay 가 그린다 (§5.1)
        dragging && 'opacity-40',
        selected && 'z-[1] ring-2 ring-blue ring-offset-1 ring-offset-card',
        look,
      )}
      aria-pressed={selected}
    >
      <div className="flex items-center gap-1 text-[11px] font-bold leading-tight">
        <span>{hhmm(occ.startMin)}</span>
        <span className="truncate">{subName ?? occ.title ?? occ.kindKey}</span>
      </div>
      {!compact && names ? (
        <div className="mt-0.5 truncate text-[10px] opacity-80">{names}</div>
      ) : null}
      {!compact && occ.hasException ? (
        <div className="mt-0.5 text-[10px] font-bold opacity-90">예외 있음</div>
      ) : null}

      {resizable ? (
        <div
          ref={resize.setNodeRef}
          {...resize.listeners}
          {...resize.attributes}
          // 블록 클릭(상세 열기)과 겹치지 않게 이벤트를 여기서 끊는다
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 h-[6px] cursor-ns-resize rounded-b-md hover:bg-fg/10"
          aria-label="길이 조절"
        />
      ) : null}
    </div>
  );
}
