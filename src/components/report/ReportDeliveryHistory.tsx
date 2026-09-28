/** @file-guide
 * 목적: ReportDeliveryHistory.tsx — ReportDeliveryHistory (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useState } from 'react';
import { useReportDeliveryHistory, useReportDeliveryResend } from '@/api/queries';
import type { ReportSendHistory, ReportSendHistoryList } from '@/api/types';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';
import { kstDateTime } from '@/lib/calendar';
import { Banner, Button, Chip, Segmented } from '../ui';

type HistoryMessage = { tone: 'success' | 'danger'; text: string };
type SendSpan = 'day' | 'week' | 'month';

/** §48 원문 「일별 · 주별 · 월별」 — 묶는 눈금. 묶음의 건수·기록지·인원은 서버가 센다 */
const SPANS: Array<{ value: SendSpan; label: string }> = [
  { value: 'day', label: '일별' },
  { value: 'week', label: '주별' },
  { value: 'month', label: '월별' },
];

/*
 * 사람에게 보이는 자리에 **저장소 이름을 적지 않는다.** 「private Blob」과 「RSEND」는
 * 우리가 파일을 어디에 두는지와 어느 표에 적는지를 가리키는 **내부 이름**이고,
 * 학부모에게 나갈 리포트를 보내는 사람이 알 일이 아니다. 저장소를 바꾸면 이 문장도
 * 함께 틀리게 되므로, 여기서는 **무엇이 남는지**만 말한다.
 */
const historyAction = (row: ReportSendHistory) => row.sourceSendId
  ? `다시 보냄 · 파일 ${row.fileCount}장 그대로`
  : `파일 ${row.fileCount}장 보관`;

/**
 * 발송 한 줄 — 원문 §48 「기록지 · 학생 · 과목 · 강사 · 08-19 수업 · 보낸 시각 · 보낸 사람」 (g5 48-03 · 48-04).
 * 과목·강사는 보낸 리포트들에서 서버가 모아 준 이름이고, 시각은 공용 KST 표기(YYYY-MM-DD HH:mm)다.
 */
function SendLine({ row, disabled, onResend }: { row: ReportSendHistory; disabled: boolean; onResend: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-card px-3 py-2 text-[12px]">
      <Chip size="compact" tone="info">기록지</Chip>
      <b className="text-fg">{row.studentName}</b>
      <span className="text-fg-subtle">{row.subjectNames.join(' · ') || '과목 없음'}</span>
      <span className="text-fg-subtle">{row.teacherNames.join(' · ') || '강사 없음'}</span>
      <span className="text-fg-subtle">{`${row.onDate.slice(5)} 수업`}</span>
      <span className="text-fg-subtle">{historyAction(row)}</span>
      {row.downloadFiles.map((file) => (
        <FileDownloadButton key={file.id} id={file.id} label={file.name} />
      ))}
      <span className="ml-auto flex items-center gap-3">
        <span className="text-fg-subtle">{kstDateTime(row.sentAt) ?? '—'}</span>
        <span>{row.sentByName}</span>
        {/* 서는지도 막힌 이유도 서버가 정한다 (S5 · D-R39) — fileCount 도 재발송이 세는 것과 같은 것을 센다 */}
        <Button size="sm" disabled={disabled || !row.canResend} title={row.resendBlockedReason ?? undefined} onClick={onResend}>
          다시 보내기
        </Button>
      </span>
    </li>
  );
}

/** 묶음 카드 — 「09-14 ~ 09-20 · 1건 · 기록지 2 · 1명 ▾」. 줄은 서버 sendIds 로 이 묶음에 놓는다 */
function SendGroups({ data, disabled, onResend }: {
  data: ReportSendHistoryList; disabled: boolean; onResend: (row: ReportSendHistory) => void;
}) {
  const byId = new Map(data.items.map((row) => [row.id, row]));
  if (data.groups.length === 0) return <Banner tone="neutral">발송 이력이 없습니다</Banner>;
  return (
    <div className="space-y-2">
      {data.groups.map((group, index) => {
        const rows = group.sendIds.map((id) => byId.get(id)).filter((row): row is ReportSendHistory => row !== undefined);
        return (
          <details key={group.from} open={index === 0} className="group overflow-hidden rounded-xl border border-line bg-card">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 bg-inset px-4 py-3">
              <b className="text-[13px]">{group.label}</b>
              <Chip>{`${group.count}건`}</Chip>
              <Chip tone="info">{`기록지 ${group.sheets}`}</Chip>
              <Chip>{`${group.students}명`}</Chip>
              <span className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" aria-hidden>⌄</span>
            </summary>
            <div className="p-3">
              <h4 className="mb-2 text-[11px] font-bold text-fg-subtle">기록지</h4>
              <ul className="space-y-1.5">
                {rows.map((row) => (
                  <SendLine key={row.id} row={row} disabled={disabled} onResend={() => onResend(row)} />
                ))}
              </ul>
              {/* 목록은 최근 100건까지 싣는다 — 묶음 수가 더 많으면 그 사실을 적는다(수는 서버가 전부 센 값) */}
              {rows.length < group.count ? (
                <p className="mt-2 text-[11px] text-fg-subtle">{`최근 ${rows.length}건만 보입니다 — 이 묶음은 모두 ${group.count}건입니다`}</p>
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function ReportDeliveryHistory({
  onDate, repId, compact = false,
}: { onDate?: string; repId?: number; compact?: boolean }) {
  // 상세 안(compact)은 한 리포트의 짧은 이력이라 묶지 않는다. 「보낸 내역」 탭은 원문대로 눈금 묶음이다 (g5 48-02)
  const [span, setSpan] = useState<SendSpan>('week');
  const query = useReportDeliveryHistory(compact ? { onDate, repId } : { onDate, repId, span });
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

  return (
    <section className={compact ? 'mt-2' : undefined} aria-label="리포트 발송 이력">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* 탭 이름과 머리가 한 화면에서 갈리지 않게 「보낸 내역」 — 상세 안은 그대로 (g5 48-01) */}
          <h3 className="text-[13px] font-bold text-fg">{compact ? '내보내기 이력' : '보낸 내역'}</h3>
          {!compact ? <p className="mt-0.5 text-[11px] text-fg-subtle">보낸 내용과 파일을 덮어쓰지 않고 그대로 보관합니다.</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {!compact ? <span className="text-[12px] font-bold text-fg">{`기록지 ${query.data?.sheets ?? 0}장`}</span> : null}
          <span className="text-[11px] text-fg-subtle">{query.data?.total ?? 0}건</span>
          {!compact ? <Segmented ariaLabel="보낸 내역 묶음" options={SPANS} value={span} onChange={setSpan} /> : null}
        </div>
      </div>
      {message ? <Banner tone={message.tone}><span aria-live="polite">{message.text}</span></Banner> : null}
      {query.isLoading ? <Banner tone="neutral">발송 이력을 불러오는 중…</Banner>
        : query.isError || !query.data ? <Banner tone="danger">발송 이력을 불러오지 못했습니다.</Banner>
          : compact ? (
            query.data.items.length === 0 ? <Banner tone="neutral">발송 이력이 없습니다</Banner> : (
              <ul className="space-y-1.5">
                {query.data.items.map((row) => (
                  <SendLine key={row.id} row={row} disabled={resend.isPending} onResend={() => void resendOne(row)} />
                ))}
              </ul>
            )
          ) : (
            <SendGroups data={query.data} disabled={resend.isPending} onResend={(row) => void resendOne(row)} />
          )}
      {!compact ? (
        <Banner tone="info" className="mt-3">
          여기의 「완료」는 파일이 보관되고 이력이 남았다는 뜻입니다. 카카오·알림톡으로 실제 보내는 것은 아직 별도입니다.
        </Banner>
      ) : null}
    </section>
  );
}
