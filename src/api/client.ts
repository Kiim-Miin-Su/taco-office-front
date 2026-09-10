/** @file-guide
 * 목적: client.ts — ApiError, api, apiMessage, isConflict, setAccessToken (client)
 * 책임/재사용: 공용 Axios 헤더·오류·401 재발급 경계다. 토큰을 로그/영속 저장하지 않고 JWT/권한의 최종 검증은 서버에 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Axios 인스턴스 **하나**. 화면마다 fetch 를 부르지 않는다.
 *
 * 여기서 하는 일 둘:
 *   ① 서버가 내려준 { code, message } 를 ApiError 로 정규화한다
 *   ② 401 이면 **한 번만** /auth/refresh 로 재시도한다 (D-R41)
 *
 * 동시에 여러 요청이 401 이 되어도 재발급은 한 번만 하고 나머지는 그 결과를 기다린다.
 * 그렇게 하지 않으면 새로고침 한 번에 재발급이 열 번 날아간다.
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiErrorResponse, RefreshResult } from './types';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1',
  withCredentials: true, // Refresh 쿠키를 주고받는다
  timeout: 20_000,
  // XHR timeout을 ETIMEDOUT로 받아 브라우저 abort(ECONNABORTED)와 구분한다.
  transitional: { clarifyTimeoutError: true },
});

/** 응답이 없는 오류의 공용 문구. Axios config/request에는 비밀번호·토큰이 있어 보존/출력하지 않는다. */
const TRANSPORT_FAILURES: Record<string, { code: string; message: string }> = {
  [AxiosError.ETIMEDOUT]: {
    code: 'TIMEOUT', message: '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
  },
  [AxiosError.ECONNABORTED]: { code: 'ABORTED', message: '요청이 중단되었습니다. 다시 시도해 주세요.' },
  [AxiosError.ERR_CANCELED]: { code: 'CANCELED', message: '요청이 취소되었습니다.' },
  [AxiosError.ERR_NETWORK]: { code: 'NETWORK', message: '서버에 닿지 못했습니다' },
};

/** 사람에게 보여 줄 실패 문구 — 화면이 문구를 지어내지 않는다. 해석하는 자리는 여기 하나다 */
export function apiMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  const r = (e as { response?: { data?: { message?: string } } })?.response?.data;
  return r?.message ?? '저장하지 못했습니다';
}

/** 겹침(409) 인가 — 낙관 반영을 되돌리고 ConflictGuard 를 띄울 자리 판정 */
export function isConflict(e: unknown): boolean {
  if (e instanceof ApiError) return e.code === 'RESOURCE_CONFLICT' || e.code === 'DUPLICATE';
  const s2 = (e as { response?: { status?: number } })?.response?.status;
  return s2 === 409;
}

let accessToken: string | null = null;
// 명시적 설정(로그인/로그아웃·초기 복구) 경계만 증가한다. 자동 Access 갱신은 사용자 전환이 아니다.
let sessionGeneration = 0;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
  sessionGeneration += 1;
};

type Retryable = AxiosRequestConfig & { _retried?: boolean; _sessionGeneration?: number };
const authPaths = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);
const isAuthAction = (url?: string) => authPaths.has((url ?? '').split('?')[0]);
const sessionChanged = () => new ApiError('SESSION_CHANGED', '로그인 상태가 바뀌어 이전 요청을 취소했습니다.', 0);

/** UI/캐시 정리는 RouteAccess가 구독한다. Axios는 store/router/QueryClient를 소유하지 않는다. */
const expiryListeners = new Set<() => void>();
export function onSessionExpired(listener: () => void): () => void {
  expiryListeners.add(listener);
  return () => { expiryListeners.delete(listener); };
}
function expireSession(generation: number): void {
  if (generation !== sessionGeneration) return;
  setAccessToken(null);
  for (const listener of expiryListeners) listener();
}

api.interceptors.request.use((cfg) => {
  const owned = cfg as Retryable;
  owned._sessionGeneration ??= sessionGeneration;
  if (!isAuthAction(cfg.url) && owned._sessionGeneration !== sessionGeneration) throw sessionChanged();
  // 이 인스턴스의 Bearer는 메모리 토큰 하나만 권위다. 재시도 config의 오래된 헤더도 제거한다.
  if (accessToken && !isAuthAction(cfg.url)) cfg.headers.Authorization = `Bearer ${accessToken}`;
  else cfg.headers.delete('Authorization');
  return cfg;
});

/** 재발급은 동시에 하나만 — 나머지는 이 약속을 기다린다 */
let inFlight: { generation: number; promise: Promise<void> } | null = null;

function renew(generation: number): Promise<void> {
  if (inFlight?.generation === generation) return inFlight.promise;
  const flight = {
    generation,
    promise: api.post<RefreshResult>('/auth/refresh').then((r) => {
      if (generation !== sessionGeneration) throw sessionChanged();
      accessToken = r.data.accessToken;
    }).finally(() => { if (inFlight === flight) inFlight = null; }),
  };
  inFlight = flight;
  return flight.promise;
}

api.interceptors.response.use(
  (r) => {
    if (!isAuthAction(r.config.url)
      && (r.config as Retryable)._sessionGeneration !== sessionGeneration) throw sessionChanged();
    return r;
  },
  async (err: AxiosError<Partial<ApiErrorResponse>>) => {
    if (err instanceof ApiError) throw err;
    const cfg = err.config as Retryable | undefined;
    const status = err.response?.status ?? 0;

    if (cfg && !isAuthAction(cfg.url)) {
      const generation = cfg._sessionGeneration;
      if (generation !== sessionGeneration) throw sessionChanged();
      if (status === 401) {
        if (!cfg._retried) {
          cfg._retried = true;
          try {
            // 다른 보호 요청이 이미 갱신했다면 늦게 도착한 옛401도 같은 Access를 재사용한다.
            if (!accessToken || cfg.headers?.Authorization === `Bearer ${accessToken}`) await renew(generation);
          } catch (refreshError) {
            if (generation !== sessionGeneration) throw sessionChanged();
            // 만료 확정만 세션을 폐기한다. 네트워크/서버 장애를 로그아웃으로 위장하지 않는다.
            if (refreshError instanceof ApiError && refreshError.status === 401) expireSession(generation);
            throw refreshError;
          }
          if (generation !== sessionGeneration) throw sessionChanged();
          return api(cfg);
        }
        expireSession(generation);
      }
    }

    if (status === 0) {
      const failure = TRANSPORT_FAILURES[err.code ?? ''] ?? {
        code: 'REQUEST_FAILED', message: '요청을 보내지 못했습니다.',
      };
      throw new ApiError(failure.code, failure.message, 0);
    }

    const body = err.response?.data;
    throw new ApiError(
      body?.code ?? 'ERROR',
      body?.message ?? err.message,
      status,
    );
  },
);
