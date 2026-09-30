/** @file-guide
 * 목적: page.tsx — 관리자 강사 상세: 기존 프로필·급여·수업·STAFF 변경 감사 이력.
 * 책임/재사용: 생성 DTO와 서버 projection만 표시한다. 영문명/신규 인적 필드와 아직 기록하지 않은 CRUD는 임의로 채우지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import type { components } from '@/api/schema';
import { api, apiMessage } from '@/api/client';
import { sessionQueryKey } from '@/api/queries';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, LinkButton, PageHeader, Panel } from '@/components/ui';
import { won } from '@/lib/money';
import { positiveQueryId } from '@/lib/url-state';
import { useSession } from '@/store/useSession';

type Detail = components['schemas']['StaffDirectoryDetailDto'];

const at = (value: string) => value.replace('T', ' ').slice(0, 16);

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const id = positiveQueryId(params.id);
  const viewerId = useSession((s) => s.me?.id ?? 'anonymous');
  const detail = useInfiniteQuery<Detail, Error, { pages: Detail[] }, readonly unknown[], string | null>({
    queryKey: sessionQueryKey(['staff-directory', 'detail', id ?? 0] as const, viewerId),
    queryFn: async ({ pageParam }) => (await api.get<Detail>(`/drawer/staff-directory/${id}`, {
      params: pageParam ? { cursor: pageParam } : {},
    })).data,
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: id !== null && viewerId !== 'anonymous',
  });
  const data = detail.data?.pages[0];
  const audit = detail.data?.pages.flatMap((page) => page.audit) ?? [];

  return <RequireAuth><AppShell>
    <PageHeader title={data?.profile.name ?? '강사 상세'} sub="개인 정보 · 급여 · 수업 · 변경 이력" right={<LinkButton href="/staff">강사 목록</LinkButton>} />
    {id === null ? <Banner tone="danger">강사 번호가 올바르지 않습니다.</Banner> : null}
    {detail.isError ? <Banner tone="danger">{apiMessage(detail.error)}</Banner> : null}
    {detail.isPending && id !== null ? <p role="status" className="text-[12px] text-fg-subtle">강사 상세를 불러오는 중…</p> : null}
    {data ? <div className="space-y-4">
      <Banner tone="warning">과거 변경은 현재 DB에 기록된 STAFF 감사 로그 범위에서 조회됩니다. 수업 배정은 현재 규칙, 수업 이력은 작성된 리포트 기준입니다. 영문명·학교·자격·근무 예정 기간 등 신규 인적 정보는 DB 이관 후 표시됩니다.</Banner>
      <Panel title="기본 정보" sub={`등록 ${at(data.profile.createdAt)}`}>
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
      </Panel>
      <Panel title="시급 이력" sub="적용일 최신순 · 금액은 서버 권한과 시급 비공개 설정을 따릅니다">
        {!data.wageAccess ? <p className="text-[12px] text-fg-subtle">급여 조회 권한이 없습니다.</p>
          : data.wages.length === 0 ? <p className="text-[12px] text-fg-subtle">시급 이력이 없습니다.</p>
            : <ul className="divide-y divide-line">{data.wages.map((wage) => <li key={wage.id} className="flex flex-wrap justify-between gap-2 py-2 text-[12px]">
              <span>{wage.fromDate}부터 · {wage.reason ?? '사유 없음'} · {wage.approvedByName ?? '작성자 미상'}</span>
              <strong>{won(wage.rate)}/시간</strong>
            </li>)}</ul>}
      </Panel>
      <Panel title="월 급여 이력" sub="월 최신순 · 실지급액은 서버에서 가립니다">
        {!data.wageAccess ? <p className="text-[12px] text-fg-subtle">급여 조회 권한이 없습니다.</p>
          : data.payouts.length === 0 ? <p className="text-[12px] text-fg-subtle">월 정산 이력이 없습니다.</p>
            : <ul className="divide-y divide-line">{data.payouts.map((payout) => <li key={payout.id} className="flex flex-wrap justify-between gap-2 py-2 text-[12px]">
              <span>{payout.yearMonth} · {payout.state}{payout.confirmedAt ? ` · 확정 ${at(payout.confirmedAt)}` : ''}</span>
              <strong>{won(payout.net)}</strong>
            </li>)}</ul>}
      </Panel>
      <Panel title="현재 배정 수업·학생" sub="SER 수업 규칙의 현재 담당자와 명단입니다. 교체 전 배정은 이 표에 포함되지 않습니다.">
        {data.assignments.length === 0 ? <p className="text-[12px] text-fg-subtle">현재 배정된 수업이 없습니다.</p>
          : <ul className="divide-y divide-line">{data.assignments.map((assignment) => <li key={assignment.id} className="py-2 text-[12px]">
            <b>{assignment.kindName}{assignment.subjectName ? ` · ${assignment.subjectName}` : ''}</b>
            <span className="ml-2 text-fg-subtle">{assignment.fromDate}~{assignment.toDate ?? '현재'} · {assignment.studentNames.join(' · ') || '학생 없음'}</span>
          </li>)}</ul>}
      </Panel>
      <Panel title="작성된 수업 리포트" sub="REP.teacher_id 기준 · 날짜 최신순. 리포트 없는 과거 수업은 이 목록에 나타나지 않습니다.">
        {data.reports.length === 0 ? <p className="text-[12px] text-fg-subtle">작성된 수업 리포트가 없습니다.</p>
          : <ul className="divide-y divide-line">{data.reports.map((report) => <li key={report.id} className="py-2 text-[12px]">
            <b>{report.onDate} · {report.kindName}{report.subjectName ? ` · ${report.subjectName}` : ''}</b>
            <span className="ml-2 text-fg-subtle">{report.studentNames.join(' · ') || '학생 없음'}</span>
          </li>)}</ul>}
      </Panel>
      <Panel title="정보 변경 감사 이력" sub="누가 · 언제 · 어떻게 바꿨는지 · 최신순. 연락처·인증·권한·급여 값은 공개하지 않습니다.">
        {audit.length === 0 ? <p className="text-[12px] text-fg-subtle">기록된 STAFF 변경 이력이 없습니다.</p>
          : <ol className="divide-y divide-line">{audit.map((event) => <li key={event.id} className="py-3 text-[12px]">
            <div className="flex flex-wrap items-center gap-2"><b>{event.actionLabel}</b><span className="text-fg-subtle">{at(event.at)} · {event.actorName ?? '작성자 미상'}</span></div>
            {event.changes.length ? <ul className="mt-1 pl-4 text-fg-2">{event.changes.map((change) => <li key={change.field}>{change.field}: {change.before ?? '—'} → {change.after ?? '—'}</li>)}</ul> : null}
            {event.privateFields.length ? <p className="mt-1 text-fg-subtle">값 비공개: {event.privateFields.join(' · ')}</p> : null}
          </li>)}</ol>}
        {detail.hasNextPage ? <Button className="mt-3" disabled={detail.isFetchingNextPage} onClick={() => void detail.fetchNextPage()}>
          {detail.isFetchingNextPage ? '이력 불러오는 중…' : '이력 더 보기'}
        </Button> : null}
      </Panel>
    </div> : null}
  </AppShell></RequireAuth>;
}
