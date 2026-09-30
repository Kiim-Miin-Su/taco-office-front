/** @file-guide
 * 목적: UX-A2 서랍·안내 초안·컨설팅 공개범위의 동시 낙관 변경 및 캐시 수명 회귀
 * 책임/재사용: 실제 훅·QueryClient·sessionQueryKey를 실행하고 HTTP 완료 순서만 제어한다. 서버 업무 규칙은 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { clearSessionQueries } from './session-cache';
import { family, qk, sessionQueryKey, useCreateGuideDraft, useDrawerWrite, useUpdateConsultingShare } from './queries';

const viewer = 'anonymous';
const key = (value: readonly unknown[]) => sessionQueryKey(value, viewer);
const drawerKey = key(qk.drawer()), drawerAllKey = key(qk.drawer('all'));
const guideKey = key(qk.guideHistory({}));
const listKey = key(qk.consulting), detailKeys = [7, 8].map((id) => key(qk.consultingDetail(id)));
type Probe = { marker: string; todos: { id: number; done: boolean }[]; missing: { studentId: number }[];
  counts: { missing: number }; items: { id: number; share: string }[]; share: string };
const read = (client: QueryClient, queryKey: readonly unknown[]) => client.getQueryData<Probe>(queryKey)!;

const cases = [
  {
    name: '서랍', method: 'patch' as const, family: family.drawer, keys: [drawerKey, drawerAllKey],
    seed(client: QueryClient, marker = 'original') {
      for (const queryKey of this.keys) client.setQueryData(queryKey, {
        marker, members: [], todos: [{ id: 7, done: false }, { id: 8, done: false }], notis: [],
      });
    },
    useWrite() { const mutation = useDrawerWrite(); return (i: number) => mutation.mutateAsync({ kind: 'todo', id: 7 + i, done: true }); },
    result: () => ({ ok: true }),
    expectState(client: QueryClient, flags: boolean[]) {
      for (const queryKey of this.keys) expect(read(client, queryKey).todos.map((todo) => todo.done)).toEqual(flags);
    },
  },
  {
    name: '안내 초안', method: 'post' as const, family: family.guides, keys: [guideKey],
    seed(client: QueryClient, marker = 'original') {
      client.setQueryData(guideKey, { marker, missing: [7, 8].map((id) => ({ studentId: id, sourceOccurrenceId: id })), counts: { missing: 2 } });
    },
    useWrite() { const mutation = useCreateGuideDraft(); return (i: number) => mutation.mutateAsync({ studentId: 7 + i, sourceOccurrenceId: 7 + i }); },
    result: (i: number) => ({ id: 7 + i }),
    expectState(client: QueryClient, flags: boolean[]) {
      expect(read(client, guideKey).missing.map((item) => item.studentId)).toEqual([7, 8].filter((_, i) => !flags[i]));
      expect(read(client, guideKey).counts.missing).toBe(flags.filter((flag) => !flag).length);
    },
  },
  {
    name: '컨설팅 공개범위', method: 'patch' as const, family: family.consulting, keys: [listKey, ...detailKeys],
    seed(client: QueryClient, marker = 'original') {
      client.setQueryData(listKey, { marker, items: [7, 8].map((id) => ({ id, share: 'all' })) });
      detailKeys.forEach((queryKey, i) => client.setQueryData(queryKey, { marker, id: 7 + i, share: 'all', pickedStaffIds: [] }));
    },
    useWrite() { const mutation = useUpdateConsultingShare(); return (i: number) => mutation.mutateAsync({ consId: 7 + i, share: 'picked', pickedStaffIds: [10 + i] }); },
    result: (i: number) => ({ marker: 'original', id: 7 + i, share: 'picked', pickedStaffIds: [10 + i], serverOnly: 'confirmed' }),
    expectState(client: QueryClient, flags: boolean[]) {
      expect(read(client, listKey).items.map((item) => item.share)).toEqual(flags.map((flag) => flag ? 'picked' : 'all'));
      expect(detailKeys.map((queryKey) => read(client, queryKey).share)).toEqual(flags.map((flag) => flag ? 'picked' : 'all'));
    },
  },
];

function deferred() {
  let resolve!: (value: { data: unknown }) => void, reject!: (error: Error) => void;
  const promise = new Promise<{ data: unknown }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const denied = new Error('rejected fixture write');
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each(cases)('UX-A2 $name 실제 mutation lifecycle', (scenario) => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    scenario.seed(client);
    const responses = [deferred(), deferred()];
    const request = vi.spyOn(api, scenario.method).mockImplementationOnce(() => responses[0].promise).mockImplementationOnce(() => responses[1].promise);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const view = renderHook(() => [scenario.useWrite(), scenario.useWrite()], { wrapper });
    const pending: Promise<unknown>[] = [];
    async function start(i: number) {
      act(() => { pending[i] = view.result.current[i](i).catch((error) => error); });
      await waitFor(() => expect(request).toHaveBeenCalledTimes(i + 1));
    }
    async function finish(i: number, success: boolean) {
      await act(async () => {
        if (success) responses[i].resolve({ data: scenario.result(i) }); else responses[i].reject(denied);
        await pending[i];
      });
    }
    const reconciles = () => invalidate.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(scenario.family));
    return { client, start, finish, reconciles, request, invalidate };
  }

  it.each([false, true])('B 성공이 A 실패로 지워지지 않는다 (B 먼저 정착=%s)', async (bFirst) => {
    const { client, start, finish, reconciles } = setup();
    await start(0); await start(1);
    scenario.expectState(client, [true, true]);
    await finish(bFirst ? 1 : 0, bFirst);
    scenario.expectState(client, [bFirst, true]);
    expect(reconciles()).toHaveLength(0);
    await finish(bFirst ? 0 : 1, !bFirst);
    scenario.expectState(client, [false, true]);
    expect(reconciles()).toHaveLength(1);
    client.clear();
  });

  it.each([false, true])('두 실패는 어느 완료 순서든 원본 복원 (역순=%s)', async (reverse) => {
    const { client, start, finish } = setup();
    await start(0); await start(1);
    await finish(reverse ? 1 : 0, false); await finish(reverse ? 0 : 1, false);
    scenario.expectState(client, [false, false]);
    client.clear();
  });

  it.each([false, true])('동시 성공은 모두 보존하고 마지막에만 재조회 (역순=%s)', async (reverse) => {
    const { client, start, finish, reconciles } = setup();
    await start(0); await start(1);
    await finish(reverse ? 1 : 0, true);
    expect(reconciles()).toHaveLength(0);
    await finish(reverse ? 0 : 1, true);
    scenario.expectState(client, [true, true]);
    expect(reconciles()).toHaveLength(1);
    client.clear();
  });

  it.each(['clear', 'session-clear', 'replace'] as const)('%s 뒤 늦은 실패로 옛 캐시가 부활하지 않는다', async (mode) => {
    const { client, start, finish, reconciles } = setup();
    await start(0);
    if (mode === 'session-clear') clearSessionQueries(client); else client.clear();
    if (mode === 'replace') scenario.seed(client, 'next session');
    await finish(0, false);
    for (const queryKey of scenario.keys) {
      if (mode === 'replace') expect(read(client, queryKey).marker).toBe('next session');
      else expect(client.getQueryData(queryKey)).toBeUndefined();
    }
    expect(reconciles()).toHaveLength(0);
    client.clear();
  });

  it('세션 교체 후 늦은 성공도 새 캐시/새 mutation 복구와 분리된다', async () => {
    const { client, start, finish, reconciles, invalidate } = setup();
    await start(0);
    clearSessionQueries(client); scenario.seed(client, 'next session');
    await start(1);
    await finish(0, true);
    for (const queryKey of scenario.keys) expect(read(client, queryKey).marker).toBe('next session');
    scenario.expectState(client, [false, true]);
    expect(reconciles()).toHaveLength(0);
    expect(invalidate).not.toHaveBeenCalled();
    await finish(1, false);
    scenario.expectState(client, [false, false]);
    expect(reconciles()).toHaveLength(1);
    client.clear();
  });

  it('실패 rollback이 중간 서버 조회의 새 필드를 덮지 않는다', async () => {
    const { client, start, finish } = setup();
    await start(0);
    scenario.seed(client, 'authoritative GET');
    await finish(0, false);
    for (const queryKey of scenario.keys) expect(read(client, queryKey).marker).toBe('authoritative GET');
    scenario.expectState(client, [false, false]);
    client.clear();
  });

  it('cancelQueries를 기다리는 중 clear되면 새 Query를 옛 요청으로 변경하지 않는다', async () => {
    const { client, start, finish } = setup();
    let release!: () => void;
    const canceled = new Promise<void>((resolve) => { release = resolve; });
    const cancel = vi.spyOn(client, 'cancelQueries').mockImplementation(() => canceled);
    const starting = start(0);
    await waitFor(() => expect(cancel).toHaveBeenCalled());
    client.clear(); scenario.seed(client, 'next session');
    release(); await starting;
    scenario.expectState(client, [false, false]);
    await finish(0, false);
    for (const queryKey of scenario.keys) expect(read(client, queryKey).marker).toBe('next session');
    client.clear();
  });
});

it('같은 컨설팅 공개범위도 B 서버 응답 뒤 A의 늦은 성공이 B를 덮지 않는다', async () => {
  const scenario = cases[2];
  const client = new QueryClient(); scenario.seed(client);
  const a = deferred(), b = deferred();
  const patch = vi.spyOn(api, 'patch').mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => [useUpdateConsultingShare(), useUpdateConsultingShare()], { wrapper });
  let pa!: Promise<unknown>, pb!: Promise<unknown>;
  act(() => { pa = view.result.current[0].mutateAsync({ consId: 7, share: 'picked', pickedStaffIds: [10] }); });
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
  act(() => { pb = view.result.current[1].mutateAsync({ consId: 7, share: 'private' }); });
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
  const latest = { id: 7, share: 'private', pickedStaffIds: [], contractStep: 4 };
  await act(async () => { b.resolve({ data: latest }); await pb; });
  await act(async () => { a.resolve({ data: { id: 7, share: 'picked', pickedStaffIds: [10], contractStep: 2 } }); await pa; });
  expect(client.getQueryData(detailKeys[0])).toEqual(latest);
  expect(read(client, listKey).items[0].share).toBe('private');
  client.clear();
});

it('동시 할 일 등록은 고유하고 안정적인 임시 id를 쓰며 실패한 요청만 제거한다', async () => {
  const client = new QueryClient(); cases[0].seed(client);
  const a = deferred(), b = deferred();
  vi.spyOn(Date, 'now').mockReturnValue(123456);
  const post = vi.spyOn(api, 'post').mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => [useDrawerWrite(), useDrawerWrite()], { wrapper });
  let pa!: Promise<unknown>, pb!: Promise<unknown>;
  act(() => { pa = view.result.current[0].mutateAsync({ kind: 'todoCreate', body: { title: 'A' } }).catch((error) => error); });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  act(() => { pb = view.result.current[1].mutateAsync({ kind: 'todoCreate', body: { title: 'B' } }); });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  const ids = read(client, drawerKey).todos.filter((todo) => todo.id < 0).map((todo) => todo.id);
  expect(new Set(ids).size).toBe(2);
  await act(async () => { b.resolve({ data: { id: 99 } }); await pb; });
  expect(read(client, drawerKey).todos.filter((todo) => todo.id < 0).map((todo) => todo.id)).toEqual(ids);
  await act(async () => { a.reject(denied); await pa; });
  expect(read(client, drawerKey).todos.filter((todo) => todo.id < 0).map((todo) => todo.id)).toEqual([ids[0]]);
  client.clear();
});
