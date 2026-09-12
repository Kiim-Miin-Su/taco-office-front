/** @file-guide
 * 목적: page.tsx — AccountingPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §53 청구서 · §55 들어온 돈 · §56 나간 돈 · §57 강사료 정산 · ⑤ 입금 기록(C36-a·C36-b).
 *
 * 회계 탭 자체가 대표 전용이다 (D-R9 · v2 §76 — 원본 컷 머리글 「회계 〔대표·이사〕」).
 * 그래도 금액은 서버가 null 로 내려보내는 쪽을 유지한다 — **가리는 일을 화면이 하지 않는다.**
 * 사람별 예외(STAFF.can_money)로 열린 사람에게만 값이 채워진다.
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Chip, Column, PageHeader, StatCard, Table, Tabs } from '@/components/ui';
import { useAccounting } from '@/api/queries';
import { PaymentRecorder } from '@/components/accounting/PaymentRecorder';
import { ExpenseReview } from '@/components/accounting/ExpenseReview';
import { InvoiceIssuer } from '@/components/accounting/InvoiceIssuer';
import { useSession } from '@/store/useSession';
import type { Invoice, Payment, Payout } from '@/api/types';
import { won, wonTone } from '@/lib/money';

/**
 * 머리 여섯 칸의 금액 — 값이 길어 26px 로는 1440 폭에서 여섯 칸이 넘친다.
 * 줄이는 것은 **글자 크기뿐**이다. 자릿수를 접거나(「약 721만」) 「원」을 떼지 않는다 —
 * 대표가 보는 머리는 원문과 같은 금액이어야 한다.
 */
function Head({ v, loaded }: { v: number | null | undefined; loaded: boolean }) {
  // 아직 안 받았으면 「—」다. 「가려짐」은 **권한이 없어서 서버가 안 줬다**는 뜻이라 불러오는 중에 쓰면 거짓말이 된다.
  return <span className="text-[20px]">{won(v, loaded ? {} : { empty: '—' })}</span>;
}

/** 공용 원화 포맷을 재사용한다. 미확인 입금과 권한 가림을 호출부에서 구별한다. */
function Won({ v, bold, empty }: { v: number | null; bold?: boolean; empty?: string }) {
  if (v === null) return <span className="text-[11px] text-fg-subtle">{won(v, { empty })}</span>;
  return <span className={bold ? 'font-bold' : undefined}>{won(v)}</span>;
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
  const [tab, setTab] = useState<'inv' | 'record' | 'pay' | 'out' | 'payout'>('inv');
  const q = useAccounting();
  const me = useSession((s) => s.me);
  const s = q.data?.summary;

  const invCols: Array<Column<Invoice>> = [
    {
      key: 'st',
      head: '학생',
      width: 130,
      cell: (r) => (
        <span className="font-bold">
          {r.studentName} <span className="font-normal text-fg-subtle">{r.grade}</span>
        </span>
      ),
    },
    { key: 'ym', head: '청구월', width: 90, cell: (r) => r.yearMonth },
    { key: 'ti', head: '내역', cell: (r) => r.lines.map((l) => l.label).join(' + ') || r.title },
    { key: 'am', head: '금액', width: 120, align: 'right', cell: (r) => <Won v={r.amount} bold /> },
    { key: 'pd', head: '수납', width: 120, align: 'right', cell: (r) => <Won v={r.paidAmount} /> },
    {
      key: 'rm', head: '남은 금액', width: 120, align: 'right',
      cell: (r) => (r.remaining === 0 ? <span className="text-fg-subtle">—</span> : <Won v={r.remaining} />),
    },
    {
      key: 'stt',
      head: '상태',
      width: 110,
      cell: (r) =>
        r.overdueDays > 0 ? (
          <Chip tone="danger">연체 {r.overdueDays}일</Chip>
        ) : (
          <Chip tone={STATE[r.state]?.tone ?? 'neutral'}>{STATE[r.state]?.label ?? r.state}</Chip>
        ),
    },
    { key: 'due', head: '예정일', width: 100, cell: (r) => r.dueOn ?? '—' },
  ];

  const payCols: Array<Column<Payment>> = [
    { key: 'd', head: '입금일', width: 110, cell: (r) => <span className="font-bold">{r.paidOn ?? '미확인'}</span> },
    { key: 's', head: '학생', width: 130, cell: (r) => r.studentName ?? '—' },
    {
      key: 'a',
      head: '금액',
      width: 130,
      align: 'right',
      cell: (r) => <Won v={r.amount} bold empty={s?.canSeeAmounts ? '미확인' : undefined} />,
    },
    {
      key: 'm',
      head: '수단',
      width: 100,
      cell: (r) =>
        r.method === 'cash' ? '현금' : r.method === 'bank' || r.method === 'transfer' ? '계좌' : (r.method ?? '미확인'),
    },
    { key: 'i', head: '청구서', width: 100, cell: (r) => (r.invId ? `INV-${r.invId}` : '—') },
  ];

  const poCols: Array<Column<Payout>> = [
    { key: 'n', head: '강사', width: 110, cell: (r) => <span className="font-bold">{r.staffName}</span> },
    { key: 'ym', head: '월', width: 90, cell: (r) => r.yearMonth },
    { key: 'h', head: '시수', width: 80, align: 'right', cell: (r) => r.hours },
    { key: 'g', head: '지급 총액', width: 120, align: 'right', cell: (r) => <Won v={r.gross} /> },
    {
      key: 'c',
      head: '지연 차감',
      width: 110,
      align: 'right',
      cell: (r) =>
        r.lateRepCut === null ? (
          <Won v={null} />
        ) : (
          <span className={r.lateRepCut ? 'font-bold text-red' : 'text-fg-subtle'}>
            {won(r.lateRepCut ? -r.lateRepCut : 0, { signed: true })}
          </span>
        ),
    },
    { key: 'n2', head: '실지급', width: 130, align: 'right', cell: (r) => <Won v={r.net} bold /> },
    {
      key: 's',
      head: '상태',
      width: 90,
      cell: (r) => (
        // 낱말로 다시 판정하지 않는다 — 서버가 confirmed_by 로 낸 결론을 그대로 쓴다 (N-27)
        <Chip tone={r.confirmed ? 'success' : 'warning'}>{r.confirmed ? '확정' : '대기'}</Chip>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader title="회계" sub="청구서 → 전달 → 입금 → 기록. 강사료는 리포트를 쓴 수업만 계산합니다." />

        {/*
          회계 머리 **여섯 칸** — §52·§56 원문 그대로의 낱말·차례다 (C43).
          값은 전부 서버가 낸다. 화면이 「보낸 청구서 − 받은 돈」을 빼서 「못 받은 돈」을 만들면
          같은 이름의 숫자가 두 곳에서 나오게 된다 (D-R18).
          「남은 돈」의 색만 부호를 따른다 — 원문 표본은 음수(빨강) 한 가지뿐이라 양수는 공백이고,
          그 자리에서 빨강은 사실이 아니다 (D-R44).
        */}
        <div className="mb-4 grid grid-cols-6 gap-3">
          <StatCard label="보낸 청구서" value={<Head v={s?.sent} loaded={!!s} />} tone="info" />
          <StatCard label="받은 돈" value={<Head v={s?.collected} loaded={!!s} />} tone="success" />
          <StatCard label="못 받은 돈" value={<Head v={s?.unpaid} loaded={!!s} />} tone="warning" />
          <StatCard label="기한 지남" value={<Head v={s?.overdue} loaded={!!s} />} tone="danger" />
          <StatCard label="남은 돈" value={<Head v={s?.net} loaded={!!s} />} tone={wonTone(s?.net)} />
          <StatCard
            label="손봐야 할 것"
            value={s ? `${s.todo}건` : '—'}
            note="납부 기한이 지난 청구서"
            tone={s && s.todo > 0 ? 'danger' : 'neutral'}
          />
        </div>

        {s && !s.canSeeAmounts ? (
          <Banner tone="warning" className="mb-3">
            금액은 <b>대표만</b> 봅니다 (D-R39). 서버가 값을 내려보내지 않으므로 화면에도 없습니다 — 숨긴 것이 아니라 받지 않은
            것입니다.
          </Banner>
        ) : null}

        <Tabs
          className="mb-3"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'inv', label: `청구서 ${q.data?.invoices.length ?? 0}` },
            { value: 'record', label: '입금 기록' },
            { value: 'pay', label: `들어온 돈 ${q.data?.payments.length ?? 0}` },
            { value: 'out', label: `나간 돈 ${q.data?.expenses.length ?? 0}` },
            { value: 'payout', label: `강사료 정산 ${q.data?.payouts.length ?? 0}` },
          ]}
        />

        {q.isLoading ? (
          <Banner tone="neutral">불러오는 중…</Banner>
        ) : q.isError ? (
          <Banner tone="danger">회계는 매니저 이상만 볼 수 있습니다. 또는 서버에 닿지 못했습니다.</Banner>
        ) : tab === 'inv' ? (
          <>
            <InvoiceIssuer />
            <Table columns={invCols} rows={q.data?.invoices ?? []} rowKey={(r) => r.id} />
          </>
        ) : tab === 'record' ? (
          <PaymentRecorder invoices={q.data?.invoices ?? []} payments={q.data?.payments ?? []} />
        ) : tab === 'pay' ? (
          <Table columns={payCols} rows={q.data?.payments ?? []} rowKey={(r) => r.id} />
        ) : tab === 'out' ? (
          <ExpenseReview expenses={q.data?.expenses ?? []} totals={q.data?.expenseTotals ?? []} me={me} />
        ) : (
          <Table columns={poCols} rows={q.data?.payouts ?? []} rowKey={(r) => r.id} />
        )}

        <Banner tone="info" className="mt-4">
          정산은 <b>「리포트를 썼는가」 하나</b>로 계산합니다 — 승인 여부는 보지 않습니다 (D-R7). 깎이는 것은 지각뿐이고, 기준은
          수업이 끝난 시각부터 분 단위입니다 (D-R32).
        </Banner>
      </AppShell>
    </RequireAuth>
  );
}
