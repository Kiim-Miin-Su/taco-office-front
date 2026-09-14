/** @file-guide
 * 목적: 인증이 필요한 Neon 파일을 Axios 공용 헤더로 받아 브라우저 다운로드로 넘긴다.
 * 책임/재사용: URL·응답 헤더·Blob 수명만 소유하며 파일 권한과 MIME 판정은 서버가 결정한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { api } from '@/api/client';

export function downloadName(disposition: string | undefined, fallback: string): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1];
  if (!encoded) return fallback;
  try { return decodeURIComponent(encoded); } catch { return fallback; }
}

/** 일반 링크는 Bearer 헤더를 싣지 못한다. API 클라이언트 하나를 통해 받은 뒤 임시 URL만 만든다. */
export async function downloadFile(id: number, fallbackName: string): Promise<void> {
  const response = await api.get<Blob>(`/files/${id}`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName(response.headers['content-disposition'], fallbackName);
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
