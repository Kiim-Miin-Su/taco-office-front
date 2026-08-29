/**
 * 탭 10 운영 — §59 마케팅 · §61 기획 · §63 회의 · §64 할 일 · §67 컴플레인.
 * 집행 비용은 대표만 봅니다 (D-R39) — 서버가 null 로 내려줍니다.
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Board, BoardColumn, Chip, Column, PageHeader, Panel, StatCard, Table, Tabs } from '@/components/ui';
import { useOps } from '@/api/queries';
import type { Complaint, Marketing, Meeting, Plan, Todo } from '@/api/types';

type Tab = 'todo' | 'complaint' | 'plan' | 'meeting' | 'mkt';

const AREA: Record<string, string> = { lesson: '수업', intake: '상담', book: '교재', schedule: '스케줄', teacher: '선생님' };
const SRC: Record<string, string> = { meeting: '회의', complaint: '컴플레인', consulting: '컨설팅', plan: '기획', manual: '직접' };
const PLAN_STAGE: Array<{ key: string; label: string; tone: 'neutral' | 'info' | 'danger' | 'success' | 'purple' }> = [
  { key: 'draft', label: '작성 중', tone: 'neutral' },
  { key: 'review', label: '검토 요청', tone: 'info' },
  { key: 'rework', label: '보완 요청', tone: 'danger' },
  { key: 'approved', label: '승인', tone: 'success' },
  { key: 'done', label: '완료', tone: 'purple' },
];
const CPL_STAGE: Array<{ key: string; label: string; tone: 'danger' | 'warning' | 'success' }> = [
  { key: 'received', label: '접수', tone: 'danger' },
  { key: 'acting', label: '대응', tone: 'warning' },
  { key: 'closed', label: '결과', tone: 'success' },
];

export default function OpsPage() {
  const [tab, setTab] = useState<Tab>('todo');
  const q = useOps();
  const d = q.data;

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
    { key: 'k', head: '종류', width: 90, cell: (r) => <Chip tone="info">{r.mtType}</Chip> },
    { key: 't', head: '제목', cell: (r) => <span className="font-bold">{r.title ?? '—'}</span> },
    { key: 'd', head: '일시', width: 110, cell: (r) => r.onDate ?? '—' },
    { key: 'a', head: '참석', width: 100,
      cell: (r) => <span className={r.confirmed < r.attendees ? 'text-amber' : 'text-green'}>{r.confirmed}/{r.attendees}</span> },
    { key: 'm', head: '속기록', width: 100,
      cell: (r) => r.hasMinutes ? <Chip tone="success">작성 완료</Chip> : <Chip tone="danger">미작성</Chip> },
  ];

  const mktCols: Array<Column<Marketing>> = [
    { key: 'c', head: '채널', width: 120, cell: (r) => <span className="font-bold">{r.channel}</span> },
    { key: 'i', head: '항목', width: 90, cell: (r) => r.item },
    { key: 'im', head: '노출', width: 100, align: 'right', cell: (r) => r.impressions?.toLocaleString('ko-KR') ?? '—' },
    { key: 'iq', head: '문의', width: 80, align: 'right', cell: (r) => r.inquiries ?? '—' },
    { key: 'e', head: '등록', width: 80, align: 'right',
      cell: (r) => <span className={r.enrolled ? 'font-bold text-green' : 'text-fg-subtle'}>{r.enrolled}</span> },
    { key: 'co', head: '비용', width: 110, align: 'right',
      cell: (r) => (r.cost ?? null) === null
        ? <span className="text-[11px] text-fg-subtle">가려짐</span>
        : `${(r.cost as number).toLocaleString('ko-KR')}원` },
    { key: 'cpe', head: '등록당', width: 120, align: 'right',
      cell: (r) => {
        const c = r.costPerEnroll ?? null;
        if (c === null) return <span className="text-[11px] text-fg-subtle">{(r.cost ?? null) === null ? '가려짐' : '—'}</span>;
        return <span className={c > 100000 ? 'font-bold text-red' : 'font-bold'}>{c.toLocaleString('ko-KR')}원</span>;
      } },
  ];

  const planCols: Array<BoardColumn<Plan>> = PLAN_STAGE.map((s) => ({
    key: s.key, label: s.label, tone: s.tone, items: (d?.plans ?? []).filter((p) => p.stage === s.key),
  }));
  const cplCols: Array<BoardColumn<Complaint>> = CPL_STAGE.map((s) => ({
    key: s.key, label: s.label, tone: s.tone, items: (d?.complaints ?? []).filter((c) => c.stage === s.key),
  }));

  const openTodos = (d?.todos ?? []).filter((t) => !t.done);
  return (
    <RequireAuth><AppShell>
      <PageHeader title="운영" sub="마케팅 · 기획 · 회의 · 할 일 · 컴플레인. 회의에서 배정된 할 일도 여기로 모입니다." />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <StatCard label="열린 할 일" value={openTodos.length}
          note={`기한 지난 것 ${openTodos.filter((t) => t.overdueDays > 0).length}건`}
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
        { value: 'mkt', label: `마케팅 ${d?.marketing.length ?? 0}` },
      ]} />

      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner>
        : q.isError ? <Banner tone="danger">운영 탭은 매니저 이상만 볼 수 있습니다.</Banner>
        : tab === 'todo' ? <Table columns={todoCols} rows={d?.todos ?? []} rowKey={(r) => r.id} />
        : tab === 'meeting' ? <Table columns={meetingCols} rows={d?.meetings ?? []} rowKey={(r) => r.id} />
        : tab === 'mkt' ? (
          <>
            <Table columns={mktCols} rows={d?.marketing ?? []} rowKey={(r) => r.id} />
            {d && !d.canSeeAmounts ? (
              <Banner tone="warning" className="mt-3">집행 비용과 등록당 비용은 <b>대표만</b> 봅니다 (D-R39).</Banner>
            ) : null}
          </>
        )
        : tab === 'plan' ? (
          <Board columns={planCols} itemKey={(p) => p.id} renderCard={(p) => (
            <>
              <div className="text-[12px] font-bold text-fg">{p.title}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-fg-subtle">{p.ownerName ?? '—'}</span>
                {p.overdueDays > 0
                  ? <Chip tone="danger">{p.overdueDays}일 지남</Chip>
                  : <span className="text-[10px] text-fg-subtle">{p.dueOn ?? ''}</span>}
              </div>
            </>
          )} />
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
    </AppShell></RequireAuth>
  );
}
