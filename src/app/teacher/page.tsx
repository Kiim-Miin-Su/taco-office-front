/** @file-guide
 * 목적: page.tsx — TeacherHomePage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 홈 — 강사 덱 §7~9 · Figma 「웹 · 홈」.
 * 오늘/다가오는 수업 · 주간 요약 · 오늘 할 일 · 내 설정. 전부 GET /teacher/home 한 번.
 * 판정(미작성·할 일 수·시급)은 서버가 한다 — 화면은 숫자와 상태만 그린다 (D-R39 · SKILLS §3).
 */
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { apiMessage } from '@/api/client';
import { Banner, Button, Chip, Input, Label, PageHeader, Panel, QueryState, Select, type Tone } from '@/components/ui';
import { useCreateSettingRequest, useTeacherHome } from '@/api/queries';
import type { TeacherLesson, TeacherSettings } from '@/api/types';
import { REP, hm, hours, md } from '@/components/teacher/format';

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
          {s.wageRate === null || s.wageRate === undefined ? '—' : `${s.wageRate.toLocaleString('ko-KR')}원/시간`}
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

function LessonRow({ l, withDate }: { l: TeacherLesson; withDate?: boolean }) {
  const rep = l.canceled ? { label: '수업 취소', tone: 'neutral' as Tone } : REP[l.repState];
  const place = l.mode === 'online' ? `Zoom${l.zaccLabel ? ` · ${l.zaccLabel}` : ''}` : (l.roomName ?? '강의실 미정');
  return (
    <li className="flex items-center gap-4 border-b border-line px-1 py-3 last:border-b-0">
      <div className="w-28 shrink-0 text-[13px] font-bold text-fg">
        {withDate ? <div className="text-[12px] text-fg-subtle">{md(l.onDate)}</div> : null}
        {hm(l.startMin)}–{hm(l.startMin + l.durMin)}
      </div>
      <div className="min-w-0 grow">
        <div className="truncate text-[14px] font-bold text-fg">{l.title ?? l.subKey ?? l.kindKey}</div>
        <div className="truncate text-[12px] text-fg-subtle">
          {l.students ? `${l.students} 학생` : '학생 미배정'} · {l.mode === 'online' ? '비대면' : '대면'} · {place}
        </div>
      </div>
      {rep ? <Chip tone={rep.tone}>{rep.label}</Chip> : null}
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

export default function TeacherHomePage() {
  const q = useTeacherHome();
  return (
    <RequireAuth>
      <AppShell>
        <QueryState query={q} isEmpty={() => false}>
          {(d) => {
            const todayMin = d.today.filter((l) => !l.canceled).reduce((a, l) => a + l.durMin, 0);
            return (
              <>
                <PageHeader
                  title="홈"
                  sub={`${d.todayDate} · 오늘 수업 ${d.today.filter((l) => !l.canceled).length}건 · 시수 ${hours(todayMin)}시간`}
                />
                <div className="mt-3 flex flex-col gap-4 lg:flex-row">
                  <div className="min-w-0 grow">
                    <div className="rounded-xl bg-fg p-5 text-card">
                      <div className="flex items-end gap-4">
                        <div className="text-[40px] font-bold leading-none">{Number(d.todayDate.slice(8, 10))}</div>
                        <div>
                          <div className="text-[15px] font-bold">{d.todayDate.replace(/-0?(\d+)-0?(\d+)$/, '년 $1월 $2일')}</div>
                          <div className="mt-0.5 text-[12px] opacity-80">
                            이번 주 {d.week.lessons}건 · {hours(d.week.minutes)}시간 · 미작성 {d.week.unwritten}
                          </div>
                        </div>
                      </div>
                    </div>

                    <Panel className="mt-4" title="오늘 전체 스케줄 · 시간 순">
                      {d.today.length === 0
                        ? <p className="px-1 py-6 text-center text-[13px] text-fg-subtle">오늘 수업이 없습니다.</p>
                        : <ul>{d.today.map((l) => <LessonRow key={`${l.serId}-${l.onDate}`} l={l} />)}</ul>}
                    </Panel>

                    <Panel className="mt-4" title={`다가오는 수업 · 앞으로 7일 · ${d.upcoming.filter((l) => !l.canceled).length}건`}>
                      {d.upcoming.length === 0
                        ? <p className="px-1 py-6 text-center text-[13px] text-fg-subtle">예정된 수업이 없습니다.</p>
                        : <ul>{d.upcoming.map((l) => <LessonRow key={`${l.serId}-${l.onDate}`} l={l} withDate />)}</ul>}
                    </Panel>
                  </div>

                  <aside className="w-full shrink-0 lg:w-[344px]">
                    <MySettings s={d.settings} />

                    <Panel className="mt-4" title="오늘 할 일">
                      <ul className="flex flex-col gap-2">
                        <Todo n={d.todo.unwrittenReports} label="리포트 미작성" href="/reports" tone="danger" />
                        <Todo n={d.todo.waitingApprovals} label="관리자 승인 대기" href="/reports" tone="info" />
                        <Todo n={d.todo.openChangeRequests} label="스케줄 변경 요청 중" tone="info" />
                        <Todo n={d.todo.openStaffRequests} label="요청 진행 중" tone="info" />
                      </ul>
                    </Panel>

                    <Panel className="mt-4" title="바로가기">
                      <ul className="flex flex-col gap-2 text-[13px] font-bold text-fg">
                        <li><Link className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5" href="/schedule">캘린더 <span aria-hidden>›</span></Link></li>
                        <li><Link className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5" href="/reports">리포트 <span aria-hidden>›</span></Link></li>
                        <li><Link className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5" href="/teacher/guides">수업 안내 <span aria-hidden>›</span></Link></li>
                        <li><Link className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5" href="/teacher/unavailable">불가 시간 <span aria-hidden>›</span></Link></li>
                        <li><Link className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5" href="/teacher/history">수업 히스토리 <span aria-hidden>›</span></Link></li>
                        <li><Link className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5" href="/teacher/suggestions">건의 사항 <span aria-hidden>›</span></Link></li>
                      </ul>
                    </Panel>
                  </aside>
                </div>
              </>
            );
          }}
        </QueryState>
      </AppShell>
    </RequireAuth>
  );
}
