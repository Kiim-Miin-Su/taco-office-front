/** @file-guide
 * 목적: page.tsx — 학생 상세 route의 안전한 ID 경계
 * 책임/재사용: 공통 인증·셸과 StudentDetail을 조립한다. 잘못된 URL은 API에 보내지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { StudentDetail, studentHubTabFromQuery } from '@/components/students/StudentDetail';
import { queryEnum, queryIsoDate } from '@/lib/url-state';

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const studentId = /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
  const tab = studentHubTabFromQuery(searchParams.get('tab'));
  const calendarView = queryEnum(searchParams.get('view'), ['week', 'month'] as const) ?? 'week';
  const calendarAnchor = queryIsoDate(searchParams.get('anchor')) ?? undefined;
  return <RequireAuth><AppShell><StudentDetail key={id} studentId={studentId} initialTab={tab}
    initialCalendarView={calendarView} initialCalendarAnchor={calendarAnchor} /></AppShell></RequireAuth>;
}
