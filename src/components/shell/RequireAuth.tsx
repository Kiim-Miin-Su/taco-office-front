/** @file-guide
 * 목적: RequireAuth.tsx — RouteAccess, RequireAuth (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { Fragment, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError, apiMessage, onSessionExpired, onSessionRecheck } from '@/api/client';
import { clearSessionQueries, revalidateSession, sessionAccessKey } from '@/api/session-cache';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/store/useSession';
import { canAccessAppRoute } from './navigation';

/** 페이지를 mount하기 전에 차단한다. 페이지 내부의 return만으로는 hook의 GET을 막을 수 없다. */
export function RouteAccess({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const me = useSession((s) => s.me);
  const ready = useSession((s) => s.ready);
  const allowed = ready && canAccessAppRoute(pathname, me);
  const [check, setCheck] = useState<{ path: string; error: unknown }>({ path: pathname, error: null });
  const [attempt, retry] = useReducer((value: number) => value + 1, 0);
  const previousPath = useRef(pathname);
  const userId = me?.id;

  useEffect(() => {
    const changedPath = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (!ready || !userId) { setCheck({ path: pathname, error: null }); return; }
    let alive = true;
    const validate = () => {
      void revalidateSession(queryClient).then(() => {
        if (alive) setCheck({ path: pathname, error: null });
      }).catch((error: unknown) => {
        if (alive && !(error instanceof ApiError && error.code === 'SESSION_CHANGED')) setCheck({ path: pathname, error });
      });
    };
    const visible = () => { if (document.visibilityState === 'visible') validate(); };
    // 최초 mount는 기존 Me를 신뢰한다. login→schedule을 포함한 경로 전환은 추가 확인한다.
    if (changedPath || attempt > 0) validate();
    window.addEventListener('focus', validate);
    window.addEventListener('online', validate);
    document.addEventListener('visibilitychange', visible);
    const unsubscribe = onSessionRecheck(validate);
    return () => {
      alive = false;
      window.removeEventListener('focus', validate);
      window.removeEventListener('online', validate);
      document.removeEventListener('visibilitychange', visible);
      unsubscribe();
    };
  }, [pathname, ready, userId, queryClient, attempt]);

  // 앱 공통 인증 경계 한 곳에서만 구독한다. 기존 사용자 상태/캐시 정리와 route 전이를 재사용한다.
  useEffect(() => onSessionExpired(() => {
    useSession.getState().signOut();
    clearSessionQueries(queryClient);
  }), [queryClient]);

  useEffect(() => {
    if (ready && !allowed && (!me || (check.path === pathname && !check.error))) router.replace(me ? '/schedule' : '/login');
  }, [ready, allowed, me, router, check, pathname]);

  if (me && check.error) return <Banner tone="danger"><p>{apiMessage(check.error)}</p><Button onClick={retry}>권한 다시 확인</Button></Banner>;
  if (me && check.path !== pathname) return <div role="status">권한 확인 중…</div>;
  // clear()만으로는 기존 QueryObserver의 snapshot/지역 폼이 남을 수 있어 권한 경계에서 재마운트한다.
  return allowed ? <Fragment key={sessionAccessKey(me)}>{children}</Fragment> : null;
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
