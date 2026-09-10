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
import { qk, useScheduleWrite } from './queries';
import type { OccurrenceList } from './types';

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
