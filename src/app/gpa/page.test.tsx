/** @file-guide
 * 목적: §82 GPA 머리 다섯 칸 · 포인트 규정 칩 · 초과 경고 · 학생 카드 격자 회귀.
 * 책임/재사용: 실제 GpaPage/useGpaBoard 를 쓰고 셸의 다른 조회만 어댑터로 막는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { GpaBoard } from '@/api/types';
import GpaPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

/** 원본 §82 의 수를 그대로 옮긴 한 벌 — 56p 배정 · 32p 사용 · 3p 대기 · 21p 잔여 · 18회 진행 */
const board: GpaBoard = {
  cycle: { id: 3, no: 3, from: '2026-07-27', to: '2026-08-23', closed: false },
  hasPrev: true, hasNext: false,
  services: [
    { key: 'hw', name: '숙제 지원', point: 1 },
    { key: 'prj', name: '프로젝트 피드백', point: 2 },
    { key: 'quiz', name: 'Quiz 대비', point: 2 },
    { key: 'test', name: 'Test 대비', point: 4 },
    { key: 'self', name: '자습 지원', point: 6 },
  ],
  totalAlloc: 56, totalUsed: 32, totalWait: 3, totalRemain: 21, totalUses: 18,
  students: [
    { studentId: 5, name: '이하린', grade: null, coordName: 'Hoon', alloc: 12, used: 16, wait: 0, remain: -4, over: true,
      svcs: [{ key: 'test', name: 'Test 대비', count: 4, points: 16 }] },
    { studentId: 4, name: '박하경', grade: null, coordName: '김범준', alloc: 8, used: 8, wait: 2, remain: -2, over: true,
      svcs: [{ key: 'hw', name: '숙제 지원', count: 8, points: 8 }, { key: 'quiz', name: 'Quiz 대비', count: 1, points: 2 }] },
    { studentId: 3, name: '민제인', grade: null, coordName: 'Sophia', alloc: 14, used: 8, wait: 0, remain: 6, over: false,
      svcs: [{ key: 'hw', name: '숙제 지원', count: 4, points: 4 }, { key: 'prj', name: '프로젝트 피드백', count: 2, points: 4 }] },
    { studentId: 2, name: '강라울', grade: null, coordName: 'Kim', alloc: 10, used: 0, wait: 1, remain: 9, over: false,
      svcs: [{ key: 'hw', name: '숙제 지원', count: 1, points: 1 }] },
    { studentId: 1, name: '고은성', grade: null, coordName: null, alloc: 12, used: 0, wait: 0, remain: 12, over: false, svcs: [] },
  ],
  uses: [],
};

const originalAdapter = api.defaults.adapter;
afterEach(() => { cleanup(); api.defaults.adapter = originalAdapter; });

function setup(seed: Partial<GpaBoard> = {}) {
  api.defaults.adapter = vi.fn(async (config) => (
    { config, status: 200, statusText: 'OK', headers: {}, data: { ...board, ...seed } }
  )) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><GpaPage /></QueryClientProvider>);
}

it('머리는 다섯 칸이고 다섯째는 포인트가 아니라 **회수**다 (§82)', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('56p'));
  const text = view.container.textContent ?? '';
  for (const w of ['56p', '32p', '3p', '21p', '18회']) expect(text).toContain(w);
  // 「진행」은 승인 대기도 센 값이라 서버가 준 그대로 쓴다 — 화면이 uses 를 세지 않는다
  expect(text).toContain('승인 대기 포함');
});

it('포인트 규정은 갈래마다 칩 하나이고 이월 규칙이 **닫히기 전에도** 보인다', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('포인트 규정'));
  const text = view.container.textContent ?? '';
  for (const w of ['1p 숙제 지원', '2p 프로젝트 피드백', '2p Quiz 대비', '4p Test 대비', '6p 자습 지원']) {
    expect(text).toContain(w);
  }
  expect(text).toContain('이월 없음 · 사이클 종료 시 소멸');
});

it('넘긴 학생을 위에 모아 세고 줄마다 배정·사용·초과를 적는다 (§82 붉은 경고)', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('배정 포인트를 넘긴 학생 2명'));
  const text = view.container.textContent ?? '';
  // 사용은 승인 + 대기다 — 대기도 이미 잔여에서 빠져 있다
  expect(text).toContain('박하경 — 배정 8p / 사용 10p · 2p 초과');
  expect(text).toContain('이하린 — 배정 12p / 사용 16p · 4p 초과');
});

it('카드는 서버가 준 순서 그대로 서고 화면이 다시 정렬하지 않는다 — 넘긴 학생이 먼저다', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('학생별 포인트 · 5명'));
  const names = [...view.container.querySelectorAll('input[type=number]')]
    .map((n) => n.getAttribute('aria-label'));
  expect(names).toEqual(['이하린 배정 포인트', '박하경 배정 포인트', '민제인 배정 포인트',
    '강라울 배정 포인트', '고은성 배정 포인트']);
});

it('카드의 서비스 칩은 서버가 준 회수·합계를 그대로 쓰고, 없으면 「사용 없음」이다', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('학생별 포인트 · 5명'));
  const text = view.container.textContent ?? '';
  expect(text).toContain('숙제 지원 8·8p');
  expect(text).toContain('Test 대비 4·16p');
  expect(text).toContain('사용 없음');
  // 초과는 칩이 아니라 남은 값으로 말한다 — 「2p 초과」·「9p 남음」
  expect(text).toContain('2p 초과');
  expect(text).toContain('9p 남음');
});
