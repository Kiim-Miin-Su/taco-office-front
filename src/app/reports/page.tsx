/** @file-guide
 * 목적: 개발명세서 §47~§50 리포트 route를 역할별로 조립한다.
 * 책임/재사용: 관리자 화면은 공용 TabCards/UnwrittenReportBoard와 서버 projection을, 강사 화면은 개인 작성 목록을 재사용한다. 권한·상태·집계를 재정의하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, PageHeader, TabCards, cn } from '@/components/ui';
import { ReportDetailDrawer, ReportDetailPane, type ReportSelection } from '@/components/report/ReportDetailDrawer';
import { ReportDeliveryHistory } from '@/components/report/ReportDeliveryHistory';
import { ReportDeliveryQueue } from '@/components/report/ReportDeliveryQueue';
import { ReportFullTextDialog } from '@/components/report/ReportFullTextDialog';
import { ReportWeekly } from '@/components/report/ReportWeekly';
import { TeacherReportList } from '@/components/report/TeacherReportList';
import { LateReportPolicy } from '@/components/teacher/LateReportPolicy';
import { ScreenHeader } from '@/components/teacher/ScreenHeader';
import { UnwrittenReportBoard } from '@/components/report/UnwrittenReportBoard';
import {
  useMeta, useReportDelivery, useReportDeliveryHistory, useReportReminder, useReportWeekly, useReports, useUnwritten,
} from '@/api/queries';
import { ApiError } from '@/api/client';
import type { ReportDeliveryStudent } from '@/api/types';
import { subjectColor } from '@/lib/tokens';
import { positiveQueryId, queryEnum, queryIsoDate } from '@/lib/url-state';
import { useCan, useSession } from '@/store/useSession';

type ManagementSection = 'unwritten' | 'delivery' | 'weekly' | 'history';
type ReminderMessage = { tone: 'success' | 'danger'; text: string } | null;

function managementSection(value: string | null, allowed: boolean): ManagementSection {
  return allowed
    ? queryEnum(value, ['unwritten', 'delivery', 'weekly', 'history'] as const) ?? 'unwritten'
    : 'unwritten';
}

export default function ReportsPage() {
  const canManage = useCan('canCrudAll');
  const searchParams = useSearchParams();
  const requestedSerId = positiveQueryId(searchParams.get('serId'));
  const requestedOnDate = queryIsoDate(searchParams.get('onDate'));
  return (
    <RequireAuth><AppShell>
      {canManage
        ? <ManagementReports />
        : <TeacherReports requestedSerId={requestedSerId} requestedOnDate={requestedOnDate} />}
    </AppShell></RequireAuth>
  );
}

/** §47~§50 — 대표/관리자/매니저의 같은 capability 화면. 역할 문자열은 보지 않는다. */
function ManagementReports() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canApprove = useCan('canApprove');
  const reviewMode = canApprove && searchParams.get('review') === 'approval';
  const requestedSerId = positiveQueryId(searchParams.get('serId'));
  const requestedOnDate = queryIsoDate(searchParams.get('onDate'));
  const querySection = managementSection(searchParams.get('section'), true);
  const [section, setSection] = useState<ManagementSection>(querySection);
  const [selected, setSelected] = useState<ReportSelection | null>(null);
  const [approvalSelected, setApprovalSelected] = useState<ReportSelection | null>(null);
  // §50 「리포트 전문」 창 — 어제 보내기 학생 카드의 하루 묶음(큐가 가진 같은 스냅숏)을 그대로 싣는다
  const [fullText, setFullText] = useState<ReportDeliveryStudent | null>(null);
  const [reminderMessage, setReminderMessage] = useState<ReminderMessage>(null);
  // 응답 유무를 알 수 없는 transport 실패는 같은 요청키로 재시도해 NOTI 중복을 막는다.
  const reminderRequestKeys = useRef(new Map<string, string>());
  const meta = useMeta();
  const unwritten = useUnwritten(undefined, !reviewMode);
  // 머리 배지와 본문이 같은 Query key를 구독한다. 하위 컴포넌트가 다시 불러도 네트워크 요청은 한 벌이다.
  const delivery = useReportDelivery(undefined, !reviewMode);
  // 「보낸 내역」 본문이 주별 묶음으로 여는 같은 key 를 머리도 구독한다 — 요청은 한 벌이다
  const history = useReportDeliveryHistory({ span: 'week' }, !reviewMode);
  // 「주간 트래킹 · N명 남음」(원문 §47 탭 머리 · N-54) — 본문이 기본 주로 여는 같은 key 를 머리도 구독한다
  const weekly = useReportWeekly(undefined, !reviewMode);
  const approval = useReports({ state: 'wait' }, reviewMode);
  const reminder = useReportReminder();

  useEffect(() => {
    setSection(querySection);
    setSelected(!reviewMode && requestedSerId && requestedOnDate ? { serId: requestedSerId, onDate: requestedOnDate } : null);
    setApprovalSelected(null);
    setFullText(null);
  }, [querySection, requestedOnDate, requestedSerId, reviewMode]);

  // §14 서랍의 원본 행 이동. 응답에 실제로 있는 회차만 열어 stale URL을 무시한다.
  useEffect(() => {
    if (!reviewMode || !requestedSerId || !requestedOnDate) return;
    const target = approval.data?.items.find((item) => item.serId === requestedSerId && item.onDate === requestedOnDate);
    if (target) setApprovalSelected(target);
  }, [approval.data?.items, requestedOnDate, requestedSerId, reviewMode]);

  const subjectName = useMemo(() => {
    const names = new Map((meta.data?.subs ?? []).map((subject) => [subject.key, subject.name]));
    return (key?: string | null) => (key ? names.get(key) ?? key : '—');
  }, [meta.data]);
  // §47 과목색 — 공용 subjectColor 한 곳 (g5 47-04)
  const subjectColorOf = useMemo(() => {
    const codes = new Map((meta.data?.subs ?? []).map((subject) => [subject.key, subject]));
    return (key?: string | null) => subjectColor(key, codes);
  }, [meta.data]);

  const selectSection = (next: ManagementSection) => {
    setSection(next);
    setSelected(null);
    setFullText(null);
    setReminderMessage(null);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'unwritten') params.delete('section'); else params.set('section', next);
    const query = params.toString();
    router.replace(query ? `/reports?${query}` : '/reports', { scroll: false });
  };

  const leaveApproval = () => {
    setApprovalSelected(null);
    router.replace('/reports', { scroll: false });
  };

  const remind = async (teacherId?: number) => {
    setReminderMessage(null);
    const scope = teacherId ? `teacher:${teacherId}` : 'all';
    const requestKey = reminderRequestKeys.current.get(scope) ?? crypto.randomUUID();
    reminderRequestKeys.current.set(scope, requestKey);
    try {
      const result = await reminder.mutateAsync({
        requestKey,
        ...(teacherId ? { teacherId } : {}),
      });
      reminderRequestKeys.current.delete(scope);
      setReminderMessage({
        tone: 'success',
        text: result.items.length
          ? `${result.items.length}명에게 앱 안 작성 독촉을 남겼습니다.`
          : '현재 독촉할 리포트가 없습니다.',
      });
    } catch (error) {
      // 4xx/5xx는 서버가 답했으므로 다음 사용자 행위는 새 논리 요청이다.
      if (error instanceof ApiError && error.status > 0) reminderRequestKeys.current.delete(scope);
      setReminderMessage({ tone: 'danger', text: '최신 리포트 상태를 확인한 뒤 다시 시도해 주세요.' });
    }
  };

  return (
    <>
      {reviewMode ? (
        <PageHeader
          title="리포트 승인 대기"
          sub="승인 서랍에서 고른 리포트를 검토합니다."
          right={<Button variant="secondary" onClick={leaveApproval}>안 쓴 리포트로 돌아가기</Button>}
        />
      ) : (
        // 원문 §47 — 탭 카드 넷이 제목 블록 **바로 오른쪽**(교재·안내 화면과 같은 배치 · g5 47-02)
        <div className="mb-4 flex flex-wrap items-start gap-4">
          <div className="min-w-[220px]">
            <h1 className="text-[20px] font-bold text-fg">리포트</h1>
            <p className="mt-1 text-[12px] text-fg-subtle">안 쓴 것 받기 · 어제 것 보내기 · 주간 묶음 만들기</p>
          </div>
          <TabCards<ManagementSection>
            label="리포트 업무"
            value={section}
            onChange={selectSection}
            options={[
              { value: 'unwritten', label: '안 쓴 리포트', sub: `${unwritten.data?.total ?? 0}건`, badge: unwritten.data?.total },
              { value: 'delivery', label: '어제 보내기', sub: `${delivery.data?.remaining ?? 0}명 남음`, badge: delivery.data?.remaining },
              { value: 'weekly', label: '주간 트래킹', sub: `${weekly.data?.remaining ?? 0}명 남음`, badge: weekly.data?.remaining },
              // 원문 「보낸 내역」 탭 카드에는 배지가 없다 — 할 일이 아니라 기록이다 (g5 48-06)
              { value: 'history', label: '보낸 내역', sub: `${history.data?.total ?? 0}건` },
            ]}
          />
        </div>
      )}

      {reviewMode ? (
        approval.isLoading ? <Banner tone="neutral">승인 대기 리포트를 불러오는 중…</Banner>
          : approval.isError ? <Banner tone="danger">승인 대기 리포트를 불러오지 못했습니다.</Banner>
            : <TeacherReportList rows={approval.data?.items ?? []} subjectName={subjectName} onOpen={(row) => setApprovalSelected(row)} />
      ) : section === 'unwritten' ? (
        <UnwrittenReportBoard
          data={unwritten.data}
          isLoading={unwritten.isLoading}
          isError={unwritten.isError}
          canRemind
          reminderPending={reminder.isPending}
          reminderMessage={reminderMessage}
          subjectName={subjectName}
          subjectColorOf={subjectColorOf}
          onRemind={(teacherId) => void remind(teacherId)}
        />
      ) : section === 'delivery' ? (
        <ReportDeliveryQueue
          subjectColorOf={subjectColorOf}
          // G-68 「강사별 독촉 버튼」 — 「안 쓴 리포트」와 같은 독촉 쓰기 · 같은 서버 집합(조치할 리포트가 있는 강사)
          remind={{
            teacherIds: new Set((unwritten.data?.byTeacher ?? []).map((t) => t.teacherId)),
            pending: reminder.isPending,
            message: reminderMessage,
            onRemind: (teacherId) => void remind(teacherId),
          }}
          // 학생 카드 「전문 보기」는 원본 §50 의 전문 창(그 학생의 하루 묶음), 미승인 줄은 검토 서랍 — 둘은 동시에 열리지 않는다
          onOpenStudent={(group) => {
            setSelected(null);
            setFullText(group);
          }}
          onOpenReport={(report, studentId) => {
            setFullText(null);
            setSelected({ ...report, studentId });
          }}
        />
      ) : section === 'weekly' ? (
        <ReportWeekly
          onOpenReport={(lesson, studentId) => {
            setFullText(null);
            setSelected({ serId: lesson.serId, onDate: lesson.onDate, studentId });
          }}
        />
      ) : (
        <ReportDeliveryHistory />
      )}

      <ReportDetailDrawer
        selection={reviewMode ? approvalSelected : selected}
        onClose={() => { setSelected(null); setApprovalSelected(null); }}
      />
      <ReportFullTextDialog
        group={!reviewMode && section === 'delivery' ? fullText : null}
        subjectColorOf={subjectColorOf}
        onClose={() => setFullText(null)}
      />
    </>
  );
}

const listStatus = (query: { isLoading: boolean; isError: boolean }) =>
  query.isLoading ? 'loading' as const : query.isError ? 'error' as const : null;

/**
 * 강사는 전체 강사 추적·독촉·발송을 보지 않고 자기 리포트만 본다.
 * 강사 덱 slide 18·19 「리포트 — 전체 화면」 — 왼쪽에 상태별 목록 둘(「아직 안 쓴 리포트」 · 「작성한 리포트」), 오른쪽에 작성 양식(7-3 ④).
 * 좁은 화면에서는 목록과 작성 칸이 한 번에 하나씩 선다(고르면 작성 칸 · 「‹ 목록」으로 돌아감). 조회 · 쓰기 · 권한은 서버 그대로다.
 */
function TeacherReports({ requestedSerId, requestedOnDate }: {
  requestedSerId: number | null;
  requestedOnDate: string | null;
}) {
  const [selected, setSelected] = useState<ReportSelection | null>(null);
  const me = useSession((s) => s.me);
  const canApprove = useCan('canApprove');
  // 「아직 안 쓴 리포트」 = 서버 §47 조치 목록(미작성 · 작성 중 · 반려) — 반려도 여기서 다시 쓴다(원문 두 목록)
  const unwritten = useUnwritten();
  // 「작성한 리포트」 — 승인 대기 · 승인 두 상태를 서버가 각각 걸러 준다(화면이 상태를 다시 판정하지 않는다).
  // 내 것만 — 승인 예외 권한(canApprove)이 있으면 서버가 대기 목록을 전건으로 넓히므로 작성자를 요청 조건에 싣는다
  const waiting = useReports({ state: 'wait', teacherId: me?.id }, me !== null);
  const approved = useReports({ state: 'ok', teacherId: me?.id }, me !== null);
  // 승인 예외 권한이 있는 강사만 — 남의 승인 대기(검토 목록 · 서버 전건)
  const approval = useReports({ state: 'wait' }, canApprove);
  const meta = useMeta();
  const subjectName = useMemo(() => {
    const names = new Map((meta.data?.subs ?? []).map((subject) => [subject.key, subject.name]));
    return (key?: string | null) => (key ? names.get(key) ?? key : '—');
  }, [meta.data]);

  useEffect(() => {
    setSelected(requestedSerId && requestedOnDate ? { serId: requestedSerId, onDate: requestedOnDate } : null);
  }, [requestedOnDate, requestedSerId]);

  // 작성한 리포트 — 새 수업 먼저(덱 목록 차례). 두 서버 목록을 합칠 뿐 거르지 않는다
  const written = useMemo(() => [...(waiting.data?.items ?? []), ...(approved.data?.items ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startMin ?? -1) - (a.startMin ?? -1)), [waiting.data, approved.data]);
  const open = (row: ReportSelection) => setSelected({ serId: row.serId, onDate: row.onDate });

  return (
    <>
      {/* 강사 정책은 화면 최상단 (대표 결정 2026-09-25) — 강사로 로그인했을 때만 그린다 */}
      <LateReportPolicy className="mb-3" />
      {/* 화면 이름 「리포트」는 강사 셸 머리줄 한 곳 — 관리 화면 셸(승인 예외 등)에서는 h1 이 그대로 선다 */}
      <ScreenHeader title="리포트" sub="내 수업 리포트를 확인하고 작성합니다." />
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-start">
        <div className={cn('flex-col gap-3', selected ? 'hidden lg:flex' : 'flex')}>
          <TeacherReportList grouped rows={unwritten.data?.items ?? []} subjectName={subjectName} onOpen={open}
            head={{ title: '아직 안 쓴 리포트', tone: 'danger', count: unwritten.data?.total }}
            selected={selected} status={listStatus(unwritten)} />
          <TeacherReportList grouped rows={written} subjectName={subjectName} onOpen={open}
            head={{ title: '작성한 리포트', tone: 'dark' }}
            selected={selected} status={listStatus({ isLoading: waiting.isLoading || approved.isLoading, isError: waiting.isError || approved.isError })} />
          {canApprove ? (
            <TeacherReportList grouped rows={approval.data?.items ?? []} subjectName={subjectName} onOpen={open}
              head={{ title: '승인 대기', tone: 'info' }} selected={selected} status={listStatus(approval)} />
          ) : null}
        </div>
        <div className={cn(selected ? 'block' : 'hidden lg:block')}>
          {selected ? (
            <ReportDetailPane key={`${selected.serId}:${selected.onDate}`} selection={selected} onBack={() => setSelected(null)} />
          ) : (
            <p className="rounded-xl border border-dashed border-line bg-card px-4 py-16 text-center text-[12.5px] text-fg-subtle">
              왼쪽 목록에서 리포트를 고르면 여기에 작성 양식이 열립니다.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
