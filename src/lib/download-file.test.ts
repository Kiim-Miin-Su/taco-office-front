/** @file-guide
 * 목적: 인증 파일 다운로드의 서버 파일명 해석 경계를 검증한다.
 * 책임/재사용: 실제 공용 함수만 호출하며 브라우저 네트워크·권한 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/api/client';
import { downloadFile, downloadName } from './download-file';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('RFC 5987 파일명을 한글로 복원하고 잘못된 값은 안전한 이름으로 내린다', () => {
  expect(downloadName("attachment; filename*=UTF-8''%EA%B5%90%EC%9E%AC.pdf", 'file')).toBe('교재.pdf');
  expect(downloadName("attachment; filename*=UTF-8''%E0%A4%A", 'file.pdf')).toBe('file.pdf');
  expect(downloadName(undefined, 'file.pdf')).toBe('file.pdf');
});

it('구형 Back에 새 대상 경로가 없으면 기존 인증 파일 경로로 내려받는다', async () => {
  vi.useFakeTimers();
  const read = vi.spyOn(api, 'get')
    .mockRejectedValueOnce(new ApiError('NOT_FOUND', '경로 없음', 404))
    .mockResolvedValueOnce({ data: new Blob(['PDF']), headers: {} } as never);
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: vi.fn(() => 'blob:download'),
    revokeObjectURL: vi.fn(),
  }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  await downloadFile(12, '교재.pdf');
  expect(read).toHaveBeenNthCalledWith(1, '/files/12/download-target');
  expect(read).toHaveBeenNthCalledWith(2, '/files/12', { responseType: 'blob' });
  expect(click).toHaveBeenCalledOnce();
});

it('private Blob 파일은 서명된 첨부 링크로 직접 받고 본문을 JS 메모리에 읽지 않는다', async () => {
  const signedUrl = 'https://qa.private.blob.vercel-storage.com/private-pdf?download=1&vercel-blob-signature=qa&vercel-blob-delegation=qa';
  const read = vi.spyOn(api, 'get').mockResolvedValueOnce({
    data: { storage: 'blob', url: signedUrl, name: '교재.pdf' },
  } as never);
  const fetchFile = vi.fn();
  vi.stubGlobal('fetch', fetchFile);
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
  let downloadedName: string | undefined;
  let downloadedUrl: string | undefined;
  let connectedAtClick = false;
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadedName = this.download;
    downloadedUrl = this.href;
    connectedAtClick = this.isConnected;
    expect(this.rel).toBe('noopener noreferrer');
    expect(this.referrerPolicy).toBe('no-referrer');
  });

  await downloadFile(12, 'fallback.pdf');

  expect(read).toHaveBeenCalledOnce();
  expect(fetchFile).not.toHaveBeenCalled();
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(click).toHaveBeenCalledOnce();
  expect(connectedAtClick).toBe(true);
  expect(downloadedName).toBe('교재.pdf');
  expect(downloadedUrl).toBe(signedUrl);
  expect(document.querySelector('a[download]')).toBeNull();
  expect(revokeObjectURL).not.toHaveBeenCalled();
});

it('서버가 거절한 파일은 브라우저 다운로드로 넘기지 않는다', async () => {
  const denied = new ApiError('FILE_FORBIDDEN', '파일 권한이 없습니다.', 403);
  vi.spyOn(api, 'get').mockRejectedValueOnce(denied);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
  await expect(downloadFile(12, '교재.pdf')).rejects.toBe(denied);
  expect(click).not.toHaveBeenCalled();
});

it.each(['javascript:alert(1)', 'https://outside.test/file.pdf', 'https://qa.private.blob.vercel-storage.com/unsigned.pdf'])
('비공개 HTTPS 서명 파일이 아닌 주소는 브라우저로 열지 않는다: %s', async (url) => {
  vi.spyOn(api, 'get').mockResolvedValueOnce({ data: { storage: 'blob', url, name: '교재.pdf' } } as never);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
  await expect(downloadFile(12, '교재.pdf')).rejects.toMatchObject({ code: 'FILE_DOWNLOAD_URL_INVALID' });
  expect(click).not.toHaveBeenCalled();
});
