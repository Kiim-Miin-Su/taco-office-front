/** @file-guide
 * 목적: series-counts-invalidation.test.tsx — 일정 원본(SER)을 만들거나 가르는 쓰기가 §07 사이드바 건수(`family.seriesCounts`)도 버리는지
 * 책임/재사용: 실제 훅(queries.ts)을 그대로 쓰고 네트워크만 어댑터로 갈아 끼운다. 제품 규칙을 시험 안에 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §07 사이드바의 수는 **일정 원본(SER) 수**다(w6-1 · 서버 `GET /schedule/series-counts`). 시간표 화면의 쓰기(`useScheduleWrite`)만
 * 그 갈래를 버리면, 등록 확정 · 컨설팅 회차 잡기 · 회의 잡기 · 강사 교체 · 변경 요청 반영 · 상담 일정 만들기처럼
 * **다른 화면에서 SER 을 만들거나 가르는 쓰기** 뒤에 사이드바가 옛 수를 30초까지 보여 준다.
 * 이 시험은 그 여섯 갈래가 `family.seriesCounts` 를 함께 버리는지만 본다(쓰기 결과는 각 화면 시험이 본다).
 */
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import {
  family, useAddConsultingSessions, useCreateMeeting, useDrawerWrite, useEnrollLead, useScheduleLeadAppts, useTeacherChange,
} from './queries';

const originalAdapter = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = originalAdapter; vi.restoreAllMocks(); });

function setup() {
  api.defaults.adapter = (async (config: { url?: string }) => ({ config, status: 200, statusText: 'OK', headers: {}, data: { ok: true } })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const droppedSeries = () => invalidate.mock.calls.some(([arg]) => JSON.stringify(arg?.queryKey) === JSON.stringify(family.seriesCounts));
  return { wrapper, droppedSeries };
}

it.each([
  ['등록 확정(상담)', () => { const m = useEnrollLead(); return () => m.mutate({ id: 1, kind: 'enroll', body: {} as never }); }],
  ['컨설팅 회차 잡기', () => { const m = useAddConsultingSessions(); return () => m.mutate({ consId: 1, kind: 'apply', body: {} as never }); }],
  ['회의 잡기', () => { const m = useCreateMeeting(); return () => m.mutate({} as never); }],
  ['강사 교체', () => { const m = useTeacherChange(); return () => m.mutate({ kind: 'apply', body: {} as never }); }],
  ['변경 요청 반영', () => { const m = useDrawerWrite(); return () => m.mutate({ kind: 'chreqReview', id: 1, decision: 'approve' }); }],
  ['상담 일정을 시간표에', () => { const m = useScheduleLeadAppts(); return () => m.mutate({ id: 1 }); }],
])('%s — SER 을 만들거나 가르는 쓰기는 §07 사이드바 건수도 버린다', async (_name, useFire) => {
  const { wrapper, droppedSeries } = setup();
  const { result } = renderHook(useFire, { wrapper });
  act(() => result.current());
  await waitFor(() => expect(droppedSeries()).toBe(true));
});
