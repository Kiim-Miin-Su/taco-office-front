/**
 * Cal/Event Block — Figma `Cal/Event Block` (status 7 × mode 2 = 14 변형).
 *
 * 채널을 섞지 않는다 (V26 §2.3 · 명세서 §07):
 *   색     = 리포트를 썼는가
 *   테두리 = 어디서 하는가 (실선 대면 / 점선 줌)
 *   빗금   = 취소
 * 한 채널에 두 뜻을 실으면 읽을 수 없게 된다.
 *
 * 드래그(TBO-41 · §5): `dragData` 를 주면 잡아서 옮길 수 있고, `resizable` 이면
 * 하단 6px 핸들로 길이를 바꾼다. **판정과 저장은 페이지가 한다** — 블록은 잡히기만 한다.
 */
import { useDraggable } from '@dnd-kit/core';
import { cn } from '../ui/cn';
import { hhmm, type SelectMode } from '@/lib/calendar';
import type { Occurrence } from '@/api/types';

/**
 * 리포트 상태 → 블록 색. **범례(`Legend`)도 이 표를 읽는다** —
 * 두 벌로 두었더니 범례가 옛 색을 계속 보여 주고 있었다.
 * 범례의 일이 「블록 색을 설명하는 것」인데 다른 색을 설명하면 안 읽느니만 못하다.
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

export function EventBlock({
  occ, subName, compact, onClick, onSelect, selected, draggable, resizable,
}: EventBlockProps) {
  const key = `${occ.serId}|${occ.onDate}`;
  const move = useDraggable({
    id: `move|${key}`,
    data: { type: 'move', occ } satisfies DragData,
    disabled: !draggable,
  });
  const resize = useDraggable({
    id: `resize|${key}`,
    data: { type: 'resize', occ } satisfies DragData,
    disabled: !resizable,
  });

  const look = STATUS_LOOK[occ.repState] ?? STATUS_LOOK.na;
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
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden rounded-md border px-2 py-1 text-left transition-shadow hover:shadow-sm',
        // 점선 = 비대면. 모양이 아니라 테두리로만 말한다.
        occ.mode === 'online' ? 'border-dashed' : 'border-solid',
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
