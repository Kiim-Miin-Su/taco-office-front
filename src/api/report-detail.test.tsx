/** @file-guide
 * 목적: report-detail.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReportDetail, useReportReview, useReportWrite } from './queries';
import { ApiError } from './client';

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('./client', async (original) => ({ ...await original<typeof import('./client')>(), api: { get, put, post } }));
vi.mock('@/store/useSession', () => ({
  useSession: (select: (state: { me: { id: number } }) => unknown) => select({ me: { id: 6 } }),
}));

let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  put.mockReset(); post.mockReset();
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

it.each([
  ['write', 'REPORT_CANCELED', 400], ['write', 'REPORT_NOT_ENDED', 400],
  ['write', 'REPORT_NOT_ALLOWED', 400], ['write', 'REPORT_FORBIDDEN', 403],
  ['write', 'REPORT_NOT_FOUND', 404], ['write', 'REPORT_LOCKED', 409],
  ['review', 'REPORT_NOT_WAITING', 409], ['review', 'REPORT_REVIEW_FORBIDDEN', 403],
] as const)('%s의 %s/%i는 상세를 재조회하여 최신 서버 가능 여부를 소비한다', async (kind, code, status) => {
  const error = new ApiError(code, '변경된 상태', status);
  put.mockRejectedValue(error); post.mockRejectedValue(error);
  get.mockResolvedValueOnce({ data: { minutesSinceEnd: 1, canEdit: true, canReview: true } })
    .mockResolvedValue({ data: { minutesSinceEnd: 1, canEdit: false, canReview: false } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => ({ detail: useReportDetail(50, '2026-09-07'),
    write: useReportWrite(), review: useReportReview() }), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  await act(async () => {
    const target = { serId: 50, onDate: '2026-09-07' };
    await expect(kind === 'write'
      ? view.result.current.write.mutateAsync({ ...target, action: 'draft', body: { content: '내용', progress: '진도', homework: '숙제' } })
      : view.result.current.review.mutateAsync({ ...target, body: { decision: 'approve' } })).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.result.current.detail.data).toMatchObject({ canEdit: false, canReview: false });
  expect(get).toHaveBeenCalledTimes(2);
  expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
    ['reports'], ['schedule', 'occurrences'], ['accounting'], ['board'], ['exec'], ['drawer'],
  ]);
});

it.each(['REPORT_FIELD_REQUIRED', 'REJECT_REASON_REQUIRED', 'NETWORK'])('%s는 입력/네트워크 오류로 유지하고 재조회하지 않는다', async (code) => {
  const error = new ApiError(code, '저장 실패', code === 'NETWORK' ? 0 : 400);
  put.mockRejectedValue(error); post.mockRejectedValue(error);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = renderHook(() => ({ write: useReportWrite(), review: useReportReview() }), { wrapper });
  await act(async () => {
    const target = { serId: 50, onDate: '2026-09-07' };
    await expect(code === 'REJECT_REASON_REQUIRED'
      ? view.result.current.review.mutateAsync({ ...target, body: { decision: 'reject', reason: '' } })
      : view.result.current.write.mutateAsync({ ...target, action: 'draft', body: { content: '', progress: '', homework: '' } })).rejects.toBe(error);
  });
  expect(invalidate).not.toHaveBeenCalled();
});
