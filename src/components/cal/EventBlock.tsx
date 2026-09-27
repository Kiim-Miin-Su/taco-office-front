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
 *   사선   = 관리자 온라인. 취소는 별도 취소선·사유별 패턴/테두리.
 * 한 채널에 두 뜻을 실으면 읽을 수 없게 된다.
 *
 * 드래그(TBO-41 · §5): `dragData` 를 주면 잡아서 옮길 수 있고, `resizable` 이면
 * 하단 6px 핸들로 길이를 바꾼다. **판정과 저장은 페이지가 한다** — 블록은 잡히기만 한다.
 *
 * 줄(원문 §07·§08): 제목 + 오른쪽 배지(종류 · 리포트 상태 · 정원 점 ●●●○) / 담당 강사 / 「학생, 학생 외 N · 현장 6호」.
 * 전부 이미 오는 값(회차 · 코드표)이다. 블록 높이가 모자라면 **아래 줄부터 그리지 않고**
 * (`lines` — 격자가 높이로 정한다) 빠진 글자는 전부 버튼의 `title` 로 되찾는다.
 * 시간 비례 격자(일간·주간)에서는 제목에 시작 시각을 붙이지 않는다 — 축이 이미 말한다(원문 §07·§08).
 * 월간 칸은 원문 §09 처럼 「08:00 Vocabulary」로 시각을 붙이고 테두리 없는 왼쪽 띠 + 옅은 채움이다.
 * 개인표(§10·§11)는 「과목 / 시간대 / 담당 강사(학생별) · 학생(선생님별)」 세 줄이다.
 *
 * 회차 메모(N-57 · `occ.memo`)는 원문 §08 처럼 **맨 아래 한 줄**(「▎모의고사 오답 리뷰 우선」)이고 높이가 모자라면
 * 가장 먼저 빠진다. 빠졌을 때만 오른쪽 위 「노트」 배지가 선다(원문 §07 — 줄이 보이는 블록에는 배지가 없다).
 * 메모 글은 언제나 `title` 로 되찾는다.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
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

/** 범례에 쓰는 이름 — 순서가 곧 「미작성 → 승인」 흐름이다 */
export const STATUS_LABEL: Array<[keyof typeof STATUS_LOOK, string]> = [
  ['none', '미작성'], ['plan', '예정'], ['wait', '승인 대기'], ['ok', '승인'], ['rej', '반려'],
];

/**
 * 원문 §07 바닥 범례 「[미작성] 리포트」 — 끝났는데 리포트가 없는 수업(서버 `repState` none)에 다는 빨간 배지.
 * 범례(`Legend`)가 이 값을 그대로 그린다 — 낱말과 색을 두 곳에 두지 않는다. 색은 컷의 배지 채움(`--red`)이다.
 */
export const UNWRITTEN_BADGE = { label: '미작성', look: 'bg-red text-white' } as const;

/**
 * 블록 배지로 올리는 리포트 상태 — 원문 §07 「승인 대기」 · §08 「리포트 반려」 · §07 범례 「[미작성] 리포트」.
 * 과목색 보기(일정)에서는 리포트 상태가 색으로 안 보이므로 이 셋만 배지로 올린다.
 * 승인 · 예정 · 작성 중은 배지를 달지 않는다 — 원문 어느 블록·범례에도 그 배지가 없다.
 * 「승인 대기」와 「리포트 반려」는 컷에서 **같은 황토 채움**이다(§07 GPA 관리 · §08 MAP Math · Interview) — 낱말로 가른다.
 */
const REPORT_BADGE: Partial<Record<string, { label: string; look: string }>> = {
  none: UNWRITTEN_BADGE,
  wait: { label: '승인 대기', look: 'bg-amber text-white' },
  rej: { label: '리포트 반려', look: 'bg-amber text-white' },
};

/**
 * 기본 종류(수업)는 배지를 달지 않는다 — 원문 §07·§08 의 MAP Reading · MAP Math 블록에는
 * 종류 배지가 없고 자습 · 회의 · 상담 · GPA 에만 있다. 새 일정 창의 기본 종류와 같은 코드다.
 */
const PLAIN_KIND = 'class';

/**
 * 세부 줄 한 줄(mt-0.5 + leading 12px) · 제목 줄(leading 15px) · 위아래 여백(py-1 4+4 · 테두리 1+1) (px).
 * 아래 클래스와 같은 값이다 — 클래스를 바꾸면 여기도 바꾼다.
 */
const DETAIL_LINE_PX = 14;
const HEAD_PX = 15;
const PAD_PX = 10;

/**
 * 블록 높이(px)에 들어가는 세부 줄 수 — 시간 비례 격자가 그린 높이를 그대로 받는다.
 * 30분(26px) 0 · 45분(40px) 1 · 60분(54px) 2 · 90분(82px) 4. 넘치는 줄은 그리지 않는다.
 */
export function blockDetailLines(heightPx: number): number {
  return Math.max(0, Math.floor((heightPx - PAD_PX - HEAD_PX) / DETAIL_LINE_PX));
}

/**
 * 정원 점(원문 §07·§08 「●●●○」 · 범례 「●●○ 정원 · 여석」)을 그리는 정원 상한.
 * 자습(12)·회의(10)처럼 점이 한 줄을 넘는 종류는 종류 배지가 이미 자리를 쓴다 — 표시 상한일 뿐 판정이 아니다.
 */
const CAP_DOTS_MAX = 8;

/** 원문 「양찬욱, 고은설 외 3」 — 둘까지 적고 나머지는 수로 접는다. 전부는 title 에 있다 */
function shortNames(names: string[]): string {
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}`;
}

function Badge({ look, children }: { look: string; children: ReactNode }) {
  return <span className={cn('max-w-[60%] shrink-0 truncate rounded-sm px-1 text-[9.5px] leading-[14px]', look)}>{children}</span>;
}

/** 드래그 payload — 페이지의 onDragEnd 가 이 모양만 읽는다 */
export type DragData =
  | { type: 'move' | 'resize'; occ: Occurrence }
  | {
      /** 빈 슬롯 범위 선택 — 저장 초안만 만들고 서버 판정은 SessionEditor가 맡는다. */
      type: 'create';
      date: string;
      startMin: number;
      colAxis?: 'room' | 'teacher';
      colId?: number | null;
    };

export interface EventBlockProps {
  occ: Occurrence;
  subName?: string;
  /** 종류 이름 — 코드표(meta)에서 온다. 기본 종류(수업)에는 배지를 달지 않는다 */
  kindName?: string;
  /** 줌 계정 이름 — 온라인 회차의 장소 줄 「온라인 TN Zoom 1」 (코드표 meta.zaccs) */
  zaccLabel?: string;
  /** 종류의 정원 — 코드표 meta.kinds.cap. 주면 배지 자리가 비었을 때 정원 점(●●●○)을 그린다 */
  cap?: number;
  /** 시간 비례 격자 — 제목 줄에 시작 시각을 붙이지 않는다(축이 말한다 · 원문 §07·§08) */
  hideTime?: boolean;
  /** 월간 칸 모양 — 테두리 없이 왼쪽 띠 + 옅은 채움 (원문 §09) */
  flat?: boolean;
  /**
   * 개인표 줄 모양 (원문 §10·§11 「과목 / 시간대 / 담당 강사」) — 학생별이면 셋째 줄이 강사,
   * 선생님별이면 학생이다. 주지 않으면 전체 표의 줄 모양이다.
   */
  person?: 'student' | 'teacher';
  /**
   * 세부 줄 상한 — 시간 비례 격자가 블록 높이로 정한다 (`blockDetailLines`).
   * 주지 않으면 전부 그린다(높이를 모르는 소비자). compact 면 0 이다.
   */
  lines?: number;
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
  occ, subName, kindName, zaccLabel, cap, hideTime, flat, person, lines, color, compact, onClick, onSelect, selected, draggable, resizable,
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
  const studentNames = occ.students.map((s) => s.name);
  const lateNames = occ.students.filter((student) => student.late).map((student) => student.name);
  const names = shortNames(studentNames);
  // 코드값(kindKey)은 코드표가 아직 없을 때만의 마지막 자리다 — 종류 이름이 있으면 그것을 쓴다 (D-R18)
  const heading = subName ?? occ.title ?? kindName ?? occ.kindKey;
  // 장소 — 현장은 강의실, 온라인은 줌 계정 (원문 「· 현장 6호」 「· 온라인 TN」)
  const place = occ.mode === 'online'
    ? `온라인${zaccLabel ? ` ${zaccLabel}` : ''}`
    : occ.roomName ? `현장 ${occ.roomName}` : null;
  // 제목이 이미 종류 이름이면 같은 낱말을 배지로 또 달지 않는다
  const kindBadge = kindName && occ.kindKey !== PLAIN_KIND && kindName !== heading ? kindName : null;
  // 휴강 · 출결 취소한 회차는 서버가 리포트 대상 아님(na)으로 보낸다(리포트 목록과 한 판정) — 블록은 받은 값만 그린다
  const reportBadge = REPORT_BADGE[occ.repState] ?? null;
  // 정원 점 — 그날 명단(그날 빠짐 · 휴원 제외)이 정원 몇 자리를 채웠는지. §79 카드의 인원과 같은 규칙이다(서버 LessonTracking.count).
  // 배지 자리는 하나라 종류·리포트 배지가 서면 점은 title 로만 간다(원문 블록도 오른쪽 위 배지가 하나다).
  const seated = occ.students.filter((s) => !s.droppedOnce && !s.paused).length;
  // 명단이 모두 휴원이면 그 회차는 「휴원」 모양이다 — 회차는 지우지 않고 인원만 빠진다 (C92-c)
  const allPaused = occ.students.length > 0 && occ.students.every((s) => s.paused || s.droppedOnce)
    && occ.students.some((s) => s.paused);
  const capLabel = cap && cap > 1 ? `정원 ${seated}/${cap}명` : null;
  const dots = !compact && capLabel && cap! <= CAP_DOTS_MAX && !kindBadge && !reportBadge && !occ.memo?.trim()
    ? { filled: Math.min(seated, cap!), empty: Math.max(0, cap! - seated) }
    : null;
  // 휴강의 처리(이월/차감/보강 이관)는 회계가 읽는 값이라 블록에도 적는다 — 낱말은 서버 것 (C92)
  // 회차 메모 — 그 회차 하나의 한 줄(N-57). 빈 글은 서버가 저장하지 않는다
  const memo = occ.memo?.trim() ? occ.memo.trim() : null;
  const status = occ.canceled && occ.cancelTreatLabel
    ? `휴강 · ${occ.cancelTreatLabel}${occ.makeupDate ? ` → ${occ.makeupDate.slice(5)}` : ''}`
    : occ.makeupOfDate ? `보강 · ${occ.makeupOfDate.slice(5)} 회차`
      : occ.hasException ? '예외 있음' : null;

  /**
   * 세부 줄은 **보이는 차례**(강사 → 학생·장소 → 상태)로 그리되, 높이가 모자라면 **덜 급한 것부터** 뺀다:
   * 강사 → 휴강 처리·예외 → 학생·장소. 회계가 읽는 휴강 처리가 학생 이름보다 먼저 남는다.
   */
  const details: Array<{ key: string; keep: number; node: ReactNode }> = [];
  if (person) {
    // 개인표 — 시간대 줄이 둘째다(원문 「14:00 –15:30」: 시작은 굵게, 끝은 작게). 셋째 줄은 그 표에 없는 사람이다
    details.push({
      key: 'time', keep: 0,
      node: <><span className="text-[11px] font-bold">{hhmm(occ.startMin)}</span> –{hhmm(occ.endMin)}</>,
    });
    const who = person === 'student' ? occ.teacherName : names;
    if (who) details.push({ key: 'who', keep: 1, node: who });
    if (status) details.push({ key: 'status', keep: 2, node: status });
  } else {
    if (occ.teacherName) details.push({ key: 'teacher', keep: 0, node: occ.teacherName });
    if (names || place) {
      details.push({
        key: 'people', keep: 2,
        node: (
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate">
              {names ? <span>{names}</span> : null}{names && place ? ' · ' : null}{place ? <span>{place}</span> : null}
            </span>
            {lateNames.length ? <Badge look="bg-amber text-white">{lateNames.length === 1 ? '지각' : `지각 ${lateNames.length}`}</Badge> : null}
          </span>
        ),
      });
    }
    if (status) details.push({ key: 'status', keep: 1, node: status });
  }
  // 메모 줄은 **보이는 차례도 빼는 차례도 마지막**이다 — 높이가 모자라면 이 줄부터 빠지고 「노트」 배지가 대신 선다
  if (memo) {
    details.push({
      key: 'memo', keep: 3,
      node: <span className="border-l-2 border-current pl-1">{memo}</span>,
    });
  }
  const fit = compact ? 0 : (lines ?? details.length);
  const kept = new Set([...details].sort((a, b) => a.keep - b.keep).slice(0, fit).map((d) => d.key));
  const noteBadge = memo !== null && !kept.has('memo');

  // 잘리거나 빠진 글자는 전부 여기서 되찾는다 — 좁은 블록에서도 정보가 사라지지 않는다
  const title = [
    `${hhmm(occ.startMin)}–${hhmm(occ.endMin)} ${heading}`,
    occ.teacherName,
    studentNames.join(', ') || null,
    lateNames.length ? `지각 ${lateNames.join(', ')}` : null,
    place,
    status,
    kindBadge,
    reportBadge?.label,
    capLabel,
    occ.extra ? '추가' : null,
    memo ? `노트: ${memo}` : null,
  ].filter(Boolean).join(' · ');
  const dragging = move.isDragging || resize.isDragging;
  // 읽기 전용 블록도 상세를 여는 버튼이다. dnd-kit의 disabled attributes를 그대로
  // 펼치면 aria-disabled=true가 붙어 강사에게 상세 자체가 잠긴 것으로 노출된다.
  const moveAttributes = draggable ? move.attributes : {};
  const moveListeners = draggable ? move.listeners : {};

  return (
    <div className="relative h-full w-full">
      <button
        ref={move.setNodeRef}
        {...moveListeners}
        {...moveAttributes}
        type="button"
        onClick={(e) => {
          const mode: SelectMode = e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single';
          onSelect?.(occ, mode);
          // modifier 클릭은 선택만 한다. 일반 클릭은 기존 상세 열기 행동을 보존한다.
          if (mode === 'single') onClick?.();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          // 브라우저가 뒤이어 합성할 click과 중복 실행되지 않도록 이 키 동작은 여기서 완결한다.
          e.preventDefault();
          onSelect?.(occ, 'single');
          onClick?.();
        }}
        title={title}
        style={color ? eventColorStyle(color) : undefined}
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden rounded-md border px-2 py-1 text-left transition-shadow hover:shadow-sm',
          // 온라인은 점선, 관리자 과목색 표현에는 같은 색의 사선도 더한다.
          occ.mode === 'online' ? 'border-dashed' : 'border-solid',
          color && occ.mode === 'online' && styles.online,
          color && flat && styles.flat,
          // 취소된 작은 글자까지 읽을 수 있도록 블록 전체를 흐리지 않고, 취소선과 아래 사유별 모양으로 구분한다.
          occ.canceled && 'line-through',
          // 원문 §07 범례 「학생 결강 · 학원 취소 · 휴원」 — 휴강 사유(서버 cancelKind)와 휴원(students[].paused)으로 모양을 가른다.
          // 학생 결석만 「학생 결강」이고 나머지 사유(학원 사정 · 공휴일 · 강사 결강 · 기타)는 학원이 접은 것이다
          occ.canceled && occ.cancelKind === 'student_absent' && styles.cancelStudent,
          occ.canceled && occ.cancelKind && occ.cancelKind !== 'student_absent' && styles.cancelAcademy,
          !occ.canceled && allPaused && styles.paused,
          draggable && 'touch-none select-none cursor-grab active:cursor-grabbing',
          // 낙관 반영 중인 원본 자리 — 고스트는 DragOverlay 가 그린다 (§5.1)
          dragging && 'opacity-40',
          selected && 'z-[1] ring-2 ring-blue ring-offset-1 ring-offset-card',
          look,
        )}
        aria-pressed={selected}
      >
        <div className="flex min-w-0 items-center gap-1 text-[11px] font-bold leading-[15px]">
          {hideTime || person ? null : <span className="shrink-0">{hhmm(occ.startMin)}</span>}
          <span className="min-w-0 flex-1 truncate">{heading}</span>
          {/* 추가 수업(KIND.extra)은 시간표에서 「추가」로 갈린다 — 판정은 서버의 `extra` 다 (C94-d · C-38) */}
          {occ.extra ? <Badge look="bg-fg/15">추가</Badge> : null}
          {!compact && kindBadge ? <Badge look="bg-fg/15">{kindBadge}</Badge> : null}
          {!compact && reportBadge ? <Badge look={reportBadge.look}>{reportBadge.label}</Badge> : null}
          {/* 원문 §07 「노트」 — 회차 메모가 있는데 줄로는 못 그릴 때만 (N-57) */}
          {!compact && noteBadge ? <Badge look="border border-line-2 bg-card text-fg">노트</Badge> : null}
          {dots ? (
            <span aria-hidden data-cap-dots className="flex shrink-0 items-center gap-[2px] rounded-full bg-fg/15 px-1 py-[3px]">
              {Array.from({ length: dots.filled }, (_, i) => <span key={`f${i}`} className="size-[6px] rounded-full bg-current" />)}
              {Array.from({ length: dots.empty }, (_, i) => <span key={`e${i}`} className="size-[6px] rounded-full border border-current" />)}
            </span>
          ) : null}
        </div>
        {details.filter((d) => kept.has(d.key)).map((d) => (
          <div key={d.key} className={cn(
            'mt-0.5 truncate text-[10px] leading-[12px]',
            d.key === 'status' ? 'font-bold opacity-90' : d.key === 'teacher' ? 'font-bold opacity-80'
              : d.key === 'memo' ? 'font-bold' : 'opacity-80',
          )}>
            {d.node}
          </div>
        ))}
      </button>

      {resizable ? (
        <button
          ref={resize.setNodeRef}
          {...resize.listeners}
          {...resize.attributes}
          type="button"
          // 블록 클릭(상세 열기)과 겹치지 않게 이벤트를 여기서 끊는다
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 z-[2] h-[6px] cursor-ns-resize rounded-b-md hover:bg-fg/10"
          aria-label="길이 조절"
        />
      ) : null}
    </div>
  );
}
