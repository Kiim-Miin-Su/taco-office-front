/** @file-guide
 * 목적: PeriodSummaryBar.tsx — PeriodSummaryBarProps, PeriodSummaryBar (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §09 상단 **기간 집계** 한 줄 —
 * 「일정 N건 · 현장 N / 온라인 N · N시간 · 승인 대기 N · 리포트 미제출 N」.
 *
 * 이 줄은 **아무것도 세지 않는다.** 숫자는 격자가 받는 바로 그 배열에서 `periodSummary()`
 * 하나가 세고, 여기는 그 결과를 원문 낱말로 늘어놓기만 한다 — 상단과 칸이 서로 다른 것을
 * 세던 자리가 원문의 어긋남(268 vs 200)이었다 (N-19).
 */
import type { PeriodSummary } from '@/lib/calendar';

export interface PeriodSummaryBarProps {
  summary: PeriodSummary;
  /** 월간이면 집계가 격자(6주)가 아니라 **그 달**이라는 것을 말해 준다 */
  month?: boolean;
}

const Dot = () => <span aria-hidden className="text-line-2">·</span>;

export function PeriodSummaryBar({ summary, month }: PeriodSummaryBarProps) {
  const { total, onsite, online, hours, waiting, unsubmitted } = summary;
  return (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 px-2 text-[11px] font-bold text-fg-2">
      <span title={month ? '이 달 1일~말일 기준 — 격자의 흐린 앞뒤 달 칸은 세지 않습니다' : '이 기간 전부 — 취소·휴강도 셉니다'}>
        일정 <span className="text-fg">{total}</span>건
      </span>
      <Dot />
      <span title="현장 + 온라인 = 일정 건수 (v2 §09)">현장 {onsite} / 온라인 {online}</span>
      <Dot />
      <span title="취소·휴강은 시수에서 뺍니다 (D-R11). 정산 시수는 회계 탭에서 월 단위로 확정됩니다">
        {hours.toFixed(1)}시간
      </span>
      <Dot />
      <span
        className={waiting ? 'text-amber' : undefined}
        title="이 기간 리포트 중 승인을 기다리는 수입니다. 상단의 「승인 대기」 배지는 내 결재함이라 다른 수입니다"
      >
        승인 대기 {waiting}
      </span>
      <Dot />
      <span
        className={unsubmitted ? 'text-red' : undefined}
        title="끝났는데 아직 제출하지 않은 리포트입니다 — 저장만 해 둔 초안도 미제출입니다"
      >
        리포트 미제출 {unsubmitted}
      </span>
    </div>
  );
}
