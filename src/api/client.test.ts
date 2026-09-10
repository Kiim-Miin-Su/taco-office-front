/** @file-guide
 * 목적: client.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { AxiosError, CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, apiMessage, setAccessToken } from './client';

const originalAdapter = api.defaults.adapter;
const response = (config: InternalAxiosRequestConfig, data: unknown, status = 200) => ({
  config, data, status, statusText: String(status), headers: {},
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setAccessToken(null);
});

describe('공용 API 오류 경계', () => {
  it('20초 제한은 유지하면서 timeout과 브라우저 abort를 구분한다', async () => {
    api.defaults.adapter = async (config) => {
      expect(config.timeout).toBe(20_000);
      expect(config.transitional?.clarifyTimeoutError).toBe(true);
      return response(config, { ok: true });
    };
    expect((await api.get('/health')).data).toEqual({ ok: true });
  });

  it.each([
    [AxiosError.ETIMEDOUT, 'TIMEOUT', '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'],
    [AxiosError.ECONNABORTED, 'ABORTED', '요청이 중단되었습니다. 다시 시도해 주세요.'],
    [AxiosError.ERR_CANCELED, 'CANCELED', '요청이 취소되었습니다.'],
    [AxiosError.ERR_NETWORK, 'NETWORK', '서버에 닿지 못했습니다'],
    [AxiosError.ERR_BAD_OPTION_VALUE, 'REQUEST_FAILED', '요청을 보내지 못했습니다.'],
  ])('%s는 %s로 정규화하고 요청 내용은 노출하지 않는다', async (source, code, message) => {
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      throw new AxiosError('민감한 원본 오류', source, config);
    });
    api.defaults.adapter = adapter;

    const error: unknown = await api.post('/auth/login', { password: 'test-secret' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code, message, status: 0 });
    expect(apiMessage(error)).toBe(message);
    expect(error).not.toHaveProperty('config');
    expect(error).not.toHaveProperty('request');
    expect(JSON.stringify(error)).not.toContain('test-secret');
    expect(adapter).toHaveBeenCalledOnce(); // POST를 자동 재전송하지 않는다.
  });

  it('AbortSignal 취소도 네트워크 장애로 오인하지 않는다', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = vi.fn<AxiosAdapter>(async (config) => response(config, {}));
    api.defaults.adapter = adapter;

    await expect(api.get('/health', { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'CANCELED', status: 0 });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('진행 중 명시적 취소를 공용 오류로 표시한다', async () => {
    api.defaults.adapter = async (config) => { throw new CanceledError('cancel', config); };
    await expect(api.get('/health')).rejects.toMatchObject({ code: 'CANCELED', status: 0 });
  });

  it.each([400, 403, 409, 503])('HTTP %s의 서버 코드/문구 계약을 보존한다', async (status) => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('fallback', AxiosError.ERR_BAD_RESPONSE, config, undefined,
        response(config, { code: 'SERVER_CODE', message: '서버에서 판정한 오류' }, status));
    };
    await expect(api.get('/consulting')).rejects.toMatchObject({
      code: 'SERVER_CODE', message: '서버에서 판정한 오류', status,
    });
  });

  it('동시 보호 요청의 401은 기존처럼 한 번만 갱신한 뒤 재전송한다', async () => {
    const counts = new Map<string, number>();
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      const url = config.url!;
      const count = (counts.get(url) ?? 0) + 1;
      counts.set(url, count);
      if (url === '/auth/refresh') return response(config, { accessToken: 'renewed' });
      if (count === 1) {
        throw new AxiosError('unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined,
          response(config, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401));
      }
      expect(config.headers.Authorization).toBe('Bearer renewed');
      return response(config, { ok: true });
    });
    api.defaults.adapter = adapter;

    const results = await Promise.all([api.get('/consulting'), api.get('/meta')]);
    expect(results.map((r) => r.data)).toEqual([{ ok: true }, { ok: true }]);
    expect(counts.get('/auth/refresh')).toBe(1);
    expect(counts.get('/consulting')).toBe(2);
    expect(counts.get('/meta')).toBe(2);
  });

  it('refresh 자체의 401을 반복하지 않는다', async () => {
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      throw new AxiosError('unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined,
        response(config, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401));
    });
    api.defaults.adapter = adapter;
    await expect(api.post('/auth/refresh')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(adapter).toHaveBeenCalledOnce();
  });
});
