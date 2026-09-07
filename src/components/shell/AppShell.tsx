/**
 * 인증된 업무 화면의 공용 셸. 메뉴/본문은 권한과 역할별 명세에 따라 조립한다.
 * 업무 탭은 상단 한 벌. 원본의 도메인별 좌우 패널은 해당 페이지가 소유한다.
 */
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Home, Maximize, Minimize, ShieldCheck, Inbox } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/store/useSession';
import { api } from '@/api/client';
import { clearSessionQueries } from '@/api/session-cache';
import { useDrawer, useUnwritten } from '@/api/queries';
import { AppDrawer, DrawerButton, type DrawerPane } from '@/components/drawer/AppDrawer';
import { Banner, Button, Dialog, Logo, cn } from '@/components/ui';
import { PermissionMatrix } from '@/components/data/PermissionMatrix';
import { ROLE_LABEL } from '@/lib/roles';
import { AdminTopNavigation, type AdminNavBadges } from './AdminNavigation';
import styles from './AppShell.module.css';

export function AppShell({ children, sidePanel, rightPanel, onToday, flush = false }: {
  children: ReactNode;
  sidePanel?: ReactNode;
  rightPanel?: ReactNode;
  onToday?: () => void;
  flush?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const drawerData = useDrawer(Boolean(me)).data;
  const unwritten = useUnwritten().data;
  // 서랍은 **전역**이다 — 탭마다 따로 두면 탭을 옮길 때 닫힌다
  const [drawer, setDrawer] = useState(false);
  const [drawerPane, setDrawerPane] = useState<DrawerPane>('approvals');
  const [permissions, setPermissions] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const isAdmin = Boolean(me?.canAdminPage);

  useEffect(() => {
    const sync = () => setFullScreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  async function toggleFullScreen() {
    setScreenError(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setScreenError('이 브라우저에서 전체 화면을 열 수 없습니다. 브라우저의 전체 화면 메뉴를 이용해 주세요.');
    }
  }

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
    <div data-ui={me?.canAdminPage ? 'admin' : 'teacher'} className={cn(styles.shell, 'bg-bg text-fg')}>
      <header className={cn(styles.header, isAdmin ? 'border-b border-header-line bg-header' : 'bg-fg')}>
        <Logo size={isAdmin ? 26 : 22} withMark={!isAdmin} onDark className="mr-auto shrink-0 sm:mr-3" />
        {isAdmin ? <div className="flex shrink-0 items-center gap-2 border-header-line sm:border-x sm:px-3">
          {onToday ? <button type="button" onClick={onToday} className="flex h-[30px] items-center gap-1 rounded-md bg-header-home px-3 text-[12px] font-bold text-white">
            <Home size={14} aria-hidden />오늘 전체
          </button> : <a href="/schedule" className="flex h-[30px] items-center gap-1 rounded-md bg-header-home px-3 text-[12px] font-bold text-white">
            <Home size={14} aria-hidden />오늘 전체
          </a>}
          <button type="button" onClick={() => router.back()} className="flex h-[30px] items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
            <ArrowLeft size={14} aria-hidden />뒤로
          </button>
        </div> : null}
        <AdminTopNavigation pathname={path} badges={badges} me={me} />
        {isAdmin ? <button type="button" onClick={() => void toggleFullScreen()} aria-label={fullScreen ? '전체 화면 종료' : '전체 화면'}
          className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
          {fullScreen ? <Minimize size={14} aria-hidden /> : <Maximize size={14} aria-hidden />}
          <span className="hidden xl:inline">{fullScreen ? '전체 화면 종료' : '전체 화면'}</span>
        </button> : null}
        {isAdmin ? <button type="button" onClick={() => { setDrawerPane('approvals'); setDrawer(true); }}
          className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-amber bg-header-approval px-2.5 text-[12px] font-bold text-amber">
          <Inbox size={14} aria-hidden />승인 대기 <span className="rounded bg-amber/20 px-1.5">{approvalCount}</span>
        </button> : <DrawerButton onOpen={() => setDrawer(true)} count={approvalCount} unread={unreadCount} />}
        <details className="relative shrink-0 text-[11px] text-line-2 sm:ml-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1" aria-label="내 계정">
            {isAdmin ? <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-white">{me?.name.slice(0, 2)}</span> : null}
            <span>{me?.name}</span>
            {me ? <span className="rounded bg-header-tool px-1.5 py-0.5 text-[10px]">{me.title || ROLE_LABEL[me.role]}</span> : null}
          </summary>
          <div className="absolute right-0 top-full z-30 mt-1 min-w-28 rounded-md border border-line bg-card p-1 text-fg shadow-lg">
            <button type="button" onClick={out} className="w-full rounded px-3 py-2 text-left font-bold hover:bg-inset">로그아웃</button>
          </div>
        </details>
        <button type="button" onClick={() => setPermissions(true)}
          className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
          <ShieldCheck size={14} aria-hidden />권한
        </button>
      </header>
      <div className={styles.workspace}>
        {isAdmin && sidePanel ? <div className={cn(styles.panel, 'border-r border-line bg-card')}>{sidePanel}</div> : null}
        <main className={cn(styles.main, !flush && 'p-3 sm:p-6')}>
          {screenError ? <Banner tone="warning" className="mb-3">{screenError}</Banner> : null}
          {isAdmin ? children : <div className="mx-auto max-w-[1440px]">{children}</div>}
        </main>
        {isAdmin && rightPanel ? <div className={cn(styles.panel, 'border-l border-line')}>{rightPanel}</div> : null}
      </div>
      <AppDrawer open={drawer} onClose={() => setDrawer(false)} pane={drawerPane} onPaneChange={setDrawerPane} />
      <Dialog open={permissions} onClose={() => setPermissions(false)} title="권한" width={800}
        footer={<Button onClick={() => setPermissions(false)}>닫기</Button>}>
        <div className="max-h-[70dvh] overflow-y-auto"><PermissionMatrix me={me} /></div>
      </Dialog>
    </div>
  );
}
