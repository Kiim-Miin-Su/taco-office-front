'use client'; // CSR

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, api, apiMessage, setAccessToken } from '@/api/client';
import { useSession } from '@/store/useSession';
import type { Me } from '@/api/types';
import { RouteAccess } from '@/components/shell/RequireAuth';

/**
 * 세션 복구 — 새로고침해도 로그인이 풀리지 않게.
 *
 * Access 토큰은 **메모리에만** 둔다 (localStorage 에 두면 XSS 한 번에 털린다).
 * 새로고침하면 메모리가 비므로 httpOnly 쿠키로 된 Refresh 로 한 번 재발급해 본다.
 * 안 되면 로그인 화면으로 보낸다 — 조용히 빈 화면을 보여 주지 않는다.
 */
export function SessionBoot({ children }: { children: ReactNode }) {
  const setMe = useSession((s) => s.setMe);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setTried(false);
      setError(null);
      try {
        const r = await api.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(r.data.accessToken);
        const me = await api.get<Me>('/auth/me');
        if (alive) setMe(me.data);
      } catch (caught: unknown) {
        if (!alive) return;
        // Refresh가 실제로 거절된 경우만 익명이다. 네트워크/5xx를 로그아웃으로 위장하지 않는다.
        if (caught instanceof ApiError && caught.status === 401) setMe(null);
        else setError(caught);
      } finally {
        if (alive) setTried(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [setMe, attempt]);

  if (!tried) {
    return <div className="grid min-h-screen place-items-center text-[13px] text-fg-subtle">불러오는 중…</div>;
  }
  if (error) {
    return (
      <div role="alert" className="grid min-h-screen place-items-center px-4 text-center text-[13px] text-fg">
        <div>
          <p className="font-bold">로그인 상태를 확인하지 못했습니다.</p>
          <p className="mt-1 text-fg-subtle">{apiMessage(error)}</p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-line bg-card px-3 py-2 font-bold"
            onClick={() => setAttempt((value) => value + 1)}
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <SessionBoot>
        <RouteAccess>{children}</RouteAccess>
      </SessionBoot>
    </QueryClientProvider>
  );
}
