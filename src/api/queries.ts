/**
 * 서버에서 읽어 오는 것 — **화면은 여기를 통해서만 데이터를 만난다.**
 *
 * 목 데이터를 프론트에 두지 않는 이유가 여기 있다. 시드가 진짜 Postgres 행을 만들고,
 * 그 행이 API 로 내려오고, 화면은 그것만 본다. 운영 데이터로 바뀌어도
 * 이 파일도 화면도 한 줄 안 바뀐다.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from './client';
import type {
  Accounting, Board, Books, Exec, Guides, Meta,
  OccurrenceList, Ops, ReportList, ConsultingList, Unwritten,
} from './types';

/** 쿼리 키는 여기서만 만든다 — 화면마다 문자열을 적으면 캐시가 갈라진다 */
export const qk = {
  meta: ['meta'] as const,
  occurrences: (p: OccParams) => ['schedule', 'occurrences', p] as const,
  reports: (p: ReportParams) => ['reports', p] as const,
  unwritten: (teacherId?: number) => ['reports', 'unwritten', teacherId ?? 'all'] as const,
  accounting: ['accounting'] as const,
  ops: ['ops'] as const,
  consulting: ['consulting'] as const,
  books: ['books'] as const,
  guides: ['guides'] as const,
  board: (p: RangeParams) => ['board', p] as const,
  exec: (p: RangeParams) => ['exec', p] as const,
};

/** from · to 만 받는 화면들이 같은 모양을 쓴다 */
export interface RangeParams {
  from: string;
  to: string;
}

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

export interface ReportParams {
  from?: string;
  to?: string;
  teacherId?: number;
  state?: string;
}

export function useReports(p: ReportParams = {}): UseQueryResult<ReportList> {
  return useQuery({
    queryKey: qk.reports(p),
    queryFn: async () => (await api.get<ReportList>('/reports', { params: p })).data,
    staleTime: 60 * 1000,
  });
}

/** §47 — 강사별로 몇 건 밀렸는지. 차감은 서버가 rules.ts 로 계산해 내려준다 (D-R32) */
export function useUnwritten(teacherId?: number): UseQueryResult<Unwritten> {
  return useQuery({
    queryKey: qk.unwritten(teacherId),
    queryFn: async () => (await api.get<Unwritten>('/reports/unwritten', { params: { teacherId } })).data,
    staleTime: 30 * 1000,
  });
}

/** 금액이 null 이면 볼 권한이 없는 것이다 — 화면이 0 으로 바꿔 쓰지 않는다 */
export function useAccounting(): UseQueryResult<Accounting> {
  return useQuery({
    queryKey: qk.accounting,
    queryFn: async () => (await api.get<Accounting>('/accounting')).data,
    staleTime: 60 * 1000,
  });
}

export function useOps(): UseQueryResult<Ops> {
  return useQuery({
    queryKey: qk.ops,
    queryFn: async () => (await api.get<Ops>('/ops')).data,
    staleTime: 60 * 1000,
  });
}

/** §29 컨설팅 — 금액은 canSeeAmounts 가 false 면 서버가 null 로 내려준다 */
export function useConsulting(): UseQueryResult<ConsultingList> {
  return useQuery({
    queryKey: qk.consulting,
    queryFn: async () => (await api.get<ConsultingList>('/consulting')).data,
    staleTime: 60 * 1000,
  });
}

/** §36 교재 — 거의 안 바뀐다 */
export function useBooks(): UseQueryResult<Books> {
  return useQuery({
    queryKey: qk.books,
    queryFn: async () => (await api.get<Books>('/books')).data,
    staleTime: 10 * 60 * 1000,
  });
}

/** §41·§42 안내 — 강사면 서버가 자기 것만 내려준다 */
export function useGuides(): UseQueryResult<Guides> {
  return useQuery({
    queryKey: qk.guides,
    queryFn: async () => (await api.get<Guides>('/guides')).data,
    staleTime: 60 * 1000,
  });
}

/**
 * §34 수업 현황판 — 저장하지 않는 값이라 **오래 들고 있으면 안 된다** (D-R4).
 * 교재를 방금 배부했는데 마크가 그대로면 화면을 아무도 안 믿는다.
 */
export function useBoard(p: RangeParams): UseQueryResult<Board> {
  return useQuery({
    queryKey: qk.board(p),
    queryFn: async () => (await api.get<Board>('/board', { params: p })).data,
    staleTime: 10 * 1000,
  });
}

/** §69 대표 보고 — 여기도 집계는 저장하지 않는다 (D-R4) */
export function useExec(p: RangeParams): UseQueryResult<Exec> {
  return useQuery({
    queryKey: qk.exec(p),
    queryFn: async () => (await api.get<Exec>('/exec', { params: p })).data,
    staleTime: 30 * 1000,
  });
}
