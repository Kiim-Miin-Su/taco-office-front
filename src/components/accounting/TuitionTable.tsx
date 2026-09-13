/** @file-guide
 * 목적: TuitionTable.tsx — TuitionTableProps, TuitionTable (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §54 수업료 계산 — 학생별 이번 달 진행과 금액.
 *
 * 원문 §54 의 마지막 줄이 이 화면의 정체다 — 「연동: **청구서 생성 시 이 계산 결과를 씁니다**」.
 * 그래서 **여기서 아무것도 계산하지 않는다.** 「얼마나 갔나」의 %도, 머리 다섯 칸도,
 * 「지금까지」와 「넘길 돈」도 전부 서버가 낸 값이다 (D-R37). 화면이 다시 나누면
 * 미리 본 금액과 청구한 금액이 갈린다.
 *
 * ── 컷을 재어 보고 정한 것 둘 ──────────────────────────────────────────────
 * ① **막대의 초록은 밑에 적은 % 와 같은 값이다.** 컷의 네 줄을 픽셀로 재었더니 초록의 끝이
 *    73% · 57% · 68% · 69% 로 **적힌 숫자와 정확히 같았다**(= `done / total`). 처음 구현은 분모에
 *    결강을 섞어 **막대는 절반인데 밑에는 75%** 라 적히고 있었다 — 한 칸에 분모가 둘이면
 *    돈 화면에서 둘 중 하나는 반드시 틀린 값이고, 옆 칸의 「3 / 4」와도 갈린다.
 *    컷에는 초록 뒤에 연한 토막이 하나 더 있는데 **그 너비는 네 줄에서 결강 수와 맞지 않는다**
 *    (12% · 31% · 29% · 24% 인데 결강은 2 · 1 · 1 · 1). 뜻을 읽을 수 없어 만들지 않았다 (D-R44).
 *    결강은 제 칸(붉은 숫자)과 「넘길 돈」에서 센다.
 * ② **「시급」 칸은 값이 하나다.** 값이 둘 이상인 학생에게 대표 단가 하나를 적으면
 *    「8 / 11 × ₩140,000」과 「지금까지 ₩1,365,000」이 곱해서 안 맞는데, **컷의 이하린 줄이
 *    바로 그 모양이다**(8 × 140,000 = 1,120,000 ≠ 1,365,000). 즉 원문이 알고 그렇게 적었다.
 *    그래서 고르지 않고 컷 그대로 대표 단가를 적는다. 정확한 줄은 「내역」에 있다.
 *    다만 **단가표에 그 과목이 없으면 「단가 없음」**이라 적는다 — 컷에 없는 경우이고,
 *    ₩0 을 시급이라고 적는 것은 §53 의 `INV_NO_RATE`(「0원 청구서는 조용히 틀린 청구서다」)와 어긋난다.
 */
'use client';
import { useState } from 'react';
import type { Tuition, TuitionRow } from '@/api/types';
import { Banner, Chip, Drawer, Panel, Table, cn, type Column } from '@/components/ui';
import { MASKED, won } from '@/lib/money';

export interface TuitionTableProps {
  data?: Tuition;
  loading?: boolean;
}

/** 컷의 머리 다섯 상자 — 값이 위, 이름이 아래다 */
function HeadBox({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-center',
        tone === 'warning' ? 'border-amber/30 bg-amber/10' : 'border-line bg-card',
      )}
    >
      <div className={cn('text-[15px] font-bold', tone === 'warning' ? 'text-amber' : 'text-fg')}>{value}</div>
      <div className="mt-0.5 text-[10.5px] text-fg-subtle">{label}</div>
    </div>
  );
}

/** 간 것 / 이 달에 할 수업 — 밑에 적는 값과 **같은 분모**를 쓴다 (위 주석 ①) */
function ProgressBar({ row }: { row: TuitionRow }) {
  return (
    <div>
      <div
        role="img"
        aria-label={`간 것 ${row.done}회 · 결강 ${row.canceled}회 · 남은 것 ${row.total - row.done}회`}
        className="flex h-1.5 overflow-hidden rounded-full bg-line-2"
      >
        {/* 너비도 서버가 낸 percent 다 — 화면이 done/total 을 다시 나누면 막대와 숫자가 갈린다 */}
        <span aria-hidden className="block h-full bg-green" style={{ width: `${row.percent}%` }} />
      </div>
      <div className="mt-1 text-center text-[11px] text-fg-subtle">{row.percent}%</div>
    </div>
  );
}

export function TuitionTable({ data, loading }: TuitionTableProps) {
  const [openId, setOpenId] = useState<number | null>(null);
  const rows = data?.items ?? [];
  const open = rows.find((r) => r.studentId === openId) ?? null;
  const n = (v?: number | null) => (v === null || v === undefined ? '—' : String(v));

  const cols: Array<Column<TuitionRow>> = [
    {
      key: 's', head: '학생', width: 140,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="font-bold">{r.name}</span>
          {r.grade ? <Chip tone="neutral">{r.grade}</Chip> : null}
        </span>
      ),
    },
    { key: 'p', head: '얼마나 갔나', width: 220, cell: (r) => <ProgressBar row={r} /> },
    {
      key: 'n', head: '한 수업', width: 90, align: 'right',
      cell: (r) => (
        <span>
          <b className="text-[14px]">{r.done}</b>
          <span className="text-fg-subtle"> / {r.total}</span>
        </span>
      ),
    },
    {
      key: 'c', head: '결강', width: 70, align: 'right',
      cell: (r) => (r.canceled > 0
        ? <span className="font-bold text-red">{r.canceled}</span>
        : <span className="text-fg-subtle">—</span>),
    },
    {
      // 컷의 낱말 그대로다 — 우리가 「단가」라 부르던 칸이다
      key: 'u', head: '시급', width: 120, align: 'right',
      cell: (r) => {
        if (r.unitPrice === null || r.unitPrice === undefined) {
          return <span className="text-[11px] text-fg-subtle">{MASKED}</span>;
        }
        // 단가표에 그 과목이 없다 — ₩0 을 시급이라고 적지 않는다 (위 주석 ②)
        if (r.priceCount === 0) return <span className="text-[11.5px] text-fg-subtle">단가 없음</span>;
        return (
          <span>
            <span className="block">{won(r.unitPrice)}</span>
            {/* 컷이 「개별 단가」와 「일반」을 갈라 적는다 — 예외인지 한눈에 보여야 한다 */}
            <span className="block text-[10.5px] text-fg-subtle">
              {r.unitPriceOverride ? '개별 단가' : '일반'}
            </span>
          </span>
        );
      },
    },
    { key: 'd', head: '지금까지', width: 120, align: 'right', cell: (r) => won(r.doneAmount) },
    {
      key: 'y', head: '넘길 돈', width: 120, align: 'right',
      cell: (r) => (r.carryAmount
        ? <span className="font-bold text-amber">{won(r.carryAmount)}</span>
        : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'x', head: '', width: 70, align: 'right',
      cell: (r) => (
        <button
          type="button"
          className="rounded-md border border-line px-2 py-1 text-[11.5px] font-bold text-fg-2 hover:bg-inset"
          onClick={(e) => { e.stopPropagation(); setOpenId(r.studentId); }}
        >
          내역
        </button>
      ),
    },
  ];

  return (
    <>
      {data && !data.canSeeAmounts ? (
        <Banner tone="neutral" className="mb-3">
          금액은 대표만 봅니다 — 서버가 값을 내려보내지 않으므로 내역도 비어 있습니다. 숨긴 것이 아니라 받지 않은 것입니다.
        </Banner>
      ) : null}

      <Panel>
        {/* 컷은 제목 한 줄과 머리 다섯 상자가 **같은 줄**에 있다 */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-bold text-fg">
              {data ? `${Number(data.month.slice(5))}월 수업 진행` : '수업 진행'}
            </h2>
            {data ? (
              <p className="mt-0.5 text-[11px] text-fg-subtle">
                오늘 {data.today.slice(5)} 기준 · {data.daysPast}일 지남 · {data.daysLeft}일 남음
              </p>
            ) : null}
          </div>
          {/* 다섯 칸은 줄의 합이다 — 화면이 더하지 않는다 (D-R37) */}
          <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:grid-cols-5">
            <HeadBox label="한 수업" value={n(data?.doneCount)} />
            <HeadBox label="이번 달 전체" value={n(data?.totalCount)} />
            <HeadBox label="결강 · 휴강" value={n(data?.canceledCount)} tone="warning" />
            <HeadBox label="지금까지 금액" value={won(data?.doneAmount)} />
            <HeadBox label="다음 달로 넘길 돈" value={won(data?.carryAmount)} tone="warning" />
          </div>
        </div>

        <Table
          columns={cols}
          rows={rows}
          rowKey={(r) => r.studentId}
          empty={loading ? '불러오는 중…' : '이번 달 수업이 있는 학생이 없습니다'}
        />
      </Panel>

      <Drawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? `${open.name} — 내역` : ''}
        sub={open
          ? `${open.done}/${open.total}회 · 지금까지 ${won(open.doneAmount)}${open.canceled ? ` · 결강 ${open.canceled}회` : ''}`
          : undefined}
      >
        {open ? (
          <div className="p-4">
            {open.lines.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">
                {data?.canSeeAmounts
                  ? '단가표에 없는 과목뿐이라 금액을 내지 않습니다 — 0원으로 꾸미지 않습니다.'
                  : '금액을 볼 수 없어 내역이 내려오지 않았습니다.'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {open.lines.map((l, i) => (
                  <li key={`${l.subKey ?? l.label}-${i}`} className="flex items-baseline gap-3 py-2">
                    <span className="min-w-0 grow truncate text-[13px] font-bold">{l.label}</span>
                    <span className="shrink-0 text-[12px] text-fg-subtle">{l.count}회 × {won(l.unitPrice)}</span>
                    <span className="w-28 shrink-0 text-right text-[13px] font-bold">{won(l.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 border-t border-line pt-3 text-[11px] text-fg-subtle">
              이 줄이 곧 청구서의 줄입니다 — 원문 §54 의 「청구서 생성 시 이 계산 결과를 씁니다」.
              「지금까지」는 이 중 이미 한 수업만 센 값이고, 결강은 「넘길 돈」으로 따로 섭니다.
            </p>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
