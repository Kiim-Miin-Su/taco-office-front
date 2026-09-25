/** @file-guide
 * 목적: S4 관리자 GUIDE 발송 입력·편집 경계·권한·재조회를 실제 page/hook/Axios로 검증한다.
 * 책임/재사용: RouteAccess/QueryClient는 실제 구현, Next 이동과 HTTP만 격리한다. PNOTI 발송과 구분한다.
 * 검증/작업 지침: docs/AGENT.md · docs/sprint/evidence/TBO-52/s4-guide/plan.md
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import GuidesPage from '@/app/guides/page';
import { RouteAccess } from '@/components/shell/RequireAuth';
import { api } from '@/api/client';
import { family } from '@/api/queries';
import type { Guide, Guides, Me } from '@/api/types';
import { useSession } from '@/store/useSession';

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/guides', useRouter: () => nav }));
const me: Me = { id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null,
  canAdminPage: true, canCrudAll: true, canSeeProfit: false, canCrudAttendance: true,
  canMoney: false, canWage: false, canApprove: true, canHide: true, canGpaPack: true };
const initial: Guide = { id: 5, serId: 8, studentId: 4, teacherId: 2, reason: 'new', state: 'ready', pending: true,
  studentName: '학생', teacherName: '강사', serTitle: '수업', body: '저장한 안내', dueOn: null, eventOn: '2026-09-24',
  sourceOccurrenceId: 55, createdAt: '2026-09-24T09:00:00+09:00', sentAt: null, acknowledgedAt: null,
  overdueDays: 0, siblingCount: 0, canSend: true, canAck: false, sendBlockedReason: null, acknowledgedAfterSeconds: null };
const clients: QueryClient[] = [];
const originalAdapter = api.defaults.adapter;
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; useSession.getState().signOut(); vi.clearAllMocks(); });

function setup(viewer = me, guide = initial) {
  let current = guide;
  let status = 200;
  let release: (() => void) | undefined;
  let hold = false;
  const calls: Array<{ method?: string; url?: string; body?: unknown }> = [];
  const data = (): Guides => ({ guides: [current], perLesson: [], todoCount: 1, scopedTeacherId: null,
    stats: { monitoring: 1, overdue: 0, drafting: 0, sendPending: 1, teacherUnconfirmed: 0, repeatedTeacherChange: 0 },
    deliveryCapabilities: { parentExternal: false, teacherExternal: false, reason: '외부 미연결' } });
  api.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, body: config.data ? JSON.parse(config.data as string) : undefined });
    if (config.method === 'post') {
      if (hold) await new Promise<void>((resolve) => { release = resolve; });
      if (status !== 200) throw new AxiosError('거절', undefined, config, undefined,
        { config, status, statusText: 'Conflict', headers: {}, data: { code: 'GUIDE_NOT_READY', message: '안내 상태를 다시 확인해 주세요.' } });
      current = { ...current, state: 'sent', pending: false, canSend: false, sendBlockedReason: '이미 보냈습니다', sentAt: '2026-09-24T10:00:00+09:00' };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/guides' ? data()
      : config.url === '/guides/templates' ? [] : config.url === '/auth/me' ? useSession.getState().me : current };
  };
  useSession.getState().signIn('fixture', viewer);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><RouteAccess><GuidesPage /></RouteAccess></QueryClientProvider>);
  return { view, calls, hold: () => { hold = true; }, release: () => { hold = false; release?.(); }, fail: (next: number) => { status = next; },
    refresh: async (next: Guide) => { current = next; await act(async () => { await client.invalidateQueries({ queryKey: family.guides }); }); } };
}

it('저장된 GUIDE id와 빈 본문만 보내고 성공 뒤 새 GET으로 발송 완료를 표시한다', async () => {
  const { view, calls } = setup();
  fireEvent.click(await view.findByRole('button', { name: '강사에게 보내기' }));
  await view.findByText('발송 완료');
  expect(calls.filter((c) => c.method === 'post')).toEqual([{ method: 'post', url: '/guides/5/send', body: {} }]);
  expect(calls.filter((c) => c.url === '/guides')).toHaveLength(2);
});

it('canSend=false의 서버 사유를 보여 주며 발송 요청을 만들지 않는다', async () => {
  const { view, calls } = setup(me, { ...initial, canSend: false, sendBlockedReason: '활성 수신 강사가 없습니다.' });
  const button = await view.findByRole('button', { name: '강사에게 보내기' });
  expect(button).toHaveProperty('disabled', true);
  expect(view.getByText('활성 수신 강사가 없습니다.')).toBeTruthy();
  fireEvent.click(button);
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it('편집 중에는 발송을 막고 취소 후에도 미저장 본문을 전송하지 않는다', async () => {
  const { view, calls } = setup();
  fireEvent.click(await view.findByRole('button', { name: '안내 작성' }));
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '미저장 초안' } });
  expect(view.getByRole('button', { name: '강사에게 보내기' })).toHaveProperty('disabled', true);
  fireEvent.click(view.getByRole('button', { name: '취소' }));
  fireEvent.click(view.getByRole('button', { name: '강사에게 보내기' }));
  await view.findByText('발송 완료');
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(1);
  expect(calls.find((c) => c.method === 'post')?.body).toEqual({});
  expect(calls.some((c) => c.method === 'put')).toBe(false);
});

it('정상 refetch가 sent로 바꾸면 이전 writer를 닫아 저장·발송을 차단한다', async () => {
  const { view, calls, refresh } = setup();
  fireEvent.click(await view.findByRole('button', { name: '안내 작성' }));
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '오래된 초안' } });
  await refresh({ ...initial, state: 'sent', pending: false, canSend: false, sendBlockedReason: '이미 보냈습니다' });
  await waitFor(() => expect(view.queryByLabelText('안내 본문')).toBeNull());
  expect(view.getByRole('button', { name: '강사에게 보내기' })).toHaveProperty('disabled', true);
  expect(calls.filter((c) => c.method === 'put' || c.method === 'post')).toHaveLength(0);
});

it('같은 tick 연속 클릭은 한 요청이며 409 뒤 오류·행을 보존하고 재시도할 수 있다', async () => {
  const { view, calls, hold, release, fail } = setup();
  hold(); fail(409);
  const button = await view.findByRole('button', { name: '강사에게 보내기' });
  act(() => { button.click(); button.click(); });
  await waitFor(() => expect(calls.filter((c) => c.method === 'post')).toHaveLength(1));
  expect(view.getByRole('button', { name: '안내 작성' })).toHaveProperty('disabled', true);
  release();
  await view.findByText('안내 상태를 다시 확인해 주세요.');
  expect(view.getByText('저장한 안내')).toBeTruthy();
  expect(calls.filter((c) => c.url === '/guides')).toHaveLength(2);
  fail(200);
  fireEvent.click(view.getByRole('button', { name: '강사에게 보내기' }));
  await view.findByText('발송 완료');
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(2);
});

it.each([[false, false], [false, true], [true, false], [true, true]])('실제 권한 관리=%s/쓰기=%s에서 발송 입력과 요청을 방어한다', async (canAdminPage, canCrudAll) => {
  const { view, calls } = setup({ ...me, canAdminPage, canCrudAll });
  if (canAdminPage && canCrudAll) expect(await view.findByRole('button', { name: '강사에게 보내기' })).toHaveProperty('disabled', false);
  else {
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/schedule'));
    expect(view.queryByRole('button', { name: '강사에게 보내기' })).toBeNull(); expect(calls).toHaveLength(0);
  }
});

it.each(['canAdminPage', 'canCrudAll'] as const)('%s 회수 뒤 이전 발송 입력으로 쓰지 못한다', async (flag) => {
  const { view, calls } = setup();
  await view.findByRole('button', { name: '강사에게 보내기' });
  act(() => useSession.getState().setMe({ ...me, [flag]: false }));
  expect(view.queryByRole('button', { name: '강사에게 보내기' })).toBeNull();
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it('동일 tick에서 편집 열기 뒤 발송을 눌러도 이전 render의 발송 handler가 쓰지 않는다', async () => {
  const { view, calls } = setup();
  const open = await view.findByRole('button', { name: '안내 작성' });
  const send = view.getByRole('button', { name: '강사에게 보내기' });
  act(() => { open.click(); send.click(); });
  await waitFor(() => expect(view.getByLabelText('안내 본문')).toBeTruthy());
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it('긴 URL/HTML 모양 본문은 제한된 안내 셀에서 평문으로 표시한다', async () => {
  const body = '<img src=x onerror=alert(1)> https://example.test/' + 'a'.repeat(600);
  const { view, calls } = setup(me, { ...initial, body });
  const text = await view.findByText(body);
  expect(text.closest('td')).not.toBeNull();
  expect(text.className).toContain('[overflow-wrap:anywhere]');
  expect(text.className).toContain('max-w-md');
  expect(text.querySelector('img,a')).toBeNull();
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});
