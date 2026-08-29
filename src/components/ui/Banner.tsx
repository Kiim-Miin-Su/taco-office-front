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
