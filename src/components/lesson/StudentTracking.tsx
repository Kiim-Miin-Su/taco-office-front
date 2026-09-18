/** @file-guide
 * 목적: StudentTracking.tsx — StudentTracking (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §79 수강 학생 — 오른쪽 「학생 트래킹」 칸.
 *
 * 학생마다 카드 넉 장(진도 평균 · 교재 · 30일 출석 · 미수)과 **최신 리포트 3건**을 보입니다.
 * 값과 낱말은 전부 서버가 만든 것을 그립니다 — 「정시 / 지연」은 `lib/rules.tierFor` 한 곳이
 * 정하고(D-R32), 「N명 더 넣을 수 있습니다」도 서버가 셉니다(D-R37).
 *
 * 진도 평균은 서버가 `ISSUE.progress_page / LIB.pages`의 기존 교재 산식으로 계산합니다.
 * 화면은 알려진 교재가 0권인 `null`과 실제 0%를 구분해 그대로 표시합니다.
 *
 * 카드의 「휴원」·「복귀」(C92-c · C-36/C-37)는 `StudentPauseDialog` 하나를 쓰고, 「휴원 9/1 ~ 9/30」 칩의
 * 기간·복귀 여부는 서버가 준 `pause` 그대로입니다 — 단추가 서는지도 그 값이 정합니다 (D-R39).
 * 「수강 종료」(C94-c · H-80/N-136)는 `StudentWithdrawDialog` — 잔여 회차·환불액은 서버 미리보기이고, 종료 뒤 회차의 카드는
 * 「종료 M/D」 칩으로 남되 인원·단가에서는 빠집니다(서버 `ended`).
 */
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Banner, Button, Chip, Panel } from '../ui';
import { useLessonTracking, useStudentPause } from '@/api/queries';
import { apiMessage } from '@/api/client';
import { useCan } from '@/store/useSession';
import { won } from '@/lib/money';
import { StudentPauseDialog, StudentResumeDialog, pauseLabel } from './StudentPauseDialog';
import { StudentWithdrawDialog, endedLabel } from './StudentWithdrawDialog';
import type { TrackedReport, TrackedStudent } from '@/api/types';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-center ${tone === 'danger' ? 'border-red/30 bg-red/5' : 'border-line bg-bg-2'}`}>
      <div className={`text-[13px] font-bold ${tone === 'danger' ? 'text-red' : 'text-fg'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-fg-subtle">{label}</div>
    </div>
  );
}

function ReportRow({ r }: { r: TrackedReport }) {
  return (
    <li className="rounded-lg border border-line px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-fg">{r.onDate.slice(5)}</span>
        <span className="text-[11px] text-fg-2">{r.subjectName ?? '—'}</span>
        <span className="text-[11px] text-fg-subtle">{r.teacherName ?? '—'}</span>
        {/* 낱말도 판정도 서버가 준 것이다 — 화면이 제출 시각을 다시 견주지 않는다 (D-R32) */}
        <Chip className="ml-auto" tone={r.onTime ? 'neutral' : 'warning'}>{r.onTimeLabel}</Chip>
      </div>
      {r.excerpt ? <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-fg-2">{r.excerpt}</p> : null}
      {r.homework ? <p className="mt-1 text-[10.5px] text-fg-subtle">숙제 {r.homework}</p> : null}
    </li>
  );
}

function StudentCard({ s, canSeeAmounts, onDate, serId, canEdit, canMoney }: {
  s: TrackedStudent; canSeeAmounts: boolean; onDate: string; serId: number; canEdit: boolean; canMoney: boolean;
}) {
  const [dialog, setDialog] = useState<'pause' | 'resume' | 'withdraw' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const write = useStudentPause();
  const pause = s.pause ?? null;
  // 종료한 학생(또는 종료 예정)에게는 휴원·복귀·종료 단추가 서지 않는다 — 명단 기간이 끝났다 (C94-c)
  const ending = !!s.endedOn;
  // 「복귀」는 아직 복귀 처리하지 않은 기간에만 선다 — 판정은 서버의 resumed 다
  const canResume = canEdit && !ending && !!pause && !pause.resumed;
  const canPause = canEdit && !ending && (!pause || pause.resumed);
  // 「수강 종료」는 돈이 오가는 일이라 회계 권한(대표)이다 — 환불액은 서버가 센다 (H-80)
  const canWithdraw = canMoney && !ending;
  const close = () => { setDialog(null); setErr(null); };
  return (
    <Panel
      title={(
        <span className="flex items-center gap-2">
          <span className="font-bold">{s.name}</span>
          {s.grade ? <Chip>{s.grade}</Chip> : null}
          {s.droppedOnce ? <Chip tone="neutral">그날 빠짐</Chip> : null}
          {s.paused ? <Chip tone="warning">휴원</Chip> : null}
          {s.endedOn ? <Chip tone={s.ended ? 'neutral' : 'warning'}>{endedLabel(s.endedOn, s.ended)}</Chip> : null}
          {pause ? (
            <Chip tone={pause.resumed ? 'neutral' : 'info'} title={pause.reason ?? undefined}>
              {pauseLabel(pause)}{pause.resumed ? ' · 복귀 처리됨' : ''}
            </Chip>
          ) : null}
        </span>
      )}
      right={(
        <span className="flex gap-1">
          {canPause ? (
            <Button size="sm" variant="ghost" disabled={write.isPending} onClick={() => setDialog('pause')}>휴원</Button>
          ) : null}
          {canResume ? (
            <Button size="sm" variant="ghost" disabled={write.isPending} onClick={() => setDialog('resume')}>복귀</Button>
          ) : null}
          {canWithdraw ? (
            <Button size="sm" variant="ghost" onClick={() => setDialog('withdraw')}>수강 종료</Button>
          ) : null}
          <Link href={`/schedule?studentId=${s.id}`}><Button size="sm" variant="ghost">시간표</Button></Link>
          <Link href={`/board?studentId=${s.id}`}><Button size="sm" variant="ghost">학생 보드</Button></Link>
        </span>
      )}
    >
      <StudentPauseDialog
        open={dialog === 'pause'}
        title={`휴원 — ${s.name}`}
        defaultFrom={onDate}
        pending={write.isPending}
        error={err}
        onClose={close}
        onSubmit={(body) => write.mutate({ kind: 'pause', studentId: s.id, body }, { onSuccess: close, onError: (e) => setErr(apiMessage(e)) })}
      />
      <StudentWithdrawDialog
        open={dialog === 'withdraw'}
        title={`수강 종료 — ${s.name}`}
        student={{ id: s.id, name: s.name }}
        serId={serId}
        defaultEndedOn={onDate}
        onClose={close}
      />
      <StudentResumeDialog
        open={dialog === 'resume'}
        title={`복귀 — ${s.name}`}
        pause={pause}
        pending={write.isPending}
        error={err}
        onClose={close}
        onSubmit={(body) => {
          if (!pause) return;
          write.mutate({ kind: 'resume', studentId: s.id, pauseId: pause.id, body }, { onSuccess: close, onError: (e) => setErr(apiMessage(e)) });
        }}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="진도 평균" value={s.progressAverage === null ? '—' : `${s.progressAverage}%`} />
        <Stat label="교재" value={String(s.bookCount)} />
        <Stat label="30일 출석" value={s.attendTotal > 0 ? `${s.attendDone}/${s.attendTotal}` : '—'} />
        <Stat
          label="미수"
          value={!canSeeAmounts ? '가려짐' : s.unpaid && s.unpaid > 0 ? won(s.unpaid) : '—'}
          tone={canSeeAmounts && s.unpaid && s.unpaid > 0 ? 'danger' : undefined}
        />
      </div>

      <h4 className="mb-1.5 mt-3 text-[11px] font-bold text-fg-2">최신 리포트 {s.reports.length}건</h4>
      {s.reports.length === 0 ? (
        <p className="text-[11.5px] text-fg-subtle">쓴 리포트가 없습니다</p>
      ) : (
        <ul className="flex flex-col gap-1.5">{s.reports.map((r) => <ReportRow key={r.repId} r={r} />)}</ul>
      )}
    </Panel>
  );
}

export function StudentTracking({ serId, onDate }: { serId: number; onDate: string }) {
  const q = useLessonTracking(serId, onDate, true);
  const d = q.data;
  const canEdit = useCan('canCrudAll');
  const canMoney = useCan('canMoney');

  return (
    <section aria-label="학생 트래킹">
      <h3 className="mb-2 text-[12px] font-bold text-fg">
        학생 트래킹 <span className="ml-1 font-normal text-fg-subtle">최신 리포트 · 교재 · 출결</span>
      </h3>

      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner> : null}
      {q.isError ? <Banner tone="danger">학생 트래킹은 매니저 이상만 볼 수 있습니다.</Banner> : null}

      {d ? (
        <>
          {/* 원문 머리줄 — 숫자와 문장은 서버가 만든다 (D-R37) */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-bold text-fg">{d.count}명</span>
            <Chip tone={d.canAdd > 0 ? 'info' : 'warning'}>{d.capLabel}</Chip>
            {d.priced ? (
              <Chip>
                1인 {d.canSeeAmounts && d.unitPrice != null ? won(d.unitPrice) : '가려짐'}
                {' · 수업당 '}
                {d.canSeeAmounts && d.total != null ? won(d.total) : '가려짐'}
              </Chip>
            ) : (
              <Chip tone="warning">단가표 미등록 — 가격은 표시하지 않습니다</Chip>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {d.students.map((s) => (
              <StudentCard key={s.id} s={s} canSeeAmounts={d.canSeeAmounts} onDate={onDate} serId={serId} canEdit={canEdit} canMoney={canMoney} />
            ))}
            {d.students.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">명단이 없습니다</p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
