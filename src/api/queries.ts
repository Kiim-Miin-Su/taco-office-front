/** @file-guide
 * 목적: queries.ts — qk, sessionQueryKey, family, opsQueryKey, RangeParams 등 (query)
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
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { useSession } from '@/store/useSession';
import { api, ApiError } from './client';
import { beginScheduleOptimistic, settleScheduleOptimistic, type ScheduleOptimisticContext } from './schedule-optimistic';
import type {
  Accounting,
  AttendanceMutationResult,
  AttendanceWrite,
  Board,
  BookHistory,
  BookHistoryQuery,
  BookIssue,
  BookIssueCreate,
  BookIssueDiag,
  BookIssueTransition,
  BookPack,
  BookPackPatch,
  BookPacks,
  BookPackWrite,
  BookPatch,
  Books,
  BookShelfQuery,
  BookTracking,
  BookVersion,
  BookVersionCreate,
  BookWrite,
  CarryRow,
  Catalog,
  CatalogKind,
  CatalogSub,
  ChangeReqCreate,
  ChangeReqResult,
  ConflictPreview,
  ConflictRow,
  ConsAccounting,
  ConsAccountRow,
  ConsItem,
  ConsItemsEdit,
  ConsPaymentCreate,
  ConsStudents,
  ConsClose, ConsCloseResult, ConsSession, ConsSessionCreate, ConsSessionsResult, ConsSessionWrite, GpaCycleCloseResult,
  ConsultingCreate,
  ConsultingPatch,
  ConsultingDetail,
  ConsultingFeedback,
  ConsultingFeedbackCreate,
  ConsultingFile,
  ConsultingFileCreate,
  ConsultingList,
  ConsultingShareUpdate,
  DayCancel,
  DayCancelNoticeList,
  DayCancelResult,
  Drawer,
  DrawerTodoClearResult,
  DrawerTodoCreate,
  DrawerTodoPatch,
  DrawerTodoCreateResult,
  Exec,
  ExecMemoWrite,
  ExecQuery,
  ExecReportWriteResult,
  ExecReview,
  ExecSubmit,
  Expense,
  ExpenseReview,
  FileRef,
  FileUpload,
  GpaBoard,
  GpaStudent,
  GpaUse,
  GpaUseCreate,
  Guide,
  GuideBody,
  GuideCopyResult,
  GuideDraftCreate,
  GuideHistory,
  GuideHistoryQuery,
  Guides,
  GuideStudents,
  ReceivedGuides,
  GuideTemplate,
  GuideTemplateWrite,
  ZoomNoticeResult,
  ZoomNoticeWrite,
  ZoomNoticeBatchResult,
  Horizon,
  InvBoard,
  Invoice,
  InvoiceBatch,
  InvoiceBatchResult,
  InvoiceIssue,
  InvoiceVoid,
  PayoutConfirm,
  PayoutSheet,
  PayoutSheetRow,
  StudentWithdraw,
  WithdrawResult,
  RateBook, RateRow, StudentRateRow, RateWrite, StudentRateWrite, ExpenseCreate,
  Member, StaffCreate, StaffPasswordReset, StaffPatch, WageHistory, WageRow, WageWrite,
  LeadEnroll, EnrollResult, Complaint, ComplaintCreate, ComplaintPatch, TeacherChange, TeacherChangeResult,
  KindCreate,
  KindPatch,
  Lead,
  LeadCreate,
  LeadPatch,
  LeadFail,
  LeadResume,
  LeadStageMove,
  LeadTouchWrite,
  LessonTracking,
  HolidayList,
  ScheduleUnavList,
  ScheduleSeriesCounts,
  ScheduleStudentBooks,
  ScheduleTeacherGuides,
  MeetingCreate,
  MeetingCreateResult,
  MeetingDetail,
  MeetingNoticeResult,
  ExecAreaOwner,
  ExecAreaOwnerWrite,
  Meta,
  MfbThread,
  MonthClose,
  MonthCloseWrite,
  MonthReopenWrite,
  OccurrenceCreate,
  OccurrenceDelete,
  OccurrenceList,
  OnboardingInfo,
  PasswordResetInfo,
  OccurrenceMove,
  OccurrencePaste,
  OccurrencePatch,
  OccurrenceQuery,
  OkResult,
  Ops,
  OtherIncome,
  ManualPaymentCreate,
  Payment,
  PaymentCreate,
  PlanCreate,
  PlanCreateResult,
  PlanDetail,
  PlanPatch,
  ReportDeliveryCreate,
  ReportDeliveryQuery,
  ReportDeliveryQueue,
  ReportDeliveryResult,
  ReportDetail,
  ReportHistoryQuery,
  ReportList,
  ReportQuery,
  ReportReminderCreate,
  ReportReminderResult,
  ReportReview,
  ReportSendHistory,
  ReportSendHistoryList,
  WeeklyBundle,
  WeeklyBundleList,
  WeeklySummaryWrite,
  ReportTeacherQuery,
  ReportUpsert,
  ReqReviewResult,
  ApprovalUndoResult,
  MyExpenseList,
  PermissionTable,
  TeacherGpaRequestOptions,
  RosterPatch,
  RosterResult,
  ScheduleHistory,
  ScheduleHistoryQuery,
  ScheduleUndo,
  StudentPauseResult,
  StudentPauseWrite,
  StudentResumeWrite,
  NoteCreate,
  TrackedNote,
  SubCreate,
  SubPatch,
  TeacherDiagCreate,
  TeacherGuideDiag,
  TeacherGuides,
  TeacherHistory,
  TeacherHome,
  TeacherShell,
  TeacherSettingReqCreate,
  TeacherSettingRequest,
  TeacherSuggestion,
  TeacherSuggestionCreate,
  TeacherSuggestions,
  TeacherUnav,
  TeacherUnavBlock,
  TeacherUnavCreate,
  Tuition,
  Unwritten,
  WriteResult,
  ZoomAccountCreate,
  ZoomAccountPatch,
  ZoomAcct,
  ZoomAssign,
  ZoomAssignResult,
  ZoomBoard,
  GuardianChannels, GuardianCreate, Guardian, GuardianList, GuardianPatch, GuardianSend, GuardianSendResult,
  LeadDiagList, LeadDiagWrite,
  // 옛 로컬 훅 파일 셋(intake · ops · accounting)에서 옮긴 훅이 쓰는 별칭 (W11 D)
  AcctPrivacy, AcctPrivacyWrite, Cashflow, InvoiceDraft, LeadAppt, LeadApptScheduleResult, LeadApptWrite, LeadPlanWrite,
  Marketing, MarketingCreate, PayoutBonusBook, PayoutBonusRule, PayoutBonusRuleWrite, PayoutDetail, PlanTaskCreate, Suggestion,
} from './types';

/** 쿼리 키는 여기서만 만든다 — 화면마다 문자열을 적으면 캐시가 갈라진다 */
export const qk = {
  meta: ['meta'] as const,
  occurrences: (p: OccParams) => ['schedule', 'occurrences', p] as const,
  dayCancelNotices: (date: string) => ['schedule', 'day-cancel-notices', date] as const,
  reports: (p: ReportParams) => ['reports', p] as const,
  unwritten: (teacherId?: number) => ['reports', 'unwritten', teacherId ?? 'all'] as const,
  reportDetail: (serId: number, onDate: string) => ['reports', 'detail', serId, onDate] as const,
  reportDelivery: (onDate?: string) => ['reports', 'deliveries', onDate ?? 'yesterday'] as const,
  reportDeliveryHistory: (p: ReportDeliveryHistoryParams) => ['reports', 'deliveries', 'history', p] as const,
  /** §47 주간 트래킹(N-54) — 리포트 갈래 안이라 리포트가 바뀌면 함께 버려진다. 주가 키에 든다 */
  reportWeekly: (weekOf?: string) => ['reports', 'weekly', weekOf ?? 'default'] as const,
  accounting: ['accounting'] as const,
  /** §54 수업료 계산 — 회계 갈래 안의 다른 질의다. 달이 키에 든다 (C65) */
  tuition: (month: string | undefined) => ['accounting', 'tuition', month ?? 'current'] as const,
  /** §57 그 밖의 수입 — 같은 회계 갈래의 다른 질의다 (C66). 눈금이 키에 든다 (C70) */
  otherIncome: (span: string) => ['accounting', 'other-income', span] as const,
  /** §52 트래킹 보드 — 같은 갈래의 또 다른 질의다 (C69) */
  invBoard: ['accounting', 'board'] as const,
  /** §57 강사료 시트 — 같은 갈래의 또 다른 질의다 (C94-b). 달이 키에 든다 */
  payoutSheet: (month: string) => ['accounting', 'payouts', month] as const,
  rateBook: ['accounting', 'rates'] as const,
  /** 강사 시급 이력 — 같은 회계 갈래 (C97 · D-48). 사람이 키에 든다 */
  wageHistory: (staffId: number) => ['accounting', 'wages', staffId] as const,
  /* 옛 `accounting-queries.ts` 의 키 다섯 — 모양은 옮기기 전과 한 글자도 같다(회계 갈래 앞자락 밑 · W11 D) */
  /** §55 들어온 돈 — 기간 · 분류 칩이 키에 든다(빈 값은 뺀다 — `{from: undefined}` 와 `{}` 가 두 캐시가 되지 않게) */
  cashflow: (p: CashflowParams) => ['accounting', 'cashflow', cashflowParams(p)] as const,
  /** §56 강사 한 사람 상세 — 사람과 달이 키에 든다 */
  payoutDetail: (staffId: number, month: string) => ['accounting', 'payouts', 'detail', staffId, month] as const,
  /** 발행 미리 세기 (N-79) — 학생 · 달 · 종류가 키에 든다. 조건이 없으면(꺼 둔 질의) 「none」 한 칸 */
  invoiceDraft: (p: InvoiceDraftParams | null) => (p
    ? ['accounting', 'invoices', 'draft', p.studentId, p.yearMonth, p.invType] as const
    : ['accounting', 'invoices', 'draft', 'none'] as const),
  /** 가산 규칙 (N-93) — 정리 · 기준 탭과 강사료 정산 「추가로 드리는 돈」이 같은 키를 읽는다 */
  bonusBook: ['accounting', 'bonus-rules'] as const,
  /** 탭 줄 두 비공개 스위치 (N-94) */
  acctPrivacy: ['accounting', 'privacy'] as const,
  ops: ['ops'] as const,
  consulting: ['consulting'] as const,
  /** §30 계약 5단계 상세 — 건별 서버 projection. */
  consultingDetail: (id: number) => ['consulting', 'detail', id] as const,
  /** §28 회계 — 같은 탭의 다른 질의다. 갈래 앞자락은 `family.consulting` (C58) */
  consAccounting: ['consulting', 'accounting'] as const,
  /** §27 학생별 — CONS 를 학생 기준으로 재구성한 같은 갈래의 다른 질의 (C59) */
  consStudents: ['consulting', 'students'] as const,
  books: ['books'] as const,
  /** §39 서가 — 고른 필터마다 한 칸 (N-47 · 필터가 없으면 `books` 와 같은 칸을 쓴다) */
  bookShelf: (p: BookShelfQuery) => ['books', 'shelf', p] as const,
  /** §38 배부 창의 진단 한 줄 (N-62) */
  bookIssueDiag: (studentId: number) => ['books', 'issue-diag', studentId] as const,
  bookHistory: ['books', 'history'] as const,
  bookTracking: ['books', 'tracking'] as const,
  bookPacks: ['books', 'deliveries'] as const,
  guides: ['guides'] as const,
  guideStudents: ['guides', 'students'] as const,
  guideHistoryRoot: ['guides', 'history'] as const,
  guideHistory: (p: GuideHistoryQuery) => ['guides', 'history', p] as const,
  guideTemplates: ['guides', 'templates'] as const,
  /** §11 개인 머리 「안내 N」(N-100) — 안내 갈래 안에 산다: 보내기·확인 쓰기가 `family.guides` 를 버리면 이 수도 다시 온다 */
  teacherGuideCount: (teacherId: number) => ['guides', 'teacher-unconfirmed', teacherId] as const,
  board: (p: BoardParams) => ['board', p] as const,
  exec: (p: ExecQuery) => ['exec', p] as const,
  horizon: ['schedule', 'horizon'] as const,
  /* 알림 범위가 키에 들어간다 — 「예전 것도 보기」가 캐시를 갈아 끼워야 하기 때문이다 (N-7 · D-16) */
  drawer: (notiWindow: 'month' | 'all' = 'month') => ['drawer', notiWindow] as const,
  teacherHome: ['teacher', 'home'] as const,
  /* 강사 머리줄(시간대·시급·내 알림) — 강사 전용 · 서버가 본인 고정 */
  teacherShell: ['teacher', 'shell'] as const,
  teacherHistory: (month: string | undefined) => ['teacher', 'history', month ?? 'current'] as const,
  teacherSuggestions: ['teacher', 'suggestions'] as const,
  receivedGuides: ['teacher', 'received-guides'] as const,
  teacherGuides: (week: string | undefined) => ['teacher', 'guides', week ?? 'current'] as const,
  teacherUnav: (anchor: string | undefined) => ['teacher', 'unavailable', anchor ?? 'current'] as const,
  gpa: (anchor: string | undefined) => ['gpa', anchor ?? 'current'] as const,
  zoom: (onDate: string | undefined) => ['zoom', onDate ?? 'today'] as const,
  catalog: ['catalog'] as const,
  /** §65 기획 보고서 — 창을 열 때만 도는 질의. 갈래 전체는 `family.plan` (C56) */
  plan: (id: number) => ['ops', 'plan', id] as const,
  /** §66 회의 상세 — 창을 열 때만 도는 질의. 갈래는 `family.ops` 안이다 (C57) */
  meeting: (id: number) => ['ops', 'meeting', id] as const,
  /** §79 수강 학생 — 창을 열 때만 도는 질의. 갈래 전체를 버릴 때는 `family.tracking` (C55) */
  tracking: (serId: number, onDate: string) => ['schedule', 'tracking', serId, onDate] as const,
  /** 공휴일 이름표 — 원문 §09 월간 칸 칩 · §10 요일 머리. 표시 전용이라 쓰기가 버리지 않는다 */
  holidays: (from: string, to: string) => ['schedule', 'holidays', from, to] as const,
  /** 강사 불가 시간(관리자 읽기) — 원문 §07·§11 데이터 줄의 UNAV · 「가능 시간」 겹쳐 보기(G37) */
  scheduleUnav: (from: string, to: string) => ['schedule', 'unavailable', from, to] as const,
  /**
   * §07 사이드바 일정 원본 수 — 기간과 무관하다(키에 기간이 없다). 스케줄 쓰기가 `family.seriesCounts` 로 버린다.
   * `['schedule','occurrences']` 밑에 두지 않는다 — 그 앞자락은 낙관 반영이 회차 목록 모양으로 고쳐 쓴다.
   */
  seriesCounts: ['schedule', 'series-counts'] as const,
  /** §10 개인 머리 「교재 없음」 — 교재 갈래 안에 산다: 배부 쓰기가 `family.books` 를 버리면 이 칩도 다시 온다 */
  studentBooks: (studentId: number) => ['books', 'student', studentId] as const,
  /** 학생의 보호자 (DQ3) — 창을 열 때만 도는 질의. 갈래 전체는 `family.guardians` */
  guardians: (studentId: number) => ['guardians', 'student', studentId] as const,
  /** 지금 보낼 수 있는 채널 — 서버 설정이 정한다 (DQ3) */
  guardianChannels: ['guardians', 'channels'] as const,
  /** 서랍 요청함 「내 지출 신청」 (N-52) — 회계 갈래 안이지만 **본인 것만** 온다. 칸을 열 때만 부른다 */
  myExpenses: ['accounting', 'expenses', 'mine'] as const,
  /**
   * §20 「최근 변경 이력」 (W11 A' 후속) — 칸을 열 때만 부르고 열 때마다 다시 읽는다.
   * `['drawer']` 밑에 두지 않는다 — 그 앞자락은 서랍 쓰기의 낙관 반영이 서랍 모양으로 고쳐 쓴다.
   */
  scheduleHistory: (beforeId?: number) => ['schedule', 'history', beforeId ?? 'latest'] as const,
  /** §76 권한 표 · 창 부제 · 역할 설명 줄 (N-98) — 권한 창과 옛 `/permissions` 가 같은 키를 읽는다 */
  permissions: ['permissions'] as const,
  /** 강사 「GPA 회차 요청」의 서비스 고르기 (N-99) — 규정표라 거의 안 바뀐다 */
  teacherGpaRequestOptions: ['teacher', 'gpa-request-options'] as const,
};

type ViewerId = number | 'anonymous';

/**
 * 서버 응답 캐시는 사용자 id까지 키에 포함한다.
 * 로그아웃 직전 시작된 요청이 늦게 끝나도 다음 사용자가 그 응답을 재사용하지 않는다.
 */
export function sessionQueryKey<T extends readonly unknown[]>(key: T, viewerId: ViewerId) {
  return [...key, 'viewer', viewerId] as const;
}

/**
 * **갈래 앞자락** — 뒤에 무엇이 붙든(기준일·달·조건) 그 갈래를 통째로 버릴 때 쓴다.
 *
 * `sessionQueryKey` 는 사용자 id 를 키의 **꼬리**에 붙인다. 그래서 갈래를 버리겠다고
 * `sessionQueryKey(['zoom'], viewerId)` 를 쓰면 `['zoom','viewer',1]` 이 되는데,
 * 실제 키는 `['zoom','2026-09-13','viewer',1]` 이라 **어디에도 걸리지 않는다** —
 * 조용히 아무것도 안 버리고 화면은 옛 값을 계속 보여 준다.
 * 앞자락에는 꼬리를 넣지 않는다. 남의 캐시까지 함께 버려도 손해는 다시 받아오는 것뿐이다.
 *
 * 앞자락이 정말 `qk` 의 앞자락인지는 `queries-family.test.ts` 가 기계로 확인한다.
 */
export const family = {
  occurrences: ['schedule', 'occurrences'] as const,
  dayCancelNotices: ['schedule', 'day-cancel-notices'] as const,
  horizon: ['schedule', 'horizon'] as const,
  reports: ['reports'] as const,
  reportDeliveries: ['reports', 'deliveries'] as const,
  reportWeekly: ['reports', 'weekly'] as const,
  board: ['board'] as const,
  exec: ['exec'] as const,
  accounting: ['accounting'] as const,
  ops: ['ops'] as const,
  drawer: ['drawer'] as const,
  teacherHome: ['teacher', 'home'] as const,
  teacherShell: ['teacher', 'shell'] as const,
  teacherHistory: ['teacher', 'history'] as const,
  teacherGuides: ['teacher', 'guides'] as const,
  receivedGuides: ['teacher', 'received-guides'] as const,
  teacherUnav: ['teacher', 'unavailable'] as const,
  gpa: ['gpa'] as const,
  zoom: ['zoom'] as const,
  guides: ['guides'] as const,
  books: ['books'] as const,
  consulting: ['consulting'] as const,
  tracking: ['schedule', 'tracking'] as const,
  holidays: ['schedule', 'holidays'] as const,
  scheduleUnav: ['schedule', 'unavailable'] as const,
  seriesCounts: ['schedule', 'series-counts'] as const,
  scheduleHistory: ['schedule', 'history'] as const,
  guardians: ['guardians'] as const,
};

/**
 * 운영 탭이 **무엇을 받을지** — 기간과 갈래 (C96 · N-46 ② · J-102).
 *
 * **검색 인자는 없다** — §24 FQ 는 받은 목록에서 거른다. 여기 드는 것은 「무엇을 받을지」뿐이다.
 */
export interface OpsQuery {
  from?: string;
  to?: string;
  /** §67 컴플레인 갈래 — 칩 줄이 고른다 */
  area?: string;
}

/**
 * 비용 공개 범위는 서버 응답을 바꾸므로 같은 사용자도 권한별 캐시를 분리한다.
 *
 * 기간·갈래도 **응답을 바꾸므로 키에 든다** (C96). 앞자락은 `qk.ops` 그대로라
 * `useOpsInvalidate` 의 접두 무효화가 기간을 바꿔 가며 쌓인 캐시를 전부 걷는다.
 */
export function opsQueryKey(viewerId: ViewerId, canMoney: boolean, query: OpsQuery = {}) {
  return [...sessionQueryKey(qk.ops, viewerId), { canMoney }, opsQueryPart(query)] as const;
}

/** 빈 값은 키에서 뺀다 — `{from: undefined}` 와 `{}` 가 다른 캐시가 되면 토글 한 번에 두 번 받는다 */
function opsQueryPart(query: OpsQuery): OpsQuery {
  const part: OpsQuery = {};
  if (query.from) part.from = query.from;
  if (query.to) part.to = query.to;
  if (query.area) part.area = query.area;
  return part;
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

/** 기간·검색이 다른 이력 캐시를 갈라 놓되 family.books로 함께 무효화한다. */
export function bookHistoryQueryKey(p: BookHistoryQuery) {
  return [...qk.bookHistory, p] as const;
}

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

/** N-133 전일 휴원 — reload 뒤에도 날짜별 학부모 선택 발송을 이어 간다. */
export function useDayCancelNotices(date: string, enabled = true): UseQueryResult<DayCancelNoticeList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.dayCancelNotices(date), viewerId),
    queryFn: async () => (await api.get<DayCancelNoticeList>('/schedule/day-cancel/notices', { params: { date } })).data,
    enabled,
    staleTime: 30 * 1000,
  });
}

/**
 * 공휴일 이름표 — 원문 §09 월간 칸 「광복절」·「광복절 대체」 칩 · §10 요일 머리 (g1 §09 #2 · §10 #8).
 * 서버 표(HOLIDAY)에서 읽는다 — 화면이 공휴일 사본을 들지 않는다. 날짜의 사실이라 오래 둔다.
 */
export function useScheduleHolidays(range: { from: string; to: string }, enabled = true): UseQueryResult<HolidayList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.holidays(range.from, range.to), viewerId),
    queryFn: async () => (await api.get<HolidayList>('/schedule/holidays', { params: range })).data,
    enabled,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * 강사 불가 시간 — **관리자 읽기** (원문 §07·§11 데이터 줄의 UNAV · G37). 「가능 시간」을 켰을 때만 부른다.
 * 막는 자료가 아니라 겹쳐 보는 자료다 — 저장 판정은 서버 쓰기의 경고(`unavailable`)가 그대로 한다.
 */
export function useScheduleUnavailable(range: { from: string; to: string }, enabled: boolean): UseQueryResult<ScheduleUnavList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.scheduleUnav(range.from, range.to), viewerId),
    queryFn: async () => (await api.get<ScheduleUnavList>('/schedule/unavailable', { params: range })).data,
    enabled,
    staleTime: 60 * 1000,
  });
}

/**
 * §07 좌측 사이드바 「프로그램」·「과목」 수 — **보는 기간과 무관한 일정 원본(SER) 수** (D-R44).
 * 묶음 수·합계까지 서버가 센다 — 화면은 그리기만 한다. 사이드바를 펼쳤을 때만 부른다(기본 접힘).
 */
export function useScheduleSeriesCounts(enabled: boolean): UseQueryResult<ScheduleSeriesCounts> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.seriesCounts, viewerId),
    queryFn: async () => (await api.get<ScheduleSeriesCounts>('/schedule/series-counts')).data,
    enabled,
    staleTime: 30 * 1000,
  });
}

/** §10 학생별 개인 머리 「교재 없음」 — 배부 완료 교재 수와 낱말은 서버가 준다(§79·§12 와 같은 판정) */
export function useStudentBooks(studentId: number | null, enabled = true): UseQueryResult<ScheduleStudentBooks> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.studentBooks(studentId ?? 0), viewerId),
    queryFn: async () => (await api.get<ScheduleStudentBooks>(`/schedule/students/${studentId}/books`)).data,
    enabled: enabled && studentId !== null,
    staleTime: 30 * 1000,
  });
}

/**
 * §11 선생님별 개인 머리 「안내 N」(N-100) — 그 강사에게 보냈는데 아직 확인 안 된 안내 수.
 * 세는 법(S4 상태 「보냄」)은 서버 한 곳이다 — 화면은 수를 그리기만 한다.
 */
export function useScheduleTeacherGuides(teacherId: number | null, enabled = true): UseQueryResult<ScheduleTeacherGuides> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.teacherGuideCount(teacherId ?? 0), viewerId),
    queryFn: async () => (await api.get<ScheduleTeacherGuides>(`/schedule/teachers/${teacherId}/guides`)).data,
    enabled: enabled && teacherId !== null,
    staleTime: 30 * 1000,
  });
}

/** 날짜·상태·숫자 필터는 생성 OpenAPI만 소유한다. */
export type ReportParams = ReportQuery;

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
export function useUnwritten(teacherId?: ReportTeacherQuery['teacherId'], enabled = true): UseQueryResult<Unwritten> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.unwritten(teacherId), viewerId),
    queryFn: async () => (await api.get<Unwritten>('/reports/unwritten', { params: { teacherId } })).data,
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useReportDetail(serId?: number, onDate?: string): UseQueryResult<ReportDetail> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.reportDetail(serId ?? 0, onDate ?? ''), viewerId),
    queryFn: async () => (await api.get<ReportDetail>(`/reports/${serId}/${onDate}`)).data,
    enabled: serId !== undefined && onDate !== undefined,
    staleTime: 30 * 1000,
    // 예정 수업을 열어 둔 채 종료 시각이 지나도 서버 canEdit을 다시 받는다.
    // 종료 후에는 주기 조회를 멈춰 작성 중 폼의 불필요한 갱신을 피한다.
    refetchInterval: (query) => ((query.state.data?.minutesSinceEnd ?? 0) < 0 ? 60_000 : false),
    refetchOnWindowFocus: true,
  });
}

export function useReportDelivery(onDate?: ReportDeliveryQuery['onDate'], enabled = true): UseQueryResult<ReportDeliveryQueue> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.reportDelivery(onDate), viewerId),
    queryFn: async () => (await api.get<ReportDeliveryQueue>('/reports/deliveries', { params: { onDate } })).data,
    enabled,
    staleTime: 10 * 1000,
  });
}

export type ReportDeliveryHistoryParams = ReportHistoryQuery;

export function useReportDeliveryHistory(
  p: ReportDeliveryHistoryParams = {},
  enabled = true,
): UseQueryResult<ReportSendHistoryList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.reportDeliveryHistory(p), viewerId),
    queryFn: async () => (await api.get<ReportSendHistoryList>('/reports/deliveries/history', { params: p })).data,
    enabled,
    staleTime: 10 * 1000,
  });
}

/**
 * §47 주간 트래킹 — 그 주 학생별 묶음(N-54). 본문 · 보내기 가능 여부 · 막힌 이유는 서버가 준다(D-R37 · D-R39).
 * 그 탭을 열 때만 부른다(`enabled`) — 다른 탭은 이 질의를 치르지 않는다.
 */
export function useReportWeekly(weekOf?: string, enabled = true): UseQueryResult<WeeklyBundleList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.reportWeekly(weekOf), viewerId),
    queryFn: async () => (await api.get<WeeklyBundleList>('/reports/weekly', { params: { weekOf } })).data,
    enabled,
    staleTime: 10 * 1000,
  });
}

/** 총평 쓰기 — 저장 뒤 묶음을 서버 값으로 다시 맞춘다(보내기 가능 여부가 바뀐다) */
export function useReportWeeklySummary(): UseMutationResult<WeeklyBundle, unknown, WeeklySummaryWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put<WeeklyBundle>('/reports/weekly', body)).data,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.reportWeekly });
    },
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

/**
 * §54 수업료 계산 — 그 탭을 열 때만 돈다.
 *
 * 청구서가 쓰는 바로 그 계산이라(§54 연동 줄) 화면은 받은 숫자를 그리기만 한다 —
 * %도 합계도 서버가 낸 값이다 (D-R37).
 */
export function useTuition(month?: string, enabled = true): UseQueryResult<Tuition> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.tuition(month), viewerId),
    queryFn: async () => (await api.get<Tuition>('/accounting/tuition', { params: month ? { month } : {} })).data,
    enabled,
  });
}

/** §57 그 밖의 수입 — 그 탭을 열 때만 부른다 (§27 학생별 탭과 같은 선례 · C59) */
export function useOtherIncome(span = 'month', enabled = true): UseQueryResult<OtherIncome> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.otherIncome(span), viewerId),
    queryFn: async () => (await api.get<OtherIncome>('/accounting/other-income', { params: { span } })).data,
    enabled,
  });
}

/**
 * §57 강사료 시트 (C94-b · H-82 · D-43) — 그 탭을 열 때만 부른다. 달이 키에 든다.
 *
 * 쓴 수업만 세고 미작성은 빠지며 얼마가 빠졌는지도 서버가 센다 — 강사 화면(§57 `/teacher/history`)과
 * **같은 함수**(`lib/payout-sheet`)라 두 화면이 다른 수를 말할 수 없다. 화면은 받은 숫자를 그리기만 한다 (D-R37).
 */
export function usePayoutSheet(month: string, enabled = true): UseQueryResult<PayoutSheet> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.payoutSheet(month), viewerId),
    queryFn: async () => (await api.get<PayoutSheet>('/accounting/payouts', { params: { month } })).data,
    enabled,
  });
}

/**
 * 단가표 — 기본 단가(RATE)와 학생별 예외(STURATE) (C94-d · §54 「데이터 RATE, STURATE」). 그 탭을 열 때만 부른다.
 * 청구서·§54·명단 가격이 읽는 바로 그 두 표이고, 「살아 있는 줄」은 서버가 오늘 기준으로 판정한다 (D-R37).
 */
export function useRateBook(enabled = true): UseQueryResult<RateBook> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.rateBook, viewerId),
    queryFn: async () => (await api.get<RateBook>('/accounting/rates')).data,
    enabled,
  });
}

/** §52 트래킹 보드 — 그 탭을 열 때만 부른다 */
export function useInvBoard(enabled = true): UseQueryResult<InvBoard> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.invBoard, viewerId),
    queryFn: async () => (await api.get<InvBoard>('/accounting/board')).data,
    enabled,
  });
}

/* ── 회계 조회 · 쓰기 (w5 · W11) — 옛 `components/accounting/accounting-queries.ts` 에서 **몸통 그대로** 옮겼다 (W11 D) ──
 * 키는 전부 `family.accounting` 앞자락 밑(`qk.cashflow` · `qk.payoutDetail` · `qk.invoiceDraft` · `qk.bonusBook` · `qk.acctPrivacy`)이라
 * 입금 · 발행 · 확정 같은 회계 쓰기가 그 앞자락을 버리면 이 조회들도 같이 다시 읽힌다. 키 · 무효화 · 켜는 조건은 옮기기 전과 같다. */

/** 발행 미리 세기 조건 — 서버가 회차로 세는 두 종류만 (응시료는 사람이 줄을 적는다) */
export interface InvoiceDraftParams { studentId: number; yearMonth: string; invType: 'tuition' | 'diag_intake' }

/** §55 조회 조건 — 기간(없으면 전체)과 분류 칩. 빈 값은 키와 질의에서 뺀다(같은 조건이 두 캐시가 되지 않게) */
export interface CashflowParams { from?: string; to?: string; category?: string }

/** `qk.cashflow` 와 질의가 같은 조각을 쓴다 — 빈 값을 뺀 조건 */
function cashflowParams(p: CashflowParams): CashflowParams {
  const out: CashflowParams = {};
  if (p.from) out.from = p.from;
  if (p.to) out.to = p.to;
  if (p.category) out.category = p.category;
  return out;
}

/**
 * §55 들어온 돈 — 기간 요약 · 입금 달력 · 분류별 · 미수 전체 (w5 · 55-01 · 55-02 · 55-03 · 55-05).
 * 세는 것도 기간 낱말도 서버다 — 화면은 받은 숫자를 그린다 (D-R37 · D-R18). 그 탭을 열 때만 부른다.
 */
export function useCashflow(params: CashflowParams, enabled = true): UseQueryResult<Cashflow> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.cashflow(params), viewerId),
    queryFn: async () => (await api.get<Cashflow>('/accounting/cashflow', { params: cashflowParams(params) })).data,
    enabled,
  });
}

/**
 * §56 강사 한 사람 상세 — 시급 · 수업 날짜 · 리포트 미작성 · 정산 내역 (w5 · 56-01).
 * 시트와 같은 함수가 센 값이다 — 줄의 총액과 수업 줄의 합이 갈리지 않는다. 고른 사람이 있을 때만 부른다.
 */
export function usePayoutDetail(staffId: number | null, month: string): UseQueryResult<PayoutDetail> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.payoutDetail(staffId ?? 0, month), viewerId),
    queryFn: async () => (await api.get<PayoutDetail>(`/accounting/payouts/${staffId}`, { params: { month } })).data,
    enabled: staffId !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
  });
}

/**
 * 발행 미리 세기 (W11 · N-79) — `GET /accounting/invoices/draft`. **발행과 같은 함수**가 센 청구액 · 줄 · 막힌 까닭이다.
 * 분납 일정의 합은 청구액이어야 하는데(서버가 검사), 청구액은 회차를 세어야 나온다 — 화면이 세지 않고 이 값을 받아 보인다 (D-R37).
 * 쓰지 않는다. 부르는 쪽이 켤 때만(분납을 고를 때) 부른다.
 */
export function useInvoiceDraft(params: InvoiceDraftParams | null): UseQueryResult<InvoiceDraft> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.invoiceDraft(params), viewerId),
    queryFn: async () => (await api.get<InvoiceDraft>('/accounting/invoices/draft', { params: params ?? {} })).data,
    enabled: params !== null,
  });
}

/**
 * 가산 규칙 (N-93 · W11 M2) — 정리 · 기준 › 가산 규칙 탭과 강사료 정산의 「추가로 드리는 돈」이 같은 값을 읽는다.
 * 칸(모의수업 · 진단고사 · Kinder · 그룹) · 오늘 걸린 금액 · 예약 줄 · 셈에 드는가는 서버가 정한다 (D-R37).
 */
export function useBonusBook(enabled = true): UseQueryResult<PayoutBonusBook> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.bonusBook, viewerId),
    queryFn: async () => (await api.get<PayoutBonusBook>('/accounting/bonus-rules')).data,
    enabled,
  });
}

/**
 * 가산 규칙 한 줄 — **새 줄로만** 바꾼다(지난 줄 불변 · 소급 없음 · 같은 칸 같은 날 한 줄은 서버 409).
 * 그 날짜부터의 회차를 시트 · 상세 · 강사 히스토리가 같은 함수로 센다 — 회계 갈래와 강사 히스토리 갈래를 앞자락 그대로 버린다 (C48).
 */
export function useWriteBonusRule(): UseMutationResult<PayoutBonusRule, unknown, PayoutBonusRuleWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<PayoutBonusRule>('/accounting/bonus-rules', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.accounting });
      void qc.invalidateQueries({ queryKey: family.teacherHistory });
    },
  });
}

/** 탭 줄 오른쪽 두 비공개 스위치 (N-94) — 켜져 있는지 · 누가 언제 · 켤 수 있는가(`canSet`)는 서버 값이다 */
export function useAcctPrivacy(enabled = true): UseQueryResult<AcctPrivacy> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.acctPrivacy, viewerId),
    queryFn: async () => (await api.get<AcctPrivacy>('/accounting/privacy')).data,
    enabled,
  });
}

/**
 * 스위치 켜고 끄기 — 대표 판정(서버 403 `ACCT_PRIVACY_FORBIDDEN`). 가려지는 줄이 회계 곳곳 · 컨설팅 화면 · 서랍 구성원 시급에 있어
 * 세 갈래를 앞자락 그대로 버린다 (C48).
 */
export function useSetAcctPrivacy(): UseMutationResult<AcctPrivacy, unknown, AcctPrivacyWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.patch<AcctPrivacy>('/accounting/privacy', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.accounting });
      void qc.invalidateQueries({ queryKey: family.consulting });
      void qc.invalidateQueries({ queryKey: family.drawer });
    },
  });
}

/**
 * §54 「이월 처리」 — 받아 놓고 못 해 준 수업을 다음 달로 (N-39).
 *
 * 성공하면 **수업료 갈래와 회계 갈래를 함께 버린다** — 이 달의 단추가 사라지고
 * 다음 달의 「넘어온 돈」이 생긴다. 어느 달을 보고 있든 값이 바뀐다.
 */
export function useCarryTuition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { studentId: number; month: string }) =>
      (await api.post<CarryRow>('/accounting/tuition/carry', body)).data,
    /*
     * **갈래는 맨앞자락 그대로 버린다.** `sessionQueryKey(family.accounting, viewerId)` 로 쓰면
     * 사용자 꼬리가 가운데 끼어 **아무것도 안 걸린다** — 오류도 안 나고 화면만 옛 값을 보여 준다.
     * 처음에 그렇게 썼고 `queries-family` 회귀가 그 자리에서 잡았다 (C48 이 만든 검사다).
     */
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.accounting });
    },
  });
}

/**
 * 학생 「휴원」·「복귀」 (C92-c · C-36 · C-37) — §79 학생 카드에서 부른다.
 *
 * 기간 하나가 시간표(학생별)·명단·§54 수업료를 한꺼번에 바꾼다 — 회차는 그대로라 회차 갈래는
 * 「명단의 paused」만 달라지고, 트래킹 카드의 「휴원 9/1~9/30」 칩과 회계가 함께 바뀐다.
 * 갈래는 맨앞자락 그대로 버린다 (`queries-family` 회귀 · C48).
 */
export function useStudentPause() {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: family.tracking });
    void qc.invalidateQueries({ queryKey: family.occurrences });
    void qc.invalidateQueries({ queryKey: family.accounting });
  };
  return useMutation({
    mutationFn: async (w:
      | { kind: 'pause'; studentId: number; body: StudentPauseWrite }
      | { kind: 'resume'; studentId: number; pauseId: number; body: StudentResumeWrite }) => (
      w.kind === 'pause'
        ? (await api.post<StudentPauseResult>(`/schedule/students/${w.studentId}/pause`, w.body)).data
        : (await api.post<StudentPauseResult>(`/schedule/students/${w.studentId}/pause/${w.pauseId}/resume`, w.body)).data
    ),
    onSuccess: settle,
  });
}

/**
 * 인수인계 메모 한 줄 (N-36 ② · W11 M2) — §79 학생 카드에서 관리자 · 매니저가 더한다. 고치기 · 지우기는 없다(누가 · 언제가 남는다).
 * 같은 줄을 §79 카드와 그 학생을 맡은 강사의 수업 안내 학생 카드가 읽으므로 두 갈래를 앞자락 그대로 버린다 (C48).
 * 학부모에게 나가는 글에는 쓰이지 않는다.
 */
export function useAddTrackingNote(): UseMutationResult<TrackedNote, unknown, NoteCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<TrackedNote>('/schedule/tracking/notes', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.tracking });
      void qc.invalidateQueries({ queryKey: family.teacherGuides });
    },
  });
}

/**
 * §54 「N월 마감」·「마감 해제」 (C92-d) — 대표 전용. 마감은 회계뿐 아니라 그 달의 회차·출결·휴원 쓰기를 막으므로
 * 회계 갈래와 함께 일정 갈래(회차·트래킹)도 버린다 — 잠긴 달의 화면이 옛 판정을 들고 있지 않게.
 */
export function useMonthClose() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w: { kind: 'close'; body: MonthCloseWrite } | { kind: 'reopen'; body: MonthReopenWrite }) => (
      w.kind === 'close'
        ? (await api.post<MonthClose>('/accounting/tuition/close', w.body)).data
        : (await api.post<MonthClose>('/accounting/tuition/reopen', w.body)).data
    ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.accounting });
      void qc.invalidateQueries({ queryKey: family.occurrences });
      void qc.invalidateQueries({ queryKey: family.tracking });
    },
  });
}

/**
 * 회계 쓰기(발행 · 전달 · 취소 · 입금 · 지출)는 **회계 갈래를 맨앞자락 그대로** 버린다 (W11 · N-28 ②).
 * 전에는 `/accounting` 한 질의만 버려서, §53 다섯 칸 판(`/accounting/board`)이 발행 · 전달 · 입금 뒤에도
 * 옛 칸에 카드를 세워 두었고 §55 기간 요약(`cashflow`)도 옛 합을 들고 있었다 — 다음 칸 단추가 쓰기를 부르면
 * 카드가 저절로 옮아야 한다. 꼬리를 넣지 않는 까닭은 `family` 머리글 그대로다(C48).
 */
function useAccountingInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: family.accounting });
}

/**
 * 입금 한 줄 등록 (A-D2 · §53 ⑤ 입금 기록).
 * 누계·상태 전이·초과 거절은 서버가 판정한다 — 낙관 갱신을 하지 않는 이유다.
 * 돈이 들어온 사실을 서버 확정 전에 화면이 먼저 그리면 안 된다 (AGENT §현행 인계 E).
 */
export function useCreatePayment(): UseMutationResult<Invoice, unknown, PaymentCreate> {
  const invalidate = useAccountingInvalidate();
  return useMutation({
    mutationFn: async (w) => (await api.post<Invoice>('/accounting/payments', w)).data,
    onSettled: invalidate,
  });
}

/**
 * §55 「+ 결제 등록」 — 청구서 없이 들어온 돈 (A-D1 ② 매니저 직접 입력).
 * 분류(「기타」)·누가 넣었는지는 서버가 정한다 — 화면은 학생·금액·입금일·수단·사유만 보낸다.
 */
export function useCreateManualPayment(): UseMutationResult<Payment, unknown, ManualPaymentCreate> {
  const invalidate = useAccountingInvalidate();
  return useMutation({
    mutationFn: async (w) => (await api.post<Payment>('/accounting/payments/manual', w)).data,
    onSettled: invalidate,
  });
}

/** 잘못 적은 줄 정정 — 부분 납부(partial) 인 동안만. 완납 거절은 서버 문구를 그대로 보인다 */
export function useDeletePayment(): UseMutationResult<OkResult, unknown, number> {
  const invalidate = useAccountingInvalidate();
  return useMutation({
    mutationFn: async (id) => (await api.delete<OkResult>(`/accounting/payments/${id}`)).data,
    onSettled: invalidate,
  });
}

/**
 * 법인카드 심사 (A-D3 · §56). 증액·영수증·자기 승인 판정은 전부 서버 —
 * 화면은 미리 막아 주기만 하고, 최종 거절 문구는 서버 것을 그대로 보인다.
 */
/**
 * 청구서 발행 (§53 「+ 새 청구서 발행」 · C50).
 *
 * **줄을 보내지 않는다.** 누구의 어느 달인지만 보내면 서버가 과목별 회차를 세어 줄을 만든다 —
 * 원문 명세가 「횟수는 서버가 occ() 로 센다 · 프론트가 세면 예외를 빠뜨린다」고 적었다 (D-R37).
 */
export function useIssueInvoice(): UseMutationResult<Invoice, unknown, InvoiceIssue> {
  const invalidate = useAccountingInvalidate();
  return useMutation({
    mutationFn: async (w) => (await api.post<Invoice>('/accounting/invoices', w)).data,
    onSettled: invalidate,
  });
}

/** 「청구서 일괄 발행」 — 그 달 수업이 있는 학생 전부 (C94-a · H-75). 건너뛴 학생은 결과에 이유와 함께 온다 */
export function useIssueInvoiceBatch(): UseMutationResult<InvoiceBatchResult, unknown, InvoiceBatch> {
  const invalidate = useAccountingInvalidate();
  return useMutation({
    mutationFn: async (w) => (await api.post<InvoiceBatchResult>('/accounting/invoices/batch', w)).data,
    onSettled: invalidate,
  });
}

/** 「전달」·「취소」 — 줄의 단추가 서는지는 서버의 `canDeliver/canVoid` 다 (C94-a · H-76 · N-139) */
export function useInvoiceAction(): UseMutationResult<Invoice, unknown, { kind: 'deliver'; id: number } | { kind: 'void'; id: number; body: InvoiceVoid }> {
  const invalidate = useAccountingInvalidate();
  return useMutation({
    mutationFn: async (w) => (
      w.kind === 'deliver'
        ? (await api.post<Invoice>(`/accounting/invoices/${w.id}/deliver`)).data
        : (await api.post<Invoice>(`/accounting/invoices/${w.id}/void`, w.body)).data
    ),
    onSettled: invalidate,
  });
}

/**
 * 「지급 확정」 (C94-b · O-148) — 대표 전용. 그 순간의 시트를 payout 행으로 굳힌다.
 * 단추가 서는지는 서버의 `canConfirm` 이다 (D-R39). 확정되면 시트(달별)와 `/accounting` 의 정산 목록이 함께 바뀌므로
 * 회계 갈래를 맨앞자락 그대로 버린다 (`queries-family` 회귀 · C48).
 */
export function useConfirmPayout(): UseMutationResult<PayoutSheetRow, unknown, { month: string; body: PayoutConfirm }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w) => (await api.post<PayoutSheetRow>(`/accounting/payouts/${w.month}/confirm`, w.body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.accounting });
    },
  });
}

/**
 * 수강 종료 · 중도 환불 (C94-c · H-80 · N-135 · N-136) — §79 학생 카드에서 부른다.
 *
 * 미리보기(`preview`)는 서버가 **같은 트랜잭션을 돌리고 되돌린** 값이라 화면이 잔여 회차·환불액을 따로 세지 않는다(D-R37).
 * 실제 처리는 명단(종료일)·청구서·환불 줄·ENR 을 한 번에 바꾸므로 회계·회차·트래킹 갈래를 맨앞자락 그대로 버린다 (`queries-family` 회귀 · C48).
 */
export function useWithdrawStudent(): UseMutationResult<WithdrawResult, unknown, { kind: 'preview' | 'withdraw'; body: StudentWithdraw }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w) => (
      w.kind === 'preview'
        ? (await api.post<WithdrawResult>('/accounting/withdrawals/preview', w.body)).data
        : (await api.post<WithdrawResult>('/accounting/withdrawals', w.body)).data
    ),
    onSuccess: (_r, w) => {
      if (w.kind !== 'withdraw') return;
      void qc.invalidateQueries({ queryKey: family.accounting });
      void qc.invalidateQueries({ queryKey: family.occurrences });
      void qc.invalidateQueries({ queryKey: family.tracking });
    },
  });
}

/**
 * 단가 한 줄 · 학생별 예외 한 줄 (C94-d · H-81 · C-38). 새 줄은 그 날짜부터 청구서·§54·명단 가격에 든다 —
 * 회계 갈래를 맨앞자락 그대로 버린다(단가표·§54 가 같은 갈래다 · C48).
 */
export function useWriteRate(): UseMutationResult<RateRow, unknown, RateWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<RateRow>('/accounting/rates', body)).data,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: family.accounting }); },
  });
}

export function useWriteStudentRate(): UseMutationResult<StudentRateRow, unknown, StudentRateWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<StudentRateRow>('/accounting/sturates', body)).data,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: family.accounting }); },
  });
}

/** 지출 등록 (C94-d · H-83) — 언제나 pending 으로 들어간다. 확정은 `useReviewExpense` 뿐이다 */
export function useCreateExpense(): UseMutationResult<Expense, unknown, ExpenseCreate> {
  const invalidate = useAccountingInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<Expense>('/accounting/expenses', body)).data,
    onSettled: () => {
      // 「내 지출 신청」 목록(qk.myExpenses)은 회계 갈래 앞자락에 이미 걸린다 — 서랍 머리 수는 서랍 갈래가 다시 센다 (N-52)
      void invalidate();
      void qc.invalidateQueries({ queryKey: family.drawer });
    },
  });
}

/**
 * §20 「최근 변경 이력」 — 스케줄 쓰기 감사 줄을 서버가 문장으로 준다(누가 · 언제 · 앞 → 뒤 · 무엇을).
 * 볼 수 있는 범위(전체 · 내가 한 것)도 서버가 정한다. 칸을 열 때만 부르고, 남이 바꾸므로 열 때마다 다시 읽는다
 */
export function useScheduleHistory(enabled = true, beforeId?: ScheduleHistoryQuery['beforeId']): UseQueryResult<ScheduleHistory> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.scheduleHistory(beforeId), viewerId),
    queryFn: async () => (await api.get<ScheduleHistory>('/drawer/schedule-history', {
      params: beforeId ? { beforeId } : {},
    })).data,
    enabled,
    staleTime: 0,
  });
}

/** 서랍 요청함 「내 지출 신청」 (N-52) — 본인이 신청자인 줄과 분류 코드표. 칸을 열 때만 부른다 */
export function useMyExpenses(enabled = true): UseQueryResult<MyExpenseList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.myExpenses, viewerId),
    queryFn: async () => (await api.get<MyExpenseList>('/accounting/expenses/mine')).data,
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useReviewExpense(): UseMutationResult<Expense, unknown, { id: number; body: ExpenseReview }> {
  const invalidate = useAccountingInvalidate();
  return useMutation({
    mutationFn: async ({ id, body }) => (await api.post<Expense>(`/accounting/expenses/${id}/review`, body)).data,
    onSettled: invalidate,
  });
}

export function useOps(query: OpsQuery = {}): UseQueryResult<Ops> {
  const viewerId = useViewerId();
  const canMoney = useSession((s) => s.me?.canMoney === true);
  const part = opsQueryPart(query);
  return useQuery({
    queryKey: opsQueryKey(viewerId, canMoney, part),
    queryFn: async () => {
      const data = (await api.get<Ops>('/ops', { params: part })).data;
      if (canMoney && data.canSeeAmounts === true) return data;
      // JWT는 발급 시점 권한이다. 현재 Me가 비공개면 과거 JWT 응답도 캐시에 넣기 전에 제한한다.
      // 회수 전 요청은 과거 권한 키에만 저장되고 현재 화면에 재사용되지 않는다.
      return {
        ...data,
        canSeeAmounts: false,
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

/** §30 계약 상세 — 열린 건만 요청하고 단계·capability를 서버 응답 그대로 쓴다. */
export function useConsultingDetail(id: number | null): UseQueryResult<ConsultingDetail> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.consultingDetail(id ?? 0), viewerId),
    queryFn: async () => (await api.get<ConsultingDetail>(`/consulting/${id}`)).data,
    enabled: id !== null,
  });
}

export function useCreateConsulting(): UseMutationResult<ConsultingDetail, unknown, ConsultingCreate> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async (body) => (await api.post<ConsultingDetail>('/consulting', body)).data,
    onSuccess: (detail) => qc.setQueryData(sessionQueryKey(qk.consultingDetail(detail.id), viewerId), detail),
    onSettled: () => { void qc.invalidateQueries({ queryKey: family.consulting }); },
  });
}

/** 계약 작업 전 핵심정보 수정. 성공 응답을 상세 캐시에 넣고 목록/학생별/회계를 함께 다시 읽는다. */
export function useUpdateConsultingCore(): UseMutationResult<
  ConsultingDetail,
  unknown,
  { consId: number } & ConsultingPatch
> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async ({ consId, ...body }) =>
      (await api.patch<ConsultingDetail>(`/consulting/${consId}`, body)).data,
    onSuccess: (detail) => qc.setQueryData(sessionQueryKey(qk.consultingDetail(detail.id), viewerId), detail),
    onSettled: () => { void qc.invalidateQueries({ queryKey: family.consulting }); },
  });
}

/** §30 공개범위만 가역 낙관 갱신한다. 실패 rollback, 성공 응답 교체, 마지막 재조회가 한 묶음이다. */
export function useUpdateConsultingShare(): UseMutationResult<
  ConsultingDetail,
  unknown,
  { consId: number } & ConsultingShareUpdate
> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async ({ consId, ...body }) =>
      (await api.patch<ConsultingDetail>(`/consulting/${consId}/share`, body)).data,
    onMutate: async ({ consId, ...body }) => {
      const detailKey = sessionQueryKey(qk.consultingDetail(consId), viewerId);
      const listKey = sessionQueryKey(qk.consulting, viewerId);
      await Promise.all([
        qc.cancelQueries({ queryKey: detailKey }),
        qc.cancelQueries({ queryKey: listKey }),
      ]);
      const detail = qc.getQueryData<ConsultingDetail>(detailKey);
      const list = qc.getQueryData<ConsultingList>(listKey);
      if (detail) qc.setQueryData<ConsultingDetail>(detailKey, { ...detail, share: body.share, pickedStaffIds: body.pickedStaffIds ?? [] });
      if (list) qc.setQueryData<ConsultingList>(listKey, {
        ...list,
        items: list.items.map((item) => item.id === consId ? { ...item, share: body.share } : item),
      });
      return { detailKey, listKey, detail, list };
    },
    onError: (_error, _body, context) => {
      if (context?.detail) qc.setQueryData(context.detailKey, context.detail);
      if (context?.list) qc.setQueryData(context.listKey, context.list);
    },
    onSuccess: (detail, _body, context) => {
      const key = context?.detailKey ?? sessionQueryKey(qk.consultingDetail(detail.id), viewerId);
      qc.setQueryData(key, detail);
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: family.consulting }); },
  });
}

/** §36 교재 — 거의 안 바뀐다 */
/* ══ §39 판(VERS) · §40 이력(HIST) — C52 ═══════════════════════════════════
   「더 나중 판이 있다」는 **서버가 판정한다**(`hasNewer`). 화면이 두 낱말을 비교하면
   카드 배지와 머리 띠가 갈린다 (D-R39). 이력은 쓰는 화면이 없다 — 다른 쓰기의 부수효과다. */

export function useBookHistory(p: BookHistoryQuery = {}, enabled = true): UseQueryResult<BookHistory> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(bookHistoryQueryKey(p), viewerId),
    queryFn: async () => (await api.get<BookHistory>('/books/history', { params: p })).data,
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useBookTracking(enabled = true): UseQueryResult<BookTracking> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.bookTracking, viewerId),
    queryFn: async () => (await api.get<BookTracking>('/books/tracking')).data,
    enabled,
    staleTime: 30_000,
  });
}

export function useBookPacks(enabled = true): UseQueryResult<BookPacks> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.bookPacks, viewerId),
    queryFn: async () => (await api.get<BookPacks>('/books/deliveries')).data,
    enabled,
    staleTime: 30_000,
  });
}

/** 모든 도메인 파일은 같은 base64 계약과 서버 크기/종류 방어를 통과한다. */
export function useUploadFile(): UseMutationResult<FileRef, unknown, FileUpload> {
  return useMutation({ mutationFn: async (body) => (await api.post<FileRef>('/files', body)).data });
}

function useBooksInvalidate({ board = false, drawer = false }: { board?: boolean; drawer?: boolean } = {}) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: family.books });
    if (board) void qc.invalidateQueries({ queryKey: family.board });
    if (drawer) void qc.invalidateQueries({ queryKey: family.drawer });
  };
}

export function useCreateBook(): UseMutationResult<{ id: number; code: string; title: string }, unknown, BookWrite> {
  const invalidate = useBooksInvalidate();
  return useMutation({
    mutationFn: async (body) => (await api.post<{ id: number; code: string; title: string }>('/books', body)).data,
    onSettled: invalidate,
  });
}

export function usePatchBook(): UseMutationResult<
  { id: number; code: string; title: string },
  unknown,
  { id: number } & BookPatch
> {
  const invalidate = useBooksInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) =>
      (await api.patch<{ id: number; code: string; title: string }>(`/books/${id}`, body)).data,
    onSettled: invalidate,
  });
}

export function useCreateBookIssue(): UseMutationResult<BookIssue, unknown, BookIssueCreate> {
  const invalidate = useBooksInvalidate({ board: true });
  return useMutation({
    mutationFn: async (body) => (await api.post<BookIssue>('/books/issues', body)).data,
    onSettled: invalidate,
  });
}

export function useTransitionBookIssue(): UseMutationResult<BookIssue, unknown, { id: number } & BookIssueTransition> {
  const invalidate = useBooksInvalidate({ board: true });
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch<BookIssue>(`/books/issues/${id}/state`, body)).data,
    onSettled: invalidate,
  });
}

export function useUpdateBookProgress(): UseMutationResult<BookIssue, unknown, { id: number; progressPage: number }> {
  const invalidate = useBooksInvalidate();
  return useMutation({
    mutationFn: async ({ id, progressPage }) =>
      (await api.patch<BookIssue>(`/books/issues/${id}/progress`, { progressPage })).data,
    onSettled: invalidate,
  });
}

export function useReturnBookIssue(): UseMutationResult<BookIssue, unknown, { id: number; returnedOn?: string }> {
  const invalidate = useBooksInvalidate({ board: true });
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post<BookIssue>(`/books/issues/${id}/return`, body)).data,
    onSettled: invalidate,
  });
}

export function useCreateBookPack(): UseMutationResult<BookPack, unknown, BookPackWrite> {
  const invalidate = useBooksInvalidate({ drawer: true });
  return useMutation({
    mutationFn: async (body) => (await api.post<BookPack>('/books/deliveries', body)).data,
    onSettled: invalidate,
  });
}

export function usePatchBookPack(): UseMutationResult<BookPack, unknown, { id: number } & BookPackPatch> {
  const invalidate = useBooksInvalidate({ drawer: true });
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch<BookPack>(`/books/deliveries/${id}`, body)).data,
    onSettled: invalidate,
  });
}

export function useDeliverBookPack(): UseMutationResult<BookPack, unknown, number> {
  const invalidate = useBooksInvalidate({ drawer: true });
  return useMutation({
    mutationFn: async (id) => (await api.post<BookPack>(`/books/deliveries/${id}/deliver`, {})).data,
    onSettled: invalidate,
  });
}

export function useReceiveBookPack(): UseMutationResult<BookPack, unknown, number> {
  const invalidate = useBooksInvalidate({ drawer: true });
  return useMutation({
    mutationFn: async (id) => (await api.post<BookPack>(`/books/deliveries/${id}/receive`, {})).data,
    onSettled: invalidate,
  });
}

export function useAddBookVersion(): UseMutationResult<BookVersion, unknown, { libId: number } & BookVersionCreate> {
  const invalidate = useBooksInvalidate();
  return useMutation({
    mutationFn: async ({ libId, ...body }) => (await api.post<BookVersion>(`/books/${libId}/versions`, body)).data,
    onSettled: invalidate,
  });
}

/** 「판 버튼을 눌러 바꿉니다」 — 오늘부터 이 판을 쓴다 */
export function useUseBookVersion(): UseMutationResult<BookVersion, unknown, number> {
  const invalidate = useBooksInvalidate();
  return useMutation({
    mutationFn: async (versId) => (await api.patch<BookVersion>(`/books/versions/${versId}/use`, {})).data,
    onSettled: invalidate,
  });
}

export function useBooks(enabled = true): UseQueryResult<Books> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.books, viewerId),
    queryFn: async () => (await api.get<Books>('/books')).data,
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}

/**
 * §39 서가 — 과목 · 레벨 · 학년 필터는 **서버가 건다** (N-47 · D-R37). 화면은 고른 칩의 키만 보낸다.
 * 필터가 비면 `useBooks()` 와 같은 칸을 써서 머리 탭 수와 한 번에 받는다.
 */
export function useBookShelf(filter: BookShelfQuery): UseQueryResult<Books> {
  const viewerId = useViewerId();
  const params = Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== undefined && value !== '')) as BookShelfQuery;
  return useQuery({
    queryKey: sessionQueryKey(Object.keys(params).length ? qk.bookShelf(params) : qk.books, viewerId),
    queryFn: async () => (await api.get<Books>('/books', { params })).data,
    staleTime: 10 * 60 * 1000,
    // 칩을 바꾸는 동안 칩 줄 · 카드가 비었다 다시 서지 않게 앞 응답을 잠깐 든다(칩 건수는 서가 전체라 그대로다)
    placeholderData: keepPreviousData,
  });
}

/** §38 배부 창의 진단 한 줄 — 그 학생의 최신 상담 진단을 **읽기만** 한다 (N-62 · 배부에 옮겨 적지 않는다) */
export function useBookIssueDiag(studentId: number | null): UseQueryResult<BookIssueDiag> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.bookIssueDiag(studentId ?? 0), viewerId),
    queryFn: async () => (await api.get<BookIssueDiag>(`/books/students/${studentId}/latest-diag`)).data,
    enabled: studentId != null,
  });
}

/** §41·§42 안내 — 강사면 서버가 자기 것만 내려준다 */
/* ══ §43 「문구 관리」와 「안내 작성」 (C51) ═══════════════════════════════════
   틀은 안내와 끊어져 있다 — 안내를 만들 때 본문을 **복사해** 넣는다.
   그래서 틀을 고쳐도 이미 쓴 안내는 안 바뀐다(보낸 말이 나중에 달라지면 안 된다). */

export function useGuideTemplates(enabled = true): UseQueryResult<GuideTemplate[]> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.guideTemplates, viewerId),
    queryFn: async () => (await api.get<GuideTemplate[]>('/guides/templates')).data,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

function useGuidesInvalidate({ books = false }: { books?: boolean } = {}) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: family.guides });
    if (books) void qc.invalidateQueries({ queryKey: family.books });
  };
}

export function useCreateGuideTemplate(): UseMutationResult<GuideTemplate, unknown, GuideTemplateWrite> {
  const invalidate = useGuidesInvalidate();
  return useMutation({
    mutationFn: async (w) => (await api.post<GuideTemplate>('/guides/templates', w)).data,
    onSettled: invalidate,
  });
}

export function usePatchGuideTemplate(): UseMutationResult<GuideTemplate, unknown, { id: number } & GuideTemplateWrite> {
  const invalidate = useGuidesInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch<GuideTemplate>(`/guides/templates/${id}`, body)).data,
    onSettled: invalidate,
  });
}

/** 안내 작성 — 「썼다」만 보낸다. 어느 상태가 되는지는 서버가 정한다 (D-R18) */
export function useWriteGuideBody(): UseMutationResult<Guide, unknown, { id: number } & GuideBody> {
  const invalidate = useGuidesInvalidate({ books: true });
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.put<Guide>(`/guides/${id}/body`, body)).data,
    onSettled: invalidate,
  });
}

/**
 * §43 「나머지 학생에게 복사」 — F-61.
 * 머리말을 받는 학생 것으로 갈아 끼우는 일도, 어떤 형제를 건너뛸지도 서버가 정한다.
 */
export function useCopyGuide(): UseMutationResult<GuideCopyResult, unknown, { id: number }> {
  const invalidate = useGuidesInvalidate();
  return useMutation({
    mutationFn: async ({ id }) => (await api.post<GuideCopyResult>(`/guides/${id}/copy`)).data,
    onSettled: invalidate,
  });
}

/**
 * §43 회차 안내의 「강사 안내」 — F-63.
 * §12 수업 상세의 준비 아홉째 줄이 같은 PNOTI 를 읽으므로 일정 갈래도 함께 버린다.
 */
export function useSendZoomNotice(): UseMutationResult<ZoomNoticeResult, unknown, ZoomNoticeWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w) => (await api.post<ZoomNoticeResult>('/guides/zoom-notice', w)).data,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.guides });
      // §12 수업 상세의 준비 아홉째 줄이 같은 PNOTI 를 읽는다 (C82-b)
      void qc.invalidateQueries({ queryKey: family.tracking });
    },
  });
}

/**
 * §43 매번 머리 「강사 N명 한 번에」 (wave 6 §43-6) — 입력 없이 부른다. 보낼 회차·건너뛸 까닭은 서버가 정하고,
 * 결과가 어떻든(일부만 나갔어도) 단건과 같은 갈래를 버려 목록·§12 준비 줄이 서버 사실로 다시 선다.
 */
export function useSendZoomNoticeBatch(): UseMutationResult<ZoomNoticeBatchResult, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<ZoomNoticeBatchResult>('/guides/zoom-notice/batch', {})).data,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.guides });
      void qc.invalidateQueries({ queryKey: family.tracking });
    },
  });
}

/** GUIDE 전이만 갱신한다. 현재 학생의 교재·진단과 수신 안내는 별도 권한/캐시다. */
function useGuideDeliveryInvalidate() {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return () => Promise.all([
    family.guides, family.receivedGuides, family.board, family.tracking, family.drawer,
  ].map((queryKey) => qc.invalidateQueries({
    queryKey,
    predicate: (query) => query.queryKey.at(-2) === 'viewer' && query.queryKey.at(-1) === viewerId,
  })));
}

/** 저장된 GUIDE만 보낸다. 본문·수신자·상태·시각은 서버가 소유한다. */
export function useSendGuide(): UseMutationResult<Guide, unknown, number> {
  const invalidate = useGuideDeliveryInvalidate();
  return useMutation({
    mutationFn: async (id) => (await api.post<Guide>(`/guides/${id}/send`, {})).data,
    onSuccess: invalidate,
    onError: (error) => { if (error instanceof ApiError && error.status === 409) return invalidate(); },
  });
}

/** 수신자 본인의 명시 확인. 단순 열람으로 확인을 만들지 않는다. */
export function useAcknowledgeGuide(): UseMutationResult<Guide, unknown, number> {
  const invalidate = useGuideDeliveryInvalidate();
  return useMutation({
    mutationFn: async (id) => (await api.post<Guide>(`/teacher/guides/${id}/ack`, {})).data,
    onSuccess: invalidate,
    onError: (error) => { if (error instanceof ApiError && error.status === 409) return invalidate(); },
  });
}

export function useGuides(): UseQueryResult<Guides> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.guides, viewerId),
    queryFn: async () => (await api.get<Guides>('/guides')).data,
    staleTime: 60 * 1000,
  });
}

/** §44 학생별 — 최신 안내·교재·진단의 서버 projection. 화면은 합치거나 최신을 다시 고르지 않는다. */
export function useGuideStudents(enabled = true): UseQueryResult<GuideStudents> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.guideStudents, viewerId),
    queryFn: async () => (await api.get<GuideStudents>('/guides/students')).data,
    enabled,
    staleTime: 60 * 1000,
  });
}

/** §45 기간별 안내 이력과 누락 — 필요 판정·집계는 서버만 소유한다. */
export function useGuideHistory(params: GuideHistoryQuery, enabled = true): UseQueryResult<GuideHistory> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.guideHistory(params), viewerId),
    queryFn: async () => (await api.get<GuideHistory>('/guides/history', { params })).data,
    enabled,
    staleTime: 60 * 1000,
  });
}

/**
 * §45 누락 카드 → 초안 생성.
 * 카드는 서버가 준 투영 키만 보내며, 목록 제거는 가역 낙관 갱신 후 서버 응답과 다시 맞춘다.
 */
export function useCreateGuideDraft(): UseMutationResult<Guide, unknown, GuideDraftCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<Guide>('/guides/drafts', body)).data,
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.guideHistoryRoot });
      const snapshots = qc.getQueriesData<GuideHistory>({ queryKey: qk.guideHistoryRoot });
      for (const [key, current] of snapshots) {
        if (!current) continue;
        const hasCandidate = current.missing.some(
          (item) => item.sourceOccurrenceId === body.sourceOccurrenceId && item.studentId === body.studentId,
        );
        if (!hasCandidate) continue;
        qc.setQueryData<GuideHistory>(key, {
          ...current,
          missing: current.missing.filter(
            (item) => !(item.sourceOccurrenceId === body.sourceOccurrenceId && item.studentId === body.studentId),
          ),
          counts: { ...current.counts, missing: Math.max(0, current.counts.missing - 1) },
        });
      }
      return { snapshots };
    },
    onError: (_error, _body, context) => {
      context?.snapshots.forEach(([key, value]) => qc.setQueryData(key, value));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.guides });
    },
  });
}

/**
 * §34 수업 현황판 — 저장하지 않는 값이라 **오래 들고 있으면 안 된다** (D-R4).
 * 교재를 방금 배부했는데 마크가 그대로면 화면을 아무도 안 믿는다.
 */
/** 강사 홈 — 서버가 본인으로 고정한다. 다른 역할은 403(강사 전용 화면). */
export function useTeacherHome(): UseQueryResult<TeacherHome> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.teacherHome, viewerId),
    queryFn: async () => (await api.get<TeacherHome>('/teacher/home')).data,
    staleTime: 60 * 1000,
  });
}

/**
 * 강사 머리줄 — 시간대 · 오늘 시급 · **내게 온** 알림 (GET /teacher/shell · 강사 전용, 서버가 본인 고정).
 * 관리 화면 사용자는 부르지 않는다(서버도 403) — 강사에게는 관리자 서랍(GET /drawer)을 부르지 않는 것과 짝이다 (D-R39).
 */
export function useTeacherShell(enabled = true): UseQueryResult<TeacherShell> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.teacherShell, viewerId),
    queryFn: async () => (await api.get<TeacherShell>('/teacher/shell')).data,
    enabled,
    staleTime: 60 * 1000,
  });
}

/**
 * 강사 알림 읽음 — 서랍 §16 의 **본인 한정** 경로(`to_id = 나` 인 줄만 바뀐다)를 그대로 쓰고 머리줄만 다시 읽는다.
 * 새 쓰기 경로를 만들지 않는다. 낙관 갱신 없이 서버 값으로 배지를 다시 그린다(숫자가 서버보다 앞서지 않게).
 */
export function useTeacherNotiRead(): UseMutationResult<OkResult, unknown, { id: number } | { all: true }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w) => ('all' in w
      ? (await api.patch<OkResult>('/drawer/notis/read-all')).data
      : (await api.patch<OkResult>(`/drawer/notis/${w.id}/read`)).data),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.teacherShell });
    },
  });
}

/**
 * 내 설정 변경 요청 (강사 §8) — **올리기만 한다.** 적용은 관리자 승인 뒤라
 * 낙관 갱신을 하지 않고 홈을 다시 읽는다. 「한 달에 한 번」 판정도 서버 것을 그대로 쓴다.
 */
export function useCreateSettingRequest(): UseMutationResult<TeacherSettingRequest, unknown, TeacherSettingReqCreate> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async (w) => (await api.post<TeacherSettingRequest>('/teacher/requests', w)).data,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: sessionQueryKey(qk.teacherHome, viewerId) });
      // 올린 요청은 서랍 §14 승인 대기함에도 같은 행으로 보인다 (D-R26)
      void qc.invalidateQueries({ queryKey: family.drawer });
      // 교재 변경은 수업 안내 교재 행의 「변경 요청 중」을 바꾼다 (N-99) — 주가 키에 들어 있어 갈래째 버린다
      void qc.invalidateQueries({ queryKey: family.teacherGuides });
    },
  });
}

/**
 * 강사 「GPA 회차 요청」 창 (N-99) — 서비스 규정 · 고를 수 있는 내 GPA 회차(서버가 쓰기와 같은 판정으로 고른다).
 * 창을 열 때만 부르고, 열 때마다 다시 읽는다(휴강 · 사이클 마감이 그 사이 바뀔 수 있다).
 */
export function useTeacherGpaRequestOptions(enabled = true): UseQueryResult<TeacherGpaRequestOptions> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.teacherGpaRequestOptions, viewerId),
    queryFn: async () => (await api.get<TeacherGpaRequestOptions>('/teacher/gpa-request-options')).data,
    enabled,
    staleTime: 0,
  });
}

/** 건의 사항 — 내 목록+이달 쿼터. canPost 는 서버 판정 플래그 소비만 (월 3회 = 서버가 센다). */
export function useTeacherSuggestions(): UseQueryResult<TeacherSuggestions> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.teacherSuggestions, viewerId),
    queryFn: async () => (await api.get<TeacherSuggestions>('/teacher/suggestions')).data,
    staleTime: 30 * 1000,
  });
}

/** 건의 등록 — 낙관 갱신 없음(CONTRACTS: 쿼터는 서버가 센다). 성공·실패 모두 목록을 다시 묻는다. */
export function useCreateTeacherSuggestion(): UseMutationResult<TeacherSuggestion, unknown, TeacherSuggestionCreate> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async (w) => (await api.post<TeacherSuggestion>('/teacher/suggestions', w)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: sessionQueryKey(qk.teacherSuggestions, viewerId) }),
  });
}

/** 발송 당시 본인이 받은 안내. 현재 주 학생 자료를 조건으로 삼지 않는다. */
export function useReceivedGuides(): UseQueryResult<ReceivedGuides> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.receivedGuides, viewerId),
    queryFn: async () => (await api.get<ReceivedGuides>('/teacher/guides/received')).data,
    staleTime: 60 * 1000,
  });
}

/** 수업 안내 — 이번 주 담당 학생·교재·진단. week 생략이면 서버가 오늘(KST) 주로 판정한다. */
export function useTeacherGuides(week?: string): UseQueryResult<TeacherGuides> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.teacherGuides(week), viewerId),
    queryFn: async () => (await api.get<TeacherGuides>('/teacher/guides', { params: week ? { week } : {} })).data,
    staleTime: 60 * 1000,
  });
}

/**
 * 진단 리포트 쓰기 — 강사만 (강사 원문 슬라이드 20 · 47).
 *
 * 쓰고 나면 수업 안내 갈래를 통째로 버린다 — 「아직 진단 기록이 없습니다」가 그 자리에서
 * 새 기록으로 바뀌어야 하고, 주를 바꿔 가며 본 캐시도 같이 낡는다.
 */
export function useCreateDiagnostic(): UseMutationResult<TeacherGuideDiag, unknown, TeacherDiagCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<TeacherGuideDiag>('/teacher/diagnostics', body)).data,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.teacherGuides });
    },
  });
}

/** 수업 히스토리 — 월 기록+본인 정산. month 생략이면 서버가 이번 달(KST)로 판정한다 (D-R7·D-R32·D-15). */
export function useTeacherHistory(month?: string): UseQueryResult<TeacherHistory> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.teacherHistory(month), viewerId),
    queryFn: async () => (await api.get<TeacherHistory>('/teacher/history', { params: month ? { month } : {} })).data,
    staleTime: 60 * 1000,
  });
}

export function useBoard(p: BoardParams): UseQueryResult<Board> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.board(p), viewerId),
    queryFn: async () => (await api.get<Board>('/board', { params: p })).data,
    staleTime: 10 * 1000,
  });
}

/** §69 대표 보고 — 여기도 집계는 저장하지 않는다 (D-R4) */
/**
 * §69 보고 쓰기 — 메모 저장 · 올리기 · 결재를 **한 mutation** 으로 묶는다.
 *
 * 셋 다 같은 것(RPT 한 건)을 바꾸고 성공하면 같은 곳을 다시 읽어야 한다 —
 * 보고 화면(exec)과 결재함 배지(drawer)다. 훅을 셋으로 나누면 그 세 줄이 세 번 적힌다.
 */
export type ExecReportWrite =
  | { kind: 'memo'; body: ExecMemoWrite }
  | { kind: 'submit'; body: ExecSubmit }
  | { kind: 'review'; id: number; body: ExecReview }
  /** §73 「회수」 — 올린 사람만 · 올라간 보고만 (W11 · N-97). 서는지는 서버의 `canWithdraw` */
  | { kind: 'withdraw'; id: number };

export function useExecReportWrite(): UseMutationResult<ExecReportWriteResult, unknown, ExecReportWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w: ExecReportWrite) => {
      if (w.kind === 'memo') return (await api.patch<ExecReportWriteResult>('/exec/report', w.body)).data;
      if (w.kind === 'submit') return (await api.post<ExecReportWriteResult>('/exec/report/submit', w.body)).data;
      if (w.kind === 'withdraw') return (await api.post<ExecReportWriteResult>(`/exec/report/${w.id}/withdraw`)).data;
      return (await api.post<ExecReportWriteResult>(`/exec/report/${w.id}/review`, w.body)).data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.exec });
      void qc.invalidateQueries({ queryKey: family.drawer });
    },
  });
}

/**
 * §69 영역 담당 지정 (W11 · N-81) — 대표 판정(서버 `canSetOwner`). `null` 이면 비운다.
 * 담당 이름은 대표 보고 카드가 읽으므로 `family.exec` 를 다시 읽는다.
 */
export function useSetExecAreaOwner(): UseMutationResult<ExecAreaOwner, unknown, { key: string } & ExecAreaOwnerWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, staffId }) => (await api.put<ExecAreaOwner>(`/exec/areas/${key}/owner`, { staffId })).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.exec }),
  });
}

export function useExec(p: ExecQuery): UseQueryResult<Exec> {
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
/**
 * 겹침 미리보기 — **캐시하지 않는다.**
 *
 * 부딪힌 그 순간의 사실이라 stale 이 되면 거짓이 된다. 저장이 409 로 막힌 뒤에 한 번 물어
 * **누구와 부딪혔는지**만 채운다 — 막는 것은 DB 이고 이것은 설명이다 (D-R43).
 */
export type ConflictProbe = {
  date: string; startMin: number; endMin: number;
  teacherId?: number | null; roomId?: number | null; zaccId?: number | null; exceptSerId?: number | null;
};

/**
 * 같은 질의의 온전한 응답 — 누구와 부딪혔는지 + 그 시각 비어 있는 강의실·줌 계정 한 줄(`freeLine` · N-70).
 * 빈 자원 줄은 서버 문장이고 누를 수 없다(미리 잡지 않는다). 없으면 null.
 */
export async function fetchConflictPreview(q: ConflictProbe): Promise<ConflictPreview> {
  const params: Record<string, string | number> = { date: q.date, startMin: q.startMin, endMin: q.endMin };
  if (q.teacherId) params.teacherId = q.teacherId;
  if (q.roomId) params.roomId = q.roomId;
  if (q.zaccId) params.zaccId = q.zaccId;
  if (q.exceptSerId) params.exceptSerId = q.exceptSerId;
  const res = await api.get<ConflictPreview>('/schedule/conflicts', { params });
  return { conflicts: res.data.conflicts, freeLine: res.data.freeLine ?? null };
}

export async function fetchConflicts(q: ConflictProbe): Promise<ConflictRow[]> {
  return (await fetchConflictPreview(q)).conflicts;
}

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
function refreshReportConsumers(qc: ReturnType<typeof useQueryClient>, viewerId: ViewerId, detail?: ReportDetail): void {
  if (detail) qc.setQueryData(sessionQueryKey(qk.reportDetail(detail.serId, detail.onDate), viewerId), detail);
  void qc.invalidateQueries({ queryKey: family.reports });
  void qc.invalidateQueries({ queryKey: family.occurrences });
  void qc.invalidateQueries({ queryKey: family.accounting });
  void qc.invalidateQueries({ queryKey: family.board });
  void qc.invalidateQueries({ queryKey: family.exec });
  void qc.invalidateQueries({ queryKey: family.drawer });
}

/** 상태/담당자가 바뀐 거절만 재조회한다. 입력 오류·통신 실패는 작성 중인 초안을 보존한다. */
function reconcileReportError(qc: ReturnType<typeof useQueryClient>, viewerId: ViewerId, error: unknown): void {
  if (!(error instanceof ApiError)) return;
  const stale =
    (error.status === 400 && ['REPORT_NOT_ALLOWED', 'REPORT_CANCELED', 'REPORT_NOT_ENDED'].includes(error.code)) ||
    (error.status === 403 && ['REPORT_FORBIDDEN', 'REPORT_REVIEW_FORBIDDEN'].includes(error.code)) ||
    (error.status === 404 && error.code === 'REPORT_NOT_FOUND') ||
    (error.status === 409 && ['REPORT_LOCKED', 'REPORT_NOT_WAITING'].includes(error.code));
  if (stale) refreshReportConsumers(qc, viewerId);
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
    onError: (error) => reconcileReportError(qc, viewerId, error),
  });
}

/** wait 상태만 승인/반려한다. 재제출은 기존 useReportWrite의 submit 경로를 그대로 쓴다. */
export function useReportReview(): UseMutationResult<ReportDetail, unknown, ReportReviewWrite> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async (w) => (await api.post<ReportDetail>(`/reports/${w.serId}/${w.onDate}/review`, w.body)).data,
    onSuccess: (detail) => refreshReportConsumers(qc, viewerId, detail),
    onError: (error) => reconcileReportError(qc, viewerId, error),
  });
}

/** §47 독촉은 서버가 최신 조치 대상을 다시 잠가 판정한다. UI는 낙관 알림을 만들지 않는다. */
export function useReportReminder(): UseMutationResult<ReportReminderResult, unknown, ReportReminderCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<ReportReminderResult>('/reports/reminders', body)).data,
    onSettled: () => {
      // 독촉은 REP 상태를 바꾸지 않고 NOTI만 추가한다. 크고 서로 다른 리포트 조회를 재실행하지 않는다.
      void qc.invalidateQueries({ queryKey: family.drawer });
    },
  });
}

/** 학생 1명 단위 계약만 제공한다. 전체 발송도 호출부가 이를 순차 재사용한다. */
export function useReportDeliverySend(): UseMutationResult<ReportSendHistory, unknown, ReportDeliveryCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (delivery) => (await api.post<ReportDeliveryResult>('/reports/deliveries', delivery)).data.item,
    onSettled: () => {
      // 여러 학생 중 일부만 성공해도 큐와 이력은 반드시 서버 상태로 다시 맞춘다.
      void qc.invalidateQueries({ queryKey: family.reportDeliveries });
    },
  });
}

export function useReportDeliveryResend(): UseMutationResult<
  ReportSendHistory,
  unknown,
  {
    sendId: number;
    requestKey: string;
  }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sendId, requestKey }) =>
      (await api.post<ReportDeliveryResult>(`/reports/deliveries/${sendId}/resend`, { requestKey })).data.item,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.reportDeliveries });
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
  | { kind: 'undo'; body: ScheduleUndo }
  | { kind: 'patch'; serId: number; body: OccurrencePatch }
  | { kind: 'delete'; serId: number; body: OccurrenceDelete }
  | { kind: 'dayCancel'; body: DayCancel }
  | { kind: 'roster'; serId: number; body: RosterPatch };

export function useScheduleWrite(): UseMutationResult<
  WriteResult | RosterResult | DayCancelResult,
  unknown,
  ScheduleWrite,
  ScheduleOptimisticContext
> {
  const qc = useQueryClient();
  // 성공과 오래된 회차 거절이 같은 서버 정본을 다시 읽는다. 전체 캐시 무효화는 하지 않는다.
  const reconcile = (w?: ScheduleWrite) => {
    void qc.invalidateQueries({ queryKey: family.occurrences });
    void qc.invalidateQueries({ queryKey: family.board });
    void qc.invalidateQueries({ queryKey: family.horizon });
    void qc.invalidateQueries({ queryKey: family.scheduleHistory });
    // 만들기·붙여넣기·「향후」 가르기·삭제는 일정 원본 수(§07 사이드바)를 바꾼다
    void qc.invalidateQueries({ queryKey: family.seriesCounts });
    // 명단을 고치면 §79 카드의 정원·단가·학생 목록이 함께 달라진다 (C55)
    void qc.invalidateQueries({ queryKey: family.tracking });
    // 명단에 넣으면 수신함에 세 줄이 남는다 — 서랍의 배지·목록이 같이 달라진다 (M-124 · C99)
    if (w?.kind === 'roster') void qc.invalidateQueries({ queryKey: family.drawer });
    // 휴강의 처리(이월/차감)는 §54 수업료와 알림(M-125)을 바꾼다 — 다른 쓰기는 회계를 건드리지 않는다 (C92)
    // 되돌리기는 **그 휴강을 되돌리는 것**이라 같은 갈래를 버려야 한다 (N-138 · C99) —
    // 차감·이월이 돌아오는데 §54 가 옛 수를 들고 있으면 한 화면에 두 답이 생긴다.
    if (w?.kind === 'delete' || w?.kind === 'dayCancel' || w?.kind === 'undo') {
      void qc.invalidateQueries({ queryKey: family.accounting });
      void qc.invalidateQueries({ queryKey: family.drawer });
      void qc.invalidateQueries({ queryKey: family.dayCancelNotices });
    }
  };
  return useMutation({
    mutationFn: async (w: ScheduleWrite) => {
      if (w.kind === 'create') return (await api.post<WriteResult>('/schedule', w.body)).data;
      if (w.kind === 'paste') return (await api.post<WriteResult>('/schedule/paste', w.body)).data;
      if (w.kind === 'moveMany') return (await api.post<WriteResult>('/schedule/move', w.body)).data;
      if (w.kind === 'undo') return (await api.post<WriteResult>('/schedule/undo', w.body)).data;
      if (w.kind === 'dayCancel') return (await api.post<DayCancelResult>('/schedule/day-cancel', w.body)).data;
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
    onError: (e, w, ctx) => {
      const stale =
        e instanceof ApiError && e.status === 404 && ['NOT_FOUND', 'OCCURRENCE_NOT_FOUND', 'SOURCE_NOT_FOUND'].includes(e.code);
      // 다른 요청의 성공/낙관 값을 보존하고 마지막 정착 후에만 서버 정본을 읽는다.
      if (ctx ? settleScheduleOptimistic(qc, ctx, true, stale) : stale) reconcile(w);
    },
    // 회차/현황판/투영 기간만 갱신한다. 코드표·운영은 그대로 유지한다 (회계는 휴강일 때만 — 위 reconcile).
    onSuccess: (_data, w, ctx) => {
      if (ctx && settleScheduleOptimistic(qc, ctx, false, true)) reconcile(w);
    },
  });
}

export type AttendanceWriteCommand =
  { action: 'save'; serId: number; onDate: string; body: AttendanceWrite } | { action: 'clear'; serId: number; onDate: string };

/** 출결 현재값을 바꾸면 같은 사실을 소비하는 조회를 한 경로에서 갱신한다. */
export function useAttendanceWrite(): UseMutationResult<AttendanceMutationResult, unknown, AttendanceWriteCommand> {
  const qc = useQueryClient();
  const reconcile = () => {
    void qc.invalidateQueries({ queryKey: family.occurrences });
    // 학생별 지각은 리포트 목록·상세의 ReportStudentDto에도 투영된다.
    void qc.invalidateQueries({ queryKey: family.reports });
    void qc.invalidateQueries({ queryKey: family.board });
    void qc.invalidateQueries({ queryKey: family.accounting });
    void qc.invalidateQueries({ queryKey: family.exec });
  };
  return useMutation({
    mutationFn: async (w) => {
      const path = `/schedule/${w.serId}/${w.onDate}/attendance`;
      return w.action === 'save'
        ? (await api.put<AttendanceMutationResult>(path, w.body)).data
        : (await api.delete<AttendanceMutationResult>(path)).data;
    },
    onSuccess: reconcile,
    onError: (error) => {
      // 일정/다른 출결 쓰기가 먼저 끝났다면 서버가 내려주는 새 attendanceMode를 읽는다.
      // 가역 출결도 성공 사실을 미리 만들지 않는다. 일반 입력/권한 오류는 그대로 둔다.
      if (
        error instanceof ApiError &&
        ((error.status === 409 && error.code === 'ATTENDANCE_NOT_AVAILABLE') ||
          (error.status === 404 && ['OCCURRENCE_NOT_FOUND', 'ATTENDANCE_NOT_FOUND'].includes(error.code)))
      )
        reconcile();
    },
  });
}

/* ══ 서랍 — §14~§21 ══════════════════════════════════════════════════════
   여덟 칸을 **한 번에** 읽는다. 칸마다 훅을 두면 배지 숫자와 목록이 서로 다른
   시각의 데이터를 보게 된다 — 「3건이라는데 두 줄뿐」이 정확히 그렇게 생긴다. */

/**
 * 서랍 — `notiWindow` 는 **알림을 보여 주는 범위**만 정한다 (N-7 · D-16: 지우는 규칙이 아니다).
 * 범위가 키에 들어가야 「예전 것도 보기」가 캐시를 갈아 끼운다.
 */
export function useDrawer(enabled = true, notiWindow: 'month' | 'all' = 'month'): UseQueryResult<Drawer> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.drawer(notiWindow), viewerId),
    queryFn: async () => (await api.get<Drawer>('/drawer', { params: { notiWindow } })).data,
    enabled,
    // 결재·알림은 남이 바꾼다. 서랍을 다시 열면 다시 읽는다.
    staleTime: 30 * 1000,
  });
}

/**
 * 서랍에서 하는 쓰기.
 *
 * §14 승인 대기함의 **요청(REQ) 처리**가 여기 있다 — 원문 §14 가 줄마다 반려·승인을 갖고
 * D-R13(반려 사유 필수)의 절 칸에도 14 가 들어 있다. D-R27 의 「이동만」은 §75 결재 흐름
 * 오버레이의 규칙이고, 적용 경로가 있는 갈래만 서버가 `canAct` 로 열어 준다.
 */
export type DrawerWrite =
  | { kind: 'todo'; id: number; done: boolean }
  | { kind: 'todoPatch'; id: number; body: DrawerTodoPatch }
  | { kind: 'todoCreate'; body: DrawerTodoCreate }
  /** §15 「끝난 것 지우기」 — **화면이 보여 준 그 줄들**만 보낸다 (S4 · 대표 결정 2026-09-20) */
  | { kind: 'todoClear'; ids: number[] }
  | { kind: 'notiRead'; id: number }
  | { kind: 'notiReadAll' }
  | { kind: 'reqReview'; id: number; decision: 'approve' | 'reject'; reason?: string }
  | { kind: 'chreqReview'; id: number; decision: 'approve' | 'reject'; reason?: string }
  | { kind: 'changeReq'; body: ChangeReqCreate };

type DrawerWriteResult = OkResult | DrawerTodoCreateResult | DrawerTodoClearResult | ChangeReqResult | ReqReviewResult;
type DrawerWriteContext = { snapshots: Array<[readonly unknown[], Drawer | undefined]> };

export function useDrawerWrite(): UseMutationResult<DrawerWriteResult, unknown, DrawerWrite, DrawerWriteContext> {
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  return useMutation({
    mutationFn: async (w: DrawerWrite) => {
      if (w.kind === 'todo') {
        return (await api.patch<OkResult>(`/drawer/todos/${w.id}`, { done: w.done })).data;
      }
      if (w.kind === 'todoPatch') {
        return (await api.patch<OkResult>(`/drawer/todos/${w.id}`, w.body)).data;
      }
      if (w.kind === 'todoCreate') {
        return (await api.post<DrawerTodoCreateResult>('/drawer/todos', w.body)).data;
      }
      if (w.kind === 'todoClear') {
        // DELETE 에 본문을 싣는다 — 지울 줄을 화면이 말하고 서버가 그중 아직 끝난 것만 지운다
        return (await api.delete<DrawerTodoClearResult>('/drawer/todos/completed', { data: { ids: w.ids } })).data;
      }
      if (w.kind === 'notiRead') {
        return (await api.patch<OkResult>(`/drawer/notis/${w.id}/read`)).data;
      }
      if (w.kind === 'notiReadAll') {
        return (await api.patch<OkResult>('/drawer/notis/read-all')).data;
      }
      if (w.kind === 'reqReview') {
        return (await api.post<ReqReviewResult>(`/drawer/requests/${w.id}/review`, { decision: w.decision, reason: w.reason }))
          .data;
      }
      if (w.kind === 'chreqReview') {
        return (
          await api.post<ReqReviewResult>(`/drawer/change-requests/${w.id}/review`, { decision: w.decision, reason: w.reason })
        ).data;
      }
      return (await api.post<ChangeReqResult>('/drawer/change-requests', w.body)).data;
    },
    onMutate: async (w) => {
      if (!['todo', 'todoCreate', 'todoClear', 'notiRead', 'notiReadAll'].includes(w.kind)) {
        return { snapshots: [] };
      }
      // 가역 UI만 먼저 바꾼다. 실패 시 아래 snapshot으로 정확히 되돌린다.
      await qc.cancelQueries({ queryKey: family.drawer });
      const snapshots = qc.getQueriesData<Drawer>({ queryKey: family.drawer });
      for (const [key, current] of snapshots) {
        if (!current) continue;
        let next = current;
        if (w.kind === 'todo') {
          next = { ...current, todos: current.todos.map((t) => (t.id === w.id ? { ...t, done: w.done } : t)) };
        } else if (w.kind === 'todoClear') {
          // 보낸 줄만 지운다 — 화면이 안 보여 준 남의 끝난 할 일까지 사라지면 캐시가 서버보다 앞서 거짓말을 한다
          next = { ...current, todos: current.todos.filter((t) => !(t.done && w.ids.includes(t.id))) };
        } else if (w.kind === 'todoCreate') {
          const toId = w.body.toId ?? me?.id ?? null;
          const toName = current.members.find((member) => member.id === toId)?.name ?? null;
          next = {
            ...current,
            todos: [
              {
                id: -Date.now(),
                title: w.body.title,
                fromId: me?.id ?? null,
                fromName: me?.name ?? null,
                toId,
                toName,
                dueOn: w.body.dueOn ?? null,
                done: false,
                src: 'manual',
                srcLabel: '직접 등록',
                overdueDays: 0,
                go: null,
                // 서버가 아직 모르는 임시 줄(음수 id) — 「끝난 것 지우기」가 보내지 않게 닫아 둔다. 재조회가 서버 판정으로 갈아 끼운다
                clearable: false,
                clearBlockedReason: null,
              },
              ...current.todos,
            ],
          };
        } else if (w.kind === 'notiRead') {
          next = { ...current, notis: current.notis.map((n) => (n.id === w.id ? { ...n, read: true } : n)) };
        } else if (w.kind === 'notiReadAll') {
          next = { ...current, notis: current.notis.map((n) => (n.toId === me?.id ? { ...n, read: true } : n)) };
        }
        qc.setQueryData(key, next);
      }
      return { snapshots };
    },
    onError: (_error, _w, context) => {
      context?.snapshots.forEach(([key, value]) => qc.setQueryData(key, value));
    },
    onSuccess: (_r, w) => {
      // 할 일은 운영 탭(§62)에도 같은 행이 보인다
      if (w.kind === 'todo' || w.kind === 'todoCreate' || w.kind === 'todoClear' || w.kind === 'todoPatch') {
        void qc.invalidateQueries({ queryKey: family.ops });
      }
      // 연결 수업의 준비 행은 TODO 총수·완료수를 읽는다. 기한만 바꾸면 이 사실은 그대로다.
      // 수업 상세 「+ 할 일」(W11 · N-71)은 회차에 걸린 새 지시라 그 수업의 준비 행이 바로 는다
      if (w.kind === 'todo' || w.kind === 'todoClear' || (w.kind === 'todoPatch' && w.body.done !== undefined)
        || (w.kind === 'todoCreate' && w.body.serId != null)) {
        void qc.invalidateQueries({ queryKey: family.tracking });
      }
      // 승인은 **실제로 적용된다** — 강사 홈의 시급·시간대가 바뀌었으므로 함께 다시 읽는다
      if (w.kind === 'reqReview') void qc.invalidateQueries({ queryKey: family.teacherHome });
      // 반영하면 **시간표가 바뀐다** — 달력·현황판·강사 홈을 함께 다시 읽는다 (§20)
      if (w.kind === 'chreqReview') {
        void qc.invalidateQueries({ queryKey: family.occurrences });
        // 반영이 규칙을 가르거나 끝낼 수 있다 — §07 사이드바의 일정 원본 수도 다시 읽는다
        void qc.invalidateQueries({ queryKey: family.seriesCounts });
        void qc.invalidateQueries({ queryKey: family.board });
        void qc.invalidateQueries({ queryKey: family.exec });
        void qc.invalidateQueries({ queryKey: family.teacherHome });
      }
    },
    // 창(month/all)마다 키가 다르므로 성공·실패 모두 서버 값으로 화해한다.
    onSettled: () => qc.invalidateQueries({ queryKey: family.drawer }),
  });
}

/**
 * §14 결재 되돌리기 (N-84 · 원문 §14 머리 「모든 처리는 되돌리기로 취소됩니다」) — 승인 · 반려 · 반영 응답의 토큰 하나.
 * 무엇을 어떻게 되돌릴지는 서버가 토큰과 DB 로 정한다 — 화면은 토큰을 풀지 않는다. 되돌린 뒤에는 그 처리가 건드린
 * 갈래(서랍 · 강사 홈 · 시간표 · 회계 시급 · GPA)를 다시 읽는다. 낙관 갱신은 하지 않는다(돈 · 시간표가 걸린다).
 */
export function useApprovalUndo(): UseMutationResult<ApprovalUndoResult, unknown, { token: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<ApprovalUndoResult>('/drawer/approvals/undo', body)).data,
    // 무효화는 한 줄에 갈래 하나로 적는다 — 표기 회귀(queries-family)가 `family.X` 모양만 읽는다
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.drawer });
      void qc.invalidateQueries({ queryKey: family.teacherHome });
      void qc.invalidateQueries({ queryKey: family.occurrences });
      void qc.invalidateQueries({ queryKey: family.seriesCounts });
      void qc.invalidateQueries({ queryKey: family.board });
      void qc.invalidateQueries({ queryKey: family.exec });
      void qc.invalidateQueries({ queryKey: family.accounting });
      void qc.invalidateQueries({ queryKey: family.gpa });
      void qc.invalidateQueries({ queryKey: family.tracking });
    },
  });
}

/** §76 권한 표 · 창 부제 · 역할 설명 줄 (N-98) — 서버 문장. 권한 창을 열 때만 부른다 */
export function usePermissionTable(enabled = true): UseQueryResult<PermissionTable> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.permissions, viewerId),
    queryFn: async () => (await api.get<PermissionTable>('/permissions')).data,
    enabled,
    // 사람별 예외가 바뀌면 다음 요청부터 판정이 바뀐다 — 창을 다시 열면 다시 읽는다
    staleTime: 0,
  });
}

/**
 * §17 「+ 구성원」 (C97 · D-41 · W10) — 강사·매니저 계정 한 사람. 아이디 · 임시 비밀번호는 매니저가 적고,
 * 비밀번호는 보내기만 하고 응답에는 없다(해시만 남는다). 응답은 만든 줄이다.
 * 서랍(구성원 칸)과 `/meta`(담당·강사 고르기)가 새 사람을 알아야 한다 — 둘 다 버린다.
 */
export function useCreateMember(): UseMutationResult<Member, unknown, StaffCreate> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async (body) => (await api.post<Member>('/drawer/staff', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.drawer });
      void qc.invalidateQueries({ queryKey: sessionQueryKey(qk.meta, viewerId) });
    },
  });
}

/* ── W8 §17 사용자 표 CRUD — 줄 단추(수정 · 비밀번호 초기화 · 사용 중지 · 삭제). 서랍과 /meta(담당·강사 고르기)가 같이 바뀐다 ── */

function useInvalidateMembers() {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return () => {
    void qc.invalidateQueries({ queryKey: family.drawer });
    void qc.invalidateQueries({ queryKey: sessionQueryKey(qk.meta, viewerId) });
  };
}

/** 「수정」 — 바뀐 칸만 보낸다. 대표·관리자 줄 · 자기 역할은 서버가 403 으로 막는다 */
export function useUpdateMember(): UseMutationResult<Member, unknown, { id: number; body: StaffPatch }> {
  const done = useInvalidateMembers();
  return useMutation({
    mutationFn: async ({ id, body }) => (await api.patch<Member>(`/drawer/staff/${id}`, body)).data,
    onSuccess: done,
  });
}

/** 「비밀번호 초기화」 — 매니저가 적은 임시 비밀번호로 바꾼다(W10). 응답은 그 줄이고 비밀번호는 없다 */
export function useResetMemberPassword(): UseMutationResult<Member, unknown, { id: number; body: StaffPasswordReset }> {
  const done = useInvalidateMembers();
  return useMutation({
    mutationFn: async ({ id, body }) => (await api.post<Member>(`/drawer/staff/${id}/password-reset`, body)).data,
    onSuccess: done,
  });
}

/** 「사용 중지」·「다시 사용」 */
export function useSetMemberActive(): UseMutationResult<Member, unknown, { id: number; active: boolean }> {
  const done = useInvalidateMembers();
  return useMutation({
    mutationFn: async ({ id, active }) => (await api.patch<Member>(`/drawer/staff/${id}/active`, { active })).data,
    onSuccess: done,
  });
}

/** 「삭제」 — 기록이 있는 계정은 서버가 409 로 막는다(사용 중지 안내 문장) */
export function useDeleteMember(): UseMutationResult<OkResult, unknown, number> {
  const done = useInvalidateMembers();
  return useMutation({
    mutationFn: async (id) => (await api.delete<OkResult>(`/drawer/staff/${id}`)).data,
    onSuccess: done,
  });
}

/** 시급 이력 (C97 · D-48) — 적용일 내림차순, 「지금」 줄은 서버가 가른다(`current`). 창을 열 때만 읽는다 */
export function useWageHistory(staffId: number, enabled = true): UseQueryResult<WageHistory> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.wageHistory(staffId), viewerId),
    queryFn: async () => (await api.get<WageHistory>('/accounting/wages', { params: { staffId } })).data,
    enabled,
    staleTime: 30 * 1000,
  });
}

/**
 * 시급 직접 수정 (C97 · D-48 · I-8) — 새 줄 한 장이다. 소급 없음(`WAGE_RETROACTIVE`)·같은 날 한 줄(`WAGE_SAME_DAY`)은 409 로 서버가 낸다.
 * 그 날짜부터의 회차가 새 시급을 읽으니 정산 시트(회계)·강사 홈·히스토리·서랍 구성원 줄이 같이 바뀐다. 지난달 시트는 그대로다.
 */
export function useChangeWage(): UseMutationResult<WageRow, unknown, WageWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<WageRow>('/accounting/wages', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.drawer });
      void qc.invalidateQueries({ queryKey: family.accounting });
      void qc.invalidateQueries({ queryKey: family.teacherHome });
      void qc.invalidateQueries({ queryKey: family.teacherHistory });
    },
  });
}

/** 불가 시간 — 2주 격자 메타 + 내 등록. anchor 생략이면 오늘(KST) 회차. */
export function useTeacherUnav(anchor?: string): UseQueryResult<TeacherUnav> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.teacherUnav(anchor), viewerId),
    queryFn: async () => (await api.get<TeacherUnav>('/teacher/unavailable', { params: anchor ? { anchor } : {} })).data,
    staleTime: 30 * 1000,
  });
}

/** 불가 시간 등록 — 마감·겹침 판정은 서버(UNAV_DEADLINE·UNAV_OVERLAP). 성공/실패 모두 재조회. */
export function useCreateTeacherUnav(): UseMutationResult<TeacherUnavBlock, unknown, TeacherUnavCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w) => (await api.post<TeacherUnavBlock>('/teacher/unavailable', w)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.teacherUnav }),
  });
}

/** 불가 시간 삭제 — 열린 날짜의 본인 등록만 (UNAV_LOCKED 는 서버 판정). */
export function useDeleteTeacherUnav(): UseMutationResult<{ ok: true }, unknown, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => (await api.delete<{ ok: true }>(`/teacher/unavailable/${id}`)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.teacherUnav }),
  });
}

/**
 * §31 진행 항목 체크/해제 — 판정(공개 범위·종료 잠금)은 서버. 성공/실패 모두 컨설팅 갈래 전체를 다시 받는다.
 * 목록만 버리면 상세의 종료 단추(canClose · 예외 종료 canCloseException)가 옛 필수 항목 수로 남는다 (PB-15 · W11).
 */
export function useToggleConsultingItem(): UseMutationResult<
  ConsItem,
  unknown,
  { consId: number; itemId: number; done: boolean }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consId, itemId, done }) =>
      (await api.patch<ConsItem>(`/consulting/${consId}/items/${itemId}`, { done })).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.consulting }),
  });
}

/**
 * 원문 §31 「항목 수정」 — 더하기 · 이름 바꾸기 · 빼기를 한 번에 (N-18-a). 바꾸는 것만 보낸다(목록 통째가 아니다).
 * 필수 항목 수가 바뀌면 종료 단추도 바뀐다 — 컨설팅 갈래 전체를 버린다.
 */
export function useEditConsultingItems(): UseMutationResult<ConsItem[], unknown, { consId: number; body: ConsItemsEdit }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consId, body }) => (await api.patch<ConsItem[]>(`/consulting/${consId}/items`, body)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.consulting }),
  });
}

/** 항목 「파일」 올리기 — 항목마다 6개(N-63). 계약 파일과 같은 업로드 모양(base64) */
export function useAddConsultingItemFile(): UseMutationResult<ConsultingFile, unknown, { consId: number; itemId: number } & ConsultingFileCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consId, itemId, ...body }) => (await api.post<ConsultingFile>(`/consulting/${consId}/items/${itemId}/files`, body)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.consulting }),
  });
}

/** 항목 파일 빼기 — 종료 전 건만(서버 판정) */
export function useRemoveConsultingItemFile(): UseMutationResult<void, unknown, { consId: number; itemId: number; fileId: number }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consId, itemId, fileId }) => { await api.delete(`/consulting/${consId}/items/${itemId}/files/${fileId}`); },
    onSettled: () => qc.invalidateQueries({ queryKey: family.consulting }),
  });
}

/* ══ §28 컨설팅 회계 (C58) ═════════════════════════════════════════════
 * 「남음」도 머리 세 칸도 서버가 뺀 숫자를 그대로 그린다. 화면이 계약 − 받음을 다시 하면
 * 금액이 가려진 줄에서 합계가 갈린다 (D-R37).
 * ═══════════════════════════════════════════════════════════════════ */

export function useConsAccounting(enabled = true): UseQueryResult<ConsAccounting> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.consAccounting, viewerId),
    queryFn: async () => (await api.get<ConsAccounting>('/consulting/accounting')).data,
    enabled,
  });
}

/**
 * §27 학생별 — 탭을 열 때만 돈다. 탭 머리의 「N명」은 **이 질의가 센 값**이라
 * 화면이 목록의 학생 이름을 모아 세지 않는다 (D-R37).
 */
export function useConsStudents(enabled = true): UseQueryResult<ConsStudents> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.consStudents, viewerId),
    queryFn: async () => (await api.get<ConsStudents>('/consulting/students')).data,
    enabled,
  });
}

/* ══ §31 회차 잡기 · 육하원칙 · 종료 (C95 · I-91 · I-95 · N-18 채택) ══════════════════════════════════════
 * 회차를 잡으면 시간표(SER)와 할 일(TODO)이 같이 선다 — 컨설팅 갈래만 버리면 캘린더·서랍이 옛것을 보여 준다.
 * 미리보기는 같은 트랜잭션을 되돌린 결과라 캐시하지 않는다 (C91·C93 과 같은 모양).
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

function useConsultingSessionInvalidate(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: family.consulting });
    void qc.invalidateQueries({ queryKey: family.occurrences });
    void qc.invalidateQueries({ queryKey: family.horizon });
    // 회차를 잡으면 새 ONCE 규칙(SER)이 선다 — §07 사이드바의 일정 원본 수도
    void qc.invalidateQueries({ queryKey: family.seriesCounts });
    void qc.invalidateQueries({ queryKey: family.board });
    void qc.invalidateQueries({ queryKey: family.drawer });
    void qc.invalidateQueries({ queryKey: family.teacherHome });
  };
}

/** 회차 잡기 — `kind: 'preview'` 는 쓰기 0. 확정 뒤에만 시간표·서랍까지 버린다 */
export function useAddConsultingSessions(): UseMutationResult<
  ConsSessionsResult,
  unknown,
  { consId: number; kind: 'preview' | 'apply'; body: ConsSessionCreate }
> {
  const invalidate = useConsultingSessionInvalidate();
  return useMutation({
    mutationFn: async ({ consId, kind, body }) =>
      (await api.post<ConsSessionsResult>(`/consulting/${consId}/sessions${kind === 'preview' ? '/preview' : ''}`, body)).data,
    onSettled: (_r, _e, { kind }) => { if (kind === 'apply') invalidate(); },
  });
}

/** 육하원칙 — 보낸 칸만. 다 적히면 서버가 그 회차의 할 일을 접으므로 서랍도 버린다 */
export function useWriteConsultingSession(): UseMutationResult<ConsSession, unknown, { consId: number; sessId: number; body: ConsSessionWrite }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consId, sessId, body }) => (await api.patch<ConsSession>(`/consulting/${consId}/sessions/${sessId}`, body)).data,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.consulting });
      void qc.invalidateQueries({ queryKey: family.drawer });
    },
  });
}

/** 종료 — 미리보기는 안내문·회차 수를 돌려주고 되돌린다. 확정 뒤 컨설팅 갈래를 버린다 */
export function useCloseConsulting(): UseMutationResult<ConsCloseResult, unknown, { consId: number; kind: 'preview' | 'apply'; body: ConsClose }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consId, kind, body }) =>
      (await api.post<ConsCloseResult>(`/consulting/${consId}/close${kind === 'preview' ? '/preview' : ''}`, body)).data,
    onSettled: (_r, _e, { kind }) => {
      if (kind !== 'apply') return;
      void qc.invalidateQueries({ queryKey: family.consulting });
      void qc.invalidateQueries({ queryKey: family.drawer });
    },
  });
}

/** 컨설팅 탭 전체를 버린다 — 납부 한 줄이 단계 보드의 계약 단계까지 흔들 수 있다 */
function useConsultingFamilyInvalidate(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: family.consulting });
  };
}

export function useAddConsultingContractFile(): UseMutationResult<ConsultingFile, unknown, { consId: number } & ConsultingFileCreate> {
  const invalidate = useConsultingFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ consId, ...body }) => (await api.post<ConsultingFile>(`/consulting/${consId}/contract-files`, body)).data,
    onSettled: invalidate,
  });
}

export function useRemoveConsultingContractFile(): UseMutationResult<void, unknown, { consId: number; fileId: number }> {
  const invalidate = useConsultingFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ consId, fileId }) => { await api.delete(`/consulting/${consId}/contract-files/${fileId}`); },
    onSettled: invalidate,
  });
}

export function useAddConsultingFeedback(): UseMutationResult<ConsultingFeedback, unknown, { consId: number } & ConsultingFeedbackCreate> {
  const invalidate = useConsultingFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ consId, ...body }) => (await api.post<ConsultingFeedback>(`/consulting/${consId}/feedback`, body)).data,
    onSettled: invalidate,
  });
}

export function useResolveConsultingFeedback(): UseMutationResult<ConsultingFeedback, unknown, { consId: number; feedbackId: number }> {
  const invalidate = useConsultingFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ consId, feedbackId }) =>
      (await api.post<ConsultingFeedback>(`/consulting/${consId}/feedback/${feedbackId}/resolve`, {})).data,
    onSettled: invalidate,
  });
}

export function useDeliverConsultingContract(): UseMutationResult<ConsultingDetail, unknown, number> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async (consId) => (await api.post<ConsultingDetail>(`/consulting/${consId}/deliver`, {})).data,
    onSuccess: (detail) => qc.setQueryData(sessionQueryKey(qk.consultingDetail(detail.id), viewerId), detail),
    onSettled: () => { void qc.invalidateQueries({ queryKey: family.consulting }); },
  });
}

export function useAddConsultingSignedFile(): UseMutationResult<ConsultingFile, unknown, { consId: number } & ConsultingFileCreate> {
  const invalidate = useConsultingFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ consId, ...body }) => (await api.post<ConsultingFile>(`/consulting/${consId}/signed-files`, body)).data,
    onSettled: invalidate,
  });
}

export function useArchiveConsulting(): UseMutationResult<void, unknown, number> {
  const invalidate = useConsultingFamilyInvalidate();
  return useMutation({
    mutationFn: async (consId) => { await api.delete(`/consulting/${consId}`); },
    onSettled: invalidate,
  });
}

/** 납부 넣기 — §28 동작 ①. 돌려받은 줄 하나로 화면을 고쳐 그린다. */
export function useAddConsPayment(): UseMutationResult<ConsAccountRow, unknown, { consId: number } & ConsPaymentCreate> {
  const invalidate = useConsultingFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ consId, ...body }) => (await api.post<ConsAccountRow>(`/consulting/${consId}/payments`, body)).data,
    onSettled: invalidate,
  });
}

/**
 * 청구서로 전환 — §28 동작 ②. 청구서가 생기므로 회계 탭(§53)도 함께 버린다.
 * 받는 학생(`studentId`)은 사람이 고른다 — 학생이 여럿이면 필수 · 한 명이면 비운다(서버가 그 학생으로 낸다 · N-33 ②).
 */
export function useConsToInvoice(): UseMutationResult<ConsAccountRow, unknown, { consId: number; studentId?: number }> {
  const qc = useQueryClient();
  const invalidate = useConsultingFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ consId, studentId }) =>
      (await api.post<ConsAccountRow>(`/consulting/${consId}/invoice`, studentId === undefined ? {} : { studentId })).data,
    onSettled: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: family.accounting });
    },
  });
}

/* ══ §24 상담 실패 이력 (N-25 채택 · C35) — 이전 단계 보존·판정은 서버 한 곳 ══ */

function useOpsInvalidate() {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  // opsQueryKey 는 canMoney 세그먼트가 붙는다 — 접두 무효화로 두 권한 캐시를 함께 재조회한다.
  return () => qc.invalidateQueries({ queryKey: sessionQueryKey(qk.ops, viewerId) });
}

/** 「+ 신규 문의」 (C90 · A-01 · N-45) — 유입은 언제나 1차 상담. 단계는 보내지 않는다 */
export function useCreateLead(): UseMutationResult<Lead, unknown, LeadCreate> {
  const invalidate = useOpsInvalidate();
  return useMutation({
    mutationFn: async (body) => (await api.post<Lead>('/ops/leads', body)).data,
    onSettled: invalidate,
  });
}

/** 문의 카드 머리 수정 — 성공/실패 뒤 목록 한 벌을 다시 읽어 카드·서랍 제목을 함께 맞춘다. */
export function usePatchLead(): UseMutationResult<Lead, unknown, { id: number } & LeadPatch> {
  const invalidate = useOpsInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch<Lead>(`/ops/leads/${id}`, body)).data,
    onSettled: invalidate,
  });
}

/** 단계 이동 (C90 · N-45) — 받아 주는 값은 카드의 `nextStages` 뿐 (409: LEAD_LOCKED · LEAD_STAGE_INVALID 는 서버 문장) */
export function useMoveLeadStage(): UseMutationResult<Lead, unknown, { id: number } & LeadStageMove> {
  const invalidate = useOpsInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch<Lead>(`/ops/leads/${id}/stage`, body)).data,
    onSettled: invalidate,
  });
}

/** 접촉 기록 한 줄 (C90 · N-44 · A-03) — append-only. 「상담 오늘·지남」·「사후 관리 임박·밀림」은 서버가 다시 센다 */
export function useAddLeadTouch(): UseMutationResult<Lead, unknown, { id: number } & LeadTouchWrite> {
  const invalidate = useOpsInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post<Lead>(`/ops/leads/${id}/touches`, body)).data,
    onSettled: invalidate,
  });
}

/** 실패 확정 — 서버가 그 순간의 단계를 fail_from 으로 명시 기록 (409: ALREADY_FAILED·ENROLLED_LOCKED) */
export function useFailLead(): UseMutationResult<Lead, unknown, { id: number } & LeadFail> {
  const invalidate = useOpsInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post<Lead>(`/ops/leads/${id}/fail`, body)).data,
    onSettled: invalidate,
  });
}

/**
 * §79 수강 학생 — 수업 상세 창을 **열 때만** 부른다 (C55).
 *
 * 회차 목록에 끼워 넣으면 한 주치 회차마다 학생별 질의가 붙는다. `enabled` 로 창이 열린
 * 동안에만 돌린다.
 */
export function useLessonTracking(
  serId: number | null,
  onDate: string | null,
  enabled: boolean,
): UseQueryResult<LessonTracking> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.tracking(serId ?? 0, onDate ?? ''), viewerId),
    queryFn: async () => (await api.get<LessonTracking>('/schedule/tracking', { params: { serId, onDate } })).data,
    enabled: enabled && serId !== null && onDate !== null,
  });
}

/** 되살리기 — 지정값 → 명시값 → 도달 기록 역순, 미분류면 409 UNCLASSIFIED (추정 이관 금지) */
/**
 * 등록 확정 (C91 · A-05 「한 번에 일곱 가지」) — §23 상담 카드에서 부른다.
 *
 * 미리보기(`preview`)는 서버가 **같은 트랜잭션을 돌리고 되돌린** 값이라 화면이 첫 수업일·청구액·겹침·불가 시간을 짓지 않는다(D-R37).
 * 실제 등록은 학생·등록·시간표·청구서·교재·안내·알림·상담 단계를 한 번에 바꾸므로 운영·회차·회계·교재·안내·서랍 갈래를
 * 맨앞자락 그대로 버린다 (`queries-family` 회귀 · C48).
 */
export function useEnrollLead(): UseMutationResult<EnrollResult, unknown, { id: number; kind: 'preview' | 'enroll'; body: LeadEnroll }> {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return useMutation({
    mutationFn: async ({ id, kind, body }) => (
      kind === 'preview'
        ? (await api.post<EnrollResult>(`/ops/leads/${id}/enroll/preview`, body)).data
        : (await api.post<EnrollResult>(`/ops/leads/${id}/enroll`, body)).data
    ),
    onSuccess: (_r, w) => {
      if (w.kind !== 'enroll') return;
      void qc.invalidateQueries({ queryKey: family.ops });
      void qc.invalidateQueries({ queryKey: family.occurrences });
      // 등록 확정은 수업 규칙(SER)을 만든다 — §07 사이드바의 일정 원본 수도
      void qc.invalidateQueries({ queryKey: family.seriesCounts });
      void qc.invalidateQueries({ queryKey: family.accounting });
      void qc.invalidateQueries({ queryKey: family.books });
      void qc.invalidateQueries({ queryKey: family.guides });
      void qc.invalidateQueries({ queryKey: family.drawer });
      // 새 학생은 코드표(학생 목록)에도 든다 — 다음 창이 옛 목록을 들지 않게
      void qc.invalidateQueries({ queryKey: sessionQueryKey(qk.meta, viewerId) });
    },
  });
}

/** §67 「+ 접수」 (C93 · J-96) — 접수는 언제나 received · 담당 알림은 서버 */
export function useCreateComplaint(): UseMutationResult<Complaint, unknown, ComplaintCreate> {
  const invalidate = useOpsInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<Complaint>('/ops/complaints', body)).data,
    onSettled: () => { void invalidate(); void qc.invalidateQueries({ queryKey: family.drawer }); },
  });
}

/**
 * 「+ 회의 잡기」 (C96 · N-46 ③ · 원문 §63).
 *
 * 회의는 **시간표에 생긴다** — 그래서 `family.schedule` 도 함께 버린다. 운영 탭만 갱신하면
 * 방금 잡은 회의가 시간표 화면에는 안 보이고, 사람은 「안 만들어졌나」 하고 한 번 더 누른다.
 * 겹침 409(`RESOURCE_CONFLICT`)는 **서버 문장 그대로** 창 안에 적는다.
 */
export function useCreateMeeting(): UseMutationResult<MeetingCreateResult, unknown, MeetingCreate> {
  const invalidate = useOpsInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<MeetingCreateResult>('/ops/meetings', body)).data,
    onSettled: () => {
      void invalidate();
      void qc.invalidateQueries({ queryKey: family.occurrences });
      // 회의를 잡으면 시간표에 회차(SER)가 선다 — §07 사이드바의 일정 원본 수도
      void qc.invalidateQueries({ queryKey: family.seriesCounts });
      void qc.invalidateQueries({ queryKey: family.horizon });
      void qc.invalidateQueries({ queryKey: family.drawer });
    },
  });
}

/**
 * 「+ 기획 올리기」 (C96 · N-46 ③ · 원문 §61).
 *
 * **단계를 보내지 않는다** — 올린 기획은 언제나 첫 칸이다. 화면이 단계를 고르면 전이표가 두 벌이 된다
 * (C90 「+ 신규 문의」와 같은 규약). 기한도 **제안**일 뿐이라 대표 승인 전에는 §62 표에 서지 않는다.
 */
export function useCreatePlan(): UseMutationResult<PlanCreateResult, unknown, PlanCreate> {
  const invalidate = useOpsInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<PlanCreateResult>('/ops/plans', body)).data,
    onSettled: () => { void invalidate(); void qc.invalidateQueries({ queryKey: family.drawer }); },
  });
}

/** §67 카드 처리 (C93 · J-101) — 보낸 칸만 · 대응은 담당이, 마무리는 결과가 있어야 한다(409 는 서버 문장) */
export function usePatchComplaint(): UseMutationResult<Complaint, unknown, { id: number } & ComplaintPatch> {
  const invalidate = useOpsInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch<Complaint>(`/ops/complaints/${id}`, body)).data,
    onSettled: () => { void invalidate(); void qc.invalidateQueries({ queryKey: family.drawer }); },
  });
}

/**
 * 강사 교체 마법사 (C93 · J-97 · D-46 · N-132) — 미리보기는 되돌린 값이라 캐시를 건드리지 않는다.
 * 실제 교체 뒤에는 시간표·안내·운영·서랍·현황판·강사 홈이 전부 옛 강사를 들고 있으므로 갈래째 버린다.
 */
export function useTeacherChange(): UseMutationResult<TeacherChangeResult, unknown, { kind: 'preview' | 'apply'; body: TeacherChange }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, body }) => (
      kind === 'preview'
        ? (await api.post<TeacherChangeResult>('/ops/teacher-change/preview', body)).data
        : (await api.post<TeacherChangeResult>('/ops/teacher-change', body)).data
    ),
    onSuccess: (_r, w) => {
      if (w.kind !== 'apply') return;
      void qc.invalidateQueries({ queryKey: family.ops });
      void qc.invalidateQueries({ queryKey: family.occurrences });
      void qc.invalidateQueries({ queryKey: family.horizon });
      // 「그 날 이후」 교체는 규칙을 가른다(D-R16) — §07 사이드바의 일정 원본 수도
      void qc.invalidateQueries({ queryKey: family.seriesCounts });
      void qc.invalidateQueries({ queryKey: family.guides });
      void qc.invalidateQueries({ queryKey: family.board });
      void qc.invalidateQueries({ queryKey: family.drawer });
      void qc.invalidateQueries({ queryKey: family.reports });
      void qc.invalidateQueries({ queryKey: family.teacherHome });
      void qc.invalidateQueries({ queryKey: family.accounting });
    },
  });
}

export function useResumeLead(): UseMutationResult<Lead, unknown, { id: number } & LeadResume> {
  const invalidate = useOpsInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post<Lead>(`/ops/leads/${id}/resume`, body)).data,
    onSettled: invalidate,
  });
}

/* ── 상담 카드의 배치안 초안 · 보류 연장 · 2차/진단 일정 쓰기 (wave 3 · g3 · 23-15 · 23-16) ──
 * 옛 `components/intake/intake-queries.ts` 에서 **몸통 그대로** 옮겼다 (W11 D). 응답은 상담 한 줄(LeadDto)이지만
 * 카드 · 머리 수 · 경고가 같이 바뀌므로 `family.ops` 앞자락을 통째로 버린다 — 그 파일의 `useInvalidateOps` 는 아래
 * `useOpsFamilyInvalidate` 와 몸이 같아(`family.ops` 하나) 그것을 쓴다. */

/** 배치안 통째로 바꾸기 — 빈 배열이면 비운다. 단가는 보내지 않는다(단가표가 정본 · 서버가 붙인다) */
export function useSaveLeadPlan(): UseMutationResult<Lead, unknown, { id: number } & LeadPlanWrite> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.put<Lead>(`/ops/leads/${id}/plan`, body)).data,
    onSettled: invalidate,
  });
}

/** 「연장 +2일」 — 새 재확인 날짜는 서버가 센다 */
export function useExtendLeadHold(): UseMutationResult<Lead, unknown, { id: number }> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id }) => (await api.post<Lead>(`/ops/leads/${id}/hold/extend`)).data,
    onSettled: invalidate,
  });
}

/** 2차 · 진단 일정 한 줄 — 같은 종류를 다시 보내면 고쳐 적는다 */
export function useSaveLeadAppt(): UseMutationResult<Lead, unknown, { id: number } & LeadApptWrite> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.put<Lead>(`/ops/leads/${id}/appts`, body)).data,
    onSettled: invalidate,
  });
}

/**
 * 일정 한 줄 지우기 (23-15 · impl3-w8) — 아직 시간표에 없는 줄만 서버가 지운다.
 * 시간표에 만든 줄은 서버가 409 문장으로 막는다(회차는 시간표가 정본) — 화면이 그 판정을 다시 하지 않는다.
 */
export function useDeleteLeadAppt(): UseMutationResult<Lead, unknown, { id: number; kind: LeadAppt['kind'] }> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, kind }) => (await api.delete<Lead>(`/ops/leads/${id}/appts/${kind}`)).data,
    onSettled: invalidate,
  });
}

/** 「스케줄에 N건 만들기」 — 시간표에 회차가 생기므로 시간표 갈래도 버린다 */
export function useScheduleLeadAppts(): UseMutationResult<LeadApptScheduleResult, unknown, { id: number }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => (await api.post<LeadApptScheduleResult>(`/ops/leads/${id}/appts/schedule`)).data,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: family.ops });
      void qc.invalidateQueries({ queryKey: family.occurrences });
      void qc.invalidateQueries({ queryKey: family.horizon });
      // 상담 일정이 시간표 회차(SER)가 된다 — §07 사이드바의 일정 원본 수도
      void qc.invalidateQueries({ queryKey: family.seriesCounts });
    },
  });
}

/* ══ §65 기획 보고서 — 창을 열 때만 부른다 (C56) ═══════════════════════
   기한 결재와 최종 결재는 **보고서 전체**를 돌려받는다. 단추가 열리는지는 서버가 정하므로
   (`canReview` · `reviewBlockedReason`) 한 줄만 갈아 끼우면 단추 상태가 뒤처진다.     */

/**
 * 운영 창(§65 기획 보고서 · §66 회의 상세)에서 쓰고 난 뒤 무엇을 다시 읽는가 —
 * **`family.ops` 앞자락 전체**다.
 *
 * `useOpsInvalidate` 는 `sessionQueryKey(qk.ops, viewerId)` = `['ops','viewer',N]` 를 쓴다.
 * 보고서 키는 `['ops','plan',3,'viewer',N]` 이라 **그 앞자락에 걸리지 않는다** — 사용자 꼬리가
 * 가운데 끼어 있기 때문이다(C48 이 적어 둔 바로 그 함정).
 *
 * 실제로 그랬다. 기한 승인은 201 로 저장됐는데 화면의 칩이 「기한 제안」 그대로였고
 * 「최종 승인」도 안 열렸다. **단위 시험은 전부 통과했다** — 브라우저에서만 보였다.
 */
function useOpsFamilyInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: family.ops });
}

export function usePlanDetail(id: number | null): UseQueryResult<PlanDetail> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.plan(id ?? 0), viewerId),
    queryFn: async () => (await api.get<PlanDetail>(`/ops/plans/${id}`)).data,
    enabled: id !== null,
  });
}

/**
 * 기한 승인 · 반려 — 대표 전용 (409: CEO_ONLY · NO_DUE · DUE_ALREADY_APPROVED · PLAN_DUE_CHANGED).
 *
 * **본 날짜를 함께 보낸다**(W11 · PB-12-2) — 서버는 그 날짜가 지금 기한과 같을 때만 결정한다. 그 사이 담당이 기한을
 * 옮겼으면 409 `PLAN_DUE_CHANGED` 이고 문장이 새 날짜를 말한다. 실패해도 `family.ops` 를 다시 읽어 새 날짜가 선다.
 */
export function useDecidePlanDue(): UseMutationResult<PlanDetail, unknown, { id: number; approve: boolean; dueOn: string }> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, approve, dueOn }) => (await api.post<PlanDetail>(`/ops/plans/${id}/due`, { approve, dueOn })).data,
    onSettled: invalidate,
  });
}

/** 최종 승인 · 보완 요청 — 기한이 먼저 승인돼야 열린다 (409: DUE_NOT_APPROVED …) */
export function useReviewPlan(): UseMutationResult<
  PlanDetail,
  unknown,
  { id: number; decision: 'approve' | 'rework'; reason?: string }
> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post<PlanDetail>(`/ops/plans/${id}/review`, body)).data,
    onSettled: invalidate,
  });
}

/**
 * §65 본문 고치기 — 목표 · 리서치 · 결정 요청 · 제목 · 기한 (S6 · 409: PLAN_LOCKED · PLAN_DUE_APPROVED).
 *
 * **보낸 칸만 간다** — 화면이 안 고친 칸까지 되돌려 보내면 §65 를 나눠 쓰는 자리에서 남의 줄을 덮는다.
 */
export function usePatchPlan(): UseMutationResult<PlanDetail, unknown, { id: number } & PlanPatch> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch<PlanDetail>(`/ops/plans/${id}`, body)).data,
    onSettled: invalidate,
  });
}

/** 기획 담당 변경 — 결재권자만. 새 담당 알림·감사 줄은 서버 트랜잭션이 소유한다. */
export function usePatchPlanOwner(): UseMutationResult<PlanDetail, unknown, { id: number; ownerId: number }> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, ownerId }) => (await api.patch<PlanDetail>(`/ops/plans/${id}/owner`, { ownerId })).data,
    onSettled: invalidate,
  });
}

/**
 * §61 단계 이동 — 갈 수 있는 곳은 서버가 준 `nextStages` 뿐이다 (S6 · 409: PLAN_STAGE_LOCKED · PLAN_STAGE_INVALID).
 * 화면이 전이표를 들면 서버와 갈린다 (D-R18 · D-R39 · C90 `useMoveLeadStage` 와 같은 모양).
 */
export function useMovePlanStage(): UseMutationResult<PlanDetail, unknown, { id: number; to: string }> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, to }) => (await api.patch<PlanDetail>(`/ops/plans/${id}/stage`, { to })).data,
    onSettled: invalidate,
  });
}

/* 아래 둘은 옛 `components/ops/ops-queries.ts` 에서 **몸통 그대로** 옮겼다 (W11 D) — 키를 새로 만들지 않고 `family.ops` 앞자락만 버린다. */

/**
 * §65 「+ 대표 지시」 (w5 · g6 65-4) — 과제(TODO) 한 줄 · 담당 알림 · 감사 줄이 서버에서 한 트랜잭션이다.
 *
 * 응답은 **보고서 전체**다 — 「과제 N/M」을 화면이 한 줄 붙여 다시 세지 않는다 (D-R37).
 * 성공하면 `family.ops` 전체를 버린다 — 보고서(`['ops','plan',id,…]`)·§61 카드의 「과제 N/M」·§62 기한 표·§64 할 일이
 * 전부 그 앞자락 밑에 있다(사용자 꼬리가 가운데 끼는 키라 `sessionQueryKey(qk.ops)` 로는 보고서가 안 걸린다 · C56).
 */
export function useAddPlanTask(): UseMutationResult<PlanDetail, unknown, { id: number } & PlanTaskCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post<PlanDetail>(`/ops/plans/${id}/tasks`, body)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.ops }),
  });
}

/**
 * §59 「+ 오늘 한 것」 (x5 · g6 59-3) — 활동 한 줄 · 감사 줄이 서버에서 한 트랜잭션이다.
 *
 * 응답은 `GET /ops` 의 marketing 줄과 **같은 모양**이지만 화면이 목록에 끼워 넣지 않는다 —
 * 필터 띠의 수·범례·「N건 M일 진행」이 전부 서버 수라, 끼우면 그 수들과 목록이 갈린다 (D-R37).
 * 성공하면 `family.ops` 를 버려 목록과 수를 함께 다시 읽는다.
 */
export function useCreateMarketing(): UseMutationResult<Marketing, unknown, MarketingCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<Marketing>('/ops/marketing', body)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.ops }),
  });
}

/** §59 활동 수정 — 보낸 칸만 고친 뒤 목록·필터 수를 서버에서 다시 읽는다. */
export function usePatchMarketing(): UseMutationResult<Marketing, unknown, { id: number } & import('./types').MarketingPatch> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch<Marketing>(`/ops/marketing/${id}`, body)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.ops }),
  });
}

/** 건의 관리자 답변 — 강사 화면이 같은 행을 다시 읽으므로 운영 목록도 서버에서 재조회한다. */
export function useReplySuggestion(): UseMutationResult<Suggestion, unknown, { id: number; reply: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reply }) => (await api.patch<Suggestion>(`/ops/suggestions/${id}/reply`, { reply })).data,
    onSettled: () => qc.invalidateQueries({ queryKey: family.ops }),
  });
}

/* ══ §66 회의 상세 — 창을 열 때만 부른다 (C57) ═════════════════════════
   속기록 저장과 할 일 배정은 **회의 전체**를 돌려받는다. 「참석 N/M 확인」과 「끝낸 할 일 수」를
   서버가 세므로, 한 줄만 갈아 끼우면 머리의 숫자가 뒤처진다 (D-R37).              */

export function useMeetingDetail(id: number | null): UseQueryResult<MeetingDetail> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.meeting(id ?? 0), viewerId),
    queryFn: async () => (await api.get<MeetingDetail>(`/ops/meetings/${id}`)).data,
    enabled: id !== null,
  });
}

/** 속기록 저장 — 누가 언제 저장했는지는 서버가 남긴다 */
export function useWriteMinutes(): UseMutationResult<MeetingDetail, unknown, { id: number; minutes: string }> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, minutes }) => (await api.post<MeetingDetail>(`/ops/meetings/${id}/minutes`, { minutes })).data,
    onSettled: invalidate,
  });
}

/** 할 일 배정 — TODO 와 담당자 알림이 한 트랜잭션이다 (원문 §66 연동) */
export function useAssignMeetingTask(): UseMutationResult<
  MeetingDetail,
  unknown,
  { id: number; title: string; toId: number; dueOn?: string }
> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post<MeetingDetail>(`/ops/meetings/${id}/todos`, body)).data,
    onSettled: invalidate,
  });
}

/**
 * 「안내 보내기」 (W11 · N-32) — 참석자(직원)에게 알림 한 건씩. 본문은 서버가 사실로 조립한다(비밀번호 없음).
 * 막히면 409 `MEETING_NOTICE_BLOCKED` 이고 문장은 화면의 `noticeBlockedReason` 과 같다.
 */
export function useSendMeetingNotice(): UseMutationResult<MeetingNoticeResult, unknown, { id: number }> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id }) => (await api.post<MeetingNoticeResult>(`/ops/meetings/${id}/notice`)).data,
    onSettled: invalidate,
  });
}

/**
 * 참석 응답 (W11 · N-32) — **본인 줄만** 참석 · 불참. 대리 입력은 없다(서버가 보낸 사람의 줄만 고친다).
 * 회의 목록의 「내 응답 대기 N」도 같은 원장을 세므로 `family.ops` 를 통째로 다시 읽는다.
 */
export function useRespondMeeting(): UseMutationResult<MeetingDetail, unknown, { id: number; confirmed: boolean }> {
  const invalidate = useOpsFamilyInvalidate();
  return useMutation({
    mutationFn: async ({ id, confirmed }) => (await api.post<MeetingDetail>(`/ops/meetings/${id}/attend`, { confirmed })).data,
    onSettled: invalidate,
  });
}

/* ══ §60 대표 피드백 — 세 쓰기 모두 글타래 전체를 돌려받는다 ═══════════════
   한 줄만 붙여 놓으면 「고쳤습니다 / 확인 필요」와 머리의 「고쳐야 할 것 N건」을
   화면이 스스로 다시 세게 된다. 판정은 서버 한 곳이다 (D-R37 · D-R39).       */

/** 대표 코멘트 — 관리자 전원에게 알림 (409: CEO_ONLY) */
export function useMfbComment(): UseMutationResult<MfbThread[], unknown, { mktId: number; body: string }> {
  const invalidate = useOpsInvalidate();
  return useMutation({
    mutationFn: async ({ mktId, body }) => (await api.post<MfbThread[]>(`/ops/marketing/${mktId}/comments`, { body })).data,
    onSettled: invalidate,
  });
}

/** 담당 답의 두 갈래 — 코드는 생성 타입(서버 `MFB_ANSWER_KINDS`)에서 온다 */
type MfbReplyKind = NonNullable<import('./schema').components['schemas']['MfbReplyWriteDto']['kind']>;

/**
 * 담당자 답변 — 코멘트를 쓴 대표에게만 알림 (409: NOT_OWNER·NOT_A_COMMENT · 보류는 MFB_ALREADY_HELD·MFB_ALREADY_FIXED).
 * kind 'hold' 는 「보류」(W11 · N-29 ③) — 카드는 「확인 필요」로 남는다. 비우면 「고친 것 알리기」다.
 */
export function useMfbReply(): UseMutationResult<MfbThread[], unknown, { mktId: number; parentId: number; body: string; kind?: MfbReplyKind }> {
  const invalidate = useOpsInvalidate();
  return useMutation({
    mutationFn: async ({ mktId, ...body }) => (await api.post<MfbThread[]>(`/ops/marketing/${mktId}/replies`, body)).data,
    onSettled: invalidate,
  });
}

/** 답 고치기 — 자기가 쓴 글만 (409: NOT_AUTHOR) */
export function useMfbEdit(): UseMutationResult<MfbThread[], unknown, { id: number; body: string }> {
  const invalidate = useOpsInvalidate();
  return useMutation({
    mutationFn: async ({ id, body }) => (await api.patch<MfbThread[]>(`/ops/marketing/feedback/${id}`, { body })).data,
    onSettled: invalidate,
  });
}

/* ══ GPA 관리 (v2 §4.5·§82 · N-13 채택) — 판정은 전부 서버, 화면은 값만 그린다 ══ */

export function useGpaBoard(anchor?: string): UseQueryResult<GpaBoard> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.gpa(anchor), viewerId),
    queryFn: async () => (await api.get<GpaBoard>('/gpa', { params: anchor ? { anchor } : {} })).data,
    staleTime: 30 * 1000,
  });
}

function useGpaInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: family.gpa });
}

/** 회차 소비 기록 — wait 로 등록. 초과 여부는 서버 잔여로만 판단한다. */
export function useCreateGpaUse(): UseMutationResult<GpaUse, unknown, GpaUseCreate> {
  const invalidate = useGpaInvalidate();
  return useMutation({
    mutationFn: async (w) => (await api.post<GpaUse>('/gpa/uses', w)).data,
    onSettled: invalidate,
  });
}

export function useSetGpaUseState(): UseMutationResult<GpaUse, unknown, { id: number; state: 'wait' | 'ok' }> {
  const invalidate = useGpaInvalidate();
  return useMutation({
    mutationFn: async ({ id, state }) => (await api.patch<GpaUse>(`/gpa/uses/${id}`, { state })).data,
    onSettled: invalidate,
  });
}

export function useDeleteGpaUse(): UseMutationResult<{ ok: true }, unknown, number> {
  const invalidate = useGpaInvalidate();
  return useMutation({
    mutationFn: async (id) => (await api.delete<{ ok: true }>(`/gpa/uses/${id}`)).data,
    onSettled: invalidate,
  });
}

export function usePutGpaAlloc(): UseMutationResult<
  GpaStudent,
  unknown,
  { cycleId: number; studentId: number; points: number }
> {
  const invalidate = useGpaInvalidate();
  return useMutation({
    mutationFn: async (w) => (await api.put<GpaStudent>('/gpa/allocs', w)).data,
    onSettled: invalidate,
  });
}

/** O-150 사이클 마감 (C95) — 도장·소멸·다음 사이클은 서버. 성공/실패 모두 보드를 다시 읽는다 */
export function useCloseGpaCycle(): UseMutationResult<GpaCycleCloseResult, unknown, { cycleId: number }> {
  const invalidate = useGpaInvalidate();
  return useMutation({
    mutationFn: async ({ cycleId }) => (await api.post<GpaCycleCloseResult>(`/gpa/cycles/${cycleId}/close`, {})).data,
    onSettled: invalidate,
  });
}

/* ══ 줌 계정 관리 (§21 목적지 · 대표 결정 2026-09-12 신설) ══════════════════
   점유·「지금 가능」·「만석 시간대」는 **서버가 한 배열에서 센다** — 화면은 그리기만 한다. */

/**
 * `enabled` 는 **서랍(§21)** 때문에 있다. 서랍은 여덟 칸을 한 번에 받지만 격자는 거기 없다 —
 * 칸을 **열 때만** 부른다. 서랍 payload 에 격자를 얹으면 §21 을 안 여는 사람도 매번 값을 치른다.
 * 같은 훅을 쓰므로 서랍과 「줌 계정 관리」가 같은 숫자를 본다.
 */
export function useZoom(onDate?: string, enabled = true): UseQueryResult<ZoomBoard> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.zoom(onDate), viewerId),
    queryFn: async () => (await api.get<ZoomBoard>('/zoom', { params: onDate ? { onDate } : {} })).data,
    staleTime: 30 * 1000,
    enabled,
  });
}

function useZoomInvalidate(accountChanged = false) {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return () => {
    void qc.invalidateQueries({ queryKey: family.zoom });
    // 추가·수정·활성 변경은 일정/안내에서 쓰는 계정 후보도 바꾼다.
    if (accountChanged) void qc.invalidateQueries({ queryKey: sessionQueryKey(qk.meta, viewerId) });
    // 배정은 시간표를 다시 그린다 — 스케줄 캐시도 함께 버린다
    void qc.invalidateQueries({ queryKey: family.occurrences });
  };
}

export function useCreateZoomAccount(): UseMutationResult<ZoomAcct, unknown, ZoomAccountCreate> {
  const invalidate = useZoomInvalidate(true);
  return useMutation({
    mutationFn: async (w) => (await api.post<ZoomAcct>('/zoom/accounts', w)).data,
    onSettled: invalidate,
  });
}

export function usePatchZoomAccount(): UseMutationResult<ZoomAcct, unknown, { id: number } & ZoomAccountPatch> {
  const invalidate = useZoomInvalidate(true);
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch<ZoomAcct>(`/zoom/accounts/${id}`, body)).data,
    onSettled: invalidate,
  });
}

/**
 * 배정 — 회차 하나(onDate 를 주면)거나 규칙 전체. 겹침 판정은 서버가 한다.
 *
 * §43 GuidesTodo는 목록이 준 serId/원래 onDate로 회차 하나만 배정한다.
 * 배정 성공은 계정 칩·발송 gate와 수업 준비 상태도 바꾸지만 meta의 활성 후보는 바꾸지 않는다.
 */
export function useAssignZoom(): UseMutationResult<ZoomAssignResult, unknown, ZoomAssign> {
  const invalidate = useZoomInvalidate();
  const qc = useQueryClient();
  const viewerId = useViewerId();
  const belongsToViewer = ({ queryKey }: { queryKey: readonly unknown[] }) =>
    queryKey.at(-2) === 'viewer' && queryKey.at(-1) === viewerId;
  return useMutation({
    mutationFn: async (w) => (await api.post<ZoomAssignResult>('/zoom/assign', w)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.guides, predicate: belongsToViewer });
      void qc.invalidateQueries({ queryKey: family.tracking, predicate: belongsToViewer });
    },
    onSettled: invalidate,
  });
}

/* ══ 프로그램·과목 관리 (§18 목적지 · 대표 결정 2026-09-12 신설) ═══════════════
   코드(key)는 만들 때만 정한다 — 시간표가 그 낱말로 저장돼 있어 바꾸는 자리를 두지 않는다.
   지우기도 없다: 과목은 끄고, 프로그램은 원문에 끄는 자리조차 없어 고치기만 둔다. */

export function useCatalog(): UseQueryResult<Catalog> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.catalog, viewerId),
    queryFn: async () => (await api.get<Catalog>('/catalog')).data,
    staleTime: 60 * 1000,
  });
}

function useCatalogInvalidate() {
  const qc = useQueryClient();
  const viewerId = useViewerId();
  return () => {
    void qc.invalidateQueries({ queryKey: sessionQueryKey(qk.catalog, viewerId) });
    // 코드표가 바뀌면 화면 곳곳의 이름·색이 바뀐다 — meta 도 함께 버린다
    void qc.invalidateQueries({ queryKey: sessionQueryKey(qk.meta, viewerId) });
  };
}

export function useCreateKind(): UseMutationResult<CatalogKind, unknown, KindCreate> {
  const invalidate = useCatalogInvalidate();
  return useMutation({
    mutationFn: async (w) => (await api.post<CatalogKind>('/catalog/kinds', w)).data,
    onSettled: invalidate,
  });
}

export function usePatchKind(): UseMutationResult<CatalogKind, unknown, { key: string } & KindPatch> {
  const invalidate = useCatalogInvalidate();
  return useMutation({
    mutationFn: async ({ key, ...body }) => (await api.patch<CatalogKind>(`/catalog/kinds/${key}`, body)).data,
    onSettled: invalidate,
  });
}

export function useCreateSub(): UseMutationResult<CatalogSub, unknown, SubCreate> {
  const invalidate = useCatalogInvalidate();
  return useMutation({
    mutationFn: async (w) => (await api.post<CatalogSub>('/catalog/subs', w)).data,
    onSettled: invalidate,
  });
}

export function usePatchSub(): UseMutationResult<CatalogSub, unknown, { key: string } & SubPatch> {
  const invalidate = useCatalogInvalidate();
  return useMutation({
    mutationFn: async ({ key, ...body }) => (await api.patch<CatalogSub>(`/catalog/subs/${key}`, body)).data,
    onSettled: invalidate,
  });
}

/* ══ 보호자와 선택 발송 (DQ3 대표 답변 2026-09-25 · 메일·SENS 만) ═══════════════════
   연락처는 관리 화면 전용 응답이다 — 강사에게는 서버가 403 으로 막는다. 채널이 보낼 수 있는지는
   서버 설정(`GET /guardians/channels`)이 정한다: 화면이 「메일은 된다」를 따로 적지 않는다. */

export function useGuardians(studentId: number | null, enabled = true): UseQueryResult<GuardianList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.guardians(studentId ?? 0), viewerId),
    queryFn: async () => (await api.get<GuardianList>(`/students/${studentId}/guardians`)).data,
    enabled: enabled && studentId !== null,
  });
}

export function useGuardianChannels(enabled = true): UseQueryResult<GuardianChannels> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(qk.guardianChannels, viewerId),
    queryFn: async () => (await api.get<GuardianChannels>('/guardians/channels')).data,
    enabled,
    staleTime: 60 * 1000,
  });
}

export type GuardianWrite =
  | { kind: 'create'; studentId: number; body: GuardianCreate }
  | { kind: 'patch'; id: number; body: GuardianPatch }
  | { kind: 'deactivate'; id: number };

/** 추가·고치기·사용 중지 — 대표 바꾸기는 다른 보호자 줄도 바꾸므로 그 학생 목록을 통째로 다시 받는다 */
export function useGuardianWrite(): UseMutationResult<Guardian, unknown, GuardianWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w) => {
      if (w.kind === 'create') return (await api.post<Guardian>(`/students/${w.studentId}/guardians`, w.body)).data;
      if (w.kind === 'patch') return (await api.patch<Guardian>(`/guardians/${w.id}`, w.body)).data;
      return (await api.delete<Guardian>(`/guardians/${w.id}`)).data;
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: family.guardians }); },
  });
}

/**
 * 선택 발송 — 결과(보호자×채널마다 보냄·실패·설정 없음)는 서버 원장 그대로다.
 * 실제로 나간 것이 있으면 §43 회차 안내 줄의 「기록됨」이 바뀌므로 안내·§12 준비 갈래를 버린다.
 */
export function useSendToGuardians(): UseMutationResult<GuardianSendResult, unknown, GuardianSend> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post<GuardianSendResult>('/guardians/send', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: family.guides });
      void qc.invalidateQueries({ queryKey: family.tracking });
      // §30 ③ 계약서 전달(N-77) — 메일이 나가면 계약이 「전달」 단계로 넘어간다
      void qc.invalidateQueries({ queryKey: family.consulting });
      // §47 주간 묶음(N-54) — 나간 묶음은 「보냄」 · 총평이 잠긴다
      void qc.invalidateQueries({ queryKey: family.reportWeekly });
    },
  });
}

/* ══ 상담 진단 점수 (DQ1 · 2026-09-25 「점수만 저장 + 담당자가 선택」) ═══════════════
   점수 셋만 적고 레벨·교재는 담당자가 고른다 — 서버도 화면도 점수로 추천하지 않는다.
   이력은 상세 서랍에서 「이력 보기」·「+ 점수 기록」을 눌렀을 때만 부른다(카드는 GET /ops 의 latestDiag 로 그린다 — 왕복 0). */

/** 한 상담 건의 진단 이력 — 앞자락이 `qk.ops` 라 `family.ops` 무효화에 함께 걸린다 */
export function leadDiagQueryKey(leadId: number) {
  return [...qk.ops, 'lead-diag', leadId] as const;
}

export function useLeadDiag(leadId: number, enabled = true): UseQueryResult<LeadDiagList> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(leadDiagQueryKey(leadId), viewerId),
    queryFn: async () => (await api.get<LeadDiagList>(`/ops/leads/${leadId}/diag`)).data,
    enabled,
  });
}

/** 진단 한 줄 적기 — append-only. 카드의 latestDiag 와 이력이 같이 바뀌므로 운영 갈래를 통째로 버린다 */
export function useAddLeadDiag(): UseMutationResult<LeadDiagList, unknown, { id: number } & LeadDiagWrite> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post<LeadDiagList>(`/ops/leads/${id}/diag`, body)).data,
    onSettled: () => { void qc.invalidateQueries({ queryKey: family.ops }); },
  });
}

/* ══ 계정 첫 설정 (W8 · 대표 지시 2026-09-26) ═══════════════════════════════════════
   규칙 문장 · 채널 이름 · 못 보내는 까닭은 서버가 준다. 코드 받기 · 마치기는 로그인처럼 화면이 직접 부른다
   (마치면 세션이 통째로 바뀌어 캐시를 비우므로 여기서 무효화할 것이 없다). */

export function useOnboardingInfo(enabled = true): UseQueryResult<OnboardingInfo> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(['auth', 'onboarding'] as const, viewerId),
    queryFn: async () => (await api.get<OnboardingInfo>('/auth/onboarding')).data,
    enabled,
  });
}

/* ══ 비밀번호 찾기 (N-101 · 대표 결정 2026-09-26) ═══════════════════════════════════
   로그인 전 화면이 읽는 안내(규칙 문장 · 코드 시간 · 채널 낱말) — 계정과 무관하다. 코드 받기 · 마치기는 첫 설정처럼 화면이 직접 부른다. */

export function usePasswordResetInfo(): UseQueryResult<PasswordResetInfo> {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: sessionQueryKey(['auth', 'password-reset'] as const, viewerId),
    queryFn: async () => (await api.get<PasswordResetInfo>('/auth/password-reset')).data,
  });
}
