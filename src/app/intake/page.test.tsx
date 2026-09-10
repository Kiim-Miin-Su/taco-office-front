import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { opsQueryKey } from '@/api/queries';
import type { Lead, Ops } from '@/api/types';
import { FAILURE_SEARCH_LABEL } from '@/lib/intake-search';
import IntakePage from './page';

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const lead: Lead = {
  id: 1, name: '장서우', school: '언주중', ownerName: 'Grace', reason: '연락 두절',
  stage: 'failed', stopAt: 'after_first', ageDays: 0, createdAt: '2026-09-10', studentId: null, ownerId: null,
};
const leads = [lead, { ...lead, id: 2, name: '신유나', school: '역삼중', reason: '타 학원 등록' },
  { ...lead, id: 3, name: '윤도현', school: null, ownerName: null, reason: null, stopAt: null },
  { ...lead, id: 4, name: '진행중학생', stage: 'first' }];
const response: Ops = {
  leads, complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: false,
};

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

async function setup() {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: response });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '중단 지점 3' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '중단 지점 3' }));
  vi.useFakeTimers();
  const input = view.getByRole('searchbox', { name: FAILURE_SEARCH_LABEL });
  return { ...view, input, get, client };
}

describe('§24 검색 기능 통합 — 실제 useOps 캐시 소비', () => {
  it('260ms 후 실패 목록만 검색하고 전역 집계와 캐시/API 호출을 유지한다', async () => {
    const view = await setup();
    fireEvent.change(view.input, { target: { value: '역삼' } });
    act(() => { vi.advanceTimersByTime(259); });
    expect(view.getByRole('status').textContent).toBe('검색 결과 3건 / 전체 3건');
    act(() => { vi.advanceTimersByTime(1); });
    expect(view.getByRole('status').textContent).toBe('검색 결과 1건 / 전체 3건');
    expect(view.getByText('타 학원 등록')).toBeTruthy();
    expect(view.getByRole('button', { name: '중단 지점 3' })).toBeTruthy();
    expect(view.get).toHaveBeenCalledTimes(1);
    expect(view.get).toHaveBeenCalledWith('/ops');
    expect(view.client.getQueryData(opsQueryKey('anonymous', false))).toEqual(response);
  });

  it('빈 결과 초기화는 검색어·필터를 즉시 복구하고 입력으로 포커스를 돌린다', async () => {
    const view = await setup();
    fireEvent.change(view.input, { target: { value: '진행중학생' } });
    act(() => { vi.advanceTimersByTime(260); });
    expect(view.getByText('검색 결과가 없습니다')).toBeTruthy();
    fireEvent.click(view.getAllByRole('button', { name: '초기화' })[1]);
    expect((view.input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(view.input);
    expect(view.getByRole('status').textContent).toBe('검색 결과 3건 / 전체 3건');
    expect(view.queryByText('검색 결과가 없습니다')).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(view.get).toHaveBeenCalledTimes(1);
  });

  it('탭 왕복 시 입력값과 적용된 결과를 함께 보존한다', async () => {
    const view = await setup();
    fireEvent.change(view.input, { target: { value: '장서우' } });
    act(() => { vi.advanceTimersByTime(260); });
    fireEvent.click(view.getByRole('button', { name: '단계 보드' }));
    expect(view.queryByRole('searchbox')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '중단 지점 3' }));
    expect((view.getByRole('searchbox') as HTMLInputElement).value).toBe('장서우');
    expect(view.getByRole('status').textContent).toBe('검색 결과 1건 / 전체 3건');
    expect(view.get).toHaveBeenCalledTimes(1);
  });

  it('조회 갱신 시 현재 검색어로 새 응답을 즉시 계산한다', async () => {
    const view = await setup();
    fireEvent.change(view.input, { target: { value: 'Grace' } });
    act(() => { vi.advanceTimersByTime(260); });
    expect(view.getByRole('status').textContent).toBe('검색 결과 2건 / 전체 3건');
    await act(async () => {
      view.client.setQueryData(opsQueryKey('anonymous', false), { ...response, leads: [leads[2]] });
      vi.advanceTimersByTime(0);
    });
    expect(view.getByRole('status').textContent).toBe('검색 결과 0건 / 전체 1건');
    expect(view.getByText('검색 결과가 없습니다')).toBeTruthy();
    expect(view.get).toHaveBeenCalledTimes(1);
  });

  it('재조회 오류에서 복구해도 입력값과 적용된 검색을 서로 잃지 않는다', async () => {
    const view = await setup();
    fireEvent.change(view.input, { target: { value: '장서우' } });
    act(() => { vi.advanceTimersByTime(260); });
    view.get.mockRejectedValueOnce(new Error('QA 조회 오류'));
    await act(async () => {
      await view.client.refetchQueries({ queryKey: opsQueryKey('anonymous', false) });
      vi.advanceTimersByTime(0);
    });
    expect(view.queryByRole('searchbox')).toBeNull();
    await act(async () => {
      view.client.setQueryData(opsQueryKey('anonymous', false), response);
      vi.advanceTimersByTime(0);
    });
    expect((view.getByRole('searchbox') as HTMLInputElement).value).toBe('장서우');
    expect(view.getByRole('status').textContent).toBe('검색 결과 1건 / 전체 3건');
  });
});
