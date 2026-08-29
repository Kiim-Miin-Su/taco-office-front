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
