/** @file-guide
 * 목적: page.tsx — AccountingPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §52~§57 회계 — 탭은 원문 **두 층**이다(W11 · N-37 ①): 받을 돈{트래킹 보드 · 청구서 · 수업료 계산 · 그 밖의 수입} ·
 * 들어온 돈{입금 기록 · 못 받은 돈} · 나간 돈{강사료 정산 · 지출} · 정리 · 기준{월 마감 · 단가표 · 시급 · 가산 규칙(N-93)}.
 * 서버 계약은 그대로다 — 배치만 바뀌었다. 옛 `?tab=` 값(`pay` = 옛 「들어온 돈」)도 그 자리로 복원한다.
 * 탭 줄 오른쪽은 원문대로 「+ 청구서 · 시급 비공개 · 컨설팅 비공개」다(N-94 · W11 M2) — 스위치는 대표 판정 · 가리는 것은 서버.
 * 가려진 **줄** 금액은 숨긴 금액 낱말 한 벌(`MASKED` 「비공개」)로 적는다 — 금액 권한이 없어 가려진 칸과 같은 낱말이다(W11 D). 합계는 가려지지 않는다.
 *
 * 회계 탭 자체가 대표 전용이다 (D-R9 · v2 §76 — 원본 컷 머리글 「회계 〔대표·이사〕」).
 * 그래도 금액은 서버가 null 로 내려보내는 쪽을 유지한다 — **가리는 일을 화면이 하지 않는다.**
 * 사람별 예외(STAFF.can_money)로 열린 사람에게만 값이 채워진다.
 */
'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { positiveQueryId, queryEnum, queryYearMonth } from '@/lib/url-state';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, Column, PageHeader, StatCard, Table } from '@/components/ui';
import { useAccounting, useAcctPrivacy, useCarryTuition, useInvBoard, useOtherIncome, usePayoutSheet, useRateBook, useTuition } from '@/api/queries';
import { PaymentRecorder } from '@/components/accounting/PaymentRecorder';
import { ExpenseReview } from '@/components/accounting/ExpenseReview';
import { InvoiceIssuer, type InvoiceIssuerPreset } from '@/components/accounting/InvoiceIssuer';
import { InvoiceActions } from '@/components/accounting/InvoiceActions';
import { TuitionTable } from '@/components/accounting/TuitionTable';
import { OtherIncome } from '@/components/accounting/OtherIncome';
import { InvoiceBoard } from '@/components/accounting/InvoiceBoard';
import { InvoiceStageBoard } from '@/components/accounting/InvoiceStageBoard';
import { PayoutSheet } from '@/components/accounting/PayoutSheet';
import { PaymentFlow, UnpaidList } from '@/components/accounting/PaymentFlow';
import { RateBook } from '@/components/accounting/RateBook';
import { AccountingTabs, ACCOUNTING_TABS, type AccountingTab } from '@/components/accounting/AccountingTabs';
import { MonthClosePanel } from '@/components/accounting/MonthClosePanel';
import { WageList } from '@/components/accounting/WageList';
import { BonusRules, BonusSummary } from '@/components/accounting/BonusRules';
import { AcctPrivacySwitches } from '@/components/accounting/AcctPrivacySwitches';
import { categoryChip } from '@/components/accounting/category-tone';
import { useSession } from '@/store/useSession';
import type { Invoice, Payment } from '@/api/types';
import { todayKst } from '@/lib/calendar';
import { MASKED, won, wonTone } from '@/lib/money';

/**
 * 머리 여섯 칸의 금액 — 값이 길어 26px 로는 1440 폭에서 여섯 칸이 넘친다.
 * 줄이는 것은 **글자 크기뿐**이다. 자릿수를 접거나(「약 ₩721만」) 「₩」를 떼지 않는다 —
 * 대표가 보는 머리는 원문과 같은 금액이어야 한다.
 */
function Head({ v, loaded }: { v: number | null | undefined; loaded: boolean }) {
  // 아직 안 받았으면 「—」다. 숨긴 금액 낱말(「비공개」)은 **서버가 안 줬다**는 뜻이라 불러오는 중에 쓰면 거짓말이 된다.
  return <span className="text-[20px]">{won(v, loaded ? {} : { empty: '—' })}</span>;
}

/** 공용 원화 포맷을 재사용한다. 미확인 입금과 권한 가림을 호출부에서 구별한다. */
function Won({ v, bold, empty }: { v: number | null; bold?: boolean; empty?: string }) {
  if (v === null) return <span className="text-[11px] text-fg-subtle">{won(v, { empty })}</span>;
  return <span className={bold ? 'font-bold' : undefined}>{won(v)}</span>;
}

/**
 * 청구서 상태의 **빛깔**만 화면이 정한다 — 낱말은 줄이 들고 온다 (`InvoiceDto.stateLabel` · D-R18 · C66).
 *
 * 이 자리가 낱말까지 갖고 있었다. 그러면 상태 이름이 바뀌던 날 **이 파일만 뒤처지고**
 * 같은 행을 §53 표와 §57 줄이 다르게 부른다 — C64 가 청구 종류에서 고친 것과 같은 모양이다.
 * 코드표를 `/meta` 에서 따로 받지 않는다 — 그러면 C50 이 고쳐 둔 「회계 화면에 들어갈 때마다
 * 코드표를 받아 오던」 자리로 되돌아간다(회귀가 요청 1건을 센다). **줄이 제 낱말을 들고 온다.**
 * 빛깔은 어휘가 아니라 표시 판단이고 값은 토큰에서 온다 (D-R41).
 */
const STATE_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral', sent: 'info', unpaid: 'danger', partial: 'warning', paid: 'success', void: 'neutral',
};

/**
 * 이번 달 'YYYY-MM' — 강사료 시트가 처음 여는 달. 원문 §56 은 **진행 중인 달**(8월 · 오늘 08-21)을 센다 (x5 · 56-4 · D-R44).
 * 「지급 확정」은 끝난 달에만 서므로(서버 canConfirm) 이번 달에는 단추가 서지 않는다 — 지난달은 달 칸에서 고른다.
 */
function thisMonth(today = todayKst()): string {
  return today.slice(0, 7);
}

export default function AccountingPage() {
  /*
   * 처음 열리는 탭은 원문(§52)대로 **받을 돈 › 트래킹 보드**다 (C-08 · W11 A' 후속 — 리드 결정).
   * 전에는 「보드 질의 1건 절약」을 까닭으로 청구서 탭을 먼저 열었는데, W11 부터 청구서 탭도 §53 다섯 칸 판을 그려 같은
   * 보드 질의(`/accounting/board` · 같은 캐시)를 부르므로 그 까닭이 사라졌다. 대표 보고의 `?tab=inv&invId=` 는 그대로 청구서 탭을 연다.
   */
  // 알림의 「이월 발생 → 회계」 링크가 탭과 달을 들고 온다 (C92 · M-125). 형식만 보고 판정은 서버·화면이 한다
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  // 옛 평면 탭 `pay`(들어온 돈)는 두 층의 「들어온 돈 › 입금 기록」이다 — 옛 링크 · 즐겨찾기가 죽지 않게
  const queryTab: AccountingTab | null = rawTab === 'pay' ? 'record' : queryEnum(rawTab, ACCOUNTING_TABS);
  const queryMonth = queryTab === 'tuition' ? queryYearMonth(searchParams.get('month')) : null;
  // §52 카드의 「자세히 ›」가 여는 청구서 줄 — `?tab=inv&invId=` 로도 온다 (x5 · 52-03). 형식만 보고 줄은 표가 찾는다
  const queryInvId = queryTab === 'inv' ? positiveQueryId(searchParams.get('invId')) : null;
  const [tab, setTab] = useState<AccountingTab>(queryTab ?? 'board');
  const [focusInvId, setFocusInvId] = useState<number | null>(queryInvId);
  // 탭 줄 오른쪽 「+ 청구서」가 어느 탭에서든 발행 칸을 연다 (x5 · C-03) — 칸은 청구서 탭 안에 있다
  const [issuerOpen, setIssuerOpen] = useState(false);
  // §53 ① 「청구서 작성 →」이 발행 칸을 그 대상으로 채운다 · ③ 「입금 완료 →」이 입금 기록을 그 청구서로 연다 (N-28 ②)
  const [issuerPreset, setIssuerPreset] = useState<InvoiceIssuerPreset | null>(null);
  /* §54 「이 달 청구서 일괄 발행 →」(H-75) — 수강·월 청구에서 그 달의 일괄 발행 창으로 */
  const [batchPreset, setBatchPreset] = useState<{ seq: number; month: string } | null>(null);
  const [payTarget, setPayTarget] = useState<{ seq: number; invId: number } | null>(null);
  // 그 탭을 떠나면 건너온 표시를 버린다 — 나중에 탭을 다시 열 때 옛 대상이 다시 채워지지 않게
  useEffect(() => { if (tab !== 'inv') setIssuerPreset(null); }, [tab]);
  useEffect(() => { if (tab !== 'record') setPayTarget(null); }, [tab]);
  const q = useAccounting();
  // §54 는 다른 질의다 — 그 탭을 열 때만 부른다 (달을 안 주면 서버가 이번 달로 정한다)
  const tuition = useTuition(queryMonth ?? undefined, tab === 'tuition');
  // §54 이월 처리 — 누를 수 있는 줄인지는 서버가 정한다 (N-39). 월 마감 · 해제는 「정리 · 기준 › 월 마감」으로 옮겼다 (N-37 ①)
  const carry = useCarryTuition();
  // §57 도 다른 질의다 — 그 탭을 열 때만 부른다 (C66)
  // §57 의 날짜 눈금은 화면이 고르고 서버가 묶는다 (N-40)
  const [incomeSpan, setIncomeSpan] = useState('month');
  const otherIncome = useOtherIncome(incomeSpan, tab === 'other');
  // §52 · §53 판 — 트래킹 보드와 청구서 탭이 같은 질의를 쓴다(§53 다섯 칸 · N-28 ②). 다른 탭에서는 부르지 않는다 (C69)
  const invBoard = useInvBoard(tab === 'board' || tab === 'inv');
  // §57 강사료 시트도 다른 질의다 — 그 탭을 열 때만 부른다. 달은 화면이 고르고 서버가 센다 (C94-b)
  const [payoutMonth, setPayoutMonth] = useState(thisMonth);
  const payoutMonthOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(payoutMonth);
  const payoutSheet = usePayoutSheet(payoutMonth, tab === 'payout' && payoutMonthOk);
  // 단가표도 다른 질의다 — 그 탭을 열 때만 부른다 (C94-d)
  const rateBook = useRateBook(tab === 'rates');
  const me = useSession((s) => s.me);
  const s = q.data?.summary;
  /*
   * 비공개 스위치(N-94) — 가리는 것은 서버다. 화면은 null 의 **낱말**만 고른다: 청구서 줄의 null 은 권한이든 스위치든
   * 숨긴 금액 낱말 한 벌(「비공개」 · W11 D)이다(청구서 금액에는 「미확인」이 없다). 입금 줄은 null 이 「미확인」일 수도 있어
   * 컨설팅 스위치 상태를 같이 본다. 탭 줄의 스위치와 같은 질의(같은 키)라 요청이 늘지 않는다.
   */
  const privacy = useAcctPrivacy();
  const consultingHidden = privacy.data?.canSeeHidden === false
    && (privacy.data.switches ?? []).some((x) => x.key === 'consulting' && x.private);

  /* 「자세히 ›」로 온 줄을 화면 가운데로 — 표가 그리고 난 뒤 그 줄을 찾는다(없으면 조용히 둔다) */
  useEffect(() => {
    if (tab !== 'inv' || focusInvId === null || !q.data) return;
    document.querySelector('.inv-focus')?.scrollIntoView?.({ block: 'center' });
  }, [tab, focusInvId, q.data]);

  const invCols: Array<Column<Invoice>> = [
    {
      key: 'st',
      head: '학생',
      width: 130,
      cell: (r) => (
        <span className="font-bold">
          {r.studentName} <span className="font-normal text-fg-subtle">{r.studentTag}</span>
        </span>
      ),
    },
    { key: 'ym', head: '청구월', width: 90, cell: (r) => r.yearMonth },
    // 원문 §53 카드마다의 「수업료 청구」·「컨설팅비 청구」 칩 — 낱말은 보드 카드와 같은 서버 invTypeLabel (x5 · 53-02)
    // 칩 빛깔은 §53 카드 · §55 분류와 같은 한 벌이다(`category-tone`)
    { key: 'ty', head: '종류', width: 120, cell: (r) => <Chip tone={categoryChip(r.invType)}>{r.invTypeLabel}</Chip> },
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
          <Chip tone={STATE_TONE[r.state] ?? 'neutral'}>{r.stateLabel}</Chip>
        ),
    },
    {
      // 분납이면 **지금 기한**(못 채운 가장 이른 회차의 예정일)과 그 회차다 — 둘 다 서버 값 (N-79 · §55 「2회차」)
      key: 'due', head: '예정일', width: 120,
      cell: (r) => (r.nextInstallmentSeq != null
        ? <span>{r.nextDueOn}<span className="ml-1 text-[11px] text-fg-subtle">{r.nextInstallmentSeq}회차</span></span>
        : (r.dueOn ?? '—')),
    },
    // 전달 · 취소 — 단추가 서는지는 서버의 canDeliver/canVoid 다 (C94-a · D-R39)
    { key: 'act', head: '', width: 130, align: 'right', cell: (r) => <InvoiceActions invoice={r} /> },
  ];

  const payCols: Array<Column<Payment>> = [
    { key: 'd', head: '입금일', width: 110, cell: (r) => <span className="font-bold">{r.paidOn ?? '미확인'}</span> },
    { key: 's', head: '학생', width: 130, cell: (r) => r.studentName ?? '—' },
    {
      /*
       * §55 의 **분류** — 저장된 칸이 아니라 서버가 읽어 만든 값이다 (N-37 ③ · 대표 결정).
       * 화면이 `invId` 로 「기타인가」를 다시 판정하면 칩줄의 건수와 표가 갈린다 (D-R39).
       */
      key: 'c', head: '분류', width: 110,
      cell: (r) => <Chip tone={r.category === 'etc' ? 'neutral' : 'info'}>{r.categoryLabel}</Chip>,
    },
    {
      key: 'a',
      head: '금액',
      width: 130,
      align: 'right',
      cell: (r) => (
        <Won v={r.amount} bold
          empty={s?.canSeeAmounts ? (r.category === 'consulting' && consultingHidden ? MASKED : '미확인') : undefined} />
      ),
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

  return (
    <RequireAuth>
      <AppShell>
        {/* 부제는 원문 §52~§57 머리 그대로다(C-04). 뒤 절 「개별 내역을 비공개로 지정할 수 있습니다」는
            탭 줄 오른쪽 두 비공개 스위치(N-94 · W11 M2)가 생겨 되살렸다 */}
        <PageHeader title="회계" sub="매출 · 수납 · 지출 · 결산을 한 곳에서 봅니다 · 개별 내역을 비공개로 지정할 수 있습니다" />

        {/*
          회계 머리 **여섯 칸** — §52·§56 원문 그대로의 낱말·차례다 (C43).
          값은 전부 서버가 낸다. 화면이 「보낸 청구서 − 받은 돈」을 빼서 「못 받은 돈」을 만들면
          같은 이름의 숫자가 두 곳에서 나오게 된다 (D-R18).
          「남은 돈」의 색만 부호를 따른다 — 원문 표본은 음수(빨강) 한 가지뿐이라 양수는 공백이고,
          그 자리에서 빨강은 사실이 아니다 (D-R44).
        */}
        {/* 원문 머리 여섯 칸 = 낮은 카드 · **윗변 색 줄**(파랑 · 초록 · 주황 · 빨강 · 빨강) · 「손봐야 할 것」 분홍 바탕 (x5 · C-05).
            공용 StatCard 의 accent·fill 을 쓴다 — 값·등식은 그대로 서버의 것이다.
            좁은 화면은 두 칸 · 세 칸으로 접는다 — 여섯 칸 고정이면 393 폭에서 「₩」 붙은 금액이 옆 칸으로 넘친다(W11 QA W11-M-1+ ·
            현황판 · GPA 머리와 같은 접기) */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard className="py-3" accent="info" label="보낸 청구서" value={<Head v={s?.sent} loaded={!!s} />} tone="info" />
          <StatCard className="py-3" accent="success" label="받은 돈" value={<Head v={s?.collected} loaded={!!s} />} tone="success" />
          <StatCard className="py-3" accent="orange" label="못 받은 돈" value={<Head v={s?.unpaid} loaded={!!s} />} tone="orange" />
          <StatCard className="py-3" accent="danger" label="기한 지남" value={<Head v={s?.overdue} loaded={!!s} />} tone="danger" />
          <StatCard className="py-3" accent="danger" label="남은 돈" value={<Head v={s?.net} loaded={!!s} />} tone={wonTone(s?.net)} />
          <StatCard
            className="py-3"
            label="손봐야 할 것"
            value={s ? `${s.todo}건` : '—'}
            note="납부 기한이 지난 청구서"
            fill={!!s && s.todo > 0}
            tone={s && s.todo > 0 ? 'danger' : 'neutral'}
          />
        </div>

        {s && !s.canSeeAmounts ? (
          <Banner tone="warning" className="mb-3">
            금액은 <b>대표만</b> 봅니다. 서버가 값을 내려보내지 않으므로 화면에도 없습니다 — 숨긴 것이 아니라 받지 않은
            것입니다.
          </Banner>
        ) : null}

        {/* 탭 두 층(N-37 ①) + 오른쪽 「+ 청구서 · 시급 비공개 · 컨설팅 비공개」 — 원문 §52~§57 여섯 컷 공통 (x5 · C-03 · N-94) */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/5 px-2 py-1.5">
          <AccountingTabs value={tab} onChange={setTab} />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => { setTab('inv'); setIssuerOpen(true); }}>+ 청구서</Button>
            <AcctPrivacySwitches />
          </div>
        </div>

        {q.isLoading ? (
          <Banner tone="neutral">불러오는 중…</Banner>
        ) : q.isError ? (
          <Banner tone="danger">회계는 매니저 이상만 볼 수 있습니다. 또는 서버에 닿지 못했습니다.</Banner>
        ) : tab === 'board' ? (
          <InvoiceBoard data={invBoard.data} loading={invBoard.isLoading}
            onOpenInvoice={(invId) => { setFocusInvId(invId); setTab('inv'); }} />
        ) : tab === 'inv' ? (
          <>
            {/* 원문 §53 머리 — 「+ 새 청구서 발행」(= 「+ 청구서」와 같은 칸) · 「자동 생성 켜기」(= 일괄 발행 칸 · N-28 ②).
                「칸을 누르면 그 단계만 봅니다」는 아직 없는 동작이라 적지 않는다 */}
            <InvoiceIssuer
              open={issuerOpen}
              onOpenChange={setIssuerOpen}
              preset={issuerPreset}
              batchPreset={batchPreset}
              heading={(
                <h2 className="flex items-baseline gap-2 text-[15px] font-bold text-fg">
                  청구서 <span className="text-[11.5px] font-normal text-fg-subtle">왼쪽에서 오른쪽으로 밀어 갑니다</span>
                </h2>
              )}
            />
            <InvoiceStageBoard
              data={invBoard.data}
              loading={invBoard.isLoading}
              invoices={q.data?.invoices ?? []}
              onIssue={(c) => {
                setIssuerPreset((p) => ({ seq: (p?.seq ?? 0) + 1, studentId: c.studentId, yearMonth: c.yearMonth, invType: c.invType }));
                setIssuerOpen(true);
              }}
              onPay={(invId) => { setPayTarget((p) => ({ seq: (p?.seq ?? 0) + 1, invId })); setTab('record'); }}
              onOpen={(invId) => {
                // 같은 줄을 다시 열면 상태가 그대로라 효과가 안 돈다 — 그 줄을 바로 부른다
                if (invId === focusInvId) document.querySelector('.inv-focus')?.scrollIntoView?.({ block: 'center' });
                else setFocusInvId(invId);
              }}
            />
            <h3 className="mb-2 text-[13px] font-bold text-fg">
              청구서 <span className="text-[11.5px] font-normal text-fg-subtle">전체 {q.data?.invoices.length ?? 0}건</span>
            </h3>
            {/* 「자세히 ›」·「열기」로 온 줄은 옅게 칠한다 (x5 · 52-03) — 원문에 없는 상세 창 대신 그 줄로 간다 */}
            <Table columns={invCols} rows={q.data?.invoices ?? []} rowKey={(r) => r.id}
              rowClassName={(r) => (r.id === focusInvId ? 'inv-focus bg-amber/10' : undefined)} />
          </>
        ) : tab === 'other' ? (
          <OtherIncome
            data={otherIncome.data}
            loading={otherIncome.isLoading}
            span={incomeSpan}
            onSpanChange={setIncomeSpan}
          />
        ) : tab === 'tuition' ? (
          /* 월 마감 · 해제 단추는 「정리 · 기준 › 월 마감」에 선다 — 여기에는 마감 배지만 남는다(원문 §54 컷에 단추가 없다) */
          <>
            {/* 테스트 시나리오 H-75 「회계 → 수강·월 청구 → 상단 청구서 발행」 — §54 의 계산이 곧 청구서다(「청구서 생성 시 이 계산 결과를 씁니다」).
                여기서 내지 않고 청구서 탭의 일괄 발행 창(같은 함수)을 그 달로 연다 — 발행 자리는 하나다 */}
            {tuition.data ? (
              <div className="mb-2 flex justify-end">
                <Button size="sm" variant="secondary"
                  title="청구서 탭의 일괄 발행 창을 이 달로 엽니다 — 이월 · 단가 구간 · 휴강은 같은 계산입니다"
                  onClick={() => {
                    const month = tuition.data?.month;
                    if (!month) return;
                    setBatchPreset((p) => ({ seq: (p?.seq ?? 0) + 1, month }));
                    setTab('inv');
                  }}>
                  이 달 청구서 일괄 발행 →
                </Button>
              </div>
            ) : null}
            <TuitionTable
              data={tuition.data}
              loading={tuition.isLoading}
              carryingId={carry.isPending ? carry.variables?.studentId ?? null : null}
              onCarry={(studentId) => {
                const month = tuition.data?.month;
                if (month) carry.mutate({ studentId, month });
              }}
            />
          </>
        ) : tab === 'record' ? (
          <>
            {/*
              원문 「들어온 돈 › 입금 기록」 = 제품의 옛 「들어온 돈」(§55 기간 요약 · 입금 달력 · 분류별 · 미수 전체)
              + 옛 「입금 기록」(청구서에 입금 줄 붙이기 · 분납은 줄을 늘린다) — 한 탭이다 (N-37 ①).
              분류 칩의 건수는 **고른 기간의 수**다(w5) — 전 기간 수를 세는 칩줄을 나란히 세우지 않는다.
            */}
            <PaymentFlow />
            {/* §53 ③ 「입금 완료 →」로 오면 그 청구서를 골라 둔 채 새로 연다 */}
            <PaymentRecorder key={payTarget?.seq ?? 0} initialInvId={payTarget?.invId ?? null}
              invoices={q.data?.invoices ?? []} payments={q.data?.payments ?? []} />
            {/* 입금 줄 하나하나는 기간과 무관하게 그대로 둔다 — 달력은 날마다의 합이라 줄을 대신하지 못한다 */}
            <h3 className="mb-2 mt-4 text-[13px] font-bold text-fg">
              입금 줄 <span className="text-[11.5px] font-normal text-fg-subtle">전체 기간 · {q.data?.payments.length ?? 0}건</span>
            </h3>
            <Table columns={payCols} rows={q.data?.payments ?? []} rowKey={(r) => r.id} />
          </>
        ) : tab === 'unpaid' ? (
          <UnpaidList />
        ) : tab === 'out' ? (
          <ExpenseReview expenses={q.data?.expenses ?? []} totals={q.data?.expenseTotals ?? []} categories={q.data?.expenseCategories ?? []} me={me} />
        ) : tab === 'payout' ? (
          <PayoutSheet data={payoutSheet.data} loading={payoutSheet.isLoading} month={payoutMonth} onMonthChange={setPayoutMonth}
            below={<BonusSummary onEdit={() => setTab('bonus')} />} />
        ) : tab === 'close' ? (
          <MonthClosePanel />
        ) : tab === 'wage' ? (
          <WageList />
        ) : tab === 'bonus' ? (
          <BonusRules />
        ) : (
          <RateBook data={rateBook.data} loading={rateBook.isLoading} />
        )}

        {/*
          * 정산 설명은 **정산 탭에서만** 선다. 탭 밖에 있어서 청구서·수업료 계산·입금 기록·들어온 돈 …
          * 어느 탭을 열어도 「정산은 …」이 따라붙고 있었다 — 화면이 지금 보고 있는 것과
          * 상관없는 말을 하면, 읽는 사람은 그 말이 이 표에 대한 설명이라고 읽는다.
          */}
        {tab === 'payout' ? (
          <Banner tone="info" className="mt-4">
            정산은 <b>「리포트를 썼는가」 하나</b>로 계산합니다 — 승인 여부는 보지 않습니다. 깎이는 것은 지각뿐이고, 기준은
            수업이 끝난 시각부터 분 단위입니다. 더하는 돈은 「정리 · 기준 › 가산 규칙」대로 붙습니다. 「지급 확정」은 대표가 끝난 달에만
            할 수 있고, 그 순간의 계산을 회차 줄과 함께 굳힙니다 — 확정한 달은 바뀌지 않고, 확정 뒤에 쓴 리포트는 다음 미확정 달에
            「보정」 줄로 얹혀 그 달 확정 때 지급됩니다.
          </Banner>
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}
