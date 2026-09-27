/** @file-guide
 * 목적: ReportWeekly.tsx — ReportWeekly (component) · §47 「주간 트래킹」 본문(N-54 주간 묶음 · W11)
 * 책임/재사용: 서버가 모은 학생별 묶음(GET /reports/weekly)을 그대로 그린다. 총평 쓰기는 PUT /reports/weekly, 보내기는 공용
 *   GuardianSendDialog(wrepId)만 쓴다. 보내기 가능 여부 · 막힌 이유 · 보낼 본문은 서버 값이다(D-R37 · D-R39) — 화면이 짓지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useEffect, useId, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useReportWeekly, useReportWeeklySummary } from '@/api/queries';
import type { WeeklyBundle, WeeklyLesson } from '@/api/types';
import { addDays, todayKst } from '@/lib/calendar';
import { reportTimeLabel } from '@/lib/report-export';
import { GuardianSendDialog } from '../guardians/GuardianSendDialog';
import { Banner, Button, Chip, CountedTextarea, Label } from '../ui';

/**
 * 원문 §47 은 탭 머리 「주간 트래킹 · N명 남음」까지만 보여 준다 — 본문은 N-54 채택(그 주 쓴 리포트를 읽을 때 모으고
 * 매니저가 총평만 쓴다)을 §49 「어제 보내기」 카드와 같은 모양으로 세웠다. 새 판정은 없다: 줄 · 수 · 문장은 전부 서버다.
 */
export function ReportWeekly({ onOpenReport }: {
  /** 수업 줄 — 그 리포트의 검토 서랍을 연다(§49 와 같은 상세) */
  onOpenReport?: (lesson: WeeklyLesson, studentId: number) => void;
}) {
  const [weekOf, setWeekOf] = useState<string | undefined>(undefined);
  const query = useReportWeekly(weekOf);
  const [sending, setSending] = useState<WeeklyBundle | null>(null);
  const data = query.data;

  return (
    <section aria-label="주간 트래킹">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold text-fg">{data ? `${data.label} 주간 묶음` : '주간 묶음'}</h2>
          <p className="mt-1 text-[12px] text-fg-subtle">그 주에 쓴 리포트를 학생별로 모아 총평과 함께 보호자에게 보냅니다</p>
        </div>
        <div className="flex items-center gap-2">
          {data ? <span className="text-[12px] font-bold text-fg-subtle">{`학생 ${data.total}명 · ${data.remaining}명 남음`}</span> : null}
          <div className="flex items-center rounded-lg border border-line bg-card">
            <Button className="rounded-r-none border-y-0 border-l-0" aria-label="이전 주" disabled={!data}
              onClick={() => data && setWeekOf(addDays(data.weekOf, -7))}>‹</Button>
            <Button className="rounded-none border-y-0" aria-label="다음 주" disabled={!data}
              onClick={() => data && setWeekOf(addDays(data.weekOf, 7))}>›</Button>
            <Button className="rounded-l-none border-y-0 border-r-0" onClick={() => setWeekOf(todayKst())}>이번 주</Button>
          </div>
        </div>
      </div>

      {query.isLoading ? <Banner tone="neutral">주간 묶음을 불러오는 중…</Banner> : null}
      {query.isError ? <Banner tone="danger">{apiMessage(query.error)}</Banner> : null}
      {data && data.bundles.length === 0 ? <Banner tone="neutral">이 주에 쓴 리포트가 있는 학생이 없습니다.</Banner> : null}

      {data ? (
        <div data-testid="weekly-cards" className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {data.bundles.map((bundle) => (
            <BundleCard key={bundle.studentId} bundle={bundle} weekOf={data.weekOf}
              onOpenReport={onOpenReport} onSend={() => setSending(bundle)} />
          ))}
        </div>
      ) : null}

      {sending && sending.wrepId !== null && sending.plainText ? (
        <GuardianSendDialog
          open
          student={{ id: sending.studentId, name: sending.studentName }}
          wrepId={sending.wrepId}
          defaultBody={sending.plainText}
          defaultSubject={sending.subject}
          title={`주간 묶음 보내기 — ${sending.studentName}`}
          onClose={() => setSending(null)}
        />
      ) : null}
    </section>
  );
}

function BundleCard({ bundle, weekOf, onOpenReport, onSend }: {
  bundle: WeeklyBundle;
  weekOf: string;
  onOpenReport?: (lesson: WeeklyLesson, studentId: number) => void;
  onSend: () => void;
}) {
  const id = useId();
  const save = useReportWeeklySummary();
  const saved = bundle.summary?.text ?? '';
  const [draft, setDraft] = useState(saved);
  // 서버 값이 바뀌면(저장 · 다른 사람의 저장) 입력을 그 값으로 맞춘다
  useEffect(() => { setDraft(saved); }, [saved]);
  const dirty = draft.trim() !== saved;
  const canSave = bundle.canWriteSummary && dirty && draft.trim() !== '' && !save.isPending;
  const sent = bundle.sentAt !== null;

  return (
    <article className="rounded-xl border border-line bg-card p-4" aria-label={`${bundle.studentName} 주간 묶음`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="text-[14px] text-fg">{bundle.studentName}</b>
        {bundle.grade ? <Chip size="compact">{bundle.grade}</Chip> : null}
        <Chip tone={bundle.approvedCount === bundle.lessonCount ? 'success' : 'warning'}>
          {`승인 ${bundle.approvedCount} / ${bundle.lessonCount}`}
        </Chip>
        <Chip className="ml-auto" tone={sent ? 'success' : 'neutral'}>{sent ? `보냄 · ${bundle.sentAt!.slice(5, 16).replace('T', ' ')}` : '안 보냄'}</Chip>
      </div>

      <ul className="mt-2 flex flex-col gap-1.5">
        {bundle.lessons.map((lesson) => (
          <li key={lesson.repId}>
            <button type="button" data-weekly-lesson
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-inset px-3 py-2 text-left text-[12px] hover:border-blue disabled:cursor-default"
              disabled={!onOpenReport}
              onClick={() => onOpenReport?.(lesson, bundle.studentId)}>
              <span>
                <b>{lesson.date.slice(5)}</b> · {reportTimeLabel(lesson)} · {lesson.subjectName}
                {lesson.teacherName ? <span className="text-fg-subtle"> · {lesson.teacherName} 강사</span> : null}
              </span>
              <Chip size="compact" tone={lesson.approved ? 'success' : lesson.written ? 'warning' : 'danger'}>{lesson.stateLabel}</Chip>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <Label htmlFor={`${id}-summary`} hint="학부모에게 리포트와 함께 그대로 나갑니다">총평</Label>
        {bundle.canWriteSummary ? (
          <CountedTextarea id={`${id}-summary`} value={draft} max={2000} onChange={setDraft} />
        ) : (
          <p id={`${id}-summary`} className="whitespace-pre-wrap rounded-lg border border-line bg-inset p-2.5 text-[12px] text-fg">
            {saved || '—'}
          </p>
        )}
        {bundle.summary ? (
          <p className="mt-1 text-[11px] text-fg-subtle">{`${bundle.summary.byName ?? '—'} · ${bundle.summary.at.slice(5, 16).replace('T', ' ')}`}</p>
        ) : null}
        {!bundle.canWriteSummary && bundle.summaryBlockedReason ? (
          <p className="mt-1 text-[11px] text-fg-subtle">{bundle.summaryBlockedReason}</p>
        ) : null}
        {save.isError ? <Banner tone="danger" className="mt-2"><p role="alert">{apiMessage(save.error)}</p></Banner> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {bundle.canWriteSummary ? (
          <Button disabled={!canSave}
            onClick={() => save.mutate({ studentId: bundle.studentId, weekOf, summary: draft })}>
            {save.isPending ? '저장 중…' : '총평 저장'}
          </Button>
        ) : null}
        <Button variant="primary" disabled={!bundle.canSend || dirty} title={dirty ? '총평을 먼저 저장해 주세요' : bundle.sendBlockedReason ?? undefined}
          onClick={onSend}>
          보호자에게 보내기
        </Button>
      </div>
      {!bundle.canSend && bundle.sendBlockedReason ? (
        <p className="mt-1 text-right text-[11px] text-fg-subtle">{bundle.sendBlockedReason}</p>
      ) : null}
      {bundle.plainText ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] font-bold text-primary">보낼 본문 보기</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-inset p-3 text-[11.5px] text-fg">
            {bundle.plainText}
          </pre>
        </details>
      ) : null}
    </article>
  );
}
