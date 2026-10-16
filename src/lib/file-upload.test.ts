/** @file-guide
 * 목적: 브라우저 File→POST /files 입력 변환이 이름·MIME·바이트를 보존하는지 검증한다.
 * 책임/재사용: 실제 fileUploadBody만 호출하고 서버 종류/크기 규칙은 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { afterEach, expect, it, vi } from 'vitest';
import { api, setAccessToken } from '@/api/client';
import { bookPdfSelectionIssue, fileSelectionIssue, fileUploadBody, uploadBookPdf } from './file-upload';

const upload = vi.hoisted(() => vi.fn());
vi.mock('@vercel/blob/client', () => ({ uploadPresigned: upload }));
afterEach(() => { vi.restoreAllMocks(); upload.mockReset(); setAccessToken(null); });

it('파일 본문과 종류를 공용 base64 계약으로 바꾼다', async () => {
  const file = {
    name: '학생용.pdf', type: 'application/pdf',
    arrayBuffer: async () => new TextEncoder().encode('SE 교재').buffer,
  } as File;
  const body = await fileUploadBody(file, 'lib-se');
  expect(body).toMatchObject({ kind: 'lib-se', name: '학생용.pdf' });
  expect(body).not.toHaveProperty('mime');
  expect(new TextDecoder().decode(Uint8Array.from(atob(body.base64), (char) => char.charCodeAt(0)))).toBe('SE 교재');
});

it('교재 PDF는 파일당 정확히 1GB까지 선택하고 서버 합계 상한도 함께 검사한다', () => {
  const file = (size: number) => ({ name: '교재.pdf', size } as File);
  expect(bookPdfSelectionIssue([file(1_000_000_000), file(1_000_000_000)], 2_000_000_000)).toBeNull();
  expect(bookPdfSelectionIssue([file(1_000_000_001)], 2_000_000_000)).toContain('파일당 1GB');
  expect(bookPdfSelectionIssue([file(50_000_001)], 100_000_000, 50_000_000)).toContain('파일당 50MB');
  expect(bookPdfSelectionIssue([{ name: '교재.txt', size: 4 } as File], 2_000_000_000)).toContain('PDF 파일만');
  expect(bookPdfSelectionIssue([file(0)], 2_000_000_000)).toContain('비어 있는 PDF');
});

it('1GB File을 전체 읽기 없이 인증된 multipart SDK로 전달한다', async () => {
  setAccessToken('unit-access');
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { uploadId: 'upload-id', pathname: 'books/qa/upload.pdf', uploadUrl: 'https://unused.test/legacy-put' },
  } as never);
  const file = new File(['%PDF'], '교재.pdf', { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: 1_000_000_000 });
  const readWholeFile = vi.fn();
  Object.defineProperty(file, 'arrayBuffer', { value: readWholeFile });
  const controller = new AbortController();
  const progress = vi.fn();
  upload.mockResolvedValue(undefined);
  await expect(uploadBookPdf(file, 'lib-se', { abortSignal: controller.signal, onUploadProgress: progress })).resolves.toBe('upload-id');
  expect(post).toHaveBeenCalledWith('/files/book-pdf-upload', { kind: 'lib-se', name: '교재.pdf', bytes: 1_000_000_000 }, { signal: controller.signal });
  expect(upload).toHaveBeenCalledWith('books/qa/upload.pdf', file, {
    access: 'private', contentType: 'application/pdf', multipart: true,
    handleUploadUrl: '/api/v1/files/book-pdf-presigned', clientPayload: 'upload-id',
    headers: { Authorization: 'Bearer unit-access' }, abortSignal: controller.signal, onUploadProgress: progress,
  });
  expect(readWholeFile).not.toHaveBeenCalled();
});

it('1GB를 넘으면 업로드 의도와 SDK를 호출하지 않는다', async () => {
  const post = vi.spyOn(api, 'post');
  await expect(uploadBookPdf({ name: '교재.pdf', size: 1_000_000_001 } as File, 'lib-te')).rejects.toMatchObject({ code: 'BOOK_PDF_INVALID' });
  expect(post).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

it('취소는 공개 문구로 돌려주고 업로드 ID를 저장 성공으로 반환하지 않는다', async () => {
  setAccessToken('unit-access');
  vi.spyOn(api, 'post').mockResolvedValue({ data: { uploadId: 'upload-id', pathname: 'books/qa/upload.pdf' } } as never);
  const controller = new AbortController();
  upload.mockImplementation(async () => { controller.abort(); throw new Error('signed-url-private'); });
  await expect(uploadBookPdf({ name: '교재.pdf', size: 4 } as File, 'lib-se', { abortSignal: controller.signal }))
    .rejects.toMatchObject({ code: 'BOOK_PDF_UPLOAD_CANCELED', message: 'PDF 업로드를 취소했습니다.' });
});

it('SDK가 서명 발급 응답을 기다리는 중이어도 취소하면 UI의 전송 대기를 즉시 끝낸다', async () => {
  setAccessToken('unit-access');
  vi.spyOn(api, 'post').mockResolvedValue({ data: { uploadId: 'upload-id', pathname: 'books/qa/upload.pdf' } } as never);
  const controller = new AbortController();
  let started: () => void = () => { throw new Error('SDK가 시작되지 않았습니다.'); };
  const ready = new Promise<void>((resolve) => { started = resolve; });
  upload.mockImplementation(() => { started(); return new Promise(() => undefined); });
  const pending = uploadBookPdf({ name: '교재.pdf', size: 4 } as File, 'lib-se', { abortSignal: controller.signal });
  const result = expect(pending).rejects.toMatchObject({ code: 'BOOK_PDF_UPLOAD_CANCELED' });
  await ready;
  controller.abort();
  await result;
});

it('SDK 서명 발급 실패는 로그인·권한 안내로 바꾸고 세션 변경 뒤 성공도 버린다', async () => {
  setAccessToken('unit-access');
  vi.spyOn(api, 'post').mockResolvedValue({ data: { uploadId: 'upload-id', pathname: 'books/qa/upload.pdf' } } as never);
  upload.mockRejectedValueOnce(new Error('Vercel Blob: Failed to retrieve the presigned URL'));
  await expect(uploadBookPdf({ name: '교재.pdf', size: 4 } as File, 'lib-se'))
    .rejects.toMatchObject({ code: 'BOOK_PDF_UPLOAD_AUTHORIZATION_FAILED', message: expect.stringMatching(/로그인 상태.*업로드 설정/) });
  upload.mockImplementation(async () => { setAccessToken('another-session'); });
  await expect(uploadBookPdf({ name: '교재.pdf', size: 4 } as File, 'lib-se')).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
});

it('판 파일 합계는 서버가 내려준 상한으로 선택 즉시 검증한다', () => {
  const file = (size: number) => ({ size } as File);
  expect(fileSelectionIssue([file(1_500_000), file(1_500_000)], 3_000_000)).toBeNull();
  expect(fileSelectionIssue([file(2_000_000), file(2_000_000)], 3_000_000)).toContain('3MB');
});
