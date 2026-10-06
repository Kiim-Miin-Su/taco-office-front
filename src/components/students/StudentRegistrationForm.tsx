/** @file-guide
 * 목적: StudentRegistrationForm.tsx — 신규 학생 15절의 순서·반복 입력·Front 초안 검증을 한 화면에서 소유한다.
 * 책임/재사용: 공용 UI/useMeta/교육체계 projection/세션 권한을 재사용한다. 생성 DTO 전에는 POST나 저장 성공을 만들지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { useMeta } from '@/api/queries';
import { educationGradeOptions } from '@/lib/education-grades';
import { todayKst } from '@/lib/calendar';
import { Banner, Button, Checkbox, FieldError, Input, Label, LinkButton, PageHeader, Segmented, Select, Textarea } from '@/components/ui';
import { useStudentReadAllowed } from '@/api/students';
import type { StudentRegistrationSource } from '@/lib/student-registration-route';
import { EducationGradeSelect } from './EducationGradeSelect';

type ContactType = 'phone' | 'kakao' | 'email' | 'other';
interface ContactDraft { key: number; type: ContactType; value: string; label: string }
interface GuardianDraft {
  key: number; relation: string; relationOther: string; name: string; country: string;
  isPrimary: boolean; isPayer: boolean; contacts: ContactDraft[];
}
type Errors = Record<string, string>;
let nextKey = 0;
const contact = (): ContactDraft => ({ key: ++nextKey, type: 'phone', value: '', label: '' });
const guardian = (): GuardianDraft => ({ key: ++nextKey, relation: '', relationOther: '', name: '', country: '', isPrimary: false, isPayer: false, contacts: [contact()] });
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

function Section({ number, title, sub, children, ariaLabel }: {
  number: number; title: string; sub?: string; children: ReactNode; ariaLabel?: string;
}) {
  const heading = `${number}. ${title}`;
  return (
    <section aria-label={ariaLabel} className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <h2 className="text-[14px] font-bold text-fg">{heading}</h2>
      {sub ? <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">{sub}</p> : null}
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
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolFrom, setSchoolFrom] = useState(todayKst());
  const [schoolTo, setSchoolTo] = useState('');
  const [educationSystem, setEducationSystem] = useState('');
  const [grade, setGrade] = useState('');
  const [gradeFrom, setGradeFrom] = useState(todayKst());
  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [birthDate, setBirthDate] = useState('');
  const [citizenship, setCitizenship] = useState('');
  const [guardians, setGuardians] = useState<GuardianDraft[]>(() => [guardian()]);
  const [cashReceipt, setCashReceipt] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [notes, setNotes] = useState('');
  const gradeSource = useMemo(() => ({ educationGrades: grades.filter(item => item.system === educationSystem) }), [educationSystem, grades]);

  if (!allowed) return <Banner tone="warning">학생 등록을 준비할 권한이 없습니다.</Banner>;

  const patchContact = (rows: ContactDraft[], index: number, patch: Partial<ContactDraft>) => rows.map((row, at) => at === index ? { ...row, ...patch } : row);
  const patchGuardian = (index: number, patch: Partial<GuardianDraft>) => setGuardians(rows => rows.map((row, at) => at === index ? { ...row, ...patch } : row));
  const review = () => {
    const next: Errors = {};
    if (!name.trim()) next.name = '학생 이름을 입력해 주세요.';
    if (!gender) next.gender = '성별을 선택해 주세요.';
    if (!systems.length) next.grade = '교육체계·학년 선택 DTO 연결이 필요합니다.';
    else if (!educationSystem || !grade || !gradeFrom) next.grade = '교육체계와 학년을 선택해 주세요.';
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
      <Banner tone="neutral">현재는 입력 구조와 검증을 준비하는 Front 단계입니다. 생성 DTO·학교/국가 선택 계약이 연결되기 전에는 등록 요청을 보내거나 성공으로 표시하지 않습니다.</Banner>

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
          <div className="max-w-sm"><Label htmlFor="student-gender">성별 *</Label><Select id="student-gender" aria-label="성별" data-field-path="gender" value={gender} error={Boolean(errors.gender)} disabled={meta.isPending} onChange={event => setGender(event.target.value)}><option value="">선택</option>{(meta.data?.genders ?? []).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</Select><FieldError>{errors.gender}</FieldError></div>
        </Section>

        <Section number={4} title="학교" sub="검색 결과에서 학교를 고르고 재학 기간을 기록합니다. 이름만으로 같은 학교를 합치지 않습니다.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="md:col-span-3"><Label htmlFor="school-query">학교 검색</Label><Input id="school-query" type="search" data-field-path="schoolHistory[0].query" value={schoolQuery} maxLength={100} onChange={event => setSchoolQuery(event.target.value)} placeholder="학교명 검색 · 전용 API 연결 대기" /></div>
            <div><Label htmlFor="school-from">재학 시작</Label><Input id="school-from" type="date" data-field-path="schoolHistory[0].from" value={schoolFrom} onChange={event => setSchoolFrom(event.target.value)} /></div>
            <div><Label htmlFor="school-to">재학 종료</Label><Input id="school-to" type="date" data-field-path="schoolHistory[0].to" value={schoolTo} onChange={event => setSchoolTo(event.target.value)} /></div>
            <div className="flex items-end"><Button className="w-full" disabled>학교 선택 계약 연결 대기</Button></div>
          </div>
        </Section>

        <Section number={5} title="교육체계와 학년">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><Label htmlFor="education-system">교육체계 *</Label><Select id="education-system" aria-label="교육체계" data-field-path="educationSystem" value={educationSystem} error={Boolean(errors.grade)} disabled={!systems.length} onChange={event => { setEducationSystem(event.target.value); setGrade(''); }}><option value="">선택</option>{systems.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
            <div><Label htmlFor="education-grade">학년 *</Label><EducationGradeSelect id="education-grade" ariaLabel="학년" fieldPath="gradeCode" source={gradeSource} value={grade} onChange={setGrade} disabled={!educationSystem} /></div>
            <div><Label htmlFor="grade-from">적용 시작일 *</Label><Input id="grade-from" type="date" data-field-path="gradeHistory[0].from" value={gradeFrom} error={Boolean(errors.grade)} onChange={event => setGradeFrom(event.target.value)} /></div>
          </div>
          <FieldError>{errors.grade}</FieldError>
        </Section>

        <Section number={6} title="학생 연락수단" sub="학생 연락처는 없어도 됩니다. 추가한 행만 검토합니다.">
          {contacts.length ? <ContactRows owner="contacts" rows={contacts} errors={errors} minimumRows={0} onChange={(index, patch) => setContacts(rows => patchContact(rows, index, patch))} onAdd={() => setContacts(rows => [...rows, contact()])} onRemove={index => setContacts(rows => rows.filter((_, at) => at !== index))} /> : <Button size="sm" onClick={() => setContacts([contact()])}>+ 학생 연락수단 추가</Button>}
        </Section>

        <Section number={7} title="거주 국가와 시간대">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div><Label htmlFor="residence-country">거주 국가 *</Label><Select id="residence-country" aria-label="거주 국가" data-field-path="residenceCountryCode" value="" error={Boolean(errors.residenceCountryCode)} disabled><option value="">국가 선택 DTO 연결 대기</option></Select><FieldError>{errors.residenceCountryCode}</FieldError></div>
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
                    <div><Label htmlFor={`${base}-country`}>거주 국가</Label><Select id={`${base}-country`} data-field-path={`${base}.countryCode`} value={row.country} disabled onChange={event => patchGuardian(guardianIndex, { country: event.target.value })}><option value="">국가 DTO 연결 대기</option></Select></div>
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><div><Label htmlFor="sibling-search">재원 학생 검색</Label><Input id="sibling-search" type="search" data-field-path="siblingIds" placeholder="학생 검색 API 연결 대기" disabled /></div><div className="flex items-end"><Button disabled>형제·자매 추가 계약 대기</Button></div></div>
        </Section>

        <Section number={13} title="알게 된 경로">
          <div className="max-w-sm"><Label htmlFor="student-source">경로</Label><Select id="student-source" data-field-path="source" value={referralSource} onChange={event => setReferralSource(event.target.value)}><option value="">선택하지 않음</option>{SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        </Section>

        <Section number={14} title="담당자">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><div><Label htmlFor="assignee-search">담당자 검색</Label><Input id="assignee-search" type="search" data-field-path="assigneeIds" placeholder="담당 자격 projection 연결 대기" disabled /></div><div className="flex items-end"><Button disabled>담당 추가 계약 대기</Button></div></div>
        </Section>

        <Section number={15} title="기타">
          <Label htmlFor="student-notes" hint={`${notes.length} / 2000`}>주의사항 등</Label><Textarea id="student-notes" data-field-path="notes" maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} />
        </Section>

        {reviewed ? <Banner tone={Object.keys(errors).length ? 'warning' : 'neutral'}>{Object.keys(errors).length ? '입력을 보완해 주세요. 작성한 값은 그대로 유지됩니다.' : '화면 검토를 통과했습니다. 생성 DTO 연결 전에는 등록할 수 없습니다.'}</Banner> : null}
        <div className="sticky bottom-3 z-10 flex flex-wrap justify-end gap-2 rounded-xl border border-line bg-card p-3 shadow-sm">
          <Button type="submit">입력 검토</Button>
          <Button variant="primary" disabled title="StudentCreateDto와 학교·국가 선택 계약 연결 뒤 활성화">학생 등록 계약 연결 대기</Button>
        </div>
      </form> : (
        <section aria-label="기존 학생 재활성화" className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <h2 className="text-[14px] font-bold text-fg">기존 학생 재활성화</h2>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-2">
            퇴원 학생의 같은 STU ID를 유지하고 새 상담 기록을 연결합니다. 신규 학생·수업·청구·교재·안내·첫 수업 할 일은 만들지 않습니다.
          </p>
          <Banner tone="warning" className="mt-4">현재 학생 DTO에는 퇴원 상태와 재활성화 대상 검색·저장 계약이 없습니다. 계약 연결 전에는 후보를 선택하거나 완료로 표시하지 않습니다.</Banner>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div><Label htmlFor="reactivation-student-search">퇴원 학생 검색</Label><Input id="reactivation-student-search" type="search" placeholder="이름·기존 STU ID 검색 계약 연결 대기" disabled /></div>
            <div className="flex items-end"><Button variant="primary" disabled>재활성화 계약 연결 대기</Button></div>
          </div>
        </section>
      )}
    </div>
  );
}
