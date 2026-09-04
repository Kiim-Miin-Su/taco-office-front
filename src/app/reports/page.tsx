/**
 * §47 안 쓴 리포트 — 강사별로 몇 건 밀렸는지, 가장 오래된 것이 언제인지.
 *
 * 차감 금액을 화면에서 계산하지 않는다. 서버가 rules.ts 의 구간표로 계산해서 내려준다 —
 * 화면이 따로 세면 두 벌이 되고, 강사에게 보이는 금액과 정산이 갈린다 (D-R32).
 */
'use client';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import {
  Banner, Chip, Column, Drawer, PageHeader, Panel, StatCard, StatusBadge, Table, Tabs,
} from '@/components/ui';
import { ReportEditor } from '@/components/report/ReportForm';
import { ReportDeliveryHistory } from '@/components/report/ReportDeliveryHistory';
import { ReportDeliveryQueue } from '@/components/report/ReportDeliveryQueue';
import { ReportExportPanel } from '@/components/report/ReportExportPanel';
import { useMeta, useReportDetail, useReports, useUnwritten } from '@/api/queries';
import type { ReportRow, UnwrittenByTeacher } from '@/api/types';
import { hhmm } from '@/lib/calendar';
import { won } from '@/lib/money';
import { useCan } from '@/store/useSession';

const sinceText = (min: number) => {
  if (min < 60) return `${min}분`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간`;
  return `${Math.floor(min / (60 * 24))}일`;
};

/** 차감 구간 — 서버 상수와 같은 값을 **설명용으로만** 적는다. 계산은 서버가 한다. */
const TIERS = [
  { label: '0 ~ 59분', amount: '0원', tone: 'success' as const },
  { label: '60분 이상', amount: '5,000원', tone: 'warning' as const },
  { label: '240분 이상', amount: '10,000원', tone: 'danger' as const },
];

export default function ReportsPage() {
  const [section, setSection] = useState<'unwritten' | 'delivery' | 'history'>('unwritten');
  const [tab, setTab] = useState<'teacher' | 'list' | 'returned' | 'approval'>('teacher');
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const canApprove = useCan('canApprove');
  const meta = useMeta();
  const q = useUnwritten(undefined, section === 'unwritten');
  const returned = useReports({ state: 'rej' }, tab === 'returned');
  const approval = useReports({ state: 'wait' }, canApprove && tab === 'approval');
  const detail = useReportDetail(selected?.serId, selected?.onDate);

  const subName = useMemo(() => {
    const m = new Map((meta.data?.subs ?? []).map((s) => [s.key, s.name]));
    return (k?: string | null) => (k ? m.get(k) ?? k : '—');
  }, [meta.data]);

  const byTeacher = q.data?.byTeacher ?? [];
  const items = q.data?.items ?? [];

  const teacherCols: Array<Column<UnwrittenByTeacher>> = [
    { key: 'name', head: '강사', width: 110, cell: (r) => <span className="font-bold">{r.teacherName}</span> },
    { key: 'n', head: '안 쓴 건수', width: 100, align: 'right',
      cell: (r) => <Chip tone={r.count >= 3 ? 'danger' : 'warning'}>{r.count}건</Chip> },
    { key: 'old', head: '가장 오래된 것', width: 130, cell: (r) => r.oldestDate ?? '—' },
    { key: 'o1', head: '1시간 초과', width: 100, align: 'right', cell: (r) => `${r.over1h}건` },
    { key: 'o4', head: '4시간 초과', width: 100, align: 'right',
      cell: (r) => <span className={r.over4h ? 'font-bold text-red' : ''}>{r.over4h}건</span> },
    { key: 'p', head: '예상 차감', width: 120, align: 'right',
      cell: (r) => <span className="font-bold text-red">{won(r.penalty)}</span> },
  ];

  const listCols: Array<Column<ReportRow>> = [
    { key: 'd', head: '수업일', width: 110, cell: (r) => <span className="font-bold">{r.date}</span> },
    { key: 't', head: '시각', width: 70, cell: (r) => hhmm(r.startMin) },
    { key: 's', head: '과목', width: 140, cell: (r) => subName(r.subKey) },
    { key: 'tc', head: '강사', width: 90, cell: (r) => r.teacherName ?? '—' },
    { key: 'st', head: '학생', cell: (r) => r.students.map((s) => s.name).join(' · ') || '—' },
    { key: 'ago', head: '지난 시간', width: 100, align: 'right',
      cell: (r) => <span className="font-bold text-amber">{sinceText(r.minutesSinceEnd)}</span> },
    { key: 'p', head: '차감', width: 90, align: 'right',
      cell: (r) => <span className={r.penalty ? 'font-bold text-red' : 'text-fg-subtle'}>{won(r.penalty)}</span> },
    { key: 'state', head: '상태', width: 90, cell: (r) => <StatusBadge state={r.state} /> },
  ];

  return (
    <RequireAuth><AppShell>
      <PageHeader
        title="리포트"
        sub="안 쓴 것 확인 · 어제 것 학생별 보내기 · 전문 PNG와 발송 이력"
      />

      <Tabs
        className="mb-4"
        value={section}
        onChange={setSection}
        options={[
          { value: 'unwritten', label: `안 쓴 리포트 ${q.data?.total ?? 0}` },
          { value: 'delivery', label: '어제 보내기' },
          { value: 'history', label: '보낸 내역' },
        ]}
      />

      {section === 'delivery' ? (
        <ReportDeliveryQueue onOpenReport={setSelected} />
      ) : section === 'history' ? (
        <ReportDeliveryHistory />
      ) : <>
      <div className="mb-4 grid grid-cols-4 gap-3">
        <StatCard label="안 쓴 리포트" value={q.data?.total ?? '—'} note={`강사 ${byTeacher.length}명`} tone={q.data?.total ? 'danger' : 'neutral'} />
        <StatCard label="4시간 초과" value={byTeacher.reduce((a, t) => a + t.over4h, 0)} note="건당 10,000원" tone="danger" />
        <StatCard label="1시간 초과" value={byTeacher.reduce((a, t) => a + t.over1h, 0)} note="건당 5,000원" tone="warning" />
        <StatCard label="예상 차감 합계" value={won(q.data?.penaltyTotal ?? 0)} note="대표 승인 없이 자동 반영" tone="danger" />
      </div>

      <Tabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'teacher', label: `강사별 ${byTeacher.length}` },
          { value: 'list', label: `건별 ${items.length}` },
          { value: 'returned', label: '반려됨' },
          ...(canApprove ? [{ value: 'approval' as const, label: '승인 대기' }] : []),
        ]}
      />

      {q.isLoading ? (
        <Banner tone="neutral">불러오는 중…</Banner>
      ) : q.isError ? (
        <Banner tone="danger">서버에 닿지 못했습니다. 백엔드가 떠 있는지 확인해 주세요.</Banner>
      ) : tab === 'teacher' ? (
        <Table columns={teacherCols} rows={byTeacher} rowKey={(r) => r.teacherId} empty="밀린 리포트가 없습니다" />
      ) : tab === 'list' ? (
        <Table
          columns={listCols}
          rows={items}
          rowKey={(r) => r.id}
          onRowClick={setSelected}
          empty="밀린 리포트가 없습니다"
        />
      ) : tab === 'returned' ? (
        returned.isLoading ? <Banner tone="neutral">반려 리포트를 불러오는 중…</Banner>
          : returned.isError ? <Banner tone="danger">반려 리포트를 불러오지 못했습니다.</Banner>
            : <Table columns={listCols} rows={returned.data?.items ?? []} rowKey={(r) => r.id} onRowClick={setSelected} empty="반려된 리포트가 없습니다" />
      ) : (
        approval.isLoading ? <Banner tone="neutral">승인 대기 리포트를 불러오는 중…</Banner>
          : approval.isError ? <Banner tone="danger">승인 대기 리포트를 불러오지 못했습니다.</Banner>
            : <Table columns={listCols} rows={approval.data?.items ?? []} rowKey={(r) => r.id} onRowClick={setSelected} empty="승인 대기 리포트가 없습니다" />
      )}

      <Panel className="mt-4" title="지연 차감 계산 방식" sub="수업이 끝난 시각을 0분으로 두고 분 단위로 잽니다. 날짜가 아니라 분입니다.">
        <div className="grid grid-cols-3 gap-3">
          {TIERS.map((t) => (
            <div key={t.label} className="rounded-lg border border-line bg-inset p-3">
              <div className="text-[11px] font-bold text-fg">{t.label}</div>
              <div className="mt-1 text-[15px] font-bold">
                <Chip tone={t.tone}>{t.amount}</Chip>
              </div>
            </div>
          ))}
        </div>
        <Banner tone="info" className="mt-3">
          건당 상한 10,000원. 정산은 <b>「썼는가」 하나</b>만 봅니다 — 승인 여부는 보지 않습니다 (D-R7).
          이 금액은 서버가 계산해서 내려준 값이고, 화면은 다시 세지 않습니다.
        </Banner>
      </Panel>
      </>}

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        width={720}
        title={detail.data?.canReview ? '리포트 검토' : '리포트 작성'}
        sub={selected ? `${selected.date} · ${subName(selected.subKey)} · ${selected.teacherName ?? '담당 강사 없음'}` : undefined}
      >
        {detail.isLoading ? (
          <Banner tone="neutral">불러오는 중…</Banner>
        ) : detail.isError ? (
          <Banner tone="danger">리포트 상세를 불러오지 못했습니다.</Banner>
        ) : detail.data ? (
          <div key={`${detail.data.id}:${detail.data.state}:${detail.data.submittedAt ?? ''}`}>
            <ReportEditor detail={detail.data} subject={detail.data.subjectName} />
            <ReportExportPanel detail={detail.data} />
          </div>
        ) : null}
      </Drawer>
    </AppShell></RequireAuth>
  );
}
