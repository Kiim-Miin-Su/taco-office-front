/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { opsQueryKey } from '@/api/queries';
import type { Lead, Ops } from '@/api/types';
import { FAILURE_SEARCH_LABEL } from '@/lib/intake-search';
import IntakePage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

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
  feedback: [], feedbackNeedsFix: 0, canComment: false, planDues: [], planOverdue: 0, planStages: [],
  intakeHead: { funnel: [], enrollRate: 0, owners: [], alerts: [] },
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

/**
 * 원본 §23 의 머리 — **화면은 아무것도 세지 않는다** (D-R37 · N-19).
 * 퍼널의 낱말·순서·수, 등록률, 담당 칩, 경고 문장이 전부 서버에서 온다.
 */
describe('§23 상담 머리 — 퍼널 띠 · 담당 칩 · 경고 줄', () => {
  async function head(intakeHead: Ops['intakeHead']) {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response, intakeHead } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
    // 「등록률」은 데이터 없이도 서므로 기다림의 표지로 못 쓴다 — 서버가 준 칸을 기다린다
    await waitFor(() => expect(view.getByRole('button', { name: '김범준 12' })).toBeTruthy());
    return view;
  }

  const full: Ops['intakeHead'] = {
    funnel: [
      { key: 'first', label: '1차 상담', count: 4, funnel: true },
      { key: 'wait2nd', label: '2차 대기', count: 2, funnel: true },
      { key: 'second', label: '2차 상담', count: 1, funnel: true },
      { key: 'hold', label: '보류', count: 2, funnel: true },
      { key: 'enrolled', label: '등록', count: 3, funnel: false },
      { key: 'failed', label: '등록 실패', count: 6, funnel: false },
    ],
    enrollRate: 33,
    owners: [{ id: 3, name: '김범준', count: 12 }, { id: null, name: '담당 없음', count: 6 }],
    alerts: [
      { key: 'unpaid', label: '미수 6명 ₩4,006,600', count: 6, amount: 4006600, go: '/accounting' },
      { key: 'noSchedule', label: '스케줄 미생성 9', count: 9, amount: null, go: '/schedule' },
      { key: 'noInvoice', label: '등록했는데 청구서 없음 0', count: 0, amount: null, go: '/accounting' },
    ],
  };

  it('여섯 칸을 서버가 준 순서대로 늘어놓고 등록 전/후 경계만 다른 화살표로 가른다', async () => {
    const view = await head(full);
    const text = view.container.textContent ?? '';
    // 여섯째 칸의 이름은 「실패」가 아니라 「등록 실패」다 — 낱말은 서버가 쥔다 (D-R18)
    for (const w of ['41차 상담', '22차 대기', '12차 상담', '2보류', '3등록', '6등록 실패', '33%', '등록률']) {
      expect(text).toContain(w);
    }
    // 깔때기 안은 › 셋, 등록 전→후 경계는 ⇒ 하나, 결과끼리는 | 하나
    const marks = [...view.container.querySelectorAll('[aria-hidden]')].map((n) => n.textContent);
    expect(marks).toEqual(['›', '›', '›', '⇒', '|']);
  });

  it('담당 칩은 서버가 센 사람만 세우고 화면은 「전체」만 붙인다', async () => {
    const view = await head(full);
    expect(view.getByRole('button', { name: '전체 4' })).toBeTruthy();
    expect(view.getByRole('button', { name: '김범준 12' })).toBeTruthy();
    expect(view.getByRole('button', { name: '담당 없음 6' })).toBeTruthy();
  });

  it('0 인 경고는 서지 않고, 남은 경고는 서버 문장 그대로 선다', async () => {
    const view = await head(full);
    expect(view.getByRole('button', { name: '미수 6명 ₩4,006,600' })).toBeTruthy();
    expect(view.getByRole('button', { name: '스케줄 미생성 9' })).toBeTruthy();
    expect(view.queryByRole('button', { name: /청구서 없음/ })).toBeNull();
  });

  it('경고가 모두 0 이면 줄 자체가 사라진다 — 늘 서 있는 경고는 아무도 읽지 않는다', async () => {
    const view = await head({ ...full, alerts: full.alerts.map((a) => ({ ...a, count: 0 })) });
    expect(view.queryByRole('button', { name: /미수/ })).toBeNull();
    expect(view.getByText('등록률')).toBeTruthy();
  });
});
