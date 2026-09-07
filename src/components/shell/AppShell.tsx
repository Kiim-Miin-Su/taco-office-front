/**
 * 인증된 업무 화면의 공용 셸. 메뉴/본문은 권한과 역할별 명세에 따라 조립한다.
 * 원본 전체 셸의 시각 교정은 TBO-48 후속 청크에서 진행한다.
 */
'use client';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/store/useSession';
import { api } from '@/api/client';
import { clearSessionQueries } from '@/api/session-cache';
import { useDrawer, useUnwritten } from '@/api/queries';
import { AppDrawer, DrawerButton } from '@/components/drawer/AppDrawer';
import { Button, Dialog, Logo } from '@/components/ui';
import { PermissionMatrix } from '@/components/data/PermissionMatrix';
import { AdminSidebar, AdminTopNavigation, type AdminNavBadges } from './AdminNavigation';

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const drawerData = useDrawer(Boolean(me)).data;
  const unwritten = useUnwritten().data;
  // 서랍은 **전역**이다 — 탭마다 따로 두면 탭을 옮길 때 닫힌다
  const [drawer, setDrawer] = useState(false);
  const [permissions, setPermissions] = useState(false);

  const approvalCount = drawerData?.approvals.count ?? 0;
  const unreadCount = drawerData?.notis.filter((n) => !n.read).length ?? 0;
  const badges: AdminNavBadges = {
    reports: unwritten?.total ?? 0,
    approvals: approvalCount,
  };

  async function out() {
    try { await api.post('/auth/logout'); } catch { /* 쿠키가 이미 없을 수 있다 */ }
    signOut();
    clearSessionQueries(queryClient);
    router.replace('/login');
  }
  return (
    <div data-ui={me?.canAdminPage ? 'admin' : 'teacher'} className="min-h-screen bg-bg text-fg">
      <header className="flex min-h-[50px] flex-wrap items-center gap-1 bg-fg px-3 py-2 sm:flex-nowrap sm:px-4 sm:py-0">
        <Logo size={22} onDark className="mr-auto shrink-0 sm:mr-3" />
        <AdminTopNavigation pathname={path} badges={badges} me={me} />
        <span className="whitespace-nowrap text-[11px] text-line-2 sm:ml-3">
          {me ? `${me.name} · ${me.title ?? ''}` : ''}
        </span>
        <DrawerButton onOpen={() => setDrawer(true)} count={approvalCount} unread={unreadCount} />
        <button type="button" onClick={() => setPermissions(true)}
          className="rounded-md px-2 py-1 text-[11px] font-bold text-line-2 hover:bg-white/10">권한</button>
        <button
          type="button" onClick={out}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-bold text-line-2 hover:bg-white/10 sm:ml-2"
        >
          로그아웃
        </button>
      </header>
      <div className="flex min-h-[calc(100vh-50px)]">
        <AdminSidebar pathname={path} me={me} badges={badges} />
        <main className="min-w-0 flex-1 p-3 sm:p-6">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
      <AppDrawer open={drawer} onClose={() => setDrawer(false)} />
      <Dialog open={permissions} onClose={() => setPermissions(false)} title="권한" width={800}
        footer={<Button onClick={() => setPermissions(false)}>닫기</Button>}>
        <div className="max-h-[70dvh] overflow-y-auto"><PermissionMatrix me={me} /></div>
      </Dialog>
    </div>
  );
}
