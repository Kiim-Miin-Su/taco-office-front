/** §50 리포트 전문 — 서버 파일명과 기존 ReportPreview를 학생별 PNG·본문 복사에 연결한다. */
'use client';

import { useMemo, useRef, useState } from 'react';
import type { ReportDetail } from '@/api/types';
import { hhmm } from '@/lib/calendar';
import { copyReportText, downloadReportPng, type ReportExportContent } from '@/lib/report-export';
import { Banner, Button, Label, Select } from '../ui';
import { ReportPreview } from './ReportForm';

type ExportMessage = { tone: 'success' | 'danger'; text: string };

export function ReportExportPanel({ detail }: { detail: ReportDetail }) {
  const [studentId, setStudentId] = useState(detail.exportFiles[0]?.studentId ?? 0);
  const [busy, setBusy] = useState<'png' | 'copy' | null>(null);
  const [message, setMessage] = useState<ExportMessage | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => {
    const file = detail.exportFiles.find((item) => item.studentId === studentId);
    const student = detail.students.find((item) => item.id === studentId);
    return file && student ? { file, student } : null;
  }, [detail.exportFiles, detail.students, studentId]);

  if (!detail.canExport || detail.exportFiles.length === 0) return null;

  if (!selected) {
    return <Banner tone="danger">학생 명단과 PNG 파일명 계약이 일치하지 않습니다.</Banner>;
  }

  const content: ReportExportContent = {
    studentName: selected.student.name,
    grade: selected.student.grade,
    date: detail.date,
    subject: detail.subjectName,
    startTime: hhmm(detail.startMin),
    fields: detail.fields,
    body: detail.body,
  };

  const savePng = async () => {
    if (!previewRef.current) return;
    setBusy('png');
    setMessage(null);
    try {
      await downloadReportPng(previewRef.current, selected.file.fileName);
      setMessage({ tone: 'success', text: `${selected.file.fileName} 저장을 시작했습니다.` });
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
      await copyReportText(content);
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

      <ReportPreview ref={previewRef} {...content} />

      {message ? <Banner tone={message.tone}><span aria-live="polite">{message.text}</span></Banner> : null}
      <div className="flex justify-end gap-2">
        <Button disabled={busy !== null} onClick={() => void copyText()}>본문 복사</Button>
        <Button variant="primary" disabled={busy !== null} onClick={() => void savePng()}>PNG 저장</Button>
      </div>
    </section>
  );
}
