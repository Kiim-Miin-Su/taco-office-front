/** @file-guide
 * 목적: OtherIncome.tsx — OtherIncomeProps, OtherIncome (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §57 「그 밖의 수입 — 수업료가 아닌 돈 · 누르면 자세히 봅니다」.
 *
 * 컷의 줄 셋은 **청구 종류**다(대표 결정 N-37 · C64). 줄 제목·부제·상태 낱말은 전부 서버가 주고
 * 건수·금액·「받음」·「청구 안 함」도 서버가 센다 (D-R18 · D-R37). 여기서 더하거나 거르지 않는다.
 *
 * **줄이 0건이어도 사라지지 않는다** — 종류는 어휘이지 데이터가 아니다. 그 달에 진단고사 청구가
 * 없다고 줄이 사라지면 화면이 「이 학원은 진단고사를 안 한다」고 말하는 셈이 된다.
 *
 * ── 빛깔 ─────────────────────────────────────────────────────────────────
 * 컷의 점은 분홍 · 청록 · 주황이고 **우리 아홉 토큰에 그 셋이 없다**(§85). 값을 새로 적으면
 * 토큰이 두 벌이 되므로(D-R41) 뜻이 가장 가까운 토큰에 맞췄다 — 컨설팅은 보라(토큰 설명이
 * 「컨설팅 · GPA」다) · 진단고사는 초록 · 응시료는 주황. **값은 여전히 토큰에서만 온다.**
 *
 * ── 만들지 않은 것 ───────────────────────────────────────────────────────
 * 컷 오른쪽의 「일별 · 주별 · 월별」은 **눌렀을 때 무엇이 달라지는지 컷이 한 번도 보여 주지 않는다.**
 * 기간으로 읽으면 이 줄의 숫자가 「그 달」이 되고, 쪼개기로 읽으면 줄이 여러 개가 된다 — 읽기마다
 * 숫자의 뜻이 달라진다. 지금 이 줄은 §52 머리 여섯 칸과 같은 **전 기간**이다 (N-40).
 */
'use client';
import { useState } from 'react';
import type { OtherIncome as OtherIncomeData, OtherIncomeRow } from '@/api/types';
import { Banner, Chip, Panel, cn } from '@/components/ui';
import { won } from '@/lib/money';

export interface OtherIncomeProps {
  data?: OtherIncomeData;
  loading?: boolean;
}

/** 종류마다의 빛깔 — 값이 아니라 **토큰 이름**이다 (위 주석) */
const TONE: Record<string, { bar: string; dot: string }> = {
  consulting: { bar: 'bg-violet', dot: 'bg-violet' },
  diag_intake: { bar: 'bg-green', dot: 'bg-green' },
  exam_fee: { bar: 'bg-amber', dot: 'bg-amber' },
};
const FALLBACK = { bar: 'bg-line-2', dot: 'bg-fg-subtle' };

function Row({ row }: { row: OtherIncomeRow }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[row.key] ?? FALLBACK;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left hover:bg-inset"
      >
        <span aria-hidden className={cn('w-1 self-stretch', tone.bar)} />
        <span className="flex min-w-0 grow flex-wrap items-center gap-x-2 gap-y-1 py-3">
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', tone.dot)} />
          <span className="text-[13.5px] font-bold text-fg">{row.label}</span>
          <span className="truncate text-[11.5px] text-fg-subtle">{row.sub}</span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2 py-3 pr-3">
          <span className="text-[11.5px] text-fg-subtle">{row.count}건</span>
          <span className="text-[14px] font-bold text-fg">{won(row.amount)}</span>
          <Chip tone="success">받음 {won(row.paid)}</Chip>
          {/* 0 이면 뱃지를 달지 않는다 — 「청구 안 함 0」은 아무 말도 하지 않는다 */}
          {row.unbilled > 0 ? <Chip tone="danger">청구 안 함 {row.unbilled}</Chip> : null}
          <span aria-hidden className={cn('text-[11px] text-fg-subtle transition-transform', open && 'rotate-90')}>▶</span>
        </span>
      </button>

      {open ? (
        <div className="border-t border-line">
          {row.items.length === 0 ? (
            <p className="px-4 py-3 text-[12px] text-fg-subtle">이 종류로 낸 청구서가 아직 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line">
              {row.items.map((it) => (
                <li key={it.invId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="text-[12.5px] font-bold text-fg">{it.studentName}</span>
                  <span className="min-w-0 grow truncate text-[12px] text-fg-2">{it.title}</span>
                  {/* 상태 낱말도 서버가 짓는다 — 화면이 코드값을 찍지 않는다 (D-R18) */}
                  <Chip tone={it.unbilled ? 'neutral' : 'info'}>{it.stateLabel}</Chip>
                  <span className="w-24 shrink-0 text-right text-[12.5px] font-bold">{won(it.amount)}</span>
                  <span className="w-24 shrink-0 text-right text-[11.5px] text-fg-subtle">받음 {won(it.paid)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function OtherIncome({ data, loading }: OtherIncomeProps) {
  return (
    <>
      {data && !data.canSeeAmounts ? (
        <Banner tone="neutral" className="mb-3">
          금액은 대표만 봅니다 — 서버가 값을 내려보내지 않습니다. 건수는 금액과 무관해 그대로 보입니다.
        </Banner>
      ) : null}
      <Panel title="그 밖의 수입" sub="수업료가 아닌 돈 · 누르면 자세히 봅니다">
        {data ? (
          <div className="flex flex-col gap-2">
            {data.rows.map((r) => <Row key={r.key} row={r} />)}
          </div>
        ) : (
          <p className="text-[12px] text-fg-subtle">{loading ? '불러오는 중…' : '아직 불러오지 않았습니다'}</p>
        )}
      </Panel>
    </>
  );
}
