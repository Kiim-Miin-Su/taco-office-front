/**
 * UI/Button — Figma `UI/Button` (variant 6 × size 2 = 12 변형).
 * 색은 토큰만 쓴다. `.tsx` 안에 #rrggbb 를 적으면 eslint 가 막는다 (D-R41).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-blue text-white border-blue hover:opacity-90',
  dark: 'bg-fg text-white border-fg hover:opacity-90',
  secondary: 'bg-card text-fg border-line hover:bg-inset',
  danger: 'bg-red text-white border-red hover:opacity-90',
  success: 'bg-green text-white border-green hover:opacity-90',
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
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-bold',
        'transition-opacity disabled:cursor-not-allowed disabled:opacity-40',
        VARIANT[variant], SIZE[size], className,
      )}
      {...rest}
    />
  );
}
