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
 */
'use client';
import Link from 'next/link';
import { Banner, Button, Chip, Panel } from '../ui';
import { useLessonTracking } from '@/api/queries';
import { won } from '@/lib/money';
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

function StudentCard({ s, canSeeAmounts }: { s: TrackedStudent; canSeeAmounts: boolean }) {
  return (
    <Panel
      title={(
        <span className="flex items-center gap-2">
          <span className="font-bold">{s.name}</span>
          {s.grade ? <Chip>{s.grade}</Chip> : null}
          {s.droppedOnce ? <Chip tone="neutral">그날 빠짐</Chip> : null}
        </span>
      )}
      right={(
        <span className="flex gap-1">
          <Link href={`/schedule?studentId=${s.id}`}><Button size="sm" variant="ghost">시간표</Button></Link>
          <Link href={`/board?studentId=${s.id}`}><Button size="sm" variant="ghost">학생 보드</Button></Link>
        </span>
      )}
    >
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
            {d.students.map((s) => <StudentCard key={s.id} s={s} canSeeAmounts={d.canSeeAmounts} />)}
            {d.students.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">명단이 없습니다</p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
