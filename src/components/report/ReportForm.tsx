/**
 * Report/Section · Form/Report Dev · UI/Counted Textarea — 리포트 5개 섹션 고정 (D-R15 · D-R40).
 *
 * 1·2는 회차/학생 메타데이터, 3·4·5는 강사 입력이다. 입력 키·순서·길이는
 * 백엔드 rules.ts → ReportDetailDto.fields를 그대로 읽어 그린다.
 */
'use client';
import { forwardRef, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useReportReview, useReportWrite } from '@/api/queries';
import type { ReportBody, ReportDetail, ReportField } from '@/api/types';
import { hhmm } from '@/lib/calendar';
import { Banner, Button, CountedTextarea, Label, Panel, Textarea } from '../ui';

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

/** 보고서 페이지와 수업 상세가 나중에 같은 저장 흐름을 재사용한다. */
export function ReportEditor({ detail, subject }: { detail: ReportDetail; subject: string }) {
  const [body, setBody] = useState<ReportBody>(detail.body);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const write = useReportWrite();
  const review = useReportReview();
  const complete = detail.fields.every((field) => body[field.key].trim().length >= field.min);

  const save = (action: 'draft' | 'submit') => {
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
      <Panel title="① 학생" sub="이름·학년은 명단 레코드에서 자동으로 입력됩니다.">
        <div className="text-[13px] font-bold text-fg">
          {detail.students.map((student) => `${student.name}${student.grade ? ` · ${student.grade}` : ''}`).join(' / ') || '학생 없음'}
        </div>
      </Panel>
      <Panel title="② 수업" sub="날짜·과목·시간은 회차 레코드에서 자동으로 입력됩니다.">
        <div className="text-[13px] font-bold text-fg">{detail.date} · {subject} · {hhmm(detail.startMin)}</div>
      </Panel>

      <ReportForm fields={detail.fields} value={body} onChange={setBody} readOnly={!detail.canEdit} />

      {detail.rejectReason ? (
        <Banner tone="danger"><b>반려 사유:</b> {detail.rejectReason}</Banner>
      ) : null}
      {!detail.canEdit ? (
        <Banner tone="neutral">제출 대기·승인 상태이거나 현재 사용자에게 수정 권한이 없습니다.</Banner>
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

/** 학부모에게 나가는 전문(§50). PNG 파일 이름은 서버가 정한다 (D-R33). */
export interface ReportPreviewProps {
  studentName: string;
  grade?: string | null;
  date: string;
  subject: string;
  startTime: string;
  fields: ReportField[];
  body: ReportBody;
}

export const ReportPreview = forwardRef<HTMLDivElement, ReportPreviewProps>(function ReportPreview(
  { studentName, grade, date, subject, startTime, fields, body },
  ref,
) {
  return (
    <Panel title="학부모가 받는 화면" sub="칸도 순서도 바뀌지 않습니다.">
      <div ref={ref} className="overflow-hidden rounded-lg border border-line-2 bg-card">
        <header className="bg-fg px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[16px] font-bold text-white">{studentName}</span>
            <span className="text-[11px] text-line-2">{grade}</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-line-2">티엔아카데미 · {date}</div>
        </header>
        <div className="flex items-center gap-3 bg-inset px-4 py-2 text-[11.5px]">
          <span className="font-bold text-fg">{date}</span>
          <span className="font-bold text-blue">{subject}</span>
          <span className="text-fg-subtle">{startTime}</span>
        </div>
        <div className="flex flex-col gap-3 p-4">
          {fields.map((field) => (
            <div key={field.key} className="border-l-2 border-blue pl-3">
              <div className="text-[11px] font-bold text-fg">{field.label.replace(/^[①②③④⑤]\s*/, '')}</div>
              <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-fg-2">{body[field.key] || '—'}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
});
