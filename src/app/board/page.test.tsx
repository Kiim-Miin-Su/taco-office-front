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
