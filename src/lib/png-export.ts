/** @file-guide
 * 목적: 화면의 특정 DOM 노드를 동일한 배율·다운로드 규칙으로 PNG 저장한다.
 * 책임/재사용: html-to-image 로딩과 파일 다운로드만 소유하며 리포트·교재 같은 도메인 내용을 알지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

export type PngRenderer = (
  node: HTMLElement,
  options: { cacheBust: boolean; pixelRatio: number },
) => Promise<string>;

/** 버튼을 눌렀을 때만 renderer를 불러오고 모든 내보내기를 2배 해상도로 통일한다. */
export async function renderElementPng(node: HTMLElement, renderer?: PngRenderer): Promise<string> {
  const toPng = renderer ?? (await import('html-to-image')).toPng;
  return toPng(node, { cacheBust: true, pixelRatio: 2 });
}

export async function downloadElementPng(
  node: HTMLElement,
  fileName: string,
  renderer?: PngRenderer,
): Promise<void> {
  const dataUrl = await renderElementPng(node, renderer);
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}
