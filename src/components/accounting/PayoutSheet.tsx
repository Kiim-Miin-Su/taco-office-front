/** @file-guide
 * 목적: PayoutSheet.tsx — PayoutSheetProps, PayoutSheet, PayoutConfirmButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §57 강사료 정산 시트 · 「지급 확정」 (C94-b · 테스트 시나리오 H-82 · O-148 · D-43).
 *
 * **여기서 아무것도 세지 않는다.** 쓴 수업·미작성·휴강·총액·차감·세금·실지급·「빠진 금액」은 전부 서버가
 * `lib/payout-sheet` 한 곳에서 낸 값이고, 강사 화면(§57 `/teacher/history`)이 **같은 함수**를 부른다 (D-R37).
 * 화면이 미작성을 다시 빼거나 세금을 다시 곱하면 강사가 보는 수와 대표가 확정하는 수가 갈린다 —
 * H-82 「미작성분이 포함되면 실패 · 휴강이 잡히면 실패」는 세는 곳이 하나여야 양쪽에서 지켜진다.
 *
 * 「지급 확정」 단추가 서는지는 **서버의 `canConfirm`** 이다 (D-R39) — 대표인가 · 달이 끝났는가 · 시급 없는 수업이 없는가 ·
 * 이미 확정인가를 화면이 다시 비교하지 않는다. 저장된 초안이 계산과 다르면 「저장값 다름」 칩으로 보이고, 확정은 계산을 굳힌다.
 * 확정을 되돌리는 길은 없다 — 창이 그 사실을 말한다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Chip, Dialog, Input, Label, Panel, Table, type Column } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useConfirmPayout } from '@/api/queries';
import type { PayoutSheet as PayoutSheetData, PayoutSheetRow } from '@/api/types';
import { MASKED, won } from '@/lib/money';

export interface PayoutSheetProps {
  data?: PayoutSheetData;
  loading?: boolean;
  /** 보는 달 — 화면이 고르고 서버가 센다 */
  month: string;
  onMonthChange: (month: string) => void;
}

const monthLabel = (ym: string) => `${Number(ym.slice(5))}월`;
const hours = (min: number) => `${(min / 60).toFixed(1)}h`;

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

export function PayoutSheet({ data, loading, month, onMonthChange }: PayoutSheetProps) {
  const id = useId();
  const rows = data?.rows ?? [];
  const money = (v: number | null | undefined) => (v === null || v === undefined
    ? <span className="text-[11px] text-fg-subtle">{MASKED}</span>
    : <span>{won(v)}</span>);

  const cols: Array<Column<PayoutSheetRow>> = [
    { key: 'n', head: '강사', width: 120, cell: (r) => <span className="font-bold">{r.staffName}</span> },
    {
      key: 'w', head: '쓴 수업', width: 100, align: 'right',
      cell: (r) => (
        <span className="flex flex-col items-end">
          <b className="text-[14px]">{r.writtenCount}</b>
          <span className="text-[10.5px] text-fg-subtle">{hours(r.writtenMinutes)}</span>
        </span>
      ),
    },
    {
      // D-43 — 미작성은 정산에서 빠진다. 몇 회가 빠졌고 얼마가 빠졌는지 (서버가 센 값)
      key: 'u', head: '미작성 · 빠짐', width: 120, align: 'right',
      cell: (r) => (
        <span className="flex flex-col items-end">
          {r.unwrittenCount > 0
            ? <b className="text-[14px] text-red">{r.unwrittenCount}</b>
            : <span className="text-fg-subtle">—</span>}
          {r.unwrittenCount > 0 && r.unwrittenAmount ? (
            <span className="text-[10.5px] text-red">{won(r.unwrittenAmount)} 빠짐</span>
          ) : null}
        </span>
      ),
    },
    {
      // 휴강은 시수에 안 든다 (H-82). 리포트 대상이 아닌 종류(자습·회의)도 정산 밖이다 — 둘을 한 칸에 갈라 적는다
      key: 'c', head: '휴강 · 대상 아님', width: 110, align: 'right',
      cell: (r) => (
        <span className="flex flex-col items-end">
          {r.canceledCount > 0 ? <span className="text-fg-2">휴강 {r.canceledCount}</span> : null}
          {r.naCount > 0 ? <span className="text-[10.5px] text-fg-subtle" title="리포트 대상이 아닌 종류 — 정산에 들지 않습니다">대상 아님 {r.naCount}</span> : null}
          {r.canceledCount === 0 && r.naCount === 0 ? <span className="text-fg-subtle">—</span> : null}
        </span>
      ),
    },
    { key: 'g', head: '총액', width: 110, align: 'right', cell: (r) => money(r.gross) },
    {
      key: 'l', head: '지각 차감', width: 100, align: 'right',
      cell: (r) => (r.lateCut === null || r.lateCut === undefined
        ? money(null)
        : <span className={r.lateCut ? 'font-bold text-red' : 'text-fg-subtle'}>{won(r.lateCut ? -r.lateCut : 0, { signed: true })}</span>),
    },
    {
      // 소득세·지방세는 각각 절사한 값이다 (D-15) — 화면이 더해 한 칸으로 접지 않는다
      key: 't', head: '세금', width: 110, align: 'right',
      cell: (r) => (r.incomeTax === null || r.incomeTax === undefined
        ? money(null)
        : (
          <span className="flex flex-col items-end text-[11px] text-fg-2">
            <span>소득세 {won(r.incomeTax)}</span>
            <span>지방세 {won(r.localTax)}</span>
          </span>
        )),
    },
    { key: 'net', head: '실지급', width: 120, align: 'right', cell: (r) => <span className="font-bold">{money(r.net)}</span> },
    {
      key: 's', head: '상태', width: 150,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          {r.confirmed ? (
            <Chip tone="success" title={r.confirmedAt ? `${r.confirmedAt.slice(0, 16).replace('T', ' ')} · ${r.confirmedBy ?? ''}` : undefined}>
              확정{r.confirmedBy ? ` · ${r.confirmedBy}` : ''}
            </Chip>
          ) : r.writtenCount === 0 && r.unwrittenCount === 0 ? (
            // 쓴 것도 안 쓴 것도 없다(자습 감독뿐인 코디네이터 등) — 「대기」라 적으면 확정할 것이 있는 줄 안다
            <Chip tone="neutral">정산 없음</Chip>
          ) : (
            <Chip tone="warning">대기</Chip>
          )}
          {r.noRateCount > 0 ? <Chip tone="danger" title="시급이 없어 못 센 수업이 있습니다 — 시급을 먼저 등록하세요">시급 없음 {r.noRateCount}</Chip> : null}
          {r.savedDiffers ? <Chip tone="neutral" title={`저장값 ${won(r.savedNet)}`}>저장값 다름</Chip> : null}
        </span>
      ),
    },
    { key: 'a', head: '', width: 110, align: 'right', cell: (r) => <PayoutConfirmButton row={r} /> },
  ];

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
              {data.canSeeAmounts ? <span className="ml-2 text-fg-2">실지급 합계 <b>{won(data.netTotal)}</b></span> : null}
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

      <Table
        columns={cols}
        rows={rows}
        rowKey={(r) => r.staffId}
        empty={loading ? '불러오는 중…' : '이 달에 수업을 맡은 강사가 없습니다'}
      />
    </Panel>
  );
}
