/** @file-guide
 * 목적: RequireAuth.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSession } from '@/store/useSession';
import { api } from '@/api/client';
import type { Me } from '@/api/types';

const nav = vi.hoisted(() => ({ path: '/ops', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path, useRouter: () => ({ replace: nav.replace }) }));
import { RouteAccess } from './RequireAuth';

const teacher: Me = {
  id: 5, name: '강사', role: 'teacher', title: null, canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false,
  canApprove: false, canHide: false, canGpaPack: false,
};
const originalAdapter = api.defaults.adapter;
afterEach(() => {
  cleanup(); useSession.getState().signOut(); useSession.setState({ ready: false });
  api.defaults.adapter = originalAdapter; vi.clearAllMocks();
});
function route(children: ReactNode, client = new QueryClient()) {
  return render(<QueryClientProvider client={client}><RouteAccess>{children}</RouteAccess></QueryClientProvider>);
}

it('금지 route의 페이지 hook을 mount하기 전에 차단한다', () => {
  const renderPage = vi.fn(() => <div>관리 데이터</div>);
  useSession.setState({ me: teacher, ready: true });
  nav.path = '/ops';
  const Page = renderPage;
  const view = route(<Page />);
  expect(renderPage).not.toHaveBeenCalled();
  expect(view.container.childElementCount).toBe(0);
  expect(nav.replace).toHaveBeenCalledWith('/schedule');
});

it('로그아웃 상태에서도 로그인 페이지를 차단하지 않는다', () => {
  useSession.setState({ me: null, ready: true });
  nav.path = '/login';
  const view = route(<div>로그인 폼</div>);
  expect(view.getByText('로그인 폼')).toBeTruthy();
  expect(nav.replace).not.toHaveBeenCalled();
});

it('권한이 제거되면 열린 페이지도 즉시 unmount한다', () => {
  useSession.setState({ me: { ...teacher, canAdminPage: true, canCrudAll: true }, ready: true });
  nav.path = '/ops';
  const view = route(<div>운영 내용</div>);
  expect(view.getByText('운영 내용')).toBeTruthy();
  act(() => useSession.setState({ me: teacher }));
  expect(view.queryByText('운영 내용')).toBeNull();
  expect(nav.replace).toHaveBeenCalledWith('/schedule');
});

it.each(['refresh rejected', 'retry rejected'] as const)('최종401은 화면과 사용자 캐시를 함께 폐기한다: %s', async (mode) => {
  nav.path = '/schedule';
  useSession.getState().signIn('test-access', teacher);
  const client = new QueryClient();
  client.setQueryData(['meta', 'viewer', teacher.id], { private: 'old student list' });
  const view = route(<div>보호된 수업 내용</div>, client);
  let calls = 0;
  api.defaults.adapter = async (config) => {
    calls += 1;
    const res = { config, headers: {}, status: 401, statusText: '401', data: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다' } };
    if (config.url === '/auth/refresh' && mode === 'retry rejected') {
      return { ...res, status: 201, data: { accessToken: 'renewed' } };
    }
    throw new AxiosError('unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined, res);
  };
  await act(async () => { await expect(api.get('/meta')).rejects.toMatchObject({ status: 401 }); });
  expect(useSession.getState().me).toBeNull();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(view.queryByText('보호된 수업 내용')).toBeNull();
  expect(nav.replace).toHaveBeenCalledWith('/login');
  expect(calls).toBe(mode === 'refresh rejected' ? 2 : 3);
});
