/**
 * UI/Chip — Figma `UI/Chip` (tone 6 × style 3 = 18 변형).
 * 상태 배지·필터 칩·범례가 전부 이것 하나를 쓴다.
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple';
export type ChipStyle = 'outline' | 'soft' | 'solid';

const SOFT: Record<Tone, string> = {
  neutral: 'bg-inset text-fg-2',
  info: 'bg-blue/10 text-blue',
  success: 'bg-green/10 text-green',
  warning: 'bg-amber/10 text-amber',
  danger: 'bg-red/10 text-red',
  purple: 'bg-violet/10 text-violet',
};
const OUTLINE: Record<Tone, string> = {
  neutral: 'border border-line text-fg-2',
  info: 'border border-blue/40 text-blue',
  success: 'border border-green/40 text-green',
  warning: 'border border-amber/40 text-amber',
  danger: 'border border-red/40 text-red',
  purple: 'border border-violet/40 text-violet',
};
const SOLID: Record<Tone, string> = {
  neutral: 'bg-fg-2 text-white',
  info: 'bg-blue text-white',
  success: 'bg-green text-white',
  warning: 'bg-amber text-white',
  danger: 'bg-red text-white',
  purple: 'bg-violet text-white',
};

export interface ChipProps {
  tone?: Tone;
  styleKind?: ChipStyle;
  children: ReactNode;
  className?: string;
  /** 마우스를 올렸을 때의 설명. 칩은 좁아서 한 줄이 더 필요할 때가 있다 */
  title?: string;
}

export function Chip({ tone = 'neutral', styleKind = 'soft', children, className, title }: ChipProps) {
  const look = styleKind === 'solid' ? SOLID[tone] : styleKind === 'outline' ? OUTLINE[tone] : SOFT[tone];
  return (
    <span
      title={title}
      className={cn('inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-bold', look, className)}
    >
      {children}
    </span>
  );
}
