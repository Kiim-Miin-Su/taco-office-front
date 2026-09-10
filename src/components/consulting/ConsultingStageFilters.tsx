/** @file-guide
 * 목적: ConsultingStageFilters.tsx — ConsultingStageFilters (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { Button } from '@/components/ui';
import { CONSULTING_STAGES, type ConsultingStageCounts, type ConsultingStageFilterValue } from '@/lib/consulting';

interface ConsultingStageFiltersProps {
  value: ConsultingStageFilterValue;
  counts: ConsultingStageCounts;
  onChange: (value: ConsultingStageFilterValue) => void;
}

/** §26: 공용 Button을 반복하고 선택 하나만 소유자에게 전달한다. */
export function ConsultingStageFilters({ value, counts, onChange }: ConsultingStageFiltersProps) {
  const options = [{ key: 'all' as const, label: '전체', markerClass: '' }, ...CONSULTING_STAGES];
  return (
    <div role="group" aria-label="컨설팅 단계 필터" className="mb-3 flex flex-wrap gap-1.5 border-b border-line pb-3">
      {options.map(({ key, label, markerClass }) => (
        <Button key={key} size="sm" variant={value === key ? 'dark' : 'secondary'}
          aria-pressed={value === key} onClick={() => onChange(key)}>
          {markerClass ? <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${value === key ? 'bg-white' : markerClass}`} /> : null}
          {label} {counts[key]}
        </Button>
      ))}
    </div>
  );
}
