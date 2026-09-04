import { describe, expect, it, vi } from 'vitest';
import { copyReportText, downloadReportPng, renderReportPng } from './report-export';

describe('리포트 PNG·본문 어댑터', () => {
  it('서버가 만든 본문을 바꾸지 않고 Clipboard API에 한 번 쓴다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await copyReportText('서버 5섹션 본문', { writeText });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith('서버 5섹션 본문');
  });

  it('다운로드와 발송이 같은 2배 PNG renderer를 쓴다', async () => {
    const renderer = vi.fn().mockResolvedValue('data:image/png;base64,report');
    const node = document.createElement('div');
    await expect(renderReportPng(node, renderer)).resolves.toBe('data:image/png;base64,report');
    expect(renderer).toHaveBeenCalledWith(node, { cacheBust: true, pixelRatio: 2 });
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
