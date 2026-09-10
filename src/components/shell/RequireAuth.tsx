/** @file-guide
 * 목적: RequireAuth.tsx — RouteAccess, RequireAuth (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/store/useSession';
import { canAccessAppRoute } from './navigation';

/** 페이지를 mount하기 전에 차단한다. 페이지 내부의 return만으로는 hook의 GET을 막을 수 없다. */
export function RouteAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const ready = useSession((s) => s.ready);
  const allowed = ready && canAccessAppRoute(pathname, me);

  useEffect(() => {
    if (ready && !allowed) router.replace(me ? '/schedule' : '/login');
  }, [ready, allowed, me, router]);

  return allowed ? <>{children}</> : null;
}

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
