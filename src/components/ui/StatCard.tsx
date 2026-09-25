/** @file-guide
 * 목적: StatCard.tsx — StatTone, StatCardProps, StatCard (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Data/Stat Card — Figma `Data/Stat Card` (tone 4). 화면 위쪽 숫자 카드.
 *
 * 원문 머리 칸은 세 모양을 더 쓴다 — 넣지 않으면 지금 모양(흰 카드 · 숫자만 색) 그대로다.
 * - `fill` : 톤 옅은 바탕 + 톤 테두리(§34-9 「안 됨」 분홍 채움 · §38-6 「정상」 초록 채움 · §86 요약 카드 견본)
 * - `accent` : 카드 윗변 3px 색 줄(§38-6 · §43-12 머리 여섯 칸)
 * - `dim` : 0 인 칸을 흐리게(§38-6 · §43-12). 컷은 글자까지 옅게 그리지만 라벨은 작은 글자라
 *   4.5:1 을 지켜야 한다(2026-09-10 대비 교정) — 그래서 윗줄만 옅게, 숫자는 흐린 회색 글자로 낮춘다.
 */
import type { ReactNode } from 'react';
import { cn } from './cn';
import type { ChipTone } from './Chip';

/** 칩 톤 + 분홍 — 분홍은 칩 톤이 아니라 머리 칸 윗줄에서만 쓴다 */
export type StatTone = ChipTone | 'pink';

const VALUE: Record<StatTone, string> = {
  neutral: 'text-fg', info: 'text-blue', success: 'text-green',
  warning: 'text-amber', danger: 'text-red', purple: 'text-violet',
  teal: 'text-teal', orange: 'text-orange', pink: 'text-pink',
};
const FILL: Record<StatTone, string> = {
  neutral: 'border-line bg-inset', info: 'border-blue/30 bg-blue/10', success: 'border-green/30 bg-green/10',
  warning: 'border-amber/30 bg-amber/10', danger: 'border-red/30 bg-red/10', purple: 'border-violet/30 bg-violet/10',
  teal: 'border-teal/30 bg-teal/10', orange: 'border-orange/30 bg-orange/10', pink: 'border-pink/30 bg-pink/10',
};
/** 윗줄 — 「검정」 윗줄(§38 학생 · §43 감시 중)은 neutral 이 글자색 fg 로 긋는다 */
const ACCENT: Record<StatTone, string> = {
  neutral: 'border-t-fg', info: 'border-t-blue', success: 'border-t-green',
  warning: 'border-t-amber', danger: 'border-t-red', purple: 'border-t-violet',
  teal: 'border-t-teal', orange: 'border-t-orange', pink: 'border-t-pink',
};
const ACCENT_DIM: Record<StatTone, string> = {
  neutral: 'border-t-fg/40', info: 'border-t-blue/40', success: 'border-t-green/40',
  warning: 'border-t-amber/40', danger: 'border-t-red/40', purple: 'border-t-violet/40',
  teal: 'border-t-teal/40', orange: 'border-t-orange/40', pink: 'border-t-pink/40',
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: StatTone;
  /** 톤 옅은 바탕 + 톤 테두리. 기본 끔 = 흰 카드 */
  fill?: boolean;
  /** 윗변 3px 색 줄의 톤. 기본 없음 */
  accent?: StatTone;
  /** 0 인 칸 흐림 — 윗줄은 옅게, 숫자는 흐린 글자 */
  dim?: boolean;
  className?: string;
}

export function StatCard({ label, value, note, tone = 'neutral', fill = false, accent, dim = false, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        fill ? FILL[tone] : 'border-line bg-card',
        accent ? cn('border-t-[3px]', dim ? ACCENT_DIM[accent] : ACCENT[accent]) : '',
        className,
      )}
    >
      <div className="text-[11px] font-bold text-fg-subtle">{label}</div>
      <div className={cn('mt-1 text-[26px] font-bold leading-tight', dim ? 'text-fg-subtle' : VALUE[tone])}>{value}</div>
      {note ? <div className="mt-1 text-[11px] text-fg-subtle">{note}</div> : null}
    </div>
  );
}
