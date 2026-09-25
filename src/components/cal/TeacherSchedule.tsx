/** @file-guide
 * 목적: TeacherSchedule.tsx — TeacherSchedule (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 PPTX §8·§9: 웹/모바일 캘린더의 기본은 오늘 수업 목록이며 관리자 주간표와 다르다
 * (AGENT.md §B 「캘린더 탭에서도 같은 목록 원칙」이 덱 slide 11 의 주간 격자보다 우선한다).
 * 덱 slide 11 에서 목록에 옮겨 오는 것: 안 쓴 리포트 빨간 띠 · 「내 스케줄에 배정된 학생만」 · 날짜별 공휴일 이름표 · 색이 뜻하는 것.
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMeta, useOccurrences, useScheduleHolidays, useUnwritten } from '@/api/queries';
import type { Meta, Occurrence } from '@/api/types';
import { addDays, dowOf, hhmm, KO_DOW, label, occurrenceKey, teacherSchedule, todayKst } from '@/lib/calendar';
import { AppShell } from '@/components/shell/AppShell';
import { LessonDetail } from '@/components/lesson/LessonDetail';
import { ReportDetailDrawer } from '@/components/report/ReportDetailDrawer';
import { Banner, Button, Chip, LinkButton, Panel } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { STATUS_LABEL, STATUS_LOOK } from './EventBlock';
import { LateReportPolicy } from '@/components/teacher/LateReportPolicy';
import { ScreenHeader } from '@/components/teacher/ScreenHeader';
import { TeacherTodayHero } from '@/components/teacher/TeacherTodayHero';
import { useTeacherSurface } from '@/components/teacher/teacher-surface';

const EMPTY: Occurrence[] = [];
type Lookup = {
  subjects: Map<string, string>;
  kinds: Map<string, string>;
  zoom: Map<number, string>;
};
type Selection =
  | { kind: 'report'; ref: Pick<Occurrence, 'serId' | 'onDate'> }
  | { kind: 'lesson'; key: string }
  | null;

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
          <span className="text-[11px] text-fg-subtle">{hhmm(occ.endMin)}</span>
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
          <span className="mt-1 block break-words text-[11px] text-fg-subtle">{place}</span>
        </span>
        <span className={cn('ml-auto shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold', look)}>
          {statusLabel(occ)}
        </span>
      </button>
    </li>
  );
}

/** 기준일로부터 며칠 뒤 — 두 KST 달력일의 차, 표기만 */
const daysAfter = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** 날짜 묶음 머리 — 덱 리포트 목록(slide 18)과 같은 「9월 9일 (수)」 모양 */
const dayHead = (iso: string): string => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일 (${KO_DOW[dowOf(iso)]})`;

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

export function TeacherSchedule() {
  // 분 경계와 탭 복귀에 맞춰 갱신한다. 자정이 지나면 쿼리 범위도 새 오늘을 따라간다.
  const [now, setNow] = useState(() => Date.now());
  const today = todayKst(now);
  const q = useOccurrences({ from: today, to: addDays(today, 7) });
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
  const model = useMemo(() => teacherSchedule(items, today), [items, today]);
  const lookup = useMemo(() => lookups(meta.data), [meta.data]);
  // 리포트는 자정에 목록 범위가 바뀌어도 열려 있어야 한다. 식별자만 보존하고 본문은 Editor가 소유한다.
  const [selected, setSelected] = useState<Selection>(null);
  const open = selected?.kind === 'lesson'
    ? items.find((occ) => occurrenceKey(occ) === selected.key) ?? null : null;
  const openSchedule = (occ: Occurrence) => setSelected(
    occ.repState !== 'na' && !occ.canceled
      ? { kind: 'report', ref: { serId: occ.serId, onDate: occ.onDate } }
      : { kind: 'lesson', key: occurrenceKey(occ) },
  );
  const ready = q.data !== undefined && !q.isError;
  // 공휴일은 목록과 같은 범위(오늘~7일 뒤)만 — 날짜의 사실이라 로그인한 누구나 읽는다(서버 표 한 곳)
  const teacherSurface = useTeacherSurface();
  const holidays = useScheduleHolidays({ from: today, to: addDays(today, 7) }, teacherSurface);
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
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-5">
          <TeacherTodayHero date={today} lessons={ready ? model.todayCount : null} minutes={ready ? model.todayMinutes : null} />

          {q.isLoading ? <div role="status"><Banner tone="neutral">수업을 불러오는 중…</Banner></div> : q.isError ? (
            <div role="alert"><Banner tone="danger">수업을 불러오지 못했습니다. <Button size="sm" onClick={() => void q.refetch()}>다시 시도</Button></Banner></div>
          ) : (
            <>
              {meta.isError ? <Banner tone="warning">과목·장소 이름을 일부 불러오지 못했습니다. 수업 상세에서 확인해 주세요.</Banner> : null}
              <section aria-label="오늘 전체 스케줄" className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-4">
                  <h2 className="text-[16px] font-bold text-fg">오늘 전체 스케줄</h2>
                  <HolidayChips names={holidaysOn.get(today)} />
                  <span className="ml-auto text-[11px] text-fg-subtle">시간 순</span>
                </div>
                {model.today.length ? <ul>{model.today.map((occ) => <ScheduleRow key={occurrenceKey(occ)} occ={occ} upcoming={false} lookup={lookup} onOpen={openSchedule} />)}</ul>
                  : <p className="p-6 text-[13px] text-fg-subtle">오늘 수업이 없습니다.</p>}
              </section>
              <section aria-label="다가오는 수업" className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-4">
                  <h2 className="text-[16px] font-bold text-fg">다가오는 수업</h2><span className="text-[11px] text-fg-subtle">앞으로 7일 · {model.upcoming.length}건</span>
                </div>
                {model.upcoming.length ? byDate(model.upcoming).map(([date, occs]) => (
                  // 날짜 묶음 — 덱 리포트 목록(slide 18)의 「8월 25일 (화) 2건」 머리와 같은 모양 · 공휴일 이름표는 그날 머리에
                  <div key={date} role="group" aria-label={`${dayHead(date)} · ${occs.length}건`} className="border-t border-line first:border-t-0">
                    <div className="flex flex-wrap items-center gap-2 bg-inset px-4 py-2 text-[12px] font-bold text-fg">
                      <time dateTime={date}>{dayHead(date)}</time>
                      <Chip size="compact" tone="info">{daysAfter(today, date)}일 뒤</Chip>
                      <HolidayChips names={holidaysOn.get(date)} />
                      <span className="ml-auto font-medium text-fg-subtle">{occs.length}건</span>
                    </div>
                    <ul>{occs.map((occ) => <ScheduleRow key={occurrenceKey(occ)} occ={occ} upcoming lookup={lookup} onOpen={openSchedule} />)}</ul>
                  </div>
                ))
                  : <p className="p-6 text-[13px] text-fg-subtle">앞으로 7일 동안 예정된 수업이 없습니다.</p>}
              </section>
              <p className="text-[11px] text-fg-subtle">내 스케줄에 배정된 학생만 표시됩니다. 취소·휴강과 출결 취소는 오늘 건수·시수에서 제외합니다.</p>
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
      <ReportDetailDrawer selection={selected?.kind === 'report' ? selected.ref : null} onClose={() => setSelected(null)} />
      {open ? (
        <LessonDetail occ={open} kindName={lookup.kinds.get(open.kindKey)}
          subName={open.subKey ? lookup.subjects.get(open.subKey) : undefined} onClose={() => setSelected(null)} />
      ) : null}
    </AppShell>
  );
}
