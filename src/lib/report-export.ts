/** @file-guide
 * 목적: report-export.ts — ReportExportContent, reportExportContent, copyReportText, renderReportPng, downloadReportPng (util)
 * 책임/재사용: 현재 lib 계층의 순수 계산/표시 방어를 우선 재사용한다. UI·네트워크·DB 부수효과와 서버 업무 권위를 섞지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReportBody, ReportDetail, ReportField } from '@/api/types';
import { hhmm } from './calendar';

export interface ReportExportContent {
  studentName: string;
  grade?: string | null;
  date: string;
  subject: string;
  timeLabel: string;
  fields: ReportField[];
  body: ReportBody;
}

type ClipboardWriter = Pick<Clipboard, 'writeText'>;
type PngRenderer = (node: HTMLElement, options: { cacheBust: boolean; pixelRatio: number }) => Promise<string>;

/** 편집기·발송 큐·PNG가 같은 파생 시간 계약을 표시한다. null은 가짜 00:00으로 변환하지 않는다. */
export function reportTimeLabel(report: Pick<ReportDetail, 'startMin' | 'endMin'>): string {
  return report.startMin == null || report.endMin == null
    ? '시간 미정' : `${hhmm(report.startMin)}–${hhmm(report.endMin)}`;
}

/** 상세·큐·PNG·복사가 같은 학생 선택 어댑터를 쓴다. 본문 문자열은 서버 descriptor가 소유한다. */
export function reportExportContent(detail: ReportDetail, studentId: number): {
  content: ReportExportContent; fileName: string; plainText: string;
} | null {
  const file = detail.exportFiles.find((item) => item.studentId === studentId);
  const student = detail.students.find((item) => item.id === studentId);
  if (!file || !student) return null;
  return {
    fileName: file.fileName,
    plainText: file.plainText,
    content: {
      studentName: student.name,
      grade: student.grade,
      date: detail.date,
      subject: detail.subjectName,
      timeLabel: reportTimeLabel(detail),
      fields: detail.fields,
      body: detail.body,
    },
  };
}

export async function copyReportText(
  plainText: string,
  clipboard: ClipboardWriter = navigator.clipboard,
): Promise<void> {
  await clipboard.writeText(plainText);
}

/** 다운로드와 발송이 동일한 2배 PNG renderer를 공유한다. */
export async function renderReportPng(node: HTMLElement, renderer?: PngRenderer): Promise<string> {
  const toPng = renderer ?? (await import('html-to-image')).toPng;
  return toPng(node, { cacheBust: true, pixelRatio: 2 });
}

/** html-to-image는 버튼을 누를 때만 불러오고, 출력 배율은 D-R33의 2배로 고정한다. */
export async function downloadReportPng(
  node: HTMLElement,
  fileName: string,
  renderer?: PngRenderer,
): Promise<void> {
  const dataUrl = await renderReportPng(node, renderer);
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}
