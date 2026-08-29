'use client';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/store/useSession';

/**
 * 로그인하지 않았으면 로그인 화면으로 보낸다.
 * 화면마다 이 검사를 적으면 한 곳을 빠뜨리고, 그 화면만 빈 채로 뜬다.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const ready = useSession((s) => s.ready);

  useEffect(() => {
    if (ready && !me) router.replace('/login');
  }, [ready, me, router]);

  if (!ready) return <div className="grid min-h-screen place-items-center text-[13px] text-fg-subtle">불러오는 중…</div>;
  if (!me) return null;
  return <>{children}</>;
}
