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
});

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

/** 재발급은 동시에 하나만 — 나머지는 이 약속을 기다린다 */
let inFlight: Promise<string> | null = null;

async function renew(): Promise<string> {
  inFlight ??= api
    .post<{ accessToken: string }>('/auth/refresh')
    .then((r) => {
      setAccessToken(r.data.accessToken);
      return r.data.accessToken;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

type Retryable = AxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError<{ code?: string; message?: string }>) => {
    const cfg = err.config as Retryable | undefined;
    const status = err.response?.status ?? 0;

    // 재발급 자체가 401 이면 더 볼 것이 없다 — 로그아웃이다
    const isRefresh = cfg?.url?.includes('/auth/refresh');
    if (status === 401 && cfg && !cfg._retried && !isRefresh) {
      cfg._retried = true;
      try {
        await renew();
        return api(cfg);
      } catch {
        setAccessToken(null);
      }
    }

    const body = err.response?.data;
    throw new ApiError(
      body?.code ?? (status === 0 ? 'NETWORK' : 'ERROR'),
      body?.message ?? (status === 0 ? '서버에 닿지 못했습니다' : err.message),
      status,
    );
  },
);
