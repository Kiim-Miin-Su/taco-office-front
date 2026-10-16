// @vitest-environment node
/** @file-guide
 * 목적: 설치된 Blob SDK의 실제 multipart 흐름과 API 인증 헤더의 전달 범위를 검증한다.
 * 책임/재사용: SDK는 실제 실행하고 HTTP만 메모리 응답으로 대체한다. 외부 저장소·자격·1GB 본문을 사용하지 않는다.
 * 검증/작업 지침: file-upload.test.ts · @vercel/blob 2.8.0
 */
import { afterEach, expect, it, vi } from 'vitest';
import { uploadPresigned } from '@vercel/blob/client';
import { getGlobalDispatcher, Headers, MockAgent, setGlobalDispatcher } from 'undici';

const originalDispatcher = getGlobalDispatcher();
let network: MockAgent | null = null;
afterEach(async () => {
  setGlobalDispatcher(originalDispatcher);
  await network?.close();
  network = null;
  vi.unstubAllEnvs();
});

it('실제 SDK는 서명 발급 API에만 ERP Bearer를 보내고 multipart 공급자 요청에는 보내지 않는다', async () => {
  vi.stubEnv('VERCEL_BLOB_API_URL', 'https://blob.example.test');
  network = new MockAgent();
  network.disableNetConnect();
  setGlobalDispatcher(network);
  const delegationToken = `${Buffer.from(JSON.stringify({ storeId: 'store_unit' })).toString('base64url')}.unit-signature`;
  const operations: string[] = [];
  const result = { url: 'https://unit.private.blob.vercel-storage.com/book.pdf', downloadUrl: 'https://unit.private.blob.vercel-storage.com/book.pdf?download=1',
    pathname: 'book.pdf', contentType: 'application/pdf', contentDisposition: 'attachment; filename="book.pdf"', etag: 'unit-etag' };
  let appCalls = 0;
  network.get('https://api.example.test').intercept({ path: '/files/book-pdf-presigned', method: 'POST' }).reply(200, (request) => {
    appCalls += 1;
    const headers = new Headers(request.headers);
    expect(headers.get('authorization')).toBe('Bearer unit-access');
    expect(JSON.parse(String(request.body))).toMatchObject({
      type: 'blob.generate-presigned-url', payload: { pathname: 'book.pdf', clientPayload: 'upload-id', multipart: true },
    });
    return JSON.stringify({ presignedUrlPayload: { delegationToken, signature: 'unit-signature', params: {} } });
  }, { headers: { 'content-type': 'application/json' } });
  network.get('https://blob.example.test').intercept({ path: /^\/mpu\?/, method: 'POST' }).reply(200, (request) => {
    const url = new URL(request.path, 'https://blob.example.test');
    const headers = new Headers(request.headers);
    expect(headers.has('authorization')).toBe(false);
    expect(url.searchParams.get('vercel-blob-delegation')).toBe(delegationToken);
    const action = headers.get('x-mpu-action');
    if (!action) {
      throw new Error('예상한 multipart 요청이 아닙니다.');
    }
    operations.push(action);
    if (action === 'create') {
      return JSON.stringify({ uploadId: 'unit-multipart', key: 'unit-key' });
    }
    if (action === 'upload') {
      return JSON.stringify({ etag: 'unit-part-etag' });
    }
    if (action === 'complete') {
      return JSON.stringify(result);
    }
    throw new Error('예상하지 않은 공급자 요청입니다.');
  }, { headers: { 'content-type': 'application/json' } }).times(3);
  const progress = vi.fn();
  const uploaded = await uploadPresigned('book.pdf', new Blob(['%PDF-1.7\n']), {
    access: 'private', contentType: 'application/pdf', multipart: true,
    handleUploadUrl: 'https://api.example.test/files/book-pdf-presigned', clientPayload: 'upload-id',
    headers: { Authorization: 'Bearer unit-access' }, onUploadProgress: progress,
  });
  expect(uploaded).toEqual(result);
  expect(operations).toEqual(['create', 'upload', 'complete']);
  expect(appCalls).toBe(1);
  network.assertNoPendingInterceptors();
  expect(progress).toHaveBeenCalled();
});
