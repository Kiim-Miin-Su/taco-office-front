/** @file-guide
 * 목적: panes.tsx — ApReview, ApprovalsPane, TodoBox, TodosPane, NotisPane 등 (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 서랍 여덟 칸의 **본문**. 껍데기(`Drawer`)와 탭은 `AppDrawer` 가 갖는다.
 *
 * 여기 있는 것은 전부 「받은 것을 그리는」 함수다 — 판정이 없다.
 * 배지 숫자·정렬·권한은 서버의 `apFlow()` 가 이미 끝냈고 화면은 그 결과만 읽는다.
 * 그래야 §14 승인 대기함과 §75 결재 흐름이 **같은 숫자**를 말한다 (D-R26).
 */
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlarmClock, ArrowLeftRight, Bell, Check, CornerDownLeft, Info, type LucideIcon } from 'lucide-react';
import {
  Banner, Button, Checkbox, Chip, ChipButton, ConflictGuard, Input, Label, Segmented, Select, Table,
  cn, type Column, type Tone,
} from '@/components/ui';
import { ZoomGrid } from '@/components/zoom/ZoomGrid';
import {
  approvalCategoryTone, approvalKindLabel, ApprovalRowContent, TONE_MARK,
} from '@/components/approval/ApprovalRowContent';
import type {
  ApFlow, ApRow, ChangeReq, ConflictRow, Drawer as DrawerData, DrawerTodo, DrawerTodoCreate,
  Kind, KindRow, MemberGroup, Noti, Occurrence, PhoneCountry, Room, StaffBrief, Sub, TzGroup, Zacc, ZoomAccount, ZoomBoard,
} from '@/api/types';
import {
  addDays, conflictLines, dowOf, hhmm, KO_DOW, label, lessonTimeIssue, monthBounds, parseHm, step, todayKst, weekDays,
} from '@/lib/calendar';
import { REQ_TYPE_LABEL, ROLE_BAR, ROLE_TEXT } from '@/lib/roles';
import { won } from '@/lib/money';
import { occurrenceTargetValue, parseOccurrenceTarget, type ChangeReqDraft, type ChreqType } from './change-request';
import { MemberCreateButton } from './MemberCreateDialog';
import { MemberRowActions } from './MemberRowActions';
import { WageChangeButton } from './WageChangeDialog';
import { TodoCreateDialog } from './TodoCreateDialog';

export { changeReqBody, changeReqReady, EMPTY_DRAFT, newChangeReqDraft, type ChangeReqDraft } from './change-request';

/**
 * 원문 §14·§16 의 **누르는 칩** — 눌린 칩은 어두운 채움, 나머지는 흰 바탕에 분류 색 점(g2 대조 14-8 · 16-3).
 * 두 칸이 같은 모양을 각자 그리던 것을 한 벌로 모았다. 공용 `ChipRow` 는 눌린 모양이 파란 채움이라 원문과 달라 쓰지 않는다.
 */
function FilterPill({ pressed, dot, onClick, children }: {
  pressed: boolean; dot?: string; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors',
        pressed ? 'border-fg bg-fg text-card' : 'border-line bg-card text-fg hover:border-primary/50',
      )}
    >
      {dot ? <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', dot)} /> : null}
      {children}
    </button>
  );
}

/** 「반려」·「끝난 것 지우기」처럼 되돌리기 어려운 쪽 — 원문은 흰 바탕에 붉은 글자·옅은 붉은 테두리다(g2 14-10) */
const DANGER_OUTLINE = '!border-red/40 !text-red';

/**
 * 서랍 맨 아래의 **목적지 단추** — 원문 §18 「프로그램 · 과목 전체 열기」와 §21 「줌 계정 관리」다.
 * 서랍은 읽기만 하고 쓰기는 목적지에서 한다는 원문의 갈래를 이 한 줄이 잇는다.
 */
const OpenAll = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="mt-3 block">
    {/* 색·높이는 UI/Button 이 소유한다 — 여기서 다시 칠하지 않는다 (D-R41) */}
    <Button variant="primary" className="w-full">{children}</Button>
  </Link>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="px-1 py-8 text-center text-[12px] text-fg-subtle">{children}</p>
);

const Section = ({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) => (
  <section className="mb-5">
    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-fg">
      {title}
      {count !== undefined ? <Chip tone={count > 0 ? 'info' : 'neutral'}>{count}</Chip> : null}
    </h3>
    {children}
  </section>
);

/* ── §14 승인 대기함 ─────────────────────────────────────────────────
   원문 §14 는 **줄마다 「반려」「승인」**을 갖는다. D-R27 의 「이동만」은 §75 결재 흐름
   오버레이의 규칙이고, D-R13(반려 사유 필수)의 절 칸에는 14 가 들어 있다 —
   반려 사유가 필수인 화면이 곧 반려하는 화면이다.

   다만 **적용 경로가 실제로 있는 갈래만** 여기서 처리한다. 서버가 줄마다 `canAct` 로
   말해 주고, 나머지는 지금처럼 그 화면으로 보낸다 — 눌러도 아무 일이 없는 승인 단추를
   그리는 것보다 「아직 저기서 합니다」가 정직하다.                        */

export interface ApReview { id: number; kind: string; decision: 'approve' | 'reject'; reason?: string }

/**
 * 한 줄 처리 — 원문 §14 처리 줄에는 **「반려」·「승인」 두 단추만** 있다 (g2 대조 14-5).
 *
 * 사유 칸은 **「반려」를 누른 뒤에만** 펼쳐진다 — 늘 펼쳐 두면 줄마다 빈 입력이 서서 승인만 할
 * 사람에게도 「사유를 적어야 하나」를 묻는다. 반려는 사유를 적어야 확정 단추가 열리고(D-R13)
 * 두 번째 누름이 확정이다. 승인도 두 번 눌러야 나간다. 펼친 사유 칸은 「취소」로 접는다.
 */
function ApActions({ r, onReview, busy }: {
  r: ApRow; onReview: (v: ApReview) => void; busy: boolean;
}) {
  const [armed, setArmed] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const send = (decision: 'approve' | 'reject') => {
    setArmed(null);
    // 승인에는 사유 칸이 없다 — 접혀 보이지 않는 글자를 함께 보내지 않는다
    onReview({ id: r.id, kind: r.kind, decision, reason: decision === 'reject' ? reason.trim() || undefined : undefined });
  };
  const rejecting = armed === 'reject';
  return (
    <div className="mt-2">
      {rejecting ? (
        <div className="mb-1.5 rounded-md border border-red/30 bg-red/5 p-2">
          <Label htmlFor={`ap-why-${r.id}`} hint="반려 시 필수">사유</Label>
          <Input
            id={`ap-why-${r.id}`}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="왜 반려하는지 적어 주세요 — 올린 사람에게 그대로 갑니다"
          />
        </div>
      ) : null}
      <div className="flex justify-end gap-1.5">
        {rejecting ? (
          <Button size="sm" variant="ghost" onClick={() => { setArmed(null); setReason(''); }}>취소</Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          className={DANGER_OUTLINE}
          // 펼친 뒤에는 사유가 있어야 확정이 열린다 (D-R13)
          disabled={busy || (rejecting && !reason.trim())}
          onClick={() => (rejecting ? send('reject') : setArmed('reject'))}
        >
          {rejecting ? '한 번 더 누르면 반려' : '반려'}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => (armed === 'approve' ? send('approve') : setArmed('approve'))}
        >
          {armed === 'approve' ? '한 번 더 누르면 승인' : '승인'}
        </Button>
      </div>
    </div>
  );
}

function ApList({ rows, onGo, onReview, busy }: {
  rows: ApRow[]; onGo: () => void;
  onReview?: (v: ApReview) => void; busy?: boolean;
}) {
  if (rows.length === 0) return <Empty>없습니다</Empty>;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={`${r.kind}-${r.id}`}>
          {r.canAct && onReview ? (
            <div className="rounded-lg border border-line bg-card p-2.5">
              <ApprovalRowContent row={r} variant="inbox" />
              <ApActions r={r} onReview={onReview} busy={!!busy} />
            </div>
          ) : (
            <Link
              href={r.go} onClick={onGo}
              /* 못 처리하는 이유가 있으면 그것을 말한다 (S5) — 시급 요청은 `canWage` 까지 있어야 승인된다 */
              title={r.actBlockedReason ?? undefined}
              className="block rounded-lg border border-line bg-card p-2.5 transition-colors hover:border-blue hover:bg-blue/5"
            >
              <ApprovalRowContent row={r} variant="inbox" />
              {r.actBlockedReason ? (
                <p className="mt-1 text-[11px] text-fg-subtle">{r.actBlockedReason}</p>
              ) : null}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ApprovalsPane({ flow, onGo, onReview, busy, error }: {
  flow: ApFlow; onGo: () => void;
  onReview?: (v: ApReview) => void; busy?: boolean; error?: string | null;
}) {
  const [filter, setFilter] = useState<string>('all');
  const actionable = flow.inbox.filter((r) => r.canAct).length;
  const linkOnly = flow.inbox.length - actionable;
  const shown = flow.inbox.filter((row) => filter === 'all' || row.category === filter);
  return (
    <>
      {/*
        원문 §14 머리는 평문 한 줄이다 — 건수는 서버가 센 inboxCount(g2 14-9). 전건이 뜨고 자동 승인이 없다는 규칙은
        목록 자체가 말한다. 「모든 처리는 되돌리기로 취소됩니다」는 결재 되돌리기가 생길 때까지 적지 않는다
        (14-1 결정 대기 — 없는 기능을 말하게 된다). 단추 없는 줄(N-12)이 있으면 어디서 처리하는지만 덧붙인다.
      */}
      <p className="mb-3 text-[12.5px] leading-relaxed text-fg-2">
        강사·코디네이터가 올린 요청이 <b className="text-fg">{flow.inboxCount}건</b> 대기 중입니다.
        {actionable > 0 ? (
          <> 반려에도 <b className="text-fg">사유</b>가 남습니다.{linkOnly > 0 ? ' 단추가 없는 줄은 줄을 눌러 그 화면에서 처리합니다.' : ''}</>
        ) : (
          <> 줄을 눌러 그 화면에서 처리합니다.</>
        )}
      </p>
      {error ? <Banner tone="danger" className="mb-4">{error}</Banner> : null}
      {flow.missingKinds.length > 0 ? (
        <Banner tone="warning" className="mb-4">
          아직 표가 없어 이 목록에 오지 않는 갈래가 있습니다 —{' '}
          <b>{flow.missingKinds.map(approvalKindLabel).join(' · ')}</b>.
          없는 것이 아니라 못 세는 것입니다.
        </Banner>
      ) : null}
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="승인 요청 분류">
        {[
          { key: 'all', label: '전체', count: flow.inboxCount },
          ...flow.categories.filter((category) => category.count > 0 || category.key !== 'other'),
        ].map((category) => (
          <FilterPill
            key={category.key}
            pressed={filter === category.key}
            // 분류 칩 앞의 점은 카드 배지와 같은 색이다 — 「전체」에는 점이 없다 (g2 14-8)
            dot={category.key === 'all' ? undefined : TONE_MARK[approvalCategoryTone(category.key)].dot}
            onClick={() => setFilter(category.key)}
          >
            {category.label} {category.count}
          </FilterPill>
        ))}
      </div>
      <ApList rows={shown} onGo={onGo} onReview={onReview} busy={busy} />
    </>
  );
}

/* ── §15 할 일 ───────────────────────────────────────────────────── */

export type TodoBox = 'in' | 'out' | 'all';
export type TodoPeriod = 'day' | 'week' | 'month';

/** §15 기간 이동·그룹은 달력과 같은 KST 날짜 유틸을 재사용한다. */
export function todoPeriodBounds(period: TodoPeriod, anchor: string): { from: string; to: string } {
  if (period === 'day') return { from: anchor, to: anchor };
  if (period === 'month') return monthBounds(anchor);
  const days = weekDays(anchor);
  return { from: days[0], to: days[6] };
}

function stepTodoPeriod(period: TodoPeriod, anchor: string, direction: -1 | 1): string {
  if (period === 'month') return step('month', anchor, direction);
  return addDays(anchor, (period === 'week' ? 7 : 1) * direction);
}

/** 기간 낱말 — 원문 §15 주간은 「08-17 ~ 08-23」이다(g2 15-3). 일간은 달력과 같은 낱말, 월간은 「2026년 8월」 */
function todoPeriodLabel(period: TodoPeriod, anchor: string): string {
  const range = todoPeriodBounds(period, anchor);
  if (period === 'month') return `${+anchor.slice(0, 4)}년 ${+anchor.slice(5, 7)}월`;
  if (period === 'day') return label(anchor);
  return `${range.from.slice(5)} ~ ${range.to.slice(5)}`;
}

/**
 * 원문 §15 요일 **카드** — 머리 「목 20」 + 오른쪽 「끝낸 것/전체」 배지, 항목은 카드 안(g2 15-2).
 * 빈 날은 한 줄로 접힌 카드(오른쪽 「—」)이고, **오늘 카드는 갈색 테두리**다. 항목 줄은 운영 §64 와 같은 `TodoRows` 다.
 */
function TodoDayCard({ heading, items, today = false, busy, onToggle }: {
  heading: ReactNode; items: DrawerTodo[]; today?: boolean; busy: boolean;
  onToggle: (id: number, done: boolean) => void;
}) {
  if (items.length === 0) {
    return (
      <section className={cn('flex items-center justify-between rounded-lg border bg-inset px-3 py-2', today ? 'border-primary' : 'border-line')}>
        <h3 className="text-[13px] font-bold text-fg-subtle">{heading}</h3>
        <span aria-hidden className="text-fg-subtle">—</span>
      </section>
    );
  }
  const done = items.filter((t) => t.done).length;
  return (
    <section className={cn('overflow-hidden rounded-lg border bg-card', today ? 'border-primary' : 'border-line')}>
      <div className="flex items-center justify-between bg-inset px-3 py-2">
        <h3 className="text-[13px] font-bold text-fg">{heading}</h3>
        <Chip tone="warning" styleKind="solid" title={`끝낸 것 ${done} / 전체 ${items.length}`}>{done}/{items.length}</Chip>
      </div>
      <div className="p-2">
        <TodoRows items={items} busy={busy} onToggle={onToggle} />
      </div>
    </section>
  );
}

const TODO_SOURCE_DOT: Record<string, string> = {
  meeting: 'bg-violet', complaint: 'bg-red', consulting: 'bg-amber', plan: 'bg-green', manual: 'bg-blue', lesson: 'bg-blue',
};

/** 서랍과 운영이 같은 행을 쓴다. 기간·상태·권한·mutation은 부르는 화면이 소유한다. */
export function TodoRows({ items, busy, onToggle, onEdit }: {
  items: Array<Pick<DrawerTodo, 'id' | 'title' | 'done' | 'src' | 'srcLabel' | 'fromName' | 'toName' | 'overdueDays'> & Partial<Pick<DrawerTodo, 'go'>>>;
  busy: boolean;
  onToggle: (id: number, done: boolean) => void;
  onEdit?: (id: number) => void;
}) {
  return items.length === 0 ? (
    <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11px] text-fg-subtle">할 일 없음</p>
  ) : (
    <ul className="flex flex-col gap-1.5">
      {items.map((t) => (
        <li key={t.id} className="flex items-start gap-2 rounded-lg border border-line bg-card p-2.5">
          <Checkbox
            checked={t.done} disabled={busy}
            onChange={(e) => onToggle(t.id, e.currentTarget.checked)}
            className="mt-0.5 shrink-0"
            aria-label={`${t.title} 완료`}
          />
          <div className="min-w-0 flex-1">
            <p className={`text-[12px] font-bold ${t.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>
              {t.title}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-subtle">
              <span className={`h-2 w-2 rounded-full ${TODO_SOURCE_DOT[t.src] ?? 'bg-line'}`} aria-hidden />
              <span>{t.srcLabel}</span>
              <span>· {t.fromName ?? '—'} → {t.toName ?? '—'}</span>
              {t.overdueDays > 0 ? <Chip tone="danger">{t.overdueDays}일 지남</Chip> : null}
            </p>
          </div>
          {onEdit ? <Button size="sm" disabled={busy} onClick={() => onEdit(t.id)} aria-label={`${t.title} 기한 고치기`}>고치기</Button> : null}
          {t.go ? (
            <Link href={t.go} className="shrink-0 text-[11px] font-bold text-blue hover:underline">원본</Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function TodosPane({ todos, members, meId, box, onBox, onToggle, onCreate, onClear, busy }: {
  todos: DrawerTodo[]; meId: number | null;
  members: DrawerData['members'];
  box: TodoBox; onBox: (b: TodoBox) => void;
  onToggle: (id: number, done: boolean) => void; busy: boolean;
  onCreate: (body: DrawerTodoCreate) => void;
  /** §15 「끝난 것 지우기」 — **지금 세고 있는 그 줄들**을 넘긴다 (S4 · 단추의 숫자와 지워지는 수가 같다) */
  onClear: (ids: number[]) => void;
}) {
  const [period, setPeriod] = useState<TodoPeriod>('week');
  const [anchor, setAnchor] = useState(todayKst);
  const [creating, setCreating] = useState(false);

  const scoped = todos.filter((t) =>
    box === 'all' ? true : box === 'in' ? t.toId === meId : t.fromId === meId);
  const range = todoPeriodBounds(period, anchor);
  // 날짜가 없는 할 일은 어느 기간에서도 잃지 않고 별도 묶음으로 보여 준다.
  const rows = scoped.filter((t) => !t.dueOn || (t.dueOn >= range.from && t.dueOn <= range.to));
  const left = rows.filter((t) => !t.done).length;
  const overdue = rows.filter((t) => !t.done && t.overdueDays > 0).length;
  // 단추의 숫자와 보낼 목록이 **같은 배열**에서 나온다 — 두 벌이면 또 갈린다 (D-R22 · S4)
  const doneRows = rows.filter((t) => t.done);
  const done = doneRows.length;
  const dated = rows.filter((t) => t.dueOn);
  const dayKeys = period === 'week'
    ? weekDays(anchor)
    : period === 'day'
      ? [anchor]
      : [...new Set(dated.map((t) => t.dueOn!))].sort();
  const undated = rows.filter((t) => !t.dueOn);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        {/* 보기 전환은 Segmented 하나만 쓴다 — 여기서 손으로 그렸다가 활성 알약 모양이 두 벌이 됐다 */}
        <Segmented
          value={box}
          onChange={onBox}
          options={[
            { value: 'in', label: '수신함' },
            { value: 'out', label: '발신함' },
            { value: 'all', label: '전체' },
          ]}
        />
        <Button className="ml-auto" variant="primary" size="sm" onClick={() => setCreating(true)}>+ 할 일</Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'day', label: '일간' },
            { value: 'week', label: '주간' },
            { value: 'month', label: '월간' },
          ]}
        />
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" aria-label="이전 기간" onClick={() => setAnchor(stepTodoPeriod(period, anchor, -1))}>‹</Button>
          <span className="min-w-[150px] text-center text-[11px] font-bold text-fg">{todoPeriodLabel(period, anchor)}</span>
          <Button size="sm" aria-label="다음 기간" onClick={() => setAnchor(stepTodoPeriod(period, anchor, 1))}>›</Button>
          <Button size="sm" onClick={() => setAnchor(todayKst())}>오늘</Button>
        </div>
      </div>

      {/*
        원문 §15 요약은 **한 줄**이다 — 「6건 [안 끝난 것 5] [기한 지남 2] … [끝난 것 지우기]」 + 아래 선(g2 15-1).
        수는 지금처럼 같은 `rows` 배열에서 센다 — 단추의 숫자와 지우는 목록도 같은 배열이다(S4).
        칩은 0 이어도 선다 — 칩 줄은 어휘이지 데이터가 아니다(C66).
      */}
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
        <span className="text-[15px] font-bold text-fg">{rows.length}건</span>
        <Chip tone="warning">안 끝난 것 {left}</Chip>
        <Chip tone="danger" styleKind="solid">기한 지남 {overdue}</Chip>
        <Button className={cn('ml-auto', DANGER_OUTLINE)} size="sm" variant="secondary" disabled={busy || done === 0}
          onClick={() => onClear(doneRows.map((t) => t.id))}>끝난 것 지우기</Button>
      </div>

      <div className="flex flex-col gap-2">
        {dayKeys.map((day) => (
          <TodoDayCard
            key={day}
            heading={<>{KO_DOW[dowOf(day)]} <span className="ml-1 text-[15px]">{Number(day.slice(8))}</span></>}
            items={rows.filter((t) => t.dueOn === day)}
            today={day === todayKst()}
            busy={busy} onToggle={onToggle}
          />
        ))}
        {undated.length > 0 ? (
          <TodoDayCard heading="기한 없음" items={undated} busy={busy} onToggle={onToggle} />
        ) : null}
        {dayKeys.length === 0 && undated.length === 0 ? <Empty>이 기간에는 할 일이 없습니다</Empty> : null}
      </div>

      {/* 창은 운영 §64 의 「+ 할 일 주기」와 **같은 것**이다 (C96) — 경로가 하나니 창도 하나다 */}
      <TodoCreateDialog
        open={creating} onClose={() => setCreating(false)} busy={busy} meId={meId}
        people={members.filter((member) => member.active)}
        onCreate={onCreate}
      />
    </>
  );
}

/* ── §16 알림 ────────────────────────────────────────────────────── */

/**
 * §16 카드의 **분류 아이콘 타일**과 칩 앞 점 — 원문 🔔 재알람 · ⏰ 작성 독촉 · ↩ 요청 처리 · ✓ 리포트 · ⇄ 일정 변경(g2 16-1 · 16-3).
 * 분류 코드표는 서버가 갖고(`lib/noti.ts`) 여기는 코드값 → 그림·토큰 대응만 한 곳에 둔다(D-R41).
 */
const NOTI_LOOK: Readonly<Record<string, { icon: LucideIcon; tile: string; dot: string }>> = {
  report_due: { icon: AlarmClock, tile: 'bg-red/10 text-red', dot: 'bg-red' },
  re_alarm: { icon: Bell, tile: 'bg-red/10 text-red', dot: 'bg-primary' },
  report: { icon: Check, tile: 'bg-green/10 text-green', dot: 'bg-green' },
  schedule: { icon: ArrowLeftRight, tile: 'bg-amber/10 text-amber', dot: 'bg-amber' },
  request: { icon: CornerDownLeft, tile: 'bg-blue/10 text-blue', dot: 'bg-blue' },
  etc: { icon: Info, tile: 'bg-inset text-fg-2', dot: 'bg-fg-subtle' },
};
const notiLook = (category: string) => NOTI_LOOK[category] ?? NOTI_LOOK.etc!;

/**
 * §16 알림 — 분류 칩 · 날짜 묶음 · 전부 읽음 · 보관.
 *
 * 분류와 색은 **서버가 파생해서 준다** (`lib/noti.ts`) — 화면에 코드표를 두지 않는다 (D-R18).
 * 「1개월」은 조회 범위이고 **지운 것이 아니다** (N-7 · D-16) — 창 밖 건수를 그대로 말해 준다.
 */
export function NotisPane({ notis, categories, meId, windowDays, olderCount, onRead, onReadAll, onWiden, widened, busy }: {
  notis: Noti[];
  categories: DrawerData['notiCategories'];
  /** 관리자·대표는 **남의 알림도 본다**. 읽음 처리는 내게 온 것만 되므로 그 경계를 화면이 말한다 */
  meId: number | null;
  windowDays: number;
  olderCount: number;
  onRead: (id: number) => void;
  onReadAll: () => void;
  onWiden: (all: boolean) => void;
  widened: boolean;
  busy: boolean;
}) {
  const [filter, setFilter] = useState<string>('all');
  const mine = (n: Noti) => meId !== null && n.toId === meId;
  const unread = notis.filter((n) => !n.read).length;
  /** 「전부 읽음」이 실제로 바꿀 수 있는 수 — 남의 알림은 서버가 거절한다 */
  const myUnread = notis.filter((n) => !n.read && mine(n)).length;

  /* 목록은 서버가 「안 읽은 것 먼저」로 주지만, §16 은 **날짜로 묶어** 보여 준다.
     그 순서 그대로 묶으면 오늘/어제가 두 번씩 나온다 — 그리는 순서만 날짜순으로 되돌린다. */
  const shown = notis
    .filter((n) => (filter === 'all' ? true
      : filter === 'mine' ? mine(n)
        : filter === 'unread' ? !n.read : n.category === filter))
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  /** 날짜 묶음 — 오늘 · 어제 · 그 밖 (§16) */
  const today = todayKst();
  const yesterday = addDays(today, -1);
  const groupOf = (at: string) => (at.slice(0, 10) === today ? '오늘' : at.slice(0, 10) === yesterday ? '어제' : at.slice(0, 10));
  const groups: Array<[string, Noti[]]> = [];
  shown.forEach((n) => {
    const g = groupOf(n.at);
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(n);
    else groups.push([g, [n]]);
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-fg-subtle">
        {unread > 0 ? <>읽지 않은 알림 <b className="text-fg">{unread}건</b>{unread !== myUnread ? <> (내게 온 것 {myUnread}건)</> : null}. </> : <>읽지 않은 알림이 없습니다. </>}
        독촉과 재알람은 정산에 그대로 반영되므로 처리 여부를 여기서 확인하세요.
      </p>

      <div className="flex flex-wrap gap-1">
        {[
          { key: 'all', label: `전체 ${notis.length}` },
          /*
            원문 M-126 의 「내게 온 것」. 관리자·대표는 **남의 알림도 보는** 화면이라,
            줄마다 「남의 알림」이라 적어 두기만 하고 **골라 볼 길이 없었다** — 스무 줄이 넘으면
            그 라벨만으로는 내 것을 못 찾는다. 판정은 이미 쓰고 있는 `mine()` 그대로다.
          */
          { key: 'mine', label: `내게 온 것 ${notis.filter(mine).length}` },
          { key: 'unread', label: `안 읽음 ${unread}` },
          ...categories.map((category) => ({ key: category.key, label: `${category.label} ${category.count}` })),
        ].map((c) => (
          <FilterPill
            key={c.key}
            pressed={filter === c.key}
            // 분류 칩 앞의 점은 카드 타일과 같은 색이다 — 전체·내게 온 것·안 읽음에는 점이 없다 (g2 16-3)
            dot={NOTI_LOOK[c.key]?.dot}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
          </FilterPill>
        ))}
      </div>

      {shown.length === 0 ? <Empty>이 분류에는 알림이 없습니다</Empty> : null}

      {groups.map(([g, rows]) => (
        <section key={g}>
          <h3 className="mb-1.5 text-[12px] font-bold text-fg-subtle">{g}</h3>
          <ul className="flex flex-col gap-1.5">
            {rows.map((n) => {
              const look = notiLook(n.category);
              const Icon = look.icon;
              return (
                /*
                  원문 §16 카드 — 분류 타일 · **굵은 제목** · 상세 한 줄 · 메타(분류 · 보낸 이 · 역할 · 시각) · 안 읽음 점 (g2 16-1 · 16-2 · 16-4).
                  제목은 서버의 `title` 이고, 제목이 없는 옛 알림은 본문이 굵은 한 줄이 된다 — 본문을 잘라 제목을 짓지 않는다.
                  안 읽은 것도 바탕은 흰색이고 오른쪽 점 하나로 말한다.
                */
                <li key={n.id} className="flex items-start gap-3 rounded-lg border border-line bg-card p-3">
                  <span aria-hidden className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', look.tile)}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-fg">{n.title ?? n.body}</p>
                    {n.title ? <p className="mt-0.5 text-[12.5px] font-bold text-fg-2">{n.body}</p> : null}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-bold text-fg-subtle">
                      <span>
                        {[n.categoryLabel, n.fromName ?? '시스템', n.fromRoleLabel, n.at.slice(11, 16)].filter(Boolean).join(' · ')}
                      </span>
                      {/* 원문 M-124·M-127 의 낱말은 「열기 ›」다 — 「원본」이라 적고 있었다 (C99 · D-R18) */}
                      {n.link ? (
                        <Link
                          href={n.link}
                          className="ml-auto font-bold text-blue hover:underline"
                          /*
                            **열면 읽은 것이다** (원문 M-127 「읽음 처리된다」). 여는 것과 읽음이 따로
                            놀아서, 눌러서 그 화면까지 가 놓고도 수신함에는 안 읽음으로 남아 있었다.
                            막지 않는다 — 이동은 그대로 가고 읽음만 함께 보낸다. 남의 알림은 서버가
                            어차피 거절하므로 **내 것일 때만** 부른다(읽음 단추와 같은 판정).
                          */
                          onClick={() => { if (!n.read && mine(n)) onRead(n.id); }}
                        >
                          열기 ›
                        </Link>
                      ) : null}
                    </p>
                  </div>
                  {/* 안 읽음 점 — 내 것이면 누르면 읽음이 된다. 남의 알림은 서버가 거절하므로 점 대신 그 사실을 적는다 */}
                  {!n.read && mine(n) ? (
                    <button
                      type="button" disabled={busy} onClick={() => onRead(n.id)} aria-label="읽음" title="읽음으로 표시"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-inset disabled:opacity-40"
                    >
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-primary" />
                    </button>
                  ) : !n.read ? (
                    <Chip size="compact" tone="neutral">남의 알림</Chip>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* 원문 §16 은 전폭 갈색 단추 하나다(g2 16-5) — 30일 창 단추와 안내는 그 아래 줄로 (N-7 · D-16) */}
      <Button variant="primary" className="w-full" disabled={busy || myUnread === 0} onClick={onReadAll}>전부 읽음으로 표시</Button>
      <div className="flex flex-wrap items-center gap-2">
        {widened ? (
          <Button size="sm" disabled={busy} onClick={() => onWiden(false)}>최근 30일만 보기</Button>
        ) : olderCount > 0 ? (
          <Button size="sm" disabled={busy} onClick={() => onWiden(true)}>예전 알림 {olderCount}건도 보기</Button>
        ) : null}
        <span className="text-[11px] text-fg-subtle">
          {widened
            ? '보관된 전부를 보고 있습니다.'
            : `최근 ${windowDays}일만 보입니다 — 예전 것은 지운 것이 아니라 접어 둔 것입니다.`}
        </span>
      </div>
    </div>
  );
}

/* ── §17 구성원 · 시간대 ─────────────────────────────────────────── */

/**
 * 그 사람 시간대의 **지금 몇 시**.
 *
 * 이것만은 화면이 센다 — 서버가 준 시각은 보내는 순간 이미 지난 시각이고,
 * 컷의 시계는 **돌아야** 한다. 시간대 이름(「서울」)은 여전히 서버 표에서 꺼낸다 (D-R18).
 * 저장값이 표에 없는 시간대면 `Intl` 이 던진다 — 줄을 통째로 잃지 않게 막고 「—」를 적는다.
 */
function localHhmm(tz: string, now: number): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(now);
  } catch {
    return '—';
  }
}

/** 시간대 약칭 — 원문 §17 「서울 **KST** 고정」의 뒷말. IANA 식별자 → 약칭 표기만 둔다 */
const TZ_ABBR: Readonly<Record<string, string>> = { 'Asia/Seoul': 'KST' };

/** 1분마다 다시 그린다 — 컷이 분까지만 적으므로 초 단위로 깨울 이유가 없다 */
function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * 원문 §17 은 **표가 아니라 묶음 목록**이다 — 묶음 머리(색 띠 · 이름 · 인원)와
 * 줄마다 「이름 · 시간대 · **그 사람의 지금 시각**」이다. 지금까지는 네 열짜리 표였고
 * **각자의 시각이 없었다** — 그 칸이 이 화면의 용도다(해외 강사에게 언제 연락할 수 있나).
 *
 * **묶음은 역할 4종이다.** 컷의 묶음은 「강사 13 · 코디네이터 4 · 상담실장 1 · …」이고
 * **같은 사람이 두 묶음에 나온다**(Kim 은 강사이자 코디네이터다) — 즉 컷이 묶는 것은
 * 역할이 아니라 **직함이고, 한 사람이 여럿을 가진다.** 우리 저장소는 `staff.title` 한 칸뿐이라
 * 그 모양을 적을 수 없다. 없는 표를 지어내지 않고(D-R44 · N-25) **역할로 묶고 직함은 줄에 적는다.**
 * 직함을 여러 개 갖는 것이 맞다면 표를 파는 일이므로 대표 결정이다 (N-41).
 *
 * 컷의 둘째 문장 「여기서 바꾼 시간대는 각자의 화면에만 적용됩니다」는 **적지 않는다** —
 * 이 서랍에는 바꾸는 자리가 없고, 그 문장은 없는 단추를 있다고 말한다 (C68 에서 되돌린 것과 같은 자리).
 */
export function MembersPane({
  groups, tzGroups, tz, canAddMember = false, canWage = false, phoneCountries, loginIdRule, tempPasswordRule,
}: {
  groups: MemberGroup[]; tzGroups: TzGroup[]; tz: string;
  /** 「+ 구성원」이 서는가 — 서버 `DrawerDto.canAddMember` (C97 · D-R39: 화면은 role 을 보지 않는다) */
  canAddMember?: boolean;
  /** 시급 줄·「시급 수정」이 서는가 — 서버 `DrawerDto.canWage`. 어느 줄에 서는지는 `member.wageable` 이 가른다 */
  canWage?: boolean;
  /** 구성원 만들기 · 수정의 휴대폰 국가번호 목록 — 서버 `DrawerDto.phoneCountries` (N-103) */
  phoneCountries?: PhoneCountry[];
  /** 아이디 · 임시 비밀번호 규칙 문장 — 서버 `DrawerDto.loginIdRule` · `tempPasswordRule` (W10 · D-R18) */
  loginIdRule?: string;
  tempPasswordRule?: string;
}) {
  const now = useMinuteTick();
  /*
   * 시간대는 **사람의 이름으로** 적는다 — 「Asia/Seoul」은 저장값이지 낱말이 아니다 (D-R18).
   * 그 이름은 이미 「시간대 그룹」이 들고 있으므로 새로 짓지 않고 거기서 찾는다.
   * 표에 없는 값은 감추지 않고 저장값 그대로 보인다 — 새 시간대가 생긴 것을 알아야 한다.
   */
  const tzName = (value: string) => tzGroups.find((g) => g.tz === value)?.name ?? value;
  /*
   * 원문 머리는 「관리자 화면은 **서울 KST 고정**입니다」다(g2 17-1) — 그룹 이름(「서울」·서버 `tzg`) 뒤에
   * 그 시간대의 약칭을 붙인다. 약칭은 IANA 식별자의 표기일 뿐 업무 값이 아니라 여기 둔다(관리자 화면은 KST 한 곳이다).
   */
  const abbr = TZ_ABBR[tz];

  return (
    <>
      {/* 원문 §17 머리는 평문이다 — 사용자 문장에 결정 번호를 적지 않는다(g2 C-7 · 근거 D-R12 · D-R39) */}
      <p className="mb-3 text-[12.5px] leading-relaxed text-fg-2">
        관리자 화면은 <b className="text-fg">{tzName(tz)}{abbr ? ` ${abbr}` : ''} 고정</b>입니다.
        옆의 시각은 <b className="text-fg">그 사람이 있는 곳의 지금</b>입니다.
        직함은 권한이 아닙니다 — 권한은 역할 4종에서 파생합니다.
      </p>
      {/* §17 「+ 구성원」 — 서는지는 서버가 정한다 (C97 · D-41) */}
      {canAddMember ? (
        <div className="mb-3 flex justify-end">
          <MemberCreateButton tzGroups={tzGroups} tz={tz} canWage={canWage} phoneCountries={phoneCountries}
            loginIdRule={loginIdRule} tempPasswordRule={tempPasswordRule} />
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g.role} className="mb-3">
          <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-line bg-card">
            {/* 색은 토큰에서 꺼낸다 — 여기서 hex 를 적지 않는다 (D-R41) */}
            <span className={`h-8 w-1 shrink-0 rounded-r ${ROLE_BAR[g.role] ?? 'bg-line'}`} aria-hidden />
            {/* 이름도 인원도 서버가 만든 것이다 — 화면이 다시 짓거나 세지 않는다 (D-R18 · D-R37) */}
            {/* 머리 글자도 띠와 같은 역할 색이다(g2 17-2) */}
            <span className={`py-1.5 text-[12px] font-bold ${ROLE_TEXT[g.role] ?? 'text-fg'}`}>{g.label}</span>
            <span className="text-[12px] text-fg-subtle">{g.count}</span>
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {g.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2">
                <span className={`text-[12px] font-bold ${m.active ? 'text-fg' : 'text-fg-subtle line-through'}`}>
                  {m.name}
                </span>
                <span className="text-[11px] text-fg-subtle">{tzName(m.tz ?? tz)}</span>
                {/* 직함은 컷의 묶음 이름이 있던 자리다 — 묶음으로 못 옮기는 대신 줄에 남긴다 */}
                {m.title ? <Chip size="compact" tone="neutral">{m.title}</Chip> : null}
                {/* W8 — 계정 상태는 서버 값 그대로: 첫 설정을 안 끝낸 계정 · 사용 중지된 계정 */}
                {m.mustChangeCredentials ? <Chip size="compact" tone="warning">첫 설정 전</Chip> : null}
                {m.active ? null : <Chip size="compact" tone="danger">사용 중지</Chip>}
                {/* 시급은 볼 수 있는 사람에게만 온다(canWage) — 줄이 서는지는 서버의 wageable 이 가른다 (C97 · D-48) */}
                {canWage && m.wageable ? (
                  <>
                    {/* 줄이 없는 강사는 「시급 없음」이라 적지 않는다 — 단추만 서고 첫 줄은 창에서 적는다 */}
                    {m.wageRate != null ? (
                      <span className="text-[11px] tabular-nums text-fg-2">시급 {won(m.wageRate)}{m.wageFrom ? ` · ${m.wageFrom} 부터` : ''}</span>
                    ) : null}
                    <WageChangeButton member={m} />
                  </>
                ) : null}
                <span className="ml-auto text-[12px] tabular-nums text-fg-2">{localHhmm(m.tz ?? tz, now)}</span>
                {/* 수정 · 비밀번호 초기화 · 사용 중지 · 삭제 — 서는지는 줄마다 서버 플래그가 가른다 (W8 · D-R39) */}
                <MemberRowActions member={m} tzGroups={tzGroups} tz={tz} phoneCountries={phoneCountries}
                  loginIdRule={loginIdRule} tempPasswordRule={tempPasswordRule} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length === 0 ? <Empty>구성원이 없습니다</Empty> : null}

      {/* 컷에는 없다. 다만 위의 「서울」이 무엇을 가리키는지는 여기서만 알 수 있어 남긴다 */}
      <Section title="시간대 그룹" count={tzGroups.length}>
        <Table
          columns={[
            { key: 'name', head: '그룹', cell: (g: TzGroup) => g.name },
            { key: 'tz', head: '시간대', align: 'right', cell: (g: TzGroup) => g.tz },
          ]}
          rows={tzGroups} rowKey={(g) => g.id}
          empty="시간대 그룹이 없습니다"
        />
      </Section>
    </>
  );
}

/* ── §18 프로그램 · 과목 ─────────────────────────────────────────── */

/**
 * 묶음 머리의 색 — 원문 §18 「수업」 파랑 · 「상담·진단」 청록 · 「회의」 보라. 코드값 → 토큰 대응은 여기 한 곳이다 (D-R41).
 * 묶음 **이름**은 서버의 `grpLabel` 이다 — 화면이 코드표를 다시 적지 않는다 (C48 · D-R18).
 */
const KIND_GROUP_LOOK: Readonly<Record<string, { bar: string; text: string }>> = {
  lesson: { bar: 'bg-blue', text: 'text-blue' },
  intake: { bar: 'bg-green', text: 'text-green' },
  meeting: { bar: 'bg-violet', text: 'text-violet' },
};

/**
 * 원문 §18 은 **묶음별 카드 목록**이다 — 묶음 머리(색 띠 · 「수업 4」)와 줄 「■ 이름 정원 N [리포트]」(g2 18-1 · 18-2 · 18-6).
 * 전에는 5열 표였다. 묶음은 서버가 준 줄 차례(kind.sort) 그대로 처음 나온 순서이고, 머리의 수는 **그 아래 그리는 줄의 수**다 —
 * 같은 배열에서 나오므로 머리와 줄이 갈리지 않는다. 리포트 배지는 대상인 줄에만 선다.
 */
export function KindsPane({ kinds }: { kinds: KindRow[] }) {
  const groups: Array<{ grp: string; label: string; rows: KindRow[] }> = [];
  for (const kind of kinds) {
    const group = groups.find((g) => g.grp === kind.grp);
    if (group) group.rows.push(kind);
    else groups.push({ grp: kind.grp, label: kind.grpLabel, rows: [kind] });
  }
  return (
    <>
      {/* 원문 §18 머리 평문(g2 18-5) — 결정 번호를 적지 않는다(C-7). 대상 여부 자체는 서버 kind.rep 이다(18-3 결정 대기) */}
      <p className="mb-3 text-[12.5px] text-fg-2">
        <b className="text-fg">리포트</b> 표시가 붙은 프로그램만 리포트 작성·차감 대상입니다.
      </p>
      {groups.map((g) => {
        const look = KIND_GROUP_LOOK[g.grp] ?? { bar: 'bg-line', text: 'text-fg' };
        return (
          <section key={g.grp} className="mb-3">
            <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-line bg-card">
              <span className={cn('h-8 w-1 shrink-0 rounded-r', look.bar)} aria-hidden />
              <span className={cn('py-1.5 text-[12px] font-bold', look.text)}>{g.label}</span>
              <span className="text-[12px] text-fg-subtle">{g.rows.length}</span>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {g.rows.map((k) => (
                <li key={k.key} className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2">
                  {/* 색은 코드표가 출처다 — 화면에 hex 를 적지 않는다 (D-R18 · D-R41). 원문 표식은 둥근 사각이다 */}
                  <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: k.color }} aria-hidden />
                  <span className="text-[13px] font-bold text-fg">{k.name}</span>
                  <span className="text-[12px] text-fg-subtle">정원 {k.cap}</span>
                  {k.rep ? <Chip tone="success" styleKind="solid" className="ml-auto">리포트</Chip> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {/* 원문 §18 의 마지막 줄이다 — 서랍은 보여 주기만 하고, 만들고 고치는 자리는 따로 있다 */}
      <OpenAll href="/programs">프로그램 · 과목 전체 열기</OpenAll>
    </>
  );
}

/* ── §19 변경 요청 넣기 ──────────────────────────────────────────── */

/** 생성된 oneOf의 reqType만 쓴다. 잘못된 time/off 낱말은 컴파일되지 않는다. */
const CHREQ_TYPE_OPTIONS: ChreqType[] = ['time_move', 'teacher', 'room', 'cancel'];

/** 필수 표시 — 원문 §19 의 「*」. 보조기기의 이름에는 넣지 않는다(라벨은 낱말만 읽힌다) */
const Req = () => <span aria-hidden className="ml-0.5 text-primary">*</span>;

/**
 * 「어느 일정」 한 줄의 이름 — 원문 §19 가 말하는 「고른 날의 일정」을 사람이 알아보는 낱말로.
 * 이름은 과목 → 제목 → 종류 순으로 코드표(`GET /meta`)에서 꺼낸다 — 강사 오늘 목록과 같은 순서다.
 */
function occurrenceLabel(occ: Occurrence, subs: Sub[], kinds: Kind[]): string {
  const name = (occ.subKey ? subs.find((sub) => sub.key === occ.subKey)?.name : undefined)
    ?? occ.title ?? kinds.find((kind) => kind.key === occ.kindKey)?.name ?? occ.kindKey;
  return [`${hhmm(occ.startMin)}–${hhmm(occ.endMin)}`, name, occ.teacherName, occ.canceled ? '휴강' : null]
    .filter(Boolean).join(' · ');
}

/**
 * 원문 §19 — **「+ 변경 요청」이 여는 가운데 창**의 본문. 창과 단추는 부르는 쪽(`AppDrawer`)이 갖는다.
 *
 * 차례는 원문 그대로 **어느 날 → 어느 일정 → 무엇을 → 왜 바꾸나요** 다.
 * 전에는 「수업 번호」를 숫자로 직접 치게 했는데 **사용자는 SER id 를 알 수 없다** (g2 대조 19-2 · P0).
 * 이제 고른 날의 일정을 시간표와 **같은 질의**(`GET /schedule/occurrences`)로 받아 그중에서 고른다 —
 * 보내는 계약(`serId`·`onDate`)은 그대로이고, 값은 목록이 준 두 키를 옮겨 적을 뿐이다.
 */
export function ChangeReqForm({
  draft, onDraft, conflicts, error, occurrences, occurrencesLoading, staff, rooms, zaccs, subs, kinds,
}: {
  draft: ChangeReqDraft; onDraft: (d: ChangeReqDraft) => void;
  conflicts: ConflictRow[]; error?: string | null;
  /** 「어느 날」의 일정 — 없으면 아직 못 받은 것이다(부르는 쪽이 날짜가 있을 때만 부른다) */
  occurrences: Occurrence[] | undefined; occurrencesLoading: boolean;
  staff: StaffBrief[]; rooms: Room[]; zaccs: Zacc[]; subs: Sub[]; kinds: Kind[];
}) {
  const set = <K extends keyof ChangeReqDraft>(k: K, v: ChangeReqDraft[K]) => onDraft({ ...draft, [k]: v });
  const needsTime = draft.reqType === 'time_move';
  const timeIssue = needsTime && draft.startMin && draft.endMin
    ? lessonTimeIssue(Number(draft.startMin), Number(draft.endMin))
    : null;
  const target = draft.serId && draft.onDate ? occurrenceTargetValue(draft.serId, draft.onDate) : '';
  const dayItems = (occurrences ?? []).slice().sort((a, b) => a.startMin - b.startMin);
  // 시:분 입력은 계약(분)으로 옮겨 적는다 — 잘못된 칸은 비운다(서버와 같은 경계는 lessonTimeIssue 가 말한다)
  const setTime = (key: 'startMin' | 'endMin', value: string) => {
    const min = parseHm(value);
    set(key, min === null ? '' : String(min));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,5fr)] gap-3">
        <div>
          <Label htmlFor="chreq-day">어느 날<Req /></Label>
          {/* 날을 바꾸면 고른 일정은 그날의 것이 아니게 된다 — 함께 비운다 */}
          <Input id="chreq-day" type="date" value={draft.day}
            onChange={(e) => onDraft({ ...draft, day: e.currentTarget.value, serId: '', onDate: '' })} />
        </div>
        <div>
          <Label htmlFor="chreq-occ">어느 일정<Req /></Label>
          <Select id="chreq-occ" value={target} disabled={!draft.day}
            onChange={(e) => onDraft({ ...draft, ...parseOccurrenceTarget(e.currentTarget.value) })}>
            <option value="">
              {!draft.day ? '날짜부터 고르세요'
                : occurrencesLoading ? '일정을 읽는 중…'
                  : dayItems.length === 0 ? '이날은 일정이 없습니다' : '고르세요'}
            </option>
            {dayItems.map((occ) => (
              // 휴강한 회차는 바꿀 것이 없다 — 숨기지 않고 보이되 고르지 못하게 둔다
              <option key={occurrenceTargetValue(occ.serId, occ.onDate)} value={occurrenceTargetValue(occ.serId, occ.onDate)}
                disabled={occ.canceled}>
                {occurrenceLabel(occ, subs, kinds)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label>무엇을<Req /></Label>
        {/* 원문 §19 는 칩 단추 넷이다 — 누르는 칩의 모양은 공용 ChipButton 한 벌을 쓴다 (C96) */}
        <div role="group" aria-label="무엇을" className="flex flex-wrap gap-1.5">
          {CHREQ_TYPE_OPTIONS.map((v) => (
            <ChipButton key={v} pressed={draft.reqType === v} onClick={() => set('reqType', v)}>
              {REQ_TYPE_LABEL[v] ?? v}
            </ChipButton>
          ))}
        </div>
      </div>

      {needsTime ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="chreq-start">새 시작</Label>
            <Input id="chreq-start" type="time" step={300}
              value={draft.startMin ? hhmm(Number(draft.startMin)) : ''}
              onChange={(e) => setTime('startMin', e.currentTarget.value)} />
          </div>
          <div>
            <Label htmlFor="chreq-end">새 끝</Label>
            <Input id="chreq-end" type="time" step={300}
              value={draft.endMin ? hhmm(Number(draft.endMin)) : ''}
              onChange={(e) => setTime('endMin', e.currentTarget.value)} />
          </div>
          {timeIssue ? <p className="col-span-2 text-[11px] text-red">{timeIssue}</p> : null}
        </div>
      ) : null}

      {draft.reqType === 'teacher' ? (
        <div>
          <Label htmlFor="chreq-teacher">바꿀 강사</Label>
          <Select id="chreq-teacher" value={draft.teacherId} onChange={(e) => set('teacherId', e.currentTarget.value)}>
            <option value="">강사를 선택하세요</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}{member.title ? ` · ${member.title}` : ''}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {draft.reqType === 'room' ? (
        <div className="flex flex-col gap-2">
          <Label>바꿀 수업 자원</Label>
          <Segmented
            value={draft.resourceTarget}
            onChange={(value) => set('resourceTarget', value)}
            options={[{ value: 'room', label: '강의실' }, { value: 'zoom', label: 'Zoom' }]}
          />
          {draft.resourceTarget === 'room' ? (
            <Select value={draft.roomId} onChange={(e) => set('roomId', e.currentTarget.value)} aria-label="바꿀 강의실">
              <option value="">강의실을 선택하세요</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.branch} · {room.name}</option>
              ))}
            </Select>
          ) : (
            <Select value={draft.zaccId} onChange={(e) => set('zaccId', e.currentTarget.value)} aria-label="바꿀 Zoom 계정">
              <option value="">Zoom 계정을 선택하세요</option>
              {zaccs.map((zacc) => <option key={zacc.id} value={zacc.id}>{zacc.label}</option>)}
            </Select>
          )}
        </div>
      ) : null}

      {/* 원문에 없는 칸이다 — CHREQ.apply_all 과 §20 「(이 회차만)」 짝이라 남긴다 (의도적 차이) */}
      <Checkbox
        checked={draft.applyAll}
        onChange={(e) => set('applyAll', e.currentTarget.checked)}
        label="선택한 회차부터 이후 전체에 적용 요청"
      />

      <div>
        <Label htmlFor="chreq-why">왜 바꾸나요<Req /></Label>
        <Input id="chreq-why" value={draft.reason} maxLength={500}
          onChange={(e) => set('reason', e.currentTarget.value)}
          placeholder="어머니 요청 · 강사 병원 일정" />
      </div>

      {error ? <ConflictGuard result="blocking" message={error} /> : null}

      {/* 겹치면 「안 됩니다」가 아니라 **누구와** 겹치는지 보여 준다 */}
      {conflicts.length > 0 ? (
        <ConflictGuard
          result="blocking"
          message={`${conflicts.length}건과 겹칩니다 — 제출되지 않았습니다`}
          dates={conflictLines(conflicts)}
        />
      ) : null}
    </div>
  );
}

/* ── §20 변경 요청 이력 ──────────────────────────────────────────── */

/** 결재 낱말은 다섯 표가 같은 것을 쓴다 (erd.dbml · migration 1756700000000) */
const CHREQ_TONE: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'danger' };
const CHREQ_LABEL: Record<string, string> = { pending: '대기', approved: '반영', rejected: '반려' };

/** 원문 §20 의 탭 — 「확인 대기 · 반영 · 반려 · 전체」 */
const CHREQ_TABS = [
  { value: 'pending', label: '확인 대기' },
  { value: 'approved', label: '반영' },
  { value: 'rejected', label: '반려' },
  { value: 'all', label: '전체' },
] as const;
export type ChreqTab = (typeof CHREQ_TABS)[number]['value'];

export function ChangeReqsPane({ rows, onCreate }: {
  rows: ChangeReq[];
  /** 원문 §20 머리 오른쪽 「+ 변경 요청」 — §19 창을 연다 (g2 대조 20-2 · 창은 부르는 쪽이 갖는다) */
  onCreate?: () => void;
}) {
  const [tab, setTab] = useState<ChreqTab>('pending');
  const shown = tab === 'all' ? rows : rows.filter((c) => c.state === tab);
  const cols: Array<Column<ChangeReq>> = [
    { key: 'type', head: '무엇', width: 72, cell: (c) => REQ_TYPE_LABEL[c.reqType] ?? c.reqType },
    { key: 'what', head: '대상', cell: (c) => (
      <span className="text-fg-2">
        {c.serId ? `#${c.serId}` : '—'}{c.onDate ? ` · ${c.onDate}` : ''}
        {/* 무엇을 바꿔 달라는가 — 서버가 만든 문장 (D-R18) */}
        {c.asked ? <span className="ml-1 font-bold text-fg">{c.asked}</span> : null}
        {c.applyAll ? <Chip tone="purple" className="ml-1">이후 전체</Chip> : null}
      </span>
    ) },
    { key: 'by', head: '올린 이', width: 80, cell: (c) => c.byName ?? '—' },
    { key: 'state', head: '상태', width: 64, align: 'center', cell: (c) => (
      // 표에 없는 낱말은 그대로 보여 준다 — 새 상태가 생긴 것을 알아야 한다
      <Chip tone={CHREQ_TONE[c.state] ?? 'neutral'}>{CHREQ_LABEL[c.state] ?? c.state}</Chip>
    ) },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* 보기 전환은 공용 Segmented 한 벌이다(§15 와 같은 모양). 건수는 원문대로 「확인 대기」에만 붙는다(g2 20-4) */}
        <Segmented
          value={tab}
          onChange={setTab}
          ariaLabel="변경 요청 상태"
          options={CHREQ_TABS.map((t) => ({
            value: t.value,
            label: t.value === 'pending' ? `${t.label} ${rows.filter((c) => c.state === 'pending').length}` : t.label,
          }))}
        />
        {onCreate ? (
          <Button className="ml-auto" variant="primary" size="sm" onClick={onCreate} aria-haspopup="dialog">+ 변경 요청</Button>
        ) : null}
      </div>
      {/* 원문 §20 머리 평문 한 줄(g2 20-5) — 처리 위치는 레일의 「승인 대기함」이 말하므로 덧문장을 달지 않는다 */}
      <p className="mb-3 text-[12.5px] text-fg-2">
        강사·학생·강의실이 <b className="text-fg">겹치면 넣을 수 없습니다</b> · 반영하면 시간표가 바뀌고 <b className="text-fg">이력</b>에 남습니다
      </p>
      <Table columns={cols} rows={shown} rowKey={(c) => c.id} empty={
        tab === 'pending' ? '확인할 요청이 없습니다' : '해당하는 요청이 없습니다'
      } />
      {/* 반려 사유는 신청 사유와 다른 칸이다 (v4.18) — 둘 다 남는다 */}
      {shown.some((c) => c.rejectReason) ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {shown.filter((c) => c.rejectReason).map((c) => (
            <li key={c.id} className="rounded bg-red/5 px-2 py-1 text-[11px] text-red">
              #{c.id} {c.onDate} — {c.rejectReason}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/* ── §21 줌 계정 ─────────────────────────────────────────────────── */

/**
 * 원문 §21 은 **격자 한 판과 숫자 둘**이다 — 계정 카드 목록이 아니었다.
 * 「8월 21일 기준 · 동시 5개가 한도입니다」 로 시작해 계정 × 시간 격자, 「지금 가능」·「만석 시간대」,
 * 그리고 지금 쓸 수 있는 계정 이름줄이 온다. 지금까지는 카드 목록이라 **언제 비는지를 볼 수 없었다.**
 *
 * 격자는 「줌 계정 관리」와 **같은 컴포넌트·같은 질의**다. 두 화면이 갈리지 않는다.
 * 격자는 칸을 **열 때만** 부른다 — 서랍을 열 때마다 딸려오면 §21 을 안 쓰는 사람도 값을 치른다.
 *
 * 겹침 경고는 서랍 payload 가 주는 것이고 격자와 출처가 다르다. 그래서 **겹친 계정 이름만** 말하고
 * 건수를 두 번 적지 않는다 — 배정 건수는 「줌 계정 관리」의 표가 가진다 (D-R22).
 */
/** §21 숫자 상자 — 원문은 큰 숫자가 위, 라벨이 아래, 가운데 정렬이고 보조 문구가 없다 */
function ZoomCount({ label: name, value, note }: { label: string; value: ReactNode; note: string | null }) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-3 text-center">
      <strong className="block text-[24px] leading-none text-fg">{value}</strong>
      <span className="mt-1.5 block text-[12px] font-bold text-fg-2">{name}</span>
      {note ? <span className="mt-0.5 block text-[10.5px] text-fg-subtle">{note}</span> : null}
    </div>
  );
}

export function ZoomPane({ rows, board, loading }: {
  rows: ZoomAccount[]; board?: ZoomBoard; loading?: boolean;
}) {
  const bad = rows.filter((z) => z.overlaps > 0);
  const live = rows.filter((z) => z.active).length;

  return (
    <>
      {board ? (
        <p className="mb-3 text-[13px] text-fg-2">
          {/* 날짜는 달력과 **같은 낱말**로 적는다 — 이 화면만 ISO 를 쓰면 여섯째 날짜 모양이 된다 */}
          <b>{label(board.onDate)}</b> 기준 · 동시 <b>{live}개</b>가 한도입니다.
          칸이 비어 있으면 그 시간에 그 계정을 쓸 수 있습니다.
        </p>
      ) : null}

      {bad.length > 0 ? (
        <ConflictGuard
          result="blocking"
          message={`${bad.length}개 계정이 같은 시간에 두 수업을 잡고 있습니다`}
          dates={bad.map((z) => z.label)}
        />
      ) : null}

      {board ? (
        <>
          <div className="mt-3 rounded-lg border border-line bg-card p-2.5">
            <ZoomGrid board={board} compact />
          </div>

          {/* 원문 §21 숫자 상자 — 큰 숫자 위 · 라벨 아래 · 가운데(g2 21-2). 「지금」은 오늘만 뜻이 있다 — 다른 날이면 서버가 nowHour 를 비운다 */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ZoomCount label="지금 가능" value={board.nowHour === null ? '—' : board.freeNow}
              note={board.nowHour === null ? '오늘만 셉니다' : null} />
            <ZoomCount label="만석 시간대" value={board.fullHours} note={null} />
          </div>

          {board.freeLabels.length > 0 ? (
            <p className="mt-2.5 text-[12px] text-fg-2">
              지금 쓸 수 있는 계정 — <b className="text-fg">{board.freeLabels.join(' · ')}</b>
            </p>
          ) : null}
        </>
      ) : (
        <p className="px-1 py-6 text-center text-[13px] text-fg-subtle">
          {loading ? '점유를 세는 중입니다…' : '점유를 읽지 못했습니다.'}
        </p>
      )}

      {/*
        원문 §21 의 마지막 줄이다 — 고치는 자리는 목적지에 있다. 로그인 정보가 이 칸에 내려오지 않는 규칙은
        서버가 지킨다(SELECT 에 넣지 않는다 · erd V9) — 원문 칸에 없는 경고 상자는 달지 않는다(g2 21-3).
      */}
      <OpenAll href="/zoom">줌 계정 관리</OpenAll>
    </>
  );
}

export type { DrawerData };
