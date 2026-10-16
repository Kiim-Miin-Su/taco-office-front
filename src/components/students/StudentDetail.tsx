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
import { Banner, Button, Chip, Input, Label, LinkButton, PageHeader, Panel, QueryState, Segmented, Select, TabCards, Table, Tabs, Textarea, cn, type Column } from '@/components/ui';
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

function TeacherLinks({ teachers }: { teachers: readonly HubTeacher[] }) {
  return <Panel title={`담당 강사 ${teachers.length}명`}>
    {teachers.length ? <div className="flex flex-wrap gap-2">{teachers.map(teacher => {
      const subjects = [...new Set(teacher.lessons.map(lesson => lesson.subjectName ?? lesson.kindName).filter(Boolean))];
      return <LinkButton key={teacher.staffId} href={`/staff/${teacher.staffId}`} size="sm">
        {teacher.name}{teacher.roleLabel ? ` ${teacher.roleLabel}` : ''}{subjects.length ? ` · ${subjects.join(' · ')}` : ''} ›
      </LinkButton>;
    })}</div> : <p className="text-[12px] text-fg-subtle">현재 또는 예정된 담당 강사가 없습니다.</p>}
  </Panel>;
}

function TeacherPanel({ teachers }: { teachers: readonly HubTeacher[] }) {
  return <Panel title="담당 강사와 수업" sub="현재·예정 수업 명단의 연결입니다. 종료된 배정은 포함하지 않습니다.">
    {teachers.length ? <ul className="space-y-3">{teachers.map(teacher => <li key={teacher.staffId} className="rounded-lg border border-line p-3">
      <Link href={`/staff/${teacher.staffId}`} className="text-[13px] font-bold text-blue hover:underline">
        {teacher.name}{teacher.roleLabel ? ` ${teacher.roleLabel}` : ''}
      </Link>
      <ul className="mt-2 space-y-2">{teacher.lessons.map((lesson, index) => <li key={`${lesson.serId}:${lesson.fromDate}:${index}`} className="text-[12px] leading-5">
        <b>{[lesson.kindName, lesson.subjectName].filter(Boolean).join(' · ')}</b>
        <span className="ml-2 text-fg-subtle">{lesson.ruleLabel} · {hhmm(lesson.startMin)}–{hhmm(lesson.endMin)} · {lesson.mode === 'online' ? '비대면' : '대면'} · {lesson.fromDate} 시작{lesson.toDate ? ` · ${lesson.toDate} 종료` : ''}</span>
      </li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <LinkButton href={`/staff/${teacher.staffId}`} size="sm">선생님 홈</LinkButton>
        <LinkButton href={`/staff/${teacher.staffId}?tab=calendar`} size="sm">시간표</LinkButton>
        <LinkButton href={`/staff/${teacher.staffId}?tab=guides`} size="sm">수업 안내</LinkButton>
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
    : `${label(weekDays(anchor)[0])} – ${label(weekDays(anchor)[6])}`;
  return <Panel title="학생 시간표" sub="이 학생이 포함된 회차만 표시합니다. 수업을 선택하면 전체 일정에서 엽니다."
    right={<LinkButton href={`/schedule?studentId=${studentId}&date=${anchor}`} size="sm">전체 시간표</LinkButton>}>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Segmented<StudentCalendarView> ariaLabel="학생 시간표 보기" value={view} onChange={next => move(next, anchor)}
        options={[{ value: 'week', label: '주간' }, { value: 'month', label: '월간' }]} />
      <div role="group" aria-label="기간 이동" className="ml-auto flex flex-wrap items-center gap-1">
        <Button size="sm" aria-label="이전 기간" onClick={() => move(view, step(view, anchor, -1))}>이전</Button>
        <span className="min-w-32 text-center text-[12px] font-bold">{periodLabel}</span>
        <Button size="sm" aria-label="다음 기간" onClick={() => move(view, step(view, anchor, 1))}>다음</Button>
        <Button size="sm" onClick={() => move(view, todayKst())}>오늘</Button>
      </div>
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
const COMMENT_WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const commentDayLabel = (day: string, count: number): string => {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return `${day} · ${count}건`;
  const [, month, dateOfMonth] = day.split('-');
  return `${Number(month)}월 ${Number(dateOfMonth)}일 / ${COMMENT_WEEKDAYS[date.getUTCDay()]} · ${count}건`;
};

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
  // 두 projection의 본문은 섞어 저장하지 않는다. 이 화면에서만 KST 활동 월을 합친다.
  const months = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of hub.data?.comments.months ?? []) counts.set(item.month, item.total);
    for (const item of privateNotes.data?.items ?? []) {
      const month = kstDateTime(item.updatedAt)?.slice(0, 7);
      if (month) counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    return [...counts].map(([month, total]) => ({ month, total })).sort((a, b) => b.month.localeCompare(a.month));
  }, [hub.data, privateNotes.data]);
  const comments = useStudentHubSection(studentId, 'comments', { enabled: hub.isSuccess, commentsMonth: chosenMonth ?? undefined });
  const privateThisMonth = privateNotes.data?.items.filter(item => !chosenMonth || kstDateTime(item.updatedAt)?.startsWith(chosenMonth)) ?? [];
  const noteCount = chosenMonth ? hub.data?.comments.months.find(item => item.month === chosenMonth)?.total ?? 0 : hub.data?.comments.allTotal ?? 0;
  const monthCount = noteCount + privateThisMonth.length;
  const timeline = useMemo(() => {
    const lessonLabels = new Map((hub.data?.commentLessons ?? []).map(lesson => [lesson.serId,
      commentLessonLabel(lesson)]));
    const lessonLabel = (serId: number) => lessonLabels.get(serId) ?? '수업';
    const admin: CommentTimelineItem[] = (comments.data?.pages.flatMap(page => page.comments.items) ?? []).map(item => ({
      key: `admin:${item.id}`, origin: 'admin', author: item.authorName ?? `직원 #${item.authorId}`,
      at: item.createdAt, day: kstDateTime(item.createdAt)?.slice(0, 10) ?? '', body: item.body,
      lesson: item.serId ? lessonLabel(item.serId) : null,
    }));
    const teacher: CommentTimelineItem[] = privateThisMonth.map(item => ({
      key: `teacher:${item.id}`, origin: 'teacher', author: item.authorName, at: item.updatedAt,
      day: kstDateTime(item.updatedAt)?.slice(0, 10) ?? '', body: item.body,
      lesson: `수업일 ${item.onDate} · ${lessonLabel(item.serId)}`,
    }));
    const visible = category === 'admin' ? admin : category === 'teacher' ? teacher : [...admin, ...teacher];
    visible.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.key.localeCompare(a.key));
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
  return <div className="space-y-4">
    <Panel title="코멘트 추가" sub="관리자·매니저의 인수인계입니다. 저장 후 수정·삭제할 수 없으며 학부모 전달 문서에는 포함되지 않습니다.">
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); submit(); }}>
        <div><Label htmlFor="student-comment-lesson">연결 수업</Label>
          <Select id="student-comment-lesson" value={lessonId} disabled={add.isPending} onChange={event => setLessonId(event.target.value)}>
            <option value="">학생 공통</option>
            {lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.label}</option>)}
          </Select>
        </div>
        <div><Label htmlFor="student-comment-body" hint={`${body.length} / 500`}>코멘트 *</Label>
          <Textarea id="student-comment-body" value={body} maxLength={500} disabled={add.isPending}
            onChange={event => setBody(event.target.value)} placeholder="담당 강사에게 남길 내용을 입력하세요" />
        </div>
        {writeError ? <Banner tone="danger">{writeError}</Banner> : null}
        <Button type="submit" size="sm" disabled={!body.trim() || add.isPending}>{add.isPending ? '저장 중…' : '코멘트 남기기'}</Button>
      </form>
    </Panel>
    <Panel title={hub.isSuccess && privateNotes.isSuccess ? `코멘트 ${monthCount}건` : '코멘트'}
      sub="작성·수정 KST 날짜별 기록입니다. 강사 특이사항의 수업일은 별도로 표시합니다.">
      {hub.isPending || privateNotes.isPending ? <p className="text-[12px] text-fg-subtle">불러오는 중…</p> : null}
      {hub.isError ? <Banner tone="warning" title="코멘트 월 정보를 불러오지 못했습니다"><Button size="sm" onClick={() => void hub.refetch()}>다시 시도</Button></Banner> : null}
      {privateNotes.isError ? <Banner tone="warning" title="강사 특이사항을 불러오지 못했습니다"><Button size="sm" onClick={() => void privateNotes.refetch()}>다시 시도</Button></Banner> : null}
      {months.length ? <div className="mb-3 overflow-x-auto"><Tabs<string> ariaLabel="코멘트 월" value={chosenMonth ?? 'all'}
        onChange={value => setChosenMonth(value === 'all' ? null : value)}
        options={[{ value: 'all', label: `전체 (${(hub.data?.comments.allTotal ?? 0) + (privateNotes.data?.items.length ?? 0)}건)` },
          ...months.map(item => ({ value: item.month, label: `${item.month} (${item.total}건)` }))]} className="min-w-max [&>button]:min-h-11" /></div> : null}
      <Segmented<CommentCategory> ariaLabel="코멘트 출처" value={category} onChange={setCategory}
        options={[{ value: 'all', label: '전체' }, { value: 'admin', label: '관리자 인수인계' }, { value: 'teacher', label: '강사 특이사항' }]} />
      {comments.isPending && hub.isSuccess ? <p className="mt-3 text-[12px] text-fg-subtle">코멘트를 불러오는 중…</p> : null}
      {comments.isError ? <Banner tone="warning" title="코멘트를 불러오지 못했습니다"><Button size="sm" onClick={() => void comments.refetch()}>다시 시도</Button></Banner> : null}
      {comments.isSuccess && (privateNotes.isSuccess || privateNotes.isError) ? timeline.length ? <div className="mt-4 space-y-5">{[...monthTimeline].map(([month, days]) => <section key={month}>
        <h3 className="mb-3 text-[13px] font-bold">{month.slice(0, 4)}년 {Number(month.slice(5))}월 {months.find(item => item.month === month)?.total ?? days.reduce((total, [, items]) => total + items.length, 0)}건</h3>
        <div className="space-y-4">{days.map(([day, items]) => <section key={day}>
          <h4 className="mb-2 text-[12px] font-bold">{commentDayLabel(day, items.length)}</h4>
          <ul className="space-y-2">{items.map(item => <li key={item.key} className="rounded-lg border border-line px-3 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
            <Chip>{item.origin === 'admin' ? '관리자 인수인계' : '강사 특이사항'}</Chip>
            <b className="text-fg">{item.author}</b><span>{kstDateTime(item.at) ?? item.at}</span>
            {item.lesson ? <Chip>{item.lesson}</Chip> : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6">{item.body}</p>
          </li>)}</ul>
        </section>)}</div>
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
  return <QueryState query={query}>{data => <div className="flex flex-col gap-4">
    <PageHeader title={data.label} sub={[data.school, data.grade, `등록일 (DB 생성) ${kstDateTime(data.createdAt)?.slice(0, 10) ?? '미상'}`].filter(Boolean).join(' · ')} right={<LinkButton href="/students" size="sm">학생 목록</LinkButton>} />
    {hub.isSuccess ? <TeacherLinks teachers={hub.data.teachers} /> : null}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start"><QueryState query={meta} isEmpty={value => value.students.length === 0} empty="표시할 학생이 없습니다.">{value => <StudentRail data={value} currentId={data.id} tab={tab} />}</QueryState></aside>
      <main className="min-w-0 space-y-4">
        <TabCards<StudentHubTab> label="학생 허브 보기" value={tab} onChange={selectTab} options={STUDENT_HUB_TABS.map(option => {
          const action = (key: StudentHub['nextActions'][number]['key']) => hub.data?.nextActions.find(item => item.key === key)?.count;
          const details: Partial<Record<StudentHubTab, { sub?: string; badge?: number }>> = {
            assignment: { sub: '확인 필요 안내', badge: action('guides') },
            schedule: { sub: '예정 수업', badge: action('schedule') },
            history: { sub: '기존 감사', badge: data.historyTotal },
            reports: { sub: '리포트', badge: hub.data?.reports.total },
            books: { sub: '사용 중 교재', badge: action('books') },
            comments: { sub: '월별 기록', badge: hub.data ? hub.data.comments.allTotal + hub.data.privateNoteCount : undefined },
            consulting: { sub: '진행 중', badge: action('consulting') },
            billing: { sub: '청구 내역', badge: hub.data?.invoices.total },
          };
          const detail = details[option.value];
          const unit = option.value === 'schedule' ? '회' : option.value === 'books' ? '종' : '건';
          return { ...option, ...detail, sub: detail?.badge === undefined ? detail?.sub : `${detail.sub} ${detail.badge}${unit}` };
        })} />
        {tab === 'overview' ? <>
          {hub.isSuccess ? <TeacherPanel teachers={hub.data.teachers} /> : null}
          <HubNextActions studentId={data.id} /><GuideTab studentId={data.id} />
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
  </div>}</QueryState>;
}
