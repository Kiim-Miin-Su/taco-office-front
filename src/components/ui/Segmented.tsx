/** UI/Segmented · UI/Tab — 보기 전환. 일·주·월 같은 것. */
import { cn } from './cn';

export interface SegmentedProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={cn('inline-flex rounded-lg bg-inset p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-[12px] font-bold transition-colors',
            o.value === value ? 'bg-card text-fg shadow-sm' : 'text-fg-subtle hover:text-fg-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={cn('flex gap-1 border-b border-line', className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-[12px] font-bold transition-colors',
            o.value === value ? 'border-blue text-blue' : 'border-transparent text-fg-subtle hover:text-fg-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
