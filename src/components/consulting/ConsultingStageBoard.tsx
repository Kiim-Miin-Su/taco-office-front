/** @file-guide
 * 목적: ConsultingStageBoard.tsx — ConsultingStageBoard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Consulting } from '@/api/types';
import { Board, type BoardColumn, Chip } from '@/components/ui';
import {
  CONSULTING_CONTRACT_STEPS,
  CONSULTING_STAGES,
  consultingContractStep,
  consultingTypeLabel,
} from '@/lib/consulting';
import { ConsultingProgress } from './ConsultingProgress';

interface ConsultingStageBoardProps {
  items: Consulting[];
  loading?: boolean;
  onOpen: (item: Consulting) => void;
}

function StudentTitle({ item }: { item: Consulting }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-left text-[12px] font-bold text-fg">
        {item.studentNames.join(' · ') || '학생 미지정'}
      </span>
      {!item.canOpen ? <Chip tone="neutral">잠김</Chip> : null}
    </div>
  );
}

function ConsultingCard({ item }: { item: Consulting }) {
  const step = consultingContractStep(item.contractStep);
  const completedSessions = item.canOpen ? item.sessionsLog.length : 0;
  const totalSessions = item.sessions ?? 0;

  return (
    <>
      <StudentTitle item={item} />
      <div className="mt-1.5">
        <Chip>{consultingTypeLabel(item.consType)}</Chip>
      </div>

      {item.stage === 'contract' ? (
        <div className="mt-3">
          <ConsultingProgress
            segmented
            value={step}
            max={CONSULTING_CONTRACT_STEPS.length}
            label={`계약 ${step}/${CONSULTING_CONTRACT_STEPS.length}`}
          />
          <p className={step === CONSULTING_CONTRACT_STEPS.length ? 'mt-1.5 text-[10px] font-bold text-green' : 'mt-1.5 text-[10px] font-bold text-amber'}>
            계약 {step}/{CONSULTING_CONTRACT_STEPS.length}
          </p>
          <p className="mt-1 text-[10px] text-fg-subtle">
            {step > 0 ? CONSULTING_CONTRACT_STEPS[step - 1] : '계약 단계 미지정'}
            {item.ownerName ? ` · 담당 ${item.ownerName}` : ''}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <ConsultingProgress
            value={item.stage === 'done' ? 1 : completedSessions}
            max={item.stage === 'done' ? 1 : totalSessions}
            complete={item.stage === 'done'}
            label={item.stage === 'done'
              ? '컨설팅 종료'
              : item.canOpen
                ? `회차 ${completedSessions}/${totalSessions || '미정'}`
                : '회차 기록 잠김'}
          />
          <p className="mt-1.5 text-[10px] text-fg-subtle">
            {item.stage === 'done'
              ? `${item.endOn ?? '종료일 미정'} · 종료`
              : item.canOpen
                ? `회차 ${completedSessions}/${totalSessions || '미정'}`
                : '회차 기록 잠김'}
          </p>
        </div>
      )}
    </>
  );
}

export function ConsultingStageBoard({ items, loading = false, onOpen }: ConsultingStageBoardProps) {
  const columns: Array<BoardColumn<Consulting>> = CONSULTING_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    tone: stage.tone,
    items: items.filter((item) => item.stage === stage.key),
  }));

  return (
    <div className="overflow-x-auto pb-1">
      <Board
        className="min-w-[780px]"
        columns={columns}
        itemKey={(item) => item.id}
        empty={loading ? '불러오는 중…' : '컨설팅 건이 없습니다'}
        renderCard={(item) => (
          <button
            type="button"
            className="block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-blue disabled:cursor-default"
            disabled={!item.canOpen}
            aria-label={`${item.studentNames.join(' · ') || '학생 미지정'} 컨설팅 상세${item.canOpen ? '' : ' 잠김'}`}
            onClick={() => onOpen(item)}
          >
            <ConsultingCard item={item} />
          </button>
        )}
      />
    </div>
  );
}
