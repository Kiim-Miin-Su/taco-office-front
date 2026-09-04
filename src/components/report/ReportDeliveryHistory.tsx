'use client';

import { useState } from 'react';
import { useReportDeliveryHistory, useReportDeliveryResend } from '@/api/queries';
import type { ReportSendHistory } from '@/api/types';
import { Banner, Button, type Column, Table } from '../ui';

type HistoryMessage = { tone: 'success' | 'danger'; text: string };

const kstDateTime = (value: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value));

const historyAction = (row: ReportSendHistory) => row.sourceSendId
  ? `재발송 기록 · private Blob ${row.fileCount}장 재사용`
  : `private Blob ${row.fileCount}장 보존`;

export function ReportDeliveryHistory({
  onDate, repId, compact = false,
}: { onDate?: string; repId?: number; compact?: boolean }) {
  const query = useReportDeliveryHistory({ onDate, repId });
  const resend = useReportDeliveryResend();
  const [message, setMessage] = useState<HistoryMessage | null>(null);

  const resendOne = async (row: ReportSendHistory) => {
    setMessage(null);
    try {
      await resend.mutateAsync({ sendId: row.id, requestKey: crypto.randomUUID() });
      setMessage({ tone: 'success', text: `${row.studentName} 학생 발송 이력을 한 건 더 남겼습니다.` });
    } catch {
      setMessage({ tone: 'danger', text: '재발송 이력을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  };

  const columns: Array<Column<ReportSendHistory>> = [
    { key: 'at', head: '때', width: 150, cell: (row) => kstDateTime(row.sentAt) },
    { key: 'student', head: '학생', width: 100, cell: (row) => <b>{row.studentName}</b> },
    { key: 'action', head: '한 것', cell: historyAction },
    { key: 'by', head: '누가', width: 90, cell: (row) => row.sentByName },
    { key: 'again', head: '', width: 100, align: 'right', cell: (row) => (
      <Button size="sm" disabled={resend.isPending} onClick={() => void resendOne(row)}>다시 보내기</Button>
    ) },
  ];

  return (
    <section className={compact ? 'mt-2' : undefined} aria-label="리포트 발송 이력">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-bold text-fg">내보내기 이력</h3>
          {!compact ? <p className="mt-0.5 text-[11px] text-fg-subtle">RSEND 원문과 private Blob 파일을 덮어쓰지 않고 보관합니다.</p> : null}
        </div>
        <span className="text-[11px] text-fg-subtle">{query.data?.items.length ?? 0}건</span>
      </div>
      {message ? <Banner tone={message.tone}><span aria-live="polite">{message.text}</span></Banner> : null}
      {query.isLoading ? <Banner tone="neutral">발송 이력을 불러오는 중…</Banner>
        : query.isError ? <Banner tone="danger">발송 이력을 불러오지 못했습니다.</Banner>
          : (
            <>
              <div className="grid gap-2 sm:hidden">
                {(query.data?.items ?? []).map((row) => (
                  <article key={row.id} className="rounded-xl border border-line bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <b className="text-[13px] text-fg">{row.studentName}</b>
                        <p className="mt-0.5 text-[11px] text-fg-subtle">{kstDateTime(row.sentAt)} · {row.sentByName}</p>
                      </div>
                      <Button size="sm" disabled={resend.isPending} onClick={() => void resendOne(row)}>다시 보내기</Button>
                    </div>
                    <p className="mt-2 text-[12px] text-fg">{historyAction(row)}</p>
                  </article>
                ))}
                {(query.data?.items.length ?? 0) === 0 ? <Banner tone="neutral">발송 이력이 없습니다</Banner> : null}
              </div>
              <div className="hidden sm:block">
                <Table columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} empty="발송 이력이 없습니다" />
              </div>
            </>
          )}
      {!compact ? (
        <Banner tone="info" className="mt-3">
          여기의 완료는 private Blob 보존과 내부 감사 이력 완료입니다. 카카오·알림톡 실발송은 별도 외부 연동입니다.
        </Banner>
      ) : null}
    </section>
  );
}
