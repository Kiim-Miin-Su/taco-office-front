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
import { AppShell } from './AppShell';

const mocks = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), post: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/board', useRouter: () => mocks }));
vi.mock('@/api/client', () => ({ api: { post: mocks.post }, setAccessToken: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useDrawer: () => ({ data: { approvals: { count: 3 }, notis: [{ read: false }] } }),
  useUnwritten: () => ({ data: { total: 2 } }),
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
  id: 1, name: '김민선', role: 'ceo', title: '대표', canAdminPage: true, canCrudAll: true,
  canMoney: true, canWage: true, canApprove: true, canSeeProfit: true, canHide: true,
  canCrudAttendance: true, canGpaPack: true,
};

function shell(extra: { sidePanel?: ReactNode; rightPanel?: ReactNode; onToday?: () => void } = {}) {
  return render(<QueryClientProvider client={new QueryClient()}>
    <AppShell {...extra}><h1>수업 현황판</h1></AppShell>
  </QueryClientProvider>);
}

beforeEach(() => {
  useSession.setState({ me, ready: true });
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

  it('승인 대기와 권한은 기존 상세 내용을 연다', () => {
    const view = shell();
    fireEvent.click(view.getByRole('button', { name: '승인 대기 3' }));
    expect(view.getByRole('dialog', { name: '서랍' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '권한' }));
    expect(view.getByRole('dialog', { name: '권한' })).toBeTruthy();
  });

  it('알림을 보다가 닫아도 승인 대기 버튼은 반드시 승인 pane을 연다', () => {
    const view = shell();
    fireEvent.click(view.getByRole('button', { name: '승인 대기 3' }));
    fireEvent.click(view.getByRole('button', { name: '알림' }));
    expect(view.getByText('notis')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '닫기' }));
    fireEvent.click(view.getByRole('button', { name: '승인 대기 3' }));
    expect(view.getByText('approvals')).toBeTruthy();
    expect(view.queryByText('notis')).toBeNull();
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
