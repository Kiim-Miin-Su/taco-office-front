/** @file-guide
 * 목적: page.tsx — PermissionsPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** 이전 공유 URL 호환. 정상 진입은 §76의 상단 권한 모달이다 — 같은 서버 표(`GET /permissions` · N-98)를 그린다. */
'use client';
import { usePermissionTable } from '@/api/queries';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { PermissionMatrix } from '@/components/data/PermissionMatrix';
import { PageHeader } from '@/components/ui';

/** 셸 안에서만 읽는다 — 인증 경계(RequireAuth)를 지난 뒤에 부른다 */
function PermissionsBody() {
  const table = usePermissionTable(true);
  return (
    <>
      <PageHeader title="권한" sub={table.data?.sub} />
      <PermissionMatrix table={table.data} loading={table.isLoading} error={table.error} />
    </>
  );
}

export default function PermissionsPage() {
  return <RequireAuth><AppShell><PermissionsBody /></AppShell></RequireAuth>;
}
