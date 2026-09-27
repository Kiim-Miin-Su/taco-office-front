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
import { autosaveStampLabel, draftKey, useDraftAutosave } from '@/lib/autosave';
import { longDateLabel } from '@/lib/calendar';
import { reportTimeLabel, type ReportExportContent } from '@/lib/report-export';
import { readableAccentColor } from '@/lib/tokens';
import { useSession } from '@/store/useSession';
import { Banner, Button, CountedTextarea, Label, Panel, Textarea } from '../ui';
import { LateReportPolicy } from '../teacher/LateReportPolicy';
import { useTeacherSurface } from '../teacher/teacher-surface';
import { ReportWriterGuide } from './ReportWriterGuide';

/**
 * 저장 단추 낱말 — 관리 화면은 지금 그대로, 강사 표면은 강사 덱 slide 19 의 「임시 저장」·「승인 요청하기」(7-3 ⑤).
 * 동작은 같다(임시 저장 = draft, 승인 요청 = submit → 승인 대기). 표면 판정은 서버 플래그 한 곳(useTeacherSurface)이다.
 */
const WRITE_WORDS = {
  admin: { draft: '임시저장', submit: '제출', drafted: '임시저장했습니다.', submitted: '제출했습니다. 이 시각이 정산·지각 기준으로 고정됩니다.' },
  teacher: { draft: '임시 저장', submit: '승인 요청하기', drafted: '임시 저장했습니다.', submitted: '승인을 요청했습니다. 이 시각이 정산·지각 기준으로 고정됩니다.' },
} as const;

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
  const userId = useSession((s) => s.me?.id ?? null);
  const teacherSurface = useTeacherSurface();
  const words = WRITE_WORDS[teacherSurface ? 'teacher' : 'admin'];
  const complete = detail.fields.every((field) => body[field.key].trim().length >= field.min);
  const dirty = detail.fields.some((field) => body[field.key] !== detail.body[field.key]);

  /*
   * N-69 — 쓰던 글을 이 브라우저에만 남긴다(키 = 사용자 · 회차). 쓸 수 있는 글(canEdit)에서만 · 서버 글(상태 + 본문)이
   * 그새 바뀌었으면(제출 · 결재 · 다른 사람의 저장) 되살리지 않고 지운다 — 제출본을 덮지 않는다.
   */
  const autosave = useDraftAutosave<ReportBody>({
    key: userId === null ? null : draftKey(userId, 'report', `${detail.serId}:${detail.onDate}`),
    base: `${detail.state}|${JSON.stringify(detail.body)}`,
    value: body,
    dirty,
    enabled: detail.canEdit,
    onRestore: (stored) => setBody((current) => {
      const next = { ...current };
      for (const field of detail.fields) {
        const text: unknown = (stored as Partial<Record<string, unknown>> | null)?.[field.key];
        if (typeof text === 'string') next[field.key] = text.slice(0, field.max);
      }
      return next;
    }),
  });

  const save = (action: 'draft' | 'submit') => {
    if (!detail.canEdit || write.isPending) return;
    setMessage(null);
    write.mutate(
      { action, serId: detail.serId, onDate: detail.onDate, body },
      {
        onSuccess: () => setMessage({ tone: 'success', text: action === 'draft' ? words.drafted : words.submitted }),
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

      {/* N-69 — 이 브라우저에 남아 있던 쓰던 글을 불러왔을 때만. 버리면 서버 글로 돌아간다 */}
      {autosave.restoredAt !== null && dirty ? (
        <Banner tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{`이 브라우저에 남아 있던 쓰던 글을 불러왔습니다 · ${autosaveStampLabel(autosave.restoredAt)} 자동 저장`}</span>
            <Button size="sm" onClick={() => { autosave.discard(); setBody(detail.body); }}>불러온 글 버리기</Button>
          </div>
        </Banner>
      ) : null}

      <ReportForm fields={detail.fields} value={body} onChange={setBody} readOnly={!detail.canEdit} />

      {/* 강사 덱 slide 19 — 양식 아래 「학부모님이 직접 읽는 리포트입니다」 상자(쓰는 강사에게만 · 7-3 ⑤) */}
      {teacherSurface && detail.canEdit ? <ReportWriterGuide /> : null}

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
        teacherSurface ? (
          // 강사 덱 slide 19 아래 줄 — 왼쪽 작은 「임시 저장」 + 오른쪽 넓은 초록 「승인 요청하기」
          <div className="flex gap-2">
            <Button disabled={write.isPending} onClick={() => save('draft')}>{words.draft}</Button>
            <Button variant="success" className="grow" disabled={write.isPending || !complete} onClick={() => save('submit')}>{words.submit}</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button disabled={write.isPending} onClick={() => save('draft')}>{words.draft}</Button>
            <Button variant="primary" disabled={write.isPending || !complete} onClick={() => save('submit')}>{words.submit}</Button>
          </div>
        )
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
  /** 「리포트 전문」 창처럼 문서만 싣는 자리 — 바깥 패널 머리(「학부모가 받는 화면」) 없이 문서 한 장만 그린다 (원문 §50) */
  bare?: boolean;
};

export const ReportPreview = forwardRef<HTMLDivElement, ReportPreviewProps>(function ReportPreview(
  { studentName, grade, date, subject, timeLabel, fields, body, teacherName, accent, bare = false },
  ref,
) {
  const color = accent ?? 'var(--blue)';
  const sheet = (
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
              <span className="font-bold" style={{ color: readableAccentColor(color) }}>{subject}</span>
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
  );
  return bare ? sheet : <Panel title="학부모가 받는 화면" sub="칸도 순서도 바뀌지 않습니다.">{sheet}</Panel>;
});
