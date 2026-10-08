/** @file-guide
 * 목적: report-export.ts — ReportExportContent, reportTimeLabel, reportExportContent, copyReportText, renderReportPng 등 (util)
 * 책임/재사용: 현재 lib 계층의 순수 계산/표시 방어를 우선 재사용한다. UI·네트워크·DB 부수효과와 서버 업무 권위를 섞지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReportDetail, ReportStructuredBody } from '@/api/types';
import { hhmm } from './calendar';
import { downloadElementPng, renderElementPng, type PngRenderer } from './png-export';

export interface ReportExportContent {
  studentName: string;
  grade?: string | null;
  date: string;
  subject: string;
  timeLabel: string;
  fields: Array<{ key: string; label: string }>;
  body: Record<string, string>;
}

type ClipboardWriter = Pick<Clipboard, 'writeText'>;
/** 편집기·발송 큐·PNG가 같은 파생 시간 계약을 표시한다. null은 가짜 00:00으로 변환하지 않는다. */
export function reportTimeLabel(report: Pick<ReportDetail, 'startMin' | 'endMin'>): string {
  return report.startMin == null || report.endMin == null
    ? '시간 미정' : `${hhmm(report.startMin)}–${hhmm(report.endMin)}`;
}

const DEVELOPMENT_LABELS = {
  language: '언어 발달', math: '수학 발달', emotional: '정서적 발달', physical: '신체 발달',
} as const;
const DEVELOPMENT_LEVELS = { needs: '보완 필요', usual: '보통', excellent: '우수' } as const;

function materialText(material: Extract<ReportStructuredBody, { kind: 'individual' }>['progress'], includeAmount: boolean): string {
  if (!material) return '—';
  const book = `${material.title ?? material.code ?? `교재 #${material.issueId}`}${material.edition ? ` · ${material.edition}` : ''}`;
  return `${book} · p.${material.fromPage}–${material.toPage}${includeAmount && material.amount ? ` · ${material.amount}` : ''}`;
}

/** 저장된 구조화 snapshot을 학부모 PNG 칸으로 바꾼다. 복사·발송 본문은 계속 서버 descriptor가 정본이다. */
function structuredPreview(body: ReportStructuredBody, studentId: number): Pick<ReportExportContent, 'fields' | 'body'> {
  if (body.kind === 'individual' || body.kind === 'group') {
    const rows = [
      { key: 'content', label: body.kind === 'group' ? '③ 공통 수업 사항' : '③ 수업 내용', value: body.content },
      { key: 'progress', label: '④ 진도 페이지', value: materialText(body.progress, false) },
      { key: 'homework', label: '⑤ 숙제 페이지', value: materialText(body.homework, true) },
    ];
    if (body.kind === 'group') rows.push({
      key: 'studentComment', label: '⑥ 학생별 의견',
      value: body.students.find((student) => student.studentId === studentId)?.comment ?? '—',
    });
    return { fields: rows.map(({ key, label }) => ({ key, label })), body: Object.fromEntries(rows.map(({ key, value }) => [key, value])) };
  }
  if (body.kind === 'kinder' || body.kind === 'mock') {
    const rows = Object.entries(DEVELOPMENT_LABELS).map(([key, label], index) => {
      const value = body.development[key as keyof typeof DEVELOPMENT_LABELS];
      const level = value.level ? DEVELOPMENT_LEVELS[value.level] : '미평가';
      return { key, label: `${index + 3}. ${label} · ${level}`, value: value.observation };
    });
    rows.push({ key: 'overall', label: '⑦ 종합 소견', value: body.overall });
    return { fields: rows.map(({ key, label }) => ({ key, label })), body: Object.fromEntries(rows.map(({ key, value }) => [key, value])) };
  }
  const student = body.students.find((row) => row.studentId === studentId);
  const interview = student
    ? `유창성 ${student.interview.fluency ?? '—'} · 단어 다양성 ${student.interview.vocabulary ?? '—'} · 어법 ${student.interview.grammar ?? '—'} · 평균 ${student.interview.average ?? '—'}`
    : '—';
  const rows = [
    { key: 'math', label: '③ Math', value: student ? `${student.mathScore ?? '—'}점 · ${student.mathMistakes || '—'}` : '—' },
    { key: 'english', label: '④ English', value: student ? `${student.englishScore ?? '—'}점 · ${student.englishMistakes || '—'}` : '—' },
    { key: 'interview', label: '⑤ Interview', value: interview },
    { key: 'totalAverage', label: '⑥ 전체 평균', value: student?.totalAverage === null || student?.totalAverage === undefined ? '—' : String(student.totalAverage) },
    { key: 'overall', label: '⑦ 종합 소견', value: student?.overall ?? '—' },
  ];
  return { fields: rows.map(({ key, label }) => ({ key, label })), body: Object.fromEntries(rows.map(({ key, value }) => [key, value])) };
}

/** 상세·큐·PNG·복사가 같은 학생 선택 어댑터를 쓴다. 본문 문자열은 서버 descriptor가 소유한다. */
export function reportExportContent(detail: ReportDetail, studentId: number):
  (Pick<ReportDetail['exportFiles'][number], 'fileName' | 'plainText' | 'revision'> & { content: ReportExportContent }) | null {
  const file = detail.exportFiles.find((item) => item.studentId === studentId);
  const student = detail.students.find((item) => item.id === studentId);
  if (!file || !student) return null;
  const preview = detail.structuredBody
    ? structuredPreview(detail.structuredBody, studentId)
    : { fields: detail.fields, body: detail.body };
  return {
    fileName: file.fileName,
    plainText: file.plainText,
    revision: file.revision,
    content: {
      studentName: student.name,
      grade: student.grade,
      date: detail.date,
      subject: detail.subjectName,
      timeLabel: reportTimeLabel(detail),
      fields: preview.fields,
      body: preview.body,
    },
  };
}

/**
 * 여러 리포트를 한 글로 이을 때의 구분선 — PDF G-70 「여러 건은 구분선으로 분리」.
 * 서버가 학부모에게 보내는 하루 묶음(`RSEND.body` · reports.service `deliveryBody`)과 주간 묶음(weekly-bundle `DIVIDER`)이
 * 리포트를 잇는 줄과 **같은 글자**다 — 화면에서 복사한 글과 실제로 나간 글이 갈리지 않게 한다.
 */
export const REPORT_TEXT_DIVIDER = '\n\n────────\n\n';

/** 서버 descriptor 의 본문을 수업 차례 그대로 잇는다 — 한 건이면 구분선이 없다 */
export function joinReportTexts(texts: readonly string[]): string {
  return texts.join(REPORT_TEXT_DIVIDER);
}

export async function copyReportText(
  plainText: string,
  clipboard: ClipboardWriter = navigator.clipboard,
): Promise<void> {
  await clipboard.writeText(plainText);
}

/** 다운로드와 발송이 동일한 2배 PNG renderer를 공유한다. */
export async function renderReportPng(node: HTMLElement, renderer?: PngRenderer): Promise<string> {
  return renderElementPng(node, renderer);
}

/** html-to-image는 버튼을 누를 때만 불러오고, 출력 배율은 D-R33의 2배로 고정한다. */
export async function downloadReportPng(
  node: HTMLElement,
  fileName: string,
  renderer?: PngRenderer,
): Promise<void> {
  await downloadElementPng(node, fileName, renderer);
}
