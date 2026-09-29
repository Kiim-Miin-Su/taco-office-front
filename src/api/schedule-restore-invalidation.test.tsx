/** @file-guide
 * 목적: 휴강 회차를 되살릴 수 있는 일정 쓰기(수정 · 옮기기 · 붙여넣기)가 학부모 휴강 안내 목록과 회계 갈래도 버리는지 (C-32 · SCHEDULE-EDGES)
 * 책임/재사용: 실제 useScheduleWrite 를 쓰고 네트워크만 어댑터로 갈아 끼운다. 제품 규칙을 시험 안에 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md · docs/sprint/evidence/TBO-54/schedule-edges/README.md
 */

/**
 * 휴강한 회차를 끌어 옮기면 서버는 그 회차를 **되살리고**(applyEdit) 보내지 않은 휴강 안내를 같은 트랜잭션에서 걷는다.
 * 화면이 안내 목록을 다시 읽지 않으면 「학부모 일괄 안내」 패널이 **사라진 안내**를 「발송 대기」로 들고 있고,
 * 누르면 없는 줄로 발송을 시도한다(SCHEDULE-EDGES 실브라우저가 잡았다). 이월이 풀리므로 §54 도 같은 이유로 버린다.
 */
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { family, useScheduleWrite } from './queries';

const originalAdapter = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = originalAdapter; vi.restoreAllMocks(); });

function setup() {
  api.defaults.adapter = (async (config: { url?: string }) => ({
    config, status: 200, statusText: 'OK', headers: {},
    data: { effScope: 'this', log: [], projected: 1, serIds: [1], undoToken: null, undoExpiresAt: null, unavailable: [], studentOverlaps: [] },
  })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const dropped = (key: readonly unknown[]) => invalidate.mock.calls.some(([arg]) => JSON.stringify(arg?.queryKey) === JSON.stringify(key));
  return { wrapper, dropped };
}

it.each([
  ['수정 · 한 회차 옮기기(patch)', { kind: 'patch', serId: 1, body: { scope: 'this', onDate: '2026-10-07', startMin: 600, endMin: 660 } }],
  ['여러 회차 옮기기(moveMany)', { kind: 'moveMany', body: { items: [], scope: 'this' } }],
  ['붙여넣기 · 잘라내기(paste)', { kind: 'paste', body: { sources: [], scope: 'this', targetDate: '2026-10-07', targetStartMin: 600 } }],
])('%s — 휴강을 되살릴 수 있는 쓰기는 휴강 안내 목록과 회계를 다시 읽는다 (C-32 · SCHEDULE-EDGES)', async (_name, write) => {
  const { wrapper, dropped } = setup();
  const { result } = renderHook(() => useScheduleWrite(), { wrapper });
  act(() => { result.current.mutate(write as never); });
  await waitFor(() => expect(dropped(family.dayCancelNotices)).toBe(true));
  expect(dropped(family.accounting)).toBe(true);
});
