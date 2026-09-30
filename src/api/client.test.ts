/** @file-guide
 * 목적: client.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { AxiosError, CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setAccessToken(null);
  vi.restoreAllMocks();
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

/**
 * P1 DELIVERY — 한 틱 연타(같은 쓰기가 끝나기 전에 또 옴)는 서버에 **한 번만** 보낸다.
 * 입금(N-132)처럼 서버가 키로 막는 쓰기도 있지만, 컴플레인 · 할 일 · 상담 · 회의 · 지출 같은 만들기에는 키가 없어
 * 연타가 두 줄이 됐다(2026-09-29 실측 — 한 틱 두 번 click 에 요청 둘). 판정은 한 곳(api client)이다.
 */
describe('같은 쓰기가 끝나기 전에 또 오면 — 서버에 한 번만 (DELIVERY)', () => {
  const slow = () => {
    const gate = deferred();
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      await gate.promise;
      return response(config, { id: 1 }, 201);
    });
    return { gate, adapter };
  };

  it('같은 경로 · 같은 본문의 쓰기 둘은 요청 하나를 함께 기다린다 — 둘 다 같은 응답을 받는다', async () => {
    const { gate, adapter } = slow();
    api.defaults.adapter = adapter as unknown as AxiosAdapter;
    const a = api.post('/ops/complaints', { area: 'lesson', body: 'x' });
    const b = api.post('/ops/complaints', { area: 'lesson', body: 'x' });
    gate.resolve();
    const [ra, rb] = await Promise.all([a, b]);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(ra.data).toEqual({ id: 1 });
    expect(rb.data).toEqual({ id: 1 });
  });

  it('이전 세션의 동일 쓰기가 진행 중이어도 새 세션은 별도로 전송한다', async () => {
    const started = deferred(), release = deferred();
    setAccessToken('previous-session');
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      if (config.headers.Authorization === 'Bearer previous-session') {
        started.resolve();
        await release.promise;
      }
      return response(config, { id: 1 }, 201);
    });
    api.defaults.adapter = adapter;
    const previous = api.post('/ops/complaints', { body: 'same' }).catch((error: unknown) => error);
    await started.promise;
    setAccessToken('next-session');
    const next = api.post('/ops/complaints', { body: 'same' }).catch((error: unknown) => error);
    // 새 요청의 interceptor와 adapter 진입을 기다리되 이전 요청은 아직 미완료다.
    await new Promise<void>((done) => { setTimeout(done, 0); });
    release.resolve();
    const [previousResult, nextResult] = await Promise.all([previous, next]);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(previousResult).toMatchObject({ code: 'SESSION_CHANGED', status: 0 });
    expect(nextResult).toMatchObject({ status: 201, data: { id: 1 } });
  });

  it('본문이 다르거나 끝난 뒤 다시 보내면 따로 보낸다 · 읽기(GET)는 묶지 않는다', async () => {
    const { gate, adapter } = slow();
    api.defaults.adapter = adapter as unknown as AxiosAdapter;
    const a = api.post('/ops/complaints', { area: 'lesson', body: 'x' });
    const b = api.post('/ops/complaints', { area: 'lesson', body: 'y' });
    const g1 = api.get('/ops');
    const g2 = api.get('/ops');
    gate.resolve();
    await Promise.all([a, b, g1, g2]);
    expect(adapter).toHaveBeenCalledTimes(4);
    await api.post('/ops/complaints', { area: 'lesson', body: 'x' });
    expect(adapter).toHaveBeenCalledTimes(5);
  });

  it('파일(FormData)은 본문을 견줄 수 없어 묶지 않는다', async () => {
    const { gate, adapter } = slow();
    api.defaults.adapter = adapter as unknown as AxiosAdapter;
    const f1 = new FormData(); f1.append('file', new Blob(['a']), 'a.txt');
    const f2 = new FormData(); f2.append('file', new Blob(['b']), 'b.txt');
    const a = api.post('/files', f1);
    const b = api.post('/files', f2);
    gate.resolve();
    await Promise.all([a, b]);
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('실패도 함께 받는다 — 두 번째가 따로 가서 다른 답을 받지 않는다', async () => {
    const gate = deferred();
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      await gate.promise;
      throw new AxiosError('conflict', AxiosError.ERR_BAD_REQUEST, config, undefined,
        response(config, { code: 'OVERPAY', message: '남은 금액을 넘습니다' }, 409));
    });
    api.defaults.adapter = adapter as unknown as AxiosAdapter;
    const a = api.post('/accounting/payments', { invId: 1, amount: 1 }).catch((e) => e);
    const b = api.post('/accounting/payments', { invId: 1, amount: 1 }).catch((e) => e);
    gate.resolve();
    const [ea, eb] = await Promise.all([a, b]);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(ea).toBeInstanceOf(ApiError);
    expect((eb as ApiError).code).toBe('OVERPAY');
  });

  it('합쳐진 두 쓰기의401도 각자 재시도 상태를 가지며 세션을 만료시키지 않는다', async () => {
    setAccessToken('old');
    const refreshStarted = deferred(), releaseRefresh = deferred();
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      if (config.url === '/auth/refresh') {
        refreshStarted.resolve(); await releaseRefresh.promise;
        return response(config, { accessToken: 'renewed' });
      }
      if (config.headers.Authorization === 'Bearer old') throw unauthorized(config);
      return response(config, { id: 1 }, 201);
    });
    api.defaults.adapter = adapter;
    const a = api.post('/schedule', { title: 'fixture' }).catch((error: unknown) => error);
    const b = api.post('/schedule', { title: 'fixture' }).catch((error: unknown) => error);
    await refreshStarted.promise;
    releaseRefresh.resolve();
    const results = await Promise.all([a, b]);
    expect(results).toEqual([
      expect.objectContaining({ status: 201 }), expect.objectContaining({ status: 201 }),
    ]);
    expect(adapter).toHaveBeenCalledTimes(3); // 최초1 + 갱신1 + 재시도1
    const requests = vi.mocked(console.info).mock.calls.filter(([event, details]) =>
      event === '[TACO] api.request' && details.route === '/schedule').map(([, details]) => details);
    expect(requests).toHaveLength(4);
    expect(requests.filter((entry) => entry.delivery === 'dispatch')).toHaveLength(2);
    expect(requests.filter((entry) => entry.delivery === 'coalesced')).toHaveLength(2);
    const operationIds = new Set(requests.map((entry) => entry.requestId));
    expect(operationIds.size).toBe(2);
    for (const requestId of operationIds) {
      expect(requests.filter((entry) => entry.requestId === requestId).map((entry) => entry.attempt)).toEqual([1, 2]);
    }
  });

  it('병합 전송의 취소도 두 호출에서 CANCELED를 유지한다', async () => {
    const release = deferred();
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      await release.promise;
      throw new CanceledError('SECRET_CANCELED', config);
    });
    api.defaults.adapter = adapter;
    const first = api.post('/schedule', { title: 'fixture' }).catch((error: unknown) => error);
    const next = api.post('/schedule', { title: 'fixture' }).catch((error: unknown) => error);
    release.resolve();
    const results = await Promise.all([first, next]);
    expect(adapter).toHaveBeenCalledOnce();
    expect(results).toEqual([
      expect.objectContaining({ code: 'CANCELED', status: 0 }), expect.objectContaining({ code: 'CANCELED', status: 0 }),
    ]);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('SECRET');
  });
});

describe('공용 요청 진단은 전송과 병합·재시도를 구별한다', () => {
  const events = (): Array<Record<string, unknown>> => [...vi.mocked(console.info).mock.calls, ...vi.mocked(console.warn).mock.calls]
    .filter(([name]) => typeof name === 'string' && name.startsWith('[TACO] api.'))
    .map(([event, details]) => ({ event, ...(details as Record<string, unknown>) }));

  it.each(['get', 'post', 'put', 'patch', 'delete'] as const)('%s 요청/응답은 값 없는 로컬 metadata만 남긴다', async (method) => {
    setAccessToken('SECRET_BEARER');
    api.defaults.adapter = async (config) => {
      expect(config.headers['X-Request-ID']).toBeUndefined();
      return response(config, { id: 42, undo: 'SECRET_UNDO', message: 'SECRET_MESSAGE', salary: 987654 }, 200);
    };
    const body = { title: 'SECRET_NAME', email: 'SECRET_EMAIL', SECRET_CUSTOM_KEY: 'SECRET_VALUE', students: [{ phone: 'SECRET_PHONE' }] };
    const result = await api.request({ method, url: '/schedule/42?token=SECRET_QUERY', data: body,
      params: { q: 'SECRET_PARAM' }, headers: { 'X-Secret': 'SECRET_HEADER' } });
    expect(result.data.undo).toBe('SECRET_UNDO'); // 응답 계약은 그대로
    const logged = events();
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatchObject({ event: '[TACO] api.request', method: method.toUpperCase(),
      route: '/schedule/:value', attempt: 1, delivery: 'dispatch' });
    expect(logged[1]).toMatchObject({ event: '[TACO] api.response', requestId: logged[0]?.requestId,
      status: 200, attempt: 1, delivery: 'dispatch' });
    expect(logged[1]?.durationMs).toEqual(expect.any(Number));
    expect(JSON.stringify(logged)).not.toContain('SECRET');
    expect(JSON.stringify(logged)).not.toContain('987654');
  });

  it('병합된 호출은 별도 ID와 원 전송 ID를 연결하고 실제 전송인 척하지 않는다', async () => {
    const gate = deferred();
    const adapter = vi.fn<AxiosAdapter>(async (config) => { await gate.promise; return response(config, { id: 1 }); });
    api.defaults.adapter = adapter;
    const a = api.post('/schedule', { title: 'fixture' });
    const b = api.post('/schedule', { title: 'fixture' });
    gate.resolve(); await Promise.all([a, b]);
    const requests = events().filter((entry) => entry.event === '[TACO] api.request');
    const replies = events().filter((entry) => entry.event === '[TACO] api.response');
    expect(adapter).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ delivery: 'dispatch' });
    expect(requests[1]).toMatchObject({ delivery: 'coalesced', coalescedWith: requests[0]?.requestId, coalescedAttempt: 1 });
    expect(requests[0]?.requestId).not.toBe(requests[1]?.requestId);
    expect(replies.map((entry) => entry.requestId)).toEqual(requests.map((entry) => entry.requestId));
  });

  it('401 재시도는 같은 operation ID에 attempt만 늘리고 갱신은 별도 요청이다', async () => {
    setAccessToken('old');
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') return response(config, { accessToken: 'SECRET_REFRESH' });
      if (config.headers.Authorization === 'Bearer old') throw unauthorized(config);
      return response(config, { id: 1 });
    };
    await api.post('/schedule', { title: 'SECRET_TITLE' });
    const logged = events();
    const requests = logged.filter((entry) => entry.event === '[TACO] api.request' && entry.route === '/schedule');
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ requestId: requests[0]?.requestId, attempt: 2 });
    expect(logged.find((entry) => entry.route === '/auth/refresh')?.requestId).not.toBe(requests[0]?.requestId);
    expect(logged).toContainEqual(expect.objectContaining({ event: '[TACO] api.error', requestId: requests[0]?.requestId,
      attempt: 1, status: 401, code: 'UNAUTHORIZED' }));
    expect(JSON.stringify(logged)).not.toContain('SECRET');
  });

  it.each([400, 409, 503])('HTTP%s 오류는 코드 allowlist만 남기고 원시 오류를 기록하지 않는다', async (status) => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('SECRET_RAW_ERROR', AxiosError.ERR_BAD_RESPONSE, config, { secret: 'SECRET_REQUEST' },
        response(config, { code: 'SECRET_CODE', message: 'SECRET_MESSAGE', detail: 'SECRET_DETAIL' }, status));
    };
    await expect(api.post('/accounting/payments', { amount: 987654 })).rejects.toMatchObject({ code: 'SECRET_CODE', status });
    expect(events()).toContainEqual(expect.objectContaining({ event: '[TACO] api.error', code: 'HTTP_ERROR', status }));
    expect(JSON.stringify(events())).not.toContain('SECRET');
    expect(JSON.stringify(events())).not.toContain('987654');
  });

  it('adapter 진입 전 취소는 전송되지 않았음을 표시하고 console 실패도 요청을 깨지 않는다', async () => {
    const controller = new AbortController(); controller.abort();
    const adapter = vi.fn<AxiosAdapter>(async (config) => response(config, { ok: true }));
    api.defaults.adapter = adapter;
    await expect(api.get('/health', { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELED' });
    expect(adapter).not.toHaveBeenCalled();
    expect(events()).toContainEqual(expect.objectContaining({ event: '[TACO] api.error', code: 'CANCELED', delivery: 'not_dispatched' }));
    vi.mocked(console.info).mockImplementation(() => { throw new Error('console unavailable'); });
    vi.mocked(console.warn).mockImplementation(() => { throw new Error('console unavailable'); });
    expect((await api.get('/health')).data).toEqual({ ok: true });
    api.defaults.adapter = async (config) => { throw new AxiosError('offline', AxiosError.ERR_NETWORK, config); };
    await expect(api.get('/health')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
