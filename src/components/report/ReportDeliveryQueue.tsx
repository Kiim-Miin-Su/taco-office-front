/** @file-guide
 * 목적: ReportDeliveryQueue.tsx — ReportDeliveryQueue (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useMemo, useRef, useState } from 'react';
import { useReportDelivery, useReportDeliverySend } from '@/api/queries';
import type { ReportDeliveryCreate, ReportDeliveryStudent, ReportDetail } from '@/api/types';
import { longDateLabel } from '@/lib/calendar';
import { renderReportPng, reportExportContent, reportTimeLabel } from '@/lib/report-export';
import { Banner, Button, Checkbox, Chip } from '../ui';
import { ReportPreview } from './ReportForm';

type QueueMessage = { tone: 'success' | 'danger'; text: string };

const previewKey = (studentId: number, reportId: number) => `${studentId}:${reportId}`;

export function ReportDeliveryQueue({ onOpenReport, onOpenStudent, subjectColorOf }: {
  /** 아직 내보낼 수 없는(미승인) 수업 줄 — 검토 서랍으로 연다 */
  onOpenReport: (report: ReportDetail, studentId: number) => void;
  /** 학생 카드의 「전문 보기 ›」 — 그 학생의 그날 묶음(원문 §49 동작 「학생 카드 → 전문 보기」 · §50) */
  onOpenStudent?: (group: ReportDeliveryStudent) => void;
  /** 과목색 — 공용 subjectColor 를 부르는 쪽이 넘긴다(수업 줄 왼쪽 막대 · g5 49-05) */
  subjectColorOf?: (key?: string | null) => string | null;
}) {
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
  /**
   * 원문 §49 오른쪽 한 단추 「9명 전부 완료」(g5 49-02) — 아무도 안 골랐으면 보낼 수 있는(서버 canSend · D-R8) 학생 전부,
   * 골랐으면 고른 학생만(원문 동작 「개별 완료」). 고른 학생이 막혔다고 고르지 않은 학생을 대신 보내지 않는다.
   */
  const targets = selected.size > 0 ? selectedReady : [...readyIds];
  const sendLabel = selected.size > 0 ? `${selectedReady.length}명 완료` : `${ready.length}명 전부 완료`;

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
        // PNG와 같은 조회 snapshot의 서버 버전값. 클라이언트가 hash를 재계산하지 않는다.
        revision: descriptor.revision,
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
    if (!query.data || targets.length === 0) return;
    setMessage(null);
    let sentCount = 0;
    try {
      const groups = query.data.students.filter((group) => targets.includes(group.student.id));
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
          {/* 원문 §49 「26년 8월 20일 목요일 수업분」 / 「어제 한 수업을 오늘 보냅니다」 — 공용 긴 날짜 (g5 49-01) */}
          <h2 className="text-[18px] font-bold text-fg">{`${longDateLabel(query.data.onDate)} 수업분`}</h2>
          <p className="mt-1 text-[12px] text-fg-subtle">어제 한 수업을 오늘 보냅니다</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 원문 「학생 9명」 — 서버가 센 이날 학생 수(total) 그대로 */}
          <span className="text-[12px] font-bold text-fg-subtle">{`학생 ${query.data.total}명`}</span>
          <Button variant="primary" disabled={targets.length === 0 || send.isPending} onClick={() => void sendSelected()}>
            {send.isPending ? '저장 중…' : sendLabel}
          </Button>
        </div>
      </div>

      {message ? <Banner tone={message.tone}><span aria-live="polite">{message.text}</span></Banner> : null}
      {/* 넓은 화면은 원문처럼 학생 카드 5열 (g5 49-03) */}
      <div data-testid="delivery-cards" className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {query.data.students.map((group) => {
          const sent = group.lastSendId !== null;
          return (
            <article key={group.student.id} className="rounded-xl border border-line bg-card p-4">
              {/* 카드 머리 = 체크 · 이름 · 학년 칩 · 오른쪽 「N건」 (원문 §49 · g5 49-04). 상태 칩은 막힌 까닭이라 아래에 둔다 */}
              <div className="flex items-start justify-between gap-2">
                <Checkbox
                  label={(
                    <span className="inline-flex items-center gap-1.5">
                      <b>{group.student.name}</b>
                      {group.student.grade ? <Chip size="compact">{group.student.grade}</Chip> : null}
                    </span>
                  )}
                  checked={group.canSend && selected.has(group.student.id)}
                  disabled={!group.canSend || send.isPending}
                  onChange={(event) => toggle(group.student.id, event.currentTarget.checked)}
                />
                <b className="shrink-0 text-[12px] text-fg">{`${group.reports.length}건`}</b>
              </div>
              <Chip className="mt-1" tone={sent ? 'success' : group.blockedCount ? 'danger' : 'info'}>
                {sent ? '보냄' : group.blockedCount ? `${group.blockedCount}건 미승인` : '준비됨'}
              </Chip>
              {/* 「전문 보기 ›」는 카드에 한 번 — 그 학생의 그날 묶음을 연다(원문 §49 · g5 49-05 · 50-01). 내보낼 수 있는 수업이 없으면 서지 않는다 */}
              {onOpenStudent && group.reports.some((report) => report.canExport && report.exportFiles.length > 0) ? (
                <button type="button" className="mt-2 text-[12px] font-bold text-primary hover:underline"
                  onClick={() => onOpenStudent(group)}>
                  전문 보기 ›
                </button>
              ) : null}
              <div className="mt-2 flex flex-col gap-2">
                {group.reports.map((report) => {
                  const reviewable = !(report.canExport && report.exportFiles.length > 0);
                  const line = (
                    <>
                      {/*
                        원본 §49 는 줄마다 **누가 쓴 리포트인지**를 적는다 — 한 학생에게 여러 강사의
                        리포트가 함께 나가는 자리라, 이름이 없으면 「누가 쓴 것을 보내는지」를 모른다.
                        서버는 처음부터 `teacherName` 을 싣고 있었고 화면만 안 그렸다 (C86-f).
                      */}
                      <span>
                        <b>{report.subjectName}</b> · {reportTimeLabel(report)}
                        {report.teacherName ? <span className="text-fg-subtle"> · {report.teacherName} 강사</span> : null}
                      </span>
                      {reviewable ? <span className="text-fg-subtle">검토 ›</span> : null}
                    </>
                  );
                  // 왼쪽 과목색 막대 (원문 §49 · g5 49-05)
                  const className = 'flex items-center justify-between gap-2 rounded-lg border border-l-4 border-line bg-inset px-3 py-2 text-left text-[12px]';
                  const style = { borderLeftColor: subjectColorOf?.(report.subKey) ?? 'var(--line)' };
                  // 아직 내보낼 수 없는(미승인) 수업만 검토 서랍을 여는 단추다 — 승인된 줄은 읽는 줄이다
                  return reviewable ? (
                    <button type="button" key={report.id} data-report-line className={`${className} hover:border-blue`} style={style}
                      onClick={() => onOpenReport(report, group.student.id)}>
                      {line}
                    </button>
                  ) : (
                    <div key={report.id} data-report-line className={className} style={style}>{line}</div>
                  );
                })}
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
              teacherName={report.teacherName}
              accent={subjectColorOf?.(report.subKey) ?? null}
            />
          )];
        }))}
      </div>
    </section>
  );
}
