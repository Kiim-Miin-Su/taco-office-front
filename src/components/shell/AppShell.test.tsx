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
import { AppShell, type DrawerEntry } from './AppShell';

const mocks = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), post: vi.fn(), drawer: vi.fn(), unwritten: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/board', useRouter: () => mocks }));
vi.mock('@/api/client', () => ({ api: { post: mocks.post }, setAccessToken: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useDrawer: mocks.drawer,
  useUnwritten: mocks.unwritten,
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
    expect(within(header).getAllByRole('link')).toHaveLength(11); // 오늘 전체 + 업무10개
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
    expect(view.getByRole('link', { name: '캘린더' })).toBeTruthy();
    expect(view.queryByRole('link', { name: '오늘 전체' })).toBeNull();
    expect(view.queryByRole('button', { name: '전체 화면' })).toBeNull();
    expect(view.queryByRole('button', { name: '권한' })).toBeNull();
    expect(view.queryByRole('button', { name: /결재 흐름/ })).toBeNull();
    expect(view.queryByRole('dialog', { name: '서랍' })).toBeNull();
    expect(mocks.drawer).toHaveBeenLastCalledWith(false);
    expect(mocks.unwritten).toHaveBeenLastCalledWith(undefined, false);
    expect(view.getByRole('img', { name: '티엔아카데미' })).toBeTruthy();
  });

  it('관리자에게 지정된 좌우 도구를 하나씩 렌더한다', () => {
    const view = shell({ sidePanel: <aside>일정 도구</aside>, rightPanel: <aside>일정 서랍</aside> });
    expect(view.getByText('일정 도구')).toBeTruthy();
    expect(view.getByText('일정 서랍')).toBeTruthy();
  });

  it('오늘 전체와 뒤로는 실제 이동 의도를 전달한다', () => {
    const today = vi.fn();
    const view = shell({ onToday: today });
    fireEvent.click(view.getByRole('button', { name: '오늘 전체' }));
    fireEvent.click(view.getByRole('button', { name: '뒤로' }));
    expect(today).toHaveBeenCalledOnce();
    expect(mocks.back).toHaveBeenCalledOnce();
  });

  it('상단 결재 흐름은 §75 읽기 모달을 열고 권한은 기존 상세 내용을 연다', () => {
    const view = shell();
    fireEvent.click(view.getByRole('button', { name: '결재 흐름 4' }));
    expect(view.getByRole('dialog', { name: '결재 흐름' })).toBeTruthy();
    expect(view.queryByRole('dialog', { name: '서랍' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '닫기' }));
    fireEvent.click(view.getByRole('button', { name: '권한' }));
    expect(view.getByRole('dialog', { name: '권한' })).toBeTruthy();
  });

  it('§75 배지는 approvalFlow.total을 쓰고 §14 inboxCount와 섞지 않는다', () => {
    const view = shell();
    expect(view.getByRole('button', { name: '결재 흐름 4' })).toBeTruthy();
    expect(view.queryByRole('button', { name: /결재 흐름 3/ })).toBeNull();
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
