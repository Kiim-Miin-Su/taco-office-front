/** @file-guide
 * 목적: session-cache.ts — clearSessionQueries, sessionAccessKey, revalidateSession (auth)
 * 책임/재사용: 공용 인증/권한 경계만 소유한다. 토큰·쿠키 원문을 노출하지 않고 만료/익명/권한 회수 경계를 회귀로 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { QueryClient } from '@tanstack/react-query';
import { useSession } from '@/store/useSession';
import { api, ApiError, getSessionGeneration, invalidateSessionRequests } from './client';
import type { Me } from './types';
import { resetScheduleOptimistic } from './schedule-optimistic';
import { clearAllDrafts } from '@/lib/autosave';
import { useWorkspace } from '@/store/useWorkspace';

/**
 * 인증 사용자가 바뀔 때 이전 사용자의 서버 응답을 함께 폐기한다.
 *
 * 목록 query key는 요청 조건만 표현하므로 캐시를 유지한 채 계정만 바꾸면
 * 새 사용자가 이전 사용자의 목록을 잠깐 볼 수 있다. 로그인·로그아웃은 이
 * 함수를 공유해 사용자 경계를 원자적으로 끊는다.
 * 이 브라우저에 남긴 쓰던 글(N-69 자동 저장)도 같은 경계에서 비운다 — 같은 기계의 다음 사람이 보지 않게.
 */
export function clearSessionQueries(queryClient: Pick<QueryClient, 'clear'>): void {
  useWorkspace.getState().clearDrawer();
  resetScheduleOptimistic(queryClient);
  queryClient.clear();
  clearAllDrafts();
}

/**
 * 권한 값은 생성 Me에서 읽기만 한다. 이름/직함 변경을 권한 변경으로 취급하지 않는다.
 * 첫 설정 잠금(W8 · mustChangeCredentials)도 접근 범위를 바꾸므로 같은 열쇠에 넣는다 — 서버 403 으로 잠김을 알게 되면
 * 옛 요청 · 캐시를 버리고 화면을 다시 세운다. 칸이 없는 옛 Me 는 false 와 같게 읽는다.
 */
export function sessionAccessKey(me: Me | null): string {
  return me ? JSON.stringify([
    me.id, me.role, Object.entries(me).filter(([key]) => key.startsWith('can')).sort(), me.mustChangeCredentials === true,
  ]) : 'anonymous';
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
