/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { Profiler, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me, Ops } from '@/api/types';
import { useSession } from '@/store/useSession';
import OpsPage from './page';

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 4, name: '대표', role: 'ceo', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};
const response: Ops = {
  leads: [], complaints: [], todos: [], plans: [], meetings: [], suggestions: [], canSeeAmounts: true,
  marketing: [{ id: 1, channel: '검수 채널', item: '광고', impressions: 3000, inquiries: 12, enrolled: 2,
    cost: 246800, costPerEnroll: 123400 }],
};
const clients: QueryClient[] = [];
function setup(viewer = me) {
  useSession.setState({ me: viewer, ready: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const commits = vi.fn();
  const view = render(<QueryClientProvider client={client}>
    <Profiler id="ops" onRender={commits}><OpsPage /></Profiler>
  </QueryClientProvider>);
  fireEvent.click(view.getByRole('button', { name: /마케팅/ }));
  return { ...view, client, commits };
}
function expectHidden(view: ReturnType<typeof setup>) {
  expect(view.queryByText('246,800원')).toBeNull();
  expect(view.queryByText('123,400원')).toBeNull();
  expect(view.getAllByText('가려짐')).toHaveLength(2);
  expect(view.getByText('검수 채널')).toBeTruthy();
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  vi.restoreAllMocks();
});

describe('운영 금액 — 현재 Me와 서버 공개 범위의 교집합', () => {
  it('현재 canMoney=false이면 과거 권한의 응답도 금액 없이 소비한다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup({ ...me, canMoney: false });
    await waitFor(() => expect(view.getByText('검수 채널')).toBeTruthy());
    expectHidden(view);
    const cached = view.client.getQueryCache().getAll()[0].state.data as Ops;
    expect(cached.marketing[0]).toMatchObject({ cost: null, costPerEnroll: null, impressions: 3000 });
    expect(cached.canSeeAmounts).toBe(false);
    expect(response.marketing[0].cost).toBe(246800); // 응답 객체를 직접 변형하지 않는다.
  });

  it('서버 canSeeAmounts=false이면 값이 잘못 포함돼도 다시 공개하지 않는다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response, canSeeAmounts: false } });
    const view = setup();
    await waitFor(() => expect(view.getByText('검수 채널')).toBeTruthy());
    expectHidden(view);
  });

  it('역할명이 아니라 최종 canMoney=true인 매니저에게 허용된 값을 표시한다', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup({ ...me, role: 'manager', canSeeProfit: false });
    await waitFor(() => expect(view.getByText('246,800원')).toBeTruthy());
    expect(view.getByText('123,400원')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '할 일 0' }));
    fireEvent.click(view.getByRole('button', { name: '마케팅 1' }));
    expect(get.mock.calls).toEqual([['/ops']]);
  });

  it('허용된 0원과 등록이 없어 계산할 수 없는 null을 구분한다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: {
      ...response, marketing: [{ ...response.marketing[0], cost: 0, costPerEnroll: null, enrolled: 0 }],
    } });
    const view = setup();
    await waitFor(() => expect(view.getByText('0원')).toBeTruthy());
    expect(view.queryByText('가려짐')).toBeNull();
    expect(view.getByText('—')).toBeTruthy();
  });

  it('같은 사용자 권한 회수 직후 기존 비용을 숨기고 새 응답도 비공개로 유지한다', async () => {
    let resolve!: (value: { data: Ops }) => void;
    const pending = new Promise<{ data: Ops }>((done) => { resolve = done; });
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: response }).mockReturnValueOnce(pending);
    const view = setup();
    await waitFor(() => expect(view.getByText('246,800원')).toBeTruthy());
    const loadedCommits = view.commits.mock.calls.length;
    act(() => useSession.setState({ me: { ...me, canMoney: false } }));
    expect(view.queryByText('246,800원')).toBeNull();
    expect(view.queryByText('123,400원')).toBeNull();
    expect(view.commits).toHaveBeenCalledTimes(loadedCommits + 1);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await act(async () => { resolve({ data: response }); await pending; });
    await waitFor(() => expectHidden(view));
    expect(view.commits).toHaveBeenCalledTimes(loadedCommits + 2);
  });

  it('권한 회수 전 요청이 나중에 끝나도 현재 비공개 응답을 덮어쓰지 않는다', async () => {
    let resolve!: (value: { data: Ops }) => void;
    const pending = new Promise<{ data: Ops }>((done) => { resolve = done; });
    const get = vi.spyOn(api, 'get').mockReturnValueOnce(pending).mockResolvedValueOnce({ data: response });
    const view = setup();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    act(() => useSession.setState({ me: { ...me, canMoney: false } }));
    await waitFor(() => expectHidden(view));
    await act(async () => { resolve({ data: response }); await pending; });
    expectHidden(view);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('권한 재부여 시 비공개 캐시를 재사용하지 않고 허용 응답을 새로 조회한다', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup({ ...me, canMoney: false });
    await waitFor(() => expectHidden(view));
    act(() => useSession.setState({ me }));
    await waitFor(() => expect(view.getByText('246,800원')).toBeTruthy());
    expect(get).toHaveBeenCalledTimes(2);
  });
});
