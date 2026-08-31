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
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, ConflictGuard, PageHeader, Panel, RecurrenceScope, Segmented } from '@/components/ui';
import { DayGrid, MonthGrid, WeekGrid, type DropData } from '@/components/cal/Grids';
import { ClipboardBar } from '@/components/cal/ClipboardBar';
import { SessionEditor, type SessionDraft } from '@/components/cal/SessionEditor';
import { type DragData } from '@/components/cal/EventBlock';
import { Legend } from '@/components/cal/Legend';
import { LessonDetail } from '@/components/lesson/LessonDetail';
import { useHorizon, useMeta, useOccurrences, useScheduleWrite } from '@/api/queries';
import { apiMessage } from '@/api/client';
import { useCan } from '@/store/useSession';
import {
  HOUR_PX, boundsOf, label, monthGrid, movePatch, movePlacements, occurrenceKey, resizePatch,
  selectOccurrenceKeys, selectedOccurrences, step, todayKst, type SelectMode, type View,
} from '@/lib/calendar';
import type { Occurrence, OccurrenceMove, OccurrencePaste, OccurrencePatch, Scope } from '@/api/types';

/* ── 상태 — 명시적 action + 순수 reducer (§6.1-3) ────────────────────── */

interface S {
  view: View;
  date: string;
  /** §10 · §11 왼쪽에서 고른 사람 */
  personId: number | null;
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
  | { t: 'step'; dir: -1 | 1 }
  | { t: 'today' }
  | { t: 'person'; id: number | null }
  | { t: 'open'; o: Occurrence | null }
  | { t: 'selected'; keys: string[] }
  | { t: 'clipboard'; value: S['clipboard'] }
  | { t: 'cursor'; value: PasteCursor | null };

function reducer(s: S, a: A): S {
  switch (a.t) {
    case 'view':
      // 사람을 고르는 보기가 아니면 선택을 놓는다 — 안 그러면 안 보이는 필터가 남는다
      return { ...s, view: a.v, personId: a.v === 'student' || a.v === 'teacher' ? s.personId : null };
    case 'date': return { ...s, date: a.d, view: s.view === 'month' ? 'day' : s.view };
    case 'step': return { ...s, date: step(s.view, s.date, a.dir) };
    case 'today': return { ...s, date: todayKst() };
    case 'person': return { ...s, personId: a.id };
    case 'open': return { ...s, open: a.o };
    case 'selected': return { ...s, selected: a.keys };
    case 'clipboard': return { ...s, clipboard: a.value, cursor: a.value ? s.cursor : null };
    case 'cursor': return { ...s, cursor: a.value };
  }
}

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'student', label: '학생별' },
  { value: 'teacher', label: '선생님별' },
];

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

export default function SchedulePage() {
  const [s, go] = useReducer(reducer, {
    view: 'day', date: todayKst(), personId: null, open: null,
    selected: [], clipboard: null, cursor: null,
  });
  const meta = useMeta();
  const hz = useHorizon();
  const write = useScheduleWrite();
  const canEdit = useCan('canCrudAll');

  /* ── 드래그 (TBO-41 · CALENDAR §5) — 계산은 lib, 판정은 서버, 여기는 배선만 ── */
  const [dragging, setDragging] = useState<Occurrence | null>(null);
  const [dragCopy, setDragCopy] = useState(false);
  const dragCopyRef = useRef(false);
  /** 반복이면 저장 직전 1회만 묻는다 (§5A.0). 낙관 반영은 mutate 가 한다 */
  const [ask, setAsk] = useState<{ occ: Occurrence; body: PendingPatch } | null>(null);
  /** Ctrl+드래그와 Ctrl/⌘+V가 같은 paste 다이얼로그·mutation을 쓴다. */
  const [pasteAsk, setPasteAsk] = useState<PendingPaste | null>(null);
  const [moveAsk, setMoveAsk] = useState<PendingMoveMany | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** 빈 칸에서 시작하는 새 일정 (C-5) — 새 일정은 범위를 묻지 않는다 */
  const [draft, setDraft] = useState<SessionDraft | null>(null);

  // 클릭과 드래그를 가른다 — 4px 을 움직여야 드래그다. 이게 없으면 열기 클릭이 전부 드래그가 된다
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const submit = (occ: Occurrence, body: PendingPatch, scope: Scope) => {
    write.mutate(
      { kind: 'patch', serId: occ.serId, body: { ...body, scope, onDate: occ.onDate } },
      { onError: (e) => setErr(apiMessage(e)), onSuccess: () => setErr(null) },
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
        onError: (e) => setErr(apiMessage(e)),
        onSuccess: () => {
          setErr(null);
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
        onError: (e) => setErr(apiMessage(e)),
        onSuccess: () => { setErr(null); setMoveAsk(null); },
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
    const occurrences = selectedOccurrences(all, s.selected);
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
    if (!s.selected.includes(occurrenceKey(d.occ))) go({ t: 'selected', keys: [occurrenceKey(d.occ)] });
    const activator = e.activatorEvent as MouseEvent;
    dragCopyRef.current = d.type === 'move' && (activator.ctrlKey || activator.metaKey);
    setDragCopy(dragCopyRef.current);
    if (d.type === 'move') setDragging(d.occ);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    setDragCopy(false);
    const copy = dragCopyRef.current;
    dragCopyRef.current = false;
    const d = e.active.data.current as DragData | undefined;
    if (!d) return;
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
    // 일간 — 시각은 움직인 거리에서, 컬럼은 드롭한 칸에서 (§4.4 — 축이 무엇을 바꾸나)
    const t = {
      date: over.date,
      startMin: d.occ.startMin + (e.delta.y / HOUR_PX) * 60,
      ...(over.colAxis === 'teacher' ? { teacherId: over.colId } : { roomId: over.colId }),
    };
    const patch = movePatch(d.occ, t);
    if (copy) {
      requestPaste({
        items: [d.occ], fromClipboard: false,
        target: {
          targetDate: over.date,
          targetStartMin: patch?.startMin ?? d.occ.startMin,
          cut: false,
          ...(over.colAxis === 'teacher' ? { teacherId: over.colId } : { roomId: over.colId }),
        },
      });
    } else if (!requestMoveMany(
      d.occ,
      over.date,
      patch?.startMin ?? d.occ.startMin,
      over.colAxis === 'teacher' ? { teacherId: over.colId } : { roomId: over.colId },
    )) {
      request(d.occ, patch);
    }
  };

  // ② 보기가 무엇이든 **범위 하나**만 읽는다.
  //    사람 필터를 서버에 보내지 않는 것이 요점이다 — 보내면 사람마다 다른 응답이 되어
  //    주간과 캐시를 공유하지 못하고, 왼쪽 목록에 「누가 몇 건인지」도 못 적는다.
  const range = useMemo(() => boundsOf(s.view, s.date), [s.view, s.date]);
  const q = useOccurrences({ from: range.from, to: range.to });

  const all = useMemo(() => q.data?.items ?? [], [q.data]);

  const selectedSet = useMemo(() => new Set(s.selected), [s.selected]);
  const select = (occ: Occurrence, mode: SelectMode) => {
    go({ t: 'selected', keys: selectOccurrenceKeys(all, s.selected, occ, mode) });
  };

  /** 복사 시점에는 DB를 바꾸지 않는다. X도 붙여넣기 성공 전까지 원본을 보존한다. */
  const copySelection = (cut: boolean) => {
    const picked = selectedOccurrences(all, s.selected);
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
    setDraft({ date, startMin, roomId: colAxis === 'room' ? (colId ?? null) : null });
  };

  /** ③ 사람 필터는 selector 로 — 같은 응답을 나눠 쓴다 */
  const items = useMemo(() => {
    if (s.view === 'student') {
      return s.personId === null ? [] : all.filter((o) => o.students.some((x) => x.id === s.personId));
    }
    if (s.view === 'teacher') {
      return s.personId === null ? [] : all.filter((o) => o.teacherId === s.personId);
    }
    return all;
  }, [all, s.view, s.personId]);
  /** 코드표 → 이름. 화면이 `class` 같은 코드값을 그대로 찍지 않는다 (D-R18) */
  const subName = useMemo(() => {
    const m = new Map((meta.data?.subs ?? []).map((x) => [x.key, x.name]));
    return (o: Occurrence) => (o.subKey ? m.get(o.subKey) : undefined);
  }, [meta.data]);
  const kindName = useMemo(() => {
    const m = new Map((meta.data?.kinds ?? []).map((x) => [x.key, x.name]));
    return (o: Occurrence) => m.get(o.kindKey);
  }, [meta.data]);

  /** §7 세로 열 — 강의실이 기본, 선생님별 보기는 강사로 바꾼다 */
  const columns = useMemo(() => {
    if (s.view === 'teacher') {
      return (meta.data?.staff ?? []).map((t) => ({ id: t.id, name: t.name }));
    }
    return [
      ...(meta.data?.rooms ?? []).map((r) => ({ id: r.id as number | null, name: r.name })),
      { id: null, name: '온라인 · 미지정' },
    ];
  }, [meta.data, s.view]);

  /**
   * 왼쪽 목록 — 이름 옆에 **이 기간의 건수**를 적는다.
   * §11 은 시수 합계도 요구한다. **취소·휴강은 빼고** 센다 (D-R11).
   */
  const people = useMemo(() => {
    const mine = (id: number) =>
      s.view === 'student'
        ? all.filter((o) => o.students.some((x) => x.id === id))
        : all.filter((o) => o.teacherId === id);
    const src = s.view === 'student'
      ? (meta.data?.students ?? []).map((x) => ({ id: x.id, name: x.name, sub: x.grade ?? '' }))
      : (meta.data?.staff ?? []).map((x) => ({ id: x.id, name: x.name, sub: x.title ?? '' }));
    return src
      .map((p) => {
        const list = mine(p.id);
        const live = list.filter((o) => !o.canceled);
        return {
          ...p,
          n: list.length,
          // 시수 = 취소를 뺀 회차의 분 합계 (D-R11)
          hours: live.reduce((t, o) => t + (o.endMin - o.startMin), 0) / 60,
        };
      })
      // 이 기간에 수업이 있는 사람을 위로 — 첫 줄이 늘 0건이면 화면이 고장 난 것처럼 보인다
      .sort((a2, b2) => b2.n - a2.n || a2.name.localeCompare(b2.name, 'ko'));
  }, [all, meta.data, s.view]);

  /**
   * 열린 상세는 **캐시의 최신 행**을 본다 (SSOT §6.1-1). 열 때의 스냅숏을 계속 보여 주면
   * 명단을 바꿔도 서랍이 옛 명단을 보여 준다 — 서버가 고친 것을 화면이 무시하는 모양이 된다.
   */
  const open = useMemo(() => {
    if (!s.open) return null;
    return all.find((o) => o.serId === s.open!.serId && o.onDate === s.open!.onDate) ?? s.open;
  }, [all, s.open]);

  const outOfHorizon = !!hz.data && (range.from < hz.data.from || range.to > hz.data.to);
  const grid = s.view === 'month' ? monthGrid(s.date) : [];

  const head = s.view === 'month'
    ? `${s.date.slice(0, 4)}년 ${+s.date.slice(5, 7)}월`
    : s.view === 'day' ? label(s.date) : `${label(range.from)} – ${label(range.to)}`;

  return (
    <RequireAuth>
      <AppShell>
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <PageHeader
          title="스케줄"
          sub="§7~§12 — 여섯 컷이 한 화면의 보기 전환입니다. 같은 범위를 한 번만 읽습니다."
          right={<Segmented options={VIEWS} value={s.view} onChange={(v) => go({ t: 'view', v })} />}
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => go({ t: 'step', dir: -1 })}>‹</Button>
          <Button size="sm" onClick={() => go({ t: 'today' })}>오늘</Button>
          <Button size="sm" onClick={() => go({ t: 'step', dir: 1 })}>›</Button>
          <span className="ml-1 text-[14px] font-bold text-fg">{head}</span>
          <span className="text-[12px] text-fg-subtle">{items.length}건</span>
          {s.cursor ? <Chip tone="info">붙여넣기 위치 {label(s.cursor.date)} · {Math.floor(s.cursor.startMin / 60)}:{String(s.cursor.startMin % 60).padStart(2, '0')}</Chip> : null}
          <div className="ml-auto"><Legend /></div>
        </div>

        {outOfHorizon ? (
          <Banner tone="warning">
            이 범위는 <b>아직 펼쳐지지 않았습니다</b>. 회차는 {hz.data?.from} ~ {hz.data?.to} 만 표에 있습니다 —
            비어 보이는 것은 일정이 없어서가 아닙니다.
          </Banner>
        ) : null}

        {err ? (
          <div className="mb-3">
            {/* 겹침이면 되돌아가 있다 — 낙관 반영은 mutate 가 이미 원자적으로 되돌렸다 (§5.1) */}
            <ConflictGuard result="blocking" message={err} />
          </div>
        ) : null}

        {s.view === 'student' || s.view === 'teacher' ? (
          <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
            <Panel title={s.view === 'student' ? '학생' : '선생님'} sub="고르면 그 사람 일정만">
              <div className="max-h-[560px] overflow-y-auto">
                {people.map((p) => (
                  <button key={p.id} type="button" onClick={() => go({ t: 'person', id: p.id })}
                    className={`flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left transition-colors hover:bg-inset ${
                      s.personId === p.id ? 'bg-blue/10' : ''}`}>
                    <span className="text-[12px] font-bold text-fg">{p.name}</span>
                    <span className="text-[11px] text-fg-subtle">{p.sub}</span>
                    <span className={`ml-auto text-[11px] ${p.n ? 'font-bold text-blue' : 'text-line-2'}`}>
                      {p.n ? `${p.n}건` : '—'}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>
            {s.personId ? (
              <div className="flex flex-col gap-3">
                {s.view === 'teacher' ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
                    <span className="text-[12px] font-bold text-fg">
                      {people.find((p) => p.id === s.personId)?.name}
                    </span>
                    <Chip tone="info">{items.filter((o) => !o.canceled).length}회</Chip>
                    {/*
                      「시수」라는 낱말이 회계 탭에도 있다. 그쪽은 **그 달의 확정된 정산 시수**
                      (PAYOUT 에 저장된 스냅숏)이고, 이것은 **지금 보고 있는 기간**의 합계다.
                      숫자가 다를 수밖에 없으므로 무엇을 센 것인지 적어 둔다 —
                      안 적으면 강사가 두 숫자를 맞춰 보다가 어느 쪽이 틀렸는지 묻게 된다.
                    */}
                    <Chip title="이 기간 · 취소 제외 (D-R11). 정산 시수는 회계 탭에서 월 단위로 확정됩니다">
                      이 기간 시수 {(people.find((p) => p.id === s.personId)?.hours ?? 0).toFixed(1)}시간
                    </Chip>
                    <span className="text-[11px] text-fg-subtle">취소·휴강은 시수에서 뺍니다 (D-R11)</span>
                  </div>
                ) : null}
                <WeekGrid date={s.date} items={items} subName={subName} interactive={canEdit}
                  onSelect={select} selected={selectedSet}
                  cursorDate={s.cursor?.date}
                  onAdd={canEdit && s.clipboard ? (d) => chooseSlot(d, 10 * 60) : undefined}
                  onOpen={(o) => go({ t: 'open', o })} onPickDate={(d) => go({ t: 'date', d })} />
              </div>
            ) : (
              <Panel title="사람을 고르세요">
                <p className="p-6 text-[12px] text-fg-subtle">
                  왼쪽에서 {s.view === 'student' ? '학생' : '선생님'}을 고르면 그 사람 일정만 봅니다.
                </p>
              </Panel>
            )}
          </div>
        ) : s.view === 'day' ? (
          <DayGrid date={s.date} items={items} columns={columns} colAxis="room"
            columnOf={(o) => o.roomId ?? null}
            subName={subName} onOpen={(o) => go({ t: 'open', o })}
            onSelect={select} selected={selectedSet} interactive={canEdit}
            cursor={s.cursor?.colAxis ? { ...s.cursor, colAxis: s.cursor.colAxis, colId: s.cursor.colId ?? null } : null}
            onAddAt={(date, startMin, roomId) => chooseSlot(date, startMin, 'room', roomId)} />
        ) : s.view === 'week' ? (
          <WeekGrid date={s.date} items={items} subName={subName} interactive={canEdit}
            onSelect={select} selected={selectedSet}
            cursorDate={s.cursor?.date}
            onOpen={(o) => go({ t: 'open', o })} onPickDate={(d) => go({ t: 'date', d })}
            onAdd={canEdit ? (d) => chooseSlot(d, 10 * 60) : undefined} />
        ) : (
          <MonthGrid date={s.date} items={items} grid={grid} subName={subName} interactive={canEdit}
            onSelect={select} selected={selectedSet}
            cursorDate={s.cursor?.date}
            onOpen={(o) => go({ t: 'open', o })} onPickDate={(d) => go({ t: 'date', d })}
            onAdd={canEdit ? (d) => chooseSlot(d, 10 * 60) : undefined} />
        )}

        {q.isLoading ? <p className="mt-3 text-[12px] text-fg-subtle">불러오는 중…</p> : null}
        {!q.isLoading && items.length === 0 && !outOfHorizon ? (
          <p className="mt-3 text-[12px] text-fg-subtle">이 기간에 수업이 없습니다.</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-fg-subtle">
          <Chip>취소·휴강 {items.filter((o) => o.canceled).length}</Chip>
          <Chip>이 회차만 다름 {items.filter((o) => o.hasException).length}</Chip>
          <Chip>리포트 쓴 수업 {items.filter((o) => o.written).length}</Chip>
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
          onClose={() => go({ t: 'open', o: null })}
        />

        {/* 드래그 고스트 — 원본은 흐려지고 이것이 손을 따라간다 (§5.1) */}
        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div className={`w-40 rounded-md border px-2 py-1 text-[11px] font-bold shadow-lg ${
              dragCopy ? 'border-violet bg-violet/10 text-violet' : 'border-blue bg-blue/10 text-blue'
            }`}>
              {dragCopy ? '복제 · ' : ''}{subName(dragging) ?? dragging.title ?? dragging.kindKey}
              <span className="ml-1 opacity-70">{dragging.students.length ? `· ${dragging.students.length}명` : ''}</span>
            </div>
          ) : null}
        </DragOverlay>

        <SessionEditor draft={draft} meta={meta.data} onClose={() => setDraft(null)} />

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
