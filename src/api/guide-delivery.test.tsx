/** @file-guide
 * 목적: GUIDE 발송/확인 HTTP 계약과 사용자별 종속 캐시, 늦은 이전 세션 응답을 검증한다.
 * 책임/재사용: 실제 hooks/QueryClient/Axios interceptor를 사용하고 HTTP adapter만 격리한다.
 * 검증/작업 지침: docs/AGENT.md · docs/sprint/evidence/TBO-52/s4-guide/plan.md
 */
import { createElement, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, expect, it } from 'vitest';
import { api } from './client';
import { family, qk, sessionQueryKey, useAcknowledgeGuide, useReceivedGuides, useSendGuide } from './queries';
import type { Me, ReceivedGuides } from './types';
import { useSession } from '@/store/useSession';

const viewer: Me = { id: 2, name: 'A', role: 'teacher', roleLabel: '강사', title: null,
  canAdminPage: false, canCrudAll: false, canSeeProfit: false, canCrudAttendance: false,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; useSession.getState().signOut(); });
function setup() {
  useSession.getState().signIn('fixture', viewer);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

it.each(['send', 'ack'] as const)('%s의 성공/409만 현재 사용자 관련 갈래를 갱신한다', async (kind) => {
  const { client, wrapper } = setup();
  const changed = [qk.guides, qk.guideStudents, qk.guideHistory({ span: 'month', anchor: '2026-09-01' }),
    qk.receivedGuides, qk.board({ from: '2026-09-21', to: '2026-09-27' }), qk.tracking(8, '2026-09-24'), qk.drawer('all')];
  const preserved = [qk.teacherGuides(undefined), qk.meta, qk.books, qk.gpa(undefined)];
  const calls: Array<{ url?: string; body?: unknown }> = [];
  let status = 200;
  api.defaults.adapter = async (config) => {
    calls.push({ url: config.url, body: JSON.parse(config.data as string) });
    if (status !== 200) throw new AxiosError('거절', undefined, config, undefined,
      { config, status, statusText: 'Rejected', headers: {}, data: { code: 'GUIDE_REJECTED', message: '거절' } });
    return { config, status, statusText: 'OK', headers: {}, data: {} };
  };
  const hook = renderHook(() => ({ send: useSendGuide(), ack: useAcknowledgeGuide() }), { wrapper });
  for (status of [200, 409, 404]) {
    [...changed, ...preserved].forEach((key) => client.setQueryData(sessionQueryKey(key, viewer.id), { marker: 'before' }));
    changed.forEach((key) => client.setQueryData(sessionQueryKey(key, 99), { marker: 'other viewer' }));
    await act(async () => {
      const pending = hook.result.current[kind].mutateAsync(5);
      if (status === 200) await pending;
      else await expect(pending).rejects.toMatchObject({ status });
    });
    for (const key of changed) {
      expect(client.getQueryState(sessionQueryKey(key, viewer.id))?.isInvalidated).toBe(status !== 404);
      expect(client.getQueryState(sessionQueryKey(key, 99))?.isInvalidated).toBe(false);
    }
    for (const key of preserved) expect(client.getQueryState(sessionQueryKey(key, viewer.id))?.isInvalidated).toBe(false);
  }
  expect(calls).toEqual(Array.from({ length: 3 }, () => ({ url: kind === 'send' ? '/guides/5/send' : '/teacher/guides/5/ack', body: {} })));
});

it.each(['send', 'ack'] as const)('%s 대기 중 A→B 로그인은 늦은 A 성공을 B 캐시에 반영하지 않는다', async (kind) => {
  const { client, wrapper } = setup();
  let release: (() => void) | undefined;
  api.defaults.adapter = async (config) => {
    await new Promise<void>((resolve) => { release = resolve; });
    return { config, status: 200, statusText: 'OK', headers: {}, data: {} };
  };
  const hook = renderHook(() => ({ send: useSendGuide(), ack: useAcknowledgeGuide() }), { wrapper });
  let result: Promise<unknown>;
  act(() => { result = hook.result.current[kind].mutateAsync(5).catch((error: unknown) => error); });
  await waitFor(() => expect(release).toBeTypeOf('function'));
  act(() => useSession.getState().signIn('other-fixture', { ...viewer, id: 3, name: 'B' }));
  client.setQueryData(sessionQueryKey(qk.receivedGuides, 3), { items: [] } satisfies ReceivedGuides);
  await act(async () => { release?.(); expect(await result).toMatchObject({ code: 'SESSION_CHANGED' }); });
  expect(client.getQueryState(sessionQueryKey(qk.receivedGuides, 3))?.isInvalidated).toBe(false);
  expect(client.getQueryData(sessionQueryKey(qk.receivedGuides, 3))).toEqual({ items: [] });
});

it('수신 GET은 URL 선택/주/학생 인자를 보내지 않고 viewer 캐시와 독립 family를 쓴다', async () => {
  const { client, wrapper } = setup();
  const calls: Array<{ url?: string; params?: unknown }> = [];
  api.defaults.adapter = async (config) => {
    calls.push({ url: config.url, params: config.params });
    return { config, status: 200, statusText: 'OK', headers: {}, data: { items: [] } satisfies ReceivedGuides };
  };
  const hook = renderHook(useReceivedGuides, { wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(calls).toEqual([{ url: '/teacher/guides/received', params: undefined }]);
  expect(client.getQueryData(sessionQueryKey(qk.receivedGuides, viewer.id))).toEqual({ items: [] });
  expect(client.getQueriesData({ queryKey: family.teacherGuides })).toHaveLength(0);
  expect(client.getQueriesData({ queryKey: family.receivedGuides })).toHaveLength(1);
});
