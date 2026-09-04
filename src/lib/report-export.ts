import type { ReportBody, ReportField } from '@/api/types';

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

/** 미리보기와 클립보드가 같은 5개 섹션·순서를 읽는다. */
export function reportPlainText(content: ReportExportContent): string {
  return [
    `① 학생: ${content.studentName}${content.grade ? ` · ${content.grade}` : ''}`,
    `② 수업: ${content.date} · ${content.subject} · ${content.startTime}`,
    ...content.fields.map((field) => `${field.label}\n${content.body[field.key] || '—'}`),
  ].join('\n\n');
}

export async function copyReportText(
  content: ReportExportContent,
  clipboard: ClipboardWriter = navigator.clipboard,
): Promise<void> {
  await clipboard.writeText(reportPlainText(content));
}

/** html-to-image는 버튼을 누를 때만 불러오고, 출력 배율은 D-R33의 2배로 고정한다. */
export async function downloadReportPng(
  node: HTMLElement,
  fileName: string,
  renderer?: PngRenderer,
): Promise<void> {
  const toPng = renderer ?? (await import('html-to-image')).toPng;
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}
