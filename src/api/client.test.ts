/** @file-guide
 * 목적: client.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { AxiosError, CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, apiMessage, setAccessToken, onSessionRecheck } from './client';

const originalAdapter = api.defaults.adapter;
const response = (config: InternalAxiosRequestConfig, data: unknown, status = 200) => ({
  config, data, status, statusText: String(status), headers: {},
});

/** 지연 응답 순서를 명시하며 sleep 없이 로그인/로그아웃과 경합시킨다. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
const unauthorized = (config: InternalAxiosRequestConfig) => new AxiosError(
  'unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined,
  response(config, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' }, 401),
);

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setAccessToken(null);
});

describe('공용 API 오류 경계', () => {
  it.each(['/ops', '/auth/me'])('갱신 뒤 성공한 %s만 Me 재확인 신호를 보낸다(Me 재귀 제외)', async (url) => {
    setAccessToken('old');
    const listener = vi.fn();
    const unsubscribe = onSessionRecheck(listener);
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') return response(config, { accessToken: 'new' });
      if (config.headers.Authorization === 'Bearer old') throw unauthorized(config);
      return response(config, {});
    };
    try {
      await api.get(url);
      expect(listener).toHaveBeenCalledTimes(url === '/auth/me' ? 0 : 1);
    } finally { unsubscribe(); }
  });

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

  it.each(['/auth/login', '/auth/logout'])('%s의 401은 보호 요청처럼 갱신/재전송하지 않는다', async (url) => {
    const adapter = vi.fn<AxiosAdapter>(async (config) => { throw unauthorized(config); });
    api.defaults.adapter = adapter;
    await expect(api.post(url)).rejects.toMatchObject({ status: 401 });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('토큰 제거 후 요청에 남은 Authorization을 재사용하지 않는다', async () => {
    setAccessToken(null);
    api.defaults.adapter = async (config) => {
      expect(config.headers.Authorization).toBeUndefined();
      return response(config, {});
    };
    await api.get('/meta', { headers: { Authorization: 'Bearer discarded' } });
  });

  it.each(['logout', 'new login', 'new login + failed refresh'] as const)(
    '늦은 refresh가 현재 세션을 덮어쓰거나 옛 요청을 재전송하지 않는다: %s', async (mode) => {
      const started = deferred(), release = deferred();
      setAccessToken('old-session');
      let protectedCalls = 0;
      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/refresh') {
          started.resolve(); await release.promise;
          if (mode === 'new login + failed refresh') throw unauthorized(config);
          return response(config, { accessToken: 'late-old-refresh' });
        }
        if (config.url === '/meta') { if (++protectedCalls === 1) throw unauthorized(config); }
        return response(config, { authorization: config.headers.Authorization ?? null });
      };
      const pending = api.get('/meta').catch((error: unknown) => error);
      await started.promise;
      setAccessToken(mode === 'logout' ? null : 'new-session');
      release.resolve();
      expect(await pending).toMatchObject({ code: 'SESSION_CHANGED', status: 0 });
      expect(protectedCalls).toBe(1);
      expect((await api.get('/health')).data.authorization).toBe(mode === 'logout' ? null : 'Bearer new-session');
    },
  );

  it.each([200, 401])('사용자 전환 뒤 도착한 이전 HTTP%s를 다음 세션에 반영하지 않는다', async (status) => {
    const started = deferred(), release = deferred();
    setAccessToken('old-session');
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      started.resolve(); await release.promise;
      if (status === 401) throw unauthorized(config);
      return response(config, { previousUserPrivateData: true });
    });
    api.defaults.adapter = adapter;
    const pending = api.get('/meta').catch((error: unknown) => error);
    await started.promise;
    setAccessToken('new-session');
    release.resolve();
    expect(await pending).toMatchObject({ code: 'SESSION_CHANGED', status: 0 });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('refresh의 일시 네트워크 실패는 인증 만료로 바꾸거나 현재 토큰을 지우지 않는다', async () => {
    setAccessToken('current');
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') throw new AxiosError('offline', AxiosError.ERR_NETWORK, config);
      if (config.url === '/meta') throw unauthorized(config);
      return response(config, { authorization: config.headers.Authorization });
    };
    await expect(api.get('/meta')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
    expect((await api.get('/health')).data.authorization).toBe('Bearer current');
  });

  it('갱신 후에도 보호 요청이401이면 Access를 제거하고 반복하지 않는다', async () => {
    setAccessToken('current');
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      if (config.url === '/auth/refresh') return response(config, { accessToken: 'renewed' });
      if (config.url === '/meta') throw unauthorized(config);
      return response(config, { authorization: config.headers.Authorization ?? null });
    });
    api.defaults.adapter = adapter;
    await expect(api.get('/meta')).rejects.toMatchObject({ status: 401 });
    expect(adapter).toHaveBeenCalledTimes(3);
    expect((await api.get('/health')).data.authorization).toBeNull();
  });

  it('같은 세션의 옛401이 늦게 오면 이미 갱신된 Access를 재사용한다', async () => {
    const started = deferred(), release = deferred();
    setAccessToken('old');
    let refreshes = 0;
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') { refreshes += 1; return response(config, { accessToken: 'renewed' }); }
      if (config.headers.Authorization === 'Bearer old') {
        if (config.url === '/meta') { started.resolve(); await release.promise; }
        throw unauthorized(config);
      }
      return response(config, {});
    };
    const slow = api.get('/meta');
    await started.promise;
    await api.get('/consulting');
    release.resolve();
    await slow;
    expect(refreshes).toBe(1);
  });

  it('이전 갱신의 finally는 새 세션의 단일 갱신을 지우지 않는다', async () => {
    const oldStarted = deferred(), oldRelease = deferred(), newStarted = deferred(), newRelease = deferred();
    let refreshes = 0;
    const counts = new Map<string, number>();
    setAccessToken('old');
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') {
        if (++refreshes === 1) { oldStarted.resolve(); await oldRelease.promise; return response(config, { accessToken: 'old-renewed' }); }
        newStarted.resolve(); await newRelease.promise;
        return response(config, { accessToken: 'new-renewed' });
      }
      const count = (counts.get(config.url!) ?? 0) + 1;
      counts.set(config.url!, count);
      if (count === 1) throw unauthorized(config);
      return response(config, { authorization: config.headers.Authorization });
    };
    const oldRequest = api.get('/meta').catch((error: unknown) => error);
    await oldStarted.promise;
    setAccessToken('new');
    const next = api.get('/consulting');
    await newStarted.promise;
    oldRelease.resolve();
    expect(await oldRequest).toMatchObject({ code: 'SESSION_CHANGED' });
    const follower = api.get('/ops');
    newRelease.resolve();
    expect((await next).data.authorization).toBe('Bearer new-renewed');
    expect((await follower).data.authorization).toBe('Bearer new-renewed');
    expect(refreshes).toBe(2);
  });
});
