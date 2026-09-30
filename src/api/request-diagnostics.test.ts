/** @file-guide
 * 목적: request-diagnostics.test.ts — 공용 브라우저 HTTP 진단의 비밀값 차단 회귀
 * 책임/재사용: 실제 공용 진단 helper를 호출하여 경로·필드명·오류코드 allowlist와 best-effort 경계를 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginRequestDiagnostic, logRequestDispatch, logRequestOutcome } from './request-diagnostics';

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const request = (url: string, body?: unknown) => beginRequestDiagnostic({ method: 'post', url, body });

describe('안전한 요청 metadata', () => {
  it.each([
    ['/schedule/123?name=SECRET_NAME#SECRET_HASH', '/schedule/:value'],
    ['https://SECRET_USER:SECRET_PASSWORD@SECRET_HOST/api/v1/files/SECRET_FILE.pdf?signature=SECRET_SIGNATURE', '/files/:value'],
    ['/students/SECRET_EMAIL@example.com', '/students/:value'],
    ['/students/%ED%99%8D%EA%B8%B8%EB%8F%99', '/students/:value'],
    ['/SECRET_ROOT/SECRET_FILE', '[redacted-route]'],
    ['/schedule/../../../SECRET_ROOT/SECRET_FILE', '[redacted-route]'],
  ])('경로 값을 노출하지 않는다: %s', (url, expected) => {
    const diagnostic = request(url);
    logRequestDispatch({ diagnostic });
    expect(console.info).toHaveBeenCalledWith('[TACO] api.request', expect.objectContaining({ route: expected }));
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('SECRET');
  });

  it('강사 목록 경로와 신규 스케줄 검증 코드를 값 없이 구별한다', () => {
    const diagnostic = request('/drawer/staff-directory?name=SECRET_NAME', { status: 'SECRET_STATUS' });
    logRequestDispatch({ diagnostic });
    logRequestOutcome({ diagnostic, outcome: 'error', status: 400, code: 'MODE_ROOM_ONLINE' });
    expect(vi.mocked(console.info).mock.calls[0]?.[1]).toMatchObject({ route: '/drawer/staff-directory' });
    expect(vi.mocked(console.warn).mock.calls[0]?.[1]).toMatchObject({
      route: '/drawer/staff-directory', status: 400, code: 'MODE_ROOM_ONLINE',
    });
    expect(JSON.stringify([...vi.mocked(console.info).mock.calls, ...vi.mocked(console.warn).mock.calls])).not.toContain('SECRET');
  });

  it('허용 필드명/타입만 보고 임의 key·중첩 객체·getter·toJSON을 읽지 않는다', () => {
    const getter = vi.fn(() => { throw new Error('should not read'); });
    const body = { title: 'SECRET_TITLE', students: [{ email: 'SECRET_EMAIL' }],
      'SECRET_DYNAMIC_KEY@example.com': 'SECRET_VALUE', '홍길동': 'SECRET_VALUE',
      toJSON: getter };
    Object.defineProperty(body, 'password', { enumerable: true, get: getter });
    const diagnostic = request('/schedule', body);
    logRequestDispatch({ diagnostic });
    const [, details] = vi.mocked(console.info).mock.calls[0]!;
    expect(details).toMatchObject({ bodyType: 'object', fields: 'password:accessor,students:array,title:string', otherFields: 3 });
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(details)).not.toMatch(/SECRET|홍길동/);
  });

  it('FormData는 항목·파일명·파일내용을 읽지 않는다', () => {
    const body = new FormData();
    body.append('SECRET_FORM_KEY', new Blob(['SECRET_FILE_CONTENT']), 'SECRET_FILE_NAME.pdf');
    const entries = vi.spyOn(body, 'entries').mockImplementation(() => { throw new Error('must not enumerate'); });
    const diagnostic = request('/files', body);
    logRequestDispatch({ diagnostic });
    expect(console.info).toHaveBeenCalledWith('[TACO] api.request', expect.objectContaining({ bodyType: 'multipart', fields: '', otherFields: 0 }));
    expect(entries).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('SECRET');
  });

  it('직렬화된 JSON이나 응답 배열을 진단용으로 파싱/순회하지 않는다', () => {
    const diagnostic = request('/auth/login', '{"password":"SECRET_PASSWORD"}');
    logRequestDispatch({ diagnostic });
    logRequestOutcome({ diagnostic, outcome: 'response', status: 200, body: [{ email: 'SECRET_EMAIL' }] });
    expect(vi.mocked(console.info).mock.calls[0]?.[1]).toMatchObject({ bodyType: 'string', fields: '' });
    expect(vi.mocked(console.info).mock.calls[1]?.[1]).toMatchObject({ bodyType: 'array', fields: '' });
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('SECRET');
  });

  it('payload의 proxy introspection 실패도 진단이 전송을 막지 않는다', () => {
    const body = new Proxy({}, { getPrototypeOf: () => { throw new Error('SECRET_ERROR'); } });
    expect(() => logRequestDispatch({ diagnostic: request('/schedule', body) })).not.toThrow();
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('SECRET');
  });

  it('SSR에서는 로그를 쓰지 않는다', () => {
    vi.stubGlobal('window', undefined);
    const diagnostic = request('/schedule', { title: 'SECRET' });
    logRequestDispatch({ diagnostic });
    logRequestOutcome({ diagnostic, outcome: 'error', status: 500, code: 'INTERNAL' });
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('재시도는 처음의 안전한 body shape를 유지하고 값은 보유하지 않는다', () => {
    const first = request('/schedule', { title: 'SECRET_TITLE' });
    const next = beginRequestDiagnostic({ method: 'post', url: '/schedule', body: '{"title":"SECRET_TITLE"}', previous: first });
    expect(next.requestId).toBe(first.requestId);
    expect(next.attempt).toBe(2);
    logRequestDispatch({ diagnostic: next });
    expect(vi.mocked(console.info).mock.calls[0]?.[1]).toMatchObject({ fields: 'title:string' });
    expect(JSON.stringify(next)).not.toContain('SECRET');
  });
});
