/**
 * Shell — Figma `Shell/Admin Top Tabs` + `Shell/Sidebar` + `Shell/Top Bar`.
 * 61컷이 전부 이 껍데기를 쓴다. 화면은 본문만 그린다.
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
import { Logo } from '@/components/ui';
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
    <div className="min-h-screen bg-bg">
      <header className="flex h-[50px] items-center gap-1 bg-fg px-4">
        <Logo size={22} onDark className="mr-3" />
        <AdminTopNavigation pathname={path} badges={badges} />
        <span className="ml-3 whitespace-nowrap text-[11px] text-line-2">
          {me ? `${me.name} · ${me.title ?? ''}` : ''}
        </span>
        <DrawerButton onOpen={() => setDrawer(true)} count={approvalCount} unread={unreadCount} />
        <button
          type="button" onClick={out}
          className="ml-2 rounded-md px-2 py-1 text-[11px] font-bold text-line-2 hover:bg-white/10"
        >
          로그아웃
        </button>
      </header>
      <div className="flex min-h-[calc(100vh-50px)]">
        <AdminSidebar pathname={path} me={me} badges={badges} />
        <main className="min-w-0 flex-1 p-6">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
      <AppDrawer open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}
