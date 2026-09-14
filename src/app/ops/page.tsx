/** @file-guide
 * 목적: page.tsx — OpsPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 탭 10 운영 — §59 마케팅 · §60 대표 피드백 · §61 기획 · §62 기획 기한 · §65 기획 보고서 ·
 * §63 회의 · §66 회의 상세 · §64 할 일 · §67 컴플레인.
 * 집행 비용은 대표만 봅니다 (D-R39) — 서버가 null 로 내려줍니다.
 *
 * 원문 §59·§60 은 「마케팅」 안의 **속 갈래**(트래킹 · 대표 피드백 · 회의 속기록)입니다.
 * 여기서는 트래킹과 대표 피드백 둘을 그 자리에 두었습니다 — 회의 속기록은 「회의」 갈래입니다.
 */
'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Board, BoardColumn, Button, Chip, Column, PageHeader, Panel, Segmented, StatCard, Table, Tabs } from '@/components/ui';
import { useMeta, useOps } from '@/api/queries';
import { useSession } from '@/store/useSession';
import { MarketingFeedback } from '@/components/ops/MarketingFeedback';
import { PlanReport } from '@/components/ops/PlanReport';
import { MeetingDetail } from '@/components/ops/MeetingDetail';
import type { Complaint, Marketing, Meeting, Plan, PlanDueRow as PlanDue, Todo } from '@/api/types';
import { won } from '@/lib/money';
import { positiveQueryId, queryEnum } from '@/lib/url-state';

type Tab = 'todo' | 'complaint' | 'plan' | 'meeting' | 'mkt';

const AREA: Record<string, string> = { lesson: '수업', intake: '상담', book: '교재', schedule: '스케줄', teacher: '선생님' };
const SRC: Record<string, string> = { meeting: '회의', complaint: '컴플레인', consulting: '컨설팅', plan: '기획', manual: '직접' };
/**
 * 단계의 **색**만 여기서 고른다 — 이름은 서버가 준 `stageLabel` 이다 (D-R18 · C56).
 * 한동안 이 배열이 이름까지 들고 있었고, §62 기한 표와 §65 보고서가 생기면서
 * 같은 낱말을 세 곳에서 적을 뻔했다.
 */
const PLAN_STAGE: Array<{ key: string; tone: 'neutral' | 'info' | 'danger' | 'success' | 'purple' }> = [
  { key: 'draft', tone: 'neutral' },
  { key: 'review', tone: 'info' },
  { key: 'rework', tone: 'danger' },
  { key: 'approved', tone: 'success' },
  { key: 'done', tone: 'purple' },
];
const planTone = (stage: string) => PLAN_STAGE.find((s) => s.key === stage)?.tone ?? 'neutral';
const CPL_STAGE: Array<{ key: string; label: string; tone: 'danger' | 'warning' | 'success' }> = [
  { key: 'received', label: '접수', tone: 'danger' },
  { key: 'acting', label: '대응', tone: 'warning' },
  { key: 'closed', label: '결과', tone: 'success' },
];

export default function OpsPage() {
  const searchParams = useSearchParams();
  const queryTab = queryEnum(searchParams.get('tab'), ['todo', 'complaint', 'plan', 'meeting', 'mkt'] as const) ?? 'todo';
  const queryPlanId = queryTab === 'plan' ? positiveQueryId(searchParams.get('plan')) : null;
  const queryRequestId = queryTab === 'todo' ? positiveQueryId(searchParams.get('request')) : null;
  const [tab, setTab] = useState<Tab>(queryTab);
  // 원문 §59·§60 의 속 갈래 — 「트래킹 / 대표 피드백」
  const [mktTab, setMktTab] = useState<'track' | 'fb'>('track');
  // 원문 §61·§62 의 속 갈래 — 「단계 보드 / 기한」
  const [planTab, setPlanTab] = useState<'board' | 'due'>('board');
  const [planId, setPlanId] = useState<number | null>(queryPlanId);
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const viewerId = useSession((s) => s.me?.id ?? null);
  const q = useOps();
  const d = q.data;
  // 할 일 배정의 담당자 목록 — 창을 열 때만 필요하다
  const meta = useMeta(meetingId !== null);

  useEffect(() => {
    setTab(queryTab);
    setPlanId(queryPlanId);
  }, [queryPlanId, queryTab]);

  const todoCols: Array<Column<Todo>> = [
    { key: 'done', head: '', width: 40, align: 'center',
      cell: (r) => <span className={r.done ? 'text-green' : 'text-line-2'}>{r.done ? '●' : '○'}</span> },
    { key: 't', head: '할 일', cell: (r) => <span className={r.done ? 'text-fg-subtle line-through' : 'font-bold'}>{r.title}</span> },
    { key: 'src', head: '출처', width: 90, cell: (r) => <Chip>{SRC[r.src] ?? r.src}</Chip> },
    { key: 'to', head: '담당', width: 90, cell: (r) => r.toName ?? '—' },
    { key: 'due', head: '기한', width: 110,
      cell: (r) => r.overdueDays > 0
        ? <Chip tone="danger">{r.overdueDays}일 지남</Chip>
        : <span className={r.done ? 'text-fg-subtle' : ''}>{r.dueOn ?? '—'}</span> },
  ];

  const meetingCols: Array<Column<Meeting>> = [
    // 낱말은 서버가 만든다 — 한동안 이 칩이 「general」 「plan」을 그대로 찍고 있었다 (D-R18 · C57)
    { key: 'k', head: '종류', width: 110, cell: (r) => <Chip tone="info">{r.mtTypeLabel}</Chip> },
    { key: 't', head: '제목', cell: (r) => <span className="font-bold">{r.title ?? '—'}</span> },
    { key: 'd', head: '일시', width: 110, cell: (r) => r.onDate ?? '—' },
    { key: 'a', head: '참석', width: 100,
      cell: (r) => <span className={r.confirmed < r.attendees ? 'text-amber' : 'text-green'}>{r.confirmed}/{r.attendees}</span> },
    { key: 'm', head: '속기록', width: 100,
      cell: (r) => r.hasMinutes ? <Chip tone="success">작성 완료</Chip> : <Chip tone="danger">미작성</Chip> },
    { key: 'x', head: '', width: 70,
      cell: (r) => <Button size="sm" variant="secondary" onClick={() => setMeetingId(r.id)}>열기</Button> },
  ];

  const mktCols: Array<Column<Marketing>> = [
    // 낱말은 서버가 만든다 — 한동안 이 표는 「instagram」 「ad」를 그대로 찍고 있었다 (D-R18 · C53)
    { key: 'n', head: '활동', cell: (r) => <span className="font-bold">{r.name}</span> },
    { key: 'c', head: '채널', width: 110, cell: (r) => <Chip>{r.channelLabel}</Chip> },
    { key: 'i', head: '항목', width: 100, cell: (r) => r.itemLabel },
    { key: 'b', head: '담당', width: 90, cell: (r) => r.byName ?? '—' },
    { key: 'im', head: '노출', width: 100, align: 'right', cell: (r) => won(r.impressions, { unit: false, empty: '—' }) },
    { key: 'iq', head: '문의', width: 80, align: 'right', cell: (r) => r.inquiries ?? '—' },
    { key: 'e', head: '등록', width: 80, align: 'right',
      cell: (r) => <span className={r.enrolled ? 'font-bold text-green' : 'text-fg-subtle'}>{r.enrolled}</span> },
    { key: 'co', head: '비용', width: 110, align: 'right',
      cell: (r) => (r.cost ?? null) === null
        ? <span className="text-[11px] text-fg-subtle">가려짐</span>
        : won(r.cost as number) },
    { key: 'cpe', head: '등록당', width: 120, align: 'right',
      cell: (r) => {
        const c = r.costPerEnroll ?? null;
        if (c === null) return <span className="text-[11px] text-fg-subtle">{(r.cost ?? null) === null ? '가려짐' : '—'}</span>;
        return <span className={c > 100000 ? 'font-bold text-red' : 'font-bold'}>{won(c)}</span>;
      } },
  ];

  /*
   * 칸 이름은 **줄에서 빌려 오지 않는다.** 전에는 `items[0]?.stageLabel ?? s.key` 였고,
   * 그래서 **줄이 하나도 없는 칸은 빌려 올 데가 없어 코드값 `done` 을 그대로 찍었다** —
   * 나머지 넷은 줄이 있어서 우연히 맞았을 뿐이다. 낱말은 데이터가 아니라 어휘라
   * 서버가 `planStages` 로 따로 준다 (D-R18).
   */
  const stageLabel = (key: string) => d?.planStages.find((v) => v.key === key)?.label ?? key;
  const planCols: Array<BoardColumn<Plan>> = PLAN_STAGE.map((s) => ({
    key: s.key,
    label: stageLabel(s.key),
    tone: s.tone,
    items: (d?.plans ?? []).filter((p) => p.stage === s.key),
  }));
  /** §62 기획 기한 — 「남은 날」도 「구분」도 서버가 만든 낱말이다 (D-R18 · D-R37) */
  const dueCols: Array<Column<PlanDue>> = [
    { key: 'd', head: '기한', width: 90, cell: (r) => r.dueOn.slice(5) },
    { key: 'l', head: '남은 날', width: 100, align: 'right',
      cell: (r) => <span className={r.overdueDays > 0 ? 'font-bold text-red' : 'font-bold'}>{r.dueLabel}</span> },
    { key: 'k', head: '구분', width: 100, cell: (r) => <Chip tone={r.kind === 'plan' ? 'neutral' : 'info'}>{r.kindLabel}</Chip> },
    { key: 't', head: '내용', cell: (r) => <span className="font-bold">{r.title}</span> },
    { key: 'p', head: '기획', width: 180, cell: (r) => <span className="text-fg-subtle">{r.planTitle}</span> },
    { key: 'o', head: '담당', width: 90, cell: (r) => r.ownerName ?? '—' },
    { key: 's', head: '단계', width: 110, cell: (r) => <Chip tone={planTone(r.stage)}>{r.stageLabel}</Chip> },
    { key: 'x', head: '', width: 70,
      cell: (r) => <Button size="sm" variant="secondary" onClick={() => setPlanId(r.planId)}>열기</Button> },
  ];

  const cplCols: Array<BoardColumn<Complaint>> = CPL_STAGE.map((s) => ({
    key: s.key, label: s.label, tone: s.tone, items: (d?.complaints ?? []).filter((c) => c.stage === s.key),
  }));

  const openTodos = (d?.todos ?? []).filter((t) => !t.done);
  return (
    <RequireAuth><AppShell drawerEntry={queryRequestId ? { pane: 'approvals', identity: `request-${queryRequestId}` } : null}>
      <PageHeader title="운영" sub="마케팅 · 기획 · 회의 · 할 일 · 컴플레인. 회의에서 배정된 할 일도 여기로 모입니다." />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <StatCard label="열린 할 일" value={openTodos.length}
          /* 「기한 지난 것」만 적으면 바로 밑 §62 띠의 「기한 지난 것 N건」(기획)과 **같은 말이 두 숫자**가 된다 */
          note={`기한 지난 할 일 ${openTodos.filter((t) => t.overdueDays > 0).length}건`}
          tone={openTodos.some((t) => t.overdueDays > 0) ? 'danger' : 'neutral'} />
        <StatCard label="접수 컴플레인" value={(d?.complaints ?? []).filter((c) => c.stage === 'received').length}
          note="24시간 넘으면 대표 피드백으로" tone="danger" />
        <StatCard label="검토 대기 기획" value={(d?.plans ?? []).filter((p) => p.stage === 'review').length} tone="info" />
        <StatCard label="속기록 미작성" value={(d?.meetings ?? []).filter((m) => !m.hasMinutes).length}
          note="안 쓰면 회의가 끝난 것이 아닙니다" tone="warning" />
      </div>

      <Tabs className="mb-3" value={tab} onChange={setTab} options={[
        { value: 'todo', label: `할 일 ${d?.todos.length ?? 0}` },
        { value: 'complaint', label: `컴플레인 ${d?.complaints.length ?? 0}` },
        { value: 'plan', label: `기획 ${d?.plans.length ?? 0}` },
        { value: 'meeting', label: `회의 ${d?.meetings.length ?? 0}` },
        { value: 'mkt', label: `마케팅 ${d?.marketing.length ?? 0}${d?.feedbackNeedsFix ? ` · 피드백 ${d.feedbackNeedsFix}` : ''}` },
      ]} />

      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner>
        : q.isError ? <Banner tone="danger">운영 탭은 매니저 이상만 볼 수 있습니다.</Banner>
        : tab === 'todo' ? <Table columns={todoCols} rows={d?.todos ?? []} rowKey={(r) => r.id} />
        : tab === 'meeting' ? <Table columns={meetingCols} rows={d?.meetings ?? []} rowKey={(r) => r.id} />
        : tab === 'mkt' ? (
          <>
            <Segmented
              className="mb-3"
              value={mktTab}
              onChange={setMktTab}
              options={[
                { value: 'track', label: `트래킹 ${d?.marketing.length ?? 0}` },
                { value: 'fb', label: `대표 피드백 ${d?.feedback.length ?? 0}` },
              ]}
            />
            {mktTab === 'fb' ? (
              <MarketingFeedback
                threads={d?.feedback ?? []}
                needsFix={d?.feedbackNeedsFix ?? 0}
                canComment={d?.canComment === true}
                viewerId={viewerId}
                marketing={d?.marketing ?? []}
              />
            ) : (
              <>
                <Table columns={mktCols} rows={d?.marketing ?? []} rowKey={(r) => r.id} />
                {d && !d.canSeeAmounts ? (
                  <Banner tone="warning" className="mt-3">집행 비용과 등록당 비용은 <b>대표만</b> 봅니다 (D-R39).</Banner>
                ) : null}
              </>
            )}
          </>
        )
        : tab === 'plan' ? (
          <>
            <Segmented
              className="mb-3"
              value={planTab}
              onChange={setPlanTab}
              options={[
                { value: 'board', label: `단계 보드 ${d?.plans.length ?? 0}` },
                { value: 'due', label: `기한 ${d?.planDues.length ?? 0}` },
              ]}
            />
            {planTab === 'due' ? (
              <>
                {/* 원문 §62 머리 띠 — 숫자는 서버가 센다 (D-R37) */}
                <Banner tone={d?.planOverdue ? 'danger' : 'neutral'} className="mb-3">
                  <b>기한 지난 것 {d?.planOverdue ?? 0}건</b>
                  <span className="ml-2 text-[12px] text-fg-2">대표는 기한을 봅니다 · 지나면 붉게 나옵니다</span>
                </Banner>
                <Table columns={dueCols} rows={d?.planDues ?? []} rowKey={(r) => r.key}
                  empty="기한이 걸린 기획이 없습니다" />
              </>
            ) : (
              <Board columns={planCols} itemKey={(p) => p.id} renderCard={(p) => (
                <button type="button" className="block w-full text-left" onClick={() => setPlanId(p.id)}>
                  <div className="text-[12px] font-bold text-fg">{p.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="text-[10px] text-fg-subtle">{p.ownerName ?? '—'}</span>
                    {/* 기한이 대표를 지나왔는지는 서버가 판정한다 (원문 §61·§65) */}
                    {p.dueState === 'proposed' ? <Chip tone="warning">기한 제안</Chip> : null}
                    {p.overdueDays > 0
                      ? <Chip tone="danger">{p.overdueDays}일 지남</Chip>
                      : <span className="text-[10px] text-fg-subtle">{p.dueOn ?? ''}</span>}
                  </div>
                </button>
              )} />
            )}
          </>
        ) : (
          <Board columns={cplCols} itemKey={(c) => c.id} renderCard={(c) => (
            <>
              <Chip tone="purple">{AREA[c.area] ?? c.area}</Chip>
              <div className="mt-1.5 text-[12px] font-bold text-fg">{c.body}</div>
              <div className="mt-1 text-[10.5px] text-fg-subtle">{c.studentName ?? '문의자'} · {c.ageDays}일</div>
              {c.action ? <div className="mt-1 text-[10px] text-fg-2">{c.result ?? c.action}</div> : null}
            </>
          )} />
        )}

      <Panel className="mt-4" title="여기 모이는 이유">
        <p className="text-[12px] leading-relaxed text-fg-2">
          회의에서 나온 할 일, 컴플레인에서 나온 할 일, 기획 과제가 각각 다른 목록에 있으면
          담당자는 세 곳을 봐야 합니다. 출처를 표시해서 <b>한 목록</b>으로 모읍니다.
        </p>
      </Panel>
      <PlanReport planId={planId} onClose={() => setPlanId(null)} />
      <MeetingDetail meetingId={meetingId} staff={meta.data?.staff} onClose={() => setMeetingId(null)} />
    </AppShell></RequireAuth>
  );
}
