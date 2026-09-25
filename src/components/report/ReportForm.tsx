/** @file-guide
 * 목적: ReportForm.tsx — ReportForm, ReportEditor, ReportPreviewProps, ReportPreview (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Report/Section · Form/Report Dev · UI/Counted Textarea — 리포트 5개 섹션 고정 (D-R15 · D-R40).
 *
 * 1·2는 회차/학생 메타데이터, 3·4·5는 강사 입력이다. 입력 키·순서·길이는
 * 백엔드 rules.ts → ReportDetailDto.fields를 그대로 읽어 그린다.
 */
'use client';
import { Fragment, forwardRef, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useReportReview, useReportWrite } from '@/api/queries';
import type { ReportBody, ReportDetail, ReportField } from '@/api/types';
import { longDateLabel } from '@/lib/calendar';
import { reportTimeLabel, type ReportExportContent } from '@/lib/report-export';
import { Banner, Button, CountedTextarea, Label, Panel, Textarea } from '../ui';
import { LateReportPolicy } from '../teacher/LateReportPolicy';

export function ReportForm({ fields, value, onChange, readOnly }: {
  fields: ReportField[];
  value: ReportBody;
  onChange: (value: ReportBody) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <div key={field.key}>
          <Label htmlFor={`rep-${field.key}`} hint={field.min ? `${field.min}자 이상` : undefined}>
            {field.label} <span className="font-normal text-fg-subtle">— {field.hint}</span>
          </Label>
          {readOnly ? (
            <p className="whitespace-pre-wrap rounded-lg border border-line bg-inset p-3 text-[12.5px] leading-relaxed text-fg">
              {value[field.key] || '—'}
            </p>
          ) : (
            <CountedTextarea
              id={`rep-${field.key}`}
              value={value[field.key]}
              min={field.min}
              max={field.max}
              onChange={(next) => onChange({ ...value, [field.key]: next })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** 리포트 목록과 강사 캘린더가 같은 저장 흐름을 재사용한다. */
export function ReportEditor({ detail, subject }: { detail: ReportDetail; subject: string }) {
  const [body, setBody] = useState<ReportBody>(detail.body);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const write = useReportWrite();
  const review = useReportReview();
  const complete = detail.fields.every((field) => body[field.key].trim().length >= field.min);

  const save = (action: 'draft' | 'submit') => {
    if (!detail.canEdit || write.isPending) return;
    setMessage(null);
    write.mutate(
      { action, serId: detail.serId, onDate: detail.onDate, body },
      {
        onSuccess: () => setMessage({
          tone: 'success',
          text: action === 'draft' ? '임시저장했습니다.' : '제출했습니다. 이 시각이 정산·지각 기준으로 고정됩니다.',
        }),
        onError: (error) => setMessage({ tone: 'danger', text: apiMessage(error) }),
      },
    );
  };

  const decide = (decision: 'approve' | 'reject') => {
    if (!detail.canReview || review.isPending) return;
    setMessage(null);
    review.mutate(
      {
        serId: detail.serId,
        onDate: detail.onDate,
        body: decision === 'reject' ? { decision, reason: rejectReason } : { decision },
      },
      {
        onSuccess: () => setMessage({
          tone: 'success', text: decision === 'approve' ? '승인했습니다.' : '반려 사유와 함께 돌려보냈습니다.',
        }),
        onError: (error) => setMessage({ tone: 'danger', text: apiMessage(error) }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 쓰는 사람에게만 — 작성 양식 최상단에 지각 차감을 적는다 (대표 결정 2026-09-25 · 강사 로그인만) */}
      {detail.canEdit ? <LateReportPolicy /> : null}
      <Panel title="① 학생" sub="이름·학년은 명단 레코드에서 자동으로 입력됩니다.">
        <div className="text-[13px] font-bold text-fg">
          {detail.students.map((student) => `${student.name}${student.grade ? ` · ${student.grade}` : ''}`).join(' / ') || '학생 없음'}
        </div>
      </Panel>
      <Panel title="② 수업" sub="날짜·과목·시간은 회차 레코드에서 자동으로 입력됩니다.">
        <div className="text-[13px] font-bold text-fg">{detail.date} · {subject} · {reportTimeLabel(detail)}</div>
      </Panel>

      <ReportForm fields={detail.fields} value={body} onChange={setBody} readOnly={!detail.canEdit} />

      {detail.rejectReason ? (
        <Banner tone="danger"><b>반려 사유:</b> {detail.rejectReason}</Banner>
      ) : null}
      {!detail.canEdit ? (
        <Banner tone="neutral">{detail.minutesSinceEnd < 0
          ? '수업이 끝난 뒤 리포트를 작성할 수 있습니다.'
          : '제출 대기·승인 상태이거나 현재 사용자에게 수정 권한이 없습니다.'}</Banner>
      ) : null}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {detail.canEdit ? (
        <div className="flex justify-end gap-2">
          <Button disabled={write.isPending} onClick={() => save('draft')}>임시저장</Button>
          <Button variant="primary" disabled={write.isPending || !complete} onClick={() => save('submit')}>제출</Button>
        </div>
      ) : null}
      {detail.canReview ? (
        <div className="rounded-lg border border-line bg-inset p-3">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="danger" disabled={review.isPending}
              onClick={() => setRejecting((value) => !value)}
            >반려</Button>
            <Button variant="primary" disabled={review.isPending} onClick={() => decide('approve')}>승인</Button>
          </div>
          {rejecting ? (
            <div className="mt-3">
              <Label htmlFor="report-reject-reason">반려 사유</Label>
              <Textarea
                id="report-reject-reason" value={rejectReason} maxLength={2000}
                onChange={(event) => setRejectReason(event.currentTarget.value)}
                placeholder="고쳐야 할 내용을 구체적으로 적어 주세요"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  variant="danger" disabled={review.isPending || !rejectReason.trim()}
                  onClick={() => decide('reject')}
                >사유와 함께 반려</Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 학부모에게 나가는 전문(§50). PNG 파일 이름은 서버가 정한다 (D-R33).
 * `teacherName`·`accent`(과목색)는 부르는 쪽이 리포트에서 그대로 넘긴다 — 본문 문자열(서버 descriptor)은 바뀌지 않는다.
 */
export type ReportPreviewProps = ReportExportContent & {
  teacherName?: string | null;
  accent?: string | null;
};

export const ReportPreview = forwardRef<HTMLDivElement, ReportPreviewProps>(function ReportPreview(
  { studentName, grade, date, subject, timeLabel, fields, body, teacherName, accent },
  ref,
) {
  const color = accent ?? 'var(--blue)';
  return (
    <Panel title="학부모가 받는 화면" sub="칸도 순서도 바뀌지 않습니다.">
      <div ref={ref} data-testid="report-document" className="overflow-hidden rounded-lg border border-line-2 bg-card">
        {/* 원문 §50 머리 — 흰 바탕 · 이름(크게) + 학년 · 오른쪽 「TN ACADEMY」 · 아래 굵은 선 (g5 50-03) */}
        <header className="flex items-end justify-between gap-3 border-b-2 border-fg bg-card px-4 pb-2.5 pt-3">
          {/* 393px 점검 — 이름 칸은 줄어들며 줄을 바꾸고 로고는 줄지 않는다 */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="break-words text-[18px] font-bold text-fg">{studentName}</span>
            {grade ? <span className="text-[11px] text-fg-subtle">{grade}</span> : null}
          </div>
          <span className="shrink-0 text-[11px] font-bold tracking-[0.2em] text-fg">TN ACADEMY</span>
        </header>
        <div className="p-4">
          {/* 수업 한 블록 — 연한 바탕 + 과목색 왼쪽 막대, 수업 줄에 강사 이름, 칸은 2열 (g5 50-04 · 50-05) */}
          <div data-testid="report-lesson-block" className="rounded-lg border-l-4 bg-inset p-3" style={{ borderLeftColor: color }}>
            <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
              <span className="font-bold text-fg">{longDateLabel(date)}</span>
              <span className="font-bold" style={{ color }}>{subject}</span>
              <span className="rounded bg-card px-1.5 py-0.5 text-fg-subtle">{timeLabel}</span>
              {teacherName ? <b className="text-fg">{teacherName}</b> : null}
            </div>
            <dl className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5">
              {fields.map((field) => (
                <Fragment key={field.key}>
                  <dt className="text-[11px] font-bold text-fg-subtle">{field.label.replace(/^[①②③④⑤]\s*/, '')}</dt>
                  <dd className="whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-fg">{body[field.key] || '—'}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </Panel>
  );
});
