/** @file-guide
 * 목적: ConsultingStageBoard.tsx — ConsultingStageBoard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Consulting, ConsultingStage } from '@/api/types';
import { Board, type BoardColumn, Chip } from '@/components/ui';
import { CONSULTING_CONTRACT_STEPS, consultingContractStep } from '@/lib/consulting';
import { won } from '@/lib/money';
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

/**
 * 원본 §26 카드 바닥의 금액쌍 — 「₩400,000 / ₩800,000」. 못 보면 줄 자체가 없다 (D-R39).
 * 원화 모양은 `lib/money.won` 한 곳이다 — 이 카드만 제 ₩ 함수를 들고 있던 것을 N-92 에서 걷었다.
 */
function MoneyPair({ item }: { item: Consulting }) {
  if (item.amount == null && item.paidAmount == null) return null;
  return (
    <span className="text-[10.5px] font-bold text-fg-2">
      {won(item.paidAmount ?? 0)} / {item.amount == null ? '—' : won(item.amount)}
    </span>
  );
}

function StudentTitle({ item }: { item: Consulting }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-left text-[14px] font-bold text-fg">
        {item.studentNames.join(' · ') || '학생 미지정'}
      </span>
      {!item.canOpen ? <Chip tone="neutral">잠김</Chip> : null}
    </div>
  );
}

function ConsultingCard({ item }: { item: Consulting }) {
  const step = consultingContractStep(item.contractStep);
  // 원본 §31 회차 바 — 「한 회차」는 서버가 센다(날짜가 오늘 이하 · C95). 앞으로 잡아 둔 날짜는 기록이지 완료가 아니다 (N-18)
  const completedSessions = item.canOpen ? item.sessionsDone : 0;
  const plannedSessions = item.canOpen ? item.sessionsLog.length - item.sessionsDone : 0;
  const totalSessions = item.sessions ?? 0;

  return (
    <>
      {/*
        원본 §26 카드 순서 (26-06) — 칩 줄 → 이름(크게) → 요청자 · 담당 → 막대 → 금액쌍 · N일 지남.
        칩 (26-07): 계약 카드만 계약 단계 칩이 있고, 공개 칩은 **제한된 범위일 때만** 선다(전체 공개는 칩 없음). 낱말은 전부 서버가 준다
      */}
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <Chip>{item.typeLabel}</Chip>
        {item.stage === 'contract' && item.contractStepLabel ? <Chip tone="neutral">{item.contractStepLabel}</Chip> : null}
        {/* 공개 칩 낱말은 원본의 짧은 말 「수납만」(26-08) — 서버가 준다 */}
        {item.share !== 'all' ? <Chip tone="warning">{item.shareChipLabel}</Chip> : null}
      </div>
      <StudentTitle item={item} />

      {/* 「어머니 · 김범준」 — 요청자와 담당. 둘 다 없으면 줄이 서지 않는다 */}
      {item.requesterLabel || item.ownerName ? (
        <p className="mt-1 text-[10.5px] text-fg-subtle">
          {[item.requesterLabel, item.ownerName].filter(Boolean).join(' · ')}
        </p>
      ) : null}

      {item.stage === 'contract' ? (
        <div className="mt-3">
          {/* 계약 카드는 막대만 — 원본에 「계약 n/5」 글이 없다 (26-09) */}
          <ConsultingProgress
            segmented
            value={step}
            max={CONSULTING_CONTRACT_STEPS.length}
            label={`계약 ${step}/${CONSULTING_CONTRACT_STEPS.length}`}
          />
        </div>
      ) : (
        <div className="mt-3">
          {/* 진행 카드는 막대 왼쪽에 보라 글자 「2/6회」 (26-09) — 수는 서버가 센 「한 회차」다 */}
          <div className="flex items-center gap-2">
            {item.stage === 'running' && item.canOpen ? (
              <b className="shrink-0 text-[11px] text-violet">{completedSessions}/{totalSessions || '—'}회</b>
            ) : null}
            <div className="min-w-0 grow">
              <ConsultingProgress
                value={item.stage === 'done' ? 1 : completedSessions}
                max={item.stage === 'done' ? 1 : totalSessions}
                complete={item.stage === 'done'}
                label={item.stage === 'done'
                  ? '컨설팅 종료'
                  : item.canOpen
                    ? `회차 ${completedSessions} / 약정 ${totalSessions || '미정'}회`
                    : '회차 기록 잠김'}
              />
            </div>
          </div>
          {/* 원본에는 없는 줄이라 **말할 것이 있을 때만** 선다 — 끝난 날 · 잠김 · 앞으로 잡아 둔 날짜(기록 ≠ 완료 · N-18) */}
          {item.stage === 'done' ? (
            <p className="mt-1.5 text-[10px] text-fg-subtle">{item.endOn ?? '종료일 미정'} · 종료</p>
          ) : !item.canOpen ? (
            <p className="mt-1.5 text-[10px] text-fg-subtle">회차 기록 잠김</p>
          ) : plannedSessions > 0 ? (
            <p className="mt-1.5 text-[10px] text-fg-subtle">잡힌 날짜 {plannedSessions}</p>
          ) : null}
        </div>
      )}

      {/*
        원본 §26 카드의 바닥 줄 — 왼쪽에 금액쌍, 오른쪽에 「60일 지남」.
        지난 날은 **서버가 센 값**이다 (D-R37) — 화면이 날짜를 빼면 오늘이 언제인지부터 갈린다.
      */}
      {/* 시작 전 · 시작일 미정이면 서버가 null 을 준다 — 「0일 지남」을 적지 않는다(26-10). 둘 다 없으면 줄이 서지 않는다 */}
      {item.amount != null || item.paidAmount != null || item.ageDays != null ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-1.5">
          <MoneyPair item={item} />
          {item.ageDays != null ? (
            <span className={item.stage === 'done' ? 'ml-auto text-[10.5px] text-fg-subtle' : 'ml-auto text-[10.5px] font-bold text-fg-2'}>
              {item.ageDays}일 지남
            </span>
          ) : null}
        </div>
      ) : null}
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
        // 원문 §26 칸 머리: 윗선 단계색 · 번호 원 단계색 채움 · 오른쪽 큰 단계색 건수(26-05)
        accent
        countStyle="big"
        className="min-w-[780px]"
        columns={columns}
        itemKey={(item) => item.id}
        // 빈 칸은 원문 §26 「종료 0」 칸 그대로 「없습니다」 (W11 재대조)
        empty={loading ? '불러오는 중…' : '없습니다'}
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
