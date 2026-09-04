import type { ReportBody, ReportDetail, ReportField } from '@/api/types';
import { hhmm } from './calendar';

export interface ReportExportContent {
  studentName: string;
  grade?: string | null;
  date: string;
  subject: string;
  startTime: string;
  fields: ReportField[];
  body: ReportBody;
}

type ClipboardWriter = Pick<Clipboard, 'writeText'>;
type PngRenderer = (node: HTMLElement, options: { cacheBust: boolean; pixelRatio: number }) => Promise<string>;

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
      startTime: hhmm(detail.startMin),
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
