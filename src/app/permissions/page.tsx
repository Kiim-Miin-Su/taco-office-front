/** @file-guide
 * 목적: page.tsx — PermissionsPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** 이전 공유 URL 호환. 정상 진입은 §76의 상단 권한 모달이다. */
'use client';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { PermissionMatrix } from '@/components/data/PermissionMatrix';
import { PageHeader } from '@/components/ui';
import { useSession } from '@/store/useSession';

export default function PermissionsPage() {
  const me = useSession((s) => s.me);
  return <RequireAuth><AppShell>
    <PageHeader title="권한" />
    <PermissionMatrix me={me} />
  </AppShell></RequireAuth>;
}
