/** @file-guide
 * 목적: BO-09D-01 강사 월기록 hook이 month를 보내지 않고 서버 KST 전월 권위를 소비하는지 검증한다. (test)
 * 책임/재사용: HTTP 호출과 query key만 고정하고 월 계산·정산 규칙은 서버 테스트에 맡긴다.
 * 검증/작업 지침: docs/sprint/TBO-55/BOC-09-SCENARIOS-2026-10-07.md · docs/contracts/CONTRACTS.md
 */
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useSession } from '@/store/useSession';
import { api } from './client';
import { qk, sessionQueryKey, useTeacherHistory } from './queries';
import type { Me, TeacherHistory } from './types';

const teacher: Me = { id: 7, name: '강사A', role: 'teacher', roleLabel: '강사', title: null,
  canAdminPage: false, canCrudAll: false, canSeeProfit: false, canCrudAttendance: false,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const history = { month: '2026-09', stats: {}, lessons: [], settlement: {}, bonusRules: [] } as unknown as TeacherHistory;

afterEach(() => { useSession.getState().signOut(); vi.restoreAllMocks(); });

it('GET /teacher/history를 query 없이 호출하고 서버 전월 key 하나만 사용한다', async () => {
  useSession.getState().signIn('teacher-history-test', teacher);
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: history });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => useTeacherHistory(), { wrapper });
  try {
    await waitFor(() => expect(view.result.current.data).toEqual(history));
    expect(get).toHaveBeenCalledWith('/teacher/history');
    expect(client.getQueryData(sessionQueryKey(qk.teacherHistory, 7))).toEqual(history);
  } finally {
    view.unmount();
    client.clear();
  }
});
