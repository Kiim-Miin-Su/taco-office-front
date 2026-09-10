/** @file-guide
 * 목적: RequireAuth.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSession } from '@/store/useSession';
import type { Me } from '@/api/types';

const nav = vi.hoisted(() => ({ path: '/ops', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path, useRouter: () => ({ replace: nav.replace }) }));
import { RouteAccess } from './RequireAuth';

const teacher: Me = {
  id: 5, name: '강사', role: 'teacher', title: null, canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false,
  canApprove: false, canHide: false, canGpaPack: false,
};
afterEach(() => { cleanup(); useSession.setState({ me: null, ready: false }); vi.clearAllMocks(); });

it('금지 route의 페이지 hook을 mount하기 전에 차단한다', () => {
  const renderPage = vi.fn(() => <div>관리 데이터</div>);
  useSession.setState({ me: teacher, ready: true });
  nav.path = '/ops';
  const Page = renderPage;
  const view = render(<RouteAccess><Page /></RouteAccess>);
  expect(renderPage).not.toHaveBeenCalled();
  expect(view.container.childElementCount).toBe(0);
  expect(nav.replace).toHaveBeenCalledWith('/schedule');
});

it('로그아웃 상태에서도 로그인 페이지를 차단하지 않는다', () => {
  useSession.setState({ me: null, ready: true });
  nav.path = '/login';
  const view = render(<RouteAccess><div>로그인 폼</div></RouteAccess>);
  expect(view.getByText('로그인 폼')).toBeTruthy();
  expect(nav.replace).not.toHaveBeenCalled();
});

it('권한이 제거되면 열린 페이지도 즉시 unmount한다', () => {
  useSession.setState({ me: { ...teacher, canAdminPage: true, canCrudAll: true }, ready: true });
  nav.path = '/ops';
  const view = render(<RouteAccess><div>운영 내용</div></RouteAccess>);
  expect(view.getByText('운영 내용')).toBeTruthy();
  act(() => useSession.setState({ me: teacher }));
  view.rerender(<RouteAccess><div>운영 내용</div></RouteAccess>);
  expect(view.queryByText('운영 내용')).toBeNull();
  expect(nav.replace).toHaveBeenCalledWith('/schedule');
});
