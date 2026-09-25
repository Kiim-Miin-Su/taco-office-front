/** @file-guide
 * 목적: ReportExportPanel.tsx — ReportExportPanel (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** §50 리포트 전문 — 서버 파일명과 기존 ReportPreview를 학생별 PNG·본문 복사에 연결한다. */
'use client';

import { useMemo, useRef, useState } from 'react';
import type { ReportDetail } from '@/api/types';
import { copyReportText, downloadReportPng, reportExportContent } from '@/lib/report-export';
import { subjectColor } from '@/lib/tokens';

/** 코드표 없이 부른다 — 알려진 21과목은 토큰 색, 모르는 과목은 기본 파랑(ReportPreview) */
const NO_SUB_CODES = new Map<string, never>();
import { Banner, Button, Label, Select } from '../ui';
import { ReportDeliveryHistory } from './ReportDeliveryHistory';
import { ReportPreview } from './ReportForm';

type ExportMessage = { tone: 'success' | 'danger'; text: string };

export function ReportExportPanel({ detail, initialStudentId, showHistory = true }: {
  detail: ReportDetail;
  initialStudentId?: number;
  /** §50 「리포트 전문」 창은 학부모 문서와 단추만 싣는다 — 내보내기 이력은 상세 서랍에서 본다 */
  showHistory?: boolean;
}) {
  const initial = detail.exportFiles.some((file) => file.studentId === initialStudentId)
    ? initialStudentId!
    : detail.exportFiles[0]?.studentId ?? 0;
  const [studentId, setStudentId] = useState(initial);
  const [busy, setBusy] = useState<'png' | 'copy' | null>(null);
  const [message, setMessage] = useState<ExportMessage | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => {
    return reportExportContent(detail, studentId);
  }, [detail, studentId]);

  if (!detail.canExport || detail.exportFiles.length === 0) return null;

  if (!selected) {
    return <Banner tone="danger">학생 명단과 PNG 파일명 계약이 일치하지 않습니다.</Banner>;
  }

  const savePng = async () => {
    if (!previewRef.current) return;
    setBusy('png');
    setMessage(null);
    try {
      await downloadReportPng(previewRef.current, selected.fileName);
      setMessage({ tone: 'success', text: `${selected.fileName} 저장을 시작했습니다.` });
    } catch {
      setMessage({ tone: 'danger', text: 'PNG를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  const copyText = async () => {
    setBusy('copy');
    setMessage(null);
    try {
      await copyReportText(selected.plainText);
      setMessage({ tone: 'success', text: '리포트 본문을 복사했습니다.' });
    } catch {
      setMessage({ tone: 'danger', text: '본문을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-4 flex flex-col gap-3" aria-label="리포트 전문 내보내기">
      {detail.exportFiles.length > 1 ? (
        <div>
          <Label htmlFor="report-export-student" hint={`학생별 1장 · 총 ${detail.exportFiles.length}장`}>
            출력할 학생
          </Label>
          <Select
            id="report-export-student"
            value={studentId}
            onChange={(event) => {
              setStudentId(Number(event.currentTarget.value));
              setMessage(null);
            }}
          >
            {detail.exportFiles.map((file) => {
              const student = detail.students.find((item) => item.id === file.studentId);
              return <option key={file.studentId} value={file.studentId}>{student?.name ?? `학생 ${file.studentId}`}</option>;
            })}
          </Select>
        </div>
      ) : null}

      {/* 과목색은 공용 subjectColor — 알려진 과목은 코드표 없이도 과목색 토큰을 쓴다 */}
      <ReportPreview ref={previewRef} {...selected.content} teacherName={detail.teacherName}
        accent={subjectColor(detail.subKey, NO_SUB_CODES)} />

      {message ? <Banner tone={message.tone}><span aria-live="polite">{message.text}</span></Banner> : null}
      <div className="flex justify-end gap-2">
        <Button disabled={busy !== null} onClick={() => void copyText()}>글자로 복사</Button>
        <Button variant="primary" disabled={busy !== null} onClick={() => void savePng()}>PNG로 저장</Button>
      </div>
      {showHistory && detail.canDeliver ? <ReportDeliveryHistory repId={detail.id} compact /> : null}
    </section>
  );
}
