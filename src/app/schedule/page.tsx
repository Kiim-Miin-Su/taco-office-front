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
 *   ② 가까운 표는 한 번, 먼 분할 표는 각 범위를 읽고 보기별로는 selector 로 나눈다
 *   ③ 도메인 판정은 서버와 `lib/` 가 갖는다 — 여기서 다시 계산하지 않는다
 */
'use client';
import { useEffect, useMemo, useReducer, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { AppShell } from '@/components/shell/AppShell';
import { ScheduleSidebar } from '@/components/shell/ScheduleSidebar';
import { WorkspaceRail } from '@/components/shell/WorkspaceRail';
import { useWorkspace } from '@/store/useWorkspace';
import { useUndoLast } from '@/components/shell/useUndoLast';
import { CheckSquare, Maximize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, LinkButton, PageHeader, Panel, RecurrenceScope, Segmented } from '@/components/ui';
import { TodoCreateDialog } from '@/components/drawer/TodoCreateDialog';
import { DayGrid, MonthGrid, WeekGrid, type CreatePreview, type DropData, type UnavBand } from '@/components/cal/Grids';
import { ClipboardBar } from '@/components/cal/ClipboardBar';
import {
  activeFilterCount, filterScheduleOccurrences, INITIAL_SCHEDULE_FILTERS, ScheduleToolbar, SCHEDULE_VIEWS,
  type ScheduleFilters, type ScheduleTarget,
} from '@/components/cal/ScheduleToolbar';
import { SessionEditor, type SessionDraft } from '@/components/cal/SessionEditor';
import { eventColorStyle, type DragData } from '@/components/cal/EventBlock';
import eventStyles from '@/components/cal/EventBlock.module.css';
import { Legend } from '@/components/cal/Legend';
import { StudentBookChip } from '@/components/cal/StudentBookChip';
import { PeriodSummaryBar } from '@/components/cal/PeriodSummaryBar';
import { TeacherSchedule } from '@/components/cal/TeacherSchedule';
import { TeacherGuideLink } from '@/components/cal/TeacherGuideLink';
import { LessonDetail } from '@/components/lesson/LessonDetail';
import { DayCancelNoticePanel } from '@/components/lesson/DayCancelNoticePanel';
import {
  fetchConflictPreview, useDayCancelNotices, useDrawer, useDrawerWrite, useHorizon, useMeta, useOccurrences, useScheduleHolidays, useScheduleSeriesCounts,
  useScheduleUnavailable, useScheduleWrite,
} from '@/api/queries';
import { apiMessage, isConflict } from '@/api/client';
import { useCan, useSession } from '@/store/useSession';
import { canAccessAppRoute } from '@/components/shell/navigation';
import {
  scheduleReadRanges, boundsOf, clampSplitRatio, conflictLines, hhmm, INITIAL_PANE, label, objectParticle, unavailableLines, lessonTimeIssue, monthGrid, movePatch, movePlacements, occurrenceKey, paneView, periodSummary, resizePatch, SLOT_MIN, slotStartMin, studentOverlapLines,
  selectOccurrenceKeys, selectedOccurrences, splitPanes, step, summaryBoundsOf, timeRange, todayKst, unsplitPanes, updatePane,
  type CalendarColAxis, type CalendarPaneIndex, type CalendarPaneState, type PersonPeriod, type SelectMode, type View,
} from '@/lib/calendar';
import type { DayCancelParentNotice, Occurrence, OccurrenceMove, OccurrencePaste, OccurrencePatch, Scope, StudentOverlap, UnavWarn, WriteResult } from '@/api/types';
import { ROLE_BAR, ROLES } from '@/lib/roles';
import { calendarEventColor, type CalendarCodeLookup, type CalendarColorOf } from '@/lib/tokens';
import { downloadElementPng } from '@/lib/png-export';
import { positiveQueryId, queryIsoDate } from '@/lib/url-state';

/**
 * 원본 §11 개인 도구줄의 진입 단추 넷 [가능 시간 · 안내 · 정산 · 메모].
 * 「안내」·「정산」은 이미 있는 화면으로 간다(§43 수업 안내 · §57 강사료 정산 — 정산은 금액이라 회계 권한일 때만 선다).
 * 「가능 시간」은 강사가 적어 둔 불가 시간을 **이 표에 겹쳐 본다**(원문 §11 데이터 「UNAV(불가 시간)」 · G37 관리자 읽기).
 * 「메모」는 **무엇을 어디에 남길지 원본에 없다**(N-36·N-57) — 지어내지 않고 못 누르는 이유를 적어 둔다.
 */
const PERSON_BLOCKED: Array<{ label: string; why: string }> = [
  { label: '메모', why: '이 강사에 대한 메모 자리입니다 — 무엇을 어디에 남길지 아직 정해지지 않았습니다' },
];

/**
 * 원문 §10 학생 목록의 성별 아바타(여 · 남 · —) — N-83 채택: **관리자 이 목록에만** 쓴다.
 * 낱말은 서버 코드표(`meta.genders`), 빛깔만 여기 둔다(토큰 · D-R41). 비어 있으면(옛 학생 · N-25) 「—」다 — 추정하지 않는다.
 * PNG 로 나가는 표에는 싣지 않는다(외부 출력 제외) — 내보내는 동안 감춘다.
 */
const GENDER_LOOK: Record<string, string> = { female: 'bg-pink text-white', male: 'bg-blue text-white' };
const AVATAR_UNKNOWN = 'border border-line bg-inset text-fg-subtle';

/**
 * 원문 §11 선생님 목록의 역할 아바타 — N-83: 새 칸 없이 **이미 있는 역할**로 선다.
 * 역할 낱말·빛깔은 `lib/roles` 의 표에서 **꺼낼** 뿐 견주지 않는다(D-R39 · §17 묶음 띠와 같은 표).
 */
const ROLE_NAME: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));

/**
 * 학생 목록 순서 — 원문 §10 은 학년순(K → G3 → G4 …)이다. 「G숫자」와 「K」만 순서를 알고,
 * 모르는 학년 낱말은 뒤로 보내 이름순으로 둔다(학년 낱말을 지어 해석하지 않는다).
 */
function gradeRank(grade: string): number {
  if (/^k$/i.test(grade.trim())) return 0;
  const g = /^g\s*(\d{1,2})$/i.exec(grade.trim());
  return g ? Number(g[1]) : 100;
}

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

interface DropPreview {
  date: string;
  startMin: number;
  endMin: number;
}

const CREATE_SCOPE_ERROR = '새 일정은 같은 표·날짜·열 안에서 시간을 드래그해 주세요.';

/** 생성 미리보기와 드롭 초안이 같은 슬롯 산수·pane 경계·시간 제약을 쓴다. */
function createRange(
  source: Extract<DragData, { type: 'create' }>,
  over: DragMoveEvent['over'] | DragEndEvent['over'],
): { preview: CreatePreview | null; issue: string | null } {
  const target = over?.data.current as DropData | undefined;
  if (!target || (target.type !== 'slot' && target.type !== 'weekSlot')) return { preview: null, issue: null };
  const sameColumn = target.type === 'weekSlot'
    ? source.colAxis === undefined
    : source.colAxis === target.colAxis && source.colId === target.colId;
  if (target.paneId !== source.paneId || target.date !== source.date || !sameColumn) {
    return { preview: null, issue: CREATE_SCOPE_ERROR };
  }
  const startMin = Math.min(source.startMin, target.slotMin);
  const endMin = Math.max(source.startMin, target.slotMin) + SLOT_MIN;
  const issue = lessonTimeIssue(startMin, endMin);
  return issue
    ? { preview: null, issue }
    : { preview: { paneId: source.paneId, date: source.date, startMin, endMin,
      colAxis: source.colAxis, colId: source.colId }, issue: null };
}

/**
 * 개인표에서 여는 새 일정에 **그 사람을 미리 넣는다** — 원문 §10·§11 본문
 * 「일정 추가 시 학생(강사)이 자동으로 채워집니다」. 고른 사람이 없거나 전체 보기면 아무도 넣지 않는다 —
 * 보이지 않는 사람을 초안에 지어 넣으면 누가 들어갔는지 모른 채 저장된다.
 */
function personDraft(pane: CalendarPaneState): Pick<SessionDraft, 'studentIds' | 'teacherId'> {
  if (pane.personId === null) return {};
  if (pane.view === 'student') return { studentIds: [pane.personId] };
  if (pane.view === 'teacher') return { teacherId: pane.personId };
  return {};
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
  /** 도구줄 날짜 칸 — 보기(기간·대상)는 그대로 두고 날짜만 옮긴다 (원문 §07 「2026-08-21 (금) ▾」) */
  | { t: 'jump'; d: string }
  | { t: 'deepLinkDate'; d: string }
  | { t: 'deepLinkStudent'; id: number }
  | { t: 'step'; dir: -1 | 1 }
  | { t: 'today' }
  | { t: 'person'; id: number | null }
  /** 개인표에 들어왔는데 고른 사람이 없으면 목록 첫 사람 — 원문 §10·§11 은 첫 사람이 골라진 채 열린다 */
  | { t: 'personAt'; index: CalendarPaneIndex; id: number }
  | { t: 'personPeriod'; v: PersonPeriod }
  | { t: 'open'; o: Occurrence | null }
  | { t: 'selected'; keys: string[] }
  | { t: 'clipboard'; value: S['clipboard'] }
  | { t: 'cursor'; value: PasteCursor | null }
  | { t: 'focus'; index: CalendarPaneIndex }
  | { t: 'split' }
  /** 세로선 표시와 기준은 포커스된 표만 바꾼다. */
  | { t: 'dayColumns' }
  | { t: 'dayAxis'; v: CalendarColAxis }
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
      // 사람을 고르는 보기가 아니면 선택을 놓는다 — 안 그러면 안 보이는 필터가 남는다.
      // **축이 바뀌어도 놓는다**(학생별 ↔ 선생님별) — 고른 번호는 그 축의 번호다. 들고 가면 학생 1 이 강사 1 로 읽혀
      // 없는 강사의 표 · 「안내 N」 요청(404)이 되거나, 같은 번호의 다른 사람이 조용히 골라진다(W11 웹 크롤이 찾음).
      // 놓으면 새 축의 첫 사람이 골라진다(`personAt` · 원문 §10 · §11 은 첫 사람이 골라진 채 열린다)
      const next = patchPane({
        view: a.v,
        personId: (a.v === 'student' || a.v === 'teacher') && a.v === pane.view ? pane.personId : null,
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
      // 기간을 바꾸는 자리는 기간 축(도구줄 [일간·주간·월간] · 개인 도구줄)뿐이다.
      return patchPane({ date: a.d, view: pane.view === 'week' || pane.view === 'month' ? 'day' : pane.view });
    case 'jump': return patchPane({ date: a.d });
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
    case 'personAt': {
      const target = s.panes[a.index];
      // 그 사이 사람을 골랐거나 보기가 바뀌었으면 건드리지 않는다 — 사람이 고른 것을 덮지 않는다
      if (!target || target.personId !== null || (target.view !== 'student' && target.view !== 'teacher')) return s;
      return { ...s, panes: updatePane(s.panes, a.index, { personId: a.id }) };
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
    case 'dayColumns': return { ...patchPane({ dayColumns: !pane.dayColumns }), cursor: null };
    case 'dayAxis': return { ...patchPane({ dayAxis: a.v }), cursor: null };
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
  // §75 지출 갈래(H-84)의 「되돌아온 것」 — 서랍 「내 지출 신청」은 변경 요청 칸(chreqs)에 있다
  const myExpenseId = positiveQueryId(searchParams.get('myExpense'));
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
  /** React state 반영 전 같은 tick의 이중 클릭·키 반복도 같은 paste POST를 두 번 보내지 않는다. */
  const pasteInFlight = useRef(false);
  /** dnd-kit의 pointerup 뒤 브라우저가 합성하는 click/dblclick이 선택·창 열기를 다시 실행하지 않는다. */
  const suppressPointerClickUntil = useRef(0);
  /* 사이드바 [관리] 는 §18 에 들어갈 수 있을 때만 — 직접 URL 과 같은 내비 규칙(D-R39) */
  const sessionMe = useSession((st) => st.me);
  const canOpenPrograms = canAccessAppRoute('/programs', sessionMe);
  /* 원문 §07 「≡ 회계」(N-100) — 회계 탭에 들어갈 수 있을 때만 선다. 직접 URL 과 같은 내비 규칙(D-R39) */
  const canOpenAccounting = canAccessAppRoute('/accounting', sessionMe);
  /* ── 워크스페이스 셸 (U1 · 원본§07) — 접힘은 전역 store 하나, 배지는 셸과 같은 조회를 공유한다 ── */
  const sidebarOpen = useWorkspace((w) => w.sidebarOpen);
  const railOpen = useWorkspace((w) => w.railOpen);
  const toggleSidebar = useWorkspace((w) => w.toggleSidebar);
  const toggleRail = useWorkspace((w) => w.toggleRail);
  const drawerData = useDrawer(true).data;
  /* §07 사이드바 「프로그램」·「과목」 수 — 기간과 무관한 일정 원본 수를 서버가 센다. 펼쳤을 때만 읽는다(기본 접힘) */
  const seriesCounts = useScheduleSeriesCounts(sidebarOpen);

  /* ── 드래그 (TBO-41 · CALENDAR §5) — 계산은 lib, 판정은 서버, 여기는 배선만 ── */
  const [dragging, setDragging] = useState<Occurrence | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [creating, setCreating] = useState<Extract<DragData, { type: 'create' }> | null>(null);
  const [createPreview, setCreatePreview] = useState<CreatePreview | null>(null);
  const [dragCopy, setDragCopy] = useState(false);
  const dragCopyRef = useRef(false);
  const panesRef = useRef<HTMLDivElement>(null);
  /** 반복이면 저장 직전 1회만 묻는다 (§5A.0). 낙관 반영은 mutate 가 한다 */
  const [ask, setAsk] = useState<{ occ: Occurrence; body: PendingPatch } | null>(null);
  /** Ctrl+드래그와 Ctrl/⌘+V가 같은 paste 다이얼로그·mutation을 쓴다. */
  const [pasteAsk, setPasteAsk] = useState<PendingPaste | null>(null);
  const [moveAsk, setMoveAsk] = useState<PendingMoveMany | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** 서버가 서명한 쓰기 토큰을 셸 store 에 쌓는다 — 되돌리기는 뒤에서부터 한 단계씩 (g1 S5). */
  /*
   * 되돌릴 직전 작업은 **셸이 갖는다** — 원본 §16 상단바에 「되돌리기」가 있어서다 (N-138 · C99).
   * 여기서 갖고 있으면 상단바와 이 화면의 띠가 서로 다른 말을 한다.
   */
  const pushUndo = useWorkspace((w) => w.pushUndo);
  const undoLast = useUndoLast();
  const [notice, setNotice] = useState<string | null>(null);
  /** N-142 — 내가 읽은 뒤 남이 먼저 고친 수업을 덮어썼다(막지 않는다 · 나중 저장이 반영). 서버의 overwrote 한 줄 */
  const [overwrote, setOverwrote] = useState<string | null>(null);
  /*
    다른 화면이 쓰기 뒤 여기로 옮기며 넘긴 결과 한 줄(PDF A-05 등록 확정 → 학생 주간 시간표 · all160 2026-09-30).
    한 번 읽어 이 화면에 두고 셸에서는 비운다 — 일정 쓰기가 아니라 되돌리기 단추를 붙이지 않는다.
  */
  const handoff = useWorkspace((w) => w.handoff);
  const setHandoff = useWorkspace((w) => w.setHandoff);
  const [handoffText, setHandoffText] = useState<string | null>(null);
  useEffect(() => {
    if (handoff?.to !== '/schedule') return;
    setHandoffText(handoff.text);
    setHandoff(null);
  }, [handoff, setHandoff]);
  const [dismissedDayCancelDate, setDismissedDayCancelDate] = useState<string | null>(null);
  /**
   * 저장은 됐는데 **강사가 불가로 적어 둔 시간**에 걸쳤다 (원본 §15·§16).
   * 오류가 아니라 알림이라 자리도 색도 따로 쓴다 — 막을 일이었으면 서버가 막았다.
   */
  const [unavail, setUnavail] = useState<string[]>([]);
  /**
   * 저장은 됐는데 **같은 학생이 같은 시각 다른 수업에도 있다** (N-58). 불가 시간 알림과 같은 자리 · 같은 모양이다 —
   * 막을 일이 아니라 알릴 일이다(학생은 겹침 막는 축이 아니다). 판정은 서버 것, 줄 낱말은 `lib/calendar` 한 벌.
   */
  const [overlaps, setOverlaps] = useState<string[]>([]);
  /** 빈 칸에서 시작하는 새 일정 (C-5) — 새 일정은 범위를 묻지 않는다 */
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  /** 원문 §07 「+ 빈 시간 찾기」 — 일간 표에서 강의실마다 수업이 없는 칸을 칠한다(화면 표시만 · 이미 읽은 회차로 센다) */
  const [freeOn, setFreeOn] = useState(false);
  /**
   * 원문 §07 사이드바 · §11 진입 「가능 시간」 — 강사가 적어 둔 불가 시간을 표에 겹쳐 본다(G37 · 관리자 읽기).
   * 한 사람의 표(선생님별 · 구성원 필터)에만 띠를 깐다 — 여러 강사의 띠를 한 칸에 겹치면 누구의 불가인지 읽히지 않는다.
   */
  const [unavOn, setUnavOn] = useState(false);
  /** 원문 §11 To-Do 띠의 「+ 주기」 — 받는 사람 기본값이 그 강사인 할 일 창(서랍·운영과 같은 창 · C96) */
  const [todoFor, setTodoFor] = useState<number | null>(null);
  const todoWrite = useDrawerWrite();
  const canMoney = useCan('canMoney');

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

  /**
   * 저장이 됐을 때 — 오류를 지우고, 서버가 준 알림(불가 시간 · 학생 겹침)만 남긴다.
   * `detail` 은 그 쓰기가 **함께 바꾼 것**을 말하는 서버 문장이다 — 방식 전환(N-56)의 「강의실을 비웠습니다」 같은 줄.
   */
  const doneWrite = (result: unknown, undoLabel = '일정 변경', detail: readonly string[] = []) => {
    setErr(null);
    const typed = result as (WriteResult & {
      unavailable?: UnavWarn[];
      studentOverlaps?: StudentOverlap[];
      parentNotices?: DayCancelParentNotice[];
    }) | undefined;
    const by = typed?.overwrote;
    // 시각은 서버의 KST 문자열(…T14:07:31+09:00)에서 읽는다 — 브라우저 시간대로 다시 계산하지 않는다
    setOverwrote(by ? `${by.byName ?? '다른 사람'}님이 ${by.at.slice(11, 16)}에 고친 내용을 덮어썼습니다 — 지금 저장한 값이 반영됐습니다` : null);
    const rows = typed?.unavailable ?? [];
    setUnavail(unavailableLines(rows));
    setOverlaps(studentOverlapLines(typed?.studentOverlaps ?? []));
    if (typed?.parentNotices?.length) setDismissedDayCancelDate(null);
    const said = detail.length ? ` — ${detail.join(' · ')}` : '';
    if (typed?.undoToken) {
      // 여러 단계(g1 S5) — 맨 뒤에 쌓는다. 만료는 서버 값을 그대로(목록이 지난 단계를 뺀다)
      pushUndo({ token: typed.undoToken, label: undoLabel, expiresAt: typed.undoExpiresAt ?? null });
      // 라벨은 「새 일정」·「수업 삭제」처럼 **한 일의 이름**이라 「…을 저장했습니다」로 이으면
      // 삭제까지 「저장」이 된다. 이름을 그대로 앞에 놓고 되돌리는 길만 잇는다.
      setNotice(`${undoLabel}${said} — 10분 안에 Ctrl/⌘+Z 로 되돌릴 수 있습니다.`);
    } else if (said) {
      setNotice(`${undoLabel}${said}`);
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
    setOverwrote(null);
    setUnavail([]);
    setOverlaps([]);
    if (!probe || !isConflict(e)) return;
    void fetchConflictPreview(probe)
      .then(({ conflicts, freeLine }) => {
        // 「그 시각 비어 있는 강의실 · 줌 계정」 한 줄은 서버 문장이다 — 누를 수 없고 미리 잡지 않는다 (N-70)
        const parts = [...conflictLines(conflicts).slice(0, 3), ...(freeLine ? [freeLine] : [])];
        if (!parts.length) return;
        setErr(`${base} — ${parts.join(' · ')}`);
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
    if (!canEdit) {
      setPasteAsk(null);
      setErr('이 계정은 일정 편집 권한이 없어 복사·붙여넣기를 사용할 수 없습니다.');
      return;
    }
    if (pasteInFlight.current || write.isPending) return;
    pasteInFlight.current = true;
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
        onSettled: () => { pasteInFlight.current = false; },
      },
    );
  };

  /** 단발은 즉시, 반복 원본이 하나라도 있으면 붙여넣기 직전에 한 번만 범위를 묻는다. */
  const requestPaste = (pending: PendingPaste) => {
    if (!canEdit) {
      setErr('이 계정은 일정 편집 권한이 없어 복사·붙여넣기를 사용할 수 없습니다.');
      return;
    }
    if (pasteInFlight.current || write.isPending) return;
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
      setCreatePreview(null);
      return;
    }
    if (!s.selected.includes(occurrenceKey(d.occ))) go({ t: 'selected', keys: [occurrenceKey(d.occ)] });
    const activator = e.activatorEvent as MouseEvent;
    dragCopyRef.current = d.type === 'move' && (activator.ctrlKey || activator.metaKey);
    setDragCopy(dragCopyRef.current);
    if (d.type === 'move') setDragging(d.occ);
  };

  /**
   * 손 아래의 drop 좌표를 한 번만 해석한다. 미리보기와 실제 저장이 이 함수를 함께 써야
   * 사용자가 본 시각과 서버로 보낸 시각이 갈리지 않는다.
   */
  const dropTarget = (
    occ: Occurrence,
    over: DragMoveEvent['over'] | DragEndEvent['over'],
    translatedTop: number | null | undefined,
  ): DropPreview | null => {
    const target = over?.data.current as DropData | undefined;
    if (!over || !target) return null;
    const duration = occ.endMin - occ.startMin;
    if (target.type === 'day') {
      return lessonTimeIssue(occ.startMin, occ.endMin)
        ? null : { date: target.date, startMin: occ.startMin, endMin: occ.endMin };
    }
    const startMin = translatedTop === null || translatedTop === undefined
      ? null : slotStartMin(target.slotMin, over.rect.top, over.rect.height, translatedTop);
    if (startMin === null || lessonTimeIssue(startMin, startMin + duration)) return null;
    return { date: target.date, startMin, endMin: startMin + duration };
  };

  const onDragMove = (e: DragMoveEvent) => {
    const d = e.active.data.current as DragData | undefined;
    if (d?.type === 'create') {
      setCreatePreview(createRange(d, e.over).preview);
      setDropPreview(null);
      return;
    }
    if (d?.type !== 'move') {
      setDropPreview(null);
      return;
    }
    setDropPreview(dropTarget(d.occ, e.over, e.active.rect.current.translated?.top));
  };

  const onDragEnd = (e: DragEndEvent) => {
    suppressPointerClickUntil.current = Date.now() + 300;
    setDragging(null);
    setDropPreview(null);
    setCreating(null);
    setCreatePreview(null);
    setDragCopy(false);
    const copy = dragCopyRef.current;
    dragCopyRef.current = false;
    const d = e.active.data.current as DragData | undefined;
    if (!d) return;
    if (d.type === 'create') {
      const { preview, issue } = createRange(d, e.over);
      if (issue) {
        setErr(issue);
        return;
      }
      if (!preview) return;
      const sourcePane = s.panes[d.paneId];
      if (!sourcePane) return;
      setErr(null);
      setDraft({
        date: preview.date,
        startMin: preview.startMin,
        endMin: preview.endMin,
        // 출발 pane identity를 쓴다 — drag 중 포커스가 바뀌어도 다른 사람을 초안에 넣지 않는다.
        ...personDraft(sourcePane),
        roomId: d.colAxis === 'room' ? (d.colId ?? null) : null,
        ...(d.colAxis === 'teacher' ? { teacherId: d.colId } : {}),
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
    const projected = dropTarget(d.occ, e.over, e.active.rect.current.translated?.top);
    const startMin = projected?.startMin ?? null;
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
    suppressPointerClickUntil.current = Date.now() + 300;
    setDragging(null);
    setDropPreview(null);
    setCreating(null);
    setCreatePreview(null);
    setDragCopy(false);
    dragCopyRef.current = false;
  };

  // ② 가까운 표는 한 범위로 묶고, 먼 표는 각각 보이는 범위만 읽는다. Hook 호출 수는 고정한다.
  const ranges = useMemo(() => scheduleReadRanges(s.panes), [s.panes]);
  const range = ranges[0];
  const secondRange = ranges[1] ?? range;
  const hasSecondRange = ranges.length === 2;
  const secondQuery = useOccurrences(secondRange, hasSecondRange);
  const q = useOccurrences(range);
  // 원문 §09 「광복절」·「광복절 대체」 칩 · §10 요일 머리 — 서버 표(HOLIDAY)를 회차와 같은 범위로 읽는다
  const secondHolidayQuery = useScheduleHolidays(secondRange, hasSecondRange);
  const holidayQuery = useScheduleHolidays(range);
  const holidaysOf = useMemo(() => {
    const byDay = new Map<string, string[]>();
    for (const h of [...(holidayQuery.data?.items ?? []), ...(hasSecondRange ? secondHolidayQuery.data?.items ?? [] : [])]) {
      byDay.set(h.date, [...(byDay.get(h.date) ?? []), h.name]);
    }
    return (date: string) => byDay.get(date);
  }, [holidayQuery.data, secondHolidayQuery.data, hasSecondRange]);
  // 「가능 시간」을 켰을 때만 읽는다 — 막는 자료가 아니라 겹쳐 보는 자료다(저장 판정은 서버 쓰기의 경고가 한다)
  const secondUnavQuery = useScheduleUnavailable(secondRange, unavOn && hasSecondRange);
  const unavQuery = useScheduleUnavailable(range, unavOn);
  const unavRows = useMemo(() => (unavOn
    ? [...(unavQuery.data?.items ?? []), ...(hasSecondRange ? secondUnavQuery.data?.items ?? [] : [])]
    : []), [unavOn, unavQuery.data, secondUnavQuery.data, hasSecondRange]);
  /** 그 사람의 그날 불가 띠 — 띠의 title 은 누가 · 몇 시 · 사유 */
  const unavFor = (teacherId: number | null) => (teacherId === null || !unavOn ? undefined : (date: string): UnavBand[] =>
    unavRows.filter((r) => r.teacherId === teacherId && r.date === date).map((r) => ({
      startMin: r.startMin, endMin: r.endMin,
      label: `강사 불가 · ${r.teacherName} ${hhmm(r.startMin)}–${hhmm(r.endMin)} · ${r.reason}`,
    })));

  const all = useMemo(() => [
    ...(q.data?.items ?? []), ...(hasSecondRange ? secondQuery.data?.items ?? [] : []),
  ], [q.data, secondQuery.data, hasSecondRange]);
  const occurrencesLoading = q.isLoading || (hasSecondRange && secondQuery.isLoading);
  const unavailableLoading = unavQuery.isLoading || (hasSecondRange && secondUnavQuery.isLoading);
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
    if (occurrencesLoading) return;
    const target = all.find((item) => item.serId === requestedSerId && item.onDate === requestedOnDate);
    if (!target) {
      // 다른 identity가 조회 범위에 없으면 이전 수업 상세를 남기지 않는다.
      openedDeepLink.current = identity;
      go({ t: 'open', o: null });
      return;
    }
    openedDeepLink.current = identity;
    go({ t: 'open', o: target });
  }, [all, occurrencesLoading, requestedOnDate, requestedSerId]);

  const selectedSet = useMemo(() => new Set(s.selected), [s.selected]);
  const select = (occ: Occurrence, mode: SelectMode) => {
    go({ t: 'selected', keys: selectOccurrenceKeys(filteredAll, s.selected, occ, mode) });
  };

  /** 복사 시점에는 DB를 바꾸지 않는다. X도 붙여넣기 성공 전까지 원본을 보존한다. */
  const copySelection = (cut: boolean) => {
    if (!canEdit) {
      setErr('이 계정은 일정 편집 권한이 없어 복사·붙여넣기를 사용할 수 없습니다.');
      return;
    }
    const picked = selectedOccurrences(filteredAll, s.selected);
    if (!picked.length) return;
    go({ t: 'clipboard', value: { items: picked, cut } });
    go({ t: 'cursor', value: null });
  };

  const pasteAtCursor = () => {
    if (!canEdit) {
      setErr('이 계정은 일정 편집 권한이 없어 복사·붙여넣기를 사용할 수 없습니다.');
      return;
    }
    if (pasteInFlight.current || write.isPending) return;
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
      onFail: (message) => { setNotice(null); setErr(message); setUnavail([]); setOverlaps([]); },
      onDone: () => {
        setNotice(`${label}${objectParticle(label ?? '')} 되돌렸습니다.`);
        setErr(null);
        setUnavail([]);
        setOverlaps([]);
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
        if (e.repeat) return;
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

  /** 단일클릭은 붙여넣기 여부와 무관하게 대상 시각만 고른다. */
  const selectSlot = (date: string, startMin: number, colAxis?: 'room' | 'teacher', colId?: number | null) => {
    go({ t: 'cursor', value: { date, startMin, colAxis, colId } });
    setErr(null);
  };

  /** 더블클릭/Enter만 1시간 초안을 연다. 서버 쓰기는 SessionEditor의 명시적 저장 뒤에만 한다. */
  const openSlot = (
    pane: CalendarPaneState, date: string, startMin: number, colAxis?: 'room' | 'teacher', colId?: number | null,
  ) => {
    setDraft({
      date,
      startMin,
      endMin: Math.min(1440, startMin + 60),
      ...personDraft(pane),
      roomId: colAxis === 'room' ? (colId ?? null) : null,
      ...(colAxis === 'teacher' ? { teacherId: colId ?? null } : {}),
    });
  };

  const suppressDragClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.detail === 0 || Date.now() >= suppressPointerClickUntil.current) return;
    if (!(event.target instanceof Element) || !event.target.closest('[data-calendar-grid]')) return;
    event.preventDefault();
    event.stopPropagation();
  };

  /** Meta lookup 한 벌을 모든 표·상세·범례가 공유한다 (§88·§89). */
  const { subName, kindName, kindLabel, zaccLabel, capOf, kindColor, colorOf } = useMemo(() => {
    const codes: CalendarCodeLookup = {
      subs: new Map((meta.data?.subs ?? []).map((x) => [x.key, x])),
      kinds: new Map((meta.data?.kinds ?? []).map((x) => [x.key, x])),
    };
    const zaccs = new Map((meta.data?.zaccs ?? []).map((x) => [x.id, x.label]));
    const colorOf: CalendarColorOf = (o) => calendarEventColor(o, codes);
    return {
      subName: (o: Occurrence) => (o.subKey ? codes.subs.get(o.subKey)?.name : undefined),
      kindName: (o: Occurrence) => codes.kinds.get(o.kindKey)?.name,
      kindLabel: (kindKey: string) => codes.kinds.get(kindKey)?.name,
      // 블록의 장소 줄 「온라인 TN Zoom 1」 — 계정 이름도 코드표 한 벌에서 온다 (원문 §07·§08)
      zaccLabel: (o: Occurrence) => (o.zaccId == null ? undefined : zaccs.get(o.zaccId)),
      // 블록 정원 점(●●●○)의 정원 — §79 카드의 「정원 N명」과 같은 코드표 값(서버 LessonTracking.cap = kind.cap)
      capOf: (o: Occurrence) => codes.kinds.get(o.kindKey)?.cap,
      // 개인표 종류 칩의 색 띠 — 블록과 같은 색 해석기(과목 없이 종류로)
      kindColor: (kindKey: string) => calendarEventColor({ kindKey }, codes),
      colorOf,
    };
  }, [meta.data]);

  /** ③ 각 표는 합친 조회 결과를 자기 범위·사람으로만 투영한다. 도메인 판정은 늘 한 벌이다. */
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
    const teacherColumns = new Map<number, { id: number; name: string; writable?: boolean }>();
    for (const staff of meta.data?.staff ?? []) {
      if (pane.view === 'teacher' && staff.id !== pane.personId) continue;
      if (!staff.canAdminPage || paneAll.some((o) => o.teacherId === staff.id)) {
        teacherColumns.set(staff.id, { id: staff.id, name: staff.name });
      }
    }
    // Meta는 활성 직원만 준다. 과거 회차의 퇴사/비활성 강사를 열에서 누락하면 수업 자체가 사라진다.
    // 그 회차 이름으로 이력 열을 보존하되, 그 열은 새 배정·드롭 대상이 될 수 없다.
    for (const occurrence of pane.view === 'teacher' ? items : paneAll) {
      if (occurrence.teacherId != null && !teacherColumns.has(occurrence.teacherId)) {
        teacherColumns.set(occurrence.teacherId, {
          id: occurrence.teacherId,
          name: `${occurrence.teacherName?.trim() || `강사 #${occurrence.teacherId}`} · 이력`,
          writable: false,
        });
      }
    }
    const columns = pane.dayAxis === 'teacher' ? [
      ...teacherColumns.values(),
      ...(pane.view === 'teacher' ? (teacherColumns.size ? [] : [{ id: null, name: '선생님을 고르세요', writable: false }])
        : [{ id: null, name: '강사 미지정' }]),
    ] : [
      ...(meta.data?.rooms ?? []).map((room) => ({ id: room.id as number | null, name: room.name })),
      { id: null, name: '온라인 · 미지정' },
    ];
    const mine = (id: number) => pane.view === 'student'
      ? paneAll.filter((o) => o.students.some((x) => x.id === id && !x.droppedOnce))
      : paneAll.filter((o) => o.teacherId === id);
    /*
     * 원문 §11 목록 대상은 「선생님」 — 수업을 맡는 사람이다(g1 §11 #7). 역할 낱말을 견주지 않고(D-R39)
     * 서버 플래그로 가른다: 관리 화면 권한이 없는 사람(강사)은 늘 서고, 관리 화면 사람은 이 기간 맡은 회차가 있을 때만 선다.
     * 지금 고른 사람은 목록에서 빼지 않는다(표가 「사람을 고르세요」로 바뀌지 않게).
     */
    const genderLabel = new Map((meta.data?.genders ?? []).map((g) => [g.key as string, g.label]));
    const peopleSource = pane.view === 'student'
      ? (meta.data?.students ?? []).map((x) => ({
        // 이름 아래 한 줄 — 학년, 같은 이름이 있으면 학교까지(서버 꼬리 · N-137)
        id: x.id, name: x.name, sub: x.tag ?? '',
        // 원문 §10 성별 아바타 — 낱말은 서버, 비어 있으면 「—」 (N-83)
        avatar: {
          text: (x.gender ? genderLabel.get(x.gender) : undefined) ?? '—',
          look: (x.gender ? GENDER_LOOK[x.gender] : undefined) ?? AVATAR_UNKNOWN,
          private: true,
        },
      }))
      : (meta.data?.staff ?? [])
        .filter((x) => !x.canAdminPage || x.id === pane.personId || paneAll.some((o) => o.teacherId === x.id))
        .map((x) => ({
          id: x.id, name: x.name, sub: x.title ?? '',
          // 원문 §11 역할 아바타 — 새 칸 없이 이미 있는 역할로 (N-83)
          avatar: { text: ROLE_NAME[x.role] ?? x.role, look: `${ROLE_BAR[x.role] ?? 'bg-fg-subtle'} text-white`, private: false },
        }));
    const people = peopleSource.map((person) => {
      const list = mine(person.id);
      // 시수 산식은 기간 집계와 **같은 함수**다 — 두 곳에서 따로 세면 칩과 상단 줄이 갈린다 (D-R11).
      const sum = periodSummary(list);
      // 원문 §10·§11 목록 카드의 종류별 칩(「모의수업 1 · 자습 5」) — 같은 배열을 종류로 묶어 센다
      const kinds = new Map<string, number>();
      for (const o of list) if (!o.canceled) kinds.set(o.kindKey, (kinds.get(o.kindKey) ?? 0) + 1);
      return {
        ...person, n: list.length, held: sum.total - sum.canceled, hours: sum.hours, unsubmitted: sum.unsubmitted,
        kinds: Array.from(kinds, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      };
    }).sort((a, b) => (pane.view === 'student'
      // 학생은 원문 §10 처럼 학년순, 선생님은 이 기간 많이 맡은 순
      ? gradeRank(a.sub) - gradeRank(b.sub) || a.name.localeCompare(b.name, 'ko')
      : b.n - a.n || a.name.localeCompare(b.name, 'ko')));
    const grid = shown === 'month' ? monthGrid(pane.date) : [];
    // 상단 집계는 **칸에 그린 것과 같은 배열**에서 센다 (N-19). 월간 격자만 앞뒤 달이
    // 섞여 있어 그 달로 자른다 — 라벨이 「N월」이면 세는 것도 그 달이어야 한다.
    const summaryRange = summaryBoundsOf(shown, pane.date);
    const summary = periodSummary(
      items.filter((o) => o.date >= summaryRange.from && o.date <= summaryRange.to),
    );
    // 대상 줄의 요약은 **전체 기준**이다 — 원문 §10·§11 은 사람을 골라도 「일정 54건 …」을 그대로 두고
    // 그 사람의 수치는 개인 머리가 말한다. 전체 보기에서는 items 가 곧 paneAll 이라 같은 수다.
    const baseSummary = pane.view === 'student' || pane.view === 'teacher'
      ? periodSummary(paneAll.filter((o) => o.date >= summaryRange.from && o.date <= summaryRange.to))
      : summary;
    // 원문 §07 「⏱ 09-22」 — 이 표가 그리는 시간 축(기본 09~22 + 실제 수업만큼 넓힘 · N-43 접지 않는다)
    const visibleUnav = shown === 'day' && pane.dayColumns && unavOn
      ? unavRows.filter((row) => row.date === pane.date && (pane.dayAxis === 'teacher'
        ? columns.some((column) => column.id === row.teacherId)
        : pane.view === 'teacher' ? row.teacherId === pane.personId
          : pane.view !== 'student' && row.teacherId === s.filters.teacherId))
      : [];
    const axis = timeRange([...(shown === 'day' ? items.filter((o) => o.date === pane.date) : items), ...visibleUnav]);
    const axisLabel = `${hhmm(axis.from).slice(0, 2)}–${hhmm(axis.to).slice(0, 2)}`;
    const head = shown === 'month'
      ? `${pane.date.slice(0, 4)}년 ${+pane.date.slice(5, 7)}월`
      : shown === 'day' ? label(pane.date) : `${label(paneRange.from)} – ${label(paneRange.to)}`;
    const outOfHorizon = !!hz.data && (paneRange.from < hz.data.from || paneRange.to > hz.data.to);
    return { pane, shown, range: paneRange, summaryRange, items, columns, people, grid, head, summary, baseSummary, axisLabel, outOfHorizon };
  }), [filteredAll, hz.data, meta.data, s.panes, s.filters.teacherId, unavOn, unavRows]);

  const activeModel = paneModels[s.focused] ?? paneModels[0];
  // N-133 — mutation 응답의 일회성 state가 아니라 서버 PNOTI를 읽어 reload 뒤에도 발송을 이어 간다.
  const dayCancelNoticeQuery = useDayCancelNotices(activeModel.pane.date, canEdit);
  const dayCancelNotices = dismissedDayCancelDate === activeModel.pane.date ? [] : (dayCancelNoticeQuery.data?.items ?? []);

  // 원문 §10·§11 — 학생별·선생님별로 들어오면 목록 첫 사람(학생은 학년순 · 선생님은 많이 맡은 순)이 골라진 채 표가 보인다
  useEffect(() => {
    paneModels.forEach((model, index) => {
      const { pane, people } = model;
      if ((pane.view === 'student' || pane.view === 'teacher') && pane.personId === null && people.length) {
        go({ t: 'personAt', index: index as CalendarPaneIndex, id: people[0].id });
      }
    });
  }, [paneModels]);
  /** 원문 §07 둘째 축의 지금 값 — 대상 줄과 도구줄이 같은 하나를 본다 */
  const activeTarget: ScheduleTarget = activeModel.pane.view === 'student' || activeModel.pane.view === 'teacher'
    ? activeModel.pane.view : 'all';
  const activePerson = activeModel.people.find((p) => p.id === activeModel.pane.personId);
  const targetLabel = activeTarget === 'all' ? '전체'
    : `${activeTarget === 'student' ? '학생별' : '선생님별'} · ${activePerson?.name ?? '고르지 않음'}`;

  /** 표 한 벌을 PNG 로 — 도구줄(전체)과 개인 머리(그 사람 표)가 같은 공용 내보내기를 쓴다 */
  const exportElement = async (element: HTMLElement | null, fileName: string) => {
    if (!element || exporting) return;
    // 성별 아바타는 외부 출력(PNG)에 싣지 않는다(N-83) — 감춘 화면이 **그려진 뒤에** 찍는다
    flushSync(() => setExporting(true));
    try {
      await downloadElementPng(element, fileName);
      setErr(null);
    } catch {
      setErr('스케줄 PNG를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setExporting(false);
    }
  };
  const exportSchedule = () => exportElement(
    exportRef.current, `${activeModel.pane.date}-${activeModel.pane.view}-schedule.png`,
  );

  /** 원문 §10 개인 머리 「크게」 — 그 사람 표를 전체 화면으로 (셸의 전체 화면과 같은 브라우저 동작) */
  const enlarge = async (element: HTMLElement | null) => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await element?.requestFullscreen();
    } catch {
      setErr('이 브라우저에서 표를 크게 열 수 없습니다. 브라우저의 전체 화면 메뉴를 이용해 주세요.');
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
    const split = s.panes.length === 2;
    const side = !split ? '단일' : paneIndex === 0 ? '왼쪽' : '오른쪽';
    const basis = !split ? 1 : paneIndex === 0 ? s.ratio : 1 - s.ratio;
    const isPerson = pane.view === 'student' || pane.view === 'teacher';
    // 원문 §10·§11 블록 셋째 줄 — 학생별이면 강사, 선생님별이면 학생
    const person = pane.view === 'student' ? 'student' as const : pane.view === 'teacher' ? 'teacher' as const : undefined;
    // [일정 · 리포트] — 「리포트」면 과목색을 주지 않아 블록이 리포트 상태색(STATUS_LOOK)을 그린다
    const blockColor = s.filters.display === 'report' ? undefined : colorOf;
    const chosen = people.find((p) => p.id === pane.personId);
    // 「가능 시간」 띠를 깔 한 사람 — 선생님별 표의 그 강사, 아니면 도구줄 구성원 필터
    const unavTeacher = pane.view === 'teacher' ? pane.personId : pane.view === 'student' ? null : s.filters.teacherId;
    const unavOf = unavFor(unavTeacher);

    // 일간 기본은 날짜 한 열 + 나란한 lane, 세로선은 고른 강의실/강사 축을 쓴다.
    const grids = shown === 'day' && !pane.dayColumns ? (
      <WeekGrid paneId={paneIndex} createPreview={createPreview} creating={Boolean(creating)}
        date={pane.date} days={[pane.date]} items={items} subName={subName} kindName={kindName} zaccLabel={zaccLabel}
        capOf={capOf} person={person} dark={isPerson} totals={isPerson}
        holidaysOf={holidaysOf} unavOf={unavOf}
        colorOf={blockColor} interactive={canEdit}
        onSelect={select} selected={selectedSet} cursor={s.cursor}
        onSelectAt={canEdit ? (date, startMin) => selectSlot(date, startMin) : undefined}
        onAddAt={canEdit ? (date, startMin) => openSlot(pane, date, startMin) : undefined}
        onOpen={(occurrence) => go({ t: 'open', o: occurrence })} />
    ) : shown === 'day' ? (
      <DayGrid paneId={paneIndex} createPreview={createPreview} creating={Boolean(creating)}
        date={pane.date} items={items} columns={columns} colAxis={pane.dayAxis}
        columnOf={pane.dayAxis === 'teacher' ? (occurrence) => occurrence.teacherId ?? null : (occurrence) => occurrence.roomId ?? null}
        subName={subName} kindName={kindName} zaccLabel={zaccLabel} capOf={capOf} person={person} colorOf={blockColor}
        showFree={freeOn && !isPerson && pane.dayAxis === 'room'}
        unavOf={pane.dayAxis === 'room' ? unavOf : undefined}
        unavByColumn={pane.dayAxis === 'teacher' ? (date, teacherId) => unavFor(teacherId)?.(date) : undefined}
        onOpen={(occurrence) => go({ t: 'open', o: occurrence })}
        onSelect={select} selected={selectedSet} interactive={canEdit}
        cursor={s.cursor?.colAxis ? { ...s.cursor, colAxis: s.cursor.colAxis, colId: s.cursor.colId ?? null } : null}
        onSelectAt={canEdit ? (date, startMin, columnId) => selectSlot(date, startMin, pane.dayAxis, columnId) : undefined}
        onAddAt={canEdit ? (date, startMin, columnId) => openSlot(pane, date, startMin, pane.dayAxis, columnId) : undefined} />
    ) : shown === 'month' ? (
      <MonthGrid date={pane.date} items={items} grid={grid} subName={subName} kindName={kindName} colorOf={blockColor} interactive={canEdit}
        holidaysOf={holidaysOf}
        onSelect={select} selected={selectedSet} cursorDate={s.cursor?.date}
        onOpen={(occurrence) => go({ t: 'open', o: occurrence })}
        onPickDate={(date) => go({ t: 'date', d: date })}
        onSelectDate={canEdit ? (date) => selectSlot(date, 10 * 60) : undefined}
        onAdd={canEdit ? (date) => openSlot(pane, date, 10 * 60) : undefined} />
    ) : (
      <WeekGrid paneId={paneIndex} createPreview={createPreview} creating={Boolean(creating)}
        date={pane.date} items={items} subName={subName} kindName={kindName} zaccLabel={zaccLabel}
        capOf={capOf} person={person} dark={isPerson} totals={isPerson}
        holidaysOf={holidaysOf} unavOf={unavOf}
        colorOf={blockColor} interactive={canEdit}
        onSelect={select} selected={selectedSet} cursor={s.cursor}
        onSelectAt={canEdit ? (date, startMin) => selectSlot(date, startMin) : undefined}
        onAddAt={canEdit ? (date, startMin) => openSlot(pane, date, startMin) : undefined}
        onOpen={(occurrence) => go({ t: 'open', o: occurrence })}
        onPickDate={(date) => go({ t: 'date', d: date })} />
    );

    /*
     * 원문 §11 「To-Do Tasks」 띠 — 이 강사가 이 기간에 받은 할 일. 서랍이 이미 읽은 할 일(관리자는 전부)을
     * 받는 사람 · 기한으로 걸러 그리기만 한다(새 요청 0). 기한 없는 열린 일도 받은 일이라 함께 둔다.
     */
    const personTodos = pane.view === 'teacher' && pane.personId !== null
      ? (drawerData?.todos ?? []).filter((todo) => todo.toId === pane.personId && (
        todo.dueOn ? todo.dueOn >= model.range.from && todo.dueOn <= model.range.to : !todo.done
      ))
      : [];
    // 원문 §11 종류별 칩 「수업 2건 · 2.5h」 — 그 사람 표와 같은 배열을 종류로 묶어 같은 함수로 센다 (D-R11)
    const kindChips = pane.view === 'teacher'
      ? Array.from(items.reduce((m, o) => m.set(o.kindKey, [...(m.get(o.kindKey) ?? []), o]), new Map<string, Occurrence[]>()),
        ([key, list]) => ({ key, sum: periodSummary(list) })).filter((k) => k.sum.total > k.sum.canceled)
      : [];

    return (
      <section
        key={paneIndex}
        data-calendar-pane={paneIndex}
        tabIndex={0}
        onFocus={() => go({ t: 'focus', index: paneIndex })}
        onPointerDownCapture={() => {
          // 실제 다음 제스처는 새로운 pointerdown으로 시작한다. 드래그의 합성 click만 무시한다.
          suppressPointerClickUntil.current = 0;
          go({ t: 'focus', index: paneIndex });
        }}
        onClickCapture={suppressDragClick}
        onDoubleClickCapture={suppressDragClick}
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
          focused && split ? 'border-blue ring-2 ring-blue' : 'border-line'
        }`}
        style={{ flexGrow: basis, flexBasis: 0 }}
      >
        {/* 「왼쪽 · 오른쪽 표」 머리는 분할일 때만 선다 — 단일 표의 기간·이동은 대상 줄과 도구줄이 말한다 (원문 §07) */}
        {split ? (
          <>
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
            <PeriodSummaryBar summary={model.baseSummary} month={shown === 'month'} />
          </>
        ) : null}

        {outOfHorizon ? (
          <div className="mb-2">
            <Banner tone="warning">
              이 범위는 <b>아직 펼쳐지지 않았습니다</b>. 회차는 {hz.data?.from} ~ {hz.data?.to} 만 표에 있습니다.
            </Banner>
          </div>
        ) : null}

        {/*
          「가능 시간」을 켰는데 한 사람을 고르지 않은 전체 표 — 여러 강사의 띠를 한 칸에 겹치면 누구의 불가인지 읽히지 않아
          띠 대신 이 기간의 불가 줄을 적는다(같은 서버 응답 · 기간 안의 것만).
        */}
        {unavOn && !isPerson && unavTeacher === null ? (
          <div className="mb-2" data-unav-list>
            <Banner tone="info">
              {(() => {
                // 「이 기간」은 위 요약과 같은 기간이다 — 월간 격자의 앞뒤 달 칸(읽기 범위)까지 세면 그 달보다 많아진다 (QA 0926 B2)
                const rows = unavRows.filter((r) => r.date >= model.summaryRange.from && r.date <= model.summaryRange.to);
                if (unavailableLoading) return '강사 불가 시간을 읽는 중…';
                if (!rows.length) return '이 기간에 강사가 불가로 적어 둔 시간이 없습니다.';
                return (
                  <>
                    이 기간 강사 불가 <b>{rows.length}건</b> — {shown === 'day' && pane.dayColumns && pane.dayAxis === 'teacher'
                      ? '강사 기준 열에 각각 겹쳐 보입니다.'
                      : '구성원 필터나 선생님별 표로 한 사람을 고르면 표에 겹쳐 보입니다.'}
                    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
                      {rows.slice(0, 12).map((r) => (
                        <li key={r.id}>{r.teacherName} · {label(r.date)} {hhmm(r.startMin)}–{hhmm(r.endMin)} · {r.reason}</li>
                      ))}
                      {rows.length > 12 ? <li>외 {rows.length - 12}건</li> : null}
                    </ul>
                  </>
                );
              })()}
            </Banner>
          </div>
        ) : null}

        {isPerson ? (
          <div className="grid gap-3 xl:grid-cols-[300px_1fr]">
            {/* 원문 §10·§11 목록 카드 — 어두운 머리 「학생 20명 · 눌러서 바뀝니다」, 줄마다 이름 · 학년/직함 · 종류별 칩 · 「N회 · N.Nh」 */}
            <section aria-label={`${pane.view === 'student' ? '학생' : '선생님'} 목록`}
              className="self-start overflow-hidden rounded-xl border border-line bg-card">
              <div className="flex items-baseline gap-2 bg-fg px-3 py-2.5 text-white">
                <span className="text-[13px] font-bold">{pane.view === 'student' ? '학생' : '선생님'} {people.length}명</span>
                <span className="text-[11px] text-white/60">눌러서 바뀝니다</span>
              </div>
              <div className="max-h-[640px] overflow-y-auto">
                {people.map((person) => (
                  <button key={person.id} type="button" onClick={() => go({ t: 'person', id: person.id })}
                    aria-pressed={pane.personId === person.id}
                    className={`flex w-full flex-col items-start gap-1.5 border-b border-line px-3 py-2.5 text-left transition-colors hover:bg-inset ${
                      pane.personId === person.id ? 'border-l-4 border-l-primary bg-primary/10' : ''}`}>
                    <span className="flex items-center gap-1.5">
                      {/* 원문 §10 성별 · §11 역할 아바타 — 성별은 PNG 로 나가는 동안 감춘다(외부 출력 제외 · N-83) */}
                      {person.avatar.private && exporting ? null : (
                        <span aria-hidden data-avatar={person.avatar.private ? 'gender' : 'role'}
                          className={`grid h-6 min-w-6 shrink-0 place-items-center rounded-md px-1 text-[10.5px] font-bold ${person.avatar.look}`}>
                          {person.avatar.text}
                        </span>
                      )}
                      <span className="text-[13px] font-bold text-fg">{person.name}</span>
                      {person.sub ? <Chip size="compact">{person.sub}</Chip> : null}
                    </span>
                    {person.kinds.length ? (
                      <span className="flex flex-wrap gap-1">
                        {person.kinds.map((k) => (
                          <span key={k.key} style={{ borderLeftColor: kindColor(k.key) }}
                            className="rounded border border-l-[3px] border-line bg-inset px-1.5 text-[10.5px] font-bold text-fg-2">
                            {kindLabel(k.key) ?? '종류'} {k.count}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span className={`text-[11px] ${person.held ? 'font-bold text-fg-2' : 'text-line-2'}`}>
                      {person.held}회 · {person.hours.toFixed(1)}h
                    </span>
                    {/* 선생님 줄의 빨간 「리포트 N」 — 끝났는데 아직 제출하지 않은 리포트(기간 집계와 같은 판정) */}
                    {pane.view === 'teacher' && person.unsubmitted ? (
                      <Chip tone="danger" size="compact">리포트 {person.unsubmitted}</Chip>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
            {pane.personId ? (
              <div data-person-table className="flex min-w-0 flex-col gap-3 bg-bg">
                {/* 원문 §10·§11 개인 머리 — 이름 · 학년/직함 칩 · 「수업 N · 시간 N.N」 · 기간 · 진입 · 크게 · PNG */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
                  <span className="text-[17px] font-bold text-fg">{chosen?.name}</span>
                  {chosen?.sub ? <Chip styleKind="solid">{chosen.sub}</Chip> : null}
                  {/* 원문 §10 「홍채원 [K] 교재 없음」 — 낱말·판정은 서버(ISSUE 배부 완료) */}
                  {pane.view === 'student' ? <StudentBookChip studentId={pane.personId} /> : null}
                  <span className="text-[12px] text-fg-2"
                    title="이 기간 · 취소 제외. 정산 시수는 회계 탭에서 월 단위로 확정됩니다">
                    수업 <b className="text-fg">{summary.total - summary.canceled}</b> · 시간 <b className="text-fg">{summary.hours.toFixed(1)}</b>
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Segmented ariaLabel={`${side} 개인 표 기간`} value={pane.personPeriod}
                      options={PERSON_PERIODS}
                      onChange={(value) => go({ t: 'personPeriod', v: value })} />
                    {pane.view === 'teacher' ? (
                      <>
                        <Button size="sm" variant={unavOn ? 'primary' : undefined} aria-pressed={unavOn}
                          onClick={() => setUnavOn((v) => !v)}
                          title={unavOn ? '강사 불가 시간 겹쳐 보기를 끕니다' : '강사가 적어 둔 불가 시간을 이 표에 겹쳐 봅니다'}>
                          가능 시간
                        </Button>
                        {/* 원문 §11 「안내 N」 — 보냈는데 아직 확인 안 된 안내 수(서버 · N-100) */}
                        <TeacherGuideLink teacherId={pane.personId} />
                        {canMoney ? <LinkButton size="sm" href="/accounting?tab=payout" title="강사료 정산 탭으로 갑니다">정산</LinkButton> : null}
                        {PERSON_BLOCKED.map((entry) => (
                          <Button key={entry.label} size="sm" disabled title={entry.why}>{entry.label}</Button>
                        ))}
                      </>
                    ) : null}
                    <Button size="sm" onClick={(event) => void enlarge(event.currentTarget.closest<HTMLElement>('[data-person-table]'))}>
                      <Maximize2 size={13} aria-hidden />크게
                    </Button>
                    <Button size="sm" variant="dark" disabled={exporting} aria-label="개인 표를 PNG로 저장"
                      onClick={(event) => void exportElement(
                        event.currentTarget.closest<HTMLElement>('[data-person-table]'),
                        `${pane.date}-${pane.view}-${pane.personId}-schedule.png`,
                      )}>
                      PNG
                    </Button>
                  </div>
                </div>
                {pane.view === 'teacher' ? (
                  <>
                    <div role="group" aria-label="받은 할 일"
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
                      <CheckSquare size={15} aria-hidden className="text-fg" />
                      <b className="text-[13px] text-fg">To-Do Tasks</b>
                      {personTodos.length ? personTodos.slice(0, 6).map((todo) => (
                        <Chip key={todo.id} tone={todo.done ? 'neutral' : todo.overdueDays > 0 ? 'danger' : 'info'}
                          title={`${todo.srcLabel}${todo.fromName ? ` · ${todo.fromName}` : ''}`}>
                          {todo.done ? <s>{todo.title}</s> : todo.title}{todo.dueOn ? ` · ${todo.dueOn.slice(5)}` : ''}
                        </Chip>
                      )) : <span className="text-[12px] text-fg-subtle">이 기간에 받은 일이 없습니다</span>}
                      {personTodos.length > 6 ? <span className="text-[11px] text-fg-subtle">외 {personTodos.length - 6}건</span> : null}
                      {canEdit ? (
                        <Button size="sm" className="ml-auto" onClick={() => setTodoFor(pane.personId)}>+ 주기</Button>
                      ) : null}
                    </div>
                    {kindChips.length ? (
                      <div className="flex flex-wrap gap-2">
                        {kindChips.map((k) => (
                          <span key={k.key} style={{ borderLeftColor: kindColor(k.key) }}
                            className="rounded-lg border border-l-4 border-line bg-card px-2.5 py-1 text-[12px] font-bold text-fg-2">
                            {kindLabel(k.key) ?? '종류'} {k.sum.total - k.sum.canceled}건 · {k.sum.hours.toFixed(1)}h
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {grids}
              </div>
            ) : (
              <Panel title="사람을 고르세요">
                <p className="p-6 text-[12px] text-fg-subtle">
                  왼쪽에서 {pane.view === 'student' ? '학생' : '선생님'}을 고르면 이 표에서만 일정을 봅니다.
                </p>
              </Panel>
            )}
          </div>
        ) : grids}

        {occurrencesLoading ? <p className="mt-3 text-[12px] text-fg-subtle">불러오는 중…</p> : null}
        {!occurrencesLoading && items.length === 0 && !outOfHorizon ? (
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
        drawerEntry={changeRequestId ? { pane: 'chreqs', identity: `change-request-${changeRequestId}` }
          : myExpenseId ? { pane: 'chreqs', identity: `my-expense-${myExpenseId}` } : null}
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
            counts={seriesCounts.data}
            canEdit={canEdit}
            onCreate={() => setDraft({
              date: activeModel.pane.date, startMin: 540, endMin: 600, roomId: null, ...personDraft(activeModel.pane),
            })}
            onHistory={() => openDrawer('chreqs')}
            availabilityOn={unavOn}
            onAvailability={() => setUnavOn((v) => !v)}
            onClearKind={() => go({ t: 'filters', value: { ...s.filters, kindKey: null } })}
            onClearSub={() => go({ t: 'filters', value: { ...s.filters, subKey: null } })}
            canOpenPrograms={canOpenPrograms}
          />
        ) : undefined}
        rightPanel={railOpen ? ({ openDrawer, activePane }) => (
          <WorkspaceRail
            approvals={drawerData?.approvals.inboxCount ?? 0}
            unread={drawerData?.notis.filter((n) => !n.read).length ?? 0}
            onOpen={openDrawer}
            activePane={activePane}
          />
        ) : undefined}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={calendarCollision}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
        <PageHeader title="스케줄" />

        <ScheduleToolbar
          period={paneView(activeModel.pane) as PersonPeriod}
          target={activeTarget}
          filters={s.filters}
          meta={meta.data}
          dayColumnsOn={activeModel.pane.dayColumns}
          dayColumnsAvailable={activeModel.shown === 'day'}
          dayAxis={activeModel.pane.dayAxis}
          onDayAxisChange={(v) => go({ t: 'dayAxis', v })}
          splitOn={s.panes.length === 2}
          onSplit={() => go({ t: 'split' })}
          showAccounting={canOpenAccounting}
          exporting={exporting}
          date={activeModel.pane.date}
          axisLabel={activeModel.axisLabel}
          freeOn={freeOn}
          // 빈 칸은 강의실 열일 때만 센다. 강사 기준 세로선에는 강사별 불가 시간을 대신 겹친다.
          freeAvailable={activeModel.shown === 'day' && activeTarget === 'all' && activeModel.pane.dayColumns && activeModel.pane.dayAxis === 'room'}
          onPeriodChange={(period) => (
            activeTarget === 'all' ? go({ t: 'view', v: period }) : go({ t: 'personPeriod', v: period })
          )}
          onTargetChange={(target) => go({ t: 'view', v: target === 'all' ? paneView(activeModel.pane) : target })}
          onFiltersChange={(value) => go({ t: 'filters', value })}
          onDateChange={(date) => go({ t: 'jump', d: date })}
          onStep={(dir) => go({ t: 'step', dir })}
          onToday={() => go({ t: 'today' })}
          onFreeToggle={() => setFreeOn((v) => !v)}
          onDayColumnsToggle={() => go({ t: 'dayColumns' })}
          onExport={exportSchedule}
        />

        {/*
          원문 §07 대상 줄 하나 — 「대상 · 전체 전체 · 전체 기준 …」 + 오른쪽 「2026-08-21 (금) · 일정 21건 · 현장 7 / 온라인 14 · 23.0시간 · 승인 대기 2」.
          날짜를 세 번 적던 자리(「● 단일 표」 줄 · 표 머리 · 요약 줄)를 하나로 모았다. 요약은 전체 기준이다(§10·§11 도 그렇다).
          머리와 표의 집계는 **같은 수**여야 한다 — 같은 「2026년 9월」 옆에 다른 수가 붙으면 그것이 곧 원문 §09 의 268 vs 200 이다 (N-19).
        */}
        <div role="group" aria-label="대상"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
          <span className="rounded-md border border-line px-2 py-1 text-[11px] font-bold text-fg-subtle">대상</span>
          <span className="text-[14px] font-bold text-fg">{targetLabel}</span>
          <Chip>{activeFilterCount(s.filters) ? `필터 ${activeFilterCount(s.filters)}개` : '전체 기준'}</Chip>
          {s.panes.length === 2 ? <Chip tone="info">● {s.focused === 0 ? '왼쪽 표 선택됨' : '오른쪽 표 선택됨'}</Chip> : null}
          {s.cursor ? <Chip tone="info">붙여넣기 위치 {label(s.cursor.date)} · {Math.floor(s.cursor.startMin / 60)}:{String(s.cursor.startMin % 60).padStart(2, '0')}</Chip> : null}
          <PeriodSummaryBar summary={activeModel.baseSummary} month={activeModel.shown === 'month'} label={activeModel.head}
            className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[12px] font-bold text-fg-2" />
        </div>

        {err ? (
          <div className="mb-3" role="alert">
            {/* 서버 오류는 충돌만이 아니다. rollback 후 원래 오류 메시지를 그대로 알린다. */}
            <Banner tone="danger">{err}</Banner>
          </div>
        ) : null}

        {handoffText ? (
          <div className="mb-3" role="status">
            <Banner tone="success">{handoffText}</Banner>
          </div>
        ) : null}

        {notice ? (
          <div className="mb-3 flex flex-wrap items-center gap-2" role="status">
            <Banner tone="success">{notice}</Banner>
            {undoLast.canUndo ? <Button size="sm" variant="ghost" onClick={runUndo}>되돌리기 · Ctrl/⌘+Z</Button> : null}
          </div>
        ) : null}

        {dayCancelNotices.length ? (
          <div className="mb-3">
            <DayCancelNoticePanel notices={dayCancelNotices} onDismiss={() => setDismissedDayCancelDate(activeModel.pane.date)} />
          </div>
        ) : null}

        {overwrote ? (
          <div className="mb-3" role="status" data-overwrote>
            {/* 막힌 것이 아니다 — 같은 수업을 먼저 고친 사람이 있었고, 방금 저장이 그 위에 반영됐다는 사실만 알린다 (N-142) */}
            <Banner tone="warning">{overwrote}</Banner>
          </div>
        ) : null}

        {overlaps.length ? (
          <div className="mb-3" role="status" data-student-overlaps>
            {/* 학생은 겹침을 막는 축이 아니다 — 저장은 됐고, 같은 시각 다른 수업에도 있다는 사실만 알린다 (N-58) */}
            <Banner tone="warning">
              저장했습니다 — 다만 <b>같은 시각 다른 수업에도 있는 학생</b>이 있습니다: {overlaps.slice(0, 3).join(' · ')}
              {overlaps.length > 3 ? ` 외 ${overlaps.length - 3}건` : ''}
            </Banner>
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

        <Legend items={activeModel.items} colorOf={colorOf} subName={subName} kindName={kindName} display={s.filters.display}
          unavOn={unavOn && (activeModel.pane.view === 'teacher' ? activeModel.pane.personId !== null
            : activeModel.pane.view !== 'student' && (s.filters.teacherId !== null
              || (activeModel.shown === 'day' && activeModel.pane.dayColumns && activeModel.pane.dayAxis === 'teacher')))} />
        </div>

        <ClipboardBar
          count={s.clipboard?.items.length ?? 0}
          cut={s.clipboard?.cut ?? false}
          target={s.cursor ? `${label(s.cursor.date)} · ${hhmm(s.cursor.startMin)}` : null}
          pasteDisabled={!canEdit || write.isPending || pasteInFlight.current}
          pasteBusy={write.isPending || pasteInFlight.current}
          onPaste={pasteAtCursor}
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
          meta={meta.data}
          onWritten={(result, label, detail) => doneWrite(result, label, detail)}
          onClose={() => go({ t: 'open', o: null })}
        />

        {/* 드래그 고스트 — 원본은 흐려지고 이것이 손을 따라간다 (§5.1) */}
        <DragOverlay dropAnimation={null}>
          {creating ? (
            <div className="rounded-md border border-blue bg-blue/10 px-2 py-1 text-[11px] font-bold text-blue shadow-lg">
              새 일정 · {createPreview ? (
                <span data-create-preview>{hhmm(createPreview.startMin)}–{hhmm(createPreview.endMin)}</span>
              ) : `${hhmm(creating.startMin)}부터`}
            </div>
          ) : dragging ? (
            <div style={eventColorStyle(colorOf(dragging))}
              className={`w-40 overflow-hidden rounded-md border px-2 py-1 text-[11px] font-bold shadow-lg ${eventStyles.subject} ${
                dragging.mode === 'online' ? `border-dashed ${eventStyles.online}` : 'border-solid'
              } ${dragCopy ? 'ring-2 ring-violet' : ''}`}>
              {dragCopy ? '복제 · ' : ''}{subName(dragging) ?? dragging.title ?? dragging.kindKey}
              <span className="ml-1 opacity-70">{dragging.students.length ? `· ${dragging.students.length}명` : ''}</span>
              {dropPreview ? (
                <span data-drop-preview className="mt-1 block rounded bg-card/80 px-1 py-0.5 text-[10px] text-fg">
                  {label(dropPreview.date)} · {hhmm(dropPreview.startMin)}–{hhmm(dropPreview.endMin)}
                </span>
              ) : null}
            </div>
          ) : null}
        </DragOverlay>

        <SessionEditor
          draft={draft}
          meta={meta.data}
          onClose={() => setDraft(null)}
          onCreated={(result) => doneWrite(result, '새 일정')}
        />

        {/* 원문 §11 To-Do 띠의 「+ 주기」 — 서랍·운영과 같은 창이다(C96). 받는 사람 기본값은 고른 강사다 */}
        <TodoCreateDialog
          open={canEdit && todoFor !== null} onClose={() => setTodoFor(null)} busy={todoWrite.isPending}
          meId={todoFor} people={meta.data?.staff ?? []}
          onCreate={(body) => todoWrite.mutate({ kind: 'todoCreate', body }, {
            onSuccess: () => { setErr(null); setNotice(`할 일을 주었습니다 — ${body.title}`); },
            onError: (e) => setErr(apiMessage(e)),
          })}
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
