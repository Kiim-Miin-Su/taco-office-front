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
import { Banner, Board, BoardColumn, Button, Chip, ChipRow, Column, PageHeader, Panel, Segmented, StatCard, TabCards, Table } from '@/components/ui';
import { useDrawerWrite, useMeta, useOps } from '@/api/queries';
import { useSession } from '@/store/useSession';
import { MarketingFeedback } from '@/components/ops/MarketingFeedback';
import { PlanReport } from '@/components/ops/PlanReport';
import { MeetingDetail } from '@/components/ops/MeetingDetail';
import { ComplaintCreateButton } from '@/components/ops/ComplaintForm';
import { ComplaintDetail } from '@/components/ops/ComplaintDetail';
import { TeacherChangeWizard, type TeacherChangePreset } from '@/components/ops/TeacherChangeWizard';
import { MeetingCreateButton } from '@/components/ops/MeetingCreateDialog';
import { PlanCreateButton } from '@/components/ops/PlanCreateDialog';
import { TodoCreateDialog } from '@/components/drawer/TodoCreateDialog';
import { StudentWithdrawDialog } from '@/components/lesson/StudentWithdrawDialog';
import type { Complaint, Marketing, Meeting, Plan, PlanDueRow as PlanDue, Todo } from '@/api/types';
import { won } from '@/lib/money';
import { positiveQueryId, queryEnum } from '@/lib/url-state';
import { hhmm, step, summaryBoundsOf, todayKst, unavailableLines } from '@/lib/calendar';

type Tab = 'todo' | 'complaint' | 'plan' | 'meeting' | 'mkt';

/**
 * §64 탭 카드 한 장 — 아래 한 줄이 **건수가 아니라 설명**이라(원문 그대로) 동그라미의 수가
 * 이름에 안 남는다. `badgeSr` 로 글자를 한 번 더 준다.
 */
const opsTab = (value: Tab, label: string, sub: string, n: number) =>
  ({ value, label, sub, badge: n, badgeSr: n > 0 ? `${n}건` : undefined });
/**
 * 컷 §63 의 「일간 주간 월간 전체」 (C96).
 *
 * 「전체」가 기본이다 — 기간을 안 고르면 지금까지처럼 전부 받는다. 날짜 계산은 달력이 이미 갖고 있는
 * `summaryBoundsOf`·`step` 을 그대로 쓴다(월간은 격자가 아니라 **그 달**이다 · N-19).
 * **기간의 낱말은 서버가 만든다**(`range.label` · D-R18) — 화면이 「2026년 9월」을 짓지 않는다.
 */
type Period = 'all' | 'day' | 'week' | 'month';

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
/**
 * 컴플레인 단계의 **색**만 여기서 고른다 — 이름과 한 줄은 서버가 준 `cplStages` 다 (C86-d).
 * 한동안 이 배열이 이름까지 들고 있었고, 저장되는 말이 `received|acting|closed` 인데
 * DBML·entity 주석은 「open|acting|done」이라 적어 두어 **대표 보고 배지가 전부를 세고 있었다.**
 */
const CPL_TONE: Record<string, 'danger' | 'warning' | 'success'> = {
  received: 'danger', acting: 'warning', closed: 'success',
};

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
  // §67 카드 처리 창 · 강사 교체 마법사 (C93) — 컴플레인에서 열면 학생·건을 미리 채운다
  const [cplId, setCplId] = useState<number | null>(null);
  const [wizard, setWizard] = useState<TeacherChangePreset | null>(null);
  // 컴플레인 → 수강 종료·환불 (J-99) — C94-c 창을 그대로 연다. 사유에 컴플레인을 적어 잇는다(cplId 칸은 N-135 ①)
  const [withdrawOf, setWithdrawOf] = useState<Complaint | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* 컷 §63 의 기간 토글 — 기본은 「전체」다(지금 동작을 안 바꾼다 · C96) */
  const [period, setPeriod] = useState<Period>('all');
  const [anchor, setAnchor] = useState(todayKst);
  /* §67 갈래는 **서버로 간다**(J-102 — 건수도 목록도 서버가 자른다). 나머지 칩 둘은 받은 목록에서 거른다(§24 FQ) */
  const [area, setArea] = useState('');
  const [mtType, setMtType] = useState('');
  const [todoOwner, setTodoOwner] = useState('');
  const [todoOpen, setTodoOpen] = useState(false);
  const viewerId = useSession((s) => s.me?.id ?? null);
  const bounds = period === 'all' ? null : summaryBoundsOf(period, anchor);
  const q = useOps({ ...(bounds ?? {}), ...(area ? { area } : {}) });
  const d = q.data;
  // 할 일 배정의 담당자 목록 — 창을 열 때만 필요하다. 「+ 할 일 주기」도 같은 목록을 쓴다 (C96)
  const meta = useMeta(meetingId !== null || todoOpen);
  // 「+ 할 일 주기」는 **새 경로가 아니다** — 서랍이 쓰는 `POST /drawer/todos` 를 그대로 부른다 (C76 · C96)
  const todoWrite = useDrawerWrite();

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
    /*
     * 컷 §63 의 「26년 9월 18일 금요일 11:00–12:00」 — 시각은 **이어진 회차**에서 온다 (C96).
     * 옛 회의는 이어진 회차가 없어 시각이 없다. 지어내지 않고 **없다고 적는다** (N-25).
     */
    { key: 'd', head: '일시', width: 150,
      cell: (r) => r.onDate === null || r.onDate === undefined ? '—' : (
        <span className="whitespace-nowrap">
          {r.onDate}
          {r.startMin == null || r.endMin == null
            ? <span className="ml-1 text-[10.5px] text-fg-subtle">시각 없음</span>
            : <span className="ml-1 font-bold">{hhmm(r.startMin)}–{hhmm(r.endMin)}</span>}
        </span>
      ) },
    /* 컷 §63 의 「1호」·「온라인 TN」 — 낱말은 서버가 만든다 (D-R18) */
    { key: 'p', head: '자리', width: 120,
      cell: (r) => r.placeLabel ? <Chip tone="purple">{r.placeLabel}</Chip> : <span className="text-fg-subtle">—</span> },
    { key: 'a', head: '참석', width: 120,
      // 원본 §63 은 참석을 **칩**으로 적는다 — 같은 줄의 종류·속기록이 이미 칩이라 여기만 맨 글씨였다.
      // 「대기 4」도 같은 줄에 선다 — 답을 안 한 사람 수는 서버가 센다 (D-R37)
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          <Chip size="compact" tone={r.confirmed < r.attendees ? 'warning' : 'success'}>
            {r.confirmed}/{r.attendees}
          </Chip>
          {r.waiting > 0 ? <Chip size="compact" tone="warning">대기 {r.waiting}</Chip> : null}
        </span>
      ) },
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
  const planSub = (key: string) => d?.planStages.find((v) => v.key === key)?.sub;
  const planCols: Array<BoardColumn<Plan>> = PLAN_STAGE.map((s) => ({
    key: s.key,
    label: stageLabel(s.key),
    tone: s.tone,
    // 칸 아래 한 줄 — 원본 §61 의 「아직 대표께 안 올렸습니다」 (D-R18)
    sub: planSub(s.key),
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

  // 칸 이름·순서·한 줄은 서버가 준 것이다 — 화면은 색만 고른다 (D-R18 · D-R25)
  const cplCols: Array<BoardColumn<Complaint>> = (d?.cplStages ?? []).map((s) => ({
    key: s.key, label: s.label, sub: s.sub, tone: CPL_TONE[s.key] ?? 'neutral',
    items: (d?.complaints ?? []).filter((c) => c.stage === s.key),
  }));

  /*
   * 칩이 목록을 좁히는 자리 — **받은 목록에서 거른다** (§24 FQ 규약).
   * 건수는 거르기 전 서버가 센 것이다(`mtTypeCounts`·`todoOwnerCounts`) — 화면은 다시 세지 않는다(D-R37).
   * 담당 없는 할 일의 키는 서버가 `__none__` 이라 부른다.
   */
  const meetings = (d?.meetings ?? []).filter((m) => !mtType || m.mtType === mtType);
  const todos = (d?.todos ?? []).filter((t) => !todoOwner || (t.toName ?? '__none__') === todoOwner);
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

      {/*
        컷 §63 의 「일간 주간 월간 전체」 — 이 띠는 **모든 갈래에 같이 걸린다**(상담·컴플레인·할 일·기획·회의).
        기간 낱말은 서버가 만든 `range.label` 이다 (D-R18) — 화면이 「2026년 9월」을 짓지 않는다.
      */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<Period>
          ariaLabel="기간"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'day', label: '일간' },
            { value: 'week', label: '주간' },
            { value: 'month', label: '월간' },
            { value: 'all', label: '전체' },
          ]}
        />
        {period === 'all' ? null : (
          <div className="flex items-center gap-1">
            <Button size="sm" aria-label="이전 기간" onClick={() => setAnchor(step(period, anchor, -1))}>‹</Button>
            <Button size="sm" aria-label="다음 기간" onClick={() => setAnchor(step(period, anchor, 1))}>›</Button>
            <Button size="sm" onClick={() => setAnchor(todayKst())}>오늘</Button>
          </div>
        )}
        <Chip tone="info">{d?.range.label ?? '전체'}</Chip>
        {q.isFetching ? <span className="text-[11px] text-fg-subtle">받는 중…</span> : null}
      </div>

      {/*
       * **C96 ⓐ** — 원문 §64 의 탭 머리는 밑줄 탭이 아니라 **카드 다섯**이다: 제목 · 그 아래 한 줄 ·
       * 오른쪽 위 동그라미. 제품은 `Tabs` 에 **건수를 label 문자열로 박아** 「할 일 3」처럼 붙이고
       * 있었다 — 건수와 이름이 한 낱말이 되면 **둘 중 하나만 바꿀 수가 없다.**
       *
       * **차례도 원문으로 되돌린다** — 원문은 마케팅 · 기획 · 회의 · 할 일 · 컴플레인이고 제품은
       * 할 일부터였다. 첫 탭이 바뀌므로 `queryTab` 기본값은 **그대로 `todo`** 로 둔다: 차례는
       * 원문의 것이고 「어느 탭으로 열리는가」는 원문이 말한 적 없다(§64 컷이 할 일을 눌러 둔
       * 상태다 — 그것이 지금 제품의 기본값과 같다).
       *
       * 아래 한 줄은 **원문 카드에 적힌 그대로**다(트래킹 · 회의 · 피드백 …). 건수가 아니라
       * **그 탭이 무엇을 담는지**라 서버가 만들 값이 아니다 — 화면의 어휘다.
       */}
      <TabCards className="mb-3" label="운영 보기" value={tab} onChange={setTab} options={[
        opsTab('mkt', '마케팅', '트래킹 · 회의 · 피드백', (d?.marketing.length ?? 0) + (d?.feedbackNeedsFix ?? 0)),
        opsTab('plan', '기획', '보고 · 결재', d?.plans.length ?? 0),
        opsTab('meeting', '회의', '속기록 · 할 일', d?.meetings.length ?? 0),
        /*
         * 할 일만 **열린 것**을 센다 — 바로 아래 담당 칩 줄의 「전체 N」과 머리 칸 「열린 할 일」이
         * 그 수이고, 동그라미만 끝난 것까지 세면 **한 화면에 같은 이름의 수가 둘**이 된다(N-19).
         * 원문 §64 도 동그라미 3 · 칩 「전체 3」 · 「할 일 3건」이 전부 같은 수다.
         */
        opsTab('todo', '할 일', '배정 · 완료', openTodos.length),
        opsTab('complaint', '컴플레인', '접수 · 대응 · 결과', d?.complaints.length ?? 0),
      ]} />

      {/* 만든 결과 한 줄 — 「+ 접수」·「+ 회의 잡기」·「+ 기획 올리기」·「+ 할 일 주기」가 같이 쓴다 (C96) */}
      {notice ? <Banner tone="success" className="mb-3">{notice}</Banner> : null}

      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner>
        : q.isError ? <Banner tone="danger">운영 탭은 매니저 이상만 볼 수 있습니다.</Banner>
        : tab === 'todo' ? (
          <>
            {/* 컷 §64 의 담당 칩 줄과 오른쪽 위 「+ 할 일 주기」 — 건수는 **열린 할 일**만 서버가 센다 */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <ChipRow ariaLabel="담당" value={todoOwner} onChange={setTodoOwner}
                allCount={openTodos.length}
                options={(d?.todoOwnerCounts ?? []).map((c) => ({ value: c.key, label: c.label, count: c.count }))} />
              <Button type="button" size="sm" onClick={() => setTodoOpen(true)}>+ 할 일 주기</Button>
            </div>
            <Table columns={todoCols} rows={todos} rowKey={(r) => r.id} empty="이 기간에는 할 일이 없습니다" />
          </>
        )
        : tab === 'meeting' ? (
          <>
            {/* 컷 §63 의 갈래 칩 줄과 오른쪽 위 「+ 회의 잡기」 — 0건 갈래도 선다 (C66) */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <ChipRow ariaLabel="회의 종류" value={mtType} onChange={setMtType}
                allCount={d?.meetings.length ?? 0}
                options={(d?.mtTypeCounts ?? []).map((c) => ({ value: c.key, label: c.label, count: c.count }))} />
              <MeetingCreateButton
                mtTypes={d?.mtTypes ?? []}
                can={d?.canCreateMeeting === true}
                onDone={(r) => setNotice(
                  `회의를 잡았습니다 — ${r.meeting.mtTypeLabel}${r.meeting.title ? ` · ${r.meeting.title}` : ''}`
                  + `${r.meeting.startMin == null || r.meeting.endMin == null ? '' : ` · ${hhmm(r.meeting.startMin)}–${hhmm(r.meeting.endMin)}`}`
                  + `${r.meeting.placeLabel ? ` · ${r.meeting.placeLabel}` : ''} · 참석 ${r.attendees}명`
                  + `${r.unavailable.length ? ` · ${unavailableLines(r.unavailable).join(' · ')}` : ''}`,
                )} />
            </div>
            <Table columns={meetingCols} rows={meetings} rowKey={(r) => r.id} empty="이 기간에는 회의가 없습니다" />
          </>
        )
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Segmented
                value={planTab}
                onChange={setPlanTab}
                options={[
                  { value: 'board', label: `단계 보드 ${d?.plans.length ?? 0}` },
                  { value: 'due', label: `기한 ${d?.planDues.length ?? 0}` },
                ]}
              />
              {/* 원본 §61 머리 오른쪽의 「+ 기획 올리기」 (N-46 ③ · C96) — 단계는 고르지 않는다 */}
              <PlanCreateButton can={d?.canCreatePlan === true}
                onDone={(r) => setNotice(`기획을 올렸습니다 — ${r.plan.title} · ${r.plan.stageLabel}${r.plan.ownerName ? ` · 담당 ${r.plan.ownerName}` : ''}`)} />
            </div>
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
              <Board numbered columns={planCols} itemKey={(p) => p.id} renderCard={(p) => (
                <button type="button" className="block w-full text-left" onClick={() => setPlanId(p.id)}>
                  <div className="text-[12px] font-bold text-fg">{p.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="text-[10px] text-fg-subtle">{p.ownerName ?? '—'}</span>
                    {/* 원본 §61 rework 카드의 「보완 1」 — 서버가 `log` 에서 센다 (S6 · D-R37).
                        손으로 박은 옛 건은 0 이라 칩이 서지 않는다 (N-25) */}
                    {p.reworkCount > 0 ? <Chip tone="danger">보완 {p.reworkCount}</Chip> : null}
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
          <>
            {/* 원본 §67 머리 오른쪽의 「+ 접수」 (N-46 ① · C93) · 강사 교체는 컴플레인 없이도 연다 (D-46 퇴사 · N-132 당일 대강) */}
            {/*
              §67 갈래 칩 줄 — 이 칩만은 **서버로 간다** (J-102 「지난달 컴플레인만」).
              건수는 갈래를 안 건 채로 세므로 다른 갈래도 계속 고를 수 있다.
            */}
            <ChipRow className="mb-3" ariaLabel="컴플레인 갈래" value={area} onChange={setArea}
              options={(d?.areaCounts ?? []).map((c) => ({ value: c.key, label: c.label, count: c.count }))} />
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-fg-subtle">카드를 누르면 담당 · 단계 · 조치 · 결과를 적습니다</span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setWizard({})}>강사 교체</Button>
                <ComplaintCreateButton areas={d?.cplAreas ?? []} severities={d?.cplSeverities ?? []}
                  onDone={(row) => setNotice(`접수했습니다 — ${row.areaLabel} · ${row.studentName ?? '문의자'}${row.ownerName ? ` · 담당 ${row.ownerName}` : ''}`)} />
              </div>
            </div>
            <Board numbered columns={cplCols} itemKey={(c) => c.id} renderCard={(c) => (
              <button type="button" className="block w-full text-left" onClick={() => setCplId(c.id)} aria-label={`컴플레인 ${c.body}`}>
                <div className="flex flex-wrap items-center gap-1">
                  <Chip tone="purple">{c.areaLabel}</Chip>
                  {/* 심각도 — 원본 §67 카드의 가벼움 · 보통 · 심각. 낱말은 서버, 옛 건(null)은 칩이 서지 않는다 (N-25) */}
                  {c.severityLabel ? <Chip size="compact" tone={c.severity === 'severe' ? 'danger' : c.severity === 'normal' ? 'warning' : 'neutral'}>{c.severityLabel}</Chip> : null}
                  {c.teacherChanged ? <Chip size="compact" tone="info">강사 교체됨</Chip> : null}
                </div>
                <div className="mt-1.5 text-[12px] font-bold text-fg">{c.body}</div>
                <div className="mt-1 text-[10.5px] text-fg-subtle">{c.studentName ?? '문의자'}</div>
                {c.action ? <div className="mt-1 text-[10px] text-fg-2">{c.result ?? c.action}</div> : null}
                {/*
                  원본 §67 카드의 바닥 줄 — 왼쪽에 담당, 오른쪽에 지난 날. 기한이 지났으면 그것이 먼저다 (J-98 · 서버가 센다).
                  **담당이 없는 것은 빈칸이 아니라 할 일이다** — 접수 칸의 한 줄이 그렇게 말한다.
                */}
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-1.5 text-[10.5px]">
                  {c.ownerName
                    ? <Chip size="compact" tone="neutral">{c.ownerName}</Chip>
                    : <span className="font-bold text-red">담당 없음</span>}
                  {c.overdueDays > 0
                    ? <Chip size="compact" tone="danger">기한 {c.overdueDays}일 지남</Chip>
                    : <span className={c.stage === 'closed' ? 'text-fg-subtle' : 'font-bold text-fg-2'}>
                      {c.dueOn && c.stage !== 'closed' ? `기한 ${c.dueOn.slice(5)} · ` : ''}{c.ageDays}일 지남
                    </span>}
                </div>
              </button>
            )} />
          </>
        )}

      <Panel className="mt-4" title="여기 모이는 이유">
        <p className="text-[12px] leading-relaxed text-fg-2">
          회의에서 나온 할 일, 컴플레인에서 나온 할 일, 기획 과제가 각각 다른 목록에 있으면
          담당자는 세 곳을 봐야 합니다. 출처를 표시해서 <b>한 목록</b>으로 모읍니다.
        </p>
      </Panel>
      {/* 서랍 §17 과 **같은 창**이다 (C96) — 경로가 하나니 창도 하나다 */}
      <TodoCreateDialog
        open={todoOpen} onClose={() => setTodoOpen(false)} busy={todoWrite.isPending}
        meId={viewerId} people={meta.data?.staff ?? []}
        onCreate={(body) => todoWrite.mutate({ kind: 'todoCreate', body }, {
          onSuccess: () => setNotice(`할 일을 주었습니다 — ${body.title}`),
        })}
      />
      <PlanReport planId={planId} onClose={() => setPlanId(null)} />
      <MeetingDetail meetingId={meetingId} staff={meta.data?.staff} onClose={() => setMeetingId(null)} />
      <ComplaintDetail
        complaint={(d?.complaints ?? []).find((c) => c.id === cplId) ?? null}
        stages={d?.cplStages ?? []}
        severities={d?.cplSeverities ?? []}
        onClose={() => setCplId(null)}
        onTeacherChange={(c) => { setCplId(null); setWizard({ cplId: c.id, studentId: c.studentId ?? undefined, studentName: c.studentName }); }}
        onWithdraw={(c) => { setCplId(null); setWithdrawOf(c); }}
      />
      {withdrawOf?.studentId ? (
        <StudentWithdrawDialog
          open
          title={`수강 종료 · 환불 — ${withdrawOf.studentName ?? ''}`}
          student={{ id: withdrawOf.studentId, name: withdrawOf.studentName ?? '' }}
          defaultEndedOn={todayKst()}
          defaultReason={`컴플레인 #${withdrawOf.id} · ${withdrawOf.body.slice(0, 60)}`}
          onClose={() => setWithdrawOf(null)}
          onDone={(r) => { setWithdrawOf(null); setNotice(`수강 종료 — ${withdrawOf.studentName ?? ''} · 환불 ${r.refundTotal == null ? '금액은 대표만' : `${r.refundTotal.toLocaleString('ko-KR')}원`} · 컴플레인 #${withdrawOf.id} 사유로 남김`); }}
        />
      ) : null}
      <TeacherChangeWizard
        open={wizard !== null}
        preset={wizard}
        onClose={() => setWizard(null)}
        onDone={(r) => setNotice(`강사 교체 — ${r.fromTeacher.name} → ${r.toTeacher.name} · ${r.mode === 'day' ? `${r.date} 하루 대강` : `${r.date}부터`} · 회차 ${r.occurrences}회 · 안내 초안 ${r.guideDrafts}건 · 학부모 안내 ${r.parentNotices}건 · 알림 ${r.notifiedTeachers + r.notifiedStaff}명`)}
      />
    </AppShell></RequireAuth>
  );
}
