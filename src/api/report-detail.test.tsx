/** @file-guide
 * 목적: report-detail.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReportDetail } from './queries';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./client', () => ({ api: { get } }));
vi.mock('@/store/useSession', () => ({
  useSession: (select: (state: { me: { id: number } }) => unknown) => select({ me: { id: 6 } }),
}));

let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  focusManager.setFocused(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false } } });
});
afterEach(() => { cleanup(); client.clear(); focusManager.setFocused(undefined); vi.useRealTimers(); });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('열어 둔 예정 리포트는 서버에서 종료를 확인하면 작성 가능해지고 주기 조회를 멈춘다', async () => {
  get.mockResolvedValueOnce({ data: { minutesSinceEnd: -1, canEdit: false } })
    .mockResolvedValue({ data: { minutesSinceEnd: 0, canEdit: true } });
  const view = renderHook(() => useReportDetail(50, '2026-09-07'), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.result.current.data?.canEdit).toBe(false);
  expect(get).toHaveBeenCalledOnce();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(view.result.current.data?.canEdit).toBe(true);
  expect(get).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(get).toHaveBeenCalledTimes(2);
});

it('닫힌 리포트는 주기 조회하지 않는다', async () => {
  renderHook(() => useReportDetail(undefined, undefined), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(get).not.toHaveBeenCalled();
});

it('탭 복귀 때 오래된 상세 권한을 다시 조회한다', async () => {
  get.mockResolvedValue({ data: { minutesSinceEnd: 1, canEdit: true } });
  renderHook(() => useReportDetail(50, '2026-09-07'), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); focusManager.setFocused(false); });
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); focusManager.setFocused(true); });
  expect(get).toHaveBeenCalledTimes(2);
});
