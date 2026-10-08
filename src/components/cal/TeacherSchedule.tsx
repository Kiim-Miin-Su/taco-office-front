/** @file-guide
 * 목적: TeacherSchedule.tsx — TeacherSchedule (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 PPTX §8·§9와 TBO-55 BOC-05b: 기본 오늘 목록에 주간·월간 읽기 보기를 더한다.
 * 세 보기는 같은 occurrence·공휴일·리포트 상태와 05a exact 수업 허브를 사용한다.
 * 관리자 캘린더의 생성·드래그·자원 축은 강사 화면에 가져오지 않는다.
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMeta, useOccurrences, useScheduleHolidays, useTeacherLessonHub, useUnwritten } from '@/api/queries';
import type { Meta, Occurrence, TeacherLessonHubHistoryItem } from '@/api/types';
import { apiMessage } from '@/api/client';
import {
  addDays, boundsOf, dayHeadLabel, hhmm, label, monthGrid, occurrenceKey, step, teacherSchedule, todayKst, weekDays,
} from '@/lib/calendar';
import { AppShell } from '@/components/shell/AppShell';
import { LessonDetail } from '@/components/lesson/LessonDetail';
import { ReportDetailDrawer } from '@/components/report/ReportDetailDrawer';
import { Banner, Button, Chip, LinkButton, Panel, Segmented } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { STATUS_LABEL, STATUS_LOOK } from './EventBlock';
import { LateReportPolicy } from '@/components/teacher/LateReportPolicy';
import { ScreenHeader } from '@/components/teacher/ScreenHeader';
import { TeacherTodayHero } from '@/components/teacher/TeacherTodayHero';
import { useTeacherSurface } from '@/components/teacher/teacher-surface';
import { TeacherLessonHub } from '@/components/teacher/TeacherLessonHub';
import { TeacherLessonGuidePanel, TeacherLessonHistoryPanel } from '@/components/teacher/TeacherLessonHubPanels';
import { TeacherScheduleChange } from '@/components/teacher/TeacherScheduleChange';
import { positiveQueryId, queryEnum, queryIsoDate } from '@/lib/url-state';

const EMPTY: Occurrence[] = [];
type Lookup = {
  subjects: Map<string, string>;
  kinds: Map<string, string>;
  zoom: Map<number, string>;
};
type HubView = 'hub' | 'report' | 'lesson' | 'guide' | 'history' | 'schedule-change';
type TeacherCalendarView = 'day' | 'week' | 'month';

const TEACHER_CALENDAR_VIEWS: Array<{ value: TeacherCalendarView; label: string }> = [
  { value: 'day', label: '오늘' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
];

/** 리포트 상태색은 기존 블록과 한 표를 공유한다. 취소는 상태 축과 별도로 표시한다. */
function statusLabel(occ: Occurrence): string {
  // 사유는 서버의 낱말이다 — 옛 휴강(사유 없음)은 「수업 취소」 그대로 (C92 · N-25)
  if (occ.canceled) return occ.cancelKindLabel ? `휴강 · ${occ.cancelKindLabel}` : '수업 취소';
  if (occ.attendance?.countsForPay === false) return '출결 취소';
  return repStateLabel(occ.repState);
}

/** 리포트 상태 낱말 — 줄 배지와 오른쪽 「색이 뜻하는 것」이 이 한 함수를 쓴다(두 표로 두면 낱말이 갈린다) */
function repStateLabel(state: string): string {
  if (state === 'plan') return '수업 예정';
  if (state === 'none') return '리포트 미작성';
  if (state === 'draft') return '리포트 작성 중';
  if (state === 'na') return '리포트 대상 아님';
  return STATUS_LABEL.find(([key]) => key === state)?.[1] ?? '상태 확인 필요';
}

/** 오늘/다가오는 수업이 공유하는 행. 관리자 드래그·선택·일정 쓰기를 가져오지 않는다. */
function ScheduleRow({ occ, upcoming, lookup, onOpen }: {
  occ: Occurrence; upcoming: boolean; lookup: Lookup; onOpen: (occ: Occurrence) => void;
}) {
  const canceled = occ.canceled || occ.attendance?.countsForPay === false;
  const look = STATUS_LOOK[canceled ? 'na' : occ.repState] ?? STATUS_LOOK.na;
  const subject = (occ.subKey ? lookup.subjects.get(occ.subKey) : undefined)
    ?? occ.title ?? lookup.kinds.get(occ.kindKey) ?? '수업';
  const place = occ.mode === 'online'
    ? (occ.zaccId ? lookup.zoom.get(occ.zaccId) : undefined) ?? '줌 계정 미정'
    : occ.roomName ?? '강의실 미정';
  const students = occ.students.filter((student) => !student.droppedOnce).map((student) => student.name).join(' · ');

  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" onClick={() => onOpen(occ)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4 text-left transition-colors hover:bg-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue sm:flex-nowrap"
        aria-label={`${upcoming ? `${label(occ.date)} ` : ''}${hhmm(occ.startMin)}–${hhmm(occ.endMin)} ${subject} · ${students || '학생 미정'} · ${statusLabel(occ)}`}>
        <span className="flex w-12 shrink-0 flex-col">
          <span className="text-[14px] font-bold text-fg">{hhmm(occ.startMin)}</span>
          <span className="text-[12px] text-fg-subtle">{hhmm(occ.endMin)}</span>
        </span>
        <span aria-hidden="true" style={{ backgroundColor: 'currentColor' }}
          className={cn('h-9 w-1 shrink-0 rounded', look)} />
        <span className="min-w-0 flex-1 basis-40">
          <span className={cn('flex flex-wrap items-center gap-1.5 text-[14px] font-bold text-fg', canceled && 'line-through')}>
            <span className="break-words">{subject}</span><Chip>{lookup.kinds.get(occ.kindKey) ?? '일정'}</Chip>
          </span>
          <span className="mt-1 block break-words text-[12px] text-fg-2">
            {students || '학생 미정'} · {occ.mode === 'online' ? '비대면' : '대면'}
          </span>
          <span className="mt-1 block break-words text-[12px] text-fg-subtle">{place}</span>
        </span>
        <span className={cn('ml-auto shrink-0 rounded-md border px-2 py-1 text-[12px] font-bold', look)}>
          {statusLabel(occ)}
        </span>
      </button>
    </li>
  );
}

/** 기준일로부터 며칠 뒤 — 두 KST 달력일의 차, 표기만 */
const daysAfter = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** 다가오는 수업을 날짜로 묶는다 — 목록은 이미 시각 순(teacherSchedule)이라 순서를 다시 정하지 않는다 */
function byDate(items: readonly Occurrence[]): Array<[string, Occurrence[]]> {
  const groups = new Map<string, Occurrence[]>();
  for (const occ of items) groups.set(occ.date, [...(groups.get(occ.date) ?? []), occ]);
  return [...groups];
}

/** 공휴일 이름표 — 서버 표(GET /schedule/holidays)의 이름 그대로 */
function HolidayChips({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return <>{names.map((name) => <Chip key={name} size="compact" tone="danger">{name}</Chip>)}</>;
}

function lookups(meta?: Meta): Lookup {
  return {
    subjects: new Map((meta?.subs ?? []).map((sub) => [sub.key, sub.name])),
    kinds: new Map((meta?.kinds ?? []).map((kind) => [kind.key, kind.name])),
    zoom: new Map((meta?.zaccs ?? []).map((zoom) => [zoom.id, zoom.label])),
  };
}

function teacherCalendarBounds(view: TeacherCalendarView, anchor: string): { from: string; to: string } {
  return view === 'day' ? { from: anchor, to: addDays(anchor, 7) } : boundsOf(view, anchor);
}

function teacherCalendarLabel(view: TeacherCalendarView, anchor: string): string {
  if (view === 'month') return `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`;
  if (view === 'week') {
    const days = weekDays(anchor);
    return `${label(days[0])} – ${label(days[6])}`;
  }
  return dayHeadLabel(anchor);
}

function scheduleHref(view: TeacherCalendarView, anchor: string, occ?: Pick<Occurrence, 'serId' | 'onDate' | 'date'>): string {
  const params = new URLSearchParams({ view, anchor });
  if (occ) {
    params.set('serId', String(occ.serId));
    params.set('onDate', occ.onDate);
    params.set('date', occ.date);
    params.set('source', 'calendar');
  }
  return `/schedule?${params.toString()}`;
}

function CalendarLessonButton({ occ, lookup, onOpen, compact = false }: {
  occ: Occurrence;
  lookup: Lookup;
  onOpen: (occ: Occurrence) => void;
  compact?: boolean;
}) {
  const canceled = occ.canceled || occ.attendance?.countsForPay === false;
  const look = STATUS_LOOK[canceled ? 'na' : occ.repState] ?? STATUS_LOOK.na;
  const subject = (occ.subKey ? lookup.subjects.get(occ.subKey) : undefined)
    ?? occ.title ?? lookup.kinds.get(occ.kindKey) ?? '수업';
  const students = occ.students.filter((student) => !student.droppedOnce).map((student) => student.name).join(' · ');
  return (
    <button type="button" onClick={() => onOpen(occ)}
      aria-label={`${label(occ.date)} ${hhmm(occ.startMin)}–${hhmm(occ.endMin)} ${subject} · ${students || '학생 미정'} · ${statusLabel(occ)}`}
      className={cn(
        'min-h-11 w-full rounded-lg border px-2 py-2 text-left transition-colors hover:bg-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
        look,
      )}>
      <span className="flex items-center gap-1.5">
        <span className="shrink-0 text-[12px] font-bold">{hhmm(occ.startMin)}</span>
        <span className={cn('min-w-0 flex-1 truncate text-[12px] font-bold', canceled && 'line-through')}>{subject}</span>
      </span>
      {!compact ? <span className="mt-0.5 block truncate text-[12px] opacity-80">{students || '학생 미정'} · {statusLabel(occ)}</span> : null}
    </button>
  );
}

function TeacherWeekCalendar({ anchor, items, holidaysOn, lookup, onOpen, onPickDay }: {
  anchor: string;
  items: readonly Occurrence[];
  holidaysOn: ReadonlyMap<string, string[]>;
  lookup: Lookup;
  onOpen: (occ: Occurrence) => void;
  onPickDay: (date: string) => void;
}) {
  const days = weekDays(anchor);
  const grouped = new Map(byDate(items));
  return (
    <section role="region" aria-label="주간 캘린더" className="min-w-0">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        {days.map((date) => {
          const lessons = grouped.get(date) ?? EMPTY;
          return (
            <article key={date} data-week-date={date} className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
              <button type="button" onClick={() => onPickDay(date)}
                aria-label={`${dayHeadLabel(date)} 오늘 보기`}
                className="min-h-11 w-full border-b border-line bg-inset px-3 py-2 text-left hover:bg-blue/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue">
                <span className="flex items-center justify-between gap-2 text-[12px] font-bold text-fg">
                  <time dateTime={date}>{dayHeadLabel(date)}</time><span className="text-fg-subtle">{lessons.length}건</span>
                </span>
                <span className="mt-1 flex flex-wrap gap-1"><HolidayChips names={holidaysOn.get(date)} /></span>
              </button>
              {lessons.length ? (
                <ul className="flex flex-col gap-1.5 p-2">
                  {lessons.map((occ) => <li key={occurrenceKey(occ)}><CalendarLessonButton occ={occ} lookup={lookup} onOpen={onOpen} /></li>)}
                </ul>
              ) : <p className="p-3 text-[12px] text-fg-subtle">수업 없음</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TeacherMonthCalendar({ anchor, items, holidaysOn, lookup, onOpen, onPickDay }: {
  anchor: string;
  items: readonly Occurrence[];
  holidaysOn: ReadonlyMap<string, string[]>;
  lookup: Lookup;
  onOpen: (occ: Occurrence) => void;
  onPickDay: (date: string) => void;
}) {
  const days = monthGrid(anchor);
  const grouped = new Map(byDate(items));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const month = anchor.slice(0, 7);
  return (
    <section role="region" aria-label="월간 캘린더" className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
        {days.map((date) => {
          const lessons = grouped.get(date) ?? EMPTY;
          const shown = expanded.has(date) ? lessons : lessons.slice(0, 3);
          const more = lessons.length - shown.length;
          return (
            <article key={date} data-month-date={date}
              className={cn('min-h-32 min-w-0 border-b border-r border-line p-2', date.slice(0, 7) !== month && 'bg-inset/60 opacity-70')}>
              <button type="button" onClick={() => onPickDay(date)} aria-label={`${dayHeadLabel(date)} 오늘 보기`}
                className="min-h-11 w-full rounded-md px-1 text-left hover:bg-blue/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue">
                <span className="flex items-center justify-between gap-1 text-[12px] font-bold text-fg">
                  <time dateTime={date}>{Number(date.slice(8, 10))}일</time><span className="text-[12px] text-fg-subtle">{lessons.length}건</span>
                </span>
                <span className="mt-0.5 flex flex-wrap gap-1"><HolidayChips names={holidaysOn.get(date)} /></span>
              </button>
              <ul className="mt-1 flex flex-col gap-1">
                {shown.map((occ) => <li key={occurrenceKey(occ)}><CalendarLessonButton occ={occ} lookup={lookup} onOpen={onOpen} compact /></li>)}
              </ul>
              {more > 0 ? (
                <button type="button" className="mt-1 min-h-11 w-full rounded-md text-[12px] font-bold text-blue hover:bg-blue/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                  onClick={() => setExpanded((current) => new Set(current).add(date))}>+{more}건 더</button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function TeacherSchedule() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 분 경계와 탭 복귀에 맞춰 갱신한다. 자정이 지나면 쿼리 범위도 새 오늘을 따라간다.
  const [now, setNow] = useState(() => Date.now());
  const today = todayKst(now);
  const calendarView = queryEnum(searchParams.get('view'), ['day', 'week', 'month'] as const) ?? 'day';
  const explicitAnchor = queryIsoDate(searchParams.get('anchor'));
  const anchor = explicitAnchor ?? today;
  const calendarRange = teacherCalendarBounds(calendarView, anchor);
  const q = useOccurrences(calendarRange);
  const rawSerId = searchParams.get('serId');
  const rawOnDate = searchParams.get('onDate');
  const rawDate = searchParams.get('date');
  const hasRequestedLesson = rawSerId !== null || rawOnDate !== null || rawDate !== null;
  const requestedSerId = positiveQueryId(rawSerId);
  const requestedOnDate = queryIsoDate(rawOnDate);
  const requestedDate = queryIsoDate(rawDate);
  const validRequestedLesson = hasRequestedLesson && requestedSerId !== null && requestedOnDate !== null && requestedDate !== null;
  const requested = useOccurrences(
    { from: requestedDate ?? today, to: requestedDate ?? today },
    validRequestedLesson,
  );
  const { refetch } = q;
  const unwritten = useUnwritten();
  const { refetch: refetchUnwritten } = unwritten;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      // 상태는 서버에서 다시 읽는다. 자정에는 새 범위 query가 읽으므로 옛 범위는 갱신하지 않는다.
      if (todayKst(current) === today) void refetch();
      // 미작성은 종료 시각으로 바뀐다. AppShell도 같은 viewer query를 보므로 배지까지 함께 갱신한다.
      void refetchUnwritten();
      timer = setTimeout(tick, 60_000 - Date.now() % 60_000);
    };
    const resume = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); tick(); } };
    timer = setTimeout(tick, 60_000 - Date.now() % 60_000);
    document.addEventListener('visibilitychange', resume);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, [today, refetch, refetchUnwritten]);
  const meta = useMeta();
  const items = q.data?.items ?? EMPTY;
  const model = useMemo(() => teacherSchedule(items, anchor), [items, anchor]);
  const lookup = useMemo(() => lookups(meta.data), [meta.data]);
  const requestedOccurrence = validRequestedLesson
    ? (requested.data?.items ?? EMPTY).find((occ) => (
      occ.serId === requestedSerId && occ.onDate === requestedOnDate && occ.date === requestedDate
    )) ?? null
    : null;
  // URL은 새로고침 가능한 selection 정본이고, local 값은 router 반영 전 한 프레임과 자정의 작성 초안을 지킨다.
  const [localOccurrence, setLocalOccurrence] = useState<Occurrence | null>(null);
  const [localSource, setLocalSource] = useState<'home' | 'calendar' | null>(null);
  const [hubView, setHubView] = useState<HubView>('hub');
  const [focusScheduleChange, setFocusScheduleChange] = useState(false);
  const open = localOccurrence ?? requestedOccurrence;
  const hubSerId = open?.serId ?? requestedSerId;
  const hubOnDate = open?.onDate ?? requestedOnDate;
  const hubDate = open?.date ?? requestedDate;
  const lessonHub = useTeacherLessonHub(hubSerId, hubOnDate, hubDate, Boolean(open || validRequestedLesson));
  const requestedIdentity = validRequestedLesson ? `${requestedSerId}|${requestedOnDate}|${requestedDate}` : null;
  useEffect(() => {
    setLocalOccurrence(null);
    setLocalSource(null);
    setHubView('hub');
    setFocusScheduleChange(false);
  }, [requestedIdentity]);
  const openSchedule = (occ: Occurrence) => {
    setLocalOccurrence(occ);
    setLocalSource('calendar');
    setHubView('hub');
    setFocusScheduleChange(false);
    router.replace(scheduleHref(calendarView, anchor, occ));
  };
  const source = localSource ?? queryEnum(searchParams.get('source'), ['home', 'calendar'] as const) ?? 'calendar';
  const closeHub = () => {
    setLocalOccurrence(null);
    setHubView('hub');
    setFocusScheduleChange(false);
    router.replace(source === 'home' ? '/teacher' : scheduleHref(calendarView, anchor));
  };
  const navigateCalendar = (view: TeacherCalendarView, nextAnchor: string) => {
    setLocalOccurrence(null);
    setLocalSource(null);
    setHubView('hub');
    setFocusScheduleChange(false);
    router.replace(scheduleHref(view, nextAnchor));
  };
  const openHistoryLesson = (item: TeacherLessonHubHistoryItem) => {
    setLocalOccurrence(null);
    setLocalSource('calendar');
    setHubView('hub');
    setFocusScheduleChange(false);
    router.replace(scheduleHref(calendarView, item.date, item));
  };
  const ready = q.data !== undefined && !q.isError;
  // 공휴일은 현재 보기와 같은 범위만 — 날짜의 사실이라 로그인한 누구나 읽는다(서버 표 한 곳)
  const teacherSurface = useTeacherSurface();
  const holidays = useScheduleHolidays(calendarRange, teacherSurface);
  const holidaysOn = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const h of holidays.data?.items ?? []) map.set(h.date, [...(map.get(h.date) ?? []), h.name]);
    return map;
  }, [holidays.data]);
  const unwrittenTotal = unwritten.data?.total ?? 0;

  return (
    <AppShell>
      {/* 강사 정책은 화면 최상단 (대표 결정 2026-09-25) — 강사로 로그인했을 때만 선다 */}
      <LateReportPolicy className="mb-3" />
      {/* 화면 이름 「캘린더」는 셸 머리줄 한 곳 — 강사 표면에서는 본문에 다시 세우지 않는다 */}
      <ScreenHeader title="캘린더" />
      {unwrittenTotal > 0 ? (
        // 덱 slide 11 머리 띠 — 「리포트를 안 쓴 수업이 5건 있습니다 · 빨간 수업을 누르면 …」 · 수는 서버 미작성 건수
        <Banner tone="danger" className="mb-4">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 grow">
              <b className="block">리포트를 안 쓴 수업이 {unwrittenTotal}건 있습니다</b>
              <span className="text-[12px]">빨간 수업을 누르면 리포트를 바로 쓸 수 있습니다.</span>
            </span>
            <LinkButton href="/reports" variant="danger" size="sm">빨간 수업 보러가기</LinkButton>
          </span>
        </Banner>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-2">
        <Segmented<TeacherCalendarView> ariaLabel="강사 캘린더 보기" value={calendarView}
          className="[&_button]:min-h-11"
          options={TEACHER_CALENDAR_VIEWS}
          onChange={(view) => navigateCalendar(view, anchor)} />
        <div role="group" aria-label="기간 이동" className="ml-auto flex flex-wrap items-center gap-1">
          <Button className="min-h-11" size="sm" aria-label="이전 기간"
            onClick={() => navigateCalendar(calendarView, step(calendarView, anchor, -1))}>‹</Button>
          <span className="min-w-[156px] px-1 text-center text-[12px] font-bold text-fg">
            {teacherCalendarLabel(calendarView, anchor)}
          </span>
          <Button className="min-h-11" size="sm" aria-label="다음 기간"
            onClick={() => navigateCalendar(calendarView, step(calendarView, anchor, 1))}>›</Button>
          <Button className="min-h-11" size="sm" aria-label="오늘로 이동"
            onClick={() => navigateCalendar(calendarView, today)}>오늘</Button>
        </div>
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-5">
          {calendarView === 'day' ? (
            <TeacherTodayHero date={anchor} lessons={ready ? model.todayCount : null} minutes={ready ? model.todayMinutes : null} />
          ) : null}

          {q.isLoading ? <div role="status"><Banner tone="neutral">수업을 불러오는 중…</Banner></div> : q.isError ? (
            <div role="alert"><Banner tone="danger">수업을 불러오지 못했습니다. <Button size="sm" onClick={() => void q.refetch()}>다시 시도</Button></Banner></div>
          ) : (
            <>
              {meta.isError ? <Banner tone="warning">과목·장소 이름을 일부 불러오지 못했습니다. 수업 상세에서 확인해 주세요.</Banner> : null}
              {holidays.isError ? <Banner tone="warning">공휴일 이름을 불러오지 못했습니다. 수업 일정은 그대로 표시합니다.</Banner> : null}
              {calendarView === 'day' ? (
                <>
                  <section aria-label="오늘 전체 스케줄" className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
                    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-4">
                      <h2 className="text-[16px] font-bold text-fg">{anchor === today ? '오늘' : dayHeadLabel(anchor)} 전체 스케줄</h2>
                      <HolidayChips names={holidaysOn.get(anchor)} />
                      <span className="ml-auto text-[12px] text-fg-subtle">시간 순</span>
                    </div>
                    {model.today.length ? <ul>{model.today.map((occ) => <ScheduleRow key={occurrenceKey(occ)} occ={occ} upcoming={false} lookup={lookup} onOpen={openSchedule} />)}</ul>
                      : <p className="p-6 text-[13px] text-fg-subtle">{anchor === today ? '오늘' : '선택한 날'} 수업이 없습니다.</p>}
                  </section>
                  <section aria-label="다가오는 수업" className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
                    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-4">
                      <h2 className="text-[16px] font-bold text-fg">다가오는 수업</h2><span className="text-[12px] text-fg-subtle">앞으로 7일 · {model.upcoming.length}건</span>
                    </div>
                    {model.upcoming.length ? byDate(model.upcoming).map(([date, occs]) => (
                      <div key={date} role="group" aria-label={`${dayHeadLabel(date)} · ${occs.length}건`} className="border-t border-line first:border-t-0">
                        <div className="flex flex-wrap items-center gap-2 bg-inset px-4 py-2 text-[12px] font-bold text-fg">
                          <time dateTime={date}>{dayHeadLabel(date)}</time>
                          <Chip size="compact" tone="info">{daysAfter(anchor, date)}일 뒤</Chip>
                          <HolidayChips names={holidaysOn.get(date)} />
                          <span className="ml-auto font-medium text-fg-subtle">{occs.length}건</span>
                        </div>
                        <ul>{occs.map((occ) => <ScheduleRow key={occurrenceKey(occ)} occ={occ} upcoming lookup={lookup} onOpen={openSchedule} />)}</ul>
                      </div>
                    ))
                      : <p className="p-6 text-[13px] text-fg-subtle">앞으로 7일 동안 예정된 수업이 없습니다.</p>}
                  </section>
                </>
              ) : calendarView === 'week' ? (
                <TeacherWeekCalendar anchor={anchor} items={items} holidaysOn={holidaysOn} lookup={lookup}
                  onOpen={openSchedule} onPickDay={(date) => navigateCalendar('day', date)} />
              ) : (
                <TeacherMonthCalendar anchor={anchor} items={items} holidaysOn={holidaysOn} lookup={lookup}
                  onOpen={openSchedule} onPickDay={(date) => navigateCalendar('day', date)} />
              )}
              <p className="text-[12px] text-fg-subtle">내 스케줄에 배정된 학생만 표시됩니다. 취소·휴강과 출결 취소는 오늘 보기의 건수·시수에서 제외합니다.</p>
            </>
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-4" aria-label="내 수업 할 일">
          <Panel title="내 수업 할 일">
            <dl className="flex flex-col gap-4 text-[13px]">
              <div className="flex items-center justify-between gap-2"><dt><Link href="/reports" className="font-bold text-fg hover:text-blue">리포트 미작성 ›</Link></dt><dd className="font-bold text-red">{unwritten.isError ? '확인 필요' : unwritten.data?.total ?? '—'}</dd></div>
            </dl>
          </Panel>
          {/* 덱 slide 11 오른쪽 「상자 색이 뜻하는 것」 — 줄 왼쪽 색 막대와 상태 칸이 같은 표(STATUS_LOOK)를 쓴다 */}
          <Panel title="색이 뜻하는 것">
            <ul className="flex flex-col gap-2 text-[12px] text-fg-2">
              {STATUS_LABEL.map(([state]) => (
                <li key={state} className="flex items-center gap-2">
                  <span aria-hidden="true" style={{ backgroundColor: 'currentColor' }} className={cn('h-3.5 w-1 shrink-0 rounded', STATUS_LOOK[state])} />
                  {repStateLabel(state)}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span aria-hidden="true" style={{ backgroundColor: 'currentColor' }} className={cn('h-3.5 w-1 shrink-0 rounded', STATUS_LOOK.na)} />
                취소된 수업 · 리포트 대상 아님
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
      {hasRequestedLesson && !validRequestedLesson ? (
        <div role="alert" className="mt-4"><Banner tone="danger">수업 주소가 올바르지 않습니다. 캘린더에서 수업을 다시 선택해 주세요.</Banner></div>
      ) : validRequestedLesson && requested.isLoading && !localOccurrence ? (
        <div role="status" className="mt-4"><Banner tone="neutral">선택한 수업을 불러오는 중…</Banner></div>
      ) : validRequestedLesson && lessonHub.isError && !localOccurrence ? (
        <div role="alert" className="mt-4"><Banner tone="warning">{apiMessage(lessonHub.error)}</Banner></div>
      ) : validRequestedLesson && !requested.isLoading && !requested.isError && !open ? (
        <div role="alert" className="mt-4"><Banner tone="warning">해당 수업을 찾을 수 없습니다. 캘린더에서 다시 선택해 주세요.</Banner></div>
      ) : validRequestedLesson && requested.isError && !localOccurrence ? (
        <div role="alert" className="mt-4"><Banner tone="danger">선택한 수업을 불러오지 못했습니다.</Banner></div>
      ) : null}
      {open && hubView === 'hub' ? (
        <TeacherLessonHub occ={open} hub={lessonHub.data} loading={lessonHub.isLoading}
          errorMessage={lessonHub.isError ? apiMessage(lessonHub.error) : undefined}
          today={today} kindName={lookup.kinds.get(open.kindKey)}
          focusScheduleChange={focusScheduleChange}
          subName={open.subKey ? lookup.subjects.get(open.subKey) : undefined}
          onReport={() => setHubView('report')} onLesson={() => setHubView('lesson')}
          onGuide={() => setHubView('guide')} onHistory={() => setHubView('history')}
          onScheduleChange={() => { setFocusScheduleChange(false); setHubView('schedule-change'); }} onClose={closeHub} />
      ) : null}
      {open ? (
        <TeacherScheduleChange open={hubView === 'schedule-change'} occ={open} today={today}
          onBack={() => { setFocusScheduleChange(true); setHubView('hub'); }} />
      ) : null}
      <ReportDetailDrawer selection={open && hubView === 'report' ? { serId: open.serId, onDate: open.onDate } : null}
        onClose={() => setHubView('hub')} />
      {open && hubView === 'lesson' ? (
        <LessonDetail occ={open} kindName={lookup.kinds.get(open.kindKey)}
          subName={open.subKey ? lookup.subjects.get(open.subKey) : undefined} onClose={() => setHubView('hub')} />
      ) : null}
      {lessonHub.data && hubView === 'guide' ? (
        <TeacherLessonGuidePanel hub={lessonHub.data} onClose={() => setHubView('hub')} />
      ) : null}
      {lessonHub.data && hubView === 'history' ? (
        <TeacherLessonHistoryPanel hub={lessonHub.data}
          subjectName={(key) => key ? lookup.subjects.get(key) ?? lookup.kinds.get(key) ?? key : '과목 미정'}
          onOpenLesson={openHistoryLesson} onClose={() => setHubView('hub')} />
      ) : null}
    </AppShell>
  );
}
