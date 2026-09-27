/** @file-guide
 * 목적: AppShell.tsx — WorkspacePanelApi, AppShell (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 인증된 업무 화면의 공용 셸. 메뉴/본문은 권한과 역할별 명세에 따라 조립한다.
 * 관리자: 업무 탭은 상단 한 벌. 원본의 도메인별 좌우 패널은 해당 페이지가 소유한다.
 * 강사(canAdminPage 아님): components/teacher/TeacherShell — ☰ 머리줄 + 메뉴 패널 (강사 덱 · Figma).
 */
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, CircleHelp, Home, Maximize, Minimize, Palette, Search, ShieldCheck } from 'lucide-react';
import { DesignSystemDialog } from '@/components/design/DesignSystemDialog';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/store/useSession';
import { api } from '@/api/client';
import { clearSessionQueries } from '@/api/session-cache';
import { useDrawer, usePermissionTable, useUnwritten } from '@/api/queries';
import { AppDrawer, type DrawerPane } from '@/components/drawer/AppDrawer';
import { ApprovalFlowDialog } from '@/components/approval/ApprovalFlowDialog';
import { autosaveTimeLabel, useLastAutosave } from '@/lib/autosave';

/**
 * 페이지 소유 패널이 전역 서랍을 열 때 쓰는 최소 API — 서랍 상태는 셸이 계속 소유한다.
 * `activePane` 은 **지금 열린 칸**(닫혀 있으면 null)이다 — 오른쪽 레일이 그 칸을 채운 타일로 보인다 (g2 C-2).
 */
export type WorkspacePanelApi = { openDrawer: (pane: DrawerPane) => void; activePane: DrawerPane | null };
export type DrawerEntry = { pane: DrawerPane; identity: string };
type PanelSlot = ReactNode | ((api: WorkspacePanelApi) => ReactNode);
import { Banner, Button, Dialog, Logo, cn } from '@/components/ui';
import { PermissionMatrix } from '@/components/data/PermissionMatrix';
import { TeacherShell } from '@/components/teacher/TeacherShell';
import { AdminTopNavigation, type AdminNavBadges } from './AdminNavigation';
import { ShellGuide } from './ShellGuide';
import { ShellSearch } from './ShellSearch';
import { UndoControl } from './UndoControl';
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
  // §76 표 · 부제 · 역할 설명은 서버가 만든다(N-98) — 창을 열 때만 읽는다
  const permissionTable = usePermissionTable(isAdmin && permissions);
  /** §85·§86 — 원문에서 이것은 라우트가 아니라 머리의 「디자인」이 여는 창이다 (C60) */
  const [design, setDesign] = useState(false);
  /* 원문 머리줄 「검색 ⌘K」·「보는 법」(g1 S1·S2) — 둘 다 창이고 라우트가 아니다 */
  const [search, setSearch] = useState(false);
  const [guide, setGuide] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const openDrawer = (pane: DrawerPane) => { setDrawerPane(pane); setDrawer(true); };
  const panelApi: WorkspacePanelApi = { openDrawer, activePane: drawer ? drawerPane : null };
  const side = typeof sidePanel === 'function' ? sidePanel(panelApi) : sidePanel;
  const right = typeof rightPanel === 'function' ? rightPanel(panelApi) : rightPanel;

  useEffect(() => {
    // ⌘K / Ctrl+K — 원문 단추의 글자 그대로. 관리 화면에서만(강사 머리줄에는 검색이 없다)
    if (!isAdmin) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdmin]);

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

  /** 원문 머리줄 「자동 저장됨 · —」(g1 S3) — N-69: 쓰던 글을 이 브라우저에 마지막으로 남긴 시각(서버 저장이 아니다) */
  const lastAutosave = useLastAutosave();
  const autosaveText = `자동 저장됨 · ${autosaveTimeLabel(lastAutosave)}`;
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
      {isAdmin ? <>
        <header data-print="chrome" className={cn(styles.header, 'border-b border-header-line bg-header')}>
          {leftTool ? <div className="mr-1 flex shrink-0 items-center">{leftTool}</div> : null}
          <Logo size={26} withMark={false} onDark className="mr-auto shrink-0 sm:mr-3" />
          <div className="flex shrink-0 items-center gap-2 border-header-line sm:border-x sm:px-3">
            {onToday ? <button type="button" onClick={onToday} className="flex h-[30px] items-center gap-1 rounded-md bg-header-home px-3 text-[12px] font-bold text-white">
              <Home size={14} aria-hidden />오늘 전체
            </button> : <a href="/schedule" className="flex h-[30px] items-center gap-1 rounded-md bg-header-home px-3 text-[12px] font-bold text-white">
              <Home size={14} aria-hidden />오늘 전체
            </a>}
            <button type="button" onClick={() => router.back()} className="flex h-[30px] items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
              <ArrowLeft size={14} aria-hidden />뒤로
            </button>
            {/* 원본 §16 상단바 세 번째 단추 「⟲ 되돌리기 ▾」 — 여러 단계 목록까지 한 파일(UndoControl)에 모았다 (g1 S5) */}
            <UndoControl onFail={setScreenError} />
          </div>
          <AdminTopNavigation pathname={path} badges={badges} me={me} />
          {/*
            원문 머리줄 차례: 검색 ⌘K · 전체 화면 · 디자인 · 보는 법 | 승인 대기 · 사용자 · 권한 (g1 S1·S2 · §07 컷).
            원문은 1920 폭이다 — 글자를 다 적으면 1536 이하에서 업무 탭 10개(521px)가 가려진다(QA 0926 B-1 · 1440 에서 313px).
            그래서 1680 미만에서는 도구 단추를 아이콘만 두고(이름은 aria-label · title 로 남긴다) 탭 자리를 먼저 준다.
          */}
          <button type="button" onClick={() => setSearch(true)} aria-haspopup="dialog" aria-label="검색" aria-keyshortcuts="Meta+K Control+K" title="검색 (⌘K)"
            className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
            <Search size={14} aria-hidden /><span className="hidden min-[1680px]:inline">검색</span>
            <kbd aria-hidden className="ml-1 hidden rounded border border-header-tool-line px-1 text-[10px] font-medium min-[1680px]:inline">⌘K</kbd>
          </button>
          <button type="button" onClick={() => void toggleFullScreen()} aria-label={fullScreen ? '전체 화면 종료' : '전체 화면'}
            title={fullScreen ? '전체 화면 종료' : '전체 화면'}
            className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
            {fullScreen ? <Minimize size={14} aria-hidden /> : <Maximize size={14} aria-hidden />}
            <span className="hidden min-[1680px]:inline">{fullScreen ? '전체 화면 종료' : '전체 화면'}</span>
          </button>
          <button type="button" onClick={() => setDesign(true)} aria-label="디자인" title="디자인"
            className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
            <Palette size={14} aria-hidden /><span className="hidden min-[1680px]:inline">디자인</span>
          </button>
          <button type="button" onClick={() => setGuide(true)} aria-haspopup="dialog" aria-label="보는 법" title="보는 법"
            className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
            <CircleHelp size={14} aria-hidden /><span className="hidden min-[1680px]:inline">보는 법</span>
          </button>
          {/* 「보는 법 | 자동 저장됨 · —」(원문 차례 · 세로 줄 뒤 초록 글자 · 단추가 아니다). 어두운 머리 바탕 대비 때문에
              초록 토큰을 흰색과 섞어 밝힌다(승인 대기 글자를 흰색으로 둔 것과 같은 까닭). 1680 미만은 시각만 보이고 앞 낱말은 읽기 글 · title.
              **1536 미만에서는 세우지 않는다** — 업무 탭 자리를 먼저 준다(B-1 · B-1r 과 같은 규칙). 이 칸(「—」 25px · 시각이면 더 넓다)이
              W11 에 머리줄에 들어오며 스케줄 1366 에서 업무 탭 10개(521px)가 다시 넘쳐 「대표 보고」가 가려졌다(W11 실브라우저 QA · nav 500 < 521).
              쓰던 글을 되살리는 알림은 각 편집 화면의 띠(「쓰던 글을 불러왔습니다」)가 그대로 말한다 */}
          <span data-testid="autosave-status" title={autosaveText}
            className="hidden h-[30px] shrink-0 whitespace-nowrap border-l border-header-line pl-3 text-[12px] font-bold leading-[30px] text-[color:color-mix(in_srgb,var(--green)_45%,white)] min-[1536px]:block">
            <span className="sr-only min-[1680px]:not-sr-only">자동 저장됨 · </span>{autosaveTimeLabel(lastAutosave)}
          </span>
          {canViewApprovalFlow ?<button type="button" onClick={() => setApprovalFlow(true)} aria-haspopup="dialog"
            aria-label={`승인 대기 ${approvalCount}`} title={`승인 대기 ${approvalCount}`}
            className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-amber bg-header-approval px-2.5 text-[12px] font-bold text-white">
            {/* 원문 머리 단추는 「● 승인 대기 N」이다(g2 75-1). 글자는 어두운 바탕 대비 때문에 흰색 그대로 둔다(tokens.test).
                1536 미만에서는 「● N」만 — 업무 탭 자리를 먼저 준다(QA 0926 B-1 · 스케줄은 머리 양끝에 패널 단추 둘이 더 선다 B-1r) */}
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber ring-1 ring-white/60" /><span aria-hidden className="hidden min-[1536px]:inline">승인 대기 </span><span aria-hidden className="rounded bg-white/15 px-1.5">{approvalCount}</span>
          </button> : null}
          <details className="relative shrink-0 text-[11px] text-line-2 sm:ml-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1" aria-label="내 계정"
              title={me ? `${me.name} · ${me.title || me.roleLabel}` : undefined}>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-white">{me?.name.slice(0, 2)}</span>
              {/* 1680 미만은 이름 대신 동그라미 첫 두 글자 · 1440 미만은 역할 칩도 접는다(마우스를 올리면 title 로 둘 다) —
                  업무 탭 자리를 먼저 준다(QA 0926 B-1 · B-1r) */}
              <span className="hidden min-[1680px]:inline">{me?.name}</span>
              {/* 역할의 낱말도 서버가 만든다 — 화면이 제 표를 들면 서랍 §17 과 여기가 갈린다 (D-R18) */}
              {me ? <span className="hidden rounded bg-header-tool px-1.5 py-0.5 text-[10px] min-[1440px]:inline">{me.title || me.roleLabel}</span> : null}
            </summary>
            <div className="absolute right-0 top-full z-30 mt-1 min-w-28 rounded-md border border-line bg-card p-1 text-fg shadow-lg">
              <button type="button" onClick={out} className="w-full rounded px-3 py-2 text-left font-bold hover:bg-inset">로그아웃</button>
            </div>
          </details>
          <button type="button" onClick={() => setPermissions(true)}
            className="flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-header-tool-line bg-header-tool px-2.5 text-[12px] font-bold text-line-2">
            <ShieldCheck size={14} aria-hidden />권한
          </button>
          {rightTool ? <div className="ml-1 flex shrink-0 items-center">{rightTool}</div> : null}
        </header>
        <div data-print="surface" className={styles.workspace}>
          {side ? <div data-print="chrome" className={cn(styles.panel, 'border-r border-line bg-card')}>{side}</div> : null}
          {/*
            본문 칸 — 탭 02 서랍이 붙는 자리다. 원문 서랍은 **머리줄 아래 · 오른쪽 레일 왼쪽**에 붙고
            머리줄·레일은 늘 보이고 눌린다(g2 대조 C-1 · 서랍이 레일을 덮어 레일 클릭이 막히던 실측).
            그래서 서랍은 화면 전체가 아니라 이 칸(위치 잡힌 조상)을 채운다 — 좌우 패널은 이 칸 밖이다.
          */}
          <div data-print="surface" className="relative flex min-h-0 min-w-0 flex-1">
            <main data-print="surface" className={cn(styles.main, !flush && 'p-3 sm:p-6')}>
              {screenError ? <Banner tone="warning" className="mb-3">{screenError}</Banner> : null}
              {children}
            </main>
            <AppDrawer open={drawer} onClose={() => setDrawer(false)} pane={drawerPane} onPaneChange={setDrawerPane} />
          </div>
          {right ? <div data-print="chrome" className={cn(styles.panel, 'border-l border-line')}>{right}</div> : null}
        </div>
      </> : (
        /*
          강사 표면 — 강사 덱 · Figma 「현재 · 강사 웹」(7676:21759)·「현재 · 모바일」(7615:1605) 그대로
          Teacher/Header(☰) + 메뉴 패널이다. 관리자 머리줄·업무 탭·서랍·좌우 패널은 조립하지 않는다(받은 prop 도 그리지 않는다).
          본문은 전폭이고 여백은 모바일 8 · 웹 16 (Figma Content viewport — 캘린더·홈 모바일 8, 웹 대부분 16).
          되돌리기·전체 화면이 없으니 셸 오류 띠(screenError)도 강사에게는 생기지 않는다.
        */
        <TeacherShell pathname={path} me={me} onLogout={out}>
          <main data-print="surface" className={cn(styles.main, !flush && 'p-2 sm:p-4')}>{children}</main>
        </TeacherShell>
      )}
      {canViewApprovalFlow && drawerData?.approvalFlow ? (
        <ApprovalFlowDialog open={approvalFlow} flow={drawerData.approvalFlow} onClose={() => setApprovalFlow(false)} />
      ) : null}
      <DesignSystemDialog open={design} onClose={() => setDesign(false)} />
      {isAdmin ? <ShellSearch open={search} onClose={() => setSearch(false)} me={me} /> : null}
      {isAdmin ? <ShellGuide open={guide} onClose={() => setGuide(false)} /> : null}
      {/* 원문 §76 창 = 폭 640(§75 와 같다) · 머리 오른쪽 × (76-3) · 부제는 창 머리에(「지금 ○○ 화면입니다 · …」 — 서버 문장 · W11 7-3) */}
      <Dialog open={isAdmin && permissions} onClose={() => setPermissions(false)} title="권한" width={640} closeX
        sub={permissionTable.data?.sub}
        footer={<Button onClick={() => setPermissions(false)}>닫기</Button>}>
        <div className="max-h-[70dvh] overflow-y-auto">
          <PermissionMatrix table={permissionTable.data} loading={permissionTable.isLoading} error={permissionTable.error} />
        </div>
      </Dialog>
    </div>
  );
}
