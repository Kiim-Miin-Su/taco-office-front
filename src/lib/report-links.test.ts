/** @file-guide
 * 목적: 리포트→일정 identity와 과거 리포트 URL 호환 매핑의 회귀를 검증한다.
 * 책임/재사용: 제품 함수를 직접 호출하며 별도 URL 규칙을 테스트 안에 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { hrefForLegacyReportDetail, hrefForLegacyReportSection, hrefForScheduleOccurrence } from './report-links';

describe('report links', () => {
  it('SER 원래 날짜와 실제 날짜를 모두 보존한다', () => {
    expect(hrefForScheduleOccurrence({ serId: 41, onDate: '2026-09-01', date: '2026-09-03' }))
      .toBe('/schedule?serId=41&onDate=2026-09-01&date=2026-09-03');
  });

  it.each([
    ['unwritten', '/reports'],
    ['weekly', '/reports?section=weekly'],
    ['deliveries', '/reports?section=delivery'],
    ['history', '/reports?section=history'],
    ['unknown', '/reports'],
  ])('%s legacy 주소를 허용된 탭으로만 보낸다', (section, expected) => {
    expect(hrefForLegacyReportSection(section)).toBe(expected);
  });

  it('기존 2-segment 알림의 SER/원래 날짜를 현행 상세 query로 보존한다', () => {
    expect(hrefForLegacyReportDetail(9, '2026-09-01')).toBe('/reports?serId=9&onDate=2026-09-01');
  });
});
