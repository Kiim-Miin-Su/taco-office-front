/** @file-guide
 * 목적: queries.ts — qk, sessionQueryKey, opsQueryKey, RangeParams, BoardParams 등 (query)
 * 책임/재사용: qk/sessionQueryKey와 공용 api를 재사용한다. 서버 상태 복제 금지; 가역 mutation은 cancel/snapshot/patch/rollback/reconcile을 함께 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 서버에서 읽어 오는 것 — **화면은 여기를 통해서만 데이터를 만난다.**
 *
 * 목 데이터를 프론트에 두지 않는 이유가 여기 있다. 시드가 진짜 Postgres 행을 만들고,
 * 그 행이 API 로 내려오고, 화면은 그것만 본다. 운영 데이터로 바뀌어도
 * 이 파일도 화면도 한 줄 안 바뀐다.
 */
import {
  useMutation, useQuery, useQueryClient,
  type UseMutationResult, type UseQueryResult,
} from '@tanstack/react-query';
import { useSession } from '@/store/useSession';
import { api, ApiError } from './client';
import { beginScheduleOptimistic, settleScheduleOptimistic, type ScheduleOptimisticContext } from './schedule-optimistic';
import type {
  Accounting, AttendanceMutationResult, AttendanceWrite, Board, Books, ConsultingList, Exec, Guides, Horizon, Meta,
  OccurrenceCreate, OccurrenceDelete, OccurrenceList, OccurrenceMove, OccurrencePaste, OccurrencePatch, OccurrenceQuery,
  OkResult, Ops, ReportDetail, ReportList, ReportUpsert, RosterPatch, RosterResult, Unwritten, WriteResult,
  ChangeReqCreate, ChangeReqResult, Drawer, ReportDeliveryCreate, ReportDeliveryQueue,
  ReportDeliveryResult, ReportReview, ReportSendHistory, ReportSendHistoryList,
} from './types';

/** 쿼리 키는 여기서만 만든다 — 화면마다 문자열을 적으면 캐시가 갈라진다 */
export const qk = {
  meta: ['meta'] as const,
  occurrences: (p: OccParams) => ['schedule', 'occurrences', p] as const,
  reports: (p: ReportParams) => ['reports', p] as const,
  unwritten: (teacherId?: number) => ['reports', 'unwritten', teacherId ?? 'all'] as const,
  reportDetail: (serId: number, onDate: string) => ['reports', 'detail', serId, onDate] as const,
  reportDelivery: (onDate?: string) => ['reports', 'deliveries', onDate ?? 'yesterday'] as const,
  reportDeliveryHistory: (p: ReportDeliveryHistoryParams) => ['reports', 'deliveries', 'history', p] as const,
  accounting: ['accounting'] as const,
  ops: ['ops'] as const,
  consulting: ['consulting'] as const,
  books: ['books'] as const,
  guides: ['guides'] as const,
  board: (p: BoardParams) => ['board', p] as const,
  exec: (p: RangeParams) => ['exec', p] as const,
  horizon: ['schedule', 'horizon'] as const,
  drawer: ['drawer'] as const,
};

type ViewerId = number | 'anonymous';

/**
 * 서버 응답 캐시는 사용자 id까지 키에 포함한다.
 * 로그아웃 직전 시작된 요청이 늦게 끝나도 다음 사용자가 그 응답을 재사용하지 않는다.
 */
export function sessionQueryKey<T extends readonly unknown[]>(key: T, viewerId: ViewerId) {
  return [...key, 'viewer', viewerId] as const;
}

/** 비용 공개 범위는 서버 응답을 바꾸므로 같은 사용자도 권한별 캐시를 분리한다. */
export function opsQueryKey(viewerId: ViewerId, canMoney: boolean) {
  return [...sessionQueryKey(qk.ops, viewerId), { canMoney }] as const;
}

function useViewerId(): ViewerId {
  return useSession((s) => s.me?.id ?? 'anonymous');
}

/** from · to 만 받는 화면들이 같은 모양을 쓴다 */
export interface RangeParams {
  from: string;
  to: string;
}

export interface BoardParams extends RangeParams {
  teacherId?: number;
  subKey?: string;
}

export type OccParams = OccurrenceQuery;

/** 코드표는 거의 안 바뀐다 — 오래 들고 있는다 */
export function useMeta(enabled = true): UseQueryResult<Meta> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.meta, viewerId),
    queryFn: async () => (await api.get<Meta>('/meta')).data,
    enabled,
    staleTime: 30 * 60 * 1000,
  });
}

/** 회차 — 일간·주간·월간·학생별·선생님별이 같은 것을 부르고 묶는 방법만 다르다 */
export function useOccurrences(p: OccParams, enabled = true): UseQueryResult<OccurrenceList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.occurrences(p), viewerId),
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

export function useReports(p: ReportParams = {}, enabled = true): UseQueryResult<ReportList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.reports(p), viewerId),
    queryFn: async () => (await api.get<ReportList>('/reports', { params: p })).data,
    enabled,
    staleTime: 60 * 1000,
  });
}

/** §47 — 강사별로 몇 건 밀렸는지. 차감은 서버가 rules.ts 로 계산해 내려준다 (D-R32) */
export function useUnwritten(teacherId?: number, enabled = true): UseQueryResult<Unwritten> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.unwritten(teacherId), viewerId),
    queryFn: async () => (await api.get<Unwritten>('/reports/unwritten', { params: { teacherId } })).data,
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useReportDetail(
  serId?: number,
  onDate?: string,
): UseQueryResult<ReportDetail> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.reportDetail(serId ?? 0, onDate ?? ''), viewerId),
    queryFn: async () => (await api.get<ReportDetail>(`/reports/${serId}/${onDate}`)).data,
    enabled: serId !== undefined && onDate !== undefined,
    staleTime: 30 * 1000,
    // 예정 수업을 열어 둔 채 종료 시각이 지나도 서버 canEdit을 다시 받는다.
    // 종료 후에는 주기 조회를 멈춰 작성 중 폼의 불필요한 갱신을 피한다.
    refetchInterval: (query) => (query.state.data?.minutesSinceEnd ?? 0) < 0 ? 60_000 : false,
    refetchOnWindowFocus: true,
  });
}

export function useReportDelivery(onDate?: string, enabled = true): UseQueryResult<ReportDeliveryQueue> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.reportDelivery(onDate), viewerId),
    queryFn: async () => (await api.get<ReportDeliveryQueue>('/reports/deliveries', { params: { onDate } })).data,
    enabled,
    staleTime: 10 * 1000,
  });
}

export interface ReportDeliveryHistoryParams {
  onDate?: string;
  repId?: number;
}

export function useReportDeliveryHistory(
  p: ReportDeliveryHistoryParams = {}, enabled = true,
): UseQueryResult<ReportSendHistoryList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.reportDeliveryHistory(p), viewerId),
    queryFn: async () => (await api.get<ReportSendHistoryList>('/reports/deliveries/history', { params: p })).data,
    enabled,
    staleTime: 10 * 1000,
  });
}

/** 금액이 null 이면 볼 권한이 없는 것이다 — 화면이 0 으로 바꿔 쓰지 않는다 */
export function useAccounting(): UseQueryResult<Accounting> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.accounting, viewerId),
    queryFn: async () => (await api.get<Accounting>('/accounting')).data,
    staleTime: 60 * 1000,
  });
}

export function useOps(): UseQueryResult<Ops> {
  const viewerId = useViewerId();
  const canMoney = useSession((s) => s.me?.canMoney === true);
  return useQuery({
    queryKey: opsQueryKey(viewerId, canMoney),
    queryFn: async () => {
      const data = (await api.get<Ops>('/ops')).data;
      if (canMoney && data.canSeeAmounts === true) return data;
      // JWT는 발급 시점 권한이다. 현재 Me가 비공개면 과거 JWT 응답도 캐시에 넣기 전에 제한한다.
      // 회수 전 요청은 과거 권한 키에만 저장되고 현재 화면에 재사용되지 않는다.
      return {
        ...data, canSeeAmounts: false,
        marketing: data.marketing.map((row) => ({ ...row, cost: null, costPerEnroll: null })),
      };
    },
    staleTime: 60 * 1000,
  });
}

/** §29 컨설팅 — 금액은 canSeeAmounts 가 false 면 서버가 null 로 내려준다 */
export function useConsulting(): UseQueryResult<ConsultingList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.consulting, viewerId),
    queryFn: async () => (await api.get<ConsultingList>('/consulting')).data,
    staleTime: 60 * 1000,
  });
}

/** §36 교재 — 거의 안 바뀐다 */
export function useBooks(): UseQueryResult<Books> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.books, viewerId),
    queryFn: async () => (await api.get<Books>('/books')).data,
    staleTime: 10 * 60 * 1000,
  });
}

/** §41·§42 안내 — 강사면 서버가 자기 것만 내려준다 */
export function useGuides(): UseQueryResult<Guides> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.guides, viewerId),
    queryFn: async () => (await api.get<Guides>('/guides')).data,
    staleTime: 60 * 1000,
  });
}

/**
 * §34 수업 현황판 — 저장하지 않는 값이라 **오래 들고 있으면 안 된다** (D-R4).
 * 교재를 방금 배부했는데 마크가 그대로면 화면을 아무도 안 믿는다.
 */
export function useBoard(p: BoardParams): UseQueryResult<Board> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.board(p), viewerId),
    queryFn: async () => (await api.get<Board>('/board', { params: p })).data,
    staleTime: 10 * 1000,
  });
}

/** §69 대표 보고 — 여기도 집계는 저장하지 않는다 (D-R4) */
export function useExec(p: RangeParams): UseQueryResult<Exec> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.exec(p), viewerId),
    queryFn: async () => (await api.get<Exec>('/exec', { params: p })).data,
    staleTime: 30 * 1000,
  });
}

/* ══ 쓰기 ═══════════════════════════════════════════════════════════════
   성공하면 **그 범위만** 무효화한다. 전체 invalidate 는 화면 전체를 다시 요청하게 만든다
   (`AGENT.md §6.1-2`). 서버가 영향받은 규칙 id 를 돌려주므로 그것만 믿는다.          */

/** 펼쳐 둔 기간 — 화면이 「비었다」와 「아직 안 펼쳤다」를 구분하려고 읽는다 */
export function useHorizon(): UseQueryResult<Horizon> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.horizon, viewerId),
    queryFn: async () => (await api.get<Horizon>('/schedule/horizon')).data,
    staleTime: 60 * 60 * 1000,
  });
}

export type ReportWrite = {
  action: 'draft' | 'submit';
  serId: number;
  onDate: string;
  body: ReportUpsert;
};

type ReportReviewWrite = {
  serId: number;
  onDate: string;
  body: ReportReview;
};

/** 리포트 상태가 바뀌면 이 소비자들만 같은 경로로 갱신한다 (D-R7 · C-4). */
function refreshReportConsumers(
  qc: ReturnType<typeof useQueryClient>,
  viewerId: ViewerId,
  detail: ReportDetail,
): void {
  qc.setQueryData(sessionQueryKey(qk.reportDetail(detail.serId, detail.onDate), viewerId), detail);
  void qc.invalidateQueries({ queryKey: ['reports'] });
  void qc.invalidateQueries({ queryKey: ['schedule', 'occurrences'] });
  void qc.invalidateQueries({ queryKey: qk.accounting });
  void qc.invalidateQueries({ queryKey: ['board'] });
  void qc.invalidateQueries({ queryKey: ['exec'] });
  void qc.invalidateQueries({ queryKey: qk.drawer });
}

/** 임시저장·제출은 입력 계약과 캐시 무효화를 한 경로로 공유한다. */
export function useReportWrite(): UseMutationResult<ReportDetail, unknown, ReportWrite> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async (w) => {
      const path = `/reports/${w.serId}/${w.onDate}/${w.action === 'draft' ? 'draft' : 'submit'}`;
      return w.action === 'draft'
        ? (await api.put<ReportDetail>(path, w.body)).data
        : (await api.post<ReportDetail>(path, w.body)).data;
    },
    onSuccess: (detail) => refreshReportConsumers(qc, viewerId, detail),
  });
}

/** wait 상태만 승인/반려한다. 재제출은 기존 useReportWrite의 submit 경로를 그대로 쓴다. */
export function useReportReview(): UseMutationResult<ReportDetail, unknown, ReportReviewWrite> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async (w) => (
      await api.post<ReportDetail>(`/reports/${w.serId}/${w.onDate}/review`, w.body)
    ).data,
    onSuccess: (detail) => refreshReportConsumers(qc, viewerId, detail),
  });
}

/** 학생 1명 단위 계약만 제공한다. 전체 발송도 호출부가 이를 순차 재사용한다. */
export function useReportDeliverySend(): UseMutationResult<ReportSendHistory, unknown, ReportDeliveryCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (delivery) => (
      await api.post<ReportDeliveryResult>('/reports/deliveries', delivery)
    ).data.item,
    onSettled: () => {
      // 여러 학생 중 일부만 성공해도 큐와 이력은 반드시 서버 상태로 다시 맞춘다.
      void qc.invalidateQueries({ queryKey: ['reports', 'deliveries'] });
    },
  });
}

export function useReportDeliveryResend(): UseMutationResult<ReportSendHistory, unknown, {
  sendId: number; requestKey: string;
}> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sendId, requestKey }) => (
      await api.post<ReportDeliveryResult>(`/reports/deliveries/${sendId}/resend`, { requestKey })
    ).data.item,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reports', 'deliveries'] });
    },
  });
}

/**
 * 스케줄 쓰기 세 갈래를 **한 훅**으로 둔다.
 * 만들기·고치기·지우기·명단이 각자 훅을 가지면 무효화 규칙이 네 벌로 갈라진다.
 */
export type ScheduleWrite =
  | { kind: 'create'; body: OccurrenceCreate }
  | { kind: 'paste'; body: OccurrencePaste }
  | { kind: 'moveMany'; body: OccurrenceMove }
  | { kind: 'patch'; serId: number; body: OccurrencePatch }
  | { kind: 'delete'; serId: number; body: OccurrenceDelete }
  | { kind: 'roster'; serId: number; body: RosterPatch };

export function useScheduleWrite(): UseMutationResult<
  WriteResult | RosterResult, unknown, ScheduleWrite, ScheduleOptimisticContext
> {
  const qc = useQueryClient();
  // 성공과 오래된 회차 거절이 같은 서버 정본을 다시 읽는다. 전체 캐시 무효화는 하지 않는다.
  const reconcile = () => {
    void qc.invalidateQueries({ queryKey: ['schedule', 'occurrences'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    void qc.invalidateQueries({ queryKey: qk.horizon });
  };
  return useMutation({
    mutationFn: async (w: ScheduleWrite) => {
      if (w.kind === 'create') return (await api.post<WriteResult>('/schedule', w.body)).data;
      if (w.kind === 'paste') return (await api.post<WriteResult>('/schedule/paste', w.body)).data;
      if (w.kind === 'moveMany') return (await api.post<WriteResult>('/schedule/move', w.body)).data;
      if (w.kind === 'patch') return (await api.patch<WriteResult>(`/schedule/${w.serId}`, w.body)).data;
      if (w.kind === 'roster') return (await api.patch<RosterResult>(`/schedule/${w.serId}/roster`, w.body)).data;
      return (await api.delete<WriteResult>(`/schedule/${w.serId}`, { data: w.body })).data;
    },
    /**
     * 낙관 반영 — cancel → patch → (실패 시) rollback 이 한 세트다 (AGENT §6.1-3).
     * 범위(future·all)가 여러 회차를 바꾸는 경우에도 **잡은 회차 하나만** 미리 옮긴다 —
     * 나머지는 성공 후 무효화가 정확히 맞춘다. 미리 다 옮기려고 규칙을 화면에서
     * 다시 계산하면 판정이 두 벌이 된다.
     */
    onMutate: (w) => beginScheduleOptimistic(qc, w),
    onError: (e, _w, ctx) => {
      const stale = e instanceof ApiError && e.status === 404
        && ['NOT_FOUND', 'OCCURRENCE_NOT_FOUND', 'SOURCE_NOT_FOUND'].includes(e.code);
      // 다른 요청의 성공/낙관 값을 보존하고 마지막 정착 후에만 서버 정본을 읽는다.
      if (ctx ? settleScheduleOptimistic(qc, ctx, true, stale) : stale) reconcile();
    },
    // 회차/현황판/투영 기간만 갱신한다. 코드표·회계·운영은 그대로 유지한다.
    onSuccess: (_data, _w, ctx) => {
      if (ctx && settleScheduleOptimistic(qc, ctx, false, true)) reconcile();
    },
  });
}

export type AttendanceWriteCommand =
  | { action: 'save'; serId: number; onDate: string; body: AttendanceWrite }
  | { action: 'clear'; serId: number; onDate: string };

/** 출결 현재값을 바꾸면 같은 사실을 소비하는 조회를 한 경로에서 갱신한다. */
export function useAttendanceWrite(): UseMutationResult<
  AttendanceMutationResult, unknown, AttendanceWriteCommand
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w) => {
      const path = `/schedule/${w.serId}/${w.onDate}/attendance`;
      return w.action === 'save'
        ? (await api.put<AttendanceMutationResult>(path, w.body)).data
        : (await api.delete<AttendanceMutationResult>(path)).data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['schedule', 'occurrences'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: qk.accounting });
      void qc.invalidateQueries({ queryKey: ['exec'] });
    },
  });
}

/* ══ 서랍 — §14~§21 ══════════════════════════════════════════════════════
   여덟 칸을 **한 번에** 읽는다. 칸마다 훅을 두면 배지 숫자와 목록이 서로 다른
   시각의 데이터를 보게 된다 — 「3건이라는데 두 줄뿐」이 정확히 그렇게 생긴다. */

export function useDrawer(enabled = true): UseQueryResult<Drawer> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.drawer, viewerId),
    queryFn: async () => (await api.get<Drawer>('/drawer')).data,
    enabled,
    // 결재·알림은 남이 바꾼다. 서랍을 다시 열면 다시 읽는다.
    staleTime: 30 * 1000,
  });
}

/** 서랍에서 하는 쓰기 셋 — 승인·반려는 없다 (D-R27) */
export type DrawerWrite =
  | { kind: 'todo'; id: number; done: boolean }
  | { kind: 'notiRead'; id: number }
  | { kind: 'changeReq'; body: ChangeReqCreate };

export function useDrawerWrite(): UseMutationResult<
  OkResult | ChangeReqResult, unknown, DrawerWrite
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w: DrawerWrite) => {
      if (w.kind === 'todo') {
        return (await api.patch<OkResult>(`/drawer/todos/${w.id}`, { done: w.done })).data;
      }
      if (w.kind === 'notiRead') {
        return (await api.patch<OkResult>(`/drawer/notis/${w.id}/read`)).data;
      }
      return (await api.post<ChangeReqResult>('/drawer/change-requests', w.body)).data;
    },
    onSuccess: (_r, w) => {
      void qc.invalidateQueries({ queryKey: qk.drawer });
      // 할 일은 운영 탭(§62)에도 같은 행이 보인다
      if (w.kind === 'todo') void qc.invalidateQueries({ queryKey: qk.ops });
    },
  });
}
