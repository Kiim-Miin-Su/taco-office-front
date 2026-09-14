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
import { Banner, Button, PageHeader, TabCards, Tabs } from '@/components/ui';
import { ReportDetailDrawer, type ReportSelection } from '@/components/report/ReportDetailDrawer';
import { ReportDeliveryHistory } from '@/components/report/ReportDeliveryHistory';
import { ReportDeliveryQueue } from '@/components/report/ReportDeliveryQueue';
import { ReportWeeklyTrackingBoundary } from '@/components/report/ReportWeeklyTrackingBoundary';
import { TeacherReportList } from '@/components/report/TeacherReportList';
import { UnwrittenReportBoard } from '@/components/report/UnwrittenReportBoard';
import {
  useMeta, useReportDelivery, useReportDeliveryHistory, useReportReminder, useReports, useUnwritten,
} from '@/api/queries';
import { ApiError } from '@/api/client';
import { positiveQueryId, queryEnum, queryIsoDate } from '@/lib/url-state';
import { useCan } from '@/store/useSession';

type ManagementSection = 'unwritten' | 'delivery' | 'weekly' | 'history';
type TeacherSection = 'list' | 'returned' | 'approval';
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
  const [reminderMessage, setReminderMessage] = useState<ReminderMessage>(null);
  // 응답 유무를 알 수 없는 transport 실패는 같은 요청키로 재시도해 NOTI 중복을 막는다.
  const reminderRequestKeys = useRef(new Map<string, string>());
  const meta = useMeta();
  const unwritten = useUnwritten(undefined, !reviewMode);
  // 머리 배지와 본문이 같은 Query key를 구독한다. 하위 컴포넌트가 다시 불러도 네트워크 요청은 한 벌이다.
  const delivery = useReportDelivery(undefined, !reviewMode);
  const history = useReportDeliveryHistory({}, !reviewMode);
  const approval = useReports({ state: 'wait' }, reviewMode);
  const reminder = useReportReminder();

  useEffect(() => {
    setSection(querySection);
    setSelected(!reviewMode && requestedSerId && requestedOnDate ? { serId: requestedSerId, onDate: requestedOnDate } : null);
    setApprovalSelected(null);
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

  const selectSection = (next: ManagementSection) => {
    setSection(next);
    setSelected(null);
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
          sub="§14 승인 서랍에서 선택한 원본을 검토합니다."
          right={<Button variant="secondary" onClick={leaveApproval}>안 쓴 리포트로 돌아가기</Button>}
        />
      ) : (
        <PageHeader
          title="리포트"
          sub="안 쓴 것 받기 · 어제 것 보내기 · 주간 묶음 만들기"
          right={(
          <TabCards<ManagementSection>
            label="리포트 업무"
            value={section}
            onChange={selectSection}
            options={[
              { value: 'unwritten', label: '안 쓴 리포트', sub: `${unwritten.data?.total ?? 0}건`, badge: unwritten.data?.total },
              { value: 'delivery', label: '어제 보내기', sub: `${delivery.data?.remaining ?? 0}명 남음`, badge: delivery.data?.remaining },
              { value: 'weekly', label: '주간 트래킹', sub: '상세 기준 미확정' },
              { value: 'history', label: '보낸 내역', sub: `${history.data?.total ?? 0}건`, badge: history.data?.total },
            ]}
          />
          )}
        />
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
          onRemind={(teacherId) => void remind(teacherId)}
        />
      ) : section === 'delivery' ? (
        <ReportDeliveryQueue onOpenReport={(report, studentId) => setSelected({ ...report, studentId })} />
      ) : section === 'weekly' ? (
        <ReportWeeklyTrackingBoundary />
      ) : (
        <ReportDeliveryHistory />
      )}

      <ReportDetailDrawer
        selection={reviewMode ? approvalSelected : selected}
        onClose={() => { setSelected(null); setApprovalSelected(null); }}
      />
    </>
  );
}

/** 강사는 전체 강사 추적·독촉·발송을 보지 않고 자기 리포트 작성/반려 목록만 본다. */
function TeacherReports({ requestedSerId, requestedOnDate }: {
  requestedSerId: number | null;
  requestedOnDate: string | null;
}) {
  const [tab, setTab] = useState<TeacherSection>('list');
  const [selected, setSelected] = useState<ReportSelection | null>(null);
  const canApprove = useCan('canApprove');
  const activeTab = tab === 'approval' && !canApprove ? 'list' : tab;
  const unwritten = useUnwritten();
  const returned = useReports({ state: 'rej' }, activeTab === 'returned');
  const approval = useReports({ state: 'wait' }, canApprove && activeTab === 'approval');
  const meta = useMeta();
  const subjectName = useMemo(() => {
    const names = new Map((meta.data?.subs ?? []).map((subject) => [subject.key, subject.name]));
    return (key?: string | null) => (key ? names.get(key) ?? key : '—');
  }, [meta.data]);

  useEffect(() => {
    setSelected(requestedSerId && requestedOnDate ? { serId: requestedSerId, onDate: requestedOnDate } : null);
  }, [requestedOnDate, requestedSerId]);

  const rows = activeTab === 'returned'
    ? returned.data?.items ?? []
    : activeTab === 'approval' ? approval.data?.items ?? [] : unwritten.data?.items ?? [];
  const loading = activeTab === 'returned' ? returned.isLoading : activeTab === 'approval' ? approval.isLoading : unwritten.isLoading;
  const error = activeTab === 'returned' ? returned.isError : activeTab === 'approval' ? approval.isError : unwritten.isError;
  // 권한이 회수되면 effect를 기다리지 않고 열린 타인 리포트를 즉시 감춘다.
  const visibleSelected = activeTab === tab ? selected : null;

  return (
    <>
      <PageHeader title="리포트" sub="내 수업 리포트를 확인하고 작성합니다." />
      <Tabs<TeacherSection>
        className="mb-3"
        value={activeTab}
        onChange={(value) => { setTab(value); setSelected(null); }}
        options={[
          { value: 'list', label: `작성할 것 ${unwritten.data?.total ?? 0}` },
          { value: 'returned', label: '반려됨' },
          ...(canApprove ? [{ value: 'approval' as const, label: '승인 대기' }] : []),
        ]}
      />
      {loading ? <Banner tone="neutral">리포트를 불러오는 중…</Banner>
        : error ? <Banner tone="danger">리포트를 불러오지 못했습니다.</Banner>
          : <TeacherReportList rows={rows} subjectName={subjectName} onOpen={(row) => setSelected(row)} />}
      <ReportDetailDrawer selection={visibleSelected} onClose={() => setSelected(null)} />
    </>
  );
}
