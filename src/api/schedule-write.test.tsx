/** @file-guide
 * 목적: schedule-write.test.tsx — 실제 일정 mutation의 낙관 복구/재조회 경계 회귀
 * 책임/재사용: useScheduleWrite·생성 DTO·ApiError·QueryClient를 재사용한다. 페이지 mock으로 서버 캐시 동작을 대체하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';
import { qk, useAttendanceWrite, useScheduleWrite } from './queries';
import type { OccurrenceList } from './types';
import { clearSessionQueries } from './session-cache';

const range = { from: '2026-09-11', to: '2026-09-11' };
const key = qk.occurrences(range);
const original: OccurrenceList = { ...range, items: [{
  serId: 1, date: range.from, onDate: range.from, startMin: 600, endMin: 660,
  kindKey: 'meeting', title: '회귀', mode: 'offline', canceled: false, hasException: false,
  recurring: true, repState: 'plan', written: false, attendanceMode: 'unavailable', attendance: null, students: [],
}] };
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(key, original);
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it.each(['NOT_FOUND', 'OCCURRENCE_NOT_FOUND', 'SOURCE_NOT_FOUND'])('%s404는 낙관 변경 복구 후 최신 목록을 한 번 조회한다', async (code) => {
  const error = new ApiError(code, '더 이상 없는 회차입니다', 404);
  vi.spyOn(api, 'patch').mockRejectedValue(error);
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { ...range, items: [] } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const set = vi.spyOn(client, 'setQueryData');
  const view = renderHook(() => {
    useQuery({ queryKey: key, queryFn: async () => (await api.get<OccurrenceList>('/schedule/occurrences', { params: range })).data });
    return useScheduleWrite();
  }, { wrapper });
  await act(async () => {
    await expect(view.result.current.mutateAsync({ kind: 'patch', serId: 1,
      body: { scope: 'future', onDate: range.from, startMin: 610 } })).rejects.toBe(error);
  });
  expect(set.mock.calls.some(([, value]) => (value as OccurrenceList)?.items?.[0]?.startMin === 610)).toBe(true);
  expect(set).toHaveBeenCalledWith(key, original);
  await waitFor(() => expect(client.getQueryData<OccurrenceList>(key)?.items).toHaveLength(0));
  expect(get).toHaveBeenCalledOnce();
  expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
    ['schedule', 'occurrences'], ['board'], qk.horizon,
  ]);
});

it.each([
  new ApiError('BAD_RANGE', '시간 오류', 400),
  new ApiError('REFERENCE_NOT_FOUND', '참조 오류', 400),
  new ApiError('NOT_FOUND', '형식 오류', 400),
  new ApiError('STUDENT_NOT_FOUND', '학생 없음', 404),
  new ApiError('FORBIDDEN', '권한 없음', 403),
])('$code/$status는 오류를 유지하고 관계없는 재조회를 추가하지 않는다', async (error) => {
  vi.spyOn(api, 'patch').mockRejectedValue(error);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => useScheduleWrite(), { wrapper });
  await act(async () => {
    await expect(view.result.current.mutateAsync({ kind: 'patch', serId: 1,
      body: { scope: 'this', onDate: range.from, startMin: 610 } })).rejects.toBe(error);
  });
  expect(client.getQueryData(key)).toEqual(original);
  expect(invalidate).not.toHaveBeenCalled();
});

it('정상 저장도 같은 세 key만 갱신하고 mutation 결과를 그대로 반환한다', async () => {
  const data = { effScope: 'this', log: [], projected: 1, serIds: [1] };
  vi.spyOn(api, 'patch').mockResolvedValue({ data });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => useScheduleWrite(), { wrapper });
  await act(async () => {
    await expect(view.result.current.mutateAsync({ kind: 'patch', serId: 1,
      body: { scope: 'this', onDate: range.from, startMin: 610 } })).resolves.toEqual(data);
  });
  expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
    ['schedule', 'occurrences'], ['board'], qk.horizon,
  ]);
});

/** 실제 HTTP 응답 순서만 제어한다. QueryClient와 두 훅의 lifecycle은 제품 그대로 실행한다. */
function deferred() {
  let resolve!: (value: { data: unknown }) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<{ data: unknown }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const saved = { data: { effScope: 'this', log: [], projected: 1, serIds: [1] } };
const failure = new ApiError('BAD_RANGE', '시간 오류', 400);

it.each(['different fields', 'same field', 'different occurrences'])(
  '동시 %s: 먼저 실패해도 두 번째 낙관 변경을 지우지 않는다', async (mode) => {
    if (mode === 'different occurrences') client.setQueryData(key, { ...original,
      items: [...original.items, { ...original.items[0], serId: 2 }] });
    const a = deferred(), b = deferred();
    const patch = vi.spyOn(api, 'patch').mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(() => [useScheduleWrite(), useScheduleWrite()] as const, { wrapper });
    let pa!: Promise<unknown>, pb!: Promise<unknown>;
    act(() => { pa = view.result.current[0].mutateAsync({ kind: 'patch', serId: 1,
      body: { scope: 'this', onDate: range.from, startMin: 610 } }).catch((e) => e); });
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    act(() => { pb = view.result.current[1].mutateAsync({ kind: 'patch', serId: mode === 'different occurrences' ? 2 : 1,
      body: { scope: 'this', onDate: range.from, ...(mode === 'different fields' ? { endMin: 680 } : { startMin: 620 }) } }).catch((e) => e); });
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    await act(async () => { a.reject(failure); await pa; });
    const items = client.getQueryData<OccurrenceList>(key)!.items;
    expect(items[0].startMin).toBe(mode === 'same field' ? 620 : 600);
    expect(items[mode === 'different occurrences' ? 1 : 0][mode === 'different fields' ? 'endMin' : 'startMin']).toBe(mode === 'different fields' ? 680 : 620);
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => { b.resolve(saved); await pb; });
    expect(invalidate).toHaveBeenCalledTimes(3);
  },
);

it.each([false, true])('두 실패의 완료 역순=%s도 실패한 첫 낙관 값을 부활시키지 않는다', async (reverse) => {
  const a = deferred(), b = deferred();
  const patch = vi.spyOn(api, 'patch').mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
  const view = renderHook(() => [useScheduleWrite(), useScheduleWrite()] as const, { wrapper });
  const pending: Promise<unknown>[] = [];
  for (const [i, startMin] of [610, 620].entries()) {
    act(() => { pending.push(view.result.current[i].mutateAsync({ kind: 'patch', serId: 1,
      body: { scope: 'this', onDate: range.from, startMin } }).catch((e) => e)); });
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(i + 1));
  }
  for (const i of reverse ? [1, 0] : [0, 1]) await act(async () => { [a, b][i].reject(failure); await pending[i]; });
  expect(client.getQueryData(key)).toEqual(original);
});

it('후발 성공 뒤 선발 실패: 중간 GET 없이 마지막에 한 번 서버 정본을 읽는다', async () => {
  const a = deferred(), b = deferred();
  const patch = vi.spyOn(api, 'patch').mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
  const server = { ...original, items: [{ ...original.items[0], endMin: 680 }] };
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: server });
  const view = renderHook(() => {
    useQuery({ queryKey: key, queryFn: async () => (await api.get('/schedule/occurrences')).data });
    return [useScheduleWrite(), useScheduleWrite()] as const;
  }, { wrapper });
  let pa!: Promise<unknown>, pb!: Promise<unknown>;
  act(() => { pa = view.result.current[0].mutateAsync({ kind: 'patch', serId: 1,
    body: { scope: 'this', onDate: range.from, startMin: 610 } }).catch((e) => e); });
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
  act(() => { pb = view.result.current[1].mutateAsync({ kind: 'patch', serId: 1,
    body: { scope: 'this', onDate: range.from, endMin: 680 } }).catch((e) => e); });
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
  await act(async () => { b.resolve(saved); await pb; });
  expect(get).not.toHaveBeenCalled();
  await act(async () => { a.reject(failure); await pa; });
  await waitFor(() => expect(client.getQueryData(key)).toEqual(server));
  expect(get).toHaveBeenCalledOnce();
});

it('출결 등 외부 조회가 갱신한 필드를 실패 rollback으로 덮지 않는다', async () => {
  const response = deferred();
  const patch = vi.spyOn(api, 'patch').mockImplementation(() => response.promise);
  const view = renderHook(() => useScheduleWrite(), { wrapper });
  let pending!: Promise<unknown>;
  act(() => { pending = view.result.current.mutateAsync({ kind: 'patch', serId: 1,
    body: { scope: 'this', onDate: range.from, startMin: 610 } }).catch((e) => e); });
  await waitFor(() => expect(patch).toHaveBeenCalledOnce());
  const authoritative = { ...original, items: [{ ...original.items[0], written: true }] };
  client.setQueryData(key, authoritative);
  await act(async () => { response.reject(failure); await pending; });
  expect(client.getQueryData(key)).toEqual(authoritative);
});

it.each(['remove', 'session'])('%s 캐시 폐기 뒤 늦은 실패로 이전 목록을 다시 만들지 않는다', async (mode) => {
  const response = deferred();
  const patch = vi.spyOn(api, 'patch').mockImplementation(() => response.promise);
  const view = renderHook(() => useScheduleWrite(), { wrapper });
  let pending!: Promise<unknown>;
  act(() => { pending = view.result.current.mutateAsync({ kind: 'patch', serId: 1,
    body: { scope: 'this', onDate: range.from, startMin: 610 } }).catch((e) => e); });
  await waitFor(() => expect(patch).toHaveBeenCalledOnce());
  act(() => { if (mode === 'session') clearSessionQueries(client); else client.removeQueries({ queryKey: key }); });
  await act(async () => { response.reject(failure); await pending; });
  expect(client.getQueryData(key)).toBeUndefined();
});

it('세션 전환 뒤 새 요청은 이전 요청의 완료와 별개로 복구한다', async () => {
  const old = deferred(), next = deferred();
  const patch = vi.spyOn(api, 'patch').mockImplementationOnce(() => old.promise).mockImplementationOnce(() => next.promise);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => [useScheduleWrite(), useScheduleWrite()] as const, { wrapper });
  let previous!: Promise<unknown>, current!: Promise<unknown>;
  act(() => { previous = view.result.current[0].mutateAsync({ kind: 'patch', serId: 1,
    body: { scope: 'this', onDate: range.from, startMin: 610 } }).catch((e) => e); });
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
  const otherUser = { ...original, items: [{ ...original.items[0], title: '다음 사용자', startMin: 700, endMin: 760 }] };
  act(() => { clearSessionQueries(client); client.setQueryData(key, otherUser); });
  act(() => { current = view.result.current[1].mutateAsync({ kind: 'patch', serId: 1,
    body: { scope: 'this', onDate: range.from, startMin: 710 } }).catch((e) => e); });
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
  await act(async () => { old.resolve(saved); await previous; });
  expect(client.getQueryData<OccurrenceList>(key)!.items[0]).toMatchObject({ title: '다음 사용자', startMin: 710 });
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => { next.reject(failure); await current; });
  expect(client.getQueryData(key)).toEqual(otherUser);
});

it('낙관하지 않는 명단 성공도 진행 중 이동과 묶고 마지막에 재조회한다', async () => {
  const move = deferred(), roster = deferred();
  const patch = vi.spyOn(api, 'patch').mockImplementationOnce(() => move.promise).mockImplementationOnce(() => roster.promise);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => [useScheduleWrite(), useScheduleWrite()] as const, { wrapper });
  let pa!: Promise<unknown>, pb!: Promise<unknown>;
  act(() => { pa = view.result.current[0].mutateAsync({ kind: 'patch', serId: 1,
    body: { scope: 'this', onDate: range.from, startMin: 610 } }).catch((e) => e); });
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
  act(() => { pb = view.result.current[1].mutateAsync({ kind: 'roster', serId: 1,
    body: { op: 'add', onDate: range.from, studentId: 1 } }).catch((e) => e); });
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
  await act(async () => { roster.resolve(saved); await pb; });
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => { move.reject(failure); await pa; });
  expect(invalidate).toHaveBeenCalledTimes(3);
});

it('다중 이동 실패는 같은 묶음의 취소 낙관값만 보존한다', async () => {
  const move = deferred(), cancel = deferred();
  const post = vi.spyOn(api, 'post').mockImplementationOnce(() => move.promise);
  const remove = vi.spyOn(api, 'delete').mockImplementationOnce(() => cancel.promise);
  const secondKey = qk.occurrences({ ...range, teacherId: 2 });
  client.setQueryData(secondKey, original);
  const view = renderHook(() => [useScheduleWrite(), useScheduleWrite()] as const, { wrapper });
  let pa!: Promise<unknown>, pb!: Promise<unknown>;
  act(() => { pa = view.result.current[0].mutateAsync({ kind: 'moveMany', body: { scope: 'this', items: [
    { source: { serId: 1, date: range.from, onDate: range.from }, date: range.from, startMin: 620, endMin: 680, roomId: null },
  ] } }).catch((e) => e); });
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  act(() => { pb = view.result.current[1].mutateAsync({ kind: 'delete', serId: 1,
    body: { scope: 'this', onDate: range.from } }).catch((e) => e); });
  await waitFor(() => expect(remove).toHaveBeenCalledOnce());
  await act(async () => { move.reject(failure); await pa; });
  for (const queryKey of [key, secondKey]) expect(client.getQueryData<OccurrenceList>(queryKey)!.items[0])
    .toMatchObject({ startMin: 600, endMin: 660, canceled: true });
  await act(async () => { cancel.reject(failure); await pb; });
  for (const queryKey of [key, secondKey]) expect(client.getQueryData(queryKey)).toEqual(original);
});

it.each([
  new ApiError('OCCURRENCE_NOT_FOUND', '회차 없음', 404),
  new ApiError('ATTENDANCE_NOT_FOUND', '출결 없음', 404),
  new ApiError('ATTENDANCE_NOT_AVAILABLE', '출결 불가', 409),
])('출결 $code는 최신 서버 판정/목록을 재조회한다', async (error) => {
  vi.spyOn(api, 'put').mockRejectedValue(error);
  const server: OccurrenceList = { ...original, items: [{ ...original.items[0], canceled: true, attendanceMode: 'unavailable' }] };
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: server });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => {
    useQuery({ queryKey: key, queryFn: async () => (await api.get<OccurrenceList>('/schedule/occurrences')).data });
    return useAttendanceWrite();
  }, { wrapper });
  await act(async () => {
    await expect(view.result.current.mutateAsync({ action: 'save', serId: 1, onDate: range.from,
      body: { result: 'completed' } })).rejects.toBe(error);
  });
  await waitFor(() => expect(client.getQueryData(key)).toEqual(server));
  expect(get).toHaveBeenCalledOnce();
  expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
    ['schedule', 'occurrences'], ['board'], qk.accounting, ['exec'],
  ]);
});

it.each([
  new ApiError('ATTENDANCE_REASON_REQUIRED', '사유 필요', 400),
  new ApiError('FORBIDDEN', '권한 없음', 403),
])('출결 $code는 입력/권한 오류를 유지하고 추가 무효화하지 않는다', async (error) => {
  vi.spyOn(api, 'put').mockRejectedValue(error);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => useAttendanceWrite(), { wrapper });
  await act(async () => {
    await expect(view.result.current.mutateAsync({ action: 'save', serId: 1, onDate: range.from,
      body: { result: 'completed' } })).rejects.toBe(error);
  });
  expect(invalidate).not.toHaveBeenCalled();
});

it.each(['save', 'clear'] as const)('출결 %s 성공은 기존 네 소비 key만 갱신한다', async (action) => {
  vi.spyOn(api, action === 'save' ? 'put' : 'delete').mockResolvedValue({ data: { attendance: null } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => useAttendanceWrite(), { wrapper });
  await act(async () => {
    await view.result.current.mutateAsync(action === 'save'
      ? { action, serId: 1, onDate: range.from, body: { result: 'completed' } }
      : { action, serId: 1, onDate: range.from });
  });
  expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
    ['schedule', 'occurrences'], ['board'], qk.accounting, ['exec'],
  ]);
});
