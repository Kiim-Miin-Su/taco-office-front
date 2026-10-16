/** @file-guide
 * 목적: 서버가 허용한 Neon·private Blob 파일을 받아 브라우저 다운로드로 넘긴다.
 * 책임/재사용: URL·응답 헤더·Blob 수명만 소유하며 파일 권한과 MIME 판정은 서버가 결정한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { ApiError, api } from '@/api/client';
import type { FileDownloadTarget } from '@/api/types';

export function downloadName(disposition: string | undefined, fallback: string): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1];
  if (!encoded) return fallback;
  try { return decodeURIComponent(encoded); } catch { return fallback; }
}

/** 일반 링크는 Bearer 헤더를 싣지 못한다. API 클라이언트 하나를 통해 받은 뒤 임시 URL만 만든다. */
export async function downloadFile(id: number, fallbackName: string): Promise<void> {
  let target: FileDownloadTarget;
  try {
    target = (await api.get<FileDownloadTarget>(`/files/${id}/download-target`)).data;
  } catch (cause) {
    // 독립 배포 중 구형 Back은 새 경로를 모른다. 기존 API에도 같은 서버 권한 검사가 있다.
    if (!(cause instanceof ApiError) || cause.status !== 404) {
      throw cause;
    }
    target = { storage: 'database', name: fallbackName };
  }
  let name = target.name || fallbackName;
  if (target.storage === 'blob') {
    if (!target.url) {
      throw new ApiError('FILE_DOWNLOAD_URL_MISSING', '다운로드 주소가 없습니다', 502);
    }
    try {
      const remoteUrl = new URL(target.url);
      if (remoteUrl.protocol !== 'https:' || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(remoteUrl.hostname)
        || remoteUrl.username || remoteUrl.password || !remoteUrl.searchParams.has('vercel-blob-signature')
        || !remoteUrl.searchParams.has('vercel-blob-delegation')) {
        throw new Error('허용된 비공개 파일 주소가 아닙니다.');
      }
    } catch {
      throw new ApiError('FILE_DOWNLOAD_URL_INVALID', '다운로드 주소를 확인할 수 없습니다.', 502);
    }
    const link = document.createElement('a');
    try {
      // 서버가 download=1을 붙인 2분 URL로 브라우저가 직접 받는다. 1GB 본문을 JS 메모리에 모으지 않는다.
      link.href = target.url;
      link.download = name;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
      link.hidden = true;
      document.body.append(link);
      link.click();
    } finally {
      link.remove();
    }
    // 다른 origin에서는 저장 이름을 Blob 응답의 Content-Disposition이 결정한다.
    return;
  }
  const response = await api.get<Blob>(`/files/${id}`, { responseType: 'blob' });
  name = downloadName(response.headers['content-disposition'], name);
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // 브라우저가 다운로드 자원을 인수하기 전에 URL을 해제하면 클릭이 조용히 취소될 수 있다.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
