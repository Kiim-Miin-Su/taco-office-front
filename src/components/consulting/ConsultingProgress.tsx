/** @file-guide
 * 목적: ConsultingProgress.tsx — ConsultingProgress (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cn } from '@/components/ui';
import { CONSULTING_STAGE_BY_KEY } from '@/lib/consulting';

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
  const active = CONSULTING_STAGE_BY_KEY[complete ? 'done' : segmented ? 'contract' : 'running'].markerClass;

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
