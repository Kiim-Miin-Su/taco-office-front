/** @file-guide
 * 목적: AppShell.tsx — WorkspacePanelApi, AppShell (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 인증된 업무 화면의 공용 셸. 메뉴/본문은 권한과 역할별 명세에 따라 조립한다.
 * 업무 탭은 상단 한 벌. 원본의 도메인별 좌우 패널은 해당 페이지가 소유한다.
 */
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Home, Maximize, Minimize, Palette, RotateCcw, ShieldCheck, Workflow } from 'lucide-react';
import { DesignSystemDialog } from '@/components/design/DesignSystemDialog';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/store/useSession';
import { api } from '@/api/client';
import { clearSessionQueries } from '@/api/session-cache';
import { useDrawer, useUnwritten } from '@/api/queries';
import { AppDrawer, type DrawerPane } from '@/components/drawer/AppDrawer';
import { ApprovalFlowDialog } from '@/components/approval/ApprovalFlowDialog';

/** 페이지 소유 패널이 전역 서랍을 열 때 쓰는 최소 API — 서랍 상태는 셸이 계속 소유한다. */
export type WorkspacePanelApi = { openDrawer: (pane: DrawerPane) => void };
export type DrawerEntry = { pane: DrawerPane; identity: string };
type PanelSlot = ReactNode | ((api: WorkspacePanelApi) => ReactNode);
import { Banner, Button, Dialog, Logo, cn } from '@/components/ui';
import { PermissionMatrix } from '@/components/data/PermissionMatrix';
import { objectParticle } from '@/lib/calendar';
import { AdminTopNavigation, type AdminNavBadges } from './AdminNavigation';
import { useUndoLast } from './useUndoLast';
import styles from './AppShell.module.css';

export function AppShell({ children, sidePanel, rightPanel, leftTool, rightTool, onToday, drawerEntry, flush = false }: {
  children: ReactNode;
  sidePanel?: PanelSlot;
  rightPanel?: PanelSlot;
  /** 헤더 좌/우 끝의 화면 소유 도구 — 원본 Top bar 의 ☰/» 토글 자리다. */
  leftTool?: ReactNode;
  rightTool?: ReactNode;
  onToday?: () => void;
  /** deep link가 기존 전역 서랍의 특정 칸으로 착지할 때만 사용한다. 조회 snapshot은 추가하지 않는다. */
  drawerEntry?: DrawerEntry | null;
  flush?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const isAdmin = Boolean(me?.canAdminPage);
  // 강사는 관리자 서랍의 존재와 배지 숫자도 받지 않는다 — 숨김이 아니라 조회부터 끈다 (D-R39).
  const drawerData = useDrawer(isAdmin).data;
  const unwritten = useUnwritten(undefined, isAdmin).data;
  // 서랍은 **전역**이다 — 탭마다 따로 두면 탭을 옮길 때 닫힌다
  const [drawer, setDrawer] = useState(false);
  const [drawerPane, setDrawerPane] = useState<DrawerPane>('approvals');
  const [approvalFlow, setApprovalFlow] = useState(false);
  const [permissions, setPermissions] = useState(false);
  /** §85·§86 — 원문에서 이것은 라우트가 아니라 머리의 「디자인」이 여는 창이다 (C60) */
  const [design, setDesign] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  // 되돌리기는 상단바에도 있고(원본 §16) 스케줄 화면의 띠에도 있다 — 둘 다 같은 훅을 쓴다 (N-138)
  const undoLast = useUndoLast();
  const openDrawer = (pane: DrawerPane) => { setDrawerPane(pane); setDrawer(true); };
  const side = typeof sidePanel === 'function' ? sidePanel({ openDrawer }) : sidePanel;
  const right = typeof rightPanel === 'function' ? rightPanel({ openDrawer }) : rightPanel;

  useEffect(() => {
    const sync = () => setFullScreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if (!isAdmin || !drawerEntry) return;
    setDrawerPane(drawerEntry.pane);
    setDrawer(true);
  }, [drawerEntry?.identity, drawerEntry?.pane, isAdmin]);

  async function toggleFullScreen() {
    setScreenError(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setScreenError('이 브라우저에서 전체 화면을 열 수 없습니다. 브라우저의 전체 화면 메뉴를 이용해 주세요.');
    }
  }

  const approvalCount = drawerData?.approvalFlow?.total ?? 0;
  const canViewApprovalFlow = isAdmin && Boolean(drawerData?.approvalFlow?.canView);
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
    <div data-ui={me?.canAdminPage ? 'admin' : 'teacher'} data-print="surface" className={cn(styles.shell, 'bg-bg text-fg')}>
      <header data-print="chrome" className={cn(styles.header, isAdmin ? 'border-b border-header-line bg-header' : 'bg-fg')}>
        {isAdmin && leftTool ? <div className="mr-1 flex shrink-0 items-center">{leftTool}</div> : null}
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
          {/*
            원본 §16 컷의 상단바 세 번째 단추다 — 되돌릴 것이 없으면 **흐리게** 그려져 있다.
            그래서 조건부로 사라지지 않고 **늘 서 있고** 못 누를 때는 이유를 `title` 이 말한다.
            컷의 「⌄」는 눌렀을 때가 컷에 없어 만들지 않는다 (D-R44 — 없는 메뉴를 짓지 않는다).
          */}
          <button type="button" onClick={() => undoLast.undo({ onFail: setScreenError })}
            disabled={!undoLast.canUndo || undoLast.pending}
            title={undoLast.canUndo ? `${undoLast.label}${objectParticle(undoLast.label ?? '')} 되돌립니다 · Ctrl/⌘+Z` : '되돌릴 최근 일정 작업이 없습니다'}
            className="flex h-[30px] items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2 disabled:opacity-40">
            <RotateCcw size={14} aria-hidden />되돌리기
          </button>
        </div> : null}
        <AdminTopNavigation pathname={path} badges={badges} me={me} />
        {isAdmin ? <button type="button" onClick={() => void toggleFullScreen()} aria-label={fullScreen ? '전체 화면 종료' : '전체 화면'}
          className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
          {fullScreen ? <Minimize size={14} aria-hidden /> : <Maximize size={14} aria-hidden />}
          <span className="hidden xl:inline">{fullScreen ? '전체 화면 종료' : '전체 화면'}</span>
        </button> : null}
        {canViewApprovalFlow ? <button type="button" onClick={() => setApprovalFlow(true)} aria-haspopup="dialog"
          className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-amber bg-header-approval px-2.5 text-[12px] font-bold text-white">
          <Workflow size={14} aria-hidden />결재 흐름 <span className="rounded bg-white/15 px-1.5">{approvalCount}</span>
        </button> : null}
        <details className="relative shrink-0 text-[11px] text-line-2 sm:ml-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1" aria-label="내 계정">
            {isAdmin ? <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-white">{me?.name.slice(0, 2)}</span> : null}
            <span>{me?.name}</span>
            {/* 역할의 낱말도 서버가 만든다 — 화면이 제 표를 들면 서랍 §17 과 여기가 갈린다 (D-R18) */}
            {me ? <span className="rounded bg-header-tool px-1.5 py-0.5 text-[10px]">{me.title || me.roleLabel}</span> : null}
          </summary>
          <div className="absolute right-0 top-full z-30 mt-1 min-w-28 rounded-md border border-line bg-card p-1 text-fg shadow-lg">
            <button type="button" onClick={out} className="w-full rounded px-3 py-2 text-left font-bold hover:bg-inset">로그아웃</button>
          </div>
        </details>
        {isAdmin ? <button type="button" onClick={() => setDesign(true)}
          className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
          <Palette size={14} aria-hidden /><span className="hidden xl:inline">디자인</span>
        </button> : null}
        {isAdmin ? <button type="button" onClick={() => setPermissions(true)}
          className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
          <ShieldCheck size={14} aria-hidden />권한
        </button> : null}
        {isAdmin && rightTool ? <div className="ml-1 flex shrink-0 items-center">{rightTool}</div> : null}
      </header>
      <div data-print="surface" className={styles.workspace}>
        {isAdmin && side ? <div data-print="chrome" className={cn(styles.panel, 'border-r border-line bg-card')}>{side}</div> : null}
        <main data-print="surface" className={cn(styles.main, !flush && 'p-3 sm:p-6')}>
          {screenError ? <Banner tone="warning" className="mb-3">{screenError}</Banner> : null}
          {isAdmin ? children : <div className="mx-auto max-w-[1440px]">{children}</div>}
        </main>
        {isAdmin && right ? <div data-print="chrome" className={cn(styles.panel, 'border-l border-line')}>{right}</div> : null}
      </div>
      {isAdmin ? <AppDrawer open={drawer} onClose={() => setDrawer(false)} pane={drawerPane} onPaneChange={setDrawerPane} /> : null}
      {canViewApprovalFlow && drawerData?.approvalFlow ? (
        <ApprovalFlowDialog open={approvalFlow} flow={drawerData.approvalFlow} onClose={() => setApprovalFlow(false)} />
      ) : null}
      <DesignSystemDialog open={design} onClose={() => setDesign(false)} />
      <Dialog open={isAdmin && permissions} onClose={() => setPermissions(false)} title="권한" width={800}
        footer={<Button onClick={() => setPermissions(false)}>닫기</Button>}>
        <div className="max-h-[70dvh] overflow-y-auto"><PermissionMatrix me={me} /></div>
      </Dialog>
    </div>
  );
}
