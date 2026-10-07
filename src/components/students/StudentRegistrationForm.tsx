/** @file-guide
 * 목적: StudentRegistrationForm.tsx — 신규 학생 15절의 순서·반복 입력·Front 초안 검증과 등록 방식 전환을 소유한다.
 * 책임/재사용: 공용 UI/useMeta/교육체계 projection/세션 권한을 재사용하고 재활성화 실제 흐름은 전용 section에 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { useMeta } from '@/api/queries';
import { ApiError } from '@/api/client';
import type { StaffBrief, StudentBrief } from '@/api/types';
import { educationGradeOptions } from '@/lib/education-grades';
import { todayKst } from '@/lib/calendar';
import {
  STUDENT_PERIOD_STATE_LABEL, normalizeStudentPeriod, studentPeriodState, studentPeriodsOverlap,
  type StudentPeriod, type StudentPeriodPrecision,
} from '@/lib/student-profile-period';
import { Banner, Button, Checkbox, Chip, FieldError, Input, Label, LinkButton, PageHeader, Segmented, Select, Textarea } from '@/components/ui';
import { useStudentReadAllowed } from '@/api/students';
import type { StudentRegistrationSource } from '@/lib/student-registration-route';
import { EducationGradeSelect } from './EducationGradeSelect';
import { StudentReactivationSection } from './StudentReactivationSection';

type ContactType = 'phone' | 'kakao' | 'email' | 'other';
interface ContactDraft { key: number; type: ContactType; value: string; label: string }
interface GuardianDraft {
  key: number; relation: string; relationOther: string; name: string; country: string;
  isPrimary: boolean; isPayer: boolean; contacts: ContactDraft[];
}
interface SchoolDraft {
  key: number;
  query: string;
  from: string;
  fromPrecision: StudentPeriodPrecision;
  to: string;
  toPrecision: StudentPeriodPrecision;
  openEnded: boolean;
}
type Errors = Record<string, string>;
let nextKey = 0;
const contact = (): ContactDraft => ({ key: ++nextKey, type: 'phone', value: '', label: '' });
const guardian = (): GuardianDraft => ({ key: ++nextKey, relation: '', relationOther: '', name: '', country: '', isPrimary: false, isPayer: false, contacts: [contact()] });
const school = (): SchoolDraft => ({
  key: ++nextKey, query: '', from: todayKst(), fromPrecision: 'day', to: '', toPrecision: 'day', openEnded: true,
});
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RELATIONS = [
  ['mother', '어머니'], ['father', '아버지'], ['aunt', '이모님'], ['driver', '기사님'], ['other', '기타'],
] as const;
const CONTACT_TYPES: ReadonlyArray<[ContactType, string]> = [
  ['phone', '휴대폰'], ['kakao', '카카오 ID'], ['email', '이메일'], ['other', '기타'],
];
const SOURCES = [
  ['kakao', '카카오'], ['phone', '전화'], ['blog', '블로그'], ['instagram', '인스타그램'], ['referral', '소개'], ['walkin', '방문'],
] as const;
const PRECISIONS: ReadonlyArray<[StudentPeriodPrecision, string]> = [
  ['year', '연'], ['month', '월'], ['day', '일'],
];

function valueForPrecision(value: string, precision: StudentPeriodPrecision): string {
  if (precision === 'year') return value.slice(0, 4);
  if (precision === 'month') return value.length >= 7 ? value.slice(0, 7) : '';
  return value.length === 10 ? value : '';
}

function periodInput(row: Pick<SchoolDraft, 'from' | 'fromPrecision' | 'to' | 'toPrecision' | 'openEnded'>): Parameters<typeof normalizeStudentPeriod>[0] {
  return {
    from: row.from,
    fromPrecision: row.fromPrecision,
    to: row.openEnded ? null : row.to,
    toPrecision: row.openEnded ? null : row.toPrecision,
  };
}

function periodOrNull(row: Pick<SchoolDraft, 'from' | 'fromPrecision' | 'to' | 'toPrecision' | 'openEnded'>): StudentPeriod | null {
  try { return normalizeStudentPeriod(periodInput(row)); } catch { return null; }
}

function metaErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.status === 403
    ? '등록 선택지를 볼 권한이 없습니다. 작성한 초안은 유지됩니다.'
    : '등록 선택지를 불러오지 못했습니다. 다시 불러오기 전에도 작성한 값은 유지됩니다.';
}

function Section({ number, title, sub, children, ariaLabel }: {
  number: number; title: string; sub?: string; children: ReactNode; ariaLabel?: string;
}) {
  const heading = `${number}. ${title}`;
  return (
    <section aria-label={ariaLabel} className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <h2 className="text-[14px] font-bold text-fg">{heading}</h2>
      {sub ? <p className="mt-1 text-[12px] leading-relaxed text-fg-subtle">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ContactRows({ owner, rows, errors, onChange, onAdd, onRemove, minimumRows = 1 }: {
  owner: string; rows: ContactDraft[]; errors: Errors;
  onChange: (index: number, patch: Partial<ContactDraft>) => void;
  onAdd: () => void; onRemove: (index: number) => void; minimumRows?: number;
}) {
  const labelOwner = owner === 'contacts' ? '학생' : `보호자 ${Number(owner.match(/\d+/)?.[0] ?? 0) + 1}`;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => {
        const base = `${owner}[${index}]`;
        return (
          <div key={row.key} className="rounded-lg border border-line bg-inset p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
              <div>
                <Label htmlFor={`${base}-type`}>종류</Label>
                <Select id={`${base}-type`} aria-label={`${labelOwner} 연락처 ${index + 1} 종류`} data-field-path={`${base}.type`}
                  value={row.type} onChange={event => onChange(index, { type: event.target.value as ContactType })}>
                  {CONTACT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor={`${base}-value`}>연락처 값</Label>
                <Input id={`${base}-value`} aria-label={`${labelOwner} 연락처 ${index + 1} 값`} data-field-path={`${base}.value`}
                  type={row.type === 'email' ? 'email' : 'text'} inputMode={row.type === 'phone' ? 'tel' : undefined}
                  autoComplete="off" maxLength={120} value={row.value} error={Boolean(errors[`${base}.value`])}
                  onChange={event => onChange(index, { value: event.target.value })} />
                <FieldError>{errors[`${base}.value`]}</FieldError>
              </div>
              <Button size="sm" aria-label={`${labelOwner} 연락처 ${index + 1} 제거`} disabled={rows.length <= minimumRows} onClick={() => onRemove(index)}>제거</Button>
            </div>
            {row.type === 'other' ? (
              <div className="mt-3">
                <Label htmlFor={`${base}-label`}>기타 연락처 이름</Label>
                <Input id={`${base}-label`} data-field-path={`${base}.label`} maxLength={40} value={row.label}
                  error={Boolean(errors[`${base}.label`])} onChange={event => onChange(index, { label: event.target.value })} />
                <FieldError>{errors[`${base}.label`]}</FieldError>
              </div>
            ) : null}
          </div>
        );
      })}
      <div><Button size="sm" aria-label={`${labelOwner} 연락처 추가`} onClick={onAdd}>+ 연락처 추가</Button></div>
    </div>
  );
}

function PeriodBoundary({ id, label, path, value, precision, invalid, onValue, onPrecision }: {
  id: string;
  label: string;
  path: string;
  value: string;
  precision: StudentPeriodPrecision;
  invalid?: boolean;
  onValue: (value: string) => void;
  onPrecision: (precision: StudentPeriodPrecision) => void;
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
      <div>
        <Label htmlFor={`${id}-precision`}>{label} 정밀도</Label>
        <Select id={`${id}-precision`} aria-label={`${label} 정밀도`} data-field-path={`${path}Precision`} value={precision}
          onChange={event => onPrecision(event.target.value as StudentPeriodPrecision)}>
          {PRECISIONS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} aria-label={label} data-field-path={path} type={precision === 'day' ? 'date' : precision === 'month' ? 'month' : 'text'}
          inputMode={precision === 'year' ? 'numeric' : undefined} placeholder={precision === 'year' ? 'YYYY' : undefined}
          maxLength={precision === 'year' ? 4 : undefined} value={value} error={invalid} onChange={event => onValue(event.target.value)} />
      </div>
    </div>
  );
}

function PeriodPreview({ row }: { row: Pick<SchoolDraft, 'from' | 'fromPrecision' | 'to' | 'toPrecision' | 'openEnded'> }) {
  const period = periodOrNull(row);
  if (!period) return <p role="status" className="text-[12px] text-danger">기간을 확인해 주세요.</p>;
  const state = studentPeriodState(period, todayKst());
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
      <Chip size="compact" tone={state === 'current' ? 'success' : state === 'future' ? 'info' : 'neutral'}>{STUDENT_PERIOD_STATE_LABEL[state]}</Chip>
      <span>{period.from} ~ {period.to ?? '계속'}</span>
      <span>입력 정밀도 {row.fromPrecision}{row.openEnded ? '' : ` / ${row.toPrecision}`}</span>
    </div>
  );
}

interface PickerCandidate { id: number; label: string; actionLabel: string }
function RegistrationMultiPicker({ kind, query, onQuery, candidates, selectedIds, pending, error, onAdd, onRemove }: {
  kind: '담당자' | '형제·자매';
  query: string;
  onQuery: (value: string) => void;
  candidates: readonly PickerCandidate[];
  selectedIds: readonly number[];
  pending: boolean;
  error: boolean;
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  const visible = normalized
    ? candidates.filter(item => !selectedIds.includes(item.id) && item.label.toLocaleLowerCase('ko-KR').includes(normalized)).slice(0, 8)
    : [];
  const selected = selectedIds.map(id => candidates.find(item => item.id === id)).filter((item): item is PickerCandidate => Boolean(item));
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor={`${kind}-search`}>{kind} 검색</Label>
        <Input id={`${kind}-search`} aria-label={`${kind} 검색`} type="search" data-field-path={kind === '담당자' ? 'assigneeIds' : 'siblingIds'}
          value={query} disabled={pending || error} placeholder={kind === '담당자' ? '이름·직함 검색' : '이름·학년·학교 검색'} onChange={event => onQuery(event.target.value)} />
      </div>
      {pending ? <p role="status" className="text-[12px] text-fg-subtle">{kind} 선택지를 불러오는 중…</p> : null}
      {error ? <Banner tone="danger">{kind} 선택지를 불러오지 못했습니다. 입력한 초안은 유지됩니다.</Banner> : null}
      {!pending && !error && !candidates.length ? <p role="status" className="text-[12px] text-fg-subtle">선택 가능한 {kind}가 없습니다.</p> : null}
      {!pending && !error && normalized && candidates.length && !visible.length ? <p role="status" className="text-[12px] text-fg-subtle">검색 결과가 없습니다.</p> : null}
      {visible.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map(item => <Button key={item.id} size="sm" aria-label={`${kind} ${item.actionLabel} 선택`} onClick={() => { onAdd(item.id); onQuery(''); }}>{item.label}</Button>)}
      </div> : null}
      {selected.length ? <div aria-label={`선택한 ${kind}`} className="flex flex-wrap gap-2">
        {selected.map(item => <div key={item.id} className="flex items-center gap-2 rounded-lg border border-line bg-inset px-3 py-2 text-[12px]">
          <span>{item.label}</span><Button size="sm" variant="ghost" aria-label={`${kind} ${item.actionLabel} 제거`} onClick={() => onRemove(item.id)}>제거</Button>
        </div>)}
      </div> : null}
    </div>
  );
}

export interface StudentRegistrationFormProps {
  source?: StudentRegistrationSource;
  leadId?: number | null;
}

export function StudentRegistrationForm({ source: entrySource = 'students', leadId = null }: StudentRegistrationFormProps = {}) {
  const allowed = useStudentReadAllowed();
  const [mode, setMode] = useState<'create' | 'reactivate'>('create');
  const meta = useMeta(allowed && mode === 'create');
  const grades = useMemo(() => educationGradeOptions(meta.data), [meta.data]);
  const systems = useMemo(() => [...new Map(grades.map(item => [item.system, item.systemLabel])).entries()], [grades]);
  const [reviewed, setReviewed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [name, setName] = useState('');
  const [englishName, setEnglishName] = useState('');
  const [gender, setGender] = useState('');
  const [schoolHistory, setSchoolHistory] = useState<SchoolDraft[]>(() => [school()]);
  const [educationSystem, setEducationSystem] = useState('');
  const [grade, setGrade] = useState('');
  const [gradeFrom, setGradeFrom] = useState(todayKst());
  const [gradeFromPrecision, setGradeFromPrecision] = useState<StudentPeriodPrecision>('day');
  const [gradeTo, setGradeTo] = useState('');
  const [gradeToPrecision, setGradeToPrecision] = useState<StudentPeriodPrecision>('day');
  const [gradeOpenEnded, setGradeOpenEnded] = useState(true);
  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [birthDate, setBirthDate] = useState('');
  const [citizenship, setCitizenship] = useState('');
  const [guardians, setGuardians] = useState<GuardianDraft[]>(() => [guardian()]);
  const [cashReceipt, setCashReceipt] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [siblingQuery, setSiblingQuery] = useState('');
  const [siblingIds, setSiblingIds] = useState<number[]>([]);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const gradeSource = useMemo(() => ({ educationGrades: grades.filter(item => item.system === educationSystem) }), [educationSystem, grades]);
  const staffCandidates = useMemo<PickerCandidate[]>(() => (meta.data?.staff ?? []).map((item: StaffBrief) => ({
    id: item.id, label: `${item.name}${item.title ? ` · ${item.title}` : ''}`, actionLabel: item.name,
  })), [meta.data?.staff]);
  const siblingCandidates = useMemo<PickerCandidate[]>(() => (meta.data?.students ?? []).map((item: StudentBrief) => ({
    id: item.id, label: item.label, actionLabel: item.label,
  })), [meta.data?.students]);

  if (!allowed) return <Banner tone="warning">학생 등록을 준비할 권한이 없습니다.</Banner>;

  const patchContact = (rows: ContactDraft[], index: number, patch: Partial<ContactDraft>) => rows.map((row, at) => at === index ? { ...row, ...patch } : row);
  const patchGuardian = (index: number, patch: Partial<GuardianDraft>) => setGuardians(rows => rows.map((row, at) => at === index ? { ...row, ...patch } : row));
  const patchSchool = (index: number, patch: Partial<SchoolDraft>) => setSchoolHistory(rows => rows.map((row, at) => at === index ? { ...row, ...patch } : row));
  const review = () => {
    const next: Errors = {};
    if (!name.trim()) next.name = '학생 이름을 입력해 주세요.';
    if (!gender) next.gender = '성별을 선택해 주세요.';
    if (!systems.length) next.grade = '교육체계와 학년 선택 기능이 필요합니다.';
    else if (!educationSystem || !grade || !gradeFrom) next.grade = '교육체계와 학년을 선택해 주세요.';
    else {
      try {
        normalizeStudentPeriod({
          from: gradeFrom, fromPrecision: gradeFromPrecision,
          to: gradeOpenEnded ? null : gradeTo, toPrecision: gradeOpenEnded ? null : gradeToPrecision,
        });
      } catch (error) {
        next.grade = error instanceof Error ? error.message.replace('STUDENT_PERIOD_INVALID: ', '') : '학년 기간을 확인해 주세요.';
      }
    }
    const schoolPeriods: Array<{ index: number; period: StudentPeriod }> = [];
    schoolHistory.forEach((row, index) => {
      if (!row.query.trim()) return;
      try { schoolPeriods.push({ index, period: normalizeStudentPeriod(periodInput(row)) }); }
      catch (error) {
        next[`schoolHistory[${index}].period`] = error instanceof Error ? error.message.replace('STUDENT_PERIOD_INVALID: ', '') : '학교 기간을 확인해 주세요.';
      }
    });
    for (let left = 0; left < schoolPeriods.length; left += 1) for (let right = left + 1; right < schoolPeriods.length; right += 1) {
      if (studentPeriodsOverlap(schoolPeriods[left].period, schoolPeriods[right].period)) {
        next.schoolHistory = `학교 이력 ${schoolPeriods[left].index + 1}과 ${schoolPeriods[right].index + 1}의 포함 기간이 겹칩니다. 기간을 명시적으로 수정해 주세요.`;
      }
    }
    next.residenceCountryCode = '거주 국가 선택 계약 연결이 필요합니다.';
    if (birthDate && birthDate > todayKst()) next.birthDate = '생년월일은 오늘보다 늦을 수 없습니다.';
    if (guardians.filter(row => row.isPrimary).length > 1) next.guardiansPrimary = '주보호자는 한 명만 선택할 수 있습니다.';
    guardians.forEach((row, guardianIndex) => {
      const base = `guardians[${guardianIndex}]`;
      if (!row.relation || (row.relation === 'other' && !row.relationOther.trim())) next[`${base}.relation`] = '보호자 관계를 선택해 주세요.';
      row.contacts.forEach((item, contactIndex) => {
        const path = `${base}.contacts[${contactIndex}]`;
        if (!item.value.trim()) next[`${path}.value`] = '보호자 연락처를 입력해 주세요.';
        else if (item.type === 'email' && !email.test(item.value.trim())) next[`${path}.value`] = '이메일 형식을 확인해 주세요.';
        if (item.type === 'other' && !item.label.trim()) next[`${path}.label`] = '기타 연락처 이름을 입력해 주세요.';
      });
    });
    setErrors(next); setReviewed(true);
  };

  const context = entrySource === 'intake' && leadId
    ? `상담 #${leadId}에서 시작했습니다.`
    : entrySource === 'schedule'
      ? '스케줄에서 시작했습니다.'
      : '학생 탭에서 시작했습니다.';
  const returnHref = entrySource === 'intake'
    ? (leadId ? `/intake?lead=${leadId}` : '/intake')
    : entrySource === 'schedule' ? '/schedule' : '/students';
  const returnLabel = entrySource === 'intake' ? '상담으로 돌아가기' : entrySource === 'schedule' ? '스케줄로 돌아가기' : '학생 목록';

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4">
      <PageHeader title="학생 등록" sub="신규 학생 15절 초안 · 수업 생성과 청구는 등록 뒤 별도 업무입니다"
        right={<LinkButton href={returnHref}>{returnLabel}</LinkButton>} />
      <Banner tone="info"><span>{context}</span> 모든 진입 경로는 같은 등록 화면과 입력 규칙을 사용합니다.</Banner>
      <Segmented ariaLabel="학생 등록 방식" value={mode} onChange={setMode} options={[
        { value: 'create', label: '신규 학생' },
        { value: 'reactivate', label: '기존 학생 재활성화' },
      ]} />
      <Banner tone="neutral">현재는 입력 구조와 검증을 준비하는 단계입니다. 학생 생성과 학교·국가 선택 기능이 준비되기 전에는 등록 요청을 보내거나 성공으로 표시하지 않습니다.</Banner>
      {mode === 'create' && meta.isPending ? <Banner tone="neutral">등록 선택지를 불러오는 중입니다. 작성한 값은 그대로 유지됩니다.</Banner> : null}
      {mode === 'create' && meta.isError ? <Banner tone="danger">{metaErrorMessage(meta.error)}</Banner> : null}

      {mode === 'create' ? <form aria-label="학생 신규 등록 초안" className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); review(); }} noValidate>
        <Section number={1} title="초기 이력" sub="학년·학교·거주 정보의 적용 기간이 초기 이력이 됩니다. 같은 값을 현재 정보와 이력에 두 번 입력하지 않습니다.">
          <Banner tone="neutral">결제·수강 금액은 여기서 입력하지 않습니다. 적용 시각과 작성자 정보는 서버가 기록합니다.</Banner>
        </Section>

        <Section number={2} title="이름">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div><Label htmlFor="student-name">학생 이름 *</Label><Input id="student-name" aria-label="학생 이름" data-field-path="name" maxLength={40} value={name} error={Boolean(errors.name)} onChange={event => setName(event.target.value)} /><FieldError>{errors.name}</FieldError></div>
            <div><Label htmlFor="student-english-name">영문명</Label><Input id="student-english-name" data-field-path="englishName" maxLength={80} value={englishName} onChange={event => setEnglishName(event.target.value)} /></div>
          </div>
        </Section>

        <Section number={3} title="성별">
          <div className="max-w-sm"><Label htmlFor="student-gender">성별 *</Label><Select id="student-gender" aria-label="성별" data-field-path="gender" value={gender} error={Boolean(errors.gender)} disabled={meta.isPending || meta.isError} onChange={event => setGender(event.target.value)}><option value="">선택</option>{(meta.data?.genders ?? []).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</Select><FieldError>{errors.gender}</FieldError></div>
        </Section>

        <Section number={4} title="학교" sub="검색 결과에서 학교를 고르고 재학 기간을 기록합니다. 이름만으로 같은 학교를 합치지 않습니다.">
          <div className="flex flex-col gap-4">
            <Banner tone="neutral">학교 검색·추가 기능을 준비 중입니다. 이름과 기간 초안은 보존하지만 학교가 선택됐다고 표시하지 않습니다.</Banner>
            {schoolHistory.map((row, index) => {
              const base = `schoolHistory[${index}]`;
              const number = index + 1;
              return <div key={row.key} className="rounded-lg border border-line bg-inset p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[12px] font-bold">학교 이력 {number}</h3>
                  <Button size="sm" aria-label={`학교 ${number} 이력 제거`} disabled={schoolHistory.length === 1}
                    onClick={() => setSchoolHistory(rows => rows.filter((_, at) => at !== index))}>제거</Button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="md:col-span-2"><Label htmlFor={`${base}-query`}>학교 {number} 이름</Label><Input id={`${base}-query`} aria-label={`학교 ${number} 이름`} type="search" data-field-path={`${base}.query`} value={row.query} maxLength={100} onChange={event => patchSchool(index, { query: event.target.value })} placeholder="학교명 검색 기능 준비 중" /></div>
                  <PeriodBoundary id={`${base}-from`} label={`학교 ${number} 시작`} path={`${base}.from`} value={row.from} precision={row.fromPrecision}
                    invalid={Boolean(errors[`${base}.period`])}
                    onValue={value => patchSchool(index, { from: value })}
                    onPrecision={precision => patchSchool(index, { fromPrecision: precision, from: valueForPrecision(row.from, precision) })} />
                  <div className="flex flex-col gap-2">
                    <Checkbox aria-label={`학교 ${number} 종료일 있음`} data-field-path={`${base}.hasEnd`} checked={!row.openEnded}
                      onChange={event => patchSchool(index, { openEnded: !event.target.checked })} label="종료일 있음" />
                    {!row.openEnded ? <PeriodBoundary id={`${base}-to`} label={`학교 ${number} 종료`} path={`${base}.to`} value={row.to} precision={row.toPrecision}
                      invalid={Boolean(errors[`${base}.period`])}
                      onValue={value => patchSchool(index, { to: value })}
                      onPrecision={precision => patchSchool(index, { toPrecision: precision, to: valueForPrecision(row.to, precision) })} /> : <p className="text-[12px] text-fg-subtle">종료 없음 · 계속 재학</p>}
                  </div>
                </div>
                <FieldError>{errors[`${base}.period`]}</FieldError>
                <div className="mt-3"><PeriodPreview row={row} /></div>
              </div>;
            })}
            <FieldError>{errors.schoolHistory}</FieldError>
            <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setSchoolHistory(rows => [...rows, school()])}>+ 학교 이력 추가</Button><Button size="sm" disabled>학교 검색·선택 기능 준비 중</Button></div>
          </div>
        </Section>

        <Section number={5} title="교육체계와 학년">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div><Label htmlFor="education-system">교육체계 *</Label><Select id="education-system" aria-label="교육체계" data-field-path="educationSystem" value={educationSystem} error={Boolean(errors.grade)} disabled={!systems.length} onChange={event => { setEducationSystem(event.target.value); setGrade(''); }}><option value="">선택</option>{systems.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
            <div><Label htmlFor="education-grade">학년 *</Label><EducationGradeSelect id="education-grade" ariaLabel="학년" fieldPath="gradeCode" source={gradeSource} value={grade} onChange={setGrade} disabled={!educationSystem} /></div>
            <PeriodBoundary id="grade-from" label="학년 적용 시작" path="gradeHistory[0].from" value={gradeFrom} precision={gradeFromPrecision}
              invalid={Boolean(errors.grade)}
              onValue={setGradeFrom} onPrecision={precision => { setGradeFromPrecision(precision); setGradeFrom(valueForPrecision(gradeFrom, precision)); }} />
            <div className="flex flex-col gap-2">
              <Checkbox aria-label="학년 종료일 있음" data-field-path="gradeHistory[0].hasEnd" checked={!gradeOpenEnded}
                onChange={event => setGradeOpenEnded(!event.target.checked)} label="종료일 있음" />
              {!gradeOpenEnded ? <PeriodBoundary id="grade-to" label="학년 적용 종료" path="gradeHistory[0].to" value={gradeTo} precision={gradeToPrecision}
                invalid={Boolean(errors.grade)}
                onValue={setGradeTo} onPrecision={precision => { setGradeToPrecision(precision); setGradeTo(valueForPrecision(gradeTo, precision)); }} /> : <p className="text-[12px] text-fg-subtle">종료 없음 · 계속 적용</p>}
            </div>
          </div>
          <FieldError>{errors.grade}</FieldError>
          <div className="mt-3"><PeriodPreview row={{ from: gradeFrom, fromPrecision: gradeFromPrecision, to: gradeTo, toPrecision: gradeToPrecision, openEnded: gradeOpenEnded }} /></div>
        </Section>

        <Section number={6} title="학생 연락수단" sub="학생 연락처는 없어도 됩니다. 추가한 행만 검토합니다.">
          {contacts.length ? <ContactRows owner="contacts" rows={contacts} errors={errors} minimumRows={0} onChange={(index, patch) => setContacts(rows => patchContact(rows, index, patch))} onAdd={() => setContacts(rows => [...rows, contact()])} onRemove={index => setContacts(rows => rows.filter((_, at) => at !== index))} /> : <Button size="sm" onClick={() => setContacts([contact()])}>+ 학생 연락수단 추가</Button>}
        </Section>

        <Section number={7} title="거주 국가와 시간대">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div><Label htmlFor="residence-country">거주 국가 *</Label><Select id="residence-country" aria-label="거주 국가" data-field-path="residenceCountryCode" value="" error={Boolean(errors.residenceCountryCode)} disabled><option value="">국가 선택 기능 준비 중</option></Select><FieldError>{errors.residenceCountryCode}</FieldError></div>
            <div><Label htmlFor="residence-timezone">지역·시간대</Label><Select id="residence-timezone" data-field-path="residenceTimezone" value="" disabled><option value="">국가 선택 뒤 표시</option></Select></div>
          </div>
        </Section>

        <Section number={8} title="생년월일">
          <div className="max-w-sm"><Label htmlFor="birth-date">생년월일</Label><Input id="birth-date" aria-label="생년월일" type="date" data-field-path="birthDate" max={todayKst()} value={birthDate} error={Boolean(errors.birthDate)} onChange={event => setBirthDate(event.target.value)} /><FieldError>{errors.birthDate}</FieldError></div>
        </Section>

        <Section number={9} title="시민권">
          <div className="max-w-sm"><Label htmlFor="citizenship">시민권 보유 여부</Label><Select id="citizenship" data-field-path="hasCitizenship" value={citizenship} onChange={event => setCitizenship(event.target.value)}><option value="">미상</option><option value="true">보유</option><option value="false">미보유</option></Select></div>
        </Section>

        <Section number={10} title="보호자" ariaLabel="학생 보호자 입력" sub="보호자는 한 명 이상이며, 각 보호자에는 연락처가 한 개 이상 있어야 합니다.">
          <div className="flex flex-col gap-4">
            {guardians.map((row, guardianIndex) => {
              const base = `guardians[${guardianIndex}]`;
              return (
                <div key={row.key} className="rounded-xl border border-line bg-inset p-3 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13px] font-bold">보호자 {guardianIndex + 1}</h3><Button size="sm" aria-label={`보호자 ${guardianIndex + 1} 제거`} disabled={guardians.length === 1} onClick={() => setGuardians(rows => rows.filter((_, at) => at !== guardianIndex))}>보호자 제거</Button></div>
                  <div data-testid={`guardian-fields-${guardianIndex}`} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div><Label htmlFor={`${base}-relation`}>관계 *</Label><Select id={`${base}-relation`} aria-label={`보호자 ${guardianIndex + 1} 관계`} data-field-path={`${base}.relation`} value={row.relation} error={Boolean(errors[`${base}.relation`])} onChange={event => patchGuardian(guardianIndex, { relation: event.target.value })}><option value="">선택</option>{RELATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><FieldError>{errors[`${base}.relation`]}</FieldError></div>
                    <div><Label htmlFor={`${base}-name`}>이름</Label><Input id={`${base}-name`} aria-label={`보호자 ${guardianIndex + 1} 이름`} data-field-path={`${base}.name`} maxLength={80} value={row.name} onChange={event => patchGuardian(guardianIndex, { name: event.target.value })} /></div>
                    {row.relation === 'other' ? <div><Label htmlFor={`${base}-relation-other`}>기타 관계</Label><Input id={`${base}-relation-other`} data-field-path={`${base}.relationOther`} maxLength={40} value={row.relationOther} onChange={event => patchGuardian(guardianIndex, { relationOther: event.target.value })} /></div> : null}
                    <div><Label htmlFor={`${base}-country`}>거주 국가</Label><Select id={`${base}-country`} data-field-path={`${base}.countryCode`} value={row.country} disabled onChange={event => patchGuardian(guardianIndex, { country: event.target.value })}><option value="">국가 선택 기능 준비 중</option></Select></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4">
                    <Checkbox aria-label={`보호자 ${guardianIndex + 1} 주보호자`} data-field-path={`${base}.isPrimary`} checked={row.isPrimary} onChange={event => patchGuardian(guardianIndex, { isPrimary: event.target.checked })} label="주보호자" />
                    <Checkbox aria-label={`보호자 ${guardianIndex + 1} 납부자`} data-field-path={`${base}.isPayer`} checked={row.isPayer} onChange={event => patchGuardian(guardianIndex, { isPayer: event.target.checked })} label="납부자" />
                  </div>
                  <div className="mt-4"><ContactRows owner={`${base}.contacts`} rows={row.contacts} errors={errors}
                    onChange={(index, patch) => patchGuardian(guardianIndex, { contacts: patchContact(row.contacts, index, patch) })}
                    onAdd={() => patchGuardian(guardianIndex, { contacts: [...row.contacts, contact()] })}
                    onRemove={index => patchGuardian(guardianIndex, { contacts: row.contacts.filter((_, at) => at !== index) })} /></div>
                </div>
              );
            })}
            <FieldError>{errors.guardiansPrimary}</FieldError>
            <div><Button size="sm" onClick={() => setGuardians(rows => [...rows, guardian()])}>+ 보호자 추가</Button></div>
          </div>
        </Section>

        <Section number={11} title="현금영수증" sub="민감정보입니다. 일반 목록·로그에 원문을 노출하지 않습니다.">
          <div className="max-w-md"><Label htmlFor="cash-receipt">현금영수증 번호</Label><Input id="cash-receipt" data-field-path="cashReceiptNumber" autoComplete="off" maxLength={40} value={cashReceipt} onChange={event => setCashReceipt(event.target.value)} /></div>
        </Section>

        <Section number={12} title="형제·자매">
          <RegistrationMultiPicker kind="형제·자매" query={siblingQuery} onQuery={setSiblingQuery} candidates={siblingCandidates}
            selectedIds={siblingIds} pending={meta.isPending} error={meta.isError}
            onAdd={id => setSiblingIds(ids => ids.includes(id) ? ids : [...ids, id])}
            onRemove={id => setSiblingIds(ids => ids.filter(value => value !== id))} />
          <p className="mt-3 text-[12px] text-fg-subtle">현재 재원 학생만 후보로 표시합니다. 실제 양방향 가족 연결은 학생 등록을 완료할 때 저장됩니다.</p>
        </Section>

        <Section number={13} title="알게 된 경로">
          <div className="max-w-sm"><Label htmlFor="student-source">경로</Label><Select id="student-source" data-field-path="source" value={referralSource} onChange={event => setReferralSource(event.target.value)}><option value="">선택하지 않음</option>{SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        </Section>

        <Section number={14} title="담당자">
          <RegistrationMultiPicker kind="담당자" query={assigneeQuery} onQuery={setAssigneeQuery} candidates={staffCandidates}
            selectedIds={assigneeIds} pending={meta.isPending} error={meta.isError}
            onAdd={id => setAssigneeIds(ids => ids.includes(id) ? ids : [...ids, id])}
            onRemove={id => setAssigneeIds(ids => ids.filter(value => value !== id))} />
          <p className="mt-3 text-[12px] text-fg-subtle">현재 활성 직원만 후보로 표시합니다. 등록을 완료할 때 담당 가능 여부를 다시 확인합니다.</p>
        </Section>

        <Section number={15} title="기타">
          <Label htmlFor="student-notes" hint={`${notes.length} / 2000`}>주의사항 등</Label><Textarea id="student-notes" data-field-path="notes" maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} />
        </Section>

        {reviewed ? <Banner tone={Object.keys(errors).length ? 'warning' : 'neutral'}>{Object.keys(errors).length ? '입력을 보완해 주세요. 작성한 값은 그대로 유지됩니다.' : '화면 검토를 통과했습니다. 학생 생성 기능이 준비되기 전에는 등록할 수 없습니다.'}</Banner> : null}
        <div className="sticky bottom-3 z-10 flex flex-wrap justify-end gap-2 rounded-xl border border-line bg-card p-3 shadow-sm">
          <Button type="submit">입력 검토</Button>
          <Button variant="primary" disabled title="학생 생성과 학교·국가 선택 기능이 준비된 뒤 사용할 수 있습니다">학생 등록 기능 준비 중</Button>
        </div>
      </form> : <StudentReactivationSection entrySource={entrySource} leadId={leadId} />}
    </div>
  );
}
