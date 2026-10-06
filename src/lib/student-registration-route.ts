/** @file-guide
 * 목적: student-registration-route.ts — 학생 등록 공용 route의 출발 화면과 상담 번호를 안전하게 직렬화·역직렬화한다.
 * 책임/재사용: URL에는 허용된 source와 양의 lead ID만 둔다. 학생 개인정보나 등록 판정은 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

export type StudentRegistrationSource = 'students' | 'schedule' | 'intake';

const SOURCES = new Set<StudentRegistrationSource>(['students', 'schedule', 'intake']);
const positiveInteger = /^[1-9]\d*$/;

export function studentRegistrationHref(source: StudentRegistrationSource, leadId?: number | null) {
  const query = new URLSearchParams({ source });
  if (source === 'intake' && Number.isSafeInteger(leadId) && (leadId ?? 0) > 0) query.set('lead', String(leadId));
  return `/students/new?${query.toString()}`;
}

export function parseStudentRegistrationContext(searchParams: Pick<URLSearchParams, 'get'>): {
  source: StudentRegistrationSource;
  leadId: number | null;
} {
  const rawSource = searchParams.get('source');
  const source = rawSource && SOURCES.has(rawSource as StudentRegistrationSource)
    ? rawSource as StudentRegistrationSource
    : 'students';
  const rawLead = searchParams.get('lead');
  const leadId = source === 'intake' && rawLead && positiveInteger.test(rawLead)
    ? Number(rawLead)
    : null;
  return { source, leadId: Number.isSafeInteger(leadId) ? leadId : null };
}
