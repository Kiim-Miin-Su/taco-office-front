/** @file-guide
 * 목적: session-cache.ts — clearSessionQueries (auth)
 * 책임/재사용: 공용 인증/권한 경계만 소유한다. 토큰·쿠키 원문을 노출하지 않고 만료/익명/권한 회수 경계를 회귀로 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { QueryClient } from '@tanstack/react-query';
import { useSession } from '@/store/useSession';
import { api, ApiError, getSessionGeneration, invalidateSessionRequests } from './client';
import type { Me } from './types';
import { resetScheduleOptimistic } from './schedule-optimistic';

/**
 * 인증 사용자가 바뀔 때 이전 사용자의 서버 응답을 함께 폐기한다.
 *
 * 목록 query key는 요청 조건만 표현하므로 캐시를 유지한 채 계정만 바꾸면
 * 새 사용자가 이전 사용자의 목록을 잠깐 볼 수 있다. 로그인·로그아웃은 이
 * 함수를 공유해 사용자 경계를 원자적으로 끊는다.
 */
export function clearSessionQueries(queryClient: Pick<QueryClient, 'clear'>): void {
  resetScheduleOptimistic(queryClient);
  queryClient.clear();
}

/** 권한 값은 생성 Me에서 읽기만 한다. 이름/직함 변경을 권한 변경으로 취급하지 않는다. */
export function sessionAccessKey(me: Me | null): string {
  return me ? JSON.stringify([me.id, me.role, Object.entries(me).filter(([key]) => key.startsWith('can')).sort()]) : 'anonymous';
}

const checks = new WeakMap<QueryClient, { generation: number; promise: Promise<void> }>();

/** Me는 Zustand 한 곳만 소유한다. 업무 Query 캐시와 별개인 짧은 동시 요청만 합친다. */
export function revalidateSession(queryClient: QueryClient): Promise<void> {
  const before = useSession.getState().me;
  if (!before) return Promise.resolve();
  const generation = getSessionGeneration();
  const running = checks.get(queryClient);
  if (running?.generation === generation) return running.promise;
  const check = { generation, promise: (async () => {
    const { data: next } = await api.get<Me>('/auth/me');
    if (generation !== getSessionGeneration() || useSession.getState().me !== before) {
      throw new ApiError('SESSION_CHANGED', '로그인 상태가 바뀌었습니다.', 0);
    }
    // 다른 탭의 cookie 변경 등으로 계정이 달라져도 조용히 그 계정으로 전환하지 않는다.
    if (next.id !== before.id) {
      useSession.getState().signOut();
      clearSessionQueries(queryClient);
      return;
    }
    if (sessionAccessKey(next) !== sessionAccessKey(before)) {
      invalidateSessionRequests();
      clearSessionQueries(queryClient);
    }
    // 같은 권한/프로필 응답은 store 구독과 작성 중인 폼을 다시 렌더하지 않는다.
    if ((Object.keys(next) as (keyof Me)[]).some((key) => next[key] !== before[key])) useSession.getState().setMe(next);
  })().finally(() => { if (checks.get(queryClient) === check) checks.delete(queryClient); }) };
  checks.set(queryClient, check);
  return check.promise;
}
