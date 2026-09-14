/** @file-guide
 * 목적: §34~§36 수업 현황판 — 제목과 탭 낱말은 컷의 것이다 (C68).
 * 책임/재사용: 실제 BoardPage 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import BoardPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

const mount = async () => {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: unknown) => ({
    config, status: 200, statusText: 'OK', headers: {},
    data: { from: '2026-09-13', to: '2026-09-13', rows: [], weeks: [], teachers: [], summary: null },
  })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const v = render(<QueryClientProvider client={client}><BoardPage /></QueryClientProvider>);
  await waitFor(() => expect(v.getByText('수업 현황판')).toBeTruthy());
  return v;
};

/**
 * 컷 §34·§35·§36 은 **셋 다 같은 제목과 부제**를 쓴다. 우리는 탭마다 바꿔 달고 있었고,
 * 그래서 탭 이름이 「주간」인데 바로 위 제목은 「주별 현황판」이라 **한 화면에서 낱말이 갈렸다.**
 */
it('탭을 바꿔도 제목과 부제는 그대로다 — 컷 셋이 같은 한 줄을 쓴다', async () => {
  const v = await mount();
  const sub = '수업마다 교재 · 안내 · 줌 · 리포트가 다 됐는지 한눈에 봅니다';
  expect(v.getByText(sub)).toBeTruthy();
  fireEvent.click(v.getByRole('button', { name: '주별' }));
  expect(v.getByText('수업 현황판')).toBeTruthy();
  expect(v.getByText(sub)).toBeTruthy();
  fireEvent.click(v.getByRole('button', { name: '월별' }));
  expect(v.getByText('수업 현황판')).toBeTruthy();
  // 제목이 탭을 따라가면 여기서 「월별 현황판」이 잡힌다
  expect(v.queryByText('월별 현황판')).toBeNull();
});

it('탭 이름은 컷의 「일별 · 주별 · 월별」이다', async () => {
  const v = await mount();
  for (const word of ['일별', '주별', '월별']) expect(v.getByRole('button', { name: word })).toBeTruthy();
  for (const word of ['일간', '주간', '월간']) expect(v.queryByRole('button', { name: word })).toBeNull();
});

/**
 * 원본 §34~§36 의 머리는 **세 탭 공통 여섯 칸**이다 — 「3/20 다 됐음 · 16 교재 안 됨 ·
 * 3 안내 안 됨 · 2 줌 없음 · 0 리포트 안 씀 · 0 휴강」. 「완료율 %」 하나로는
 * *무엇이* 덜 됐는지를 말하지 못한다.
 */
it('머리 여섯 칸은 세 탭에 다 서고, 숫자는 서버가 센 것을 그대로 쓴다 (§34~§36)', async () => {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: unknown) => ({
    config, status: 200, statusText: 'OK', headers: {},
    data: {
      from: '2026-09-13', to: '2026-09-13', rows: [], weeks: [], teacherRows: [],
      missingCount: 17, computedAt: '2026-09-13T00:00:00.000Z',
      summary: {
        lessons: 20, doneLessons: 3, canceled: 0, missing: 21, completionRate: 74,
        marks: [
          { key: 'book', done: 4, total: 20, missing: 16 },
          { key: 'guide', done: 17, total: 20, missing: 3 },
          { key: 'zoom', done: 5, total: 7, missing: 2 },
          { key: 'report', done: 20, total: 20, missing: 0 },
        ],
      },
    },
  })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const v = render(<QueryClientProvider client={client}><BoardPage /></QueryClientProvider>);
  await waitFor(() => expect(v.getByText('3/20')).toBeTruthy());

  const head = () => {
    const t = v.container.textContent ?? '';
    return ['다 됐음', '교재 안 됨', '안내 안 됨', '줌 없음', '리포트 안 씀', '휴강'].every((w) => t.includes(w));
  };
  expect(head()).toBe(true);
  expect(v.getByText('16')).toBeTruthy();   // 교재 안 됨
  expect(v.getByText('3')).toBeTruthy();    // 안내 안 됨
  expect(v.getByText('2')).toBeTruthy();    // 줌 없음

  // 세 탭 공통 — 탭을 바꿔도 같은 여섯 칸이 선다
  fireEvent.click(v.getByRole('button', { name: '주별' }));
  await waitFor(() => expect(v.getByText('3/20')).toBeTruthy());
  expect(head()).toBe(true);
  fireEvent.click(v.getByRole('button', { name: '월별' }));
  await waitFor(() => expect(v.getByText('3/20')).toBeTruthy());
  expect(head()).toBe(true);
});
