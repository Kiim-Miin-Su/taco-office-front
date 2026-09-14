/** @file-guide
 * 목적: §47에 탭만 있고 본문 캡처가 없는 주간 트래킹 범위를 사용자에게 정직하게 표시한다.
 * 책임/재사용: 임의 WREP 집계나 완료 조건을 만들지 않는다. 확정 계약이 생기면 이 경계 컴포넌트만 교체한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { Banner, Panel } from '@/components/ui';

export function ReportWeeklyTrackingBoundary() {
  return (
    <Panel title="주간 트래킹" sub="개발명세서에는 탭과 남은 인원만 있으며, 상세 목록과 완료 기준은 제공되지 않았습니다.">
      <Banner tone="warning">
        대상 학생·주 시작일·완료 조건이 확정되기 전에는 주간 리포트를 임의로 집계하거나 저장하지 않습니다.
      </Banner>
    </Panel>
  );
}
