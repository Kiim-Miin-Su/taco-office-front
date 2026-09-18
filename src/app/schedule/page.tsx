/** @file-guide
 * 목적: page.tsx — SchedulePage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 탭 01 스케줄 — §7 일간 · §8 주간 · §9 월간 · §10 학생별 · §11 선생님별 · §12 수업 상세.
 *
 * 여섯 컷이 **한 화면의 보기 전환**이다. 컷마다 라우트를 만들면 같은 데이터를 여섯 번 읽고
 * 색·상태가 갈린다.
 *
 * 규칙 셋 (`AGENT.md §6.1`)
 *   ① 선택 상태(보기·날짜·고른 사람)는 **이 파일의 reducer 한 곳**이 갖는다
 *   ② 서버는 **bounding range 한 번**만 읽고 보기별로는 selector 로 나눈다
 *   ③ 도메인 판정은 서버와 `lib/` 가 갖는다 — 여기서 다시 계산하지 않는다
 */
'use client';
import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { AppShell } from '@/components/shell/AppShell';
import { ScheduleSidebar } from '@/components/shell/ScheduleSidebar';
import { WorkspaceRail } from '@/components/shell/WorkspaceRail';
import { useWorkspace } from '@/store/useWorkspace';
import { useUndoLast } from '@/components/shell/useUndoLast';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, PageHeader, Panel, RecurrenceScope, Segmented } from '@/components/ui';
import { DayGrid, MonthGrid, WeekGrid, type DropData } from '@/components/cal/Grids';
import { ClipboardBar } from '@/components/cal/ClipboardBar';
import {
  filterScheduleOccurrences, INITIAL_SCHEDULE_FILTERS, ScheduleToolbar, SCHEDULE_VIEWS,
  type ScheduleFilters,
} from '@/components/cal/ScheduleToolbar';
import { SessionEditor, type SessionDraft } from '@/components/cal/SessionEditor';
import { eventColorStyle, type DragData } from '@/components/cal/EventBlock';
import eventStyles from '@/components/cal/EventBlock.module.css';
import { Legend } from '@/components/cal/Legend';
import { PeriodSummaryBar } from '@/components/cal/PeriodSummaryBar';
import { TeacherSchedule } from '@/components/cal/TeacherSchedule';
import { LessonDetail } from '@/components/lesson/LessonDetail';
import { fetchConflicts, useDrawer, useHorizon, useMeta, useOccurrences, useScheduleWrite } from '@/api/queries';
import { apiMessage, isConflict } from '@/api/client';
import { useCan } from '@/store/useSession';
import {
  boundingRange, boundsOf, clampSplitRatio, conflictLines, INITIAL_PANE, label, objectParticle, unavailableLines, lessonTimeIssue, monthGrid, movePatch, movePlacements, occurrenceKey, paneView, periodSummary, resizePatch, slotStartMin,
  selectOccurrenceKeys, selectedOccurrences, splitPanes, step, summaryBoundsOf, todayKst, unsplitPanes, updatePane,
  type CalendarPaneIndex, type CalendarPaneState, type PersonPeriod, type SelectMode, type View,
} from '@/lib/calendar';
import type { Occurrence, OccurrenceMove, OccurrencePaste, OccurrencePatch, Scope, UnavWarn, WriteResult } from '@/api/types';
import { calendarEventColor, type CalendarCodeLookup, type CalendarColorOf } from '@/lib/tokens';
import { downloadElementPng } from '@/lib/png-export';
import { positiveQueryId, queryIsoDate } from '@/lib/url-state';

/**
 * 원본 §11 개인 도구줄의 진입 단추 넷. **여는 화면이 원본에 없다** — 컷은 단추만 보여 주고
 * 눌렀을 때를 보여 주지 않는다. 지어내지 않고(D-R44) 못 누르는 이유를 적어 둔다.
 */
const PERSON_ENTRIES: Array<{ label: string; why: string }> = [
  { label: '가능 시간', why: '강사가 낸 불가 시간을 이 표에 겹쳐 보는 자리입니다 — 겹침 계산이 아직 없습니다' },
  { label: '안내', why: '이 강사의 수업 안내로 가는 자리입니다 — 사람으로 좁히는 진입이 아직 없습니다' },
  { label: '정산', why: '이 강사의 월 정산으로 가는 자리입니다 — 금액이라 회계 탭 권한을 함께 정해야 합니다 (D-R9 · D-R39)' },
  { label: '메모', why: '이 강사에 대한 메모 자리입니다 — 저장할 표가 아직 없습니다' },
];

/** 저장이 막힌 자리 — 겹침을 **그 자리 그대로** 다시 물어보기 위한 좌표다. */
interface ConflictProbe {
  date: string;
  startMin: number;
  endMin: number;
  teacherId?: number | null;
  roomId?: number | null;
  zaccId?: number | null;
  exceptSerId?: number | null;
}

/** 개인 도구줄의 기간 칸 — 원본 §10·§11 은 「주간 · 일간 · 월간」 순서로 놓는다. */
const PERSON_PERIODS: Array<{ value: PersonPeriod; label: string }> = [
  { value: 'week', label: '주간' },
  { value: 'day', label: '일간' },
  { value: 'month', label: '월간' },
];

/* ── 상태 — 명시적 action + 순수 reducer (§6.1-3) ────────────────────── */

interface S {
  /** 기본/분할 표의 유일한 상태. 필터·날짜를 별도 전역 값으로 복제하지 않는다 (§4.1). */
  panes: CalendarPaneState[];
  focused: CalendarPaneIndex;
  /** 좌측 비율. divider의 최소 폭 판정 뒤 reducer에만 저장한다. */
  ratio: number;
  /** §07~§11 도구줄 필터·밀도의 단일 상태. 서버 응답은 바꾸지 않고 표시 projection만 바꾼다. */
  filters: ScheduleFilters;
  open: Occurrence | null;
  /** 같은 회차가 분할 표에 여러 번 보여도 `serId|onDate` 하나로 선택한다. */
  selected: string[];
  /** 브라우저 clipboard 와 섞지 않는 앱 내부 상태 (§5.2). */
  clipboard: { items: Occurrence[]; cut: boolean } | null;
  /** Ctrl/⌘+V가 붙을 리프 칸. 선택과 별개라 reducer에 명시한다. */
  cursor: PasteCursor | null;
}

interface PasteCursor {
  date: string;
  startMin: number;
  colAxis?: 'room' | 'teacher';
  colId?: number | null;
}

type A =
  | { t: 'view'; v: View }
  | { t: 'date'; d: string }
  | { t: 'deepLinkDate'; d: string }
  | { t: 'deepLinkStudent'; id: number }
  | { t: 'step'; dir: -1 | 1 }
  | { t: 'today' }
  | { t: 'person'; id: number | null }
  | { t: 'personPeriod'; v: PersonPeriod }
  | { t: 'open'; o: Occurrence | null }
  | { t: 'selected'; keys: string[] }
  | { t: 'clipboard'; value: S['clipboard'] }
  | { t: 'cursor'; value: PasteCursor | null }
  | { t: 'focus'; index: CalendarPaneIndex }
  | { t: 'split' }
  | { t: 'ratio'; value: number }
  | { t: 'filters'; value: ScheduleFilters };

function reducer(s: S, a: A): S {
  const pane = s.panes[s.focused] ?? s.panes[0];
  const patchPane = (patch: Partial<CalendarPaneState>): S => ({
    ...s,
    panes: updatePane(s.panes, s.focused, patch),
  });
  switch (a.t) {
    case 'view': {
      // 사람을 고르는 보기가 아니면 선택을 놓는다 — 안 그러면 안 보이는 필터가 남는다
      const next = patchPane({
        view: a.v,
        personId: a.v === 'student' || a.v === 'teacher' ? pane.personId : null,
      });
      return {
        ...next,
        filters: {
          ...next.filters,
          ...(a.v === 'student' ? { studentId: null } : {}),
          ...(a.v === 'teacher' ? { teacherId: null } : {}),
        },
      };
    }
    case 'date':
      // 전체 주·월간 날짜는 일간으로 이동한다. 개인표는 사람도 **기간도** 그대로 둔다 (§8~§11) —
      // 기간을 바꾸는 자리는 개인 도구줄 하나뿐이다.
      return patchPane({ date: a.d, view: pane.view === 'week' || pane.view === 'month' ? 'day' : pane.view });
    case 'deepLinkDate':
      return {
        ...patchPane({ date: a.d, view: 'day' }),
        open: null,
        selected: [],
      };
    case 'deepLinkStudent':
      return {
        ...patchPane({ view: 'student', personId: a.id }),
        filters: { ...s.filters, studentId: null },
        open: null,
        selected: [],
      };
    case 'step': return patchPane({ date: step(paneView(pane), pane.date, a.dir) });
    case 'personPeriod': return patchPane({ personPeriod: a.v });
    case 'today': return patchPane({ date: todayKst() });
    case 'person': {
      const next = patchPane({ personId: a.id });
      return {
        ...next,
        filters: {
          ...next.filters,
          ...(pane.view === 'student' ? { studentId: null } : {}),
          ...(pane.view === 'teacher' ? { teacherId: null } : {}),
        },
      };
    }
    case 'open': return { ...s, open: a.o };
    case 'selected': return { ...s, selected: a.keys };
    case 'clipboard': return { ...s, clipboard: a.value, cursor: a.value ? s.cursor : null };
    case 'cursor': return { ...s, cursor: a.value };
    case 'focus': return { ...s, focused: a.index };
    case 'split':
      return s.panes.length === 1
        ? { ...s, panes: splitPanes(pane), focused: 0, ratio: 0.5 }
        : { ...s, panes: unsplitPanes(s.panes, s.focused), focused: 0, ratio: 0.5 };
    case 'ratio': return { ...s, ratio: Math.max(0, Math.min(1, a.value)) };
    case 'filters': return { ...s, filters: a.value };
  }
}

/** PATCH 본문에서 scope·onDate 를 뺀 것 — 드롭이 계산하고, 범위는 사람이 고른다 */
type PendingPatch = Omit<OccurrencePatch, 'scope' | 'onDate'>;
type PendingPaste = {
  items: Occurrence[];
  target: Omit<OccurrencePaste, 'sources' | 'scope'>;
  fromClipboard: boolean;
};
type PendingMoveMany = { occurrences: Occurrence[]; items: OccurrenceMove['items'] };

/** 텍스트 입력에서 Ctrl+C 같은 기본 동작을 가로채지 않는다 (§5A.6). */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  return !!el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
}

// 포인터가 실제 놓인 칸만 대상이다. 격자 밖을 overlay 면적 겹침으로 되살리지 않는다.
const calendarCollision: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates;
  if (!pointer) return rectIntersection(args);
  return pointerWithin(args).filter((hit) => {
    // 슬롯 자체 rect는 overflow 밖까지 뻗는다. 실제 스크롤 창에 보이는 후보만 남긴다.
    let parent = args.droppableContainers.find((c) => c.id === hit.id)?.node.current?.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      const box = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX || style.overflow)
        && (pointer.x < box.left || pointer.x > box.right)) return false;
      if (/auto|scroll|hidden|clip/.test(style.overflowY || style.overflow)
        && (pointer.y < box.top || pointer.y > box.bottom)) return false;
      parent = parent.parentElement;
    }
    return true;
  });
};

export default function SchedulePage() {
  const canAdminPage = useCan('canAdminPage');
  return <RequireAuth>{canAdminPage ? <AdminSchedulePage /> : <TeacherSchedule />}</RequireAuth>;
}

function AdminSchedulePage() {
  const searchParams = useSearchParams();
  const changeRequestId = positiveQueryId(searchParams.get('changeRequest'));
  const requestedSerId = positiveQueryId(searchParams.get('serId'));
  const requestedStudentId = positiveQueryId(searchParams.get('studentId'));
  const requestedOnDate = queryIsoDate(searchParams.get('onDate'));
  const requestedDate = queryIsoDate(searchParams.get('date')) ?? requestedOnDate;
  const openedDeepLink = useRef<string | null>(null);
  const [s, go] = useReducer(reducer, {
    panes: [{
      ...INITIAL_PANE,
      view: requestedStudentId ? 'student' : 'day',
      date: requestedDate ?? todayKst(),
      personId: requestedStudentId,
    }], focused: 0, ratio: 0.5, open: null,
    selected: [], clipboard: null, cursor: null, filters: INITIAL_SCHEDULE_FILTERS,
  });
  const meta = useMeta();
  const hz = useHorizon();
  const write = useScheduleWrite();
  const canEdit = useCan('canCrudAll');
  /* ── 워크스페이스 셸 (U1 · 원본§07) — 접힘은 전역 store 하나, 배지는 셸과 같은 조회를 공유한다 ── */
  const sidebarOpen = useWorkspace((w) => w.sidebarOpen);
  const railOpen = useWorkspace((w) => w.railOpen);
  const toggleSidebar = useWorkspace((w) => w.toggleSidebar);
  const toggleRail = useWorkspace((w) => w.toggleRail);
  const drawerData = useDrawer(true).data;

  /* ── 드래그 (TBO-41 · CALENDAR §5) — 계산은 lib, 판정은 서버, 여기는 배선만 ── */
  const [dragging, setDragging] = useState<Occurrence | null>(null);
  const [creating, setCreating] = useState<Extract<DragData, { type: 'create' }> | null>(null);
  const [dragCopy, setDragCopy] = useState(false);
  const dragCopyRef = useRef(false);
  const panesRef = useRef<HTMLDivElement>(null);
  /** 반복이면 저장 직전 1회만 묻는다 (§5A.0). 낙관 반영은 mutate 가 한다 */
  const [ask, setAsk] = useState<{ occ: Occurrence; body: PendingPatch } | null>(null);
  /** Ctrl+드래그와 Ctrl/⌘+V가 같은 paste 다이얼로그·mutation을 쓴다. */
  const [pasteAsk, setPasteAsk] = useState<PendingPaste | null>(null);
  const [moveAsk, setMoveAsk] = useState<PendingMoveMany | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** 서버가 서명한 직전 쓰기 한 건만 메모리에 둔다. 새 쓰기가 성공하면 이전 토큰을 교체한다. */
  /*
   * 되돌릴 직전 작업은 **셸이 갖는다** — 원본 §16 상단바에 「되돌리기」가 있어서다 (N-138 · C99).
   * 여기서 갖고 있으면 상단바와 이 화면의 띠가 서로 다른 말을 한다.
   */
  const setUndo = useWorkspace((w) => w.setUndo);
  const undoLast = useUndoLast();
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 저장은 됐는데 **강사가 불가로 적어 둔 시간**에 걸쳤다 (원본 §15·§16).
   * 오류가 아니라 알림이라 자리도 색도 따로 쓴다 — 막을 일이었으면 서버가 막았다.
   */
  const [unavail, setUnavail] = useState<string[]>([]);
  /** 빈 칸에서 시작하는 새 일정 (C-5) — 새 일정은 범위를 묻지 않는다 */
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // 클릭과 드래그를 가른다 — 4px 을 움직여야 드래그다. 이게 없으면 열기 클릭이 전부 드래그가 된다
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // App Router에서 같은 /schedule 페이지의 query만 바뀌어도 새 실제 수업일 범위를 즉시 조회한다.
  useEffect(() => {
    if (requestedDate) go({ t: 'deepLinkDate', d: requestedDate });
  }, [requestedDate]);

  // §79 학생 카드의 「시간표」 링크는 같은 route 안에서도 고른 학생 개인표로 즉시 전환한다.
  // 숫자 문법은 공용 URL 방어함수에서 먼저 거르고, 화면은 현재 조회 응답만 투영한다.
  useEffect(() => {
    if (requestedStudentId) go({ t: 'deepLinkStudent', id: requestedStudentId });
  }, [requestedStudentId]);

  /** 저장이 됐을 때 — 오류를 지우고, 서버가 준 불가 시간 알림만 남긴다. */
  const doneWrite = (result: unknown, undoLabel = '일정 변경') => {
    setErr(null);
    const typed = result as (WriteResult & { unavailable?: UnavWarn[] }) | undefined;
    const rows = typed?.unavailable ?? [];
    setUnavail(unavailableLines(rows));
    if (typed?.undoToken) {
      setUndo({ token: typed.undoToken, label: undoLabel });
      // 라벨은 「새 일정」·「수업 삭제」처럼 **한 일의 이름**이라 「…을 저장했습니다」로 이으면
      // 삭제까지 「저장」이 된다. 이름을 그대로 앞에 놓고 되돌리는 길만 잇는다.
      setNotice(`${undoLabel} — 10분 안에 Ctrl/⌘+Z 로 되돌릴 수 있습니다.`);
    }
  };

  /**
   * 저장이 겹침으로 막혔을 때 **누구와** 부딪혔는지까지 말한다 (§19 · D-R43).
   *
   * 지금까지의 신호는 409 하나였고 그 문구는 「같은 시간에 강사·강의실·줌이 이미 잡혀
   * 있습니다」라 **상대를 말하지 않는다.** 계산은 서버에 이미 있었다.
   *
   * 물어보는 것은 **막힌 뒤**다. 끌 때마다 물으면 왕복이 늘고, 무엇보다 **미리 물어서
   * 비었다고 저장을 건너뛰면 안 된다** — 그 사이에 남이 그 자리를 잡을 수 있다.
   * 막는 것은 DB 이고 이것은 설명이다.
   */
  const failWrite = (e: unknown, probe: ConflictProbe | null) => {
    const base = apiMessage(e);
    setErr(base);
    setUnavail([]);
    if (!probe || !isConflict(e)) return;
    void fetchConflicts(probe)
      .then((rows) => {
        if (!rows.length) return;
        setErr(`${base} — ${conflictLines(rows).slice(0, 3).join(' · ')}`);
      })
      // 설명을 못 가져와도 원래 문구는 이미 서 있다 — 실패가 실패를 덮지 않게 한다
      .catch(() => undefined);
  };

  const submit = (occ: Occurrence, body: PendingPatch, scope: Scope) => {
    write.mutate(
      { kind: 'patch', serId: occ.serId, body: { ...body, scope, onDate: occ.onDate } },
      {
        onError: (e) => failWrite(e, {
          date: body.date ?? occ.date,
          startMin: body.startMin ?? occ.startMin,
          endMin: body.endMin ?? occ.endMin,
          teacherId: body.teacherId === undefined ? occ.teacherId : body.teacherId,
          roomId: body.roomId === undefined ? occ.roomId : body.roomId,
          exceptSerId: occ.serId,
        }),
        onSuccess: (result) => doneWrite(result, '수업 이동'),
      },
    );
  };

  /** 드롭 결과 → 바뀐 필드만. 반복이면 범위를 묻고, 단발이면 바로 저장한다 (§5A.0) */
  const request = (occ: Occurrence, body: PendingPatch | null) => {
    if (!body) return;
    if (occ.recurring) setAsk({ occ, body });
    else submit(occ, body, 'this');
  };

  const submitPaste = (pending: PendingPaste, scope: Scope) => {
    write.mutate(
      {
        kind: 'paste',
        body: {
          sources: pending.items.map((o) => ({ serId: o.serId, date: o.date, onDate: o.onDate })),
          scope,
          ...pending.target,
        },
      },
      {
        onError: (e) => failWrite(e, {
          date: pending.target.targetDate,
          startMin: pending.target.targetStartMin,
          endMin: pending.target.targetStartMin + (pending.items[0].endMin - pending.items[0].startMin),
          teacherId: pending.target.teacherId ?? pending.items[0].teacherId,
          roomId: pending.target.roomId ?? pending.items[0].roomId,
        }),
        onSuccess: (result) => {
          doneWrite(result, pending.target.cut ? '수업 잘라내기·붙여넣기' : '수업 붙여넣기');
          setPasteAsk(null);
          go({ t: 'cursor', value: null });
          if (pending.fromClipboard) {
            go({ t: 'clipboard', value: null });
            go({ t: 'selected', keys: [] });
          }
        },
      },
    );
  };

  /** 단발은 즉시, 반복 원본이 하나라도 있으면 붙여넣기 직전에 한 번만 범위를 묻는다. */
  const requestPaste = (pending: PendingPaste) => {
    if (pending.items.some((o) => o.recurring)) setPasteAsk(pending);
    else submitPaste(pending, 'this');
  };

  const submitMoveMany = (pending: PendingMoveMany, scope: Scope) => {
    write.mutate(
      { kind: 'moveMany', body: { items: pending.items, scope } },
      {
        onError: (e) => failWrite(e, {
          date: pending.items[0].date,
          startMin: pending.items[0].startMin,
          endMin: pending.items[0].endMin,
          teacherId: pending.items[0].teacherId ?? pending.occurrences[0].teacherId,
          roomId: pending.items[0].roomId ?? pending.occurrences[0].roomId,
          exceptSerId: pending.occurrences[0].serId,
        }),
        onSuccess: (result) => { doneWrite(result, '여러 수업 이동'); setMoveAsk(null); },
      },
    );
  };

  /** 두 건 이상 선택된 드래그만 가로채며 날짜·시각 delta와 드롭한 자원 축을 함께 적용한다. */
  const requestMoveMany = (
    anchor: Occurrence,
    targetDate: string,
    targetStartMin: number,
    resource: { teacherId?: number | null; roomId?: number | null } = {},
  ): boolean => {
    const occurrences = selectedOccurrences(filteredAll, s.selected);
    if (occurrences.length < 2) return false;
    const placed = movePlacements(occurrences, anchor, targetDate, targetStartMin);
    if (!placed) {
      setErr('선택한 일정 중 자정을 넘는 항목이 있어 함께 옮길 수 없습니다.');
      return true;
    }
    const pending: PendingMoveMany = {
      occurrences,
      items: placed.map((x) => ({
        source: { serId: x.source.serId, date: x.source.date, onDate: x.source.onDate },
        date: x.date,
        startMin: x.startMin,
        endMin: x.endMin,
        ...resource,
      })),
    };
    if (occurrences.some((o) => o.recurring)) setMoveAsk(pending);
    else submitMoveMany(pending, 'this');
    return true;
  };

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DragData | undefined;
    if (!d) return;
    if (d.type === 'create') {
      setCreating(d);
      return;
    }
    if (!s.selected.includes(occurrenceKey(d.occ))) go({ t: 'selected', keys: [occurrenceKey(d.occ)] });
    const activator = e.activatorEvent as MouseEvent;
    dragCopyRef.current = d.type === 'move' && (activator.ctrlKey || activator.metaKey);
    setDragCopy(dragCopyRef.current);
    if (d.type === 'move') setDragging(d.occ);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    setCreating(null);
    setDragCopy(false);
    const copy = dragCopyRef.current;
    dragCopyRef.current = false;
    const d = e.active.data.current as DragData | undefined;
    if (!d) return;
    if (d.type === 'create') {
      const over = e.over?.data.current as DropData | undefined;
      if (!over || over.type === 'day') return;
      const sameColumn = over.date === d.date && (
        over.type === 'weekSlot'
          ? d.colAxis === undefined
          : d.colAxis === over.colAxis && d.colId === over.colId
      );
      if (!sameColumn) {
        setErr('새 일정은 같은 날짜·같은 열 안에서 시간을 드래그해 주세요.');
        return;
      }
      const startMin = Math.min(d.startMin, over.slotMin);
      const endMin = Math.max(d.startMin, over.slotMin) + 30;
      const issue = lessonTimeIssue(startMin, endMin);
      if (issue) {
        setErr(issue);
        return;
      }
      setErr(null);
      setDraft({
        date: d.date,
        startMin,
        endMin,
        roomId: d.colAxis === 'room' ? (d.colId ?? null) : null,
      });
      return;
    }
    if (d.type === 'resize') {
      // 길이 조절은 드롭 타깃이 없다 — 델타만 본다 (C-3)
      request(d.occ, resizePatch(d.occ, e.delta.y));
      return;
    }
    const over = e.over?.data.current as DropData | undefined;
    if (!over) return;
    if (over.type === 'day') {
      // 주간·월간 — 칸이 곧 날짜다. 시각은 그대로 간다
      if (copy) {
        requestPaste({
          items: [d.occ], fromClipboard: false,
          target: { targetDate: over.date, targetStartMin: d.occ.startMin, cut: false },
        });
      } else if (!requestMoveMany(d.occ, over.date, d.occ.startMin)) {
        request(d.occ, movePatch(d.occ, { date: over.date }));
      }
      return;
    }
    // 대상 slot과 블록의 상단은 같은 viewport 좌표다. 다른 pane의 시작 시각·스크롤도 반영한다.
    const translated = e.active.rect.current.translated;
    const startMin = translated && e.over
      ? slotStartMin(over.slotMin, e.over.rect.top, e.over.rect.height, translated.top)
      : null;
    const issue = startMin === null ? '놓은 위치의 시각을 확인할 수 없습니다. 다시 놓아 주세요.'
      : lessonTimeIssue(startMin, startMin + d.occ.endMin - d.occ.startMin);
    if (issue || startMin === null) {
      setErr(issue);
      return;
    }
    // 주간 슬롯은 시각만 바꾼다. 강의실/강사 축이 있는 일간 슬롯만 자원 변경을 계약에 싣는다.
    const resource = over.type === 'slot'
      ? (over.colAxis === 'teacher' ? { teacherId: over.colId } : { roomId: over.colId })
      : {};
    const t = {
      date: over.date,
      startMin,
      ...resource,
    };
    const patch = movePatch(d.occ, t);
    if (copy) {
      requestPaste({
        items: [d.occ], fromClipboard: false,
        target: {
          targetDate: over.date,
          targetStartMin: startMin,
          cut: false,
          ...resource,
        },
      });
    } else if (!requestMoveMany(
      d.occ,
      over.date,
      startMin,
      resource,
    )) {
      request(d.occ, patch);
    }
  };

  const onDragCancel = () => {
    setDragging(null);
    setCreating(null);
    setDragCopy(false);
    dragCopyRef.current = false;
  };

  // ② 표가 둘이어도 **bounding range 하나**만 읽는다. split/filter 전환은 GET 0회다 (§4 · §6.1-2).
  const range = useMemo(() => boundingRange(s.panes), [s.panes]);
  const q = useOccurrences({ from: range.from, to: range.to });

  const all = useMemo(() => q.data?.items ?? [], [q.data]);
  const filteredAll = useMemo(() => filterScheduleOccurrences(all, s.filters), [all, s.filters]);

  // §47 「일정」 deep link. 문자열은 공용 방어함수로 거르고, 실제 존재/권한은 조회 응답에서 다시 확인한다.
  useEffect(() => {
    if (!requestedSerId || !requestedOnDate) {
      if (openedDeepLink.current !== null) go({ t: 'open', o: null });
      openedDeepLink.current = null;
      return;
    }
    const identity = `${requestedSerId}:${requestedOnDate}`;
    if (openedDeepLink.current === identity) return;
    if (q.isLoading) return;
    const target = all.find((item) => item.serId === requestedSerId && item.onDate === requestedOnDate);
    if (!target) {
      // 다른 identity가 조회 범위에 없으면 이전 수업 상세를 남기지 않는다.
      openedDeepLink.current = identity;
      go({ t: 'open', o: null });
      return;
    }
    openedDeepLink.current = identity;
    go({ t: 'open', o: target });
  }, [all, q.isLoading, requestedOnDate, requestedSerId]);

  const selectedSet = useMemo(() => new Set(s.selected), [s.selected]);
  const select = (occ: Occurrence, mode: SelectMode) => {
    go({ t: 'selected', keys: selectOccurrenceKeys(filteredAll, s.selected, occ, mode) });
  };

  /** 복사 시점에는 DB를 바꾸지 않는다. X도 붙여넣기 성공 전까지 원본을 보존한다. */
  const copySelection = (cut: boolean) => {
    const picked = selectedOccurrences(filteredAll, s.selected);
    if (!picked.length) return;
    go({ t: 'clipboard', value: { items: picked, cut } });
    go({ t: 'cursor', value: null });
  };

  const pasteAtCursor = () => {
    if (!s.clipboard) {
      setErr('클립보드가 비어 있습니다. 먼저 일정을 선택하고 Ctrl/⌘ + C를 누르세요.');
      return;
    }
    if (!s.cursor) {
      setErr('붙여넣을 빈 칸을 먼저 선택하세요.');
      return;
    }
    const c = s.cursor;
    requestPaste({
      items: s.clipboard.items,
      fromClipboard: true,
      target: {
        targetDate: c.date,
        targetStartMin: c.startMin,
        cut: s.clipboard.cut,
        ...(c.colAxis === 'teacher' ? { teacherId: c.colId } : {}),
        ...(c.colAxis === 'room' ? { roomId: c.colId } : {}),
      },
    });
  };

  /** 되돌리기 자체는 `useUndoLast` 한 곳이 한다 — 여기서는 이 화면의 뒤처리만 잇는다 */
  const runUndo = () => {
    if (!undoLast.canUndo) {
      setErr('되돌릴 최근 스케줄 작업이 없습니다.');
      return;
    }
    const label = undoLast.label;
    undoLast.undo({
      onFail: (message) => { setNotice(null); setErr(message); setUnavail([]); },
      onDone: () => {
        setNotice(`${label}${objectParticle(label ?? '')} 되돌렸습니다.`);
        setErr(null);
        setUnavail([]);
        go({ t: 'selected', keys: [] });
        go({ t: 'clipboard', value: null });
        go({ t: 'cursor', value: null });
      },
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && (key === 'c' || key === 'x')) {
        e.preventDefault();
        copySelection(key === 'x');
        return;
      }
      if (mod && key === 'v') {
        e.preventDefault();
        pasteAtCursor();
        return;
      }
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        // 아직 서버에 보내지 않은 다이얼로그/초안은 닫는 것이 정확한 실행 취소다.
        if (draft) setDraft(null);
        else if (pasteAsk) setPasteAsk(null);
        else if (moveAsk) setMoveAsk(null);
        else if (ask) setAsk(null);
        else runUndo();
        return;
      }
      if (e.key === 'Escape') {
        if (s.selected.length) go({ t: 'selected', keys: [] });
        else if (s.clipboard) go({ t: 'clipboard', value: null });
        else if (pasteAsk) setPasteAsk(null);
        else if (moveAsk) setMoveAsk(null);
        else if (ask) setAsk(null);
        else return;
        // Overlay의 별도 Escape 리스너까지 같은 키를 처리하지 않게 한 단계에서 끊는다.
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const chooseSlot = (date: string, startMin: number, colAxis?: 'room' | 'teacher', colId?: number | null) => {
    if (s.clipboard) {
      go({ t: 'cursor', value: { date, startMin, colAxis, colId } });
      setErr(null);
      return;
    }
    setDraft({
      date,
      startMin,
      endMin: Math.min(1440, startMin + 60),
      roomId: colAxis === 'room' ? (colId ?? null) : null,
    });
  };

  /** Meta lookup 한 벌을 모든 표·상세·범례가 공유한다 (§88·§89). */
  const { subName, kindName, colorOf } = useMemo(() => {
    const codes: CalendarCodeLookup = {
      subs: new Map((meta.data?.subs ?? []).map((x) => [x.key, x])),
      kinds: new Map((meta.data?.kinds ?? []).map((x) => [x.key, x])),
    };
    const colorOf: CalendarColorOf = (o) => calendarEventColor(o, codes);
    return {
      subName: (o: Occurrence) => (o.subKey ? codes.subs.get(o.subKey)?.name : undefined),
      kindName: (o: Occurrence) => codes.kinds.get(o.kindKey)?.name,
      colorOf,
    };
  }, [meta.data]);

  /** ③ 각 표는 같은 응답을 자기 범위·사람으로만 투영한다. 서버 요청·도메인 판정은 늘 한 벌이다. */
  const paneModels = useMemo(() => s.panes.map((pane) => {
    // 개인 표는 사람이 축이고 기간은 따로 고른다 (§10·§11). 범위·이동·집계·격자가 같은 하나를 본다.
    const shown = paneView(pane);
    const paneRange = boundsOf(shown, pane.date);
    const paneAll = filteredAll.filter((o) => o.date >= paneRange.from && o.date <= paneRange.to);
    const items = pane.view === 'student'
      ? (pane.personId === null ? [] : paneAll.filter((o) => o.students.some(
        (x) => x.id === pane.personId && !x.droppedOnce,
      )))
      : pane.view === 'teacher'
        ? (pane.personId === null ? [] : paneAll.filter((o) => o.teacherId === pane.personId))
        : paneAll;
    const columns = [
      ...(meta.data?.rooms ?? []).map((room) => ({ id: room.id as number | null, name: room.name })),
      { id: null, name: '온라인 · 미지정' },
    ];
    const mine = (id: number) => pane.view === 'student'
      ? paneAll.filter((o) => o.students.some((x) => x.id === id && !x.droppedOnce))
      : paneAll.filter((o) => o.teacherId === id);
    const peopleSource = pane.view === 'student'
      ? (meta.data?.students ?? []).map((x) => ({ id: x.id, name: x.name, sub: x.grade ?? '' }))
      : (meta.data?.staff ?? []).map((x) => ({ id: x.id, name: x.name, sub: x.title ?? '' }));
    const people = peopleSource.map((person) => {
      const list = mine(person.id);
      // 시수 산식은 기간 집계와 **같은 함수**다 — 두 곳에서 따로 세면 칩과 상단 줄이 갈린다 (D-R11).
      return { ...person, n: list.length, hours: periodSummary(list).hours };
    }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ko'));
    const grid = shown === 'month' ? monthGrid(pane.date) : [];
    // 상단 집계는 **칸에 그린 것과 같은 배열**에서 센다 (N-19). 월간 격자만 앞뒤 달이
    // 섞여 있어 그 달로 자른다 — 라벨이 「N월」이면 세는 것도 그 달이어야 한다.
    const summaryRange = summaryBoundsOf(shown, pane.date);
    const summary = periodSummary(
      items.filter((o) => o.date >= summaryRange.from && o.date <= summaryRange.to),
    );
    const head = shown === 'month'
      ? `${pane.date.slice(0, 4)}년 ${+pane.date.slice(5, 7)}월`
      : shown === 'day' ? label(pane.date) : `${label(paneRange.from)} – ${label(paneRange.to)}`;
    const outOfHorizon = !!hz.data && (paneRange.from < hz.data.from || paneRange.to > hz.data.to);
    return { pane, shown, range: paneRange, items, columns, people, grid, head, summary, outOfHorizon };
  }), [filteredAll, hz.data, meta.data, s.panes]);

  const activeModel = paneModels[s.focused] ?? paneModels[0];

  const exportSchedule = async () => {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    try {
      await downloadElementPng(
        exportRef.current,
        `${activeModel.pane.date}-${activeModel.pane.view}-schedule.png`,
      );
      setErr(null);
    } catch {
      setErr('스케줄 PNG를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setExporting(false);
    }
  };

  /**
   * 열린 상세는 **캐시의 최신 행**을 본다 (SSOT §6.1-1). 열 때의 스냅숏을 계속 보여 주면
   * 명단을 바꿔도 서랍이 옛 명단을 보여 준다 — 서버가 고친 것을 화면이 무시하는 모양이 된다.
   */
  const open = useMemo(() => {
    if (!s.open) return null;
    // 삭제/다른 날짜 이동으로 조회 범위를 벗어나면 옛 출결 권한/시간을 표시하지 않는다.
    return all.find((o) => o.serId === s.open!.serId && o.onDate === s.open!.onDate) ?? null;
  }, [all, s.open]);

  const startDivider = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const host = panesRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const move = (event: PointerEvent) => {
      const raw = (event.clientX - rect.left) / rect.width;
      go({ t: 'ratio', value: clampSplitRatio(raw, rect.width) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** 기본/분할이 이 렌더러 하나를 1~2회 쓴다. 별도 Split 화면은 만들지 않는다 (§4.1). */
  const renderPane = (model: (typeof paneModels)[number], index: number) => {
    const paneIndex = index as CalendarPaneIndex;
    const { pane, shown, items, columns, people, grid, head, summary, outOfHorizon } = model;
    const focused = s.focused === paneIndex;
    const side = s.panes.length === 1 ? '단일' : paneIndex === 0 ? '왼쪽' : '오른쪽';
    const basis = s.panes.length === 1 ? 1 : paneIndex === 0 ? s.ratio : 1 - s.ratio;

    return (
      <section
        key={paneIndex}
        data-calendar-pane={paneIndex}
        tabIndex={0}
        onFocus={() => go({ t: 'focus', index: paneIndex })}
        onPointerDownCapture={() => go({ t: 'focus', index: paneIndex })}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || event.key !== 'Tab' || s.panes.length !== 2) return;
          event.preventDefault();
          const next = (paneIndex === 0 ? 1 : 0) as CalendarPaneIndex;
          go({ t: 'focus', index: next });
          panesRef.current?.querySelector<HTMLElement>(`[data-calendar-pane="${next}"]`)?.focus();
        }}
        data-density={s.filters.density}
        className={`min-w-[152px] rounded-xl border bg-card outline-none transition-shadow ${
          s.filters.density === 'compact' ? 'p-1' : s.filters.density === 'wide' ? 'p-3' : 'p-2'
        } ${
          focused ? 'border-blue ring-2 ring-blue' : 'border-line'
        }`}
        style={{ flexGrow: basis, flexBasis: 0 }}
      >
        <div className={`mb-2 flex min-h-9 flex-wrap items-center gap-2 rounded-lg px-2 py-1 ${focused ? 'bg-blue/5' : 'bg-inset/50'}`}>
          <span className={`size-2 rounded-full ${focused ? 'bg-blue' : 'bg-line-2'}`} />
          <span className={`text-[11px] font-bold ${focused ? 'text-blue' : 'text-fg-subtle'}`}>{side} 표</span>
          <Chip>{SCHEDULE_VIEWS.find((view) => view.value === pane.view)?.label}</Chip>
          <span className="min-w-0 truncate text-[12px] font-bold text-fg">{head}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" aria-label={`${side} 표 이전 기간`} onClick={() => go({ t: 'step', dir: -1 })}>‹</Button>
            <Button size="sm" onClick={() => go({ t: 'today' })}>오늘</Button>
            <Button size="sm" aria-label={`${side} 표 다음 기간`} onClick={() => go({ t: 'step', dir: 1 })}>›</Button>
          </div>
        </div>

        <PeriodSummaryBar summary={summary} month={shown === 'month'} />

        {outOfHorizon ? (
          <div className="mb-2">
            <Banner tone="warning">
              이 범위는 <b>아직 펼쳐지지 않았습니다</b>. 회차는 {hz.data?.from} ~ {hz.data?.to} 만 표에 있습니다.
            </Banner>
          </div>
        ) : null}

        {pane.view === 'student' || pane.view === 'teacher' ? (
          <div className="grid gap-3 xl:grid-cols-[180px_1fr]">
            <Panel title={pane.view === 'student' ? '학생' : '선생님'} sub="고르면 이 표만 바뀝니다">
              <div className="max-h-[560px] overflow-y-auto">
                {people.map((person) => (
                  <button key={person.id} type="button" onClick={() => go({ t: 'person', id: person.id })}
                    className={`flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left transition-colors hover:bg-inset ${
                      pane.personId === person.id ? 'bg-blue/10' : ''}`}>
                    <span className="text-[12px] font-bold text-fg">{person.name}</span>
                    <span className="text-[11px] text-fg-subtle">{person.sub}</span>
                    <span className={`ml-auto text-[11px] ${person.n ? 'font-bold text-blue' : 'text-line-2'}`}>
                      {person.n ? `${person.n}건` : '—'}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>
            {pane.personId ? (
              <div className="flex min-w-0 flex-col gap-3">
                {/* 원본 §10·§11 개인 도구줄 — 사람 이름 · 집계 · 기간(주간·일간·월간) */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
                  <span className="text-[12px] font-bold text-fg">
                    {people.find((person) => person.id === pane.personId)?.name}
                  </span>
                  <Chip tone="info">{items.filter((o) => !o.canceled).length}회</Chip>
                  {pane.view === 'teacher' ? (
                    <Chip title="이 기간 · 취소 제외 (D-R11). 정산 시수는 회계 탭에서 월 단위로 확정됩니다">
                      이 기간 시수 {(people.find((person) => person.id === pane.personId)?.hours ?? 0).toFixed(1)}시간
                    </Chip>
                  ) : null}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Segmented ariaLabel={`${side} 개인 표 기간`} value={pane.personPeriod}
                      options={PERSON_PERIODS}
                      onChange={(value) => go({ t: 'personPeriod', v: value })} />
                    {/*
                      원본 §11 은 기간 옆에 진입 단추 넷을 더 둔다. 여는 화면이 원본에 없어
                      아직 배선하지 않았다 — 빈칸으로 두지 않고 **왜 못 누르는지**를 적는다
                      (`ScheduleSidebar` 의 자동 연계·가능 시간과 같은 표기).
                    */}
                    {pane.view === 'teacher' ? PERSON_ENTRIES.map((entry) => (
                      <Button key={entry.label} size="sm" disabled title={entry.why}>{entry.label}</Button>
                    )) : null}
                  </div>
                </div>
                {shown === 'day' ? (
                  <DayGrid date={pane.date} items={items} columns={columns} colAxis="room"
                    columnOf={(occurrence) => occurrence.roomId ?? null}
                    subName={subName} colorOf={colorOf} onOpen={(occurrence) => go({ t: 'open', o: occurrence })}
                    onSelect={select} selected={selectedSet} interactive={canEdit}
                    cursor={s.cursor?.colAxis ? { ...s.cursor, colAxis: s.cursor.colAxis, colId: s.cursor.colId ?? null } : null}
                    onAddAt={(date, startMin, roomId) => chooseSlot(date, startMin, 'room', roomId)} />
                ) : shown === 'month' ? (
                  <MonthGrid date={pane.date} items={items} grid={grid} subName={subName} colorOf={colorOf} interactive={canEdit}
                    onSelect={select} selected={selectedSet} cursorDate={s.cursor?.date}
                    onOpen={(occurrence) => go({ t: 'open', o: occurrence })}
                    onPickDate={(date) => go({ t: 'date', d: date })}
                    onAdd={canEdit ? (date) => chooseSlot(date, 10 * 60) : undefined} />
                ) : (
                  <WeekGrid date={pane.date} items={items} subName={subName} colorOf={colorOf} interactive={canEdit}
                    onSelect={select} selected={selectedSet} cursor={s.cursor}
                    onAddAt={canEdit ? chooseSlot : undefined}
                    onOpen={(occurrence) => go({ t: 'open', o: occurrence })}
                    onPickDate={(date) => go({ t: 'date', d: date })} />
                )}
              </div>
            ) : (
              <Panel title="사람을 고르세요">
                <p className="p-6 text-[12px] text-fg-subtle">
                  왼쪽에서 {pane.view === 'student' ? '학생' : '선생님'}을 고르면 이 표에서만 일정을 봅니다.
                </p>
              </Panel>
            )}
          </div>
        ) : shown === 'day' ? (
          <DayGrid date={pane.date} items={items} columns={columns} colAxis="room"
            columnOf={(occurrence) => occurrence.roomId ?? null}
            subName={subName} colorOf={colorOf} onOpen={(occurrence) => go({ t: 'open', o: occurrence })}
            onSelect={select} selected={selectedSet} interactive={canEdit}
            cursor={s.cursor?.colAxis ? { ...s.cursor, colAxis: s.cursor.colAxis, colId: s.cursor.colId ?? null } : null}
            onAddAt={(date, startMin, roomId) => chooseSlot(date, startMin, 'room', roomId)} />
        ) : shown === 'week' ? (
          <WeekGrid date={pane.date} items={items} subName={subName} colorOf={colorOf} interactive={canEdit}
            onSelect={select} selected={selectedSet} cursor={s.cursor}
            onOpen={(occurrence) => go({ t: 'open', o: occurrence })}
            onPickDate={(date) => go({ t: 'date', d: date })}
            onAddAt={canEdit ? chooseSlot : undefined} />
        ) : (
          <MonthGrid date={pane.date} items={items} grid={grid} subName={subName} colorOf={colorOf} interactive={canEdit}
            onSelect={select} selected={selectedSet} cursorDate={s.cursor?.date}
            onOpen={(occurrence) => go({ t: 'open', o: occurrence })}
            onPickDate={(date) => go({ t: 'date', d: date })}
            onAdd={canEdit ? (date) => chooseSlot(date, 10 * 60) : undefined} />
        )}

        {q.isLoading ? <p className="mt-3 text-[12px] text-fg-subtle">불러오는 중…</p> : null}
        {!q.isLoading && items.length === 0 && !outOfHorizon ? (
          <p className="mt-3 text-[12px] text-fg-subtle">이 기간에 수업이 없습니다.</p>
        ) : null}
        {/* 바닥 칩도 **상단 줄과 같은 기간**을 센다 — 한 표 안에서 범위가 갈리면
            「45건인데 리포트 쓴 수업 47」 같은 수가 나온다 (N-19). */}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-fg-subtle">
          <Chip>취소·휴강 {summary.canceled}</Chip>
          <Chip>이 회차만 다름 {summary.exceptions}</Chip>
          <Chip>리포트 쓴 수업 {summary.written}</Chip>
        </div>
      </section>
    );
  };

  return (
    <RequireAuth>
      <AppShell
        flush
        drawerEntry={changeRequestId ? { pane: 'chreqs', identity: `change-request-${changeRequestId}` } : null}
        leftTool={(
          <button type="button" onClick={toggleSidebar} aria-label={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
            className="flex h-[30px] items-center rounded-md border border-header-tool-line bg-header-tool px-2 text-line-2">
            {sidebarOpen ? <PanelLeftClose size={15} aria-hidden /> : <PanelLeftOpen size={15} aria-hidden />}
          </button>
        )}
        rightTool={(
          <button type="button" onClick={toggleRail} aria-label={railOpen ? '바로가기 접기' : '바로가기 펼치기'}
            className="flex h-[30px] items-center rounded-md border border-header-tool-line bg-header-tool px-2 text-line-2">
            {railOpen ? <PanelRightClose size={15} aria-hidden /> : <PanelRightOpen size={15} aria-hidden />}
          </button>
        )}
        sidePanel={sidebarOpen ? ({ openDrawer }) => (
          <ScheduleSidebar
            meta={meta.data}
            items={filteredAll}
            canEdit={canEdit}
            splitOn={s.panes.length === 2}
            onCreate={() => setDraft({ date: activeModel.pane.date, startMin: 540, endMin: 600, roomId: null })}
            onHistory={() => openDrawer('chreqs')}
            onSplit={() => go({ t: 'split' })}
          />
        ) : undefined}
        rightPanel={railOpen ? ({ openDrawer }) => (
          <WorkspaceRail
            approvals={drawerData?.approvals.inboxCount ?? 0}
            unread={drawerData?.notis.filter((n) => !n.read).length ?? 0}
            onOpen={openDrawer}
          />
        ) : undefined}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={calendarCollision}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
        <PageHeader
          title="스케줄"
          sub="§4·§7~§12 — 기본/분할은 같은 표를 반복 렌더하고, bounding range를 한 번만 읽습니다."
        />

        <ScheduleToolbar
          view={activeModel.pane.view}
          filters={s.filters}
          meta={meta.data}
          splitOn={s.panes.length === 2}
          exporting={exporting}
          onViewChange={(view) => go({ t: 'view', v: view })}
          onFiltersChange={(value) => go({ t: 'filters', value })}
          onSplit={() => go({ t: 'split' })}
          onExport={exportSchedule}
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip tone="info">● {s.panes.length === 1 ? '단일 표' : s.focused === 0 ? '왼쪽 표 선택됨' : '오른쪽 표 선택됨'}</Chip>
          <span className="text-[12px] font-bold text-fg">{activeModel.head}</span>
          {/* 머리와 표의 집계는 **같은 수**여야 한다 — 같은 「2026년 9월」 옆에 다른 수가 붙으면
              그것이 곧 원문 §09 의 268 vs 200 이다 (N-19). */}
          <span className="text-[11px] text-fg-subtle" title="고른 표의 기간 집계 — 아래 표의 「일정 N건」과 같은 수입니다">
            {activeModel.summary.total}건
          </span>
          {s.cursor ? <Chip tone="info">붙여넣기 위치 {label(s.cursor.date)} · {Math.floor(s.cursor.startMin / 60)}:{String(s.cursor.startMin % 60).padStart(2, '0')}</Chip> : null}
        </div>

        {err ? (
          <div className="mb-3" role="alert">
            {/* 서버 오류는 충돌만이 아니다. rollback 후 원래 오류 메시지를 그대로 알린다. */}
            <Banner tone="danger">{err}</Banner>
          </div>
        ) : null}

        {notice ? (
          <div className="mb-3 flex flex-wrap items-center gap-2" role="status">
            <Banner tone="success">{notice}</Banner>
            {undoLast.canUndo ? <Button size="sm" variant="ghost" onClick={runUndo}>되돌리기 · Ctrl/⌘+Z</Button> : null}
          </div>
        ) : null}

        {unavail.length ? (
          <div className="mb-3" role="status">
            {/* 저장은 됐다. 막을 일이었으면 서버가 막았다 — 이건 **몰랐던 사실을 알리는 줄**이다 */}
            <Banner tone="warning">
              저장했습니다 — 다만 강사가 <b>못 한다고 적어 둔 시간</b>에 걸칩니다: {unavail.slice(0, 3).join(' · ')}
              {unavail.length > 3 ? ` 외 ${unavail.length - 3}건` : ''}
            </Banner>
          </div>
        ) : null}

        <div ref={exportRef} className="bg-bg">
        <div ref={panesRef} className="mb-3 flex items-stretch overflow-x-auto py-0.5">
          {renderPane(paneModels[0], 0)}
          {s.panes.length === 2 ? (
            <button
              type="button"
              role="separator"
              aria-label="표 너비 조절 — 더블클릭하면 반반"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.ratio * 100)}
              className="group flex w-4 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none"
              onPointerDown={startDivider}
              onDoubleClick={() => go({ t: 'ratio', value: 0.5 })}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const width = panesRef.current?.getBoundingClientRect().width ?? 0;
                go({
                  t: 'ratio',
                  value: clampSplitRatio(s.ratio + (event.key === 'ArrowLeft' ? -0.05 : 0.05), width),
                });
              }}
            >
              <span className="h-14 w-1.5 rounded-full bg-line-2 transition-colors group-hover:bg-blue group-focus:bg-blue" />
            </button>
          ) : null}
          {s.panes.length === 2 ? renderPane(paneModels[1], 1) : null}
        </div>

        <Legend items={activeModel.items} colorOf={colorOf} subName={subName} kindName={kindName} />
        </div>

        <ClipboardBar
          count={s.clipboard?.items.length ?? 0}
          cut={s.clipboard?.cut ?? false}
          onClear={() => { go({ t: 'clipboard', value: null }); go({ t: 'cursor', value: null }); }}
        />

        <LessonDetail
          occ={open}
          recurring={open?.recurring ?? true}
          kindName={open ? kindName(open) : undefined}
          subName={open ? subName(open) : undefined}
          allStudents={meta.data?.students}
          cancelReasons={meta.data?.cancelReasons}
          cancelTreats={meta.data?.cancelTreats}
          onWritten={(result, label) => doneWrite(result, label)}
          onClose={() => go({ t: 'open', o: null })}
        />

        {/* 드래그 고스트 — 원본은 흐려지고 이것이 손을 따라간다 (§5.1) */}
        <DragOverlay dropAnimation={null}>
          {creating ? (
            <div className="rounded-md border border-blue bg-blue/10 px-2 py-1 text-[11px] font-bold text-blue shadow-lg">
              새 일정 · {Math.floor(creating.startMin / 60)}:{String(creating.startMin % 60).padStart(2, '0')}부터
            </div>
          ) : dragging ? (
            <div style={eventColorStyle(colorOf(dragging))}
              className={`w-40 overflow-hidden rounded-md border px-2 py-1 text-[11px] font-bold shadow-lg ${eventStyles.subject} ${
                dragging.mode === 'online' ? `border-dashed ${eventStyles.online}` : 'border-solid'
              } ${dragCopy ? 'ring-2 ring-violet' : ''}`}>
              {dragCopy ? '복제 · ' : ''}{subName(dragging) ?? dragging.title ?? dragging.kindKey}
              <span className="ml-1 opacity-70">{dragging.students.length ? `· ${dragging.students.length}명` : ''}</span>
            </div>
          ) : null}
        </DragOverlay>

        <SessionEditor
          draft={draft}
          meta={meta.data}
          onClose={() => setDraft(null)}
          onCreated={(result) => doneWrite(result, '새 일정')}
        />

        {/* 반복이면 저장 직전 1회만 묻는다 — 단발에서 이 창이 뜨면 버그다 (§5A.0) */}
        <RecurrenceScope
          open={!!ask}
          mode="edit"
          onPick={(scope) => { if (ask) submit(ask.occ, ask.body, scope); setAsk(null); }}
          onClose={() => setAsk(null)}
        />
        <RecurrenceScope
          open={!!pasteAsk}
          mode="paste"
          warning={pasteAsk?.items.some((o) => o.hasException) ? '원본에 적용된 예외는 복사되지 않고, 현재 보이는 값과 반복 규칙만 새 SER로 복제됩니다.' : undefined}
          onPick={(scope) => { if (pasteAsk) submitPaste(pasteAsk, scope); }}
          onClose={() => setPasteAsk(null)}
        />
        <RecurrenceScope
          open={!!moveAsk}
          mode="edit"
          warning={moveAsk ? `${moveAsk.occurrences.length}건을 같은 범위로 함께 옮깁니다. 같은 반복 규칙의 여러 회차에는 「이번만」을 선택하세요.` : undefined}
          onPick={(scope) => { if (moveAsk) submitMoveMany(moveAsk, scope); }}
          onClose={() => setMoveAsk(null)}
        />
        </DndContext>
      </AppShell>
    </RequireAuth>
  );
}
