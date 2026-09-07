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
