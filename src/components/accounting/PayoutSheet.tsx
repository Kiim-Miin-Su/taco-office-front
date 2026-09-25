/** @file-guide
 * 목적: PayoutSheet.tsx — PayoutSheetProps, PayoutSheet, PayoutConfirmButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §56 강사료 계산 · 「지급 확정」 (C94-b · 테스트 시나리오 H-82 · O-148 · D-43 · w5 56-01 · 56-02).
 *
 * 원문 §56 은 **왼쪽 선생님 카드 · 오른쪽 상세**다 — 카드에 「3번 · 3.8시간 · 못 드림 5h」 · 「리포트 −5,000」 · 금액 ·
 * 「자세히 ›」, 그 밑에 합계 카드 「8월에 드릴 돈」 + 칩(시간 · 강사료 · 차감 · 세금 · 보류). 오른쪽은 고르기 전
 * 「왼쪽에서 선생님을 눌러주세요 / 시급 · 수업 날짜 · 리포트 미작성 · 정산 내역을 봅니다」다. 전에는 한 장 표였다.
 *
 * **여기서 아무것도 세지 않는다.** 쓴 수업·미작성·휴강·총액·차감·세금·실지급·「빠진 금액」과 합계 카드의 다섯 값,
 * 상세의 수업 줄과 시급까지 전부 서버가 `lib/payout-sheet` 한 곳에서 낸 값이고, 강사 화면(§57 `/teacher/history`)이
 * **같은 함수**를 부른다 (D-R37). 화면이 미작성을 다시 빼거나 세금을 다시 곱하면 강사가 보는 수와 대표가 확정하는 수가 갈린다.
 *
 * 「지급 확정」 단추가 서는지는 **서버의 `canConfirm`** 이다 (D-R39). 단추는 상세 머리에 둔다 — 확정은 그 사람의
 * 수업 날짜·미작성을 본 뒤에 하는 일이고, 카드 전체가 누르는 자리라 카드 안에 또 단추를 겹치지 않는다.
 * 확정을 되돌리는 길은 없다 — 창이 그 사실을 말한다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Chip, Dialog, Input, Label, Panel, Table, cn, type Column, type Tone } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useConfirmPayout } from '@/api/queries';
import type { PayoutSheet as PayoutSheetData, PayoutSheetRow } from '@/api/types';
import { hhmm, label as dayLabel } from '@/lib/calendar';
import { MASKED, won } from '@/lib/money';
import { usePayoutDetail, type PayoutLesson } from './accounting-queries';

export interface PayoutSheetProps {
  data?: PayoutSheetData;
  loading?: boolean;
  /** 보는 달 — 화면이 고르고 서버가 센다 */
  month: string;
  onMonthChange: (month: string) => void;
}

const monthLabel = (ym: string) => `${Number(ym.slice(5))}월`;
const hours = (min: number) => `${(min / 60).toFixed(1)}h`;
/** 원문 표기 — 「3.8시간」·「2시간」·「못 드림 5h」: 소수 한 자리, 0 이면 떼어 낸다 */
const num1 = (min: number) => String(Math.round(min / 6) / 10);

/** 줄의 「지급 확정」 — 단추가 서는지는 서버 `canConfirm`. 창이 무엇을 굳히는지 말하고 오류는 서버 문장 그대로 */
export function PayoutConfirmButton({ row }: { row: PayoutSheetRow }) {
  const id = useId();
  const confirm = useConfirmPayout();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) setErr(null); }, [open]);
  if (!row.canConfirm) return null;
  return (
    <>
      <Button size="sm" variant="secondary" disabled={confirm.isPending} onClick={() => setOpen(true)}>지급 확정</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`지급 확정 — ${row.staffName} · ${monthLabel(row.yearMonth)}`}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={confirm.isPending}>취소 (Esc)</Button>
            <Button type="button" variant="primary" disabled={confirm.isPending}
              onClick={() => confirm.mutate(
                { month: row.yearMonth, body: { staffId: row.staffId } },
                { onSuccess: () => setOpen(false), onError: (e) => setErr(apiMessage(e)) },
              )}>
              {confirm.isPending ? '처리 중…' : '지급 확정'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3 text-[12.5px] text-fg-2">
          {/* 굳히는 값은 서버가 준 줄 그대로다 — 창이 다시 세지 않는다 */}
          <dl id={`${id}-sum`} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-fg-subtle">쓴 수업</dt><dd className="font-bold text-fg">{row.writtenCount}회 · {hours(row.writtenMinutes)}</dd>
            <dt className="text-fg-subtle">미작성 · 빠짐</dt>
            <dd className={row.unwrittenCount > 0 ? 'font-bold text-red' : 'text-fg'}>
              {row.unwrittenCount}회{row.unwrittenAmount ? ` · ${won(row.unwrittenAmount)}` : ''}
            </dd>
            <dt className="text-fg-subtle">휴강 · 대상 아님</dt><dd className="text-fg">{row.canceledCount}회 · {row.naCount}회</dd>
            <dt className="text-fg-subtle">실지급</dt><dd className="font-bold text-fg">{won(row.net)}</dd>
          </dl>
          <p>
            지금 계산을 그대로 굳힙니다{row.savedDiffers ? ` — 저장돼 있던 ${won(row.savedNet)} 은 덮입니다` : ''}.
            미작성 리포트는 <b>빠진 채</b> 확정되고, 확정 뒤에는 되돌릴 수 없습니다. 누가·언제 확정했는지 남습니다.
          </p>
          {err ? <Banner tone="danger">{err}</Banner> : null}
        </div>
      </Dialog>
    </>
  );
}

/** 줄의 상태 칩 — 확정 여부는 서버의 `confirmed` 하나로 본다 (N-27) */
function StatusChips({ r }: { r: PayoutSheetRow }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {r.confirmed ? (
        <Chip tone="success" title={r.confirmedAt ? `${r.confirmedAt.slice(0, 16).replace('T', ' ')} · ${r.confirmedBy ?? ''}` : undefined}>
          확정{r.confirmedBy ? ` · ${r.confirmedBy}` : ''}
        </Chip>
      ) : r.writtenCount === 0 && r.unwrittenCount === 0 ? (
        /*
         * 쓴 것도 안 쓴 것도 없다(자습 감독뿐인 코디네이터 등). 「대기」라 적으면 확정할 것이 있는 줄 안다.
         * 다만 **저장된 정산 행이 있으면** 「정산 없음」은 거짓이다 — 행이 있는데 없다고 말하게 된다(56-05).
         */
        r.saved ? <Chip tone="neutral">저장됨 · 미확정</Chip> : <Chip tone="neutral">정산 없음</Chip>
      ) : (
        <Chip tone="warning">대기</Chip>
      )}
      {r.noRateCount > 0 ? <Chip tone="danger" title="시급이 없어 못 센 수업이 있습니다 — 시급을 먼저 등록하세요">시급 없음 {r.noRateCount}</Chip> : null}
      {r.savedDiffers ? <Chip tone="neutral" title={`저장값 ${won(r.savedNet)}`}>저장값 다름</Chip> : null}
    </span>
  );
}

/** 왼쪽 선생님 카드 — 원문 §56 한 장. 카드 전체가 「자세히」다 */
function TeacherCard({ r, selected, onSelect }: { r: PayoutSheetRow; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${r.staffName} 자세히 보기`}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left hover:bg-inset',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-line',
      )}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <b className="text-[14px] text-fg">{r.staffName}</b>
        <span className="text-[11.5px] text-fg-2">
          {r.writtenCount}번 · {num1(r.writtenMinutes)}시간
          {r.unwrittenMinutes > 0 ? <span className="text-red"> · 못 드림 {num1(r.unwrittenMinutes)}h</span> : null}
        </span>
        <span className="flex flex-wrap gap-1">
          {/* 「리포트 −5,000」 = 지각 차감 (D-R32). 0 이거나 못 보면 칩이 서지 않는다 */}
          {r.lateCut ? <Chip tone="danger" size="compact">리포트 {won(-r.lateCut)}</Chip> : null}
          <StatusChips r={r} />
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <b className="text-[15px] text-primary">{won(r.net)}</b>
        <span className="text-[11px] font-bold text-fg-subtle">자세히 ›</span>
      </span>
    </button>
  );
}

/** 합계 카드 — 「8월에 드릴 돈」 + 칩 다섯. 전부 줄의 합이고 서버가 더했다 (56-02) */
function TotalsCard({ data }: { data: PayoutSheetData }) {
  return (
    <section aria-label="합계" className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <b className="text-[14px] text-fg">{monthLabel(data.month)}에 드릴 돈</b>
        <b className="text-[18px] text-primary">{won(data.netTotal)}</b>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="info">{num1(data.writtenMinutes)}시간</Chip>
        {data.grossTotal !== null ? <Chip tone="info">강사료 {won(data.grossTotal)}</Chip> : null}
        {data.lateCutTotal !== null ? <Chip tone="danger">차감 {won(-data.lateCutTotal)}</Chip> : null}
        {data.taxTotal !== null ? <Chip tone="danger">세금 {won(-data.taxTotal)}</Chip> : null}
        {data.unwrittenMinutes > 0 ? <Chip tone="warning" title="리포트를 안 써 이 달 정산에서 빠진 시간">보류 {num1(data.unwrittenMinutes)}h</Chip> : null}
      </div>
    </section>
  );
}

const SETTLE_TONE: Record<PayoutLesson['settle'], Tone> = {
  written: 'success', unwritten: 'danger', canceled: 'neutral', na: 'neutral', upcoming: 'info',
};

/** 오른쪽 상세 — 시급 · 정산 내역 · 수업 날짜(리포트 미작성 포함). 값은 시트의 그 줄과 같은 함수가 셌다 */
function PayoutDetailPane({ row, month }: { row: PayoutSheetRow; month: string }) {
  const q = usePayoutDetail(row.staffId, month);
  const cols: Array<Column<PayoutLesson>> = [
    { key: 'd', head: '날짜', width: 90, cell: (l) => <span className="font-bold">{dayLabel(l.onDate)}</span> },
    { key: 't', head: '시각', width: 100, cell: (l) => `${hhmm(l.startMin)}–${hhmm(l.startMin + l.durMin)}` },
    {
      key: 'n', head: '수업', cell: (l) => (
        <span className="flex flex-col">
          <span className="font-bold text-fg">{l.name}</span>
          {l.students ? <span className="text-[11px] text-fg-subtle">{l.students}</span> : null}
        </span>
      ),
    },
    { key: 's', head: '정산', width: 120, cell: (l) => <Chip tone={SETTLE_TONE[l.settle]}>{l.settleLabel}</Chip> },
    { key: 'p', head: '강사료', width: 110, align: 'right', cell: (l) => (l.pay === null ? <span className="text-fg-subtle">—</span> : won(l.pay)) },
    {
      key: 'l', head: '지각 차감', width: 100, align: 'right',
      cell: (l) => (l.lateCut ? <span className="font-bold text-red">{won(-l.lateCut)}</span> : <span className="text-fg-subtle">—</span>),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-fg">{row.staffName} · {monthLabel(row.yearMonth)} 정산</h3>
          <div className="mt-1"><StatusChips r={row} /></div>
        </div>
        <PayoutConfirmButton row={row} />
      </header>

      {/* 정산 내역 — 시트의 줄 그대로다 (화면이 더하지 않는다) */}
      <dl aria-label="정산 내역" className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-inset px-4 py-3 text-[12.5px]">
        <dt className="text-fg-subtle">쓴 수업</dt><dd className="font-bold text-fg">{row.writtenCount}회 · {hours(row.writtenMinutes)}</dd>
        <dt className="text-fg-subtle">미작성 · 빠짐</dt>
        <dd className={row.unwrittenCount > 0 ? 'font-bold text-red' : 'text-fg'}>
          {row.unwrittenCount}회{row.unwrittenAmount ? ` · ${won(row.unwrittenAmount)} 빠짐` : ''}
        </dd>
        <dt className="text-fg-subtle">휴강 · 대상 아님</dt><dd className="text-fg">휴강 {row.canceledCount} · 대상 아님 {row.naCount}</dd>
        <dt className="text-fg-subtle">총액</dt><dd className="text-fg">{won(row.gross)}</dd>
        <dt className="text-fg-subtle">지각 차감</dt><dd className={row.lateCut ? 'font-bold text-red' : 'text-fg'}>{row.lateCut === null || row.lateCut === undefined ? MASKED : won(-row.lateCut)}</dd>
        {/* 소득세·지방세는 각각 절사한 값이다 (D-15) — 화면이 더해 한 칸으로 접지 않는다 */}
        <dt className="text-fg-subtle">세금</dt><dd className="text-fg">소득세 {won(row.incomeTax)} · 지방세 {won(row.localTax)}</dd>
        <dt className="text-fg-subtle">실지급</dt><dd className="font-bold text-fg">{won(row.net)}</dd>
      </dl>

      {q.isLoading ? (
        <Banner tone="neutral">불러오는 중…</Banner>
      ) : q.isError ? (
        <Banner tone="danger">{apiMessage(q.error)}</Banner>
      ) : q.data ? (
        <>
          <section aria-label="시급">
            <h4 className="mb-1.5 text-[12.5px] font-bold text-fg">시급</h4>
            {q.data.rates.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">이 달에 걸린 시급이 없습니다 — 시급이 없으면 그 수업을 셀 수 없습니다</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {q.data.rates.map((r) => (
                  <li key={r.fromDate}><Chip tone="neutral">{r.fromDate}부터 {won(r.rate)}/시간</Chip></li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="수업 날짜">
            <h4 className="mb-1.5 text-[12.5px] font-bold text-fg">수업 날짜</h4>
            <Table columns={cols} rows={q.data.lessons} rowKey={(l) => `${l.serId}:${l.onDate}`} empty="이 달에 맡은 수업이 없습니다" />
          </section>
        </>
      ) : null}
    </div>
  );
}

export function PayoutSheet({ data, loading, month, onMonthChange }: PayoutSheetProps) {
  const id = useId();
  const rows = data?.rows ?? [];
  const [staffId, setStaffId] = useState<number | null>(null);
  // 달을 바꾸면 그 달의 줄에서 다시 찾는다 — 그 달 정산에 없는 사람을 상세로 부르지 않는다
  const selected = rows.find((r) => r.staffId === staffId) ?? null;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-bold text-fg">{monthLabel(month)} 강사료 정산</h2>
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            리포트를 쓴 수업만 셉니다 — 미작성은 빠지고, 빠진 만큼이 옆에 보입니다. 휴강은 시수에 들지 않습니다.
          </p>
          {data ? (
            <p className="mt-1 text-[11.5px]">
              {data.monthEnded
                ? <span className="text-fg-2">달이 끝났습니다 — 확정할 수 있습니다</span>
                : <span className="text-amber">아직 끝나지 않은 달입니다 — 리포트가 더 들어오므로 확정은 다음 달부터</span>}
              {data.unwrittenCount > 0 ? <span className="ml-2 font-bold text-red">미작성 {data.unwrittenCount}건 빠짐</span> : null}
            </p>
          ) : null}
        </div>
        <div className="w-40">
          <Label htmlFor={`${id}-month`}>달</Label>
          <Input id={`${id}-month`} type="month" value={month} onChange={(e) => onMonthChange(e.target.value)} />
        </div>
      </div>

      {data && !data.canSeeAmounts ? (
        <Banner tone="neutral" className="mb-3">
          금액은 대표만 봅니다 — 서버가 값을 내려보내지 않으므로 여기에도 없습니다. 회차 수는 그대로 보입니다.
        </Banner>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="flex items-baseline gap-2 border-b border-line pb-2 text-[13px] font-bold text-fg">
            선생님 <span className="text-[11.5px] font-normal text-fg-subtle">{rows.length}명 · 눌러서 자세히</span>
          </h3>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-fg-subtle">{loading ? '불러오는 중…' : '이 달에 수업을 맡은 강사가 없습니다'}</p>
          ) : (
            <ul aria-label="선생님" className="flex flex-col gap-2">
              {rows.map((r) => (
                <li key={r.staffId}>
                  <TeacherCard r={r} selected={selected?.staffId === r.staffId}
                    onSelect={() => setStaffId(selected?.staffId === r.staffId ? null : r.staffId)} />
                </li>
              ))}
            </ul>
          )}
          {data ? <TotalsCard data={data} /> : null}
        </div>

        <div className="min-w-0">
          {selected ? (
            <PayoutDetailPane row={selected} month={month} />
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-2 px-4 py-10 text-center">
              <b className="text-[14px] text-fg">왼쪽에서 선생님을 눌러주세요</b>
              <span className="text-[12px] text-fg-subtle">시급 · 수업 날짜 · 리포트 미작성 · 정산 내역을 봅니다</span>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
