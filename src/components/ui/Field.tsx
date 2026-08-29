/**
 * Form/Input · Form/Select · Form/Textarea · Form/Checkbox · Form/Field Error.
 * 라벨·에러 자리를 한곳에서 정해 둔다 — 화면마다 다르면 폼이 조금씩 어긋나 보인다.
 */
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

const BASE = 'w-full rounded-lg border bg-card text-[13px] text-fg outline-none transition-colors placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:bg-inset disabled:text-fg-subtle';
const OK = 'border-line focus:border-blue';
const BAD = 'border-red focus:border-red';

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[11px] font-bold text-fg-subtle">{children}</label>
      {hint ? <span className="text-[10px] text-fg-subtle">{hint}</span> : null}
    </div>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-[11px] font-bold text-red">{children}</p>;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { error?: boolean }
export function Input({ error, className, ...rest }: InputProps) {
  return <input className={cn(BASE, 'h-10 px-3', error ? BAD : OK, className)} {...rest} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { error?: boolean }
export function Select({ error, className, children, ...rest }: SelectProps) {
  return (
    <select className={cn(BASE, 'h-10 px-2.5', error ? BAD : OK, className)} {...rest}>
      {children}
    </select>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { error?: boolean }
export function Textarea({ error, className, ...rest }: TextareaProps) {
  return <textarea className={cn(BASE, 'min-h-[96px] p-3 leading-relaxed', error ? BAD : OK, className)} {...rest} />;
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-[12px] text-fg', className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line accent-blue" {...rest} />
      {label}
    </label>
  );
}

/**
 * UI/Counted Textarea — 글자 수를 세어 보여 준다 (v26 검증 규칙 · 40자 이상).
 * 「몇 자 남았는지」를 저장 눌러서 알게 하지 않는다.
 */
export function CountedTextarea({
  value, onChange, min = 0, max = 2000, placeholder, id,
}: {
  value: string; onChange: (v: string) => void; min?: number; max?: number; placeholder?: string; id?: string;
}) {
  const n = value.trim().length;
  const short = n > 0 && n < min;
  return (
    <div>
      <Textarea id={id} value={value} placeholder={placeholder} error={short} maxLength={max}
        onChange={(e) => onChange(e.target.value)} />
      <div className="mt-1 flex justify-between text-[10px]">
        <span className={cn('font-bold', short ? 'text-red' : 'text-fg-subtle')}>
          {short ? `${min}자 이상 써 주세요` : ''}
        </span>
        <span className="text-fg-subtle">{n} / {max}자</span>
      </div>
    </div>
  );
}
