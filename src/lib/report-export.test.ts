import { describe, expect, it, vi } from 'vitest';
import type { ReportField } from '@/api/types';
import { copyReportText, downloadReportPng, reportPlainText } from './report-export';

const fields: ReportField[] = [
  { key: 'content', label: '③ 수업 내용', hint: '', min: 1, max: 2000 },
  { key: 'progress', label: '④ 진도', hint: '', min: 1, max: 2000 },
  { key: 'homework', label: '⑤ 과제', hint: '', min: 1, max: 2000 },
];

const content = {
  studentName: '김민준',
  grade: '고2',
  date: '2026-08-27',
  subject: '수학',
  startTime: '16:30',
  fields,
  body: { content: '미분', progress: '42p', homework: '43p' },
};

describe('리포트 PNG·본문 어댑터', () => {
  it('미리보기와 같은 5개 섹션 순서로 본문을 만든다', () => {
    expect(reportPlainText(content)).toBe([
      '① 학생: 김민준 · 고2',
      '② 수업: 2026-08-27 · 수학 · 16:30',
      '③ 수업 내용\n미분',
      '④ 진도\n42p',
      '⑤ 과제\n43p',
    ].join('\n\n'));
  });

  it('같은 본문을 Clipboard API에 한 번 쓴다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await copyReportText(content, { writeText });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(reportPlainText(content));
  });

  it('서버 파일명을 바꾸지 않고 2배 PNG를 내려받는다', async () => {
    const renderer = vi.fn().mockResolvedValue('data:image/png;base64,report');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const append = vi.spyOn(document, 'createElement');
    const node = document.createElement('div');

    await downloadReportPng(node, 'server-name.png', renderer);

    expect(renderer).toHaveBeenCalledWith(node, { cacheBust: true, pixelRatio: 2 });
    const link = append.mock.results.find((result) => result.value instanceof HTMLAnchorElement)?.value;
    expect(link).toMatchObject({ download: 'server-name.png', href: 'data:image/png;base64,report' });
    expect(click).toHaveBeenCalledOnce();
  });
});
