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
 * 「회의 속기록」은 새 목록이 아니라 **마케팅 회의만 거른 §63 줄**입니다 (w5 · 59-6 — 받은 목록에서 거른다).
 *
 * **w5 (1:1 대조 둘째 물결)** — 탭 동그라미는 원문대로 「손봐야 할 것」(마케팅=고쳐야 할 피드백 · 기획=검토+보완 ·
 * 할 일=열린 것 · 컴플레인=기한 지남)이고 수는 전부 서버가 센다(C-4). 속 갈래는 원문처럼 **카드형 탭**이다(C-6).
 * §61 카드(과제 N/M · 기한 낱말 · 기한 상태 칩) · §63 회의 줄(카드 · 이름 칩 · 예정 · 내 응답 대기 · 속기록 N) ·
 * §67 「기한 지남 N」·「이력」 — 셈과 낱말은 서버, 화면은 모양만 원문에 맞춘다.
 *
 * **x5 (잔여 물결)** — 제목 줄 오른쪽 탭 카드(C-1) · 원문에 없는 머리 칸·바닥 설명 걷음(C-2) · 부제(C-3) ·
 * 기간 띠는 **원문이 두는 갈래에만** 제 모양으로(§59 일간·주간·월간 · §63 + 전체 · §67 일별·주별·월별·전체 — C-5 · 67-3) ·
 * 「+」는 속 갈래 줄 오른쪽 끝 주 단추(C-7) · 눌린 칩 진한 채움·색 점(C-8) · 기한 지난 카드 분홍+붉은 테두리(C-9) ·
 * §59 「+ 오늘 한 것」·「어디에 · 누가」·항목 범례(59-3·59-4·59-5) · §62 지난 줄 분홍·점 칩(62-2·62-3) ·
 * §63 짧은 이름(63-7) · §64 날짜 묶음 상자(64-1) · §67 갈래·심각도 색(67-7).
 */
'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Board, BoardColumn, Button, Chip, ChipRow, Column, PageHeader, Segmented, TabCards, Table } from '@/components/ui';
import { useDrawerWrite, useMeta, useOps } from '@/api/queries';
import { useCan, useSession } from '@/store/useSession';
import { apiMessage } from '@/api/client';
import { MarketingFeedback } from '@/components/ops/MarketingFeedback';
import { PlanReport } from '@/components/ops/PlanReport';
import { MeetingDetail } from '@/components/ops/MeetingDetail';
import { ComplaintCreateButton } from '@/components/ops/ComplaintForm';
import { ComplaintDetail } from '@/components/ops/ComplaintDetail';
import { TeacherChangeWizard, type TeacherChangePreset } from '@/components/ops/TeacherChangeWizard';
import { MeetingCreateButton } from '@/components/ops/MeetingCreateDialog';
import { PlanCreateButton } from '@/components/ops/PlanCreateDialog';
import { MarketingCreateButton, MarketingEditDialog } from '@/components/ops/MarketingCreateDialog';
import { SuggestionsAdmin } from '@/components/ops/SuggestionsAdmin';
import { TodoCreateDialog } from '@/components/drawer/TodoCreateDialog';
import { TodoRows } from '@/components/drawer/panes';
import { StudentWithdrawDialog } from '@/components/lesson/StudentWithdrawDialog';
import type { Complaint, Marketing, Meeting, Plan, PlanDueRow as PlanDue } from '@/api/types';
import { MASKED, won } from '@/lib/money';
import { positiveQueryId, queryEnum } from '@/lib/url-state';
import { hhmm, longDateLabel, step, summaryBoundsOf, todayKst, unavailableLines } from '@/lib/calendar';
import type { ChipColor, ChipTone, Tone } from '@/components/ui';

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
/**
 * 기간 띠는 **원문이 두는 갈래에만 · 제 모양으로** 선다 (x5 · g6 C-5 · 67-3 · D-R44).
 * §59 「일간 주간 월간」(전체 없음 · 주간이 눌린 컷) · §63 「일간 주간 월간 전체」(전체가 눌린 컷) ·
 * §67 「**일별 주별 월별** 전체」(월별이 눌린 컷) — 원문이 두 갈래에서 낱말을 다르게 적는 것까지 그대로다.
 * §60·§61·§62·§64 에는 띠가 없다 — 그 갈래에서는 기간으로 자르지 않는다(전체).
 */
type PeriodTab = 'mkt' | 'meeting' | 'complaint';
const PERIOD_OPTIONS: Record<PeriodTab, Array<{ value: Period; label: string }>> = {
  mkt: [{ value: 'day', label: '일간' }, { value: 'week', label: '주간' }, { value: 'month', label: '월간' }],
  meeting: [{ value: 'day', label: '일간' }, { value: 'week', label: '주간' }, { value: 'month', label: '월간' }, { value: 'all', label: '전체' }],
  complaint: [{ value: 'day', label: '일별' }, { value: 'week', label: '주별' }, { value: 'month', label: '월별' }, { value: 'all', label: '전체' }],
};
const PERIOD_DEFAULT: Record<PeriodTab, Period> = { mkt: 'week', meeting: 'all', complaint: 'month' };
const isPeriodTab = (t: Tab): t is PeriodTab => t === 'mkt' || t === 'meeting' || t === 'complaint';
/** 기한 지난 카드 — 원문 §61·§67 의 분홍 바탕 + 붉은 테두리 (C-9). 판정은 서버의 overdueDays 다 */
const OVERDUE_CARD = 'rounded-lg border border-red/60 bg-red/5 p-2.5';

/**
 * 단계의 **색**만 여기서 고른다 — 이름은 서버가 준 `stageLabel` 이다 (D-R18 · C56).
 * 한동안 이 배열이 이름까지 들고 있었고, §62 기한 표와 §65 보고서가 생기면서
 * 같은 낱말을 세 곳에서 적을 뻔했다.
 */
const PLAN_STAGE: Array<{ key: string; tone: Tone }> = [
  // 원문 §61 칸 색 그대로 — 작성 중 회색 · 검토 요청 주황 · 보완 요청 빨강 · 승인 파랑 · 완료 초록 (w5 · 61-7)
  { key: 'draft', tone: 'neutral' },
  { key: 'review', tone: 'warning' },
  { key: 'rework', tone: 'danger' },
  { key: 'approved', tone: 'info' },
  { key: 'done', tone: 'success' },
];
const planTone = (stage: string) => PLAN_STAGE.find((s) => s.key === stage)?.tone ?? 'neutral';
/** §61 카드의 공개 범위 칩 색 — 원문 「전체 공개」 초록 · 「지정 공개」 주황 (W11 · N-72). 낱말은 서버의 shareLabel */
const PLAN_SHARE_TONE: Record<string, ChipTone> = { all: 'success', picked: 'orange' };
/** §61 카드의 기한 상태 칩 색 — 원문 「기한 제안」 주황 · 「기한 승인」 초록 · 「기한 반려」 빨강 (N-95 · §65 보고서와 같은 빛깔) */
const PLAN_DUE_TONE: Record<string, ChipTone> = { proposed: 'warning', approved: 'success', rejected: 'danger' };
/**
 * 컴플레인 단계의 **색**만 여기서 고른다 — 이름과 한 줄은 서버가 준 `cplStages` 다 (C86-d).
 * 한동안 이 배열이 이름까지 들고 있었고, 저장되는 말이 `received|acting|closed` 인데
 * DBML·entity 주석은 「open|acting|done」이라 적어 두어 **대표 보고 배지가 전부를 세고 있었다.**
 */
const CPL_TONE: Record<string, 'danger' | 'warning' | 'success'> = {
  received: 'danger', acting: 'warning', closed: 'success',
};
/**
 * §63 회의 종류의 **색**만 여기서 고른다 — 이름은 서버의 `mtTypeLabel` 이다 (D-R18).
 * 원문 §63 줄의 왼쪽 점선 띠와 종류 칩 색(기획 보라 · 컨설팅 청록 · 마케팅 분홍 · 개발 파랑 · 일반 주황)에 가장 가까운 토큰이다.
 */
const MT_TONE: Record<string, ChipTone> = {
  // 원문 §63 줄 머리 칩 — 기획 보라 · 컨설팅 청록 · 마케팅 붉은 자주 · 개발 파랑 · 일반 주황 (x5 · 청록·주황 토큰 뒤)
  plan: 'purple', consulting: 'teal', marketing: 'danger', dev: 'info', general: 'orange',
};
const MT_BORDER: Record<string, string> = {
  plan: 'border-l-violet', consulting: 'border-l-teal', marketing: 'border-l-red', dev: 'border-l-blue', general: 'border-l-orange',
};
/** §63 종류 칩 줄의 색 점 — 줄 머리 칩과 같은 빛깔(C-8 · 63-7) */
const MT_DOT: Record<string, string> = {
  plan: 'var(--violet)', consulting: 'var(--teal)', marketing: 'var(--red)', dev: 'var(--blue)', general: 'var(--orange)',
};
/**
 * §67 갈래 빛깔 — 원문 칩 줄의 점과 카드 칩: 수업 파랑 · 상담 청록 · 교재 주황 · 스케줄 보라 · 선생님 분홍 (67-7).
 * 선생님은 칩도 분홍이다(원문 카드 칩 #DB2777 = §14 「시급 변경」 칩과 같은 색 · 칩이 받는 `pink`) — 빨강이면 옆의 「심각」 칩과 갈리지 않는다 (W11 재대조)
 */
const CPL_AREA_TONE: Record<string, ChipColor> = {
  lesson: 'info', intake: 'teal', book: 'orange', schedule: 'purple', teacher: 'pink',
};
const CPL_AREA_DOT: Record<string, string> = {
  lesson: 'var(--blue)', intake: 'var(--teal)', book: 'var(--orange)', schedule: 'var(--violet)', teacher: 'var(--pink)',
};
/**
 * §59 항목 범례의 빛깔 — 원문 머리 오른쪽 칩(댓글·응대 청록 · 광고 집행 주황 · 릴스·영상 붉은 자주 · 글 발행 파랑)에 가까운 토큰 (59-5).
 * 앞 넷이 원문 컷의 코드(W11 · N-29 ①) · 뒤는 옛 행에만 있는 코드(읽기 전용 · 옛 이름 그대로)다.
 */
const MKT_ITEM_TONE: Record<string, ChipTone> = {
  reply: 'teal', ad: 'orange', video: 'danger', post: 'info',
  channel: 'teal', blog: 'info', biz: 'purple', word: 'success', print: 'neutral',
};
/** §67 심각도 — 가벼움 회색 · 보통 주황 · 심각 빨강 (67-7) */
const CPL_SEVERITY_TONE: Record<string, ChipTone> = { light: 'neutral', normal: 'orange', severe: 'danger' };
/** 참석 칩 색 — 세 값(응답 대기 · 참석 · 불참) · 낱말은 서버의 stateLabel (§66 과 같은 표) */
const ATTEND_TONE: Record<string, Tone> = { waiting: 'warning', in: 'success', out: 'neutral' };

export default function OpsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryTab = queryEnum(searchParams.get('tab'), ['todo', 'complaint', 'plan', 'meeting', 'mkt'] as const) ?? 'todo';
  const queryPlanId = queryTab === 'plan' ? positiveQueryId(searchParams.get('plan')) : null;
  const queryRequestId = queryTab === 'todo' ? positiveQueryId(searchParams.get('request')) : null;
  const suggestionOpen = searchParams.get('view') === 'suggestions';
  /* 줄 하나를 곧장 여는 질의 (W11) — 회의 안내 알림의 링크(`?tab=meeting&meeting=`) · 대표 보고 펼칠 줄(`?tab=complaint&cpl=`) */
  const queryMeetingId = queryTab === 'meeting' ? positiveQueryId(searchParams.get('meeting')) : null;
  const queryCplId = queryTab === 'complaint' ? positiveQueryId(searchParams.get('cpl')) : null;
  const [tab, setTab] = useState<Tab>(queryTab);
  // 원문 §59·§60 의 속 갈래 — 「트래킹 / 대표 피드백」
  const [mktTab, setMktTab] = useState<'track' | 'fb' | 'minutes'>('track');
  // 원문 §63 의 속 갈래 — 「회의 목록 / 할 일」 · §67 의 속 갈래 — 「단계 보드 / 이력」 (w5 · 63-4 · 67-1)
  const [mtTab, setMtTab] = useState<'list' | 'todo'>('list');
  const [cplTab, setCplTab] = useState<'board' | 'history'>('board');
  // 원문 §61·§62 의 속 갈래 — 「단계 보드 / 기한」
  const [planTab, setPlanTab] = useState<'board' | 'due'>('board');
  const [planId, setPlanId] = useState<number | null>(queryPlanId);
  const [meetingId, setMeetingId] = useState<number | null>(queryMeetingId);
  // §67 카드 처리 창 · 강사 교체 마법사 (C93) — 컴플레인에서 열면 학생·건을 미리 채운다
  const [cplId, setCplId] = useState<number | null>(queryCplId);
  const [wizard, setWizard] = useState<TeacherChangePreset | null>(null);
  // 컴플레인 → 수강 종료·환불 (J-99) — C94-c 창을 그대로 연다. 사유에 컴플레인을 적어 잇는다(cplId 칸은 N-135 ①)
  const [withdrawOf, setWithdrawOf] = useState<Complaint | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingMarketing, setEditingMarketing] = useState<Marketing | null>(null);
  /* 기간 띠는 갈래마다 제 것이다 — 기본값도 컷이 눌러 둔 것(§59 주간 · §63 전체 · §67 월별 · x5 C-5).
     컴플레인 한 건을 질의로 열 때는 「전체」에서 시작한다 — 이번 달 밖에 접수된 건이면 카드가 목록에 없어 창이 안 열린다 */
  const [periods, setPeriods] = useState<Record<PeriodTab, Period>>(
    () => (queryCplId ? { ...PERIOD_DEFAULT, complaint: 'all' } : PERIOD_DEFAULT),
  );
  const [anchors, setAnchors] = useState<Record<PeriodTab, string>>(() => {
    const t = todayKst();
    return { mkt: t, meeting: t, complaint: t };
  });
  /* §59 필터 띠 「어디에 · 누가」 — 받은 목록에서 거른다(§24 FQ 규약 · 요청 0) · 수는 서버가 센 것 (59-4) */
  const [mktChannel, setMktChannel] = useState('');
  const [mktBy, setMktBy] = useState('');
  /* §67 갈래는 **서버로 간다**(J-102 — 건수도 목록도 서버가 자른다). 나머지 칩 둘은 받은 목록에서 거른다(§24 FQ) */
  const [area, setArea] = useState('');
  const [mtType, setMtType] = useState('');
  const [todoOwner, setTodoOwner] = useState('');
  const [todoStatus, setTodoStatus] = useState<'open' | 'done'>('open');
  const [todoOpen, setTodoOpen] = useState(false);
  const [todoEditId, setTodoEditId] = useState<number | null>(null);
  const [todoError, setTodoError] = useState<string | null>(null);
  const canAdminPage = useCan('canAdminPage');
  const canCrudAll = useCan('canCrudAll');
  const viewerId = useSession((s) => s.me?.id ?? null);
  const periodTab = isPeriodTab(tab) ? tab : null;
  const period: Period = periodTab ? periods[periodTab] : 'all';
  const anchor = periodTab ? anchors[periodTab] : todayKst();
  const bounds = periodTab && period !== 'all' ? summaryBoundsOf(period, anchor) : null;
  // 갈래 칩(§67)은 컴플레인 갈래에서만 서버로 간다 — 다른 갈래의 목록을 조용히 좁히지 않는다
  const q = useOps({ ...(bounds ?? {}), ...(tab === 'complaint' && area ? { area } : {}) });
  /*
   * 기간·갈래를 옮기면 캐시 키가 바뀌어 새로 받는다 — 그 사이 갈래 몸통(속 갈래 카드 · 기간 띠)이 「불러오는 중」으로
   * 통째로 사라지면 방금 누른 띠가 손 밑에서 없어진다(x5 · C-5 로 띠가 갈래 안에 들어왔다).
   * 그래서 **같은 사람 · 같은 금액 권한**의 직전 응답을 새 응답이 올 때까지 보인다(「받는 중…」 표시).
   * 권한이 바뀌면 이어 쓰지 않는다 — 회수 직후 옛 금액이 한 순간도 남지 않게 (useOps 의 권한 키와 같은 축).
   */
  const canMoneyNow = useSession((s) => s.me?.canMoney === true);
  const dataScope = `${viewerId ?? 'anonymous'}:${canMoneyNow}`;
  const lastOps = useRef<{ scope: string; data: NonNullable<typeof q.data> } | null>(null);
  if (q.data) lastOps.current = { scope: dataScope, data: q.data };
  const d = q.data ?? (lastOps.current?.scope === dataScope ? lastOps.current.data : undefined);
  // 할 일 배정의 담당자 목록 — 창을 열 때만 필요하다. 「+ 할 일 주기」도 같은 목록을 쓴다 (C96)
  // §65 「+ 대표 지시」도 같은 담당 목록을 쓴다 (w5 · 65-4)
  const meta = useMeta(meetingId !== null || todoOpen || planId !== null);
  // 「+ 할 일 주기」는 **새 경로가 아니다** — 서랍이 쓰는 `POST /drawer/todos` 를 그대로 부른다 (C76 · C96)
  const todoWrite = useDrawerWrite();

  useEffect(() => {
    setTab(queryTab);
    setPlanId(queryPlanId);
    setMeetingId(queryMeetingId);
    setCplId(queryCplId);
    if (queryCplId) setPeriods((p) => ({ ...p, complaint: 'all' }));
  }, [queryCplId, queryMeetingId, queryPlanId, queryTab]);

  /*
   * §63 회의 한 줄 — 원문은 **표가 아니라 카드 줄**이다 (w5 · 63-1 · 63-2 · 63-8):
   * 왼쪽 종류색 점선 띠 · 종류 칩 · 「26년 9월 18일 금요일」 굵게 · 시각 · 오른쪽에 참석자 이름 칩 · 「대기 N」 · 「예정」 · 자리.
   * 줄 전체가 단추다(원문은 「열기」 없이 줄을 누른다). 사람이 적은 제목은 원문 컷에 없는 칸이라 시각 뒤에 흐리게 둔다(잃지 않는다).
   * 수·낱말은 전부 서버 값이다 — 이름 칩의 상태, 「대기 N」, 「예정」, 자리 (D-R37 · D-R18).
   * 옛 회의는 이어진 회차가 없어 시각이 없다. 지어내지 않고 **없다고 적는다** (N-25).
   */
  const meetingRow = (r: Meeting) => (
    <li key={r.id}>
      <button type="button" onClick={() => setMeetingId(r.id)}
        aria-label={`회의 ${r.mtTypeLabel}${r.onDate ? ` ${r.onDate}` : ''}${r.title ? ` ${r.title}` : ''}`}
        className={`flex w-full flex-wrap items-center gap-2 rounded-lg border border-l-4 border-dashed border-line bg-card px-3 py-2 text-left hover:bg-inset ${MT_BORDER[r.mtType] ?? 'border-l-line-2'}`}
      >
        {/* 줄 머리 칩은 **짧은 이름** 「기획」 — 원문 §63 (63-7). 낱말은 서버의 mtTypeShort */}
        <Chip size="compact" styleKind="solid" tone={MT_TONE[r.mtType] ?? 'neutral'}>{r.mtTypeShort}</Chip>
        <b className="text-[13px] text-fg">{r.onDate ? longDateLabel(r.onDate) : '날짜 없음'}</b>
        {r.startMin == null || r.endMin == null
          ? <span className="text-[10.5px] text-fg-subtle">시각 없음</span>
          : <span className="text-[11.5px] text-fg-subtle">{hhmm(r.startMin)}–{hhmm(r.endMin)}</span>}
        {r.title ? <span className="truncate text-[11.5px] text-fg-2">{r.title}</span> : null}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {(r.attendeeList ?? []).map((a) => (
            <Chip key={a.staffId} size="compact" styleKind="solid" tone={ATTEND_TONE[a.state] ?? 'neutral'} title={a.stateLabel}>{a.name}</Chip>
          ))}
          {r.waiting > 0 ? <Chip size="compact" tone="warning">대기 {r.waiting}</Chip> : null}
          {/* 「예정」은 오늘·앞날 회의다(서버 판정). 지난 회의는 속기록이 곧 끝맺음이다 — 안 쓰면 회의가 끝난 것이 아니다 */}
          {r.upcoming ? <Chip size="compact" tone="neutral">예정</Chip>
            : r.hasMinutes ? <Chip size="compact" tone="success">속기록</Chip> : <Chip size="compact" tone="danger">속기록 없음</Chip>}
          {r.placeLabel ? <Chip size="compact" styleKind={r.placeLabel.startsWith('온라인') ? 'solid' : 'soft'} tone={r.placeLabel.startsWith('온라인') ? 'danger' : 'neutral'}>{r.placeLabel}</Chip> : null}
        </span>
      </button>
    </li>
  );
  const meetingList = (rows: Meeting[], empty: string) => rows.length === 0
    ? <Banner tone="neutral">{empty}</Banner>
    : <ul className="flex flex-col gap-1.5">{rows.map(meetingRow)}</ul>;

  /**
   * 갈래마다의 기간 띠 (C-5 · 67-3) — 눈금·낱말·기본값은 그 갈래의 것, 기간 낱말은 서버의 `range.label` 이다 (D-R18).
   * `extra` 는 띠 옆 요약(§59 「N건 M일 진행」 · §63 「54회 · 속기록 32」), `right` 는 같은 줄 오른쪽(§59 범례 · §67 갈래 칩).
   */
  const periodBand = (pt: PeriodTab, extra?: ReactNode, right?: ReactNode) => {
    const cur = periods[pt];
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<Period> ariaLabel="기간" value={cur} options={PERIOD_OPTIONS[pt]}
          onChange={(v) => setPeriods((p) => ({ ...p, [pt]: v }))} />
        {cur === 'all' ? null : (
          <div className="flex items-center gap-1 rounded-lg border border-line bg-card px-1">
            <Button size="sm" variant="ghost" aria-label="이전 기간" onClick={() => setAnchors((a) => ({ ...a, [pt]: step(cur, a[pt], -1) }))}>‹</Button>
            <b className="min-w-[96px] px-1 text-center text-[13px] text-fg">{d?.range.label ?? ''}</b>
            <Button size="sm" variant="ghost" aria-label="다음 기간" onClick={() => setAnchors((a) => ({ ...a, [pt]: step(cur, a[pt], 1) }))}>›</Button>
            <Button size="sm" variant="ghost" onClick={() => setAnchors((a) => ({ ...a, [pt]: todayKst() }))}>오늘</Button>
          </div>
        )}
        {extra}
        {q.isFetching ? <span className="text-[11px] text-fg-subtle">받는 중…</span> : null}
        {right ? <div className="ml-auto flex flex-wrap items-center gap-1.5">{right}</div> : null}
      </div>
    );
  };
  /* §59 필터 띠로 거른 활동 줄 — 칩의 수는 거르기 전 서버가 센 것이다 (59-4 · D-R37) */
  const mktRows = (d?.marketing ?? []).filter((m) => (!mktChannel || m.channel === mktChannel)
    && (!mktBy || (m.byId == null ? '__none__' : String(m.byId)) === mktBy));

  const mktCols: Array<Column<Marketing>> = [
    // 낱말은 서버가 만든다 — 한동안 이 표는 「instagram」 「ad」를 그대로 찍고 있었다 (D-R18 · C53)
    // 이름 아래 메모 한 줄(W11 · N-29 ② · 원문 카드의 「상담 예약 4건 전환」) — 적은 그대로
    { key: 'n', head: '활동', cell: (r) => (
      <span className="flex flex-col">
        <span className="font-bold">{r.name}</span>
        {r.memo ? <span className="text-[11px] text-fg-subtle">{r.memo}</span> : null}
      </span>
    ) },
    { key: 'c', head: '채널', width: 110, cell: (r) => <Chip>{r.channelLabel}</Chip> },
    { key: 'i', head: '항목', width: 100, cell: (r) => r.itemLabel },
    { key: 'b', head: '담당', width: 90, cell: (r) => r.byName ?? '—' },
    { key: 'im', head: '노출', width: 100, align: 'right', cell: (r) => won(r.impressions, { unit: false, empty: '—' }) },
    { key: 'iq', head: '문의', width: 80, align: 'right', cell: (r) => r.inquiries ?? '—' },
    { key: 'e', head: '등록', width: 80, align: 'right',
      cell: (r) => <span className={r.enrolled ? 'font-bold text-green' : 'text-fg-subtle'}>{r.enrolled}</span> },
    { key: 'co', head: '비용', width: 110, align: 'right',
      cell: (r) => (r.cost ?? null) === null
        ? <span className="text-[11px] text-fg-subtle">{MASKED}</span>
        : won(r.cost as number) },
    { key: 'cpe', head: '등록당', width: 120, align: 'right',
      cell: (r) => {
        const c = r.costPerEnroll ?? null;
        if (c === null) return <span className="text-[11px] text-fg-subtle">{(r.cost ?? null) === null ? MASKED : '—'}</span>;
        return <span className={c > 100000 ? 'font-bold text-red' : 'font-bold'}>{won(c)}</span>;
      } },
    { key: 'edit', head: '', width: 68, align: 'right', cell: (r) => (
      <Button size="sm" variant="secondary" onClick={() => setEditingMarketing(r)} aria-label={`${r.name} 수정`}>수정</Button>
    ) },
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
    // 원문 §62 「구분」·「단계」는 알약이 아니라 **점 + 글자**다 (62-3)
    { key: 'k', head: '구분', width: 100, cell: (r) => <Chip styleKind="dot" tone={r.kind === 'plan' ? 'neutral' : 'info'}>{r.kindLabel}</Chip> },
    { key: 't', head: '내용', cell: (r) => <span className="font-bold">{r.title}</span> },
    { key: 'p', head: '기획', width: 180, cell: (r) => <span className="text-fg-subtle">{r.planTitle}</span> },
    { key: 'o', head: '담당', width: 90, cell: (r) => r.ownerName ?? '—' },
    { key: 's', head: '단계', width: 110, cell: (r) => <Chip styleKind="dot" tone={planTone(r.stage)}>{r.stageLabel}</Chip> },
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
  const openTodoCount = (d?.todoOwnerCounts ?? []).reduce((n, c) => n + c.count, 0);
  const doneTodoCount = (d?.todoDoneOwnerCounts ?? []).reduce((n, c) => n + c.count, 0);
  const todoCounts = (todoStatus === 'open' ? d?.todoOwnerCounts : d?.todoDoneOwnerCounts) ?? [];
  // 표시 이름이 겹칠 때만 실제 ID로 구별한다. 이름으로 담당을 합치거나 ID를 역추정하지 않는다.
  const todoOwnerOptions = todoCounts.map((c) => ({
    value: c.key, count: c.count,
    label: c.key !== '__none__' && todoCounts.some((other) => other.key !== c.key && other.label === c.label)
      ? `${c.label} · #${c.key}` : c.label,
  }));
  const todos = (d?.todos ?? []).filter((t) => t.done === (todoStatus === 'done')
    && (!todoOwner || (t.toId == null ? '__none__' : String(t.toId)) === todoOwner));
  const todoDates = [...new Set(todos.map((t) => t.dueOn).filter((date): date is string => !!date))].sort();
  const todoGroups = [...todoDates.map((date) => ({ date, items: todos.filter((t) => t.dueOn === date) })),
    { date: null, items: todos.filter((t) => !t.dueOn) }].filter((group) => group.items.length > 0);
  const editingTodo = (d?.todos ?? []).find((t) => t.id === todoEditId);
  /* 속 갈래가 쓰는 목록 — **받은 목록에서 거른다**(§24 FQ 규약 · 요청 0). 수는 서버가 센 것을 쓴다 (D-R37) */
  const meetingCount = (d?.mtTypeCounts ?? []).reduce((n, c) => n + c.count, 0);
  const meetingTodos = (d?.todos ?? []).filter((t) => t.src === 'meeting' && !t.done);
  const marketingMeetings = (d?.meetings ?? []).filter((m) => m.mtType === 'marketing');
  /** §67 「이력」 — 같은 컴플레인을 표로 (w5 · 67-1). 낱말은 서버의 areaLabel · 단계 이름 */
  const cplHistoryCols: Array<Column<Complaint>> = [
    { key: 'd', head: '접수일', width: 100, cell: (r) => r.createdAt },
    { key: 'a', head: '갈래', width: 90, cell: (r) => <Chip size="compact" tone="purple">{r.areaLabel}</Chip> },
    { key: 'b', head: '내용', cell: (r) => <span className="font-bold">{r.body}</span> },
    { key: 's', head: '학생', width: 110, cell: (r) => r.studentName ?? '문의자' },
    { key: 'o', head: '담당', width: 90, cell: (r) => r.ownerName ?? <span className="font-bold text-red">담당 없음</span> },
    { key: 'st', head: '단계', width: 90,
      cell: (r) => <Chip size="compact" tone={CPL_TONE[r.stage] ?? 'neutral'}>{d?.cplStages.find((x) => x.key === r.stage)?.label ?? r.stage}</Chip> },
    { key: 'r', head: '결과', cell: (r) => r.result ?? <span className="text-fg-subtle">—</span> },
  ];
  const toggleTodo = (id: number, done: boolean) => {
    setTodoError(null);
    todoWrite.mutate({ kind: 'todo', id, done }, { onError: (error) => setTodoError(apiMessage(error)) });
  };
  return (
    <RequireAuth><AppShell drawerEntry={queryRequestId ? { pane: 'approvals', identity: `request-${queryRequestId}` } : null}>
      {/*
        원문 제목 줄 — 「운영」·부제가 왼쪽, **같은 줄 오른쪽에 탭 카드 다섯** (x5 · C-1 · C-3).
        원문에 없는 머리 칸 넷(열린 할 일 · 접수 컴플레인 · 검토 대기 기획 · 속기록 미작성)과 바닥 설명은 걷었다(C-2) —
        그 수는 탭 동그라미와 각 갈래의 칩·띠가 서버 수로 말한다. 기간 띠도 전역 한 줄이 아니라 갈래 안으로 옮겼다(C-5).
        동그라미는 원문대로 **「손봐야 할 것」**이다(w5 · C-4) — 회의 동그라미는 **이미 지난 회의 중 속기록이 비어 있는 수**다
        (W11 · N-96 · 서버 mtNeedsMinutes · §63 머리 수와 같은 문장 · 컴플레인 동그라미처럼 받은 기간 안에서 센다).
      */}
      <PageHeader title="운영" sub="마케팅 · 기획 · 회의를 한 곳에서 봅니다" center={(
        <TabCards label="운영 보기" value={tab} onChange={setTab} options={[
          opsTab('mkt', '마케팅', '트래킹 · 회의 · 피드백', d?.feedbackNeedsFix ?? 0),
          opsTab('plan', '기획', '보고 · 결재', d?.planPending ?? 0),
          opsTab('meeting', '회의', '속기록 · 할 일', d?.mtNeedsMinutes ?? 0),
          /*
           * 할 일만 **열린 것**을 센다 — 바로 아래 담당 칩 줄의 「전체 N」과 속 갈래 카드 「할 일 N건」이
           * 그 수이고, 동그라미만 끝난 것까지 세면 **한 화면에 같은 이름의 수가 둘**이 된다(N-19).
           * 원문 §64 도 동그라미 3 · 칩 「전체 3」 · 「할 일 3건」이 전부 같은 수다.
           */
          opsTab('todo', '할 일', '배정 · 완료', openTodoCount),
          opsTab('complaint', '컴플레인', '접수 · 대응 · 결과', d?.cplOverdue ?? 0),
        ]} />
      )} />

      {/* 만든 결과 한 줄 — 「+ 접수」·「+ 회의 잡기」·「+ 기획 올리기」·「+ 할 일 주기」가 같이 쓴다 (C96) */}
      {notice ? <Banner tone="success" className="mb-3">{notice}</Banner> : null}

      {q.isError ? <Banner tone="danger">운영 탭은 매니저 이상만 볼 수 있습니다.</Banner>
        : !d ? <Banner tone="neutral">불러오는 중…</Banner>
        : tab === 'todo' ? (
          <>
            {/* 원문 §64 — 속 갈래 카드 줄 오른쪽 끝에 갈색 주 단추 「+ 할 일 주기」 (C-7) · 기간 띠는 없다 (C-5) */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <TabCards label="할 일 상태" value={todoStatus}
                onChange={(next) => { setTodoStatus(next); setTodoOwner(''); }}
                options={[
                  { value: 'open', label: '할 일', sub: `${openTodoCount}건` },
                  { value: 'done', label: '끝난 것', sub: `${doneTodoCount}건` },
                ]} />
              <Button type="button" variant="primary" onClick={() => setTodoOpen(true)}>+ 할 일 주기</Button>
            </div>
            {/* 담당 ID와 상태별 건수는 서버에서 온다. 이름이 같은 구성원도 서로 다른 칩이다. 눌린 칩은 진한 채움(C-8) */}
            <ChipRow className="mb-3" ariaLabel="담당" value={todoOwner} onChange={setTodoOwner} pressedTone="ink"
              allCount={todoStatus === 'open' ? openTodoCount : doneTodoCount}
              options={todoOwnerOptions} />
            {todoError ? <Banner tone="danger" className="mb-3">{todoError}</Banner> : null}
            <div className="flex flex-col gap-4">
              {todoGroups.length === 0 ? <Banner tone="neutral">할 일이 없습니다</Banner> : todoGroups.map(({ date, items }) => (
                /* 원문 §64 날짜 묶음 = 테두리 상자 · 머리 「26년 8월 21일 금요일 3건 ··· 오늘」 (64-1) — 긴 날짜는 공용 longDateLabel */
                <section key={date ?? 'undated'} data-todo-group={date ?? 'undated'}
                  className={`overflow-hidden rounded-xl border bg-card ${date === todayKst() ? 'border-primary/60' : 'border-line'}`}>
                  <h3 className="flex items-center justify-between gap-2 border-b border-line bg-inset px-3 py-2 text-[13px] font-bold text-fg">
                    <span className="flex items-baseline gap-2">
                      {date ? longDateLabel(date) : '기한 없음'}
                      <span className="text-[11.5px] font-normal text-fg-subtle">{items.length}건</span>
                    </span>
                    {date === todayKst() ? <span className="text-[12px] font-bold text-fg">오늘</span> : null}
                  </h3>
                  <div className="p-2">
                    {/* 원문 §64 줄 모양 — 채운 출처 칩 · 연결 수업 칩 · 「받는 사람 준 사람 지시」 · 「고치기」 (W11 · g6 64-2 · 64-3) */}
                    <TodoRows layout="ops" items={items} busy={todoWrite.isPending} onToggle={toggleTodo}
                      onEdit={canAdminPage && canCrudAll ? setTodoEditId : undefined} />
                  </div>
                </section>
              ))}
            </div>
          </>
        )
        : tab === 'meeting' ? (
          <>
            {/*
              원문 §63 의 속 갈래(카드형) 「회의 목록 N회 · 할 일 N건」과 「내 응답 대기 N」 (w5 · 63-4 · 63-5).
              회의 할 일은 새 목록이 아니라 §64 할 일 중 **회의에서 나온 것**(src=meeting)이다 — 같은 줄 부품(TodoRows).
              「내 응답 대기」는 서버가 센 수다. 응답은 본인이 회의 상세에서 「참석 · 불참」으로 한다(W11 · N-32).
            */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {/* 「회의 목록」 카드도 윗 탭과 같은 동그라미다 — 원문 §63 두 자리 「32」(W11 · N-96 · 서버 mtNeedsMinutes) */}
              <TabCards label="회의 보기" value={mtTab} onChange={setMtTab} options={[
                { value: 'list', label: '회의 목록', sub: `${meetingCount}회`,
                  badge: d?.mtNeedsMinutes ?? 0, badgeSr: d?.mtNeedsMinutes ? `${d.mtNeedsMinutes}건` : undefined },
                { value: 'todo', label: '할 일', sub: `${meetingTodos.length}건` },
              ]} />
              {(d?.mtMyWaiting ?? 0) > 0 ? <Chip styleKind="solid" tone="warning">내 응답 대기 {d?.mtMyWaiting}</Chip> : null}
              {/* 원문 §63 속 갈래 줄 오른쪽 끝의 갈색 주 단추 「+ 회의 잡기」 (C-7) */}
              <span className="ml-auto">
                <MeetingCreateButton
                mtTypes={d?.mtTypes ?? []}
                can={d?.canCreateMeeting === true}
                onDone={(r) => setNotice(
                  `회의를 잡았습니다 — ${r.meeting.mtTypeLabel}${r.meeting.title ? ` · ${r.meeting.title}` : ''}`
                  + `${r.meeting.startMin == null || r.meeting.endMin == null ? '' : ` · ${hhmm(r.meeting.startMin)}–${hhmm(r.meeting.endMin)}`}`
                  + `${r.meeting.placeLabel ? ` · ${r.meeting.placeLabel}` : ''} · 참석 ${r.attendees}명`
                  + `${r.unavailable.length ? ` · ${unavailableLines(r.unavailable).join(' · ')}` : ''}`,
                )} />
              </span>
            </div>
            {/* 원문 §63 기간 띠 「일간 주간 월간 전체」와 그 옆 요약 「최근 두 달 54회 · 속기록 32」 — 낱말도 수도 서버 값 (63-6 · C-5) */}
            {periodBand('meeting', (
              <p className="flex items-baseline gap-2 text-[12px] text-fg-2">
                {periods.meeting === 'all' ? <b className="text-fg">{d?.range.label ?? '전체'}</b> : null}
                <b className="text-[15px] text-fg">{meetingCount}회</b>
                <span className="text-fg-subtle">속기록 {d?.mtMinutesCount ?? 0}</span>
              </p>
            ))}
            {/* 원문 §63 종류 칩 줄 — 짧은 이름 · 색 점 · **건수 없음** · 눌린 칩 진한 채움 (63-7 · C-8). 0건 갈래도 선다 (C66) */}
            <ChipRow className="mb-3 border-b border-line pb-3" ariaLabel="회의 종류" value={mtType} onChange={setMtType} pressedTone="ink"
              options={(d?.mtTypeCounts ?? []).map((c) => ({ value: c.key, label: c.label, dot: MT_DOT[c.key] }))} />
            {mtTab === 'todo'
              ? <TodoRows layout="ops" items={meetingTodos} busy={todoWrite.isPending} onToggle={toggleTodo} />
              : meetingList(meetings, '이 기간에는 회의가 없습니다')}
          </>
        )
        : tab === 'mkt' ? (
          <>
            {/* 원문 §59·§60 의 속 갈래(카드형) — 트래킹 · 대표 피드백 · 회의 속기록 (C-6 · 59-6) · 오른쪽 끝 「+ 오늘 한 것」 (59-3 · C-7) */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <TabCards label="마케팅 보기" value={mktTab} onChange={setMktTab} options={[
                { value: 'track', label: '트래킹', sub: `${d?.marketing.length ?? 0}건` },
                { value: 'fb', label: '대표 피드백', sub: `${d?.feedback.length ?? 0}건`,
                  badge: d?.feedbackNeedsFix ?? 0, badgeSr: d?.feedbackNeedsFix ? `${d.feedbackNeedsFix}건` : undefined },
                { value: 'minutes', label: '회의 속기록', sub: `${marketingMeetings.length}회` },
              ]} />
              <MarketingCreateButton channels={d?.mktChannels ?? []} items={d?.mktItems ?? []}
                can={d?.canCreateMarketing === true}
                onDone={(r) => setNotice(`적었습니다 — ${r.name} · ${r.channelLabel} · ${r.itemLabel}${r.byName ? ` · 담당 ${r.byName}` : ''}`)} />
            </div>
            {/*
              원문 §59 기간 띠 「일간 주간 월간」 + 「‹ 08-17 ~ 08-23 › 오늘」 + 「4건 3일 진행」 + 오른쪽 항목 범례 (C-5 · 59-5).
              §60 대표 피드백에는 띠가 없다 — 고쳐야 할 것은 기간으로 가리지 않는다. 수는 전부 서버가 센 것이다 (D-R37).
            */}
            {mktTab === 'fb' ? null : periodBand('mkt', (
              <p className="flex items-baseline gap-2 text-[12px]">
                <b className="text-[15px] text-fg">{d?.marketing.length ?? 0}건</b>
                <span className="text-fg-subtle">{d?.mktDays ?? 0}일 진행</span>
              </p>
            ), mktTab === 'track' ? (d?.mktItemCounts ?? []).map((c) => (
              <Chip key={c.key} size="compact" styleKind="solid" tone={MKT_ITEM_TONE[c.key] ?? 'neutral'}>{c.label} {c.count}</Chip>
            )) : null)}
            {mktTab === 'minutes' ? meetingList(marketingMeetings, '이 기간에는 마케팅 회의가 없습니다')
              : mktTab === 'fb' ? (
              <MarketingFeedback
                threads={d?.feedback ?? []}
                needsFix={d?.feedbackNeedsFix ?? 0}
                canComment={d?.canComment === true}
                viewerId={viewerId}
                marketing={d?.marketing ?? []}
              />
            ) : (
              <>
                {/* 원문 §59 필터 띠 「어디에 · 누가」 — 건수가 있는 것만 · 많은 순 · 수는 서버 (59-4). 거르기는 받은 줄에서 한다 */}
                <div className="mb-3 flex flex-col gap-1.5 rounded-xl bg-inset px-3 py-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-10 shrink-0 text-[11px] font-bold text-fg-subtle">어디에</span>
                    <ChipRow ariaLabel="어디에" value={mktChannel} onChange={setMktChannel} pressedTone="ink"
                      allCount={d?.marketing.length ?? 0}
                      options={(d?.mktChannelCounts ?? []).map((c) => ({ value: c.key, label: c.label, count: c.count }))} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-10 shrink-0 text-[11px] font-bold text-fg-subtle">누가</span>
                    <ChipRow ariaLabel="누가" value={mktBy} onChange={setMktBy} pressedTone="ink"
                      allCount={d?.marketing.length ?? 0}
                      options={(d?.mktByCounts ?? []).map((c) => ({ value: c.key, label: c.label, count: c.count }))} />
                  </div>
                </div>
                {/* 원문 §59 「주간」 일곱 칸 카드판(g6 59-2)은 아직 표다 — 카드의 시각 칸이 정해지지 않았고(N-29 는 메모만), 컷에 없는
                    성과(비용 · 등록당)를 어디에 둘지가 함께 정해져야 한다. 메모 한 줄은 활동 이름 아래에 선다(N-29 ②) */}
                <Table columns={mktCols} rows={mktRows} rowKey={(r) => r.id} empty="이 기간에는 활동이 없습니다" />
                {d && !d.canSeeAmounts ? (
                  <Banner tone="warning" className="mt-3">집행 비용과 등록당 비용은 <b>대표만</b> 봅니다.</Banner>
                ) : null}
              </>
            )}
          </>
        )
        : tab === 'plan' ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              {/* 원문 §61·§62 의 속 갈래는 카드형 탭이다 (C-6) — 동그라미는 대표 손이 가야 할 기획(서버 planPending) */}
              <TabCards label="기획 보기" value={planTab} onChange={setPlanTab} options={[
                { value: 'board', label: '단계 보드', sub: `${d?.plans.length ?? 0}건`,
                  badge: d?.planPending ?? 0, badgeSr: d?.planPending ? `${d.planPending}건` : undefined },
                { value: 'due', label: '기한', sub: `${d?.planDues.length ?? 0}건` },
              ]} />
              {/* 원본 §61 머리 오른쪽의 「+ 기획 올리기」 (N-46 ③ · C96) — 단계는 고르지 않는다 */}
              <PlanCreateButton can={d?.canCreatePlan === true} shareWords={d?.planShares}
                onDone={(r) => setNotice(`기획을 올렸습니다 — ${r.plan.title} · ${r.plan.stageLabel}${r.plan.ownerName ? ` · 담당 ${r.plan.ownerName}` : ''}`)} />
            </div>
            {planTab === 'due' ? (
              <>
                {/* 원문 §62 머리 띠 — 숫자는 서버가 센다 (D-R37) */}
                <Banner tone={d?.planOverdue ? 'danger' : 'neutral'} className="mb-3">
                  <b>기한 지난 것 {d?.planOverdue ?? 0}건</b>
                  <span className="ml-2 text-[12px] text-fg-2">대표는 기한을 봅니다 · 지나면 붉게 나옵니다</span>
                </Banner>
                {/* 원문 §62 — 지난 줄은 분홍 바탕이다 (62-2). 판정은 서버의 overdueDays */}
                <Table columns={dueCols} rows={d?.planDues ?? []} rowKey={(r) => r.key}
                  rowClassName={(r) => (r.overdueDays > 0 ? 'bg-red/5' : undefined)}
                  empty="기한이 걸린 기획이 없습니다" />
              </>
            ) : (
              <>
                {/* 원문 §61 보드 머리 한 줄 (61-8) */}
                <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-[15px] font-bold text-fg">
                  기획 결재
                  <span className="text-[11.5px] font-normal text-fg-subtle">왼쪽에서 오른쪽으로 올립니다 · 카드를 누르면 보고서가 열립니다</span>
                </h3>
                {/* 칸 머리 = 윗선 단계색 · 번호 원 채움 · 오른쪽 큰 단계색 건수(g6 C-9) */}
                <Board numbered accent countStyle="big" columns={planCols} itemKey={(p) => p.id}
                  cardClassName={(p) => (p.overdueDays > 0 ? OVERDUE_CARD : undefined)} renderCard={(p) => (
                  /* 원문 §61 카드 차례 — 칩 줄 → 제목 → 담당 ··· 과제 → 구분선 → 기한 → 기한 상태 칩 (61-1 · 61-2 · 61-3 · 61-6).
                     셈과 낱말은 전부 서버다: 「과제 N/M」 · 「4일 지남」 · 기한 상태 이름 (D-R37 · D-R18) */
                  <button type="button" className="block w-full text-left" onClick={() => setPlanId(p.id)}>
                    {/* 원본 §61 카드 머리 칩 줄 — 「전체 공개」·「지정 공개」(W11 · N-72 · 옛 기획은 칩 없음) 다음 「보완 1」.
                        보완 수는 서버가 `log` 에서 센다 (S6). 손으로 박은 옛 건은 0 이라 칩이 서지 않는다 (N-25) */}
                    {p.shareLabel || p.reworkCount > 0 ? (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {p.shareLabel ? <Chip size="compact" styleKind="solid" tone={PLAN_SHARE_TONE[p.share ?? ''] ?? 'neutral'}>{p.shareLabel}</Chip> : null}
                        {p.reworkCount > 0 ? <Chip size="compact" styleKind="solid" tone="danger">보완 {p.reworkCount}</Chip> : null}
                      </div>
                    ) : null}
                    <div className="text-[12px] font-bold text-fg">{p.title}</div>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[10.5px]">
                      <span className="font-bold text-fg-2">{p.ownerName ?? '—'}</span>
                      {p.taskTotal > 0 ? <span className="text-fg-subtle">과제 {p.taskDone}/{p.taskTotal}</span> : null}
                    </div>
                    {/* 반려된 기한은 반려가 지운 날짜로 선다 — 원문 「D-2 08-19 · 기한 반려」(W11 · N-95 · 낱말·남은 날은 서버) */}
                    {p.dueOn || p.dueRejectedOn ? (
                      <div className="mt-1.5 border-t border-line pt-1.5">
                        <div className="flex items-baseline gap-1.5 text-[10.5px]">
                          {p.dueLabel ? <b className={p.overdueDays > 0 ? 'text-red' : 'text-fg'}>{p.dueLabel}</b> : null}
                          <span className="text-fg-subtle">{(p.dueOn ?? p.dueRejectedOn ?? '').slice(5)}</span>
                        </div>
                        {/* 기한이 대표를 지나왔는지는 서버가 판정한다 (원문 §61·§65) — 색은 §65 와 같은 빛깔 */}
                        {p.dueState === 'none' ? null : (
                          <Chip className="mt-1" size="compact" styleKind="solid" tone={PLAN_DUE_TONE[p.dueState] ?? 'warning'}>{p.dueStateLabel}</Chip>
                        )}
                      </div>
                    ) : null}
                  </button>
                )} />
              </>
            )}
          </>
        ) : (
          <>
            {/* 원본 §67 머리 오른쪽의 「+ 접수」 (N-46 ① · C93) · 강사 교체는 컴플레인 없이도 연다 (D-46 퇴사 · N-132 당일 대강) */}
            {/*
              §67 갈래 칩 줄 — 이 칩만은 **서버로 간다** (J-102 「지난달 컴플레인만」).
              건수는 갈래를 안 건 채로 세므로 다른 갈래도 계속 고를 수 있다.
              「전체」의 수는 그 갈래 건수의 합이다(67-4) — 할 일 칩의 「전체 N」과 같은 규약이고,
              갈래를 골라 받은 목록이 좁아져도 바뀌지 않는다(목록 줄 수를 세지 않는다).
            */}
            {/* 원문 §67 의 속 갈래(카드형) 「단계 보드 · 이력」과 「기한 지남 N」 (w5 · 67-1 · 67-2) — 수는 서버 값 */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <TabCards label="컴플레인 보기" value={cplTab} onChange={setCplTab} options={[
                { value: 'board', label: '단계 보드', sub: `${d?.complaints.length ?? 0}건`,
                  badge: d?.cplOverdue ?? 0, badgeSr: d?.cplOverdue ? `${d.cplOverdue}건` : undefined },
                { value: 'history', label: '이력', sub: `${d?.complaints.length ?? 0}건 전체` },
              ]} />
              {/* 원문 §67 「기한 지남 2」 — 호박색 채운 칩 (67-2 · x5) */}
              {(d?.cplOverdue ?? 0) > 0 ? <Chip styleKind="solid" tone="warning">기한 지남 {d?.cplOverdue}</Chip> : null}
              {/* 오른쪽 끝 — 「강사 교체」(원문 규칙 「선생님 컴플레인은 그 자리에서 강사 변경 마법사」 · D-46) · 「+ 접수」 주 단추 (C-7) */}
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setWizard({})}>강사 교체</Button>
                <ComplaintCreateButton areas={d?.cplAreas ?? []} severities={d?.cplSeverities ?? []} requesters={d?.cplRequesters ?? []}
                  onDone={(row) => setNotice(`접수했습니다 — ${row.areaLabel} · ${row.studentName ?? '문의자'}${row.ownerName ? ` · 담당 ${row.ownerName}` : ''}`)} />
              </div>
            </div>
            {/*
              원문 §67 기간 띠 「일별 주별 월별 전체」(기본 월별 · 「‹ 2026년 8월 › 오늘」) · 같은 줄 오른쪽에 갈래 칩 (67-3 · 67-4 · C-5).
              갈래 칩은 색 점 · 진한 채움 · 0 건은 숫자 없이 「상담」 — 칩 줄은 어휘라 0 건도 선다(C66). 「전체」의 수는 서버 갈래 건수의 합.
            */}
            {periodBand('complaint', null, (
              <ChipRow ariaLabel="컴플레인 갈래" value={area} onChange={setArea} pressedTone="ink"
                allCount={(d?.areaCounts ?? []).reduce((n, c) => n + c.count, 0)}
                options={(d?.areaCounts ?? []).map((c) => ({
                  value: c.key, label: c.label, count: c.count > 0 ? c.count : undefined, dot: CPL_AREA_DOT[c.key],
                }))} />
            ))}
            <p className="mb-2 text-[11px] text-fg-subtle">카드를 누르면 담당 · 단계 · 조치 · 결과를 적습니다</p>
            {cplTab === 'history' ? (
              <Table columns={cplHistoryCols} rows={d?.complaints ?? []} rowKey={(r) => r.id} empty="이 기간에는 컴플레인이 없습니다" />
            ) : (
            <Board numbered accent countStyle="big" columns={cplCols} itemKey={(c) => c.id}
              cardClassName={(c) => (c.overdueDays > 0 ? OVERDUE_CARD : undefined)} renderCard={(c) => (
              <button type="button" className="block w-full text-left" onClick={() => setCplId(c.id)} aria-label={`컴플레인 ${c.body}`}>
                <div className="flex flex-wrap items-center gap-1">
                  {/* 갈래 칩은 갈래마다 제 색 · 채움 — 원문 §67 (67-7). 낱말은 서버의 areaLabel */}
                  <Chip size="compact" styleKind="solid" tone={CPL_AREA_TONE[c.area] ?? 'purple'}>{c.areaLabel}</Chip>
                  {/* 심각도 — 원본 §67 카드의 가벼움 회색 · 보통 주황 · 심각 빨강 (67-7). 낱말은 서버, 옛 건(null)은 칩이 서지 않는다 (N-25) */}
                  {c.severityLabel ? <Chip size="compact" styleKind="solid" tone={CPL_SEVERITY_TONE[c.severity ?? ''] ?? 'neutral'}>{c.severityLabel}</Chip> : null}
                  {c.teacherChanged ? <Chip size="compact" tone="info">강사 교체됨</Chip> : null}
                </div>
                <div className="mt-1.5 text-[12px] font-bold text-fg">{c.body}</div>
                {/* 원문 카드에는 조치·결과 글이 없다(67-7) — 그 글은 카드를 눌러 여는 처리 창과 「이력」 표에 있다 */}
                {/* 학생 이름 옆에 누가 알렸는지 — 원본 §67 「고은설 어머니」 (67-5 · wave 6). 낱말은 서버, 모르는 건(옛 행)은 붙이지 않는다 */}
                <div className="mt-1 text-[10.5px] text-fg-subtle">
                  <span className="font-bold text-fg-2">{c.studentName ?? '문의자'}</span>
                  {c.requesterLabel ? <span className="ml-1">{c.requesterLabel}</span> : null}
                </div>
                {/*
                  원본 §67 카드의 바닥 줄 — 왼쪽에 담당, 오른쪽에 지난 날. 기한이 지났으면 그것이 먼저다 (J-98 · 서버가 센다).
                  **담당이 없는 것은 빈칸이 아니라 할 일이다** — 접수 칸의 한 줄이 그렇게 말한다.
                */}
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-1.5 text-[10.5px]">
                  {c.ownerName
                    ? <Chip size="compact" tone="neutral">{c.ownerName}</Chip>
                    : <span className="font-bold text-red">담당 없음</span>}
                  {/* 결과 칸은 마무리한 날 — 원본 §67 「08-12」 (67-6 · wave 6). 날짜는 「결과」로 옮긴 순간 서버가 찍은 것이고,
                      모르는 옛 결과 건은 「—」 — 접수 뒤 경과일로 대신 적지 않는다 */}
                  {c.overdueDays > 0
                    ? <Chip size="compact" tone="danger">기한 {c.overdueDays}일 지남</Chip>
                    : c.stage === 'closed'
                      ? (c.closedOn
                        ? <span className="font-bold text-fg-2">{c.closedOn.slice(5)}</span>
                        : <span className="text-fg-subtle" title="마무리 날짜 기록 없음">—</span>)
                      : <span className="font-bold text-fg-2">
                        {c.dueOn ? `기한 ${c.dueOn.slice(5)} · ` : ''}{c.ageDays}일 지남
                      </span>}
                </div>
              </button>
            )} />
            )}
          </>
        )}

      {/* 서랍 §17 과 **같은 창**이다 (C96) — 경로가 하나니 창도 하나다 */}
      <TodoCreateDialog
        open={todoOpen} onClose={() => setTodoOpen(false)} busy={todoWrite.isPending}
        meId={viewerId} people={meta.data?.staff ?? []}
        onCreate={(body) => todoWrite.mutate({ kind: 'todoCreate', body }, {
          onSuccess: () => setNotice(`할 일을 주었습니다 — ${body.title}`),
        })}
      />
      {editingTodo && canAdminPage && canCrudAll ? <TodoCreateDialog
        open editing={editingTodo} busy={todoWrite.isPending} onClose={() => setTodoEditId(null)}
        onSave={async (body) => {
          await todoWrite.mutateAsync({ kind: 'todoPatch', id: editingTodo.id, body });
          setNotice(`기한을 고쳤습니다 — ${editingTodo.title}`);
        }}
      /> : null}
      <PlanReport planId={planId} staff={meta.data?.staff} shareWords={d?.planShares} onClose={() => setPlanId(null)} />
      <MarketingEditDialog row={editingMarketing} channels={d?.mktChannels ?? []} items={d?.mktItems ?? []}
        onClose={() => setEditingMarketing(null)}
        onDone={(row) => { setEditingMarketing(null); setNotice(`고쳤습니다 — ${row.name}`); }} />
      <SuggestionsAdmin open={suggestionOpen} rows={d?.suggestions ?? []}
        onClose={() => router.replace(`/ops?tab=${tab}`)} />
      <MeetingDetail meetingId={meetingId} staff={meta.data?.staff} onClose={() => setMeetingId(null)} />
      <ComplaintDetail
        complaint={(d?.complaints ?? []).find((c) => c.id === cplId) ?? null}
        stages={d?.cplStages ?? []}
        severities={d?.cplSeverities ?? []}
        requesters={d?.cplRequesters ?? []}
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
          onDone={(r) => { setWithdrawOf(null); setNotice(`수강 종료 — ${withdrawOf.studentName ?? ''} · 환불 ${won(r.refundTotal)} · 컴플레인 #${withdrawOf.id} 사유로 남김`); }}
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
