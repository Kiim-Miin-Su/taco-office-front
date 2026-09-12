/** @file-guide
 * 목적: types.ts — OkResult, ApiErrorResponse, Me, Meta, Kind 등 (contract)
 * 책임/재사용: backend DTO/OpenAPI에서 생성한 타입만 별칭으로 소비한다. 응답 타입을 손으로 복제하지 않고 요청/응답/오류를 생성 계약과 대조한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * API 타입 — **생성물에서만 가져온다.**
 *
 * `schema.d.ts` 는 백엔드의 `openapi.json` 에서 만든 것이고, 그 json 은 DTO 에서 나온다.
 * 여기서 `interface MeDto { … }` 를 손으로 다시 적으면 형상이 조용히 어긋난다
 * (docs/contracts/CONTRACTS.md §1 · AGENT.md §2.2).
 *
 * 갱신: `npm run types:gen`
 */
import type { components, paths } from './schema';

type S = components['schemas'];

export type OkResult = S['OkDto'];
export type ApiErrorResponse = S['ApiErrorDto'];

export type Me = S['MeDto'];

/** 강사 홈 — GET /teacher/home (강사 전용, 서버가 본인 고정) */
export type TeacherHome = S['TeacherHomeDto'];
export type TeacherHistory = S['TeacherHistoryDto'];
export type TeacherGuides = S['TeacherGuidesDto'];
export type TeacherUnav = S['TeacherUnavDto'];
export type TeacherUnavBlock = S['TeacherUnavBlockDto'];
export type TeacherUnavCreate = S['TeacherUnavCreateDto'];
export type TeacherGuideStudent = S['TeacherGuideStudentDto'];
export type TeacherSuggestions = S['TeacherSuggestionsDto'];
export type TeacherSuggestion = S['TeacherSuggestionDto'];
export type TeacherSuggestionCreate = S['TeacherSuggestionCreateDto'];
/** 강사 §8 내 설정 — 시간대·시급과 올린 요청 이력 */
export type TeacherSettings = S['TeacherSettingsDto'];
/** 강사 §8 내 설정 변경 요청 (C39) — 올리기만 하고 적용은 관리자 승인 뒤다 */
export type TeacherSettingRequest = S['TeacherSettingRequestDto'];
export type TeacherSettingReqCreate = S['TeacherSettingReqCreateDto'];
export type TeacherHistoryLesson = S['TeacherHistoryLessonDto'];
export type TeacherLesson = S['TeacherLessonDto'];

/** 코드표 — 색과 이름의 유일한 출처. 프론트에 KIND/SUB 를 복사해 두지 않는다 (D-R18) */
export type Meta = S['MetaDto'];
export type Kind = S['KindDto'];
export type Sub = S['SubDto'];
export type Room = S['RoomDto'];
export type Zacc = S['ZaccDto'];
export type StaffBrief = S['StaffBriefDto'];
export type StudentBrief = S['StudentBriefDto'];

/** 스케줄 — 탭 01 의 다섯 화면이 이 한 모양을 쓰고 묶는 방법만 다르다 */
export type Occurrence = S['OccurrenceDto'];
export type OccurrenceList = S['OccurrenceListDto'];
/** Query도 DTO/OpenAPI 정본에서 가져온다. 숫자 필터를 string으로 수기 재선언하지 않는다. */
export type OccurrenceQuery = paths['/schedule/occurrences']['get']['parameters']['query'];
export type OccStudent = S['OccStudentDto'];
export type Attendance = S['AttendanceDto'];
export type AttendanceWrite = S['AttendanceWriteDto'];
export type AttendanceMutationResult = S['AttendanceMutationResultDto'];
export type AttendanceResult = AttendanceWrite['result'];
export type AttendanceCancelReason = NonNullable<AttendanceWrite['reason']>;

/** 리포트 */
export type ReportQuery = NonNullable<paths['/reports']['get']['parameters']['query']>;
export type ReportTeacherQuery = NonNullable<paths['/reports/unwritten']['get']['parameters']['query']>;
export type ReportDeliveryQuery = NonNullable<paths['/reports/deliveries']['get']['parameters']['query']>;
export type ReportHistoryQuery = NonNullable<paths['/reports/deliveries/history']['get']['parameters']['query']>;
export type ReportRow = S['ReportRowDto'];
export type ReportList = S['ReportListDto'];
export type Unwritten = S['UnwrittenDto'];
export type UnwrittenByTeacher = S['UnwrittenByTeacherDto'];
export type ReportBody = S['ReportBodyDto'];
export type ReportField = S['ReportFieldDto'];
export type ReportDetail = S['ReportDetailDto'];
export type ReportUpsert = S['ReportUpsertDto'];
export type ReportReview = S['ReportReviewDto'];
export type ReportDeliveryQueue = S['ReportDeliveryQueueDto'];
export type ReportDeliveryStudent = S['ReportDeliveryStudentDto'];
export type ReportDeliveryCreate = S['ReportDeliveryCreateDto'];
export type ReportDeliveryResult = S['ReportDeliveryResultDto'];
export type ReportSendHistory = S['ReportSendHistoryDto'];
export type ReportSendHistoryList = S['ReportSendHistoryListDto'];

/** 회계 — 금액은 canSeeProfit 이 아니면 서버가 null 로 내려준다 (D-R39) */
export type Accounting = S['AccountingDto'];
export type Invoice = S['InvoiceDto'];
export type InvoiceIssue = S['InvoiceIssueDto'];
export type Payment = S['PaymentDto'];
/** 입금 한 줄 등록 — 분납은 줄을 늘린다 (A-D2 · C36-a) */
export type PaymentCreate = S['PaymentCreateDto'];
/** 나간 돈 §56 — 부대비용·법인카드 (A-D3·A-D5 · C36-b) */
export type Expense = S['ExpenseDto'];
export type ExpenseTotal = S['ExpenseTotalDto'];
export type ExpenseReview = S['ExpenseReviewDto'];
export type Payout = S['PayoutDto'];
export type MoneySummary = S['MoneySummaryDto'];

/** 운영 — 상담 · 컴플레인 · 할 일 · 기획 · 회의 · 마케팅 · 건의 */
export type Ops = S['OpsDto'];
export type Lead = S['LeadDto'];
/** §24 실패 전이/되살리기 입력 — 판정 코드(ALREADY_FAILED 등)는 서버가 낸다 (N-25 · C35) */
export type LeadFail = S['LeadFailDto'];
export type LeadResume = S['LeadResumeDto'];
export type Complaint = S['ComplaintDto'];
export type Todo = S['TodoDto'];
export type Plan = S['PlanDto'];
export type Meeting = S['MeetingDto'];
export type Marketing = S['MarketingDto'];
export type Suggestion = S['SuggestionDto'];

/** 스케줄 쓰기 — 자원 + scope 한 형태 (D-R16 · D-R21) */
export type OccurrenceCreate = S['OccurrenceCreateDto'];
export type OccurrenceRef = S['OccurrenceRefDto'];
export type OccurrencePaste = S['OccurrencePasteDto'];
export type OccurrenceMove = S['OccurrenceMoveDto'];
export type OccurrenceMoveItem = S['OccurrenceMoveItemDto'];
export type OccurrencePatch = S['OccurrencePatchDto'];
export type OccurrenceDelete = S['OccurrenceDeleteDto'];
export type RosterPatch = S['RosterPatchDto'];
export type WriteResult = S['WriteResultDto'];
export type RosterResult = S['RosterResultDto'];
export type Horizon = S['HorizonDto'];
/** 'this' | 'future' | 'all' — 화면이 문자열을 다시 적지 않게 DTO 에서 가져온다 */
export type Scope = OccurrencePatch['scope'];
export type RosterOp = RosterPatch['op'];

/** 컨설팅 — 금액은 대표만 (D-R39) */
export type ConsultingList = S['ConsultingListDto'];
export type Consulting = S['ConsultingDto'];
export type ConsItem = S['ConsItemDto'];
export type GpaBoard = S['GpaBoardDto'];

/* ══ 줌 계정 관리 — §21 서랍의 「줌 계정 관리」가 가는 자리 (대표 결정 2026-09-12 신설) ══ */
export type ZoomBoard = S['ZoomBoardDto'];
export type ZoomAcct = S['ZoomAcctDto'];

/* ══ 프로그램·과목 관리 — §18 의 「프로그램 · 과목 전체 열기」가 가는 자리 (신설) ══ */
export type Catalog = S['CatalogDto'];
export type CatalogKind = S['KindRowsDto'];
export type CatalogSub = S['SubRowDto'];
export type KindCreate = S['KindCreateDto'];
export type KindPatch = S['KindPatchDto'];
export type SubCreate = S['SubCreateDto'];
export type SubPatch = S['SubPatchDto'];
export type ZoomAccountCreate = S['ZoomAccountCreateDto'];
export type ZoomAccountPatch = S['ZoomAccountPatchDto'];
export type ZoomAssign = S['ZoomAssignDto'];
export type ZoomAssignResult = S['ZoomAssignResultDto'];

/* ══ 올린 파일 — Neon 안에 둔다 (대표 결정 2026-09-12 · D6 · A-D4) ══ */
export type FileRef = S['FileRefDto'];
export type FileUpload = S['FileUploadDto'];
export type GpaStudent = S['GpaStudentDto'];
export type GpaUse = S['GpaUseDto'];
export type GpaUseCreate = S['GpaUseCreateDto'];
export type ConsultingSession = S['ConsultingSessionDto'];

/** 교재 */
export type Books = S['BooksDto'];
export type Book = S['BookDto'];

/** 안내 — 한 번만(GUIDE) 과 회차마다(PNOTI) 는 다른 것이다 */
export type Guides = S['GuidesDto'];
export type Guide = S['GuideDto'];
export type PerLessonNotice = S['PerLessonNoticeDto'];

/** 수업 현황판 — 저장하지 않는다. 매번 계산된 값이 내려온다 (D-R4) */
export type Board = S['BoardDto'];
export type BoardRow = S['BoardRowDto'];
export type CheckMark = S['CheckMarkDto'];
export type BoardMarkCount = S['BoardMarkCountDto'];
export type BoardSummary = S['BoardSummaryDto'];
export type BoardTeacherDay = S['BoardTeacherDayDto'];
export type BoardTeacherRow = S['BoardTeacherRowDto'];
export type BoardWeek = S['BoardWeekDto'];

/** 대표 보고 — 집계도 저장하지 않는다 (D-R4) */
export type Exec = S['ExecDto'];
export type ExecQuery = NonNullable<paths['/exec']['get']['parameters']['query']>;
export type ExecStat = S['ExecStatDto'];
export type ExecReport = S['ExecReportDto'];
/** §69 6영역 · §73 결재함 — 이동만 (N-12 · C37) */
export type ExecArea = S['ExecAreaDto'];
export type ExecInbox = S['ExecInboxDto'];

/** 리포트 상태 — 캘린더 블록 색이 이 값에서 나온다 */
export type RepState = Occurrence['repState'];
export type LoginBody = S['LoginDto'];
export type LoginResult = S['LoginResultDto'];
export type RefreshResult = S['RefreshResultDto'];

/** 권한 플래그 이름 — 화면이 조건을 적을 때 오타가 나지 않게 */
export type PermName = {
  [K in keyof Me]: Me[K] extends boolean ? K : never;
}[keyof Me];

/** 서랍 — §14~§21 여덟 칸이 한 응답으로 온다 */
export type Drawer = S['DrawerDto'];
export type ApRow = S['ApRowDto'];
export type ApFlow = S['ApFlowDto'];
export type DrawerTodo = S['DrawerTodoDto'];
export type Noti = S['NotiDto'];
export type Member = S['MemberDto'];
export type TzGroup = S['TzGroupDto'];
export type KindRow = S['KindRowDto'];
export type ChangeReq = S['ChangeReqDto'];
export type ZoomAccount = S['ZoomAccountDto'];
/** 요청 본문의 oneOf를 그대로 쓴다 — 종류별 필수 필드가 컴파일 단계에서 갈린다. */
export type ChangeReqCreate = paths['/drawer/change-requests']['post']['requestBody']['content']['application/json'];
export type ChangeReqResult = S['ChangeReqResultDto'];
/** §14 요청 처리 결과 — `applied` 가 승인이 **실제로 바꾼 것**이다 */
export type ReqReviewResult = S['ReqReviewResultDto'];
export type ConflictRow = S['ConflictRowDto'];
