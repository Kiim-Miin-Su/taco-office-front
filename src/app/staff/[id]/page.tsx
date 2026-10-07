/** @file-guide
 * 목적: page.tsx — 관리자 강사 상세의 8탭 읽기 허브와 actor/target 경계.
 * 책임/재사용: 생성 StaffDirectoryDetailDto와 공용 TabCards만 사용한다. 관리자 세션을 강사로 바꾸거나 teacher 본인 API를 대리 호출하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { components } from '@/api/schema';
import { api, apiMessage } from '@/api/client';
import { sessionQueryKey } from '@/api/queries';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, LinkButton, PageHeader, Panel, TabCards } from '@/components/ui';
import { won } from '@/lib/money';
import { positiveQueryId, queryEnum } from '@/lib/url-state';
import { useSession } from '@/store/useSession';

type Detail = components['schemas']['StaffDirectoryDetailDto'];
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

function ContractPending({ title, reason }: { title: string; reason: string }) {
  return <Panel title={`${title} 준비 중`} sub="필요한 조회 기능이 준비되기 전까지 임의의 빈 목록을 표시하지 않습니다.">
    <p className="text-[12px] leading-6 text-fg-2">{reason}</p>
    <p className="mt-2 text-[12px] text-fg-subtle">관리자 권한을 유지한 채 대상 강사의 정보를 조회합니다. 조회·작성·승인은 각 기능이 준비된 뒤 제공합니다.</p>
  </Panel>;
}

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = positiveQueryId(params.id);
  const tab = queryEnum(searchParams.get('tab'), STAFF_TABS) ?? 'home';
  const me = useSession((s) => s.me);
  const viewerId = me?.id ?? 'anonymous';
  const detail = useInfiniteQuery<Detail, Error, { pages: Detail[] }, readonly unknown[], string | null>({
    queryKey: sessionQueryKey(['staff-directory', 'detail', id ?? 0] as const, viewerId),
    queryFn: async ({ pageParam }) => (await api.get<Detail>(`/drawer/staff-directory/${id}`, { params: pageParam ? { cursor: pageParam } : {} })).data,
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: id !== null && viewerId !== 'anonymous',
  });
  const data = detail.data?.pages[0];
  const audit = detail.data?.pages.flatMap((page) => page.audit) ?? [];
  const selectTab = (next: StaffTab) => { if (id !== null) router.replace(`/staff/${id}?tab=${next}`, { scroll: false }); };

  return <RequireAuth><AppShell>
    <PageHeader title={data?.profile.name ?? '강사 상세'} sub="관리자용 강사 8탭 · 확인 가능한 정보부터 제공" right={<LinkButton href="/staff">강사 목록</LinkButton>} />
    {id === null ? <Banner tone="danger">강사 번호가 올바르지 않습니다.</Banner> : null}
    {detail.isError ? <Banner tone="danger">{apiMessage(detail.error)}</Banner> : null}
    {detail.isPending && id !== null ? <p role="status" className="text-[12px] text-fg-subtle">강사 상세를 불러오는 중…</p> : null}
    {data ? <div className="space-y-4">
      <Banner tone="neutral">조회자 {me?.name ?? '알 수 없음'} · 대상 강사 {data.profile.name}</Banner>
      <TabCards<StaffTab> label="강사 업무" value={tab} onChange={selectTab} options={[
        { value: 'home', label: '홈', sub: '기본 정보' },
        { value: 'calendar', label: '캘린더', sub: `현재 ${data.assignments.length}개` },
        { value: 'unavailable', label: '불가 시간', sub: '기능 준비 중' },
        { value: 'reports', label: '리포트', sub: `${data.reports.length}건` },
        { value: 'guides', label: '수업 안내', sub: '기능 준비 중' },
        { value: 'history', label: '히스토리', sub: '정산·변경' },
        { value: 'suggestions', label: '건의 사항', sub: '기능 준비 중' },
        { value: 'inbox', label: '들어온 것', sub: '기능 준비 중' },
      ]} />
      <Banner tone="warning">현재 관리자에게 제공되는 값만 표시합니다. 아직 수집하지 않은 과거 이력은 추정해 표시하지 않습니다.</Banner>
      {tab === 'home' ? <div className="space-y-4"><Profile data={data} /><Assignments data={data} /></div> : null}
      {tab === 'calendar' ? <Assignments data={data} calendar /> : null}
      {tab === 'reports' ? <Reports data={data} /> : null}
      {tab === 'history' ? <History data={data} audit={audit} hasNextPage={Boolean(detail.hasNextPage)} fetching={detail.isFetchingNextPage} fetchNext={() => void detail.fetchNextPage()} /> : null}
      {tab === 'unavailable' ? <ContractPending title="대상 강사 불가 시간" reason="현재는 강사 본인 또는 일정 관리 화면에서만 불가 시간을 확인할 수 있습니다. 대상 강사의 10일 기준 조회 기능은 준비 중입니다." /> : null}
      {tab === 'guides' ? <ContractPending title="대상 강사 수업 안내" reason="관리자용 수업 안내 조회 범위와 읽음 상태 표시를 준비 중입니다." /> : null}
      {tab === 'suggestions' ? <ContractPending title="대상 강사 건의 사항" reason="대상 강사의 건의와 답변을 정확히 연결하는 조회 기능을 준비 중입니다." /> : null}
      {tab === 'inbox' ? <ContractPending title="대상 강사 들어온 것" reason="강사의 개인 알림은 표시하지 않습니다. 관리자에게 필요한 승인·답변·안내 확인 내역만 제공할 예정입니다." /> : null}
    </div> : null}
  </AppShell></RequireAuth>;
}
