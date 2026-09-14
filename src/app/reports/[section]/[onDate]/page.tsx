/** @file-guide
 * 목적: 기존 NOTI에 보존된 `/reports/:serId/:onDate` 리포트 상세 URL을 현행 query 계약으로 연결한다.
 * 책임/재사용: 공용 url-state 방어만 사용하며 실제 조회·권한은 `/reports`와 서버가 다시 판정한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { redirect } from 'next/navigation';
import { hrefForLegacyReportDetail } from '@/lib/report-links';
import { positiveQueryId, queryIsoDate } from '@/lib/url-state';

export default async function LegacyReportDetailPage({
  params,
}: {
  params: Promise<{ section: string; onDate: string }>;
}) {
  const { section, onDate } = await params;
  const serId = positiveQueryId(section);
  const safeDate = queryIsoDate(onDate);
  if (!serId || !safeDate) redirect('/reports');
  redirect(hrefForLegacyReportDetail(serId, safeDate));
}
