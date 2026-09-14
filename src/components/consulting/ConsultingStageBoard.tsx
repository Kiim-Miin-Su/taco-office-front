/** @file-guide
 * 목적: ConsultingStageBoard.tsx — ConsultingStageBoard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Consulting, ConsultingStage } from '@/api/types';
import { Board, type BoardColumn, Chip } from '@/components/ui';
import { CONSULTING_CONTRACT_STEPS, consultingContractStep } from '@/lib/consulting';
import { ConsultingProgress } from './ConsultingProgress';

/**
 * 칸의 **색**만 화면이 고른다 — 이름·순서·한 줄은 서버가 준 `stages` 다 (D-R18 · D-R25 · C86-e).
 * 한동안 `lib/consulting` 의 표가 이름까지 들고 있었고, 서버에도 같은 표가 있었다.
 */
const STAGE_TONE: Record<string, 'info' | 'purple' | 'success'> = {
  contract: 'info', running: 'purple', done: 'success',
};

interface ConsultingStageBoardProps {
  items: Consulting[];
  /** 빈 칸도 이름과 한 줄을 갖는다 — 서버가 언제나 셋을 보낸다 */
  stages: ConsultingStage[];
  loading?: boolean;
  onOpen: (item: Consulting) => void;
}

/** 원본 §26 카드 바닥의 금액쌍 — 「₩400,000 / ₩800,000」. 못 보면 줄 자체가 없다 (D-R39) */
function MoneyPair({ item }: { item: Consulting }) {
  if (item.amount == null && item.paidAmount == null) return null;
  const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
  return (
    <span className="text-[10.5px] font-bold text-fg-2">
      {won(item.paidAmount ?? 0)} / {item.amount == null ? '—' : won(item.amount)}
    </span>
  );
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
      {/* 갈래 · 계약 단계 · 공개 범위 — 원본 §26 카드의 칩 셋. 낱말은 전부 서버가 준다 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Chip>{item.typeLabel}</Chip>
        {item.contractStepLabel ? <Chip tone="neutral">{item.contractStepLabel}</Chip> : null}
        <Chip tone="warning">{item.shareLabel}</Chip>
      </div>

      {/* 「어머니 · 김범준」 — 요청자와 담당. 둘 다 없으면 줄이 서지 않는다 */}
      {item.requesterLabel || item.ownerName ? (
        <p className="mt-1 text-[10.5px] text-fg-subtle">
          {[item.requesterLabel, item.ownerName].filter(Boolean).join(' · ')}
        </p>
      ) : null}

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
                ? `기록 ${completedSessions}건 / 약정 ${totalSessions || '미정'}회`
                : '회차 기록 잠김'}
          />
          <p className="mt-1.5 text-[10px] text-fg-subtle">
            {item.stage === 'done'
              ? `${item.endOn ?? '종료일 미정'} · 종료`
              : item.canOpen
                ? `기록 ${completedSessions}건 / 약정 ${totalSessions || '미정'}회`
                : '회차 기록 잠김'}
          </p>
        </div>
      )}

      {/*
        원본 §26 카드의 바닥 줄 — 왼쪽에 금액쌍, 오른쪽에 「60일 지남」.
        지난 날은 **서버가 센 값**이다 (D-R37) — 화면이 날짜를 빼면 오늘이 언제인지부터 갈린다.
      */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-1.5">
        <MoneyPair item={item} />
        <span className={item.stage === 'done' ? 'ml-auto text-[10.5px] text-fg-subtle' : 'ml-auto text-[10.5px] font-bold text-fg-2'}>
          {item.ageDays}일 지남
        </span>
      </div>
    </>
  );
}

export function ConsultingStageBoard({ items, stages, loading = false, onOpen }: ConsultingStageBoardProps) {
  const columns: Array<BoardColumn<Consulting>> = stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    // 칸 아래 한 줄은 **다음에 무엇을 하는지**다 (원본 §26)
    sub: stage.sub,
    tone: STAGE_TONE[stage.key] ?? 'neutral',
    items: items.filter((item) => item.stage === stage.key),
  }));

  return (
    <div className="overflow-x-auto pb-1">
      <Board
        numbered
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
