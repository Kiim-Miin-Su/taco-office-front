/** @file-guide
 * 목적: StudentDetail.tsx — 학생 10탭 허브의 학생 전환·lazy read·기존 업무 route 연결
 * 책임/재사용: 생성 DTO/학생·meta·guide·book·consulting query와 공용 UI를 재사용한다. 학생별 계약이 없는 자료를 이름 필터나 Front 집계로 만들지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, apiMessage } from '@/api/client';
import { useAddTrackingNote, useConsStudents, useGuideStudents, useMeta, useOccurrences, useScheduleHolidays, useStudentBooks } from '@/api/queries';
import type { GuideStudent, Meta, Occurrence } from '@/api/types';
import { studentKeys, useStudentHub, useStudentHubSection, useStudentPrivateNotes, useStudentRead, useStudentReadAllowed, type StudentHub, type StudentRead } from '@/api/students';
import { ConsultingStudents } from '@/components/consulting/ConsultingStudents';
import { TeacherCalendarGrid } from '@/components/cal/TeacherSchedule';
import { GuideKindChip, GuideStateChip } from '@/components/guides/GuideStatus';
import { Banner, Button, Chip, ChipRow, Input, LinkButton, PageHeader, Panel, QueryState, Segmented, Select, TabCards, Table, Textarea, cn, type Column } from '@/components/ui';
import { boundsOf, hhmm, kstDateTime, label, step, todayKst, weekDays } from '@/lib/calendar';
import { KinderMarkerPanel } from './KinderMarkerPanel';

export type StudentHubTab = 'overview' | 'assignment' | 'schedule' | 'history' | 'reports' | 'books' | 'comments' | 'consulting' | 'profile' | 'billing';
export type StudentCalendarView = 'week' | 'month';
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
  { key: 'entity', head: '대상', cell: row => row.entity === 'STU' ? '학생' : `${entityLabels[row.entity]} #${row.entityId}` },
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
            <span className="mt-1 block truncate text-[12px] text-fg-subtle">{[student.school, student.grade].filter(Boolean).join(' · ') || '학교·학년 미상'}</span>
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
    <KinderMarkerPanel studentId={data.id} />
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
    <Panel title={assignment ? '안내와 교재 배정' : '최신 수업 안내'} sub={`안내 ${student.guideCount}건`}>
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
    {assignment ? <Panel title={`배부 교재 ${student.books.length}종`} sub="학생별 안내에서 확인된 배부 완료 교재입니다.">
      {student.books.length ? <ul className="space-y-2">{student.books.map(book => <li key={book.issueId} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12px]"><b>{book.title}</b>{book.edition ? <Chip>{book.edition}</Chip> : null}<span className="text-fg-subtle">{book.code}</span></li>)}</ul> : <p className="text-[12px] text-fg-subtle">배부된 교재가 없습니다.</p>}
    </Panel> : null}
  </div>;
}

function GuideTab({ studentId, assignment = false }: { studentId: number; assignment?: boolean }) {
  const query = useGuideStudents(true);
  return <QueryState query={query}>{data => {
    const student = data.items.find(item => item.studentId === studentId);
    return student ? <GuideSummary student={student} assignment={assignment} /> : <Panel title={assignment ? '안내와 교재 배정' : '안내 한눈에'}><p className="text-[12px] text-fg-subtle">이 학생에게 연결된 안내가 없습니다. 다른 학생 자료를 대신 표시하지 않습니다.</p></Panel>;
  }}</QueryState>;
}

function BooksTab({ studentId }: { studentId: number }) {
  const count = useStudentBooks(studentId, true);
  const guides = useGuideStudents(true);
  return <QueryState query={count}>{bookCount => <QueryState query={guides}>{data => {
    const student = data.items.find(item => item.studentId === studentId);
    return <Panel title={`교재 ${bookCount.bookCount}종`} sub={bookCount.label ?? '배부 완료 교재 수는 확인된 조회값을 따릅니다.'}>
      {student?.books.length ? <ul className="space-y-2">{student.books.map(book => <li key={book.issueId} className="rounded-lg border border-line px-3 py-2 text-[12px]"><b>{book.title}</b><span className="ml-2 text-fg-subtle">{[book.edition, book.code].filter(Boolean).join(' · ')}</span></li>)}</ul> : <p className="text-[12px] text-fg-subtle">표시할 배부 교재 상세가 없습니다.</p>}
      <div className="mt-3"><LinkButton href={`/books?tab=tracking&studentId=${studentId}`} size="sm">교재 트래킹 열기</LinkButton></div>
    </Panel>;
  }}</QueryState>}</QueryState>;
}

function HubNextActions({ studentId }: { studentId: number }) {
  const query = useStudentHub(studentId);
  return <QueryState query={query}>{data => <Panel title="이어서 할 일" sub="이 학생의 현재 기록에서 확인한 결과입니다.">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {data.nextActions.map(item => <Link key={item.key} href={item.href} className="rounded-lg border border-line px-3 py-3 transition-colors hover:bg-inset">
        <span className="block text-[12px] text-fg-subtle">{item.label}</span>
        <b className="mt-1 block text-[13px]">{item.stateLabel}</b>
      </Link>)}
    </div>
  </Panel>}</QueryState>;
}

type HubTeacher = StudentHub['teachers'][number];

/**
 * 10/14 PPTX p3 ① 「담당 강사 줄」 — 이름 · 역할(강사가 아니면 서버 낱말) · 과목을 칩 하나로 묶고 `/staff/{id}`로 잇는다.
 * 수정본처럼 제목 없이 「담당 강사」 한 낱말 + 칩 줄이다. 강사 수는 개요 탭의 패널 제목이 소유한다(S5a 2026-10-16).
 */
function TeacherLinks({ teachers }: { teachers: readonly HubTeacher[] }) {
  return <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-card px-4 py-3">
    <b className="text-[13px]">담당 강사</b>
    {teachers.length ? <div className="flex flex-wrap gap-2">{teachers.map(teacher => {
      const subjects = [...new Set(teacher.lessons.map(lesson => lesson.subjectName ?? lesson.kindName).filter(Boolean))];
      return <Link key={teacher.staffId} href={`/staff/${teacher.staffId}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-inset px-4 text-[12px] transition-colors hover:border-fg-subtle">
        <b className="text-[13px] text-fg">{teacher.name}</b>
        {/* 공백 글자는 flex 배치에 영향이 없고 접근 이름(「이름 역할 과목 ›」)만 띄운다 */}
        {teacher.roleLabel ? <>{' '}<span className="text-fg-subtle">{teacher.roleLabel}</span></> : null}
        {subjects.length ? <>{' '}<span className="text-fg-subtle">{subjects.join(' · ')}</span></> : null}
        {' '}<span className="text-fg-subtle">›</span>
      </Link>;
    })}</div> : <p className="text-[12px] text-fg-subtle">현재 또는 예정된 담당 강사가 없습니다.</p>}
  </section>;
}

/** 10/14 PPTX p4 ③ 「담당 강사 N명」 패널 — 수업마다 요일·시간·대면/비대면·시작일과 강사 화면 바로가기 셋. */
function TeacherPanel({ teachers }: { teachers: readonly HubTeacher[] }) {
  return <Panel title={`담당 강사 ${teachers.length}명`} sub="지금 이 학생이 듣는 수업과 담당 강사입니다. 이름을 누르면 강사 화면으로 갑니다.">
    {teachers.length ? <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{teachers.map(teacher => <li key={teacher.staffId} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/staff/${teacher.staffId}`} className="text-[14px] font-bold text-blue hover:underline">{teacher.name}</Link>
        {teacher.roleLabel ? <Chip size="compact">{teacher.roleLabel}</Chip> : null}
        <span className="ml-auto text-[12px] text-fg-subtle">수업 {teacher.lessons.length}개</span>
      </div>
      <ul className="mt-3 space-y-2">{teacher.lessons.map((lesson, index) => <li key={`${lesson.serId}:${lesson.fromDate}:${index}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-5">
        <b className="text-[13px]">{lesson.subjectName ?? lesson.kindName}</b>
        <span className="text-fg-subtle">{lesson.ruleLabel} {hhmm(lesson.startMin)}–{hhmm(lesson.endMin)}</span>
        <Chip size="compact" tone={lesson.mode === 'online' ? 'info' : 'neutral'}>{lesson.mode === 'online' ? '비대면' : '대면'}</Chip>
        <span className="text-fg-subtle">{lesson.fromDate}부터{lesson.toDate ? ` ~ ${lesson.toDate}` : ''}</span>
      </li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <LinkButton href={`/staff/${teacher.staffId}`} size="sm">강사 홈</LinkButton>
        <LinkButton href={`/staff/${teacher.staffId}?tab=calendar`} size="sm">강사 캘린더</LinkButton>
        <LinkButton href={`/staff/${teacher.staffId}?tab=guides`} size="sm">강사 수업 안내</LinkButton>
      </div>
    </li>)}</ul> : <p className="text-[12px] text-fg-subtle">연결된 현재·예정 수업이 없습니다.</p>}
  </Panel>;
}

function StudentScheduleTab({ studentId, meta, initialView, initialAnchor }: {
  studentId: number; meta?: Meta; initialView: StudentCalendarView; initialAnchor: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<StudentCalendarView>(initialView);
  const [anchor, setAnchor] = useState(initialAnchor);
  useEffect(() => { setView(initialView); setAnchor(initialAnchor); }, [initialView, initialAnchor]);
  const range = boundsOf(view, anchor);
  const occurrences = useOccurrences({ ...range, studentId });
  const holidays = useScheduleHolidays(range);
  const move = (nextView: StudentCalendarView, nextAnchor: string) => {
    setView(nextView);
    setAnchor(nextAnchor);
    router.replace(`/students/${studentId}?tab=schedule&view=${nextView}&anchor=${nextAnchor}`, { scroll: false });
  };
  const open = (occ: Occurrence) => {
    const params = new URLSearchParams({ studentId: String(studentId), serId: String(occ.serId), onDate: occ.onDate, date: occ.date });
    router.push(`/schedule?${params.toString()}`);
  };
  const periodLabel = view === 'month' ? `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`
    : `${label(weekDays(anchor)[0])}–${label(weekDays(anchor)[6])}`;
  // 10/14 PPTX p6 수정본: 주간·월간 → 이전·오늘·다음 → 기간 글자, 오른쪽 끝에 「전체 스케줄에서 보기」(S5a 2026-10-16)
  return <Panel title="학생 시간표" sub="이 학생이 포함된 회차만 표시합니다. 수업을 선택하면 전체 일정에서 엽니다.">
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Segmented<StudentCalendarView> ariaLabel="학생 시간표 보기" value={view} onChange={next => move(next, anchor)}
        options={[{ value: 'week', label: '주간' }, { value: 'month', label: '월간' }]} />
      <div role="group" aria-label="기간 이동" className="flex flex-wrap items-center gap-1">
        <Button size="sm" aria-label="이전 기간" onClick={() => move(view, step(view, anchor, -1))}>이전</Button>
        <Button size="sm" onClick={() => move(view, todayKst())}>오늘</Button>
        <Button size="sm" aria-label="다음 기간" onClick={() => move(view, step(view, anchor, 1))}>다음</Button>
      </div>
      <span className="text-[13px] font-bold">{periodLabel}</span>
      <LinkButton href={`/schedule?studentId=${studentId}&date=${anchor}`} size="sm" className="ml-auto">전체 스케줄에서 보기</LinkButton>
    </div>
    <QueryState query={occurrences}>{data => <>
      {holidays.isError ? <Banner tone="warning" title="공휴일을 불러오지 못했습니다"><Button size="sm" onClick={() => void holidays.refetch()}>다시 시도</Button></Banner> : null}
      <TeacherCalendarGrid view={view} anchor={anchor} items={data.items} meta={meta} holidays={holidays.data?.items ?? []}
        perspective="student" onOpen={open} onPickDay={date => move('week', date)} />
    </>}</QueryState>
  </Panel>;
}

type HubReport = StudentHub['reports']['items'][number];
const reportColumns: Column<HubReport>[] = [
  { key: 'date', head: '수업일', cell: row => row.onDate },
  { key: 'subject', head: '수업', cell: row => [row.kindName, row.subjectName].filter(Boolean).join(' · ') },
  { key: 'teacher', head: '강사', cell: row => row.teacherName ?? '미정' },
  { key: 'state', head: '상태', cell: row => row.stateLabel },
];

function ReportsTab({ studentId }: { studentId: number }) {
  const query = useStudentHubSection(studentId, 'reports');
  if (query.isPending) return <Panel title="리포트"><p className="text-[12px] text-fg-subtle">불러오는 중…</p></Panel>;
  if (query.isError) return <Banner tone="warning" title="리포트를 불러오지 못했습니다"><Button className="mt-2" size="sm" onClick={() => void query.refetch()}>다시 시도</Button></Banner>;
  const items = query.data.pages.flatMap(page => page.reports.items);
  const total = query.data.pages[0]?.reports.total ?? 0;
  return <Panel title={`리포트 ${total}건`} sub="이 학생의 승인 상태 목록입니다. 리포트 본문은 기존 리포트 화면에서 엽니다.">
    <div className="overflow-x-auto"><Table columns={reportColumns} rows={items} rowKey={row => row.id} empty="이 학생의 리포트가 없습니다." className="min-w-[520px]" /></div>
    <div className="mt-3 flex flex-wrap gap-2">
      {query.hasNextPage ? <Button size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? '불러오는 중…' : '리포트 더 보기'}</Button> : null}
      <LinkButton href="/reports" size="sm">리포트 업무 열기</LinkButton>
    </div>
  </Panel>;
}

type CommentCategory = 'all' | 'admin' | 'teacher';
type CommentTimelineItem = {
  key: string;
  origin: 'admin' | 'teacher';
  author: string;
  at: string;
  day: string;
  body: string;
  lesson: string | null;
};
type CommentLesson = StudentHub['commentLessons'][number];
const commentLessonLabel = (lesson?: CommentLesson): string =>
  [lesson?.kindName, lesson?.subjectName].filter(Boolean).join(' · ') || '수업';
/** 10/14 PPTX p7 ③: 코멘트 카드의 칩은 과목 이름 하나다(과목이 없는 수업만 종류 이름). */
const commentSubjectLabel = (lesson?: CommentLesson): string => lesson?.subjectName ?? lesson?.kindName ?? '수업';
const COMMENT_WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
/** 날짜 묶음 머리 — 수정본처럼 「10월 14일」 / 「수요일 · 1건」 두 줄로 나눈다. */
const commentDayParts = (day: string, count: number): { title: string; sub: string } => {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { title: day, sub: `${count}건` };
  const [, month, dateOfMonth] = day.split('-');
  return { title: `${Number(month)}월 ${Number(dateOfMonth)}일`, sub: `${COMMENT_WEEKDAYS[date.getUTCDay()]} · ${count}건` };
};
const commentMonthLabel = (month: string): string => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;

function CommentsTab({ studentId }: { studentId: number }) {
  const queryClient = useQueryClient();
  const hub = useStudentHub(studentId);
  const privateNotes = useStudentPrivateNotes(studentId);
  const add = useAddTrackingNote();
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const [category, setCategory] = useState<CommentCategory>('all');
  const [lessonId, setLessonId] = useState('');
  const [body, setBody] = useState('');
  const [writeError, setWriteError] = useState<string | null>(null);
  // 두 projection의 본문은 섞어 저장하지 않는다. 이 화면에서만 달을 합친다.
  // 10/14 PPTX p7: 관리자 코멘트는 남긴 날(KST, 서버 집계), 강사 특이사항은 그 수업일(onDate)에 쌓는다(S5a 2026-10-16).
  const months = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of hub.data?.comments.months ?? []) counts.set(item.month, item.total);
    for (const item of privateNotes.data?.items ?? []) {
      const month = item.onDate.slice(0, 7);
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    return [...counts].map(([month, total]) => ({ month, total })).sort((a, b) => b.month.localeCompare(a.month));
  }, [hub.data, privateNotes.data]);
  const comments = useStudentHubSection(studentId, 'comments', { enabled: hub.isSuccess, commentsMonth: chosenMonth ?? undefined });
  const privateThisMonth = privateNotes.data?.items.filter(item => !chosenMonth || item.onDate.startsWith(chosenMonth)) ?? [];
  const noteCount = chosenMonth ? hub.data?.comments.months.find(item => item.month === chosenMonth)?.total ?? 0 : hub.data?.comments.allTotal ?? 0;
  const monthCount = noteCount + privateThisMonth.length;
  const timeline = useMemo(() => {
    const lessonLabels = new Map((hub.data?.commentLessons ?? []).map(lesson => [lesson.serId,
      commentSubjectLabel(lesson)]));
    const lessonLabel = (serId: number) => lessonLabels.get(serId) ?? '수업';
    const admin: CommentTimelineItem[] = (comments.data?.pages.flatMap(page => page.comments.items) ?? []).map(item => ({
      key: `admin:${item.id}`, origin: 'admin', author: item.authorName ?? `직원 #${item.authorId}`,
      at: item.createdAt, day: kstDateTime(item.createdAt)?.slice(0, 10) ?? '', body: item.body,
      lesson: item.serId ? lessonLabel(item.serId) : null,
    }));
    const teacher: CommentTimelineItem[] = privateThisMonth.map(item => ({
      key: `teacher:${item.id}`, origin: 'teacher', author: item.authorName, at: item.updatedAt,
      day: item.onDate, body: item.body, lesson: lessonLabel(item.serId),
    }));
    const visible = category === 'admin' ? admin : category === 'teacher' ? teacher : [...admin, ...teacher];
    // 날짜 묶음이 먼저다 — 강사 특이사항은 작성 시각과 묶음 날짜(수업일)가 다를 수 있다
    visible.sort((a, b) => b.day.localeCompare(a.day) || Date.parse(b.at) - Date.parse(a.at) || b.key.localeCompare(a.key));
    const grouped = new Map<string, CommentTimelineItem[]>();
    for (const item of visible) grouped.set(item.day, [...(grouped.get(item.day) ?? []), item]);
    return [...grouped];
  }, [category, comments.data, hub.data?.commentLessons, privateThisMonth]);
  const monthTimeline = new Map<string, typeof timeline>();
  for (const dayGroup of timeline) {
    const key = dayGroup[0].slice(0, 7);
    monthTimeline.set(key, [...(monthTimeline.get(key) ?? []), dayGroup]);
  }
  const lessons = hub.data?.commentLessons.map(lesson => ({
    id: lesson.serId,
    label: `${lesson.teacherName} · ${[lesson.kindName, lesson.subjectName].filter(Boolean).join(' · ')} · ${lesson.fromDate}–${lesson.toDate ?? '계속'}${lesson.ended ? ' · 종료' : ''}`,
  })) ?? [];
  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 500 || add.isPending) return;
    setWriteError(null);
    add.mutate({ studentId, ...(lessonId ? { serId: Number(lessonId) } : {}), body: trimmed }, {
      onSuccess: () => {
        setBody('');
        void queryClient.invalidateQueries({ queryKey: studentKeys.hub(studentId) });
      },
      onError: error => setWriteError(apiMessage(error)),
    });
  };
  const allCount = (hub.data?.comments.allTotal ?? 0) + (privateNotes.data?.items.length ?? 0);
  return <div className="space-y-4">
    {/* 10/14 PPTX p7 ① 「코멘트 남기기」 — 본문 → 연결 수업 · 글자 수 · 단추 한 줄 (S5a 2026-10-16) */}
    <Panel title="코멘트 남기기" sub="담당 강사의 수업 안내 학생 카드에 함께 보입니다 · 학부모에게는 나가지 않습니다 · 고치기·지우기 없이 날짜순으로 쌓입니다">
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); submit(); }}>
        <label htmlFor="student-comment-body" className="sr-only">코멘트 내용</label>
        <Textarea id="student-comment-body" value={body} maxLength={500} disabled={add.isPending}
          onChange={event => setBody(event.target.value)} placeholder="예) 10/2 숙제 미제출 건 어머님과 통화 — 화·금 수업 전날 숙제 확인 문자를 보내기로 함" />
        <div className="flex flex-wrap items-center gap-2">
          {/* 공용 Select 는 늘 w-full 이라 폭은 감싼 칸이 정한다(너비 덮어쓰기 금지 — CODEX §5-18) */}
          <div className="min-w-0 flex-1 sm:max-w-md">
            <Select id="student-comment-lesson" aria-label="연결 수업" value={lessonId} disabled={add.isPending}
              onChange={event => setLessonId(event.target.value)}>
              <option value="">학생 공통 — 수업 연결 없음</option>
              {lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.label}</option>)}
            </Select>
          </div>
          <span className="text-[12px] tabular-nums text-fg-subtle">{body.length}/500</span>
          <Button type="submit" size="sm" className="ml-auto" disabled={!body.trim() || add.isPending}>{add.isPending ? '저장 중…' : '코멘트 남기기'}</Button>
        </div>
        {writeError ? <Banner tone="danger">{writeError}</Banner> : null}
      </form>
    </Panel>
    <Panel title={hub.isSuccess && privateNotes.isSuccess ? `코멘트 ${monthCount}건` : '코멘트'} wrapRight
      sub="관리자 코멘트와 강사 특이사항을 날짜순으로 쌓아 달 · 날짜로 묶었습니다. 달을 누르면 그 달만 봅니다. 학부모 전달 문서에는 포함되지 않습니다."
      right={<Segmented<CommentCategory> ariaLabel="코멘트 출처" value={category} onChange={setCategory}
        options={[{ value: 'all', label: '전체' }, { value: 'admin', label: '관리자 코멘트' }, { value: 'teacher', label: '강사 특이사항' }]} />}>
      {hub.isPending || privateNotes.isPending ? <p className="text-[12px] text-fg-subtle">불러오는 중…</p> : null}
      {hub.isError ? <Banner tone="warning" title="코멘트 월 정보를 불러오지 못했습니다"><Button size="sm" onClick={() => void hub.refetch()}>다시 시도</Button></Banner> : null}
      {privateNotes.isError ? <Banner tone="warning" title="강사 특이사항을 불러오지 못했습니다"><Button size="sm" onClick={() => void privateNotes.refetch()}>다시 시도</Button></Banner> : null}
      {months.length ? <ChipRow<string> ariaLabel="코멘트 달" pressedTone="ink" className="mb-3" value={chosenMonth ?? ''}
        onChange={value => setChosenMonth(value || null)} allLabel="전체" allCount={allCount}
        options={months.map(item => ({ value: item.month, label: commentMonthLabel(item.month), count: item.total }))} /> : null}
      {comments.isPending && hub.isSuccess ? <p className="mt-3 text-[12px] text-fg-subtle">코멘트를 불러오는 중…</p> : null}
      {comments.isError ? <Banner tone="warning" title="코멘트를 불러오지 못했습니다"><Button size="sm" onClick={() => void comments.refetch()}>다시 시도</Button></Banner> : null}
      {comments.isSuccess && (privateNotes.isSuccess || privateNotes.isError) ? timeline.length ? <div className="mt-4 space-y-6">{[...monthTimeline].map(([month, days]) => <section key={month}>
        <h3 className="mb-3 flex items-center gap-2 border-b border-line pb-2 text-[15px] font-bold">{commentMonthLabel(month)}{' '}
          <Chip size="compact">{`${months.find(item => item.month === month)?.total ?? days.reduce((total, [, items]) => total + items.length, 0)}건`}</Chip></h3>
        <div className="space-y-4">{days.map(([day, items]) => {
          const head = commentDayParts(day, items.length);
          return <section key={day} className="grid grid-cols-1 gap-2 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-4">
            <div className="sm:border-r sm:border-line sm:pr-3">
              <h4 className="text-[14px] font-bold">{head.title}</h4>
              <p className="mt-0.5 text-[12px] text-fg-subtle">{head.sub}</p>
            </div>
            <ul className="space-y-2">{items.map(item => <li key={item.key} className="rounded-lg border border-line px-3 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
                <Chip tone={item.origin === 'admin' ? 'info' : 'neutral'}>{item.origin === 'admin' ? '관리자 코멘트' : '강사 특이사항'}</Chip>
                <b className="text-fg">{item.author}</b>
                {item.origin === 'admin' ? <span className="tabular-nums">{kstDateTime(item.at)?.slice(11, 16) ?? item.at}</span> : null}
                {item.lesson ? <Chip>{item.lesson}</Chip> : null}
                {item.origin === 'teacher' ? <span className="ml-auto">수업 뒤 작성 · {kstDateTime(item.at) ?? item.at}</span> : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6">{item.body}</p>
            </li>)}</ul>
          </section>;
        })}</div>
      </section>)}</div> : <p className="mt-3 text-[12px] text-fg-subtle">선택한 기간과 출처에 표시할 코멘트가 없습니다.</p> : null}
      {comments.hasNextPage && category !== 'teacher' ? <Button className="mt-3" size="sm" disabled={comments.isFetchingNextPage}
        onClick={() => void comments.fetchNextPage()}>{comments.isFetchingNextPage ? '불러오는 중…' : '코멘트 더 보기'}</Button> : null}
    </Panel>
  </div>;
}

/** BOC-09D-03: 강사가 쓴 본문은 이 관리자 학생별 projection에서만 읽는다. */
function PrivateNotesPanel({ studentId, lessons }: { studentId: number; lessons: StudentHub['commentLessons'] }) {
  const query = useStudentPrivateNotes(studentId);
  const lessonLabels = new Map(lessons.map(lesson => [lesson.serId, commentLessonLabel(lesson)]));
  return <QueryState query={query}>{data => (
    <Panel title={`강사 특이사항 ${data.items.length}건`} sub="강사가 완료 수업 뒤 남긴 관리자 전용 기록입니다. 강사 최근 내역·학부모 문서·검색·알림에는 본문이 노출되지 않습니다.">
      {data.items.length ? <ul className="space-y-2">{data.items.map(item => (
        <li key={item.id} className="rounded-lg border border-line px-3 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
            <b className="text-fg">{item.authorName}</b>
            <span>{item.onDate}</span>
            <Chip>{lessonLabels.get(item.serId) ?? '수업'}</Chip>
            <span className="ml-auto">전달 v{item.version} · {kstDateTime(item.updatedAt) ?? item.updatedAt}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6">{item.body}</p>
        </li>
      ))}</ul> : <p className="text-[12px] text-fg-subtle">강사가 전달한 특이사항이 없습니다.</p>}
    </Panel>
  )}</QueryState>;
}

function InvoicesTab({ studentId, enrollments, enrollmentTotal }: { studentId: number; enrollments: StudentRead['enrollments']; enrollmentTotal: number }) {
  const query = useStudentHubSection(studentId, 'invoices');
  if (query.isPending) return <Panel title="학생별 청구"><p className="text-[12px] text-fg-subtle">불러오는 중…</p></Panel>;
  if (query.isError) return <Banner tone="warning" title="청구 내역을 불러오지 못했습니다"><Button className="mt-2" size="sm" onClick={() => void query.refetch()}>다시 시도</Button></Banner>;
  const items = query.data.pages.flatMap(page => page.invoices.items);
  const first = query.data.pages[0];
  const total = first?.invoices.total ?? 0;
  const money = (value: number | null) => value === null ? '금액 비공개' : `${value.toLocaleString('ko-KR')}원`;
  return <>
    <Panel title={`수강 기록 ${enrollmentTotal}건`} sub="확인된 기존 수강 기록입니다."><div className="overflow-x-auto"><Table columns={enrollmentColumns} rows={enrollments} rowKey={row => row.id} empty="수강 기록이 없습니다." className="min-w-[480px]" /></div></Panel>
    <Panel title={`학생별 청구 ${total}건`} sub={first?.canSeeAmounts ? '현재 계정에서 볼 수 있는 청구 금액입니다.' : '현재 계정에서는 청구 금액을 볼 수 없습니다.'}>
      {items.length ? <ul className="space-y-2">{items.map(item => <li key={item.id} className="flex flex-col gap-1 rounded-lg border border-line px-3 py-3 text-[12px] sm:flex-row sm:items-center sm:justify-between">
        <span><b>{item.title}</b><span className="ml-2 text-fg-subtle">{item.yearMonth} · {item.invTypeLabel} · {item.stateLabel}</span></span>
        <span className="font-semibold">{money(item.remainingAmount)}</span>
      </li>)}</ul> : <p className="text-[12px] text-fg-subtle">이 학생의 청구 내역이 없습니다.</p>}
      <div className="mt-3 flex flex-wrap gap-2">{query.hasNextPage ? <Button size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? '불러오는 중…' : '청구 더 보기'}</Button> : null}{first?.canSeeAmounts ? <LinkButton href={`/accounting?studentId=${studentId}`} size="sm">회계 업무 열기</LinkButton> : null}</div>
    </Panel>
  </>;
}

export function StudentDetail({ studentId, initialTab = 'overview', initialCalendarView = 'week', initialCalendarAnchor }: {
  studentId: number | null; initialTab?: StudentHubTab; initialCalendarView?: StudentCalendarView; initialCalendarAnchor?: string;
}) {
  const allowed = useStudentReadAllowed();
  const router = useRouter();
  const validId = studentId !== null && Number.isSafeInteger(studentId) && studentId > 0;
  const [tab, setTab] = useState<StudentHubTab>(initialTab);
  const query = useStudentRead(validId ? studentId : null);
  const hub = useStudentHub(validId ? studentId : null);
  const meta = useMeta(allowed && validId);
  const consulting = useConsStudents(tab === 'consulting' && allowed && validId);
  useEffect(() => setTab(initialTab), [initialTab, studentId]);
  if (!allowed) return <Banner tone="warning">학생 상세를 조회할 권한이 없습니다.</Banner>;
  if (!validId) return <Banner tone="warning">잘못된 학생 주소입니다. <LinkButton href="/students" size="sm">학생 목록</LinkButton></Banner>;
  if (query.error instanceof ApiError && query.error.status === 404) return <Banner tone="warning">학생을 찾을 수 없습니다. <LinkButton href="/students" size="sm">학생 목록</LinkButton></Banner>;
  const selectTab = (next: StudentHubTab) => {
    setTab(next);
    router.replace(`/students/${studentId}?tab=${next}`, { scroll: false });
  };
  return <QueryState query={query}>{data => {
    // 10/14 PPTX p3: 머리 줄 「학교 · 학년 · YYYY-MM-DD 등록」. 날짜는 STU.created_at(학생 DB 생성일, KST)이며
    // 기존 등록 시작일(startedOn)과 다른 값이다 — 두 값의 구분은 프로필 탭이 함께 보인다(S5a 2026-10-16).
    const registered = kstDateTime(data.createdAt)?.slice(0, 10);
    // 탭 아랫줄 숫자는 모두 서버 응답(hub.nextActions · reports · comments · read 집계)이다. 화면은 낱말만 붙인다(D-R37).
    const action = (key: StudentHub['nextActions'][number]['key']) => hub.data?.nextActions.find(item => item.key === key)?.count;
    const tabSub = (value: StudentHubTab): string | undefined => {
      const hubData = hub.data;
      switch (value) {
        case 'overview': return hubData ? `할 일 ${hubData.nextActions.filter(item => item.count > 0).length}건` : undefined;
        case 'assignment': return hubData ? `안내 ${action('guides') ?? 0} · 교재 ${action('books') ?? 0}` : undefined;
        case 'schedule': return hubData ? `주·월 · 예정 ${action('schedule') ?? 0}회` : '주·월';
        case 'history': return `수강 ${data.enrollmentTotal}건`;
        case 'reports': return hubData ? `${hubData.reports.total}건` : undefined;
        case 'books': return hubData ? `${action('books') ?? 0}종 사용 중` : undefined;
        case 'comments': return hubData ? `${hubData.comments.allTotal + hubData.privateNoteCount}건 · 달별` : undefined;
        case 'consulting': return hubData ? `${action('consulting') ?? 0}건 진행` : undefined;
        case 'profile': return `보호자 ${data.guardianTotal}명`;
        case 'billing': return hubData ? `처리 ${action('billing') ?? 0}건` : undefined;
      }
    };
    return <div className="flex flex-col gap-4">
    <PageHeader title={data.label} sub={[data.school, data.grade, registered ? `${registered} 등록` : '등록일 미상'].filter(Boolean).join(' · ')} right={<LinkButton href="/students" size="sm">학생 목록</LinkButton>} />
    {hub.isSuccess ? <TeacherLinks teachers={hub.data.teachers} /> : null}
    {/* 10/14 PPTX p3 ②: 카드형 탭 10개는 학생 목록·본문 위 전체 폭에 놓고 모서리 숫자 동그라미 없이 아랫줄에만 숫자를 둔다 */}
    <TabCards<StudentHubTab> label="학생 허브 보기" value={tab} onChange={selectTab}
      options={STUDENT_HUB_TABS.map(option => ({ ...option, sub: tabSub(option.value) }))} />
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start"><QueryState query={meta} isEmpty={value => value.students.length === 0} empty="표시할 학생이 없습니다.">{value => <StudentRail data={value} currentId={data.id} tab={tab} />}</QueryState></aside>
      <main className="min-w-0 space-y-4">
        {/* 10/14 PPTX p4: 이어서 할 일 → 담당 강사 패널 → 최신 수업 안내 순서 */}
        {tab === 'overview' ? <>
          <HubNextActions studentId={data.id} />
          {hub.isSuccess ? <TeacherPanel teachers={hub.data.teachers} /> : null}
          <GuideTab studentId={data.id} />
        </> : null}
        {tab === 'assignment' ? <GuideTab studentId={data.id} assignment /> : null}
        {tab === 'schedule' ? <StudentScheduleTab studentId={data.id} meta={meta.data} initialView={initialCalendarView}
          initialAnchor={initialCalendarAnchor ?? todayKst()} /> : null}
        {tab === 'history' ? <>
          <PrivateNotesPanel studentId={data.id} lessons={hub.data?.commentLessons ?? []} />
          <Banner tone="warning" title="전체 변경 이력은 아직 제공하지 않습니다.">학생·연결 상담·보호자의 기존 감사에서 누가, 언제, 어떤 행위를 했는지만 표시합니다. 변경 전후 값, 기간, 결제·진단 전체 이력은 포함하지 않습니다.</Banner>
          <Panel title={`수강 기록 ${data.enrollmentTotal}건`} sub={`기존 수강 시작일 내림차순 최대${data.historyLimit}건`}><div className="overflow-x-auto"><Table columns={enrollmentColumns} rows={data.enrollments} rowKey={row => row.id} empty="수강 기록이 없습니다." className="min-w-[480px]" /></div></Panel>
          <Panel title={`기존 감사 ${data.historyTotal}건`} sub={`기록 시각 내림차순 · 최근${data.historyLimit}건`}><div className="overflow-x-auto"><Table columns={historyColumns} rows={data.history} rowKey={row => row.id} className="min-w-[540px]" empty="연결된 감사 기록이 없습니다. 변경이 없었다는 뜻은 아닙니다." /></div></Panel>
        </> : null}
        {tab === 'reports' ? <ReportsTab studentId={data.id} /> : null}
        {tab === 'books' ? <BooksTab studentId={data.id} /> : null}
        {tab === 'comments' ? <CommentsTab studentId={data.id} /> : null}
        {tab === 'consulting' ? <QueryState query={consulting}>{value => {
          const item = value.items.find(candidate => candidate.studentId === data.id);
          return item ? <ConsultingStudents items={[item]} onOpen={id => router.push(`/consulting?id=${id}&studentId=${data.id}`)} /> : <Panel title="컨설팅"><p className="text-[12px] text-fg-subtle">볼 수 있는 이 학생의 컨설팅이 없습니다.</p></Panel>;
        }}</QueryState> : null}
        {tab === 'profile' ? <Profile data={data} /> : null}
        {tab === 'billing' ? <InvoicesTab studentId={data.id} enrollments={data.enrollments} enrollmentTotal={data.enrollmentTotal} /> : null}
      </main>
    </div>
  </div>;
  }}</QueryState>;
}
