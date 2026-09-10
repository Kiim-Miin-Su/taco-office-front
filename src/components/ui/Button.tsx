/** @file-guide
 * 목적: Button.tsx — ButtonVariant, ButtonSize, ButtonProps, Button (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * UI/Button — Figma `UI/Button` (variant 6 × size 2 = 12 변형).
 * 색은 토큰만 쓴다. `.tsx` 안에 #rrggbb 를 적으면 eslint 가 막는다 (D-R41).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const VARIANT: Record<ButtonVariant, string> = {
  // opacity는 흰 글자까지 부모 바탕과 섞어 대비를 낮춘다. hover는 배경색만 바꾼다.
  primary: 'bg-primary text-white border-primary hover:bg-[color-mix(in_srgb,var(--primary)_90%,var(--fg))]',
  dark: 'bg-fg text-white border-fg hover:bg-fg-2',
  secondary: 'bg-card text-fg border-line hover:bg-inset',
  danger: 'bg-red text-white border-red hover:bg-[color-mix(in_srgb,var(--red)_90%,var(--fg))]',
  success: 'bg-green text-white border-green hover:bg-[color-mix(in_srgb,var(--green)_90%,var(--fg))]',
  ghost: 'bg-inset text-fg-2 border-transparent hover:bg-line',
};
const SIZE: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-[13px]',
  sm: 'h-8 px-3 text-[12px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-bold',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg',
        VARIANT[variant], SIZE[size], className,
      )}
      {...rest}
    />
  );
}
