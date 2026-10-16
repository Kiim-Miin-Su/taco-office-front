/** @file-guide
 * 목적: Panel.tsx — Panel, LevelBar (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** 흰 카드 한 장 — Figma 스펙 카드의 패널과 같은 자리. */
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Panel({ title, sub, right, children, className, wrapRight = false }: {
  title?: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string;
  /**
   * 넓은 오른쪽 슬롯(세그먼트 필터 등)이 좁은 폭에서 제목·설명을 한 낱말 폭으로 누르지 않게 다음 줄로 내린다.
   * 기본 false — 기존 패널 소비처의 배치는 바꾸지 않는다(S5a 2026-10-16, 390px 실측).
   */
  wrapRight?: boolean;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-card p-4', className)}>
      {(title || right) && (
        <header className={cn('mb-3 flex items-start justify-between gap-3', wrapRight && 'flex-wrap')}
          data-wrap-right={wrapRight ? 'true' : undefined}>
          <div className={wrapRight ? 'min-w-0 flex-1 basis-60' : undefined}>
            {title ? <h2 className="text-[13px] font-bold text-fg">{title}</h2> : null}
            {sub ? <p className="mt-0.5 text-[12px] text-fg-subtle">{sub}</p> : null}
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
      {label ? <span className="shrink-0 text-[12px] font-bold text-fg-subtle">{label}</span> : null}
    </div>
  );
}
