/** @file-guide
 * 목적: page.tsx — TeacherHomePage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 홈 — 강사 덱 §7~9 · Figma 「웹 · 홈」.
 * 오늘/다가오는 수업 · 주간 요약 · 오늘 할 일 · 내 설정. 전부 GET /teacher/home 한 번.
 * 판정(미작성·할 일 수·시급)은 서버가 한다 — 화면은 숫자와 상태만 그린다 (D-R39 · SKILLS §3).
 *
 * `?meeting=N` — 회의 안내 · 회의 할 일 알림의 링크가 여는 회의 상세 창 (W11 A' 후속 · N-32).
 * 강사는 운영 화면을 못 여므로 서버가 링크를 이 자리로 보낸다(lib/meeting-link). 창은 운영 화면과 **같은**
 * `MeetingDetail`(`GET /ops/meetings/:id` — 참석자 본인에게 열려 있다)이고, 쓰기 단추는 서버 플래그가 정한다.
 */
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { apiMessage } from '@/api/client';
import { Banner, Button, Chip, Input, Label, Panel, QueryState, Select, type Tone } from '@/components/ui';
import { useCreateSettingRequest, useTeacherHome } from '@/api/queries';
import type { TeacherLesson, TeacherSettings } from '@/api/types';
import { REP, hm, hours, md } from '@/components/teacher/format';
import { LateReportPolicy } from '@/components/teacher/LateReportPolicy';
import { useLessonName } from '@/components/teacher/lesson-name';
import { TeacherTodayHero } from '@/components/teacher/TeacherTodayHero';
import { MeetingDetail } from '@/components/ops/MeetingDetail';
import { positiveQueryId } from '@/lib/url-state';
import { won } from '@/lib/money';

const REQ_STATE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: '승인 대기', tone: 'info' },
  approved: { label: '승인', tone: 'success' },
  rejected: { label: '반려', tone: 'danger' },
};

/**
 * §8 우측 레일 「내 설정」 — 시간대 / 기본 시급, **각각 변경 요청 버튼**.
 * 원문 그대로 「관리자 승인 후 적용」이고 시급은 **한 달에 한 번**이다 — 두 판정 다 서버가 한다.
 */
function MySettings({ s }: { s: TeacherSettings }) {
  const ask = useCreateSettingRequest();
  const [open, setOpen] = useState<'wage' | 'tz' | null>(null);
  const [rate, setRate] = useState('');
  const [tz, setTz] = useState('');
  const [reason, setReason] = useState('');

  const close = () => { setOpen(null); setRate(''); setTz(''); setReason(''); ask.reset(); };
  const submit = () => {
    if (open === 'wage') {
      const n = Number(rate);
      if (!Number.isInteger(n) || n <= 0) return;
      ask.mutate({ reqType: 'wage_change', rate: n, ...(reason.trim() ? { reason: reason.trim() } : {}) }, { onSuccess: close });
    } else if (open === 'tz' && tz) {
      ask.mutate({ reqType: 'tz_change', timezone: tz, ...(reason.trim() ? { reason: reason.trim() } : {}) }, { onSuccess: close });
    }
  };

  return (
    <Panel title="내 설정" sub="관리자 승인 후 적용 · 시급은 한 달에 한 번 신청할 수 있습니다">
      <dl className="text-[13px]">
        <dt className="text-fg-subtle">시간대</dt>
        <dd className="mb-2 flex items-center justify-between font-bold text-fg">
          {s.timezone === 'Asia/Seoul' ? 'Seoul UTC+9' : s.timezone}
          <Button
            size="sm"
            disabled={!s.canAskTz || ask.isPending}
            title={s.canAskTz ? undefined : '올린 요청이 처리 중입니다'}
            onClick={() => { setOpen(open === 'tz' ? null : 'tz'); setTz(''); }}
          >
            변경 요청
          </Button>
        </dd>
        <dt className="text-fg-subtle">기본 시급 · 나만 볼 수 있습니다</dt>
        <dd className="flex items-center justify-between font-bold text-fg">
          {s.wageRate === null || s.wageRate === undefined ? '—' : `${won(s.wageRate)}/시간`}
          <Button
            size="sm"
            disabled={!s.canAskWage || ask.isPending}
            title={s.canAskWage ? undefined : `${s.wageAskableOn}부터 다시 신청할 수 있습니다`}
            onClick={() => { setOpen(open === 'wage' ? null : 'wage'); setRate(''); }}
          >
            변경 신청
          </Button>
        </dd>
        {s.wageFrom ? <dd className="mt-1 text-[11px] text-fg-subtle">{s.wageFrom} 적용</dd> : null}
        {!s.canAskWage && s.wageAskableOn ? (
          <dd className="mt-1 text-[11px] text-fg-subtle">시급은 한 달에 한 번 — {s.wageAskableOn}부터 다시 됩니다</dd>
        ) : null}
      </dl>

      {open ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line bg-inset p-3">
          {open === 'wage' ? (
            <span>
              <Label htmlFor="ask-rate" hint="원/시간">바라는 시급</Label>
              <Input id="ask-rate" type="number" min={1} inputMode="numeric" value={rate}
                placeholder={s.wageRate === null || s.wageRate === undefined ? '' : String(s.wageRate)}
                onChange={(e) => setRate(e.target.value)} />
            </span>
          ) : (
            <span>
              <Label htmlFor="ask-tz">바라는 시간대</Label>
              <Select id="ask-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
                <option value="">선택</option>
                {s.timezones.filter((t) => t.tz !== s.timezone).map((t) => (
                  <option key={t.tz} value={t.tz}>{t.name} · {t.tz}</option>
                ))}
              </Select>
            </span>
          )}
          <span>
            <Label htmlFor="ask-reason" hint="선택">사유</Label>
            <Input id="ask-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="한 줄로 적어 주세요" />
          </span>
          <span className="flex gap-2">
            <Button variant="primary" disabled={ask.isPending || (open === 'wage' ? rate === '' : tz === '')} onClick={submit}>
              {ask.isPending ? '올리는 중…' : '요청 올리기'}
            </Button>
            <Button onClick={close}>취소</Button>
          </span>
          {ask.isError ? <Banner tone="danger">{apiMessage(ask.error)}</Banner> : null}
        </div>
      ) : null}

      {s.requests.length > 0 ? (
        <ol className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
          {s.requests.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-[12px]">
              <Chip size="compact" tone={REQ_STATE[r.state]?.tone ?? 'neutral'}>{REQ_STATE[r.state]?.label ?? r.state}</Chip>
              <span className="min-w-0 grow truncate text-fg">{r.label} {r.asked ? `→ ${r.asked}` : ''}</span>
              <span className="shrink-0 text-fg-subtle">{r.createdOn.slice(5)}</span>
            </li>
          ))}
          {s.requests.some((r) => r.state === 'rejected' && r.rejectReason) ? (
            <li className="text-[11px] text-red">
              반려 사유 — {s.requests.find((r) => r.state === 'rejected' && r.rejectReason)?.rejectReason}
            </li>
          ) : null}
        </ol>
      ) : null}
    </Panel>
  );
}

/** 리포트를 열 수 있는 수업인가 — 서버 상태 낱말만 본다(끝나지 않은 예정·대상 아님·휴강은 쓸 리포트가 없다) */
const REPORT_OPENABLE = new Set(['none', 'draft', 'wait', 'ok', 'rej']);

/** 기준일로부터 며칠 뒤인가 — 둘 다 서버 날짜('YYYY-MM-DD')의 차, 표기만 */
const daysAfter = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

function LessonRow({ l, today }: { l: TeacherLesson; today?: string }) {
  const lessonName = useLessonName();
  // 휴강 사유는 서버 낱말이다 — 옛 휴강(사유 없음)은 「수업 취소」 그대로 (C92 · C-31 · N-25)
  const rep = l.canceled
    ? { label: l.cancelKindLabel ? `휴강 · ${l.cancelKindLabel}` : '수업 취소', tone: 'neutral' as Tone }
    : REP[l.repState];
  const place = l.mode === 'online' ? `Zoom${l.zaccLabel ? ` · ${l.zaccLabel}` : ''}` : (l.roomName ?? '강의실 미정');
  const body = (
    <>
      <div className="w-28 shrink-0 text-[13px] font-bold text-fg">
        {/* 다가오는 수업 — 덱 slide 8 「8/27 목 · 2일 뒤」 */}
        {today ? (
          <div className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
            {md(l.onDate)}<Chip size="compact" tone="info">{daysAfter(today, l.onDate)}일 뒤</Chip>
          </div>
        ) : null}
        {hm(l.startMin)}–{hm(l.startMin + l.durMin)}
      </div>
      <div className="min-w-0 grow">
        <div className="truncate text-[14px] font-bold text-fg">{lessonName(l)}</div>
        <div className="truncate text-[12px] text-fg-subtle">
          {l.students ? `${l.students} 학생` : '학생 미배정'} · {l.mode === 'online' ? '비대면' : '대면'} · {place}
        </div>
      </div>
      {rep ? <Chip tone={rep.tone}>{rep.label}</Chip> : null}
    </>
  );
  // 덱 slide 9 「클릭 — 해당 수업의 리포트 작성 화면으로 이동」 — 쓸 리포트가 있는 수업만 잇는다(리포트 화면이 serId·onDate 로 연다)
  const openable = !l.canceled && REPORT_OPENABLE.has(l.repState);
  return (
    <li className="border-b border-line last:border-b-0">
      {openable ? (
        <Link href={`/reports?serId=${l.serId}&onDate=${l.onDate}`}
          className="flex items-center gap-4 rounded-md px-1 py-3 hover:bg-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">
          {body}
        </Link>
      ) : <div className="flex items-center gap-4 px-1 py-3">{body}</div>}
    </li>
  );
}

function Todo({ n, label, href, tone }: { n: number; label: string; href?: string; tone: Tone }) {
  const body = (
    <span className="flex w-full items-center gap-2 rounded-lg bg-inset px-3 py-2.5 text-[13px]">
      <b className={n > 0 ? (tone === 'danger' ? 'text-red' : 'text-blue') : 'text-fg-subtle'}>{n}</b>
      <span className={n > 0 ? 'font-bold text-fg' : 'text-fg-subtle'}>{label}</span>
      {href ? <span aria-hidden className="ml-auto text-fg-subtle">›</span> : null}
    </span>
  );
  return <li>{href ? <Link href={href}>{body}</Link> : body}</li>;
}

/** 바로가기 — 덱 slide 8 차례 그대로 */
const QUICK_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['/schedule', '캘린더'], ['/reports', '리포트'], ['/teacher/guides', '수업 안내'],
  ['/teacher/history', '수업 히스토리'], ['/teacher/suggestions', '건의 사항'],
];

export default function TeacherHomePage() {
  const q = useTeacherHome();
  const router = useRouter();
  // 알림 링크가 연 회의 — 질의가 곧 상태다(창을 닫으면 질의를 걷는다). 모양이 아닌 값은 열지 않는다
  const meetingId = positiveQueryId(useSearchParams().get('meeting'));
  return (
    <RequireAuth>
      <AppShell>
        {meetingId !== null ? <MeetingDetail meetingId={meetingId} onClose={() => router.replace('/teacher')} /> : null}
        {/* 강사 정책은 화면 최상단 (대표 결정 2026-09-25) — 강사로 로그인했을 때만 선다 */}
        <LateReportPolicy className="mb-3" />
        <QueryState query={q} isEmpty={() => false}>
          {(d) => (
            <>
              {/* 화면 이름은 머리줄(Teacher/Header)이 말한다 — 본문은 덱 slide 8 처럼 hero 로 시작한다 */}
              <div className="flex flex-col gap-4 lg:flex-row">
                  <div className="min-w-0 grow">
                    <TeacherTodayHero date={d.todayDate} lessons={d.todaySummary.lessons} minutes={d.todaySummary.minutes} />

                    <Panel className="mt-4" title="오늘 전체 스케줄" right={<span className="text-[11px] text-fg-subtle">시간 순</span>}>
                      {d.today.length === 0
                        ? <p className="px-1 py-6 text-center text-[13px] text-fg-subtle">오늘 수업이 없습니다.</p>
                        : <ul>{d.today.map((l) => <LessonRow key={`${l.serId}-${l.onDate}`} l={l} />)}</ul>}
                    </Panel>

                    <Panel
                      className="mt-4"
                      title={<>다가오는 수업 <span className="ml-1 text-[11px] font-medium text-fg-subtle">앞으로 7일 · {d.upcoming.filter((l) => !l.canceled).length}건</span></>}
                      right={(
                        // 덱 slide 9 주간 요약 칩 「이번 주 9건 · 17.5시간 · 미작성 1」 — 셋 다 서버 week 값
                        <span data-week-chip="" className="rounded-md border border-line bg-inset px-2 py-1 text-[11px] font-bold text-fg-2">
                          <span>이번 주 {d.week.lessons}건 · {hours(d.week.minutes)}시간 ·</span>{' '}
                          <span className={d.week.unwritten > 0 ? 'text-red' : undefined}>미작성 {d.week.unwritten}</span>
                        </span>
                      )}
                    >
                      {d.upcoming.length === 0
                        ? <p className="px-1 py-6 text-center text-[13px] text-fg-subtle">예정된 수업이 없습니다.</p>
                        : <ul>{d.upcoming.map((l) => <LessonRow key={`${l.serId}-${l.onDate}`} l={l} today={d.todayDate} />)}</ul>}
                    </Panel>
                  </div>

                  <aside className="w-full shrink-0 lg:w-[344px]">
                    {/* 메뉴 사용자 칸 「마이 페이지 ›」가 오는 자리 — 강사 화면 7개 중 내 설정이 있는 곳은 여기뿐이다 */}
                    <div id="my-settings" className="scroll-mt-4"><MySettings s={d.settings} /></div>

                    <Panel className="mt-4" title="오늘 할 일">
                      <ul className="flex flex-col gap-2">
                        <Todo n={d.todo.unwrittenReports} label="리포트 미작성" href="/reports" tone="danger" />
                        <Todo n={d.todo.waitingApprovals} label="관리자 승인 대기" href="/reports" tone="info" />
                        <Todo n={d.todo.openChangeRequests} label="스케줄 변경 요청 중" tone="info" />
                        {/* 덱 slide 8 넷째 줄 — 수업 안내 교재 행에서 올린 교재 변경 요청 중 열린 것(서버가 센다 · N-99). 시급 · 시간대 요청은 「내 설정」에 있다 */}
                        <Todo n={d.todo.openBookChanges} label="교재 변경 요청 중" href="/teacher/guides" tone="info" />
                      </ul>
                    </Panel>

                    {/* 덱 slide 8 우측 아래 다섯 칸 — 불가 시간은 덱의 바로가기에 없다(메뉴에는 있다) */}
                    <nav aria-label="바로가기" className="mt-4">
                      <ul className="flex flex-col gap-2 text-[13px] font-bold text-fg">
                        {QUICK_LINKS.map(([href, label]) => (
                          <li key={href}>
                            <Link className="flex items-center justify-between rounded-lg border border-line bg-card px-3 py-2.5" href={href}>
                              {label} <span aria-hidden>›</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  </aside>
              </div>
            </>
          )}
        </QueryState>
      </AppShell>
    </RequireAuth>
  );
}
