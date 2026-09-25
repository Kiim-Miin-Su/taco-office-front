/** @file-guide
 * 목적: §50 리포트 전문 — 어제 보내기의 학생 카드에서 「전문 보기」로 연 학생 한 명의 하루 리포트를 공용 Dialog 에 싣는다.
 * 책임/재사용: 공용 Dialog 와 ReportPreview·report-export(서버 descriptor 의 파일 이름·본문)를 재사용한다. 작성·검토 입력은 싣지 않는다 — 그것은 ReportDetailDrawer 몫이다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useRef, useState } from 'react';
import type { ReportDeliveryStudent } from '@/api/types';
import { longDateLabel } from '@/lib/calendar';
import { copyReportText, downloadReportPng, reportExportContent } from '@/lib/report-export';
import { Banner, Button, Dialog } from '../ui';
import { ReportPreview } from './ReportForm';

type ExportMessage = { tone: 'success' | 'danger'; text: string };

/**
 * 원본 §50 은 가운데 **모달** 「리포트 전문」 — 머리 「이담흔 · G10 · 26년 8월 20일 목요일 수업 1건」, 안에는 학부모 문서,
 * 아래 바 왼쪽 「📋 글자로 복사 · 🖼 PNG로 저장」 · 오른쪽 「닫기」다. 여는 자리는 **학생 카드**다(원문 §49 동작
 * 「학생 카드 → 전문 보기」) — 그래서 창 하나가 그 학생의 그날 수업을 모두 싣는다(g5 50-01).
 *
 * **파일은 수업마다 한 장이다.** PNG 이름은 대표 결정(2026-08-27 §2 · D-R33)으로 `날짜_이름_학년_과목_시각` 이 확정이고
 * 발송 이력(RSEND)·보관 경로가 같은 이름을 쓴다. 그래서 「PNG로 저장」은 수업 수만큼 서버 파일 이름 그대로 내려받고,
 * 「글자로 복사」는 서버 본문 descriptor 를 수업 차례 그대로 잇는다 — 화면이 본문도 이름도 새로 짓지 않는다.
 * 아직 내보낼 수 없는(미승인) 수업은 싣지 않는다 — 발송 큐가 보내지 않는 글을 학부모 문서로 보이지 않는다.
 */
export function ReportFullTextDialog({ group, subjectColorOf, onClose }: {
  group: ReportDeliveryStudent | null;
  subjectColorOf?: (key?: string | null) => string | null;
  onClose: () => void;
}) {
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const [busy, setBusy] = useState<'png' | 'copy' | null>(null);
  const [message, setMessage] = useState<ExportMessage | null>(null);

  const close = () => {
    setMessage(null);
    onClose();
  };

  if (!group) return <Dialog open={false} onClose={close} />;

  const documents = group.reports.flatMap((report) => {
    const descriptor = report.canExport ? reportExportContent(report, group.student.id) : null;
    return descriptor ? [{ report, descriptor }] : [];
  });
  const held = group.reports.length - documents.length;
  const sub = [group.student.name, group.student.grade, `${longDateLabel(group.reports[0]?.date ?? '')} 수업 ${documents.length}건`]
    .filter(Boolean).join(' · ');

  const copyText = async () => {
    setBusy('copy');
    setMessage(null);
    try {
      await copyReportText(documents.map((item) => item.descriptor.plainText).join('\n\n'));
      setMessage({ tone: 'success', text: '리포트 본문을 복사했습니다.' });
    } catch {
      setMessage({ tone: 'danger', text: '본문을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  const savePng = async () => {
    setBusy('png');
    setMessage(null);
    try {
      for (const item of documents) {
        const node = nodes.current.get(item.report.id);
        if (!node) throw new Error('REPORT_PREVIEW_MISSING');
        await downloadReportPng(node, item.descriptor.fileName);
      }
      setMessage({
        tone: 'success',
        text: documents.length === 1
          ? `${documents[0]!.descriptor.fileName} 저장을 시작했습니다.`
          : `PNG ${documents.length}장 저장을 시작했습니다.`,
      });
    } catch {
      setMessage({ tone: 'danger', text: 'PNG를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      onClose={close}
      width={760}
      title="리포트 전문"
      sub={sub}
      closeX
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button disabled={busy !== null || documents.length === 0} onClick={() => void copyText()}>
              <span aria-hidden>📋</span>글자로 복사
            </Button>
            <Button disabled={busy !== null || documents.length === 0} onClick={() => void savePng()}>
              <span aria-hidden>🖼</span>PNG로 저장
            </Button>
          </div>
          <Button onClick={close}>닫기</Button>
        </div>
      )}
    >
      <div className="flex max-h-[64vh] flex-col gap-3 overflow-y-auto">
        {documents.map(({ report, descriptor }) => (
          <ReportPreview
            key={report.id}
            bare
            ref={(node) => {
              if (node) nodes.current.set(report.id, node); else nodes.current.delete(report.id);
            }}
            {...descriptor.content}
            teacherName={report.teacherName}
            accent={subjectColorOf?.(report.subKey) ?? null}
          />
        ))}
        {held > 0 ? <Banner tone="warning">{`승인 전 리포트 ${held}건은 싣지 않았습니다.`}</Banner> : null}
        {message ? <Banner tone={message.tone}><span aria-live="polite">{message.text}</span></Banner> : null}
      </div>
    </Dialog>
  );
}
