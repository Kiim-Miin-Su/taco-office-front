/** @file-guide
 * 목적: AppShell.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { useWorkspace } from '@/store/useWorkspace';
import { AppShell, type DrawerEntry } from './AppShell';
import { WorkspaceRail } from './WorkspaceRail';

const mocks = vi.hoisted(() => ({
  pathname: '/board',
  back: vi.fn(), replace: vi.fn(), post: vi.fn(), drawer: vi.fn(), unwritten: vi.fn(),
  /** 상단바 되돌리기가 쓰는 쓰기 훅 (N-138 · C99) — 실제 요청은 useUndoLast 회귀가 본다 */
  scheduleWrite: vi.fn(),
  /** §76 권한 창의 서버 표(N-98) — 창이 열릴 때만 읽는다 */
  permissionTable: {
    roleLabel: '대표', possible: 14, locked: 0, sub: '지금 대표 화면입니다 · 14가지 가능 / 0가지 잠김',
    rows: [], roleNotes: ['대표 · 14가지 가능 / 0가지 잠김'],
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname, useRouter: () => mocks }));
vi.mock('@/api/client', () => ({ api: { post: mocks.post }, setAccessToken: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useDrawer: mocks.drawer,
  useUnwritten: mocks.unwritten,
  useScheduleWrite: mocks.scheduleWrite,
  // 상단바 되돌리기의 결재 갈래(N-84) — 실제 요청은 undo-c99 회귀가 본다
  useApprovalUndo: () => ({ mutate: vi.fn(), isPending: false }),
  usePermissionTable: (enabled: boolean) => ({ data: enabled ? mocks.permissionTable : undefined, isLoading: false, error: null }),
  // 강사 머리줄(GET /teacher/shell) — 이 파일은 셸 조립만 본다. 머리줄 값·알림은 TeacherShell.test 가 본다
  useTeacherShell: () => ({ data: undefined }),
  useTeacherNotiRead: () => ({ mutate: vi.fn(), isPending: false }),
  // 머리줄 「검색」·「보는 법」 창의 코드표 — 창이 열릴 때만 읽는다(여기서는 빈 코드표)
  useMeta: (enabled: boolean) => ({ data: enabled ? { students: [], kinds: [], subs: [] } : undefined }),
}));
vi.mock('@/components/drawer/AppDrawer', () => ({
  AppDrawer: ({ open, pane, onPaneChange, onClose }: {
    open: boolean; pane: string; onPaneChange: (p: string) => void; onClose: () => void;
  }) => open ? <div role="dialog" aria-label="서랍">
    <p>{pane}</p><button onClick={() => onPaneChange('notis')}>알림</button><button onClick={onClose}>닫기</button>
  </div> : null,
  DrawerButton: ({ onOpen }: { onOpen: () => void }) => <button onClick={onOpen}>서랍</button>,
}));

const me: Me = {
  id: 1, name: '김민선', role: 'ceo', roleLabel: '대표', title: '대표', canAdminPage: true, canCrudAll: true,
  canMoney: true, canWage: true, canApprove: true, canSeeProfit: true, canHide: true,
  canCrudAttendance: true, canGpaPack: true,
};

function shell(extra: { sidePanel?: ReactNode; rightPanel?: ReactNode; onToday?: () => void; drawerEntry?: DrawerEntry } = {}) {
  return render(<QueryClientProvider client={new QueryClient()}>
    <AppShell {...extra}><h1>수업 현황판</h1></AppShell>
  </QueryClientProvider>);
}

beforeEach(() => {
  mocks.pathname = '/board';
  useSession.setState({ me, ready: true });
  mocks.drawer.mockReturnValue({ data: {
    approvalFlow: {
      canView: true,
      tiles: [
        { kind: 'rpt', kindLabel: '대표 보고', to: 'ceo', toLabel: '대표에게', count: 0 },
        { kind: 'plan', kindLabel: '기획 결재', to: 'ceo', toLabel: '대표에게', count: 1 },
        { kind: 'req', kindLabel: '강사 요청', to: 'head', toLabel: '실장에게', count: 2 },
        { kind: 'chreq', kindLabel: '변경 요청', to: 'head', toLabel: '실장에게', count: 0 },
        { kind: 'gpapack', kindLabel: '자료 요청', to: 'head', toLabel: '실장에게', count: 1 },
      ],
      back: [], waiting: [], mine: [], total: 4, backCount: 0,
    },
    approvals: { count: 3, inboxCount: 3 }, notis: [{ read: false }],
  } });
  mocks.unwritten.mockReturnValue({ data: { total: 2 } });
  mocks.scheduleWrite.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useWorkspace.setState({ undoStack: [], railOpen: true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
});
afterEach(() => {
  cleanup(); useSession.setState({ me: null, ready: false }); vi.clearAllMocks(); vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'fullscreenElement');
  Reflect.deleteProperty(document, 'exitFullscreen');
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
});

describe('원본 관리자 공용 셸', () => {
  it('업무 탭 한 벌, wordmark, 페이지 전체 폭을 사용하며 반복 Sidebar를 만들지 않는다', () => {
    const view = shell();
    const header = view.getByRole('banner');
    expect(within(header).getAllByRole('navigation')).toHaveLength(1);
    expect(within(header).getAllByRole('link')).toHaveLength(13); // 오늘 전체 + 원문10·신규 학생/강사2
    expect(within(header).queryByRole('img', { name: '티엔아카데미' })).toBeNull();
    expect(view.queryByRole('complementary', { name: '관리자 메뉴' })).toBeNull();
    expect(view.getByRole('main').querySelector('[class*="max-w"]')).toBeNull();
    expect(header.className).toContain('bg-header');
  });

  it('페이지가 넘긴 도구만 조립하고 강사에게는 같은 prop도 마운트하지 않는다', () => {
    const panel = vi.fn(() => <aside>관리 도구</aside>);
    const Panel = panel;
    useSession.setState({ me: { ...me, canAdminPage: false } });
    const view = shell({ sidePanel: <Panel />, rightPanel: <Panel /> });
    expect(panel).not.toHaveBeenCalled();
    expect(view.queryByText('관리 도구')).toBeNull();
    expect(view.queryByRole('link', { name: '오늘 전체' })).toBeNull();
    expect(view.queryByRole('button', { name: '전체 화면' })).toBeNull();
    expect(view.queryByRole('button', { name: '권한' })).toBeNull();
    expect(view.queryByRole('button', { name: /승인 대기/ })).toBeNull();
    expect(view.queryByRole('dialog', { name: '서랍' })).toBeNull();
    expect(view.queryByRole('navigation', { name: '워크스페이스 바로가기' })).toBeNull();
    expect(view.queryByRole('button', { name: '바로가기 접기' })).toBeNull();
    expect(mocks.drawer).toHaveBeenLastCalledWith(false);
    expect(mocks.unwritten).toHaveBeenLastCalledWith(undefined, false);
    // 강사 머리줄은 Figma Teacher/Header — ☰ 로 여는 메뉴 패널이고, 관리자식 상단 탭·TN 마크는 없다
    const header = view.getByRole('banner');
    expect(header.className).toContain('bg-header');
    expect(within(header).queryByRole('link')).toBeNull();
    expect(view.queryByRole('img', { name: '티엔아카데미' })).toBeNull();
    expect(view.getByRole('main').querySelector('[class*="max-w"]')).toBeNull();
    fireEvent.click(within(header).getByRole('button', { name: '메뉴' }));
    const nav = view.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getByRole('link', { name: '캘린더' })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: '수업' })).toBeNull();
  });

  it('강사 로그아웃은 머리줄에 바로 서고 관리자와 같은 세션 정리를 거친다', async () => {
    useSession.setState({ me: { ...me, canAdminPage: false, role: 'teacher', roleLabel: '강사', title: null } });
    mocks.post.mockResolvedValue({});
    const view = shell();
    fireEvent.click(within(view.getByRole('banner')).getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
    expect(mocks.post).toHaveBeenCalledWith('/auth/logout');
  });

  it('관리자에게 지정된 좌우 도구를 하나씩 렌더한다', () => {
    const view = shell({ sidePanel: <aside>일정 도구</aside>, rightPanel: <aside>일정 서랍</aside> });
    expect(view.getByText('일정 도구')).toBeTruthy();
    expect(view.getByText('일정 서랍')).toBeTruthy();
    expect(view.queryByRole('navigation', { name: '워크스페이스 바로가기' })).toBeNull();
  });

  it('오늘 전체와 뒤로는 실제 이동 의도를 전달한다', () => {
    const today = vi.fn();
    const view = shell({ onToday: today });
    fireEvent.click(view.getByRole('button', { name: '오늘 전체' }));
    fireEvent.click(view.getByRole('button', { name: '뒤로' }));
    expect(today).toHaveBeenCalledOnce();
    expect(mocks.back).toHaveBeenCalledOnce();
  });

  it('상단 「승인 대기」는 §75 읽기 모달을 열고 권한은 기존 상세 내용을 연다', () => {
    const view = shell();
    fireEvent.click(view.getByRole('button', { name: '승인 대기 4' }));
    expect(view.getByRole('dialog', { name: '결재 흐름' })).toBeTruthy();
    expect(view.queryByRole('dialog', { name: '서랍' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '닫기' }));
    fireEvent.click(view.getByRole('button', { name: '권한' }));
    const permissions = view.getByRole('dialog', { name: '권한' });
    // §76 창은 폭 640 · 머리 × (76-3)
    expect(within(permissions).getByRole('button', { name: '창 닫기' })).toBeTruthy();
    expect(permissions.getAttribute('style') ?? '').toContain('640');
    // 부제는 창 머리에 — 서버 문장 그대로이고 표 위에 다시 적지 않는다 (W11 7-3 · N-98)
    const sub = within(permissions).getAllByText('지금 대표 화면입니다 · 14가지 가능 / 0가지 잠김');
    expect(sub).toHaveLength(1);
    expect(within(permissions).getByText('대표 · 14가지 가능 / 0가지 잠김').tagName).toBe('LI');
  });

  it('§75 배지는 approvalFlow.total을 쓰고 §14 inboxCount와 섞지 않는다', () => {
    const view = shell();
    expect(view.getByRole('button', { name: '승인 대기 4' })).toBeTruthy();
    expect(view.queryByRole('button', { name: /승인 대기 3/ })).toBeNull();
  });

  it('deep link entry는 새 조회 없이 기존 §14 서랍의 지정 pane을 연다', () => {
    const view = shell({ drawerEntry: { pane: 'chreqs', identity: 'change-request-52' } });
    expect(within(view.getByRole('dialog', { name: '서랍' })).getByText('chreqs')).toBeTruthy();
    expect(mocks.drawer.mock.calls.every(([enabled]) => enabled === true)).toBe(true);
  });

  it('전체 화면 진입과 외부 Esc 종료를 실제 fullscreen 상태에 맞춘다', async () => {
    const enter = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: enter });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
    const current = vi.spyOn(document, 'fullscreenElement', 'get').mockReturnValue(null);
    const view = shell();
    fireEvent.click(view.getByRole('button', { name: '전체 화면' }));
    expect(enter).toHaveBeenCalledOnce();
    current.mockReturnValue(document.documentElement);
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    fireEvent.click(view.getByRole('button', { name: '전체 화면 종료' }));
    expect(exit).toHaveBeenCalledOnce();
    current.mockReturnValue(null);
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(view.getByRole('button', { name: '전체 화면' })).toBeTruthy();
  });

  it('전체 화면 실패를 성공 표시하지 않는다', async () => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true,
      value: vi.fn().mockRejectedValue(new Error('unsupported')) });
    const view = shell();
    fireEvent.click(view.getByRole('button', { name: '전체 화면' }));
    await waitFor(() => expect(view.getByText(/이 브라우저에서 전체 화면을 열 수 없습니다/)).toBeTruthy());
    expect(view.queryByRole('button', { name: '전체 화면 종료' })).toBeNull();
  });
});

describe('UX-15 모든 관리자 업무 탭의 공통 우측 레일', () => {
  it.each(['/schedule', '/students', '/staff', '/board', '/intake', '/consulting', '/books', '/guides', '/reports', '/accounting', '/ops', '/exec', '/gpa', '/programs', '/zoom', '/phrases', '/permissions'])('%s에서도 같은 레일·서버 배지·서랍 진입을 제공한다', (pathname) => {
    mocks.pathname = pathname;
    const view = shell();
    const rail = view.getByRole('navigation', { name: '워크스페이스 바로가기' });
    expect(view.getAllByRole('navigation', { name: '워크스페이스 바로가기' })).toHaveLength(1);
    expect(within(within(rail).getByRole('button', { name: '승인 대기함' })).getByText('3')).toBeTruthy();
    expect(within(within(rail).getByRole('button', { name: '알림' })).getByText('1')).toBeTruthy();
    fireEvent.click(within(rail).getByRole('button', { name: '할 일' }));
    expect(within(view.getByRole('dialog', { name: '서랍' })).getByText('todos')).toBeTruthy();
    expect(within(rail).getByRole('button', { name: '할 일' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('접힘은 페이지 재마운트 뒤에도 유지되고 펼치기 진입점은 남는다', () => {
    const first = shell();
    const close = first.getByRole('button', { name: '바로가기 접기' });
    expect(close.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(close);
    expect(useWorkspace.getState().railOpen).toBe(false);
    expect(first.queryByRole('navigation', { name: '워크스페이스 바로가기' })).toBeNull();
    first.unmount();
    mocks.pathname = '/accounting';
    const next = shell();
    const open = next.getByRole('button', { name: '바로가기 펼치기' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(next.queryByRole('navigation', { name: '워크스페이스 바로가기' })).toBeNull();
    fireEvent.click(open);
    expect(useWorkspace.getState().railOpen).toBe(true);
    expect(next.getByRole('navigation', { name: '워크스페이스 바로가기' })).toBeTruthy();
  });

  it('레일을 접어도 열어 둔 서랍을 닫거나 재마운트하지 않는다', () => {
    const view = shell();
    fireEvent.click(within(view.getByRole('navigation', { name: '워크스페이스 바로가기' })).getByRole('button', { name: '변경 요청' }));
    const drawer = view.getByRole('dialog', { name: '서랍' });
    fireEvent.click(view.getByRole('button', { name: '바로가기 접기' }));
    expect(view.getByRole('dialog', { name: '서랍' })).toBe(drawer);
    expect(within(drawer).getByText('chreqs')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '바로가기 펼치기' }));
    expect(view.getByRole('dialog', { name: '서랍' })).toBe(drawer);
  });

  it('스케줄의 기존 명시 패널·토글은 한 벌만 사용하고 접을 때 기본 레일을 추가하지 않는다', () => {
    function ScheduleSlots() {
      const railOpen = useWorkspace((s) => s.railOpen);
      const toggleRail = useWorkspace((s) => s.toggleRail);
      return <AppShell
        rightTool={<button onClick={toggleRail}>기존 스케줄 토글</button>}
        rightPanel={railOpen ? ({ openDrawer, activePane }) => <WorkspaceRail approvals={3} unread={1} onOpen={openDrawer} activePane={activePane} /> : undefined}
      ><p>기존 스케줄</p></AppShell>;
    }
    const view = render(<QueryClientProvider client={new QueryClient()}><ScheduleSlots /></QueryClientProvider>);
    expect(view.getAllByRole('navigation', { name: '워크스페이스 바로가기' })).toHaveLength(1);
    expect(view.queryByRole('button', { name: '바로가기 접기' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '기존 스케줄 토글' }));
    expect(view.queryByRole('navigation', { name: '워크스페이스 바로가기' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '기존 스케줄 토글' }));
    expect(view.getAllByRole('navigation', { name: '워크스페이스 바로가기' })).toHaveLength(1);
  });
});

describe('원문 머리줄 차례 — 검색 ⌘K · 전체 화면 · 디자인 · 보는 법 | 승인 대기 · 사용자 · 권한 (g1 S1·S2)', () => {
  it('단추 차례가 §07 컷과 같다', () => {
    const view = shell();
    const header = view.getByRole('banner');
    const names = within(header).getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent?.replace(/\s+/g, ' ').trim())
      .filter((name) => ['검색', '전체 화면', '디자인', '보는 법', '승인 대기 4', '권한'].includes(name ?? ''));
    expect(names).toEqual(['검색', '전체 화면', '디자인', '보는 법', '승인 대기 4', '권한']);
  });

  it('「검색」 단추와 ⌘K·Ctrl+K 가 같은 창을 열고, 「보는 법」은 범례 창을 연다', () => {
    const view = shell();
    fireEvent.click(within(view.getByRole('banner')).getByRole('button', { name: /검색/ }));
    expect(view.getByRole('dialog', { name: '검색' })).toBeTruthy();
    cleanup();
    const again = shell();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(again.getByRole('dialog', { name: '검색' })).toBeTruthy();
    cleanup();
    const third = shell();
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    expect(third.getByRole('dialog', { name: '검색' })).toBeTruthy();
    fireEvent.click(within(third.getByRole('banner')).getByRole('button', { name: /보는 법/ }));
    const guide = third.getByRole('dialog', { name: '보는 법' });
    expect(within(guide).getByRole('group', { name: '시간표 범례' })).toBeTruthy();
  });

  it('강사에게는 검색 단축키가 창을 열지 않는다(강사 머리줄에는 검색이 없다)', () => {
    useSession.setState({ me: { ...me, canAdminPage: false }, ready: true });
    const view = shell();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(view.queryByRole('dialog', { name: '검색' })).toBeNull();
  });
});

describe('U1 워크스페이스 셸 확장 — 헤더 도구와 함수형 패널', () => {
  it('leftTool/rightTool을 관리자 헤더 양끝에만 렌더하고 강사에게는 마운트하지 않는다', () => {
    const view = render(<QueryClientProvider client={new QueryClient()}>
      <AppShell leftTool={<button>☰ 토글</button>} rightTool={<button>» 토글</button>}><h1>본문</h1></AppShell>
    </QueryClientProvider>);
    expect(view.getByRole('button', { name: '☰ 토글' })).toBeTruthy();
    expect(view.getByRole('button', { name: '» 토글' })).toBeTruthy();
    cleanup();
    useSession.setState({ me: { ...me, canAdminPage: false, role: 'teacher' }, ready: true });
    const teacher = render(<QueryClientProvider client={new QueryClient()}>
      <AppShell leftTool={<button>☰ 토글</button>} rightTool={<button>» 토글</button>}><h1>본문</h1></AppShell>
    </QueryClientProvider>);
    expect(teacher.queryByRole('button', { name: '☰ 토글' })).toBeNull();
    expect(teacher.queryByRole('button', { name: '» 토글' })).toBeNull();
  });

  it('함수형 패널은 openDrawer를 받아 전역 서랍을 지정 pane으로 연다 — 서랍 상태는 셸 소유 그대로', () => {
    const view = render(<QueryClientProvider client={new QueryClient()}>
      <AppShell
        sidePanel={({ openDrawer }) => <button onClick={() => openDrawer('chreqs')}>이력 열기</button>}
        rightPanel={({ openDrawer }) => <button onClick={() => openDrawer('zoom')}>줌 열기</button>}
      ><h1>본문</h1></AppShell>
    </QueryClientProvider>);
    fireEvent.click(view.getByRole('button', { name: '줌 열기' }));
    const dialog = view.getByRole('dialog', { name: '서랍' });
    expect(within(dialog).getByText('zoom')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    fireEvent.click(view.getByRole('button', { name: '이력 열기' }));
    expect(within(view.getByRole('dialog', { name: '서랍' })).getByText('chreqs')).toBeTruthy();
  });
});

/**
 * g2 대조 C-1 · C-2 — 탭 02 서랍은 **머리줄 아래 · 오른쪽 레일 왼쪽** 칸에 붙고, 레일은 지금 열린 칸을 안다.
 * 전에는 서랍이 화면 전체(fixed inset-0)를 덮어 레일을 누를 수 없었다(실측 2초 타임아웃).
 * jsdom 은 눌림 판정을 하지 않으므로 **자리(DOM 구조)** 로 확인한다 — 실제 클릭은 실브라우저 QA 가 본다.
 */
describe('g2 서랍 자리 · 레일 활성 칸', () => {
  function withRail() {
    const seen: Array<string | null> = [];
    const view = render(<QueryClientProvider client={new QueryClient()}>
      <AppShell
        rightPanel={({ openDrawer, activePane }) => {
          seen.push(activePane);
          return (
            <nav aria-label="워크스페이스 바로가기">
              <button onClick={() => openDrawer('notis')}>레일 알림</button>
              <button onClick={() => openDrawer('approvals')}>레일 승인</button>
            </nav>
          );
        }}
      ><h1>본문</h1></AppShell>
    </QueryClientProvider>);
    return { view, seen };
  }

  it('레일은 서랍이 닫혀 있으면 null, 열리면 그 칸, 닫히면 다시 null 을 받는다', () => {
    const { view, seen } = withRail();
    expect(seen.at(-1)).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '레일 알림' }));
    expect(seen.at(-1)).toBe('notis');
    // 서랍이 열린 채로 레일을 다시 눌러 칸을 바꾼다 — 레일이 덮이지 않는다
    fireEvent.click(view.getByRole('button', { name: '레일 승인' }));
    expect(seen.at(-1)).toBe('approvals');
    fireEvent.click(within(view.getByRole('dialog', { name: '서랍' })).getByRole('button', { name: '닫기' }));
    expect(seen.at(-1)).toBeNull();
  });

  it('서랍은 본문 칸 안에 붙는다 — 머리줄과 레일은 그 칸 밖이라 늘 보이고 눌린다', () => {
    const { view } = withRail();
    fireEvent.click(view.getByRole('button', { name: '레일 알림' }));
    const drawer = view.getByRole('dialog', { name: '서랍' });
    const stage = drawer.parentElement!;
    expect(stage.className).toContain('relative');
    expect(stage.contains(view.getByRole('main'))).toBe(true);
    expect(stage.contains(view.getByRole('banner'))).toBe(false);
    expect(stage.contains(view.getByRole('navigation', { name: '워크스페이스 바로가기' }))).toBe(false);
  });
});
