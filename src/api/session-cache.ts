import type { QueryClient } from '@tanstack/react-query';

/**
 * 인증 사용자가 바뀔 때 이전 사용자의 서버 응답을 함께 폐기한다.
 *
 * 목록 query key는 요청 조건만 표현하므로 캐시를 유지한 채 계정만 바꾸면
 * 새 사용자가 이전 사용자의 목록을 잠깐 볼 수 있다. 로그인·로그아웃은 이
 * 함수를 공유해 사용자 경계를 원자적으로 끊는다.
 */
export function clearSessionQueries(queryClient: Pick<QueryClient, 'clear'>): void {
  queryClient.clear();
}
