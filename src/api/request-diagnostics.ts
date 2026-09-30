/** @file-guide
 * 목적: request-diagnostics.ts — 공용 API 요청의 값 없는 브라우저 진단
 * 책임/재사용: client 한 곳에서 로컬 operation/attempt·전송/병합·HTTP 상태를 기록한다. 본문 값, 헤더, params, 원시 오류는 기록/보관하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { browserLog, type BrowserLogDetails } from '@/lib/browser-log';

// API 라우팅/DTO 계약이 아닌 보수적인 출력 allowlist다. 새 경로/필드는 등록 전에도 요청할 수 있지만 로그에서는 가린다.
const ROOTS = new Set('health auth meta schedule reports files accounting ops books guides zoom consulting board teacher gpa exec drawer permissions catalog students guardians'.split(' '));
const SEGMENTS = new Set(`accounting accounts ack active allocs approvals appts areas assign attend attendance batch board body
  bonus-rules book books carry cashflow change-requests channels class-diagnostics close codes comments complaints complete completed
  confirm conflicts contract-files copy cycles day-cancel deliver deliveries diag diagnostics draft drafts due enroll expenses extend
  fail feedback files gpa-request-options guardians guides history hold holders holidays home horizon invoice invoices issues items
  kinds latest-diag leads login logout manual marketing me meetings mine minutes move notes notice notices notis occurrences onboarding
  other-income owner password-reset paste pause payments payouts plan plans preview privacy progress rates read read-all receive received
  refresh reminders reopen replies reply report requests resend resolve resume return review roster schedule schedule-history send
  series-counts sessions share shell signed-files staff staff-directory stage state students sturates submit subs suggestions tasks teacher-change teachers
  templates todos touches tracking tuition unavailable undo unwritten use uses versions void wages weekly withdraw withdrawals zoom-notice`.split(/\s+/));
const FIELDS = new Set(`id ids name title body email phone password loginId accessToken refreshToken code message detail
  kind kindKey type mode area state status done date onDate from to startMin endMin duration scope readVersion
  serId serIds studentId studentIds teacherId teacherIds staffId staffIds roomId zoomId guideId targetIds
  amount invId invoiceId requestKey month week weekOf reason note memo description content items students teachers
  guardians members todos log projected effScope overwrote undo token result data ok total count version
  file files fileId fileIds filename url relation primary payer country school grade subjectId bookId libId
  consId meetingId leadId guardianId payId userId order enabled active paidAt dueDate paidDate method channel
  attendance canceled recurring startDate endDate repeat days dateList recipients text comment share role permissions`.split(/\s+/));
// 형식 검사만으로는 SECRET_TOKEN 같은 임의 문자열을 막지 못하므로 승인된 기계 코드만 출력한다.
const CODES = new Set(`TIMEOUT ABORTED CANCELED NETWORK REQUEST_FAILED SESSION_CHANGED
  BAD_REQUEST UNAUTHORIZED FORBIDDEN NOT_FOUND CONFLICT ERROR INTERNAL RESOURCE_CONFLICT DUPLICATE
  INVALID_AMOUNT REFERENCE_NOT_FOUND BAD_RANGE PAUSE_OVERLAP OVERPAY INVALID_TOKEN TOKEN_EXPIRED
  OCCURRENCE_NOT_FOUND SOURCE_NOT_FOUND STUDENT_NOT_FOUND TEACHER_NOT_FOUND ROOM_NOT_FOUND
  PAY_REQUEST_KEY_REUSED INVALID_LOGIN_ID PASSWORD_RULE RESET_CODE_INVALID SAME_AS_CURRENT
  MODE_ROOM_ONLINE STAFF_AUDIT_CURSOR_INVALID`.split(/\s+/));
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
type BodyShape = { bodyType: string; fields: string; otherFields: number };

/** 값은 보관하지 않는다. ID는 탭 내 진단용이며 서버의 trace ID나 idempotency key가 아니다. */
export type RequestDiagnostic = {
  requestId: string;
  attempt: number;
  method: string;
  route: string;
  startedAt: number;
  body: BodyShape;
  delivery: 'not_dispatched' | 'dispatch' | 'coalesced';
  coalescedWith: string | null;
  coalescedAttempt: number | null;
};
let sequence = 0;

function safeRoute(url?: string): string {
  try {
    if (!url || url.length > 2048) return '[redacted-route]';
    const path = new URL(url, 'https://local.invalid').pathname.replace(/^\/api\/v1(?=\/|$)/, '');
    const segments = path.split('/').filter(Boolean);
    if (!ROOTS.has(segments[0] ?? '') || segments.length > 12) return '[redacted-route]';
    return `/${segments.map((part, index) => index === 0 || SEGMENTS.has(part) ? part : ':value').join('/')}`;
  } catch { return '[redacted-route]'; }
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** 최상위 plain object의 허용 key/type만 읽는다. JSON 문자열/배열/파일을 펼치거나 accessor를 실행하지 않는다. */
function bodyShape(body: unknown): BodyShape {
  try {
    if (typeof FormData !== 'undefined' && body instanceof FormData) return { bodyType: 'multipart', fields: '', otherFields: 0 };
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return { bodyType: valueType(body), fields: '', otherFields: 0 };
    }
    const prototype = Object.getPrototypeOf(body);
    if (prototype !== Object.prototype && prototype !== null) return { bodyType: 'opaque', fields: '', otherFields: 0 };
    const keys = Object.keys(body);
    const allowed = keys.filter((key) => FIELDS.has(key)).sort().slice(0, 32);
    const fields = allowed.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(body, key);
      return `${key}:${descriptor && 'value' in descriptor ? valueType(descriptor.value) : 'accessor'}`;
    }).join(',');
    return { bodyType: 'object', fields, otherFields: Math.min(999, keys.length - allowed.length) };
  } catch { return { bodyType: 'unknown', fields: '', otherFields: 0 }; }
}

export function beginRequestDiagnostic({ method, url, body, previous }: {
  method?: string; url?: string; body?: unknown; previous?: RequestDiagnostic;
}): RequestDiagnostic {
  const upperMethod = method?.toUpperCase() ?? 'GET';
  return {
    requestId: previous?.requestId ?? `local-${++sequence}`,
    attempt: (previous?.attempt ?? 0) + 1,
    method: METHODS.has(upperMethod) ? upperMethod : 'OTHER',
    route: safeRoute(url), startedAt: Date.now(), body: previous?.body ?? bodyShape(body),
    delivery: 'not_dispatched', coalescedWith: null, coalescedAttempt: null,
  };
}

function common(diagnostic: RequestDiagnostic): BrowserLogDetails {
  return {
    requestId: diagnostic.requestId, attempt: diagnostic.attempt, method: diagnostic.method, route: diagnostic.route,
    delivery: diagnostic.delivery, coalescedWith: diagnostic.coalescedWith, coalescedAttempt: diagnostic.coalescedAttempt,
  };
}

/** console 비활성/확장 기능 예외도 업무 요청을 실패시키지 않는다. 개발/운영 모두 일반 info/warn을 쓴다. */
export function logRequestDispatch({ diagnostic, coalescedWith }: {
  diagnostic: RequestDiagnostic; coalescedWith?: RequestDiagnostic;
}): void {
  diagnostic.delivery = coalescedWith ? 'coalesced' : 'dispatch';
  diagnostic.coalescedWith = coalescedWith?.requestId ?? null;
  diagnostic.coalescedAttempt = coalescedWith?.attempt ?? null;
  try { browserLog('api.request', { ...common(diagnostic), ...diagnostic.body }); } catch { /* best effort */ }
}

export function logRequestOutcome({ diagnostic, outcome, status, code, body }: {
  diagnostic?: RequestDiagnostic; outcome: 'response' | 'error'; status: number; code?: unknown; body?: unknown;
}): void {
  if (!diagnostic) return;
  try {
    browserLog(`api.${outcome}`, {
      ...common(diagnostic), status, durationMs: Math.max(0, Date.now() - diagnostic.startedAt), ...bodyShape(body),
      code: outcome === 'response' ? 'OK' : typeof code === 'string' && CODES.has(code) ? code : status ? 'HTTP_ERROR' : 'REQUEST_FAILED',
    }, outcome === 'error' ? 'warn' : 'info');
  } catch { /* best effort — raw error도 fallback으로 출력하지 않는다. */ }
}
