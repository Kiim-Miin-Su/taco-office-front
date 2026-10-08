/** @file-guide
 * 목적: page.tsx — 관리자 강사 상세의 8탭 읽기 허브와 actor/target 경계.
 * 책임/재사용: 생성 StaffDirectoryDetailDto와 공용 TabCards만 사용한다. 관리자 세션을 강사로 바꾸거나 teacher 본인 API를 대리 호출하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { components } from '@/api/schema';
import { api, apiMessage } from '@/api/client';
import { sessionQueryKey, useMeta, useOccurrences, useReplySuggestion, useScheduleHolidays } from '@/api/queries';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, Input, LinkButton, PageHeader, Panel, QueryState, Segmented, TabCards } from '@/components/ui';
import { TeacherCalendarGrid } from '@/components/cal/TeacherSchedule';
import { addDays, boundsOf, hhmm, label, step, todayKst } from '@/lib/calendar';
import { won } from '@/lib/money';
import { positiveQueryId, queryEnum, queryIsoDate } from '@/lib/url-state';
import { useSession } from '@/store/useSession';

type Detail = components['schemas']['StaffDirectoryDetailDto'];
type Unavailable = components['schemas']['ScheduleUnavListDto'];
type TeacherHome = components['schemas']['TeacherHomeDto'];
type TeacherGuides = components['schemas']['TeacherGuidesDto'];
type TeacherSuggestions = components['schemas']['TeacherSuggestionsDto'];
type StaffTeacherHistory = components['schemas']['StaffTeacherHistoryDto'];
type StaffTeacherInbox = components['schemas']['StaffTeacherInboxDto'];
const STAFF_TABS = ['home', 'calendar', 'unavailable', 'reports', 'guides', 'history', 'suggestions', 'inbox'] as const;
type StaffTab = typeof STAFF_TABS[number];
const at = (value: string) => value.replace('T', ' ').slice(0, 16);

function Profile({ data }: { data: Detail }) {
  return <Panel title="기본 정보" sub={`등록 ${at(data.profile.createdAt)}`}>
    <dl className="grid gap-x-6 gap-y-3 text-[12px] sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="text-fg-subtle">한글 이름</dt><dd className="mt-1 font-bold">{data.profile.name}</dd></div>
      <div><dt className="text-fg-subtle">영문명</dt><dd className="mt-1">{data.profile.englishName ?? '미등록'}</dd></div>
      <div><dt className="text-fg-subtle">상태</dt><dd className="mt-1"><Chip tone={data.profile.active ? 'success' : 'neutral'}>{data.profile.active ? '사용 중' : '사용 중지'}</Chip></dd></div>
      <div><dt className="text-fg-subtle">직함</dt><dd className="mt-1">{data.profile.title ?? '—'}</dd></div>
      <div><dt className="text-fg-subtle">입사일</dt><dd className="mt-1">{data.profile.hiredOn ?? '—'}</dd></div>
      <div><dt className="text-fg-subtle">시간대</dt><dd className="mt-1">{data.profile.timezone ?? '—'}</dd></div>
      <div><dt className="text-fg-subtle">연락처</dt><dd className="mt-1">{data.profile.phone ?? '—'}</dd></div>
      <div><dt className="text-fg-subtle">이메일</dt><dd className="mt-1">{data.profile.email ?? '—'}</dd></div>
    </dl>
  </Panel>;
}

function Assignments({ data, calendar = false }: { data: Detail; calendar?: boolean }) {
  return <Panel title="현재 배정 수업·학생" sub={calendar
    ? '현재 등록된 반복 수업만 표시합니다. 주·월 실제 회차는 관리자용 조회 기능이 준비된 뒤 제공합니다.'
    : '현재 담당 중인 수업과 명단입니다. 교체 전 배정은 포함하지 않습니다.'}>
    {data.assignments.length === 0 ? <p className="text-[12px] text-fg-subtle">현재 배정된 수업이 없습니다.</p>
      : <ul className="divide-y divide-line">{data.assignments.map((assignment) => <li key={assignment.id} className="py-2 text-[12px]">
        <b>{assignment.kindName}{assignment.subjectName ? ` · ${assignment.subjectName}` : ''}</b>
        <span className="ml-2 text-fg-subtle">{assignment.fromDate}~{assignment.toDate ?? '현재'} · {assignment.studentNames.join(' · ') || '학생 없음'}</span>
      </li>)}</ul>}
  </Panel>;
}

function Reports({ data }: { data: Detail }) {
  return <Panel title="작성된 수업 리포트" sub="작성자 기준 · 날짜 최신순입니다. 미작성 회차는 관리자용 집계가 준비된 뒤 제공합니다.">
    {data.reports.length === 0 ? <p className="text-[12px] text-fg-subtle">작성된 수업 리포트가 없습니다.</p>
      : <ul className="divide-y divide-line">{data.reports.map((report) => <li key={report.id} className="py-2 text-[12px]">
        <b>{report.onDate} · {report.kindName}{report.subjectName ? ` · ${report.subjectName}` : ''}</b>
        <span className="ml-2 text-fg-subtle">{report.studentNames.join(' · ') || '학생 없음'}</span>
      </li>)}</ul>}
  </Panel>;
}

function History({ data, audit, hasNextPage, fetching, fetchNext }: {
  data: Detail; audit: Detail['audit']; hasNextPage: boolean; fetching: boolean; fetchNext: () => void;
}) {
  return <div className="space-y-4">
    <Panel title="시급 이력" sub="적용일 최신순 · 금액은 서버 권한과 시급 비공개 설정을 따릅니다">
      {!data.wageAccess ? <p className="text-[12px] text-fg-subtle">급여 조회 권한이 없습니다.</p>
        : data.wages.length === 0 ? <p className="text-[12px] text-fg-subtle">시급 이력이 없습니다.</p>
          : <ul className="divide-y divide-line">{data.wages.map((wage) => <li key={wage.id} className="flex flex-wrap justify-between gap-2 py-2 text-[12px]">
            <span>{wage.fromDate}부터 · {wage.reason ?? '사유 없음'} · {wage.approvedByName ?? '작성자 미상'}</span><strong>{won(wage.rate)}/시간</strong>
          </li>)}</ul>}
    </Panel>
    <Panel title="월 급여 이력" sub="월 최신순 · 실지급액은 서버 권한에 따라 가립니다">
      {!data.wageAccess ? <p className="text-[12px] text-fg-subtle">급여 조회 권한이 없습니다.</p>
        : data.payouts.length === 0 ? <p className="text-[12px] text-fg-subtle">월 정산 이력이 없습니다.</p>
          : <ul className="divide-y divide-line">{data.payouts.map((payout) => <li key={payout.id} className="flex flex-wrap justify-between gap-2 py-2 text-[12px]">
            <span>{payout.yearMonth} · {payout.state}{payout.confirmedAt ? ` · 확정 ${at(payout.confirmedAt)}` : ''}</span><strong>{won(payout.net)}</strong>
          </li>)}</ul>}
    </Panel>
    <Panel title="정보 변경 감사 이력" sub="변경한 사람 · 시각 · 변경 내용입니다. 연락처·인증·권한·급여 값은 공개하지 않습니다.">
      {audit.length === 0 ? <p className="text-[12px] text-fg-subtle">기록된 정보 변경 이력이 없습니다.</p>
        : <ol className="divide-y divide-line">{audit.map((event) => <li key={event.id} className="py-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-2"><b>{event.actionLabel}</b><span className="text-fg-subtle">{at(event.at)} · {event.actorName ?? '작성자 미상'}</span></div>
          {event.changes.length ? <ul className="mt-1 pl-4 text-fg-2">{event.changes.map((change) => <li key={change.field}>{change.field}: {change.before ?? '—'} → {change.after ?? '—'}</li>)}</ul> : null}
          {event.privateFields.length ? <p className="mt-1 text-fg-subtle">값 비공개: {event.privateFields.join(' · ')}</p> : null}
        </li>)}</ol>}
      {hasNextPage ? <Button className="mt-3" disabled={fetching} onClick={fetchNext}>{fetching ? '이력 불러오는 중…' : '이력 더 보기'}</Button> : null}
    </Panel>
  </div>;
}

function TargetHome({ data }: { data: TeacherHome }) {
  const lessons = [...data.today, ...data.upcoming];
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ['리포트 미작성', data.todo.unwrittenReports], ['승인 대기', data.todo.waitingApprovals],
        ['스케줄 변경', data.todo.openChangeRequests], ['내 설정 요청', data.todo.openStaffRequests],
        ['교재 변경', data.todo.openBookChanges],
      ].map(([title, value]) => <Panel key={String(title)} title={String(title)}><b className="text-[22px]">{value}건</b></Panel>)}
    </div>
    <Panel title="오늘·다가오는 7일 수업" sub={`${data.todayDate} 기준 · 실제 수업일 순`}>
      {lessons.length === 0 ? <p className="text-[12px] text-fg-subtle">앞으로 7일 동안 배정된 수업이 없습니다.</p>
        : <ul className="divide-y divide-line">{lessons.map((lesson) => <li key={`${lesson.serId}:${lesson.onDate}`} className="flex flex-wrap gap-x-3 gap-y-1 py-3 text-[12px]">
          <b>{lesson.date} · {hhmm(lesson.startMin)}–{hhmm(lesson.startMin + lesson.durMin)}</b>
          <span>{lesson.students ?? '학생 미배정'} · {lesson.mode === 'online' ? '비대면' : '대면'} · {lesson.repState}</span>
        </li>)}</ul>}
    </Panel>
    <Panel title="현재 설정·보낸 신청 이력" sub="시급 값은 실제 관리자 권한과 비공개 설정을 통과한 경우만 표시합니다.">
      <p className="text-[12px]">시간대 <b>{data.settings.timezone}</b> · 기본 시급 <b>{data.settings.wageRate == null ? '비공개' : `${won(data.settings.wageRate)}/시간`}</b></p>
      {data.settings.requests.length ? <ul className="mt-3 divide-y divide-line">{data.settings.requests.map((request) => <li key={request.id} className="py-2 text-[12px]">
        <b>{request.label}</b> · {request.state} · {request.createdOn}{request.asked ? ` · ${request.asked}` : ''}{request.rejectReason ? ` · ${request.rejectReason}` : ''}
      </li>)}</ul> : <p className="mt-2 text-[12px] text-fg-subtle">보낸 신청 이력이 없습니다.</p>}
    </Panel>
  </div>;
}

function TargetMonthlyHistory({ data }: { data: StaffTeacherHistory }) {
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <Panel title="진행 완료"><b className="text-[20px]">{data.stats.doneCount}건 · {(data.stats.doneMinutes / 60).toFixed(1)}시간</b></Panel>
      <Panel title="리포트 제출"><b className="text-[20px]">{data.stats.writtenCount}건</b></Panel>
      <Panel title="리포트 미작성"><b className="text-[20px]">{data.stats.unwrittenCount}건</b></Panel>
    </div>
    {!data.wageAccess ? <Banner tone="neutral">수업 기록은 표시하고 시급·수업별 금액·차감·가산·세금·실지급액은 서버 권한과 회계 비공개 설정에 따라 가립니다.</Banner> : null}
    <Panel title={`${data.month} 수업 기록`} sub="실제 수업일 순 · 정산 분류는 강사 화면과 같은 서버 계산을 사용합니다.">
      {data.lessons.length === 0 ? <p className="text-[12px] text-fg-subtle">이 달 수업 기록이 없습니다.</p>
        : <ul className="divide-y divide-line">{data.lessons.map((lesson) => <li key={`${lesson.serId}:${lesson.onDate}`} className="py-3 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>{lesson.date} · {hhmm(lesson.startMin)}–{hhmm(lesson.startMin + lesson.durMin)}</b>
            <Chip tone={lesson.canceled ? 'neutral' : lesson.settle === 'unwritten' ? 'danger' : 'success'}>{lesson.settleLabel}</Chip>
          </div>
          <p className="mt-1 text-fg-2">{lesson.title ?? lesson.subKey ?? lesson.kindKey} · {lesson.students ?? '학생 없음'}</p>
          {data.wageAccess ? <p className="mt-1 text-fg-subtle">수업료 {won(lesson.pay)} · 가산 {won(lesson.bonus)} · 차감 {won(lesson.lateCut ?? lesson.penaltyIfNow)}</p> : null}
        </li>)}</ul>}
    </Panel>
    {data.settlement ? <Panel title={`${data.settlement.yearMonth} 월 정산`} sub={data.settlement.confirmed ? '확정된 정산' : data.settlement.saved ? '저장된 정산 초안' : '현재 기준 예상 정산'}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="text-[12px]"><span className="text-fg-subtle">총액</span><strong className="mt-1 block text-[18px]">{won(data.settlement.gross)}</strong></div>
        <div className="text-[12px]"><span className="text-fg-subtle">지각 차감</span><strong className="mt-1 block text-[18px]">{won(data.settlement.lateCut)}</strong></div>
        <div className="text-[12px]"><span className="text-fg-subtle">원천징수</span><strong className="mt-1 block text-[18px]">{won(data.settlement.incomeTax + data.settlement.localTax)}</strong></div>
        <div className="text-[12px]"><span className="text-fg-subtle">실지급</span><strong className="mt-1 block text-[18px]">{won(data.settlement.net)}</strong></div>
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line">{data.settlement.breakdown.map((row) => <li key={row.key} className="flex flex-wrap justify-between gap-2 py-2 text-[12px]">
        <span>{row.label} · {row.lessonCount}건 · {(row.minutes / 60).toFixed(1)}시간</span><b>{won(row.amount)}</b>
      </li>)}</ul>
      {data.settlement.breakdownUnallocatedAmount !== 0 ? <div className="flex flex-wrap justify-between gap-2 border-t border-line py-2 text-[12px]">
        <span>저장값과 현재 근거 차이 · 종류별 근거가 없는 옛 저장 정산</span>
        <b>{data.settlement.breakdownUnallocatedAmount > 0 ? '+' : '−'}{won(Math.abs(data.settlement.breakdownUnallocatedAmount))}</b>
      </div> : null}
      {data.settlement.note ? <p className="mt-2 text-[12px] text-fg-subtle">{data.settlement.note}</p> : null}
    </Panel> : null}
  </div>;
}

function TargetInbox({ data, onGo }: { data: StaffTeacherInbox; onGo: (go: string) => void }) {
  return <Panel title="대상 강사 들어온 것" sub={`열린 업무 ${data.count}건 · 실제 관리자 actor 권한으로 처리 가능 여부를 판정합니다.`}>
    <div className="flex flex-wrap gap-2" aria-label="들어온 것 8종">
      {data.categories.map((category) => <Chip key={category.key}>{category.label} {category.count}</Chip>)}
    </div>
    {data.items.length === 0 ? <p className="mt-4 text-[12px] text-fg-subtle">현재 열린 업무가 없습니다.</p>
      : <ul className="mt-4 divide-y divide-line border-t border-line">{data.items.map((item) => <li key={`${item.sourceKind}:${item.id}`} className="py-4 text-[12px]">
        <div className="flex flex-wrap items-center gap-2"><Chip>{item.categoryLabel}</Chip><b>{item.title}</b><span className="text-fg-subtle">{at(item.at)}</span></div>
        {item.sub ? <p className="mt-2 text-fg-2">{item.sub}</p> : null}
        {item.asked && item.asked !== item.sub ? <p className="mt-1 text-fg-2">요청 · {item.asked}</p> : null}
        {item.reason ? <p className="mt-1 whitespace-pre-wrap text-fg-subtle">사유 · {item.reason}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant={item.canAct ? 'primary' : 'secondary'} onClick={() => onGo(item.go)}>처리 화면 열기</Button>
          {item.actBlockedReason ? <span className="text-fg-subtle">{item.actBlockedReason}</span> : null}
        </div>
      </li>)}</ul>}
  </Panel>;
}

function TargetGuides({ data }: { data: TeacherGuides }) {
  return <Panel title="대상 강사 수업 안내" sub={`${data.weekFrom}~${data.weekTo} · 같은 강사 준비정보 projection`}>
    {data.students.length === 0 ? <p className="text-[12px] text-fg-subtle">이 주에 담당 학생이 없습니다.</p>
      : <div className="grid gap-3 lg:grid-cols-2">{data.students.map((student) => <article key={student.studentId} className="rounded-xl border border-line bg-inset p-4 text-[12px]">
        <div className="flex flex-wrap items-center gap-2"><b className="text-[14px]">{student.name}</b><Chip>{student.weekCount}회</Chip></div>
        <p className="mt-2 text-fg-2">{student.school ?? '학교 미등록'} · {student.grade ?? '학년 미등록'} · {student.guidance ?? '지도 강도 미등록'}</p>
        <p className="mt-2 text-fg-subtle">교재 {student.books.length}권 · 진단 {student.diag ? '있음' : '없음'} · 인수인계 {student.notes.length}건</p>
        {student.books.length ? <ul className="mt-2 border-t border-line pt-2">{student.books.map((book) => <li key={book.issueId}>{book.title} · {book.stateLabel}</li>)}</ul> : null}
      </article>)}</div>}
  </Panel>;
}

function TargetSuggestions({ data, refresh }: { data: TeacherSuggestions; refresh: () => Promise<unknown> }) {
  const reply = useReplySuggestion();
  const [editing, setEditing] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const submit = (id: number) => reply.mutate({ id, reply: body }, {
    onSuccess: async () => { setEditing(null); setBody(''); await refresh(); },
  });
  return <Panel title="대상 강사 건의 사항" sub={`${data.yearMonth} ${data.used}/${data.limit}회 · 답변 actor는 현재 관리자`}>
    {data.items.length === 0 ? <p className="text-[12px] text-fg-subtle">보낸 건의가 없습니다.</p>
      : <ul className="divide-y divide-line">{data.items.map((item) => <li key={item.id} className="py-4 text-[12px]">
        <div className="flex flex-wrap items-center gap-2"><Chip>{item.category}</Chip><b>{item.createdOn}</b><span className="text-fg-subtle">{item.state}</span></div>
        <p className="mt-2 whitespace-pre-wrap text-fg-2">{item.body}</p>
        {item.lesson ? <p className="mt-1 text-fg-subtle">연결 수업 · {item.lesson.date} {item.lesson.startMin == null ? '' : hhmm(item.lesson.startMin)} · {item.lesson.students.join(' · ')}</p> : null}
        {item.reply ? <p className="mt-2 rounded-lg bg-inset p-3">답변 · {item.replyBy ?? '관리자'} · {item.replyOn ?? '날짜 미상'}<br />{item.reply}</p>
          : editing === item.id ? <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input aria-label="건의 답변" value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="15자 이상 답변" />
            <Button variant="primary" disabled={body.trim().length < 15 || reply.isPending} onClick={() => submit(item.id)}>{reply.isPending ? '답변 중…' : '답변 완료'}</Button>
            <Button onClick={() => { setEditing(null); setBody(''); reply.reset(); }}>취소</Button>
          </div> : <Button className="mt-3" size="sm" onClick={() => { setEditing(item.id); setBody(''); reply.reset(); }}>답변하기</Button>}
        {editing === item.id && reply.isError ? <div className="mt-2"><Banner tone="danger">{apiMessage(reply.error)}</Banner></div> : null}
      </li>)}</ul>}
  </Panel>;
}

function UnavailablePanel({ data, pending, error, retry }: {
  data: Unavailable | undefined; pending: boolean; error: Error | null; retry: () => void;
}) {
  return <Panel title="대상 강사 불가 시간" sub={data
    ? `${data.from}~${data.to} · 관리자 읽기 전용`
    : '향후 2주 · 관리자 읽기 전용'}>
    {pending ? <p role="status" className="text-[12px] text-fg-subtle">불가 시간을 불러오는 중…</p> : null}
    {error ? <div className="space-y-2"><Banner tone="danger">{apiMessage(error)}</Banner><Button size="sm" variant="secondary" onClick={retry}>다시 불러오기</Button></div> : null}
    {data && data.items.length === 0 ? <p className="text-[12px] text-fg-subtle">이 기간에 등록된 불가 시간이 없습니다.</p> : null}
    {data && data.items.length > 0 ? <ul className="divide-y divide-line">{data.items.map((item) => <li key={item.id} className="py-3 text-[12px]">
      <div className="font-bold">{item.date} · {hhmm(item.startMin)}–{hhmm(item.endMin)}</div>
      <p className="mt-1 text-fg-2">{item.reason}</p>
    </li>)}</ul> : null}
    <p className="mt-3 text-[12px] text-fg-subtle">등록·삭제는 대상 강사의 본인 화면에서만 수행합니다. 관리자는 시간표 편성 시 같은 불가 시간 원장을 겹쳐 확인합니다.</p>
  </Panel>;
}

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = positiveQueryId(params.id);
  const tab = queryEnum(searchParams.get('tab'), STAFF_TABS) ?? 'home';
  const calendarView = queryEnum(searchParams.get('view'), ['week', 'month'] as const) ?? 'week';
  const calendarAnchor = queryIsoDate(searchParams.get('anchor')) ?? todayKst();
  const me = useSession((s) => s.me);
  const viewerId = me?.id ?? 'anonymous';
  const unavailableFrom = todayKst();
  const unavailableTo = addDays(unavailableFrom, 13);
  const calendarRange = boundsOf(calendarView, calendarAnchor);
  const detail = useInfiniteQuery<Detail, Error, { pages: Detail[] }, readonly unknown[], string | null>({
    queryKey: sessionQueryKey(['staff-directory', 'detail', id ?? 0] as const, viewerId),
    queryFn: async ({ pageParam }) => (await api.get<Detail>(`/drawer/staff-directory/${id}`, { params: pageParam ? { cursor: pageParam } : {} })).data,
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: id !== null && viewerId !== 'anonymous',
  });
  const data = detail.data?.pages[0];
  const audit = detail.data?.pages.flatMap((page) => page.audit) ?? [];
  /*
   * BO-06E 권고안: 관리자 세션을 강사로 가장하지 않고, 일정 화면이 이미 사용하는 관리자 전용
   * targetStaff 계약을 그대로 읽는다. 이 경계를 바꾸면 schedule unavailable DTO/OpenAPI/generated type,
   * 강사 상세 8탭, UNAV↔schedule 경합 회귀, 두 수정사항 대조표와 portfolio를 함께 갱신한다.
   */
  const unavailable = useQuery<Unavailable, Error>({
    queryKey: sessionQueryKey(['staff-directory', 'unavailable', id ?? 0, unavailableFrom, unavailableTo] as const, viewerId),
    queryFn: async () => (await api.get<Unavailable>('/schedule/unavailable', {
      params: { from: unavailableFrom, to: unavailableTo, teacherId: id },
    })).data,
    enabled: tab === 'unavailable' && id !== null && viewerId !== 'anonymous',
  });
  const home = useQuery<TeacherHome, Error>({
    queryKey: sessionQueryKey(['staff-directory', 'target-home', id ?? 0] as const, viewerId),
    queryFn: async () => (await api.get<TeacherHome>(`/drawer/staff-directory/${id}/home`)).data,
    enabled: tab === 'home' && id !== null && viewerId !== 'anonymous',
  });
  const guides = useQuery<TeacherGuides, Error>({
    queryKey: sessionQueryKey(['staff-directory', 'target-guides', id ?? 0, calendarAnchor] as const, viewerId),
    queryFn: async () => (await api.get<TeacherGuides>(`/drawer/staff-directory/${id}/guides`, { params: { week: calendarAnchor } })).data,
    enabled: tab === 'guides' && id !== null && viewerId !== 'anonymous',
  });
  const suggestions = useQuery<TeacherSuggestions, Error>({
    queryKey: sessionQueryKey(['staff-directory', 'target-suggestions', id ?? 0] as const, viewerId),
    queryFn: async () => (await api.get<TeacherSuggestions>(`/drawer/staff-directory/${id}/suggestions`)).data,
    enabled: tab === 'suggestions' && id !== null && viewerId !== 'anonymous',
  });
  const history = useQuery<StaffTeacherHistory, Error>({
    queryKey: sessionQueryKey(['staff-directory', 'target-history', id ?? 0] as const, viewerId),
    queryFn: async () => (await api.get<StaffTeacherHistory>(`/drawer/staff-directory/${id}/history`)).data,
    enabled: tab === 'history' && id !== null && viewerId !== 'anonymous',
  });
  const inbox = useQuery<StaffTeacherInbox, Error>({
    queryKey: sessionQueryKey(['staff-directory', 'target-inbox', id ?? 0] as const, viewerId),
    queryFn: async () => (await api.get<StaffTeacherInbox>(`/drawer/staff-directory/${id}/inbox`)).data,
    enabled: tab === 'inbox' && id !== null && viewerId !== 'anonymous',
  });
  const occurrences = useOccurrences({ ...calendarRange, teacherId: id ?? 0 }, tab === 'calendar' && id !== null && viewerId !== 'anonymous');
  const meta = useMeta(tab === 'calendar');
  const holidays = useScheduleHolidays(calendarRange, tab === 'calendar');
  const selectTab = (next: StaffTab) => { if (id !== null) router.replace(`/staff/${id}?tab=${next}`, { scroll: false }); };
  const selectCalendar = (view: 'week' | 'month', anchor: string) => {
    if (id !== null) router.replace(`/staff/${id}?tab=calendar&view=${view}&anchor=${anchor}`, { scroll: false });
  };

  return <RequireAuth><AppShell>
    <PageHeader title={data?.profile.name ?? '강사 상세'} sub="관리자용 강사 8탭 · 확인 가능한 정보부터 제공" right={<LinkButton href="/staff">강사 목록</LinkButton>} />
    {id === null ? <Banner tone="danger">강사 번호가 올바르지 않습니다.</Banner> : null}
    {detail.isError ? <Banner tone="danger">{apiMessage(detail.error)}</Banner> : null}
    {detail.isPending && id !== null ? <p role="status" className="text-[12px] text-fg-subtle">강사 상세를 불러오는 중…</p> : null}
    {data ? <div className="space-y-4">
      <Banner tone="neutral">조회자 {me?.name ?? '알 수 없음'} · 대상 강사 {data.profile.name}</Banner>
      <TabCards<StaffTab> label="강사 업무" value={tab} onChange={selectTab} options={[
        { value: 'home', label: '홈', sub: home.data ? `오늘 ${home.data.todaySummary.lessons}건` : '기본 정보' },
        { value: 'calendar', label: '캘린더', sub: occurrences.data ? `${occurrences.data.items.length}건` : '주·월' },
        { value: 'unavailable', label: '불가 시간', sub: unavailable.data ? `${unavailable.data.items.length}건` : '향후 2주' },
        { value: 'reports', label: '리포트', sub: `${data.reports.length}건` },
        { value: 'guides', label: '수업 안내', sub: guides.data ? `${guides.data.students.length}명` : '주간 학생' },
        { value: 'history', label: '히스토리', sub: history.data ? history.data.month : '정산·변경' },
        { value: 'suggestions', label: '건의 사항', sub: suggestions.data ? `${suggestions.data.used}/${suggestions.data.limit}` : '답변' },
        { value: 'inbox', label: '들어온 것', sub: inbox.data ? `${inbox.data.count}건` : '8종 모음' },
      ]} />
      <Banner tone="warning">현재 관리자에게 제공되는 값만 표시합니다. 아직 수집하지 않은 과거 이력은 추정해 표시하지 않습니다.</Banner>
      {tab === 'home' ? <div className="space-y-4"><Profile data={data} /><Assignments data={data} /><QueryState query={home} isEmpty={() => false}>{(value) => <TargetHome data={value} />}</QueryState></div> : null}
      {tab === 'calendar' ? <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={calendarView} onChange={(value) => selectCalendar(value, calendarAnchor)} options={[{ value: 'week', label: '주간' }, { value: 'month', label: '월간' }]} />
          <Button onClick={() => selectCalendar(calendarView, step(calendarView, calendarAnchor, -1))}>이전</Button>
          <Button onClick={() => selectCalendar(calendarView, todayKst())}>오늘</Button>
          <Button onClick={() => selectCalendar(calendarView, step(calendarView, calendarAnchor, 1))}>다음</Button>
          <b className="text-[13px]">{calendarView === 'month' ? `${calendarAnchor.slice(0, 7)}` : `${label(calendarRange.from)}–${label(calendarRange.to)}`}</b>
        </div>
        <QueryState query={occurrences} isEmpty={(value) => value.items.length === 0} empty="이 기간에 배정된 수업이 없습니다.">
          {(value) => <TeacherCalendarGrid view={calendarView} anchor={calendarAnchor} items={value.items} meta={meta.data}
            holidays={holidays.data?.items ?? []} onPickDay={(date) => selectCalendar('week', date)}
            onOpen={(occurrence) => router.push(`/schedule?serId=${occurrence.serId}&onDate=${occurrence.onDate}&date=${occurrence.date}`)} />}
        </QueryState>
      </div> : null}
      {tab === 'reports' ? <Reports data={data} /> : null}
      {tab === 'history' ? <div className="space-y-4">
        <QueryState query={history} isEmpty={() => false}>{(value) => <TargetMonthlyHistory data={value} />}</QueryState>
        <History data={data} audit={audit} hasNextPage={Boolean(detail.hasNextPage)} fetching={detail.isFetchingNextPage} fetchNext={() => void detail.fetchNextPage()} />
      </div> : null}
      {tab === 'unavailable' ? <UnavailablePanel data={unavailable.data} pending={unavailable.isPending} error={unavailable.error} retry={() => void unavailable.refetch()} /> : null}
      {tab === 'guides' ? <QueryState query={guides} isEmpty={() => false}>{(value) => <TargetGuides data={value} />}</QueryState> : null}
      {tab === 'suggestions' ? <QueryState query={suggestions} isEmpty={() => false}>{(value) => <TargetSuggestions data={value} refresh={() => suggestions.refetch()} />}</QueryState> : null}
      {tab === 'inbox' ? <QueryState query={inbox} isEmpty={() => false}>{(value) => <TargetInbox data={value} onGo={(go) => router.push(go)} />}</QueryState> : null}
    </div> : null}
  </AppShell></RequireAuth>;
}
