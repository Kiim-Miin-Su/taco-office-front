'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api, setAccessToken } from '@/api/client';
import { useSession } from '@/store/useSession';
import type { Me } from '@/api/types';

/**
 * 세션 복구 — 새로고침해도 로그인이 풀리지 않게.
 *
 * Access 토큰은 **메모리에만** 둔다 (localStorage 에 두면 XSS 한 번에 털린다).
 * 새로고침하면 메모리가 비므로 httpOnly 쿠키로 된 Refresh 로 한 번 재발급해 본다.
 * 안 되면 로그인 화면으로 보낸다 — 조용히 빈 화면을 보여 주지 않는다.
 */
function SessionBoot({ children }: { children: ReactNode }) {
  const setMe = useSession((s) => s.setMe);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(r.data.accessToken);
        const me = await api.get<Me>('/auth/me');
        if (alive) setMe(me.data);
      } catch {
        if (alive) setMe(null);
      } finally {
        if (alive) setTried(true);
      }
    })();
    return () => { alive = false; };
  }, [setMe]);

  if (!tried) {
    return <div className="grid min-h-screen place-items-center text-[13px] text-fg-subtle">불러오는 중…</div>;
  }
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  }));
  return (
    <QueryClientProvider client={qc}>
      <SessionBoot>{children}</SessionBoot>
    </QueryClientProvider>
  );
}
