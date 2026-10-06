/** @file-guide
 * 목적: StudentDetail.tsx — 학생 10탭 허브의 학생 전환·lazy read·기존 업무 route 연결
 * 책임/재사용: 생성 DTO/학생·meta·guide·book·consulting query와 공용 UI를 재사용한다. 학생별 계약이 없는 자료를 이름 필터나 Front 집계로 만들지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/api/client';
import { useConsStudents, useGuideStudents, useMeta, useStudentBooks } from '@/api/queries';
import type { GuideStudent, Meta } from '@/api/types';
import { useStudentRead, useStudentReadAllowed, type StudentRead } from '@/api/students';
import { ConsultingStudents } from '@/components/consulting/ConsultingStudents';
import { GuideKindChip, GuideStateChip } from '@/components/guides/GuideStatus';
import { Banner, Chip, Input, LinkButton, PageHeader, Panel, QueryState, Table, Tabs, cn, type Column } from '@/components/ui';
import { kstDateTime } from '@/lib/calendar';

export type StudentHubTab = 'overview' | 'assignment' | 'schedule' | 'history' | 'reports' | 'books' | 'comments' | 'consulting' | 'profile' | 'billing';
export const STUDENT_HUB_TABS: Array<{ value: StudentHubTab; label: string }> = [
  { value: 'overview', label: '안내 한눈에' },
  { value: 'assignment', label: '안내/교재 배정' },
  { value: 'schedule', label: '시간표' },
  { value: 'history', label: '수업 기록' },
  { value: 'reports', label: '리포트' },
  { value: 'books', label: '교재' },
  { value: 'comments', label: '코멘트' },
  { value: 'consulting', label: '컨설팅' },
  { value: 'profile', label: '프로필' },
  { value: 'billing', label: '수강/청구' },
];
const STUDENT_HUB_TAB_SET = new Set<StudentHubTab>(STUDENT_HUB_TABS.map((tab) => tab.value));
export function studentHubTabFromQuery(value: string | null): StudentHubTab {
  return value && STUDENT_HUB_TAB_SET.has(value as StudentHubTab) ? value as StudentHubTab : 'overview';
}

const guardianColumns: Column<StudentRead['guardians'][number]>[] = [
  { key: 'name', head: '보호자', cell: row => row.name },
  { key: 'relation', head: '관계', cell: row => row.relation || '미상' },
  { key: 'primary', head: '주보호자', cell: row => row.isPrimary ? '예' : '아니오' },
  { key: 'active', head: '연결 상태', cell: row => row.active ? '활성' : '비활성' },
];
const enrollmentColumns: Column<StudentRead['enrollments'][number]>[] = [
  { key: 'kind', head: '수업 종류', cell: row => row.kindName },
  { key: 'subject', head: '과목', cell: row => row.subjectName ?? '미상' },
  { key: 'sessions', head: '등록 회차', cell: row => row.sessions ?? '미상' },
  { key: 'startedOn', head: '시작일', cell: row => row.startedOn ?? '미상' },
  { key: 'endedOn', head: '종료일', cell: row => row.endedOn ?? '종료일 미기록' },
];
const entityLabels = { STU: '학생', LEAD: '상담', GUARDIAN: '보호자' } as const;
const historyColumns: Column<StudentRead['history'][number]>[] = [
  { key: 'at', head: '기록 시각 (KST)', cell: row => kstDateTime(row.at) ?? '미상' },
  { key: 'entity', head: '대상', cell: row => `${entityLabels[row.entity]} #${row.entityId}` },
  { key: 'action', head: '행위', cell: row => row.actionLabel },
  { key: 'actor', head: '기록된 작업자', cell: row => `${row.actorName ?? '이름 미상'} (#${row.actorId})` },
];

function StudentRail({ data, currentId, tab }: { data: Meta; currentId: number; tab: StudentHubTab }) {
  const [search, setSearch] = useState('');
  const normalized = search.trim().toLocaleLowerCase('ko-KR');
  const students = useMemo(() => normalized
    ? data.students.filter(student => `${student.label} ${student.school ?? ''} ${student.grade ?? ''}`.toLocaleLowerCase('ko-KR').includes(normalized))
    : data.students, [data.students, normalized]);
  return <Panel title={`학생 ${data.students.length}명`} right={<LinkButton href="/students/new?source=students" size="sm" className="min-h-11">+ 학생 추가</LinkButton>}>
    <Input aria-label="학생 허브 검색" className="min-h-11" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="이름·학교·학년" />
    <ul className="-mx-4 -mb-4 mt-3 max-h-48 divide-y divide-line overflow-y-auto border-t border-line sm:max-h-64 lg:max-h-[65vh]">
      {students.map(student => {
        const active = student.id === currentId;
        return <li key={student.id}>
          <Link href={`/students/${student.id}?tab=${tab}`} aria-current={active ? 'page' : undefined}
            className={cn('block border-l-[3px] px-3 py-3 transition-colors', active ? 'border-l-primary bg-inset' : 'border-l-transparent hover:bg-inset')}>
            <span className="block truncate text-[13px] font-bold">{student.label}</span>
            <span className="mt-1 block truncate text-[11px] text-fg-subtle">{[student.school, student.grade].filter(Boolean).join(' · ') || '학교·학년 미상'}</span>
          </Link>
        </li>;
      })}
      {students.length === 0 ? <li className="px-3 py-4 text-[12px] text-fg-subtle">검색 결과가 없습니다.</li> : null}
    </ul>
  </Panel>;
}

function Profile({ data }: { data: StudentRead }) {
  const facts = [
    ['학교', data.school], ['학년', data.grade], ['성별', data.genderLabel],
    ['목표 시험', data.targetExam], ['지도 구분', data.guidance], ['언어', data.lang],
    ['기존 등록 시작일', data.startedOn], ['학생 DB 생성일 (KST)', kstDateTime(data.createdAt)],
  ];
  return <>
    <Panel title="현재 학생 정보" sub="미상값은 추정하지 않습니다. 생성 시각과 등록 시작일은 서로 다른 DB 값입니다.">
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">{facts.map(([label, value]) => <div key={label}><dt className="text-fg-subtle">{label}</dt><dd className="mt-1 break-words font-medium text-fg">{value || '미상'}</dd></div>)}</dl>
    </Panel>
    <Panel title={`보호자 ${data.guardianTotal}명`} sub={`기존 연결 기록 최대${data.historyLimit}건 · 연락처는 이 화면에서 노출하지 않습니다.`}>
      <Table columns={guardianColumns} rows={data.guardians} rowKey={row => row.id} empty="연결된 보호자가 없습니다." />
    </Panel>
  </>;
}

function GuideSummary({ student, assignment = false }: { student: GuideStudent; assignment?: boolean }) {
  const guide = student.latestGuide;
  return <div className="space-y-4">
    <Panel title={assignment ? '안내와 교재 배정' : '최신 수업 안내'} sub={`안내 ${student.guideCount}건 · 학생 #${student.studentId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <GuideKindChip guide={guide} />
        <GuideStateChip state={guide.state} />
        <span className="text-[12px] text-fg-subtle">{guide.eventOn ?? guide.createdAt.slice(0, 10)}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6">{guide.body?.trim() || '작성된 안내 본문이 없습니다.'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <LinkButton href={`/guides?tab=students&studentId=${student.studentId}`} size="sm">
          {guide.pending ? '수업 안내 수정' : '수업 안내 보기'}
        </LinkButton>
        {assignment ? <LinkButton href={`/books?tab=tracking&studentId=${student.studentId}&create=issue`} size="sm">교재 배정 업무 열기</LinkButton> : null}
      </div>
    </Panel>
    {assignment ? <Panel title={`배부 교재 ${student.books.length}종`} sub="안내 학생별 projection의 배부 완료 교재입니다.">
      {student.books.length ? <ul className="space-y-2">{student.books.map(book => <li key={book.issueId} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12px]"><b>{book.title}</b>{book.edition ? <Chip>{book.edition}</Chip> : null}<span className="text-fg-subtle">{book.code}</span></li>)}</ul> : <p className="text-[12px] text-fg-subtle">배부된 교재가 없습니다.</p>}
    </Panel> : null}
  </div>;
}

function GuideTab({ studentId, assignment = false }: { studentId: number; assignment?: boolean }) {
  const query = useGuideStudents(true);
  return <QueryState query={query}>{data => {
    const student = data.items.find(item => item.studentId === studentId);
    return student ? <GuideSummary student={student} assignment={assignment} /> : <Panel title={assignment ? '안내와 교재 배정' : '안내 한눈에'}><p className="text-[12px] text-fg-subtle">이 학생의 안내 projection이 없습니다. 다른 학생 자료를 대신 표시하지 않습니다.</p></Panel>;
  }}</QueryState>;
}

function BooksTab({ studentId }: { studentId: number }) {
  const count = useStudentBooks(studentId, true);
  const guides = useGuideStudents(true);
  return <QueryState query={count}>{bookCount => <QueryState query={guides}>{data => {
    const student = data.items.find(item => item.studentId === studentId);
    return <Panel title={`교재 ${bookCount.bookCount}종`} sub={bookCount.label ?? '배부 완료 교재 수는 서버 projection을 따릅니다.'}>
      {student?.books.length ? <ul className="space-y-2">{student.books.map(book => <li key={book.issueId} className="rounded-lg border border-line px-3 py-2 text-[12px]"><b>{book.title}</b><span className="ml-2 text-fg-subtle">{[book.edition, book.code].filter(Boolean).join(' · ')}</span></li>)}</ul> : <p className="text-[12px] text-fg-subtle">표시할 배부 교재 상세가 없습니다.</p>}
      <div className="mt-3"><LinkButton href={`/books?tab=tracking&studentId=${studentId}`} size="sm">교재 트래킹 열기</LinkButton></div>
    </Panel>;
  }}</QueryState>}</QueryState>;
}

function ContractPending({ title, children, href, link }: { title: string; children: string; href?: string; link?: string }) {
  return <Panel title={title}><Banner tone="warning" title="학생별 생성 계약 연결 대기">{children}</Banner>{href && link ? <div className="mt-3"><LinkButton href={href} size="sm">{link}</LinkButton></div> : null}</Panel>;
}

export function StudentDetail({ studentId, initialTab = 'overview' }: { studentId: number | null; initialTab?: StudentHubTab }) {
  const allowed = useStudentReadAllowed();
  const router = useRouter();
  const validId = studentId !== null && Number.isSafeInteger(studentId) && studentId > 0;
  const query = useStudentRead(validId ? studentId : null);
  const meta = useMeta(allowed && validId);
  const [tab, setTab] = useState<StudentHubTab>(initialTab);
  const consulting = useConsStudents(tab === 'consulting' && allowed && validId);
  useEffect(() => setTab(initialTab), [initialTab, studentId]);
  if (!allowed) return <Banner tone="warning">학생 상세를 조회할 권한이 없습니다.</Banner>;
  if (!validId) return <Banner tone="warning">잘못된 학생 주소입니다. <LinkButton href="/students" size="sm">학생 목록</LinkButton></Banner>;
  if (query.error instanceof ApiError && query.error.status === 404) return <Banner tone="warning">학생을 찾을 수 없습니다. <LinkButton href="/students" size="sm">학생 목록</LinkButton></Banner>;
  const selectTab = (next: StudentHubTab) => {
    setTab(next);
    router.replace(`/students/${studentId}?tab=${next}`, { scroll: false });
  };
  return <QueryState query={query}>{data => <div className="flex flex-col gap-4">
    <PageHeader title={data.label} sub={`학생 #${data.id}`} right={<LinkButton href="/students" size="sm">학생 목록</LinkButton>} />
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start"><QueryState query={meta} isEmpty={value => value.students.length === 0} empty="표시할 학생이 없습니다.">{value => <StudentRail data={value} currentId={data.id} tab={tab} />}</QueryState></aside>
      <main className="min-w-0 space-y-4">
        <div className="overflow-x-auto"><Tabs<StudentHubTab> ariaLabel="학생 허브 보기" className="min-w-max [&>button]:min-h-11" value={tab} onChange={selectTab} options={STUDENT_HUB_TABS} /></div>
        {tab === 'overview' ? <GuideTab studentId={data.id} /> : null}
        {tab === 'assignment' ? <GuideTab studentId={data.id} assignment /> : null}
        {tab === 'schedule' ? <Panel title="학생 시간표" sub="공용 occurrence 정본의 학생 보기를 엽니다."><LinkButton href={`/schedule?studentId=${data.id}`}>학생 시간표 열기</LinkButton></Panel> : null}
        {tab === 'history' ? <>
          <Banner tone="warning" title="전체 CRUD 변경 이력은 아직 제공하지 않습니다.">학생·연결 상담·보호자의 기존 감사에서 누가, 언제, 어떤 행위를 했는지만 표시합니다. 변경 전후 값, 기간, 결제·진단 전체 이력은 포함하지 않습니다.</Banner>
          <Panel title={`수강 기록 ${data.enrollmentTotal}건`} sub={`기존 ENR 시작일 내림차순 최대${data.historyLimit}건`}><div className="overflow-x-auto"><Table columns={enrollmentColumns} rows={data.enrollments} rowKey={row => row.id} empty="수강 기록이 없습니다." className="min-w-[480px]" /></div></Panel>
          <Panel title={`기존 감사 ${data.historyTotal}건`} sub={`기록 시각 내림차순 · 최근${data.historyLimit}건`}><div className="overflow-x-auto"><Table columns={historyColumns} rows={data.history} rowKey={row => row.id} className="min-w-[540px]" empty="연결된 감사 기록이 없습니다. 변경이 없었다는 뜻은 아닙니다." /></div></Panel>
        </> : null}
        {tab === 'reports' ? <ContractPending title="리포트" href="/reports" link="리포트 업무 열기">현행 리포트 목록은 studentId 필터가 없어 다른 학생 자료를 안전하게 분리할 수 없습니다.</ContractPending> : null}
        {tab === 'books' ? <BooksTab studentId={data.id} /> : null}
        {tab === 'comments' ? <ContractPending title="코멘트">코멘트 공개범위와 학생 aggregate 민감 컬럼 ACL이 확정·생성 계약으로 제공되기 전에는 표시하거나 저장하지 않습니다.</ContractPending> : null}
        {tab === 'consulting' ? <QueryState query={consulting}>{value => {
          const item = value.items.find(candidate => candidate.studentId === data.id);
          return item ? <ConsultingStudents items={[item]} onOpen={id => router.push(`/consulting?id=${id}&studentId=${data.id}`)} /> : <Panel title="컨설팅"><p className="text-[12px] text-fg-subtle">볼 수 있는 이 학생의 컨설팅이 없습니다.</p></Panel>;
        }}</QueryState> : null}
        {tab === 'profile' ? <Profile data={data} /> : null}
        {tab === 'billing' ? <>
          <Panel title={`수강 기록 ${data.enrollmentTotal}건`} sub="StudentReadDto가 제공하는 기존 ENR 사실입니다."><div className="overflow-x-auto"><Table columns={enrollmentColumns} rows={data.enrollments} rowKey={row => row.id} empty="수강 기록이 없습니다." className="min-w-[480px]" /></div></Panel>
          <ContractPending title="학생별 청구" href="/accounting" link="회계 업무 열기">현행 회계 계약은 학생 허브용 exact student aggregate와 cursor를 제공하지 않아 금액·납부 상태를 이 화면에서 계산하지 않습니다.</ContractPending>
        </> : null}
      </main>
    </div>
  </div>}</QueryState>;
}
