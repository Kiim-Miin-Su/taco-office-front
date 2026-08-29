/**
 * §53 청구서 · §55 들어온 돈 · §57 강사료 정산.
 *
 * 금액은 대표만 봅니다 (D-R39). **가리는 일을 화면이 하지 않는다** — 서버가 null 로 내려주고
 * 화면은 그것을 「가려짐」으로 그린다. 화면에서만 감추면 네트워크 탭에 그대로 보인다.
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Chip, Column, PageHeader, StatCard, Table, Tabs } from '@/components/ui';
import { useAccounting } from '@/api/queries';
import type { Invoice, Payment, Payout } from '@/api/types';

/** 금액 칸 하나 — null 이면 볼 권한이 없다는 뜻이다. 0 으로 바꿔 쓰지 않는다. */
function Won({ v, bold }: { v: number | null; bold?: boolean }) {
  if (v === null) return <span className="text-[11px] text-fg-subtle">가려짐</span>;
  return <span className={bold ? 'font-bold' : undefined}>{v.toLocaleString('ko-KR')}원</span>;
}

const STATE: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: '작성 중', tone: 'neutral' },
  sent: { label: '전달', tone: 'info' },
  unpaid: { label: '미납', tone: 'danger' },
  partial: { label: '일부 납부', tone: 'warning' },
  paid: { label: '입금 완료', tone: 'success' },
  void: { label: '취소', tone: 'neutral' },
};

export default function AccountingPage() {
  const [tab, setTab] = useState<'inv' | 'pay' | 'payout'>('inv');
  const q = useAccounting();
  const s = q.data?.summary;

  const invCols: Array<Column<Invoice>> = [
    { key: 'st', head: '학생', width: 130, cell: (r) => <span className="font-bold">{r.studentName} <span className="font-normal text-fg-subtle">{r.grade}</span></span> },
    { key: 'ym', head: '청구월', width: 90, cell: (r) => r.yearMonth },
    { key: 'ti', head: '내역', cell: (r) => r.lines.map((l) => l.label).join(' + ') || r.title },
    { key: 'am', head: '금액', width: 120, align: 'right', cell: (r) => <Won v={r.amount} bold /> },
    { key: 'pd', head: '수납', width: 120, align: 'right', cell: (r) => <Won v={r.paidAmount} /> },
    { key: 'stt', head: '상태', width: 110,
      cell: (r) => r.overdueDays > 0
        ? <Chip tone="danger">연체 {r.overdueDays}일</Chip>
        : <Chip tone={STATE[r.state]?.tone ?? 'neutral'}>{STATE[r.state]?.label ?? r.state}</Chip> },
    { key: 'due', head: '예정일', width: 100, cell: (r) => r.dueOn ?? '—' },
  ];

  const payCols: Array<Column<Payment>> = [
    { key: 'd', head: '입금일', width: 110, cell: (r) => <span className="font-bold">{r.paidOn}</span> },
    { key: 's', head: '학생', width: 130, cell: (r) => r.studentName ?? '—' },
    { key: 'a', head: '금액', width: 130, align: 'right', cell: (r) => <Won v={r.amount} bold /> },
    { key: 'm', head: '수단', width: 100, cell: (r) => (r.method === 'cash' ? '현금' : '계좌') },
    { key: 'i', head: '청구서', width: 100, cell: (r) => (r.invId ? `INV-${r.invId}` : '—') },
  ];

  const poCols: Array<Column<Payout>> = [
    { key: 'n', head: '강사', width: 110, cell: (r) => <span className="font-bold">{r.staffName}</span> },
    { key: 'ym', head: '월', width: 90, cell: (r) => r.yearMonth },
    { key: 'h', head: '시수', width: 80, align: 'right', cell: (r) => r.hours },
    { key: 'g', head: '지급 총액', width: 120, align: 'right', cell: (r) => <Won v={r.gross} /> },
    { key: 'c', head: '지연 차감', width: 110, align: 'right',
      cell: (r) => (r.lateRepCut === null ? <Won v={null} /> : <span className={r.lateRepCut ? 'font-bold text-red' : 'text-fg-subtle'}>{r.lateRepCut ? `-${r.lateRepCut.toLocaleString('ko-KR')}원` : '0원'}</span>) },
    { key: 'n2', head: '실지급', width: 130, align: 'right', cell: (r) => <Won v={r.net} bold /> },
    { key: 's', head: '상태', width: 90,
      cell: (r) => <Chip tone={r.state === 'confirmed' ? 'success' : 'warning'}>{r.state === 'confirmed' ? '확정' : '대기'}</Chip> },
  ];

  return (
    <RequireAuth><AppShell>
      <PageHeader title="회계" sub="청구서 → 전달 → 입금 → 기록. 강사료는 리포트를 쓴 수업만 계산합니다." />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <StatCard label="청구서" value={s?.invoiceCount ?? '—'} note="전체" />
        <StatCard label="청구 합계" value={s?.billed === null ? '가려짐' : (s?.billed ?? 0).toLocaleString('ko-KR')} tone="info" />
        <StatCard label="수납" value={s?.collected === null ? '가려짐' : (s?.collected ?? 0).toLocaleString('ko-KR')} tone="success" />
        <StatCard label="연체" value={s?.overdueCount ?? '—'} note={s?.outstanding === null ? '금액은 대표만' : `미수 ${(s?.outstanding ?? 0).toLocaleString('ko-KR')}원`} tone="danger" />
      </div>

      {s && !s.canSeeAmounts ? (
        <Banner tone="warning" className="mb-3">
          금액은 <b>대표만</b> 봅니다 (D-R39). 서버가 값을 내려보내지 않으므로 화면에도 없습니다 —
          숨긴 것이 아니라 받지 않은 것입니다.
        </Banner>
      ) : null}

      <Tabs className="mb-3" value={tab} onChange={setTab} options={[
        { value: 'inv', label: `청구서 ${q.data?.invoices.length ?? 0}` },
        { value: 'pay', label: `들어온 돈 ${q.data?.payments.length ?? 0}` },
        { value: 'payout', label: `강사료 정산 ${q.data?.payouts.length ?? 0}` },
      ]} />

      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner>
        : q.isError ? <Banner tone="danger">회계는 매니저 이상만 볼 수 있습니다. 또는 서버에 닿지 못했습니다.</Banner>
        : tab === 'inv' ? <Table columns={invCols} rows={q.data?.invoices ?? []} rowKey={(r) => r.id} />
        : tab === 'pay' ? <Table columns={payCols} rows={q.data?.payments ?? []} rowKey={(r) => r.id} />
        : <Table columns={poCols} rows={q.data?.payouts ?? []} rowKey={(r) => r.id} />}

      <Banner tone="info" className="mt-4">
        정산은 <b>「리포트를 썼는가」 하나</b>로 계산합니다 — 승인 여부는 보지 않습니다 (D-R7).
        깎이는 것은 지각뿐이고, 기준은 수업이 끝난 시각부터 분 단위입니다 (D-R32).
      </Banner>
    </AppShell></RequireAuth>
  );
}
