import { cn } from '@/components/ui';

interface ConsultingProgressProps {
  value: number;
  max: number;
  segmented?: boolean;
  complete?: boolean;
  label: string;
}

/** §26 계약 5칸과 진행/종료 막대가 같은 숫자 정규화 규칙을 공유한다. */
export function ConsultingProgress({
  value,
  max,
  segmented = false,
  complete = false,
  label,
}: ConsultingProgressProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? Math.floor(max) : 0;
  const safeValue = safeMax > 0
    ? Math.max(0, Math.min(safeMax, Number.isFinite(value) ? Math.floor(value) : 0))
    : 0;
  const active = complete ? 'bg-green' : 'bg-blue';

  if (segmented) {
    return (
      <div
        role="img"
        aria-label={label}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${safeMax || 1}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: safeMax || 1 }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={cn('h-1 rounded-full', index < safeValue ? active : 'bg-line-2')}
          />
        ))}
      </div>
    );
  }

  const width = safeMax > 0 ? `${(safeValue / safeMax) * 100}%` : '0%';
  return (
    <div role="img" aria-label={label} className="h-1 overflow-hidden rounded-full bg-line-2">
      <span aria-hidden="true" className={cn('block h-full rounded-full', active)} style={{ width }} />
    </div>
  );
}
