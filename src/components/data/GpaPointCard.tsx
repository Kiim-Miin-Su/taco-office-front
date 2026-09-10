/** @file-guide
 * 목적: GpaPointCard.tsx — GpaPointCard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** Data/GPA Point Card — 잔여 포인트 (normal · over · unused). 이월 없음. */
import { Chip, LevelBar } from '../ui';
import { cn } from '../ui/cn';

export function GpaPointCard({ studentName, granted, used, className }: {
  studentName: string; granted: number; used: number; className?: string;
}) {
  const left = granted - used;
  const over = left < 0;
  const low = !over && left <= granted * 0.15;
  return (
    <div className={cn('rounded-xl border bg-card p-3.5', over ? 'border-red/40' : 'border-line', className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-bold text-fg">{studentName}</span>
        {over ? <Chip tone="danger">초과</Chip> : low ? <Chip tone="warning">임박</Chip> : <Chip tone="success">여유</Chip>}
      </div>
      <div className={cn('mt-1 text-[20px] font-bold', over ? 'text-red' : low ? 'text-amber' : 'text-green')}>
        남은 {left}p
      </div>
      <LevelBar
        className="mt-2"
        value={granted ? used / granted : 0}
        tone={over ? 'red' : low ? 'amber' : 'green'}
        label={`${used} / ${granted}`}
      />
      <p className="mt-1.5 text-[10px] text-fg-subtle">사이클이 끝나면 남은 포인트는 사라집니다 — 이월 없음</p>
    </div>
  );
}
