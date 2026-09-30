/** @file-guide
 * 목적: students.ts — 학생 목록·상세의 생성 계약과 세션별 읽기 캐시
 * 책임/재사용: Back DTO→OpenAPI 생성 타입, 공용 api/sessionQueryKey를 재사용한다. 쓰기·서버 상태 복제는 하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/store/useSession';
import { api } from './client';
import { sessionQueryKey } from './queries';
import type { components, paths } from './schema';

export type StudentDirectory = components['schemas']['StudentDirectoryDto'];
export type StudentDirectoryRow = components['schemas']['StudentDirectoryRowDto'];
export type StudentRead = components['schemas']['StudentReadDto'];
export type StudentListQuery = NonNullable<paths['/students']['get']['parameters']['query']>;

export const studentKeys = {
  all: ['students'] as const,
  list: (params: StudentListQuery) => ['students', 'list', params] as const,
  detail: (id: number | null) => ['students', 'detail', id] as const,
};

/** 응답 캐시가 남아 있어도 권한 없는 화면이 이를 그리지 않게 화면/요청이 같은 플래그를 읽는다. */
export function useStudentReadAllowed(): boolean {
  return useSession(state => Boolean(state.ready && state.me?.canAdminPage && state.me.canCrudAll));
}

export function useStudentDirectory(params: StudentListQuery) {
  const viewerId = useSession(state => state.me?.id ?? 'anonymous');
  const enabled = useStudentReadAllowed();
  return useQuery({
    queryKey: sessionQueryKey(studentKeys.list(params), viewerId),
    queryFn: async ({ signal }) => (await api.get<StudentDirectory>('/students', { params, signal })).data,
    enabled,
  });
}

export function useStudentRead(id: number | null) {
  const viewerId = useSession(state => state.me?.id ?? 'anonymous');
  const allowed = useStudentReadAllowed();
  return useQuery({
    queryKey: sessionQueryKey(studentKeys.detail(id), viewerId),
    queryFn: async ({ signal }) => (await api.get<StudentRead>(`/students/${id}`, { signal })).data,
    enabled: allowed && id !== null && Number.isSafeInteger(id) && id > 0,
  });
}
