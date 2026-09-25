/** @file-guide
 * 목적: PaymentFlow.tsx — PaymentFlow (component)
 * 책임/재사용: §55 들어온 돈의 기간 요약·입금 달력·분류별·미수 전체. 기간 이동은 lib/calendar, 조회는 accounting-queries, 칩은 ui/ChipButton 을 재사용한다. 세는 일은 하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §55 들어온 돈 (원문은 「들어온 돈 › 입금 기록」) — w5 · 55-01 · 55-02 · 55-03 · 55-05.
 *
 * 컷의 왼쪽은 「일간 · 주간 · 월간 · 전체」 + 「‹ 2026년 8월 · 31일 › 오늘」 + 요약 「11건 · 청구 · 입금 · 예정」,
 * 그 밑에 분류 칩 줄과 **일요일부터 시작하는 입금 달력**이다. 오른쪽은 「분류별」과 「미수 전체 · 기간과 무관」.
 *
 * **여기서 아무것도 세지 않는다** (D-R37) — 건수·청구·입금·예정·날마다의 합계·배지·분류별 비율·미수 줄의
 * 「D-7 / 21일 연체」 낱말까지 전부 서버(`GET /accounting/cashflow`)가 낸다. 화면이 고르는 것은 기간과 분류뿐이다.
 * 기간 낱말(「2026년 8월」)도 서버의 것이다 (D-R18).
 *
 * 컷의 「+ 결제 등록」은 **청구서 없이 들어온 돈**을 적는 자리다(A-D1 ② · 2026-08-25 확정 「청구서 발행 + 매니저 직접 입력」) —
 * `ManualPaymentButton` 이 `POST /accounting/payments/manual` 로 보낸다. 청구서가 있는 입금은 「입금 기록」 탭에서 붙인다.
 */
'use client';
import { useState } from 'react';
import { Banner, Button, ChipButton, Segmented, cn } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { KO_DOW, addDays, dowOf, step, summaryBoundsOf, todayKst } from '@/lib/calendar';
import { won } from '@/lib/money';
import { useCashflow, type Cashflow, type CashflowDay } from './accounting-queries';
import { categoryTone } from './category-tone';
import { ManualPaymentButton } from './ManualPaymentForm';

type Period = 'day' | 'week' | 'month' | 'all';
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'all', label: '전체' },
];

/**
 * 입금 달력 — **일요일 시작**(원문 §55). 기간을 덮는 주만 그리고, 기간 밖 칸은 비워 둔다
 * (컷의 8월 1일 앞 칸이 비어 있는 것과 같다 — 앞뒤 달 날짜를 섞으면 그 칸의 돈이 이 기간 돈처럼 읽힌다).
 *
 * 짙기는 **그 기간에서 가장 큰 날**에 견준 세 단계다. 금액을 못 보는 사람에게는 금액이 없으므로 건수로 견준다.
 */
function PayCalendar({ from, to, days, today, canSee }: {
  from: string; to: string; days: CashflowDay[]; today: string; canSee: boolean;
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weight = (d: CashflowDay) => (canSee ? d.amount ?? 0 : d.count);
  const max = days.reduce((m, d) => Math.max(m, weight(d)), 0);
  const shade = (d: CashflowDay) => {
    const x = max > 0 ? weight(d) / max : 0;
    return x > 0.66 ? 'bg-blue/40' : x > 0.33 ? 'bg-blue/25' : 'bg-blue/10';
  };
  const cells: string[] = [];
  for (let d = addDays(from, -dowOf(from)); d <= addDays(to, 6 - dowOf(to)); d = addDays(d, 1)) cells.push(d);

  return (
    <div role="group" aria-label="입금 달력" className="rounded-xl border border-line bg-card p-3">
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11.5px] font-bold">
        {KO_DOW.map((w, i) => <span key={w} className={i === 0 ? 'text-red' : 'text-fg-2'}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((iso) => {
          if (iso < from || iso > to) return <div key={iso} aria-hidden className="min-h-[76px]" />;
          const d = byDate.get(iso);
          const isToday = iso === today;
          const day = Number(iso.slice(8, 10));
          return (
            <div
              key={iso}
              data-date={iso}
              title={d ? `${iso} · ${canSee ? won(d.amount) : `${d.count}건`}${d.expectedCount ? ` · 예정 ${d.expectedCount}건` : ''}` : iso}
              className={cn(
                'relative min-h-[76px] rounded-lg p-2',
                d ? shade(d) : '',
                isToday ? 'bg-amber/10 ring-2 ring-amber' : '',
              )}
            >
              <span className={cn('text-[12px] font-bold', dowOf(iso) === 0 ? 'text-red' : 'text-fg')}>{day}</span>
              {d ? (
                <span className="mt-1 block text-[11px] font-bold text-fg">{canSee ? won(d.amount) : `${d.count}건`}</span>
              ) : null}
              {/* 숫자 배지 = 그날 기한인 **예정** 건수 — 서버가 센 값 */}
              {d && d.expectedCount > 0 ? (
                <span aria-label={`예정 ${d.expectedCount}건`} className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {d.expectedCount}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 오른쪽 「분류별」 — 금액 · 받은 비율 막대 · % (55-03) */
function ByCategory({ data }: { data: Cashflow }) {
  return (
    <section aria-label="분류별">
      <h3 className="mb-2 flex items-baseline gap-2 border-b border-line pb-2 text-[13px] font-bold text-fg">
        분류별 <span className="text-[11.5px] font-normal text-fg-subtle">{data.label}</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {data.categories.map((c) => (
          <li key={c.key} className="grid grid-cols-[minmax(0,1fr)_auto_80px_40px] items-center gap-2 text-[12px]">
            <span className="flex min-w-0 items-center gap-1.5 font-bold text-fg">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-sm', categoryTone(c.key))} />
              <span className="truncate" title={c.label}>{c.label}</span>
            </span>
            <span className="text-right font-bold text-fg">{won(c.billed)}</span>
            <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, c.rate ?? 0))}%` }} />
            </span>
            <span className="text-right text-[11px] text-fg-2">{c.rate === null ? '—' : `${c.rate}%`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 「미수 전체 · 기간과 무관」 — 줄 바탕과 낱말은 서버가 정한다 (연체 분홍 · 임박 노랑) */
function OpenList({ data }: { data: Cashflow }) {
  return (
    <section aria-label="미수 전체">
      <h3 className="mb-2 flex items-baseline gap-2 border-b border-line pb-2 text-[13px] font-bold text-fg">
        미수 전체 <span className="text-[11.5px] font-normal text-fg-subtle">기간과 무관</span>
      </h3>
      {data.open.length === 0 ? (
        <p className="text-[12px] text-fg-subtle">받을 돈이 남은 청구서가 없습니다</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {data.open.map((o) => (
            <li
              key={o.invId}
              className={cn(
                'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-lg border px-3 py-2 text-[12px]',
                o.tone === 'danger' ? 'border-red/30 bg-red/10' : o.tone === 'warning' ? 'border-amber/30 bg-amber/10' : 'border-line bg-card',
              )}
            >
              <span className="truncate font-bold text-fg" title={o.studentName}>{o.studentName}</span>
              <span className="text-fg-2">{o.partLabel}</span>
              <span className="text-right font-bold text-fg">{won(o.amount)}</span>
              <span className={cn('min-w-12 text-right text-[11px] font-bold', o.tone === 'danger' ? 'text-red' : 'text-fg-2')}>{o.whenLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PaymentFlow() {
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(todayKst);
  const [category, setCategory] = useState('');
  // 기간을 정하는 자리는 스케줄과 같은 함수다 — 월간은 그 달 1일~끝날(앞뒤 달을 섞지 않는다), 주간은 월요일부터
  const bounds = period === 'all' ? null : summaryBoundsOf(period, anchor);
  const q = useCashflow({ from: bounds?.from, to: bounds?.to, category });
  const d = q.data;
  const canSee = d?.canSeeAmounts ?? true;

  return (
    <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Segmented ariaLabel="기간" options={PERIODS} value={period} onChange={setPeriod} />
          <div className="flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1">
            <Button size="sm" variant="ghost" aria-label="이전 기간" disabled={period === 'all'}
              onClick={() => { if (period !== 'all') setAnchor((a) => step(period, a, -1)); }}>‹</Button>
            <span className="flex min-w-32 flex-col px-2">
              <b className="text-[13px] text-fg">{d?.label ?? '…'}</b>
              <span className="text-[11px] text-fg-subtle">{d?.dayCount ? `${d.dayCount}일` : ' '}</span>
            </span>
            <Button size="sm" variant="ghost" aria-label="다음 기간" disabled={period === 'all'}
              onClick={() => { if (period !== 'all') setAnchor((a) => step(period, a, 1)); }}>›</Button>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(todayKst())}>오늘</Button>
          </div>
          {/* 요약 — 청구 = 입금 + 예정. 세 수와 건수는 서버가 낸다 */}
          {d ? (
            <div role="group" aria-label="기간 요약" className="ml-auto flex items-end gap-4 text-[11px] text-fg-subtle">
              <span className="flex flex-col"><b className="text-[15px] text-fg">{d.count}</b>건</span>
              <span className="flex flex-col"><b className="text-[15px] text-fg">{won(d.billed)}</b>청구</span>
              <span className="flex flex-col"><b className="text-[15px] text-green">{won(d.paid)}</b>입금</span>
              <span className="flex flex-col"><b className="text-[15px] text-primary">{won(d.expected)}</b>예정</span>
            </div>
          ) : null}
          {/* 원문 §55 — 요약 오른쪽 끝의 주 단추 */}
          <div className={d ? undefined : 'ml-auto'}><ManualPaymentButton /></div>
        </div>

        {d ? (
          /* 분류 칩 — 누르면 그 분류만 센다(요약·달력). 칩의 건수는 고른 분류와 무관한 이 기간의 수라 줄이 흔들리지 않는다.
             「전체」의 수는 여섯 칸의 합이다 — 한 줄은 정확히 한 분류에 드는 것을 서버 회귀가 센다 */
          <div role="group" aria-label="분류" className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-inset px-3 py-2">
            <span className="mr-1 text-[11.5px] font-bold text-fg-subtle">분류</span>
            <ChipButton pressed={category === ''} onClick={() => setCategory('')}>
              전체 {d.categories.reduce((n, c) => n + c.count, 0)}
            </ChipButton>
            {d.categories.map((c) => (
              <ChipButton key={c.key} pressed={category === c.key} onClick={() => setCategory(category === c.key ? '' : c.key)}>
                <span aria-hidden className={cn('mr-1 size-2.5 rounded-sm', categoryTone(c.key))} />
                {c.label} {c.count}
              </ChipButton>
            ))}
          </div>
        ) : null}

        {q.isLoading ? (
          <Banner tone="neutral">불러오는 중…</Banner>
        ) : q.isError ? (
          <Banner tone="danger">{apiMessage(q.error)}</Banner>
        ) : d && bounds ? (
          <PayCalendar from={bounds.from} to={bounds.to} days={d.days} today={d.today} canSee={canSee} />
        ) : d ? (
          <Banner tone="neutral">전체 기간은 날짜 달력 없이 합계만 봅니다 — 날짜별은 일간 · 주간 · 월간에서 봅니다.</Banner>
        ) : null}
      </div>

      {d ? (
        <aside className="flex flex-col gap-5">
          <ByCategory data={d} />
          <OpenList data={d} />
        </aside>
      ) : null}
    </div>
  );
}
