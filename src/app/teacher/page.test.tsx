/** @file-guide
 * 목적: 강사 홈 §8 「내 설정」 — 변경 요청 버튼·한 달에 한 번·서버 판정 소비 회귀 (C39).
 * 책임/재사용: 실제 TeacherHomePage/useTeacherHome 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me, TeacherHome } from '@/api/types';
import { useSession } from '@/store/useSession';
import TeacherHomePage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 6, name: '이다현', role: 'teacher', roleLabel: '강사', title: null, canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false,
  canApprove: false, canHide: false, canGpaPack: false,
};

const home = (over: Partial<TeacherHome['settings']> = {}): TeacherHome => ({
  todayDate: '2026-09-12', today: [], upcoming: [],
  week: { lessons: 0, minutes: 0, unwritten: 0 },
  todo: { unwrittenReports: 0, waitingApprovals: 0, openChangeRequests: 0, openStaffRequests: 0 },
  settings: {
    name: '이다현', timezone: 'Asia/Seoul', wageRate: 42000, wageFrom: '2026-01-01',
    timezones: [{ tz: 'Asia/Seoul', name: '한국 (KST)' }, { tz: 'America/New_York', name: '미국 동부' }],
    requests: [], canAskWage: true, wageAskableOn: null, canAskTz: true, ...over,
  },
});

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

function setup(data: TeacherHome, post?: ReturnType<typeof vi.fn>) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { method?: string }) => {
    if (String(config.method).toLowerCase() === 'post' && post) return post(config);
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><TeacherHomePage /></QueryClientProvider>);
}

it('원문 그대로 — 시간대·시급 각각 변경 요청 버튼과 「관리자 승인 후 적용」이 보인다 (강사 덱 §8)', async () => {
  const view = setup(home());
  await waitFor(() => expect(view.getByRole('button', { name: '변경 요청' })).toBeTruthy());
  expect(view.getByRole('button', { name: '변경 신청' })).toBeTruthy();
  expect(view.container.textContent).toContain('관리자 승인 후 적용');
  expect(view.container.textContent).toContain('한 달에 한 번');
});

it('시급 신청은 서버 판정(canAskWage)으로 잠기고 언제부터 되는지 말한다', async () => {
  const view = setup(home({ canAskWage: false, wageAskableOn: '2026-10-05' }));
  await waitFor(() => expect(view.getByRole('button', { name: '변경 신청' })).toBeTruthy());
  expect(view.getByRole('button', { name: '변경 신청' }).hasAttribute('disabled')).toBe(true);
  expect(view.container.textContent).toContain('2026-10-05부터 다시 됩니다');
});

it('시급 요청은 입력한 값 그대로 서버로 간다 — 화면이 적용하지 않는다', async () => {
  const post = vi.fn(async (config) => ({
    config, status: 201, statusText: 'Created', headers: {},
    data: { id: 1, reqType: 'wage_change', label: '시급 변경', asked: '45,000원/시간', state: 'pending', createdOn: '2026-09-12', rejectReason: null },
  }));
  const view = setup(home(), post);
  await waitFor(() => expect(view.getByRole('button', { name: '변경 신청' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '변경 신청' }));
  fireEvent.change(view.getByLabelText('바라는 시급'), { target: { value: '45000' } });
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '3년차' } });
  fireEvent.click(view.getByRole('button', { name: '요청 올리기' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[0][0].url).toContain('/teacher/requests');
  expect(JSON.parse(String(post.mock.calls[0][0].data))).toEqual({ reqType: 'wage_change', rate: 45000, reason: '3년차' });
});

it('시간대 목록에서 지금 쓰는 것은 빠지고, 올린 이력과 반려 사유가 그대로 보인다', async () => {
  const view = setup(home({
    canAskTz: false,
    requests: [
      { id: 2, reqType: 'tz_change', label: '시간대 변경', asked: 'America/New_York', state: 'pending', createdOn: '2026-09-11', rejectReason: null },
      { id: 1, reqType: 'wage_change', label: '시급 변경', asked: '45,000원/시간', state: 'rejected', createdOn: '2026-08-20', rejectReason: '3개월 뒤 재검토' },
    ],
  }));
  await waitFor(() => expect(view.container.textContent).toContain('시간대 변경'));
  expect(view.getByRole('button', { name: '변경 요청' }).hasAttribute('disabled')).toBe(true);
  expect(view.container.textContent).toContain('3개월 뒤 재검토');
  expect(view.container.textContent).toContain('45,000원/시간');
});
