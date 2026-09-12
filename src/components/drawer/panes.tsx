/** @file-guide
 * 목적: panes.tsx — ApprovalsPane, TodoBox, TodosPane, NotisPane, MembersPane 등 (component)
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
import { useState } from 'react';
import Link from 'next/link';
import {
  Banner, Button, Checkbox, Chip, ConflictGuard, Input, Label, Segmented, Select, Table, Textarea,
  type Column, type Tone,
} from '@/components/ui';
import type {
  ApFlow, ApRow, ChangeReq, ConflictRow, Drawer as DrawerData, DrawerTodo,
  KindRow, Member, Noti, Room, StaffBrief, TzGroup, Zacc, ZoomAccount,
} from '@/api/types';
import { hhmm, lessonTimeIssue } from '@/lib/calendar';
import { REQ_TYPE_LABEL, ROLE_LABEL, ROLE_TONE } from '@/lib/roles';
import { changeReqReady, type ChangeReqDraft, type ChreqType } from './change-request';

export { changeReqBody, changeReqReady, EMPTY_DRAFT, type ChangeReqDraft } from './change-request';

const KIND_LABEL: Record<string, string> = {
  rep: '리포트', rpt: '대표 보고', plan: '기획', req: '요청', chreq: '변경 요청', gpapack: '자료 요청',
};
const NOTI_TONE: Record<string, Tone> = { alarm: 'info', ok: 'success', warn: 'warning' };

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

function ApBody({ r }: { r: ApRow }) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <Chip tone={r.state === 'back' ? 'danger' : 'info'} styleKind="outline">
          {KIND_LABEL[r.kind] ?? r.kind}
        </Chip>
        <span className="truncate text-[12px] font-bold text-fg">{r.title}</span>
        <span className="ml-auto shrink-0 text-[11px] text-fg-subtle">{r.at.slice(5, 10)}</span>
      </div>
      <p className="mt-1 text-[11px] text-fg-subtle">
        {[r.byName, r.sub].filter(Boolean).join(' · ') || '—'}
      </p>
      {/* 반려는 사유가 반드시 있다 (D-R13) — 없으면 왜 되돌아왔는지 아무도 모른다 */}
      {r.state === 'back' && r.why ? (
        <p className="mt-1.5 rounded bg-red/5 px-2 py-1 text-[11px] text-red">{r.why}</p>
      ) : null}
    </>
  );
}

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
              <ApBody r={r} />
              <ApActions r={r} onReview={onReview} busy={!!busy} />
            </div>
          ) : (
            <Link
              href={r.go} onClick={onGo}
              className="block rounded-lg border border-line bg-card p-2.5 transition-colors hover:border-blue hover:bg-blue/5"
            >
              <ApBody r={r} />
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
  const actionable = [...flow.back, ...flow.waiting, ...flow.mine].filter((r) => r.canAct).length;
  return (
    <>
      <Banner tone="info" className="mb-4">
        올라온 것은 <b>전건이 뜹니다</b> — 자동 승인도 조건부 통과도 없습니다 (D-R34).
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
          <b>{flow.missingKinds.map((k) => KIND_LABEL[k] ?? k).join(' · ')}</b>.
          없는 것이 아니라 못 세는 것입니다.
        </Banner>
      ) : null}
      <Section title="되돌아온 것" count={flow.back.length}>
        <ApList rows={flow.back} onGo={onGo} onReview={onReview} busy={busy} />
      </Section>
      <Section title="기다리는 것" count={flow.waiting.length}>
        <ApList rows={flow.waiting} onGo={onGo} onReview={onReview} busy={busy} />
      </Section>
      <Section title="내가 올린 것" count={flow.mine.length}>
        <ApList rows={flow.mine} onGo={onGo} onReview={onReview} busy={busy} />
      </Section>
    </>
  );
}

/* ── §15 할 일 ───────────────────────────────────────────────────── */

export type TodoBox = 'in' | 'out' | 'all';

export function TodosPane({ todos, meId, box, onBox, onToggle, busy }: {
  todos: DrawerTodo[]; meId: number | null;
  box: TodoBox; onBox: (b: TodoBox) => void;
  onToggle: (id: number, done: boolean) => void; busy: boolean;
}) {
  const rows = todos.filter((t) =>
    box === 'all' ? true : box === 'in' ? t.toId === meId : t.fromId === meId);
  const left = rows.filter((t) => !t.done).length;

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
        <span className="ml-auto text-[11px] text-fg-subtle">남은 것 {left}건</span>
      </div>

      {rows.length === 0 ? <Empty>할 일이 없습니다</Empty> : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((t) => (
            <li key={t.id} className="flex items-start gap-2 rounded-lg border border-line bg-card p-2.5">
              <Checkbox
                checked={t.done} disabled={busy}
                onChange={(e) => onToggle(t.id, e.currentTarget.checked)}
                className="mt-0.5 shrink-0"
                aria-label={`${t.title} 완료`}
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[12px] font-bold ${t.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>
                  {t.title}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-subtle">
                  <span>{t.fromName ?? '—'} → {t.toName ?? '—'}</span>
                  {t.dueOn ? <span>· {t.dueOn}</span> : null}
                  {/* 기한이 지난 것은 색으로만 말하지 않고 며칠인지 적는다 */}
                  {t.overdueDays > 0 ? <Chip tone="danger">{t.overdueDays}일 지남</Chip> : null}
                </p>
              </div>
              {t.go ? (
                <Link href={t.go} className="shrink-0 text-[11px] font-bold text-blue hover:underline">원본</Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
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
export function NotisPane({ notis, meId, windowDays, olderCount, onRead, onReadAll, onWiden, widened, busy }: {
  notis: Noti[];
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

  /** 칩 — 전체·안 읽음 다음에 분류별. 건수는 지금 보이는 목록에서 센다(같은 배열이다) */
  const cats = new Map<string, { label: string; count: number }>();
  notis.forEach((n) => {
    const hit = cats.get(n.category) ?? { label: n.categoryLabel, count: 0 };
    hit.count += 1;
    cats.set(n.category, hit);
  });

  /* 목록은 서버가 「안 읽은 것 먼저」로 주지만, §16 은 **날짜로 묶어** 보여 준다.
     그 순서 그대로 묶으면 오늘/어제가 두 번씩 나온다 — 그리는 순서만 날짜순으로 되돌린다. */
  const shown = notis
    .filter((n) => (filter === 'all' ? true : filter === 'unread' ? !n.read : n.category === filter))
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  /** 날짜 묶음 — 오늘 · 어제 · 그 밖 (§16) */
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
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
          ...[...cats.entries()].map(([key, v]) => ({ key, label: `${v.label} ${v.count}` })),
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

export function MembersPane({ members, tzGroups, tz }: {
  members: Member[]; tzGroups: TzGroup[]; tz: string;
}) {
  const cols: Array<Column<Member>> = [
    { key: 'name', head: '이름', cell: (m) => (
      <span className={m.active ? 'font-bold text-fg' : 'text-fg-subtle line-through'}>{m.name}</span>
    ) },
    { key: 'title', head: '직함', cell: (m) => m.title ?? '—' },
    { key: 'role', head: '역할', cell: (m) => (
      // 역할을 비교하지 않는다 — 이름도 색도 표에서 꺼낸다 (D-R39)
      <Chip tone={ROLE_TONE[m.role] ?? 'neutral'}>{ROLE_LABEL[m.role] ?? m.role}</Chip>
    ) },
    { key: 'tz', head: '시간대', align: 'right', cell: (m) => m.tz ?? tz },
  ];
  return (
    <>
      <Banner tone="neutral" className="mb-3">
        직함은 권한이 아닙니다 — 권한은 역할 4종에서 파생합니다 (D-R39).
        <b> 관리자 화면의 모든 시각은 {tz}</b> 로 고정입니다 (D-R12).
      </Banner>
      <Section title="구성원" count={members.length}>
        <Table columns={cols} rows={members} rowKey={(m) => m.id} />
      </Section>
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
    { key: 'grp', head: '묶음', cell: (k) => (
      { lesson: '수업', intake: '상담', meeting: '회의' }[k.grp] ?? k.grp
    ) },
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

export function ZoomPane({ rows }: { rows: ZoomAccount[] }) {
  const bad = rows.filter((z) => z.overlaps > 0);
  const [shown, setShown] = useState<number | null>(null);

  return (
    <>
      <Banner tone="warning" className="mb-3">
        로그인 정보는 <b>이 화면에 내려오지 않습니다.</b> 학생 참가 링크와 같은 자리에 두지 않는 것이 규칙입니다.
      </Banner>
      {bad.length > 0 ? (
        <ConflictGuard
          result="blocking"
          message={`${bad.length}개 계정이 같은 시간에 두 수업을 잡고 있습니다`}
          dates={bad.map((z) => `${z.label} · ${z.overlaps}건`)}
        />
      ) : null}
      <div className="mt-3 flex flex-col gap-1.5">
        {rows.map((z) => (
          <div key={z.id} className="rounded-lg border border-line bg-card p-2.5">
            <div className="flex items-center gap-2">
              <span className={`text-[12px] font-bold ${z.active ? 'text-fg' : 'text-fg-subtle line-through'}`}>
                {z.label}
              </span>
              <Chip tone={z.overlaps > 0 ? 'danger' : 'neutral'}>{z.assigned}건 배정</Chip>
              {z.overlaps > 0 ? <Chip tone="danger" styleKind="solid">겹침 {z.overlaps}</Chip> : null}
              {z.joinUrl ? (
                <Button size="sm" variant="ghost" className="ml-auto"
                  onClick={() => setShown(shown === z.id ? null : z.id)}>
                  {shown === z.id ? '숨기기' : '참가 링크'}
                </Button>
              ) : null}
            </div>
            {shown === z.id && z.joinUrl ? (
              <p className="mt-1.5 break-all rounded bg-inset px-2 py-1 text-[11px] text-fg-2">{z.joinUrl}</p>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? <Empty>줌 계정이 없습니다</Empty> : null}
      </div>
    </>
  );
}

export type { DrawerData };
