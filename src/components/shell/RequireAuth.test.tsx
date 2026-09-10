/** @file-guide
 * 목적: RequireAuth.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSession } from '@/store/useSession';
import { api } from '@/api/client';
import type { Me } from '@/api/types';

const nav = vi.hoisted(() => ({ path: '/ops', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path, useRouter: () => ({ replace: nav.replace }) }));
import { RouteAccess } from './RequireAuth';
import { AdminTopNavigation } from './AdminNavigation';

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

const manager: Me = { ...teacher, role: 'manager', canAdminPage: true, canCrudAll: true, canMoney: true };
function visibleContent() {
  function Content() {
    const me = useSession((s) => s.me);
    return <><AdminTopNavigation pathname={nav.path} me={me} badges={{}} /><input aria-label="작성 중" defaultValue="draft" /><p>보호 본문</p></>;
  }
  return <Content />;
}
function serveMe(next: Me, gate: Promise<void> = Promise.resolve()) {
  const get = vi.fn(async (config) => {
    await gate;
    return { config, headers: {}, status: 200, statusText: 'OK', data: next };
  });
  api.defaults.adapter = get;
  return get;
}

it('캐시가 있어도 경로 전환은 최신 Me 확인 전에 새 페이지를 mount하지 않는다', async () => {
  nav.path = '/schedule'; useSession.getState().signIn('access', manager);
  const client = new QueryClient();
  let finish!: () => void;
  const get = serveMe(teacher, new Promise<void>((done) => { finish = done; }));
  const view = route(<p>기존 화면</p>, client);
  const Page = vi.fn(() => <p>새 관리 화면</p>);
  nav.path = '/ops';
  view.rerender(<QueryClientProvider client={client}><RouteAccess><Page /></RouteAccess></QueryClientProvider>);
  expect(Page).not.toHaveBeenCalled();
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  await act(async () => { finish(); });
  await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/schedule'));
  expect(Page).not.toHaveBeenCalled();
});

it('focus/online 동시 재확인은1GET이고 권한 변경 시 회계 탭·옛 캐시·폼을 함께 폐기한다', async () => {
  nav.path = '/ops'; useSession.getState().signIn('access', manager);
  const client = new QueryClient(); client.setQueryData(['sensitive'], 'old-cost');
  const get = serveMe({ ...manager, canMoney: false });
  const view = route(visibleContent(), client);
  expect(view.getByRole('link', { name: '회계' })).toBeTruthy();
  const input = view.getByRole('textbox', { name: '작성 중' });
  fireEvent.change(input, { target: { value: 'old draft' } });
  act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
  await waitFor(() => expect(view.queryByRole('link', { name: '회계' })).toBeNull());
  expect(get).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(['sensitive'])).toBeUndefined();
  expect(view.getByRole('textbox', { name: '작성 중' })).not.toBe(input);
});

it('같은 권한 재확인은 기존 cache·폼 DOM·입력과 Me 참조를 보존한다', async () => {
  nav.path = '/ops'; useSession.getState().signIn('access', manager);
  const client = new QueryClient(); client.setQueryData(['sensitive'], 'same-cost');
  const get = serveMe({ ...manager });
  const view = route(visibleContent(), client);
  const input = view.getByRole('textbox', { name: '작성 중' });
  fireEvent.change(input, { target: { value: 'keep draft' } });
  act(() => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(useSession.getState().me).toBe(manager);
  expect(client.getQueryData(['sensitive'])).toBe('same-cost');
  expect(view.getByRole('textbox', { name: '작성 중' })).toBe(input);
  expect((input as HTMLInputElement).value).toBe('keep draft');
});

it('권한 확인 통신 실패는 보호 본문을 닫고 기존 공용 버튼으로 재시도한다', async () => {
  nav.path = '/ops'; useSession.getState().signIn('access', manager);
  api.defaults.adapter = async (config) => { throw new AxiosError('offline', AxiosError.ERR_NETWORK, config); };
  const view = route(visibleContent());
  act(() => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(view.queryByText('보호 본문')).toBeNull());
  expect(useSession.getState().me).toBe(manager);
  serveMe(manager);
  fireEvent.click(view.getByRole('button', { name: '권한 다시 확인' }));
  await waitFor(() => expect(view.getByText('보호 본문')).toBeTruthy());
});

it('보호403은 재전송하지 않고 Me를 재검수하여 금지된 화면을 닫는다', async () => {
  nav.path = '/ops'; useSession.getState().signIn('access', manager);
  const calls: string[] = [];
  api.defaults.adapter = async (config) => {
    calls.push(config.url!);
    const res = { config, headers: {}, status: 200, statusText: 'OK', data: teacher };
    if (config.url !== '/auth/me') throw new AxiosError('forbidden', AxiosError.ERR_BAD_REQUEST, config, undefined, { ...res, status: 403 });
    return res;
  };
  const view = route(<p>보호 본문</p>);
  await act(async () => { await expect(api.get('/ops')).rejects.toMatchObject({ status: 403 }); });
  await waitFor(() => expect(view.queryByText('보호 본문')).toBeNull());
  expect(calls).toEqual(['/ops', '/auth/me']);
  expect(nav.replace).toHaveBeenLastCalledWith('/schedule');
});

it('권한 변경 시 같은 query key의 살아 있는 observer도 과거 응답을 버리고 재조회한다', async () => {
  nav.path = '/ops'; useSession.getState().signIn('access', manager);
  const client = new QueryClient(); client.setQueryData(['private'], '옛 비용');
  const load = vi.fn(async () => '현재 공개 범위');
  function Page() {
    const query = useQuery({ queryKey: ['private'], queryFn: load, staleTime: Infinity });
    return <p>{query.data}</p>;
  }
  const view = route(<Page />, client);
  expect(view.getByText('옛 비용')).toBeTruthy();
  serveMe({ ...manager, canMoney: false });
  act(() => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(view.getByText('현재 공개 범위')).toBeTruthy());
  expect(view.queryByText('옛 비용')).toBeNull();
  expect(load).toHaveBeenCalledTimes(1);
});
