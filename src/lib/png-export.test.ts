/** @file-guide
 * 목적: 리포트·자료 전달이 공유하는 PNG 배율과 다운로드 파일명 계약을 검증한다.
 * 책임/재사용: 실제 공용 exporter만 호출하며 DOM 내용은 최소 fixture로 둔다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { expect, it, vi } from 'vitest';
import { downloadElementPng, renderElementPng } from './png-export';

it('모든 화면을 cache-bust·2배 해상도로 렌더한다', async () => {
  const renderer = vi.fn().mockResolvedValue('data:image/png;base64,eA==');
  await expect(renderElementPng(document.createElement('div'), renderer)).resolves.toContain('image/png');
  expect(renderer).toHaveBeenCalledWith(expect.any(HTMLElement), { cacheBust: true, pixelRatio: 2 });
});

it('서버/도메인이 정한 파일명으로 다운로드한다', async () => {
  const renderer = vi.fn().mockResolvedValue('data:image/png;base64,eA==');
  const created = document.createElement.bind(document);
  let anchor: HTMLAnchorElement | null = null;
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const node = created(tag);
    if (tag === 'a') { anchor = node as HTMLAnchorElement; vi.spyOn(anchor, 'click').mockImplementation(() => undefined); }
    return node;
  }) as typeof document.createElement);
  await downloadElementPng(document.createElement('div'), '자료전달-1.png', renderer);
  expect(anchor).toMatchObject({ download: '자료전달-1.png', href: 'data:image/png;base64,eA==' });
  vi.restoreAllMocks();
});
