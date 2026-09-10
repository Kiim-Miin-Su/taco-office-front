/** @file-guide
 * 목적: session-cache.ts — clearSessionQueries (auth)
 * 책임/재사용: 공용 인증/권한 경계만 소유한다. 토큰·쿠키 원문을 노출하지 않고 만료/익명/권한 회수 경계를 회귀로 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { QueryClient } from '@tanstack/react-query';
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
