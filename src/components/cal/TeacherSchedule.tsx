/** @file-guide
 * 목적: TeacherSchedule.tsx — TeacherSchedule (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** 강사 PPTX §8·§9: 웹/모바일 캘린더의 기본은 오늘 수업 목록이며 관리자 주간표와 다르다. */
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDrawer, useMeta, useOccurrences, useUnwritten } from '@/api/queries';
import type { Meta, Occurrence } from '@/api/types';
import { addDays, dowOf, hhmm, KO_DOW, label, occurrenceKey, teacherSchedule, todayKst } from '@/lib/calendar';
import { AppShell } from '@/components/shell/AppShell';
import { LessonDetail } from '@/components/lesson/LessonDetail';
import { ReportDetailDrawer } from '@/components/report/ReportDetailDrawer';
import { Banner, Button, Chip, Panel } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { STATUS_LABEL, STATUS_LOOK } from './EventBlock';

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
  if (occ.canceled) return '수업 취소';
  if (occ.attendance?.countsForPay === false) return '출결 취소';
  if (occ.repState === 'plan') return '수업 예정';
  if (occ.repState === 'none') return '리포트 미작성';
  if (occ.repState === 'draft') return '리포트 작성 중';
  if (occ.repState === 'na') return '리포트 대상 아님';
  return STATUS_LABEL.find(([state]) => state === occ.repState)?.[1] ?? '상태 확인 필요';
}

/** 오늘/다가오는 수업이 공유하는 행. 관리자 드래그·선택·일정 쓰기를 가져오지 않는다. */
function ScheduleRow({ occ, today, upcoming, lookup, onOpen }: {
  occ: Occurrence; today: string; upcoming: boolean; lookup: Lookup; onOpen: (occ: Occurrence) => void;
}) {
  const canceled = occ.canceled || occ.attendance?.countsForPay === false;
  const look = STATUS_LOOK[canceled ? 'na' : occ.repState] ?? STATUS_LOOK.na;
  const subject = (occ.subKey ? lookup.subjects.get(occ.subKey) : undefined)
    ?? occ.title ?? lookup.kinds.get(occ.kindKey) ?? '수업';
  const place = occ.mode === 'online'
    ? (occ.zaccId ? lookup.zoom.get(occ.zaccId) : undefined) ?? '줌 계정 미정'
    : occ.roomName ?? '강의실 미정';
  const daysAway = Math.round((Date.parse(`${occ.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const students = occ.students.filter((student) => !student.droppedOnce).map((student) => student.name).join(' · ');

  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" onClick={() => onOpen(occ)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4 text-left transition-colors hover:bg-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue sm:flex-nowrap"
        aria-label={`${upcoming ? `${label(occ.date)} ` : ''}${hhmm(occ.startMin)}–${hhmm(occ.endMin)} ${subject} · ${students || '학생 미정'} · ${statusLabel(occ)}`}>
        {upcoming ? (
          <span className="flex w-full items-center gap-2 text-[12px] font-bold text-fg sm:w-28 sm:shrink-0 sm:flex-col sm:items-start">
            <time dateTime={occ.date}>{label(occ.date)}</time><Chip tone="info">{daysAway}일 뒤</Chip>
          </span>
        ) : null}
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
  const drawer = useDrawer();
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
  const clock = new Date(now + 9 * 3600 * 1000).toISOString().slice(11, 16);
  const pending = drawer.data?.approvals.mine.filter((row) => row.state === 'waiting').length;
  const changes = drawer.data?.changeReqs.filter((row) => row.state === 'pending').length;
  const ready = q.data !== undefined && !q.isError;

  return (
    <AppShell>
      <h1 className="mb-4 text-[20px] font-bold text-fg">캘린더</h1>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-4 rounded-xl bg-fg px-5 py-6 text-white sm:px-6">
            <span className="text-[44px] font-bold leading-none">{Number(today.slice(8, 10))}</span>
            <div className="min-w-0 flex-1 border-l border-white/20 pl-4">
              <p className="text-[16px] font-bold">{today.slice(0, 4)}년 {Number(today.slice(5, 7))}월 {Number(today.slice(8, 10))}일 ({KO_DOW[dowOf(today)]})</p>
              <p className="mt-2 text-[12px] text-line-2">
                {ready ? `오늘 수업 ${model.todayCount}건 · 시수 ${(model.todayMinutes / 60).toFixed(1)}시간` : '오늘 수업을 확인하고 있습니다.'}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[24px] font-bold">{clock}</p>
              <p className="mt-1 text-[11px] text-line-2">서울 · KST (UTC+9) 기준</p>
            </div>
          </header>

          {q.isLoading ? <div role="status"><Banner tone="neutral">수업을 불러오는 중…</Banner></div> : q.isError ? (
            <div role="alert"><Banner tone="danger">수업을 불러오지 못했습니다. <Button size="sm" onClick={() => void q.refetch()}>다시 시도</Button></Banner></div>
          ) : (
            <>
              {meta.isError ? <Banner tone="warning">과목·장소 이름을 일부 불러오지 못했습니다. 수업 상세에서 확인해 주세요.</Banner> : null}
              <section aria-label="오늘 전체 스케줄" className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
                <div className="flex items-center justify-between border-b border-line px-4 py-4">
                  <h2 className="text-[16px] font-bold text-fg">오늘 전체 스케줄</h2><span className="text-[11px] text-fg-subtle">시간 순</span>
                </div>
                {model.today.length ? <ul>{model.today.map((occ) => <ScheduleRow key={occurrenceKey(occ)} occ={occ} today={today} upcoming={false} lookup={lookup} onOpen={openSchedule} />)}</ul>
                  : <p className="p-6 text-[13px] text-fg-subtle">오늘 수업이 없습니다.</p>}
              </section>
              <section aria-label="다가오는 수업" className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-4">
                  <h2 className="text-[16px] font-bold text-fg">다가오는 수업</h2><span className="text-[11px] text-fg-subtle">앞으로 7일 · {model.upcoming.length}건</span>
                </div>
                {model.upcoming.length ? <ul>{model.upcoming.map((occ) => <ScheduleRow key={occurrenceKey(occ)} occ={occ} today={today} upcoming lookup={lookup} onOpen={openSchedule} />)}</ul>
                  : <p className="p-6 text-[13px] text-fg-subtle">앞으로 7일 동안 예정된 수업이 없습니다.</p>}
              </section>
              <p className="text-[11px] text-fg-subtle">취소·휴강과 출결 취소는 오늘 건수·시수에서 제외합니다.</p>
            </>
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-4" aria-label="오늘 할 일">
          <Panel title="오늘 할 일">
            <dl className="flex flex-col gap-4 text-[13px]">
              <div className="flex items-center justify-between gap-2"><dt><Link href="/reports" className="font-bold text-fg hover:text-blue">리포트 미작성 ›</Link></dt><dd className="font-bold text-red">{unwritten.isError ? '확인 필요' : unwritten.data?.total ?? '—'}</dd></div>
              <div className="flex items-center justify-between gap-2"><dt>관리자 승인 대기</dt><dd className="font-bold text-amber">{drawer.isError ? '확인 필요' : pending ?? '—'}</dd></div>
              <div className="flex items-center justify-between gap-2"><dt>스케줄 변경 요청 중</dt><dd className="font-bold text-blue">{drawer.isError ? '확인 필요' : changes ?? '—'}</dd></div>
            </dl>
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
