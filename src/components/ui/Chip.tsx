/** @file-guide
 * 목적: Chip.tsx — Tone, ChipStyle, ChipSize, ChipProps, Chip (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * UI/Chip — Figma `UI/Chip` (tone 6 × style 3 = 18 변형) + 원문 청록·주황 톤 · 점 모양(§86 상태 배지).
 * 상태 배지·필터 칩·범례가 전부 이것 하나를 쓴다.
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple';
/**
 * 칩에만 더 있는 원문 톤 — §23 단계(2차 대기 청록 · 2차 상담 주황) · §47 반려 주황.
 * `Tone` 에 바로 넣으면 `Record<Tone, …>` 로 톤마다 표를 둔 다른 부품(Banner · Overlay · 결재 줄 …)이
 * 한꺼번에 깨진다. 그래서 칩이 받는 톤만 넓히고, 필요한 부품이 이 타입을 골라 쓴다.
 */
export type ChipTone = Tone | 'teal' | 'orange';
/** `dot` = 바탕 없는 **점 + 색 글자**(§86 상태 배지 「● 완료」) */
export type ChipStyle = 'outline' | 'soft' | 'solid' | 'dot';
export type ChipSize = 'compact' | 'default';

const SOFT: Record<ChipTone, string> = {
  neutral: 'bg-inset text-fg-2',
  info: 'bg-blue/10 text-blue',
  success: 'bg-green/10 text-green',
  warning: 'bg-amber/10 text-amber',
  danger: 'bg-red/10 text-red',
  purple: 'bg-violet/10 text-violet',
  teal: 'bg-teal/10 text-teal',
  orange: 'bg-orange/10 text-orange',
};
const OUTLINE: Record<ChipTone, string> = {
  neutral: 'border border-line text-fg-2',
  info: 'border border-blue/40 text-blue',
  success: 'border border-green/40 text-green',
  warning: 'border border-amber/40 text-amber',
  danger: 'border border-red/40 text-red',
  purple: 'border border-violet/40 text-violet',
  teal: 'border border-teal/40 text-teal',
  orange: 'border border-orange/40 text-orange',
};
const SOLID: Record<ChipTone, string> = {
  neutral: 'bg-fg-2 text-white',
  info: 'bg-blue text-white',
  success: 'bg-green text-white',
  warning: 'bg-amber text-white',
  danger: 'bg-red text-white',
  purple: 'bg-violet text-white',
  teal: 'bg-teal text-white',
  orange: 'bg-orange text-white',
};
/** 점 모양의 글자색 · 점 색 — 글자는 soft 와 같은 토큰이라 대비 검사가 한 벌이다 */
const DOT_TEXT: Record<ChipTone, string> = {
  neutral: 'text-fg-2', info: 'text-blue', success: 'text-green', warning: 'text-amber',
  danger: 'text-red', purple: 'text-violet', teal: 'text-teal', orange: 'text-orange',
};
const DOT_MARK: Record<ChipTone, string> = {
  neutral: 'bg-fg-subtle', info: 'bg-blue', success: 'bg-green', warning: 'bg-amber',
  danger: 'bg-red', purple: 'bg-violet', teal: 'bg-teal', orange: 'bg-orange',
};

export interface ChipProps {
  tone?: ChipTone;
  styleKind?: ChipStyle;
  size?: ChipSize;
  children: ReactNode;
  className?: string;
  /** 마우스를 올렸을 때의 설명. 칩은 좁아서 한 줄이 더 필요할 때가 있다 */
  title?: string;
}

const SIZE: Record<ChipSize, string> = {
  compact: 'h-5 min-w-5 justify-center px-1.5 text-[10px]',
  default: 'h-[22px] px-2 text-[11px]',
};

export function Chip({
  tone = 'neutral', styleKind = 'soft', size = 'default', children, className, title,
}: ChipProps) {
  if (styleKind === 'dot') {
    // 바탕·테두리가 없으니 좌우 여백도 없다 — 표의 상태 칸에서 글자 줄과 나란히 선다(§86 · §82 회차 표)
    return (
      <span
        title={title}
        className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-bold', size === 'compact' ? 'text-[10px]' : 'text-[11px]', DOT_TEXT[tone], className)}
      >
        {/* 컷 §47·§86 의 점은 모서리 둥근 작은 네모다 */}
        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-sm', DOT_MARK[tone])} />
        {children}
      </span>
    );
  }
  const look = styleKind === 'solid' ? SOLID[tone] : styleKind === 'outline' ? OUTLINE[tone] : SOFT[tone];
  return (
    <span
      title={title}
      className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-bold', SIZE[size], look, className)}
    >
      {children}
    </span>
  );
}
