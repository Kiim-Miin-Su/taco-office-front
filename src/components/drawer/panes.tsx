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
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Banner, Button, Checkbox, Chip, ConflictGuard, Dialog, Input, Label, Segmented, Select, StatCard, Table, Textarea,
  type Column, type Tone,
} from '@/components/ui';
import { ZoomGrid } from '@/components/zoom/ZoomGrid';
import { approvalKindLabel, ApprovalRowContent } from '@/components/approval/ApprovalRowContent';
import type {
  ApFlow, ApRow, ChangeReq, ConflictRow, Drawer as DrawerData, DrawerTodo, DrawerTodoCreate,
  KindRow, MemberGroup, Noti, Room, StaffBrief, TzGroup, Zacc, ZoomAccount, ZoomBoard,
} from '@/api/types';
import {
  addDays, dowOf, hhmm, KO_DOW, label, lessonTimeIssue, monthBounds, step, todayKst, weekDays,
} from '@/lib/calendar';
import { REQ_TYPE_LABEL, ROLE_BAR } from '@/lib/roles';
import { changeReqReady, type ChangeReqDraft, type ChreqType } from './change-request';

export { changeReqBody, changeReqReady, EMPTY_DRAFT, type ChangeReqDraft } from './change-request';

const NOTI_TONE: Record<string, Tone> = { alarm: 'info', ok: 'success', warn: 'warning' };

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

/** 한 줄 처리 — 두 번 눌러야 나간다. 반려는 사유를 적어야 단추가 열린다 (D-R13). */
function ApActions({ r, onReview, busy }: {
  r: ApRow; onReview: (v: ApReview) => void; busy: boolean;
}) {
  const [armed, setArmed] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const send = (decision: 'approve' | 'reject') => {
    setArmed(null);
    onReview({ id: r.id, kind: r.kind, decision, reason: reason.trim() || undefined });
  };
  return (
    <div className="mt-2 border-t border-line pt-2">
      <Label htmlFor={`ap-why-${r.id}`} hint="반려 시 필수">사유</Label>
      <Input
        id={`ap-why-${r.id}`}
        value={reason}
        onChange={(e) => { setReason(e.target.value); setArmed(null); }}
        placeholder="반려 사유 · 승인 메모"
      />
      <div className="mt-1.5 flex justify-end gap-1.5">
        <Button
          size="sm"
          variant={armed === 'reject' ? 'primary' : 'secondary'}
          disabled={busy || !reason.trim()}
          onClick={() => (armed === 'reject' ? send('reject') : setArmed('reject'))}
        >
          {armed === 'reject' ? '한 번 더 누르면 반려' : '반려'}
        </Button>
        <Button
          size="sm"
          variant={armed === 'approve' ? 'primary' : 'dark'}
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
              <ApprovalRowContent row={r} />
              <ApActions r={r} onReview={onReview} busy={!!busy} />
            </div>
          ) : (
            <Link
              href={r.go} onClick={onGo}
              className="block rounded-lg border border-line bg-card p-2.5 transition-colors hover:border-blue hover:bg-blue/5"
            >
              <ApprovalRowContent row={r} />
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
  const shown = flow.inbox.filter((row) => filter === 'all' || row.category === filter);
  return (
    <>
      <Banner tone="info" className="mb-4">
        강사와 코디네이터가 올린 요청은 <b>전건이 뜹니다</b> — 자동 승인도 조건부 통과도 없습니다 (D-R34).
        {actionable > 0 ? (
          <> <b>요청</b>은 여기서 처리하고, <b>반려에도 사유가 남습니다</b> (D-R13).
            나머지 갈래는 <b>줄을 눌러 그 화면에서</b> 합니다.</>
        ) : (
          <> 승인·반려는 <b>줄을 눌러 그 화면에서</b> 합니다.</>
        )}
      </Banner>
      {error ? <Banner tone="danger" className="mb-4">{error}</Banner> : null}
      {flow.missingKinds.length > 0 ? (
        <Banner tone="warning" className="mb-4">
          아직 표가 없어 이 목록에 오지 않는 갈래가 있습니다 —{' '}
          <b>{flow.missingKinds.map(approvalKindLabel).join(' · ')}</b>.
          없는 것이 아니라 못 세는 것입니다.
        </Banner>
      ) : null}
      <div className="mb-3 flex flex-wrap gap-1" aria-label="승인 요청 분류">
        {[
          { key: 'all', label: '전체', count: flow.inboxCount },
          ...flow.categories.filter((category) => category.count > 0 || category.key !== 'other'),
        ].map((category) => (
          <button
            key={category.key}
            type="button"
            aria-pressed={filter === category.key}
            onClick={() => setFilter(category.key)}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
              filter === category.key
                ? 'border-fg bg-fg text-card'
                : 'border-line bg-card text-fg-subtle hover:border-primary/50'
            }`}
          >
            {category.label} {category.count}
          </button>
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

function todoPeriodLabel(period: TodoPeriod, anchor: string): string {
  const range = todoPeriodBounds(period, anchor);
  if (period === 'month') return `${+anchor.slice(0, 4)}년 ${+anchor.slice(5, 7)}월`;
  if (period === 'day') return label(anchor);
  return `${label(range.from)} — ${label(range.to)}`;
}

const TODO_SOURCE_DOT: Record<string, string> = {
  meeting: 'bg-violet', complaint: 'bg-red', consulting: 'bg-amber', plan: 'bg-green', manual: 'bg-blue',
};

export function TodosPane({ todos, members, meId, box, onBox, onToggle, onCreate, onClear, busy }: {
  todos: DrawerTodo[]; meId: number | null;
  members: DrawerData['members'];
  box: TodoBox; onBox: (b: TodoBox) => void;
  onToggle: (id: number, done: boolean) => void; busy: boolean;
  onCreate: (body: DrawerTodoCreate) => void;
  onClear: () => void;
}) {
  const [period, setPeriod] = useState<TodoPeriod>('week');
  const [anchor, setAnchor] = useState(todayKst);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [toId, setToId] = useState(meId ? String(meId) : '');
  const [dueOn, setDueOn] = useState(todayKst);

  const scoped = todos.filter((t) =>
    box === 'all' ? true : box === 'in' ? t.toId === meId : t.fromId === meId);
  const range = todoPeriodBounds(period, anchor);
  // 날짜가 없는 할 일은 어느 기간에서도 잃지 않고 별도 묶음으로 보여 준다.
  const rows = scoped.filter((t) => !t.dueOn || (t.dueOn >= range.from && t.dueOn <= range.to));
  const left = rows.filter((t) => !t.done).length;
  const overdue = rows.filter((t) => !t.done && t.overdueDays > 0).length;
  const done = rows.filter((t) => t.done).length;
  const dated = rows.filter((t) => t.dueOn);
  const dayKeys = period === 'week'
    ? weekDays(anchor)
    : period === 'day'
      ? [anchor]
      : [...new Set(dated.map((t) => t.dueOn!))].sort();
  const undated = rows.filter((t) => !t.dueOn);

  const submit = () => {
    const clean = title.trim();
    if (!clean) return;
    onCreate({
      title: clean,
      ...(toId ? { toId: Number(toId) } : {}),
      ...(dueOn ? { dueOn } : {}),
    });
    setTitle('');
    setCreating(false);
  };

  const renderRows = (items: DrawerTodo[]) => items.length === 0 ? (
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
          {t.go ? (
            <Link href={t.go} className="shrink-0 text-[11px] font-bold text-blue hover:underline">원본</Link>
          ) : null}
        </li>
      ))}
    </ul>
  );

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

      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatCard className="p-2" label="할 일" value={rows.length} />
        <StatCard className="p-2" label="안 끝난 것" value={left} tone="info" />
        <StatCard className="p-2" label="기한 지남" value={overdue} tone="danger" />
      </div>

      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="secondary" disabled={busy || done === 0} onClick={onClear}>끝난 것 지우기</Button>
      </div>

      <div className="flex flex-col gap-3">
        {dayKeys.map((day) => {
          const items = rows.filter((t) => t.dueOn === day);
          return (
            <section key={day}>
              <h3 className="mb-1.5 flex items-center gap-2 text-[12px] font-bold text-fg">
                <span>{KO_DOW[dowOf(day)]}요일</span>
                <span className="text-fg-subtle">{day.slice(5).replace('-', '/')}</span>
                <Chip tone={items.some((t) => !t.done) ? 'info' : 'neutral'}>{items.filter((t) => !t.done).length}</Chip>
              </h3>
              {renderRows(items)}
            </section>
          );
        })}
        {undated.length > 0 ? <section><h3 className="mb-1.5 text-[12px] font-bold text-fg">기한 없음</h3>{renderRows(undated)}</section> : null}
        {rows.length === 0 ? <Empty>이 기간에는 할 일이 없습니다</Empty> : null}
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="할 일 만들기"
        footer={(
          <>
            <Button onClick={() => setCreating(false)}>취소</Button>
            <Button variant="primary" disabled={busy || !title.trim()} onClick={submit}>만들기</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <div><Label htmlFor="todo-title">할 일</Label><Input id="todo-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></div>
          <div>
            <Label htmlFor="todo-to">담당자</Label>
            <Select id="todo-to" value={toId} onChange={(e) => setToId(e.target.value)}>
              {members.filter((member) => member.active).map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </Select>
          </div>
          <div><Label htmlFor="todo-due">기한</Label><Input id="todo-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></div>
        </div>
      </Dialog>
    </>
  );
}

/* ── §16 알림 ────────────────────────────────────────────────────── */

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
    .filter((n) => (filter === 'all' ? true : filter === 'unread' ? !n.read : n.category === filter))
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
          { key: 'unread', label: `안 읽음 ${unread}` },
          ...categories.map((category) => ({ key: category.key, label: `${category.label} ${category.count}` })),
        ].map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={filter === c.key}
            onClick={() => setFilter(c.key)}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
              filter === c.key ? 'border-fg bg-fg text-card' : 'border-line bg-card text-fg-subtle hover:border-primary/50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? <Empty>이 분류에는 알림이 없습니다</Empty> : null}

      {groups.map(([g, rows]) => (
        <section key={g}>
          <h3 className="mb-1.5 text-[12px] font-bold text-fg-subtle">{g}</h3>
          <ul className="flex flex-col gap-1.5">
            {rows.map((n) => (
              <li
                key={n.id}
                className={`rounded-lg border p-2.5 ${n.read ? 'border-line bg-card' : 'border-blue/30 bg-blue/5'}`}
              >
                <div className="flex items-start gap-2">
                  <Chip tone={NOTI_TONE[n.tone] ?? 'info'} styleKind="outline">{n.categoryLabel}</Chip>
                  <p className="min-w-0 flex-1 text-[12px] text-fg">{n.body}</p>
                  {!n.read && mine(n) ? (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRead(n.id)}>읽음</Button>
                  ) : !n.read ? (
                    <Chip size="compact" tone="neutral">남의 알림</Chip>
                  ) : null}
                </div>
                <p className="mt-1 flex gap-2 text-[11px] text-fg-subtle">
                  <span>{n.fromName ?? '시스템'}</span>
                  <span>{n.at.slice(5, 16).replace('T', ' ')}</span>
                  {n.link ? <Link href={n.link} className="ml-auto font-bold text-blue hover:underline">원본</Link> : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button variant="primary" disabled={busy || myUnread === 0} onClick={onReadAll}>전부 읽음으로 표시</Button>
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
export function MembersPane({ groups, tzGroups, tz }: {
  groups: MemberGroup[]; tzGroups: TzGroup[]; tz: string;
}) {
  const now = useMinuteTick();
  /*
   * 시간대는 **사람의 이름으로** 적는다 — 「Asia/Seoul」은 저장값이지 낱말이 아니다 (D-R18).
   * 그 이름은 이미 「시간대 그룹」이 들고 있으므로 새로 짓지 않고 거기서 찾는다.
   * 표에 없는 값은 감추지 않고 저장값 그대로 보인다 — 새 시간대가 생긴 것을 알아야 한다.
   */
  const tzName = (value: string) => tzGroups.find((g) => g.tz === value)?.name ?? value;

  return (
    <>
      <Banner tone="neutral" className="mb-3">
        관리자 화면은 <b>{tzName(tz)} 고정</b>입니다 (D-R12).
        옆의 시각은 <b>그 사람이 있는 곳의 지금</b>입니다.
        직함은 권한이 아닙니다 — 권한은 역할 4종에서 파생합니다 (D-R39).
      </Banner>

      {groups.map((g) => (
        <section key={g.role} className="mb-3">
          <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-line bg-card">
            {/* 색은 토큰에서 꺼낸다 — 여기서 hex 를 적지 않는다 (D-R41) */}
            <span className={`h-8 w-1 shrink-0 rounded-r ${ROLE_BAR[g.role] ?? 'bg-line'}`} aria-hidden />
            {/* 이름도 인원도 서버가 만든 것이다 — 화면이 다시 짓거나 세지 않는다 (D-R18 · D-R37) */}
            <span className="py-1.5 text-[12px] font-bold text-fg">{g.label}</span>
            <span className="text-[12px] text-fg-subtle">{g.count}</span>
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {g.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2">
                <span className={`text-[12px] font-bold ${m.active ? 'text-fg' : 'text-fg-subtle line-through'}`}>
                  {m.name}
                </span>
                <span className="text-[11px] text-fg-subtle">{tzName(m.tz ?? tz)}</span>
                {/* 직함은 컷의 묶음 이름이 있던 자리다 — 묶음으로 못 옮기는 대신 줄에 남긴다 */}
                {m.title ? <Chip size="compact" tone="neutral">{m.title}</Chip> : null}
                <span className="ml-auto text-[12px] tabular-nums text-fg-2">{localHhmm(m.tz ?? tz, now)}</span>
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

export function KindsPane({ kinds }: { kinds: KindRow[] }) {
  const cols: Array<Column<KindRow>> = [
    { key: 'color', head: '', width: 28, cell: (k) => (
      // 색은 코드표가 출처다 — 화면에 hex 를 적지 않는다 (D-R18 · D-R41)
      <span className="inline-block h-3 w-3 rounded-full" style={{ background: k.color }} aria-hidden />
    ) },
    { key: 'name', head: '이름', cell: (k) => <span className="font-bold text-fg">{k.name}</span> },
    // 묶음 이름은 서버가 만든다 — 화면이 코드표를 다시 적으니 원문(「상담·진단」)과 갈렸다 (C48 · D-R18)
    { key: 'grp', head: '묶음', cell: (k) => k.grpLabel },
    { key: 'cap', head: '정원', align: 'right', cell: (k) => `${k.cap}명` },
    { key: 'rep', head: '리포트', align: 'center', cell: (k) => (
      k.rep ? <Chip tone="success">대상</Chip> : <Chip tone="neutral">아님</Chip>
    ) },
  ];
  return (
    <>
      <Banner tone="info" className="mb-3">
        <b>리포트 대상</b>인 종류만 리포트를 씁니다 (D-R6). 상담·회의는 아무리 지나도 「안 쓴 리포트」가 되지 않습니다.
      </Banner>
      <Table columns={cols} rows={kinds} rowKey={(k) => k.key} />
      {/* 원문 §18 의 마지막 줄이다 — 서랍은 보여 주기만 하고, 만들고 고치는 자리는 따로 있다 */}
      <OpenAll href="/programs">프로그램 · 과목 전체 열기</OpenAll>
    </>
  );
}

/* ── §19 변경 요청 넣기 ──────────────────────────────────────────── */

/** 생성된 oneOf의 reqType만 쓴다. 잘못된 time/off 낱말은 컴파일되지 않는다. */
const CHREQ_TYPE_OPTIONS: ChreqType[] = ['time_move', 'teacher', 'room', 'cancel'];

export function ChangeReqForm({ draft, onDraft, onSubmit, conflicts, busy, sent, error, staff, rooms, zaccs }: {
  draft: ChangeReqDraft; onDraft: (d: ChangeReqDraft) => void;
  onSubmit: () => void; conflicts: ConflictRow[]; busy: boolean; sent: boolean; error?: string | null;
  staff: StaffBrief[]; rooms: Room[]; zaccs: Zacc[];
}) {
  const set = <K extends keyof ChangeReqDraft>(k: K, v: ChangeReqDraft[K]) => onDraft({ ...draft, [k]: v });
  const needsTime = draft.reqType === 'time_move';
  const timeIssue = needsTime && draft.startMin && draft.endMin
    ? lessonTimeIssue(Number(draft.startMin), Number(draft.endMin))
    : null;
  const ready = changeReqReady(draft);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>무엇을 바꾸나요</Label>
        <Select
          value={draft.reqType}
          onChange={(e) => set('reqType', e.currentTarget.value as ChreqType)}
        >
          {CHREQ_TYPE_OPTIONS.map((v) => (
            <option key={v} value={v}>{REQ_TYPE_LABEL[v] ?? v}</option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>수업 번호</Label>
          <Input value={draft.serId} inputMode="numeric" placeholder="예: 12"
            onChange={(e) => set('serId', e.currentTarget.value.replace(/\D/g, ''))} />
        </div>
        <div>
          <Label>날짜</Label>
          <Input type="date" value={draft.onDate} onChange={(e) => set('onDate', e.currentTarget.value)} />
        </div>
      </div>

      <Checkbox
        checked={draft.applyAll}
        onChange={(e) => set('applyAll', e.currentTarget.checked)}
        label="선택한 회차부터 이후 전체에 적용 요청"
      />

      {needsTime ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>시작 (분)</Label>
            <Input value={draft.startMin} inputMode="numeric" placeholder="1200 = 20:00"
              onChange={(e) => set('startMin', e.currentTarget.value.replace(/\D/g, ''))} />
            {draft.startMin ? <p className="mt-1 text-[11px] text-fg-subtle">{hhmm(Number(draft.startMin))}</p> : null}
          </div>
          <div>
            <Label>끝 (분)</Label>
            <Input value={draft.endMin} inputMode="numeric" placeholder="1290 = 21:30"
              onChange={(e) => set('endMin', e.currentTarget.value.replace(/\D/g, ''))} />
            {draft.endMin ? <p className="mt-1 text-[11px] text-fg-subtle">{hhmm(Number(draft.endMin))}</p> : null}
          </div>
          {timeIssue ? <p className="col-span-2 text-[11px] text-red">{timeIssue}</p> : null}
        </div>
      ) : null}

      {draft.reqType === 'teacher' ? (
        <div>
          <Label>바꿀 강사</Label>
          <Select value={draft.teacherId} onChange={(e) => set('teacherId', e.currentTarget.value)}>
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
            <Select value={draft.roomId} onChange={(e) => set('roomId', e.currentTarget.value)}>
              <option value="">강의실을 선택하세요</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.branch} · {room.name}</option>
              ))}
            </Select>
          ) : (
            <Select value={draft.zaccId} onChange={(e) => set('zaccId', e.currentTarget.value)}>
              <option value="">Zoom 계정을 선택하세요</option>
              {zaccs.map((zacc) => <option key={zacc.id} value={zacc.id}>{zacc.label}</option>)}
            </Select>
          )}
        </div>
      ) : null}

      <div>
        <Label>사유 (필수)</Label>
        <Textarea rows={3} value={draft.reason} onChange={(e) => set('reason', e.currentTarget.value)}
          placeholder="왜 바꿔야 하는지 한 줄이라도 적어 주세요" />
      </div>

      {error ? <ConflictGuard result="blocking" message={error} /> : null}

      {/* 겹치면 「안 됩니다」가 아니라 **누구와** 겹치는지 보여 준다 */}
      {conflicts.length > 0 ? (
        <ConflictGuard
          result="blocking"
          message={`${conflicts.length}건과 겹칩니다 — 제출되지 않았습니다`}
          dates={conflicts.map((c) =>
            `${c.onDate} ${hhmm(c.startMin)}–${hhmm(c.endMin)} · ${c.whoName ?? ''}${
              { teacher: ' (강사)', room: ' (강의실)', zoom: ' (줌)' }[c.with] ?? ''}`)}
        />
      ) : null}
      {sent && conflicts.length === 0 ? (
        <ConflictGuard result="ok" message="요청을 넣었습니다 — 승인은 그 화면에서 이뤄집니다" />
      ) : null}

      <Button variant="primary" disabled={!ready || busy} onClick={onSubmit}>
        {busy ? '보내는 중…' : '변경 요청 넣기'}
      </Button>
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

export function ChangeReqsPane({ rows }: { rows: ChangeReq[] }) {
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
      <div className="mb-3 flex flex-wrap gap-1">
        {CHREQ_TABS.map((t) => {
          const n = t.value === 'all' ? rows.length : rows.filter((c) => c.state === t.value).length;
          return (
            <button
              key={t.value} type="button" onClick={() => setTab(t.value)} aria-pressed={tab === t.value}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-bold transition-colors ${
                tab === t.value ? 'bg-primary text-white' : 'text-fg-subtle hover:bg-inset hover:text-fg-2'}`}
            >
              {t.label} {n}
            </button>
          );
        })}
      </div>
      <Banner tone="neutral" className="mb-3">
        강사·학생·강의실이 <b>겹치면 넣을 수 없습니다</b> — <b>반영하면 시간표가 바뀌고 이력에 남습니다</b>.
        반영·반려는 <b>승인 대기함</b>에서 합니다.
      </Banner>
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

          <div className="mt-3 grid grid-cols-2 gap-2">
            {/* 「지금」은 오늘만 뜻이 있다 — 다른 날을 보면 서버가 nowHour 를 비운다 */}
            <StatCard
              label="지금 가능"
              value={board.nowHour === null ? '—' : `${board.freeNow}`}
              tone="success"
              note={board.nowHour === null ? '오늘만 셉니다' : `${String(board.nowHour).padStart(2, '0')}시 기준`}
            />
            <StatCard label="만석 시간대" value={`${board.fullHours}`} tone="danger" note="한 계정도 안 남은 시간" />
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

      <Banner tone="warning" className="mt-3">
        로그인 정보는 <b>이 화면에 내려오지 않습니다.</b> 학생 참가 링크와 같은 자리에 두지 않는 것이 규칙입니다.
      </Banner>
      {/* 원문 §21 의 마지막 줄이다 — 로그인 정보는 여기 오지 않고, 고치는 자리는 목적지에 있다 */}
      <OpenAll href="/zoom">줌 계정 관리</OpenAll>
    </>
  );
}

export type { DrawerData };
