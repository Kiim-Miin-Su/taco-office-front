/**
 * 서버에서 읽어 오는 것 — **화면은 여기를 통해서만 데이터를 만난다.**
 *
 * 목 데이터를 프론트에 두지 않는 이유가 여기 있다. 시드가 진짜 Postgres 행을 만들고,
 * 그 행이 API 로 내려오고, 화면은 그것만 본다. 운영 데이터로 바뀌어도
 * 이 파일도 화면도 한 줄 안 바뀐다.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import type { Meta, OccurrenceList } from './types';

/** 쿼리 키는 여기서만 만든다 — 화면마다 문자열을 적으면 캐시가 갈라진다 */
export const qk = {
  meta: ['meta'] as const,
  occurrences: (p: OccParams) => ['schedule', 'occurrences', p] as const,
};

export interface OccParams {
  from: string;
  to: string;
  teacherId?: number;
  studentId?: number;
  roomId?: number;
}

/** 코드표는 거의 안 바뀐다 — 오래 들고 있는다 */
export function useMeta(): UseQueryResult<Meta> {
  return useQuery({
    queryKey: qk.meta,
    queryFn: async () => (await api.get<Meta>('/meta')).data,
    staleTime: 30 * 60 * 1000,
  });
}

/** 회차 — 일간·주간·월간·학생별·선생님별이 같은 것을 부르고 묶는 방법만 다르다 */
export function useOccurrences(p: OccParams, enabled = true): UseQueryResult<OccurrenceList> {
  return useQuery({
    queryKey: qk.occurrences(p),
    queryFn: async () => (await api.get<OccurrenceList>('/schedule/occurrences', { params: p })).data,
    enabled,
    staleTime: 60 * 1000,
  });
}
