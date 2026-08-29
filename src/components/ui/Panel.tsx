/** 흰 카드 한 장 — Figma 스펙 카드의 패널과 같은 자리. */
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Panel({ title, sub, right, children, className }: {
  title?: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-card p-4', className)}>
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-[13px] font-bold text-fg">{title}</h2> : null}
            {sub ? <p className="mt-0.5 text-[11px] text-fg-subtle">{sub}</p> : null}
          </div>
          {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

/** Data/Level Bar — 진행률 막대 */
export function LevelBar({ value, tone = 'blue', label, className }: { value: number; tone?: 'blue' | 'green' | 'amber' | 'red'; label?: ReactNode; className?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const bar = { blue: 'bg-blue', green: 'bg-green', amber: 'bg-amber', red: 'bg-red' }[tone];
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className={cn('h-full rounded-full', bar)} style={{ width: `${pct * 100}%` }} />
      </div>
      {label ? <span className="shrink-0 text-[10px] font-bold text-fg-subtle">{label}</span> : null}
    </div>
  );
}
