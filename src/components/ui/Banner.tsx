/** @file-guide
 * 목적: Banner.tsx — Banner (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** Data/Banner — Figma `Data/Banner` (tone 4). 규칙을 화면에 적어 두는 띠. */
import type { ReactNode } from 'react';
import { cn } from './cn';
import type { Tone } from './Chip';

const LOOK: Record<Tone, string> = {
  neutral: 'bg-inset text-fg-2 border-line',
  info: 'bg-blue/5 text-fg-2 border-blue/25',
  success: 'bg-green/5 text-fg-2 border-green/25',
  warning: 'bg-amber/5 text-fg-2 border-amber/30',
  danger: 'bg-red/5 text-fg-2 border-red/30',
  purple: 'bg-violet/5 text-fg-2 border-violet/25',
};

export function Banner({ tone = 'info', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-[12px] font-medium leading-relaxed', LOOK[tone], className)}>
      {children}
    </div>
  );
}
