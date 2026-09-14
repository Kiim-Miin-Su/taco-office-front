/** @file-guide
 * 목적: 과거 알림·북마크의 `/reports/:section` 주소를 현행 단일 route 탭 URL로 호환한다.
 * 책임/재사용: lib/report-links의 허용 목록만 사용해 redirect한다. 화면·권한·데이터 조회는 `/reports`가 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { redirect } from 'next/navigation';
import { hrefForLegacyReportSection } from '@/lib/report-links';

export default async function LegacyReportSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  redirect(hrefForLegacyReportSection(section));
}
