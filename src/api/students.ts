/** @file-guide
 * 목적: students.ts — 학생 목록·상세·신규 등록·재활성화의 생성 계약과 세션별 query/mutation을 소유한다.
 * 책임/재사용: Back DTO→OpenAPI 생성 타입, 공용 api/sessionQueryKey를 재사용하고 화면에 서버 상태 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/store/useSession';
import { api } from './client';
import { sessionQueryKey } from './queries';
import type { components, paths } from './schema';

export type StudentDirectory = components['schemas']['StudentDirectoryDto'];
export type StudentDirectoryRow = components['schemas']['StudentDirectoryRowDto'];
export type StudentRead = components['schemas']['StudentReadDto'];
export type StudentListQuery = NonNullable<paths['/students']['get']['parameters']['query']>;

/**
 * BOC-03D-01 권고안 채택(2026-10-07): 15절 등록은 기존 LeadEnrollDto와 섞지 않고
 * Back DTO에서 생성한 schema만 사용한다. BOC-03D-04b 권고안 채택: options·school·preview·save도
 * 생성 경로를 호출하고 성공 뒤 목록/상세 캐시를 폐기한다. 정책을 바꿀 때는 Back
 * student-registration.dto.ts/service/migration과 P-STU15/BOC-03 문서를 같은 청크에서 수정한다.
 */
export type StudentCreate = components['schemas']['StudentCreateDto'];
export type StudentCreatePreview = components['schemas']['StudentCreatePreviewDto'];
export type StudentCreateResult = components['schemas']['StudentCreateResultDto'];
export type StudentRegistrationOptions = components['schemas']['StudentRegistrationOptionsDto'];
export type StudentSchoolOption = components['schemas']['StudentSchoolOptionDto'];
export type StudentSchoolCreate = components['schemas']['StudentSchoolCreateDto'];

/**
 * BOC-03D-02 권고안 채택(2026-10-07): 재활성화는 신규 생성의 mode가 아니라 기존
 * STU identity와 expectedProfileVersion을 쓰는 별도 command다. 휴원·수강 종료로
 * 퇴원을 추정하지 않고 서버 후보의 권위 상태를 소비한다. BOC-03D-03b 권고안 채택:
 * 후보/preview/save는 생성 OpenAPI 경로만 호출하고 성공 뒤 목록·상세 캐시를 폐기한다.
 * 정책 변경 시 Back student-registration.dto.ts/service/migration과 P-REACT/BOC-03 문서를
 * 같은 청크에서 수정한다.
 */
export type StudentReactivationCandidateQuery = components['schemas']['StudentReactivationCandidateQueryDto'];
export type StudentReactivationCandidate = components['schemas']['StudentReactivationCandidateDto'];
export type StudentReactivationCandidates = components['schemas']['StudentReactivationCandidatesDto'];
export type StudentReactivationConsultation = components['schemas']['StudentReactivationConsultationDto'];
export type StudentReactivation = components['schemas']['StudentReactivationDto'];
export type StudentReactivationEffects = components['schemas']['StudentReactivationEffectsDto'];
export type StudentReactivationPreview = components['schemas']['StudentReactivationPreviewDto'];
export type StudentReactivationResult = components['schemas']['StudentReactivationResultDto'];
export type StudentRegistrationConflict = components['schemas']['StudentRegistrationConflictDto'];

export const studentKeys = {
  all: ['students'] as const,
  list: (params: StudentListQuery) => ['students', 'list', params] as const,
  detail: (id: number | null) => ['students', 'detail', id] as const,
  registrationOptions: ['students', 'registration-options'] as const,
  schools: (q: string) => ['students', 'schools', q] as const,
  reactivationCandidates: (params: StudentReactivationCandidateQuery) => ['students', 'reactivation-candidates', params] as const,
};

/** 응답 캐시가 남아 있어도 권한 없는 화면이 이를 그리지 않게 화면/요청이 같은 플래그를 읽는다. */
export function useStudentReadAllowed(): boolean {
  return useSession(state => Boolean(state.ready && state.me?.canAdminPage && state.me.canCrudAll));
}

export function useStudentRegistrationOptions(enabled = true) {
  const viewerId = useSession(state => state.me?.id ?? 'anonymous');
  const allowed = useStudentReadAllowed();
  return useQuery({
    queryKey: sessionQueryKey(studentKeys.registrationOptions, viewerId),
    queryFn: async ({ signal }) => (await api.get<StudentRegistrationOptions>('/students/options', { signal })).data,
    enabled: allowed && enabled,
  });
}

export function useStudentSchoolSearch(q: string, enabled = true) {
  const viewerId = useSession(state => state.me?.id ?? 'anonymous');
  const allowed = useStudentReadAllowed();
  const normalized = q.trim();
  return useQuery({
    queryKey: sessionQueryKey(studentKeys.schools(normalized), viewerId),
    queryFn: async ({ signal }) => (await api.get<StudentSchoolOption[]>('/students/schools', {
      params: { q: normalized }, signal,
    })).data,
    enabled: allowed && enabled && normalized.length > 0,
  });
}

export function useStudentSchoolCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: StudentSchoolCreate) => (await api.post<StudentSchoolOption>('/students/schools', body)).data,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: studentKeys.all }); },
  });
}

export function useStudentCreatePreview() {
  return useMutation({
    mutationFn: async (body: StudentCreate) => (await api.post<StudentCreatePreview>('/students/preview', body)).data,
  });
}

export function useStudentCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: StudentCreate) => (await api.post<StudentCreateResult>('/students', body)).data,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.detail(result.studentId) }),
      ]);
    },
  });
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

export function useStudentReactivationCandidates(params: StudentReactivationCandidateQuery, enabled = true) {
  const viewerId = useSession(state => state.me?.id ?? 'anonymous');
  const allowed = useStudentReadAllowed();
  return useQuery({
    queryKey: sessionQueryKey(studentKeys.reactivationCandidates(params), viewerId),
    queryFn: async ({ signal }) => (await api.get<StudentReactivationCandidates>('/students/reactivation-candidates', { params, signal })).data,
    enabled: allowed && enabled,
  });
}

interface StudentReactivationCommand {
  studentId: number;
  body: StudentReactivation;
}

export function useStudentReactivationPreview() {
  return useMutation({
    mutationFn: async ({ studentId, body }: StudentReactivationCommand) =>
      (await api.post<StudentReactivationPreview>(`/students/${studentId}/reactivate/preview`, body)).data,
  });
}

export function useStudentReactivate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ studentId, body }: StudentReactivationCommand) =>
      (await api.post<StudentReactivationResult>(`/students/${studentId}/reactivate`, body)).data,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.detail(result.studentId) }),
      ]);
    },
  });
}
