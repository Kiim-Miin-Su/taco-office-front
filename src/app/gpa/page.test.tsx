/** @file-guide
 * 목적: 퇴역한 GPA 신규 쓰기 없이 과거 사이클·학생·회차 기록을 GET 전용으로 조회하는 화면 회귀.
 * 책임/재사용: 실제 GpaPage·QueryClient·API 훅을 사용하고 HTTP adapter로 조회 응답만 통제한다. RequireAuth mock은 실제 권한 검증이 아니다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { GpaBoard, GpaUse } from '@/api/types';
import GpaPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const use = (id: number, noteUrl: string | null, state: 'wait' | 'ok' = 'wait'): GpaUse => ({
  id, studentId: 2, svcKey: 'hw', points: 1, onDate: '2026-08-21', startMin: 1080, endMin: 1125, serId: 15,
  coordName: 'Kim', noteUrl, state, approvedByName: state === 'ok' ? '관리자' : null,
  approvedOn: state === 'ok' ? '2026-08-22T09:00:00+09:00' : null, canApprove: true,
});

const board: GpaBoard = {
  cycle: {
    id: 3, no: 3, from: '2026-07-27', to: '2026-08-23', closed: true,
    closedAt: '2026-08-24T09:00:00+09:00', closedByName: '김민선', canClose: false,
    closeBlockedReason: '이미 마감된 사이클입니다',
  },
  hasPrev: true,
  hasNext: false,
  services: [{ key: 'hw', name: '숙제 지원', point: 1 }],
  totalAlloc: 10,
  totalUsed: 1,
  totalWait: 0,
  totalRemain: 9,
  totalUses: 1,
  students: [{
    studentId: 2, name: '강라울', grade: null, tag: null, label: '강라울', coordName: 'Kim',
    alloc: 10, used: 1, wait: 0, remain: 9, over: false,
    svcs: [{ key: 'hw', name: '숙제 지원', count: 1, points: 1 }],
  }],
  uses: [use(21, 'https://example.test/record', 'ok')],
  lessons: [],
};

const originalAdapter = api.defaults.adapter;
afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
});

function setup(seed: Partial<GpaBoard> = {}) {
  const requests: Array<{ method?: string; url?: string; params?: unknown }> = [];
  api.defaults.adapter = vi.fn(async (config) => {
    requests.push({ method: config.method, url: config.url, params: config.params });
    return { config, status: 200, statusText: 'OK', headers: {}, data: { ...board, ...seed } };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><GpaPage /></QueryClientProvider>);
  return { view, requests };
}

it('퇴역 안내와 과거 사이클 통계를 GET /gpa 응답 그대로 표시한다', async () => {
  const { view, requests } = setup();
  expect(await view.findByRole('heading', { name: 'GPA 과거 기록' })).toBeTruthy();
  expect(view.getByText(/신규 등록·배정·승인 업무는 종료/)).toBeTruthy();
  for (const text of ['10p', '1p', '0p', '9p', '1회']) expect(view.container.textContent).toContain(text);
  expect(requests).toEqual([{ method: 'get', url: '/gpa', params: {} }]);
});

it('화면에는 신규 쓰기 input과 mutation 버튼이 하나도 없다', async () => {
  const { view, requests } = setup();
  await view.findByRole('heading', { name: 'GPA 과거 기록' });
  expect(view.container.querySelectorAll('input,select,textarea')).toHaveLength(0);
  for (const name of ['저장', '기록 (대기)', '승인', '삭제', '되돌림', '사이클 마감']) {
    expect(view.queryByRole('button', { name })).toBeNull();
  }
  expect(requests.every((request) => request.method === 'get')).toBe(true);
});

it('학생 카드를 고르면 과거 회차 표를 표시하고 다시 누르면 접는다', async () => {
  const { view } = setup();
  const card = await view.findByRole('button', { name: /^강라울/ });
  expect(card.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(card);
  const panel = view.getByRole('heading', { name: /강라울 회차 내역/ }).closest('section')!;
  expect(panel.textContent).toContain('08-21 18:00–18:45');
  expect(panel.textContent).toContain('숙제 지원');
  expect(panel.textContent).toContain('승인');
  fireEvent.click(card);
  expect(view.queryByRole('heading', { name: /강라울 회차 내역/ })).toBeNull();
});

it('안전한 과거 기록지 HTTP(S)는 새 탭 링크로 열어 준다', async () => {
  const { view } = setup();
  fireEvent.click(await view.findByRole('button', { name: /^강라울/ }));
  const link = view.getByRole('link', { name: '강라울 08-21 기록지 열기' });
  expect(link.getAttribute('href')).toBe('https://example.test/record');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noreferrer');
});

it.each([
  ['javascript:alert(1)'],
  ['data:text/html,test'],
  ['https://user:password@example.test/n'],
  ['https://example.test\\note'],
])('위험하거나 구형인 기록지 값 %s은 링크로 활성화하지 않는다', async (noteUrl) => {
  const { view } = setup({ uses: [use(22, noteUrl)] });
  fireEvent.click(await view.findByRole('button', { name: /^강라울/ }));
  const panel = view.getByRole('heading', { name: /강라울 회차 내역/ }).closest('section')!;
  expect(within(panel).getByText('기록지 있음')).toBeTruthy();
  expect(within(panel).queryByRole('link')).toBeNull();
});

it('이전 사이클은 anchor GET으로 읽고 현재 사이클 복귀는 기존 GET 캐시만 사용한다', async () => {
  const { view, requests } = setup();
  fireEvent.click(await view.findByRole('button', { name: '이전 사이클' }));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]).toEqual({ method: 'get', url: '/gpa', params: { anchor: '2026-07-26' } });
  fireEvent.click(view.getByRole('button', { name: '현재 사이클로' }));
  await waitFor(() => expect(view.queryByRole('button', { name: '현재 사이클로' })).toBeNull());
  expect(requests).toHaveLength(2);
  expect(requests.every((request) => request.method === 'get')).toBe(true);
});

it('사이클이 없을 때도 생성 CTA 없이 과거 기록이 없다고만 안내한다', async () => {
  const { view } = setup({ cycle: null, students: [], uses: [], totalAlloc: 0, totalUsed: 0, totalWait: 0, totalRemain: 0, totalUses: 0 });
  expect(await view.findByText('보존된 GPA 사이클 기록이 없습니다.')).toBeTruthy();
  expect(view.queryByRole('button', { name: /만들|등록|기록|저장/ })).toBeNull();
});
