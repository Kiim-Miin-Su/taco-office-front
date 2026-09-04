'use client';

import { useMemo, useRef, useState } from 'react';
import { useReportDelivery, useReportDeliverySend } from '@/api/queries';
import type { ReportDeliveryCreate, ReportDeliveryStudent, ReportDetail } from '@/api/types';
import { hhmm } from '@/lib/calendar';
import { renderReportPng, reportExportContent } from '@/lib/report-export';
import { Banner, Button, Checkbox, Chip } from '../ui';
import { ReportPreview } from './ReportForm';

type QueueMessage = { tone: 'success' | 'danger'; text: string };

const previewKey = (studentId: number, reportId: number) => `${studentId}:${reportId}`;

export function ReportDeliveryQueue({ onOpenReport }: { onOpenReport: (report: ReportDetail) => void }) {
  const query = useReportDelivery();
  const send = useReportDeliverySend();
  const previews = useRef(new Map<string, HTMLDivElement>());
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [message, setMessage] = useState<QueueMessage | null>(null);

  const ready = useMemo(
    () => query.data?.students.filter((student) => student.canSend) ?? [],
    [query.data?.students],
  );
  const readyIds = useMemo(() => new Set(ready.map((student) => student.student.id)), [ready]);
  const selectedReady = [...selected].filter((studentId) => readyIds.has(studentId));

  const toggle = (studentId: number, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(studentId); else next.delete(studentId);
      return next;
    });
  };

  const renderDelivery = async (group: ReportDeliveryStudent): Promise<ReportDeliveryCreate> => {
    const files: ReportDeliveryCreate['files'] = [];
    for (const report of group.reports) {
      const descriptor = reportExportContent(report, group.student.id);
      const node = previews.current.get(previewKey(group.student.id, report.id));
      if (!descriptor || !node) throw new Error('REPORT_DELIVERY_PREVIEW_MISMATCH');
      files.push({
        repId: report.id,
        fileName: descriptor.fileName,
        pngDataUrl: await renderReportPng(node),
      });
    }
    return {
      requestKey: crypto.randomUUID(),
      onDate: query.data!.onDate,
      studentId: group.student.id,
      files,
    };
  };

  const sendSelected = async () => {
    if (!query.data || selectedReady.length === 0) return;
    setMessage(null);
    let sentCount = 0;
    try {
      const groups = query.data.students.filter((group) => selectedReady.includes(group.student.id));
      // PNG를 학생 한 명씩 만들고 즉시 전송해 전체 선택 시에도 메모리를 한 학생 분량으로 제한한다.
      for (const group of groups) {
        await send.mutateAsync(await renderDelivery(group));
        sentCount += 1;
      }
      setSelected(new Set());
      setMessage({ tone: 'success', text: `${sentCount}명 발송 패키지와 이력을 저장했습니다.` });
    } catch {
      setMessage({
        tone: 'danger',
        text: `${sentCount}명까지 저장했습니다. 나머지는 이력을 확인한 뒤 다시 시도해 주세요.`,
      });
    }
  };

  if (query.isLoading) return <Banner tone="neutral">어제 리포트를 불러오는 중…</Banner>;
  if (query.isError || !query.data) return <Banner tone="danger">어제 발송 대상을 불러오지 못했습니다.</Banner>;

  return (
    <section aria-label="어제 리포트 보내기">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold text-fg">{query.data.onDate} 수업분</h2>
          <p className="mt-1 text-[12px] text-fg-subtle">승인 완료된 리포트만 학생 단위로 묶어 private Blob에 보존합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-fg-subtle">보낼 수 있음 {query.data.remaining}명</span>
          <Button
            size="sm"
            disabled={ready.length === 0 || send.isPending}
            onClick={() => setSelected(new Set(ready.map((student) => student.student.id)))}
          >
            전체 선택
          </Button>
          <Button variant="primary" disabled={selectedReady.length === 0 || send.isPending} onClick={() => void sendSelected()}>
            {send.isPending ? '저장 중…' : `${selectedReady.length}명 보내기`}
          </Button>
        </div>
      </div>

      {message ? <Banner tone={message.tone}><span aria-live="polite">{message.text}</span></Banner> : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {query.data.students.map((group) => {
          const sent = group.lastSendId !== null;
          return (
            <article key={group.student.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <Checkbox
                  label={<span className="font-bold">{group.student.name} {group.student.grade ? `· ${group.student.grade}` : ''}</span>}
                  checked={group.canSend && selected.has(group.student.id)}
                  disabled={!group.canSend || send.isPending}
                  onChange={(event) => toggle(group.student.id, event.currentTarget.checked)}
                />
                <Chip tone={sent ? 'success' : group.blockedCount ? 'danger' : 'info'}>
                  {sent ? '보냄' : group.blockedCount ? `${group.blockedCount}건 미승인` : '준비됨'}
                </Chip>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {group.reports.map((report) => (
                  <button
                    type="button"
                    key={report.id}
                    className="flex items-center justify-between rounded-lg border border-line bg-inset px-3 py-2 text-left text-[12px] hover:border-blue"
                    onClick={() => onOpenReport(report)}
                  >
                    <span><b>{report.subjectName}</b> · {hhmm(report.startMin)}</span>
                    <span className="text-fg-subtle">전문 보기 ›</span>
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {query.data.students.length === 0 ? <Banner tone="neutral">어제 전달할 리포트가 없습니다.</Banner> : null}

      <div className="fixed -left-[10000px] top-0 w-[680px]" aria-hidden="true">
        {ready.flatMap((group) => group.reports.map((report) => {
          const descriptor = reportExportContent(report, group.student.id);
          if (!descriptor) return [];
          const key = previewKey(group.student.id, report.id);
          return [(
            <ReportPreview
              key={key}
              ref={(node) => {
                if (node) previews.current.set(key, node); else previews.current.delete(key);
              }}
              {...descriptor.content}
            />
          )];
        }))}
      </div>
    </section>
  );
}
