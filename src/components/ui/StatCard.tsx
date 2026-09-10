/** @file-guide
 * 목적: StatCard.tsx — StatCardProps, StatCard (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** Data/Stat Card — Figma `Data/Stat Card` (tone 4). 화면 위쪽 숫자 카드. */
import type { ReactNode } from 'react';
import { cn } from './cn';
import type { Tone } from './Chip';

const VALUE: Record<Tone, string> = {
  neutral: 'text-fg', info: 'text-blue', success: 'text-green',
  warning: 'text-amber', danger: 'text-red', purple: 'text-violet',
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: Tone;
  className?: string;
}

export function StatCard({ label, value, note, tone = 'neutral', className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-line bg-card p-4', className)}>
      <div className="text-[11px] font-bold text-fg-subtle">{label}</div>
      <div className={cn('mt-1 text-[26px] font-bold leading-tight', VALUE[tone])}>{value}</div>
      {note ? <div className="mt-1 text-[11px] text-fg-subtle">{note}</div> : null}
    </div>
  );
}
