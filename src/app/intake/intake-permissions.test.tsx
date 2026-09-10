/** @file-guide
 * 목적: intake-permissions.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { opsQueryKey } from '@/api/queries';
import type { Me, Ops } from '@/api/types';
import { AdminTopNavigation } from '@/components/shell/AdminNavigation';
import { RouteAccess } from '@/components/shell/RequireAuth';
import { useSession } from '@/store/useSession';
import IntakePage from './page';

const nav = vi.hoisted(() => ({ path: '/intake', replace: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path, useRouter: () => ({ replace: nav.replace }) }));
// 셸의 서랍/메타 요청만 제외한다. 메뉴·RouteAccess·RequireAuth·IntakePage·useOps는 실제 구현이다.
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const manager: Me = {
  id: 2, name: '매니저', role: 'manager', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};
const teacher: Me = {
  ...manager, id: 1, name: '강사', role: 'teacher', canAdminPage: false, canCrudAll: false,
  canCrudAttendance: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false,
};
const ceo: Me = { ...manager, id: 4, name: '대표', role: 'ceo', canSeeProfit: true, canMoney: true };
const response: Ops = {
  leads: [{ id: 71, name: '접근 검수 학생', stage: 'first', createdAt: '2026-09-10', ageDays: 0 }],
  complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: false,
};
const clients: QueryClient[] = [];

function SessionNavigation() {
  const me = useSession((s) => s.me);
  return <AdminTopNavigation pathname={nav.path} me={me} badges={{}} />;
}

function setup(me: Me | null, ready = true) {
  useSession.setState({ me, ready });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <SessionNavigation />
      <RouteAccess><IntakePage /></RouteAccess>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('상담 메뉴 → 직접 URL → 실제 useOps 조회 경계 (D-R39)', () => {
  // false 조합은 최종 MeDto 방어 입력이다. STAFF에 진입/CRUD 예외 컬럼이 있다는 뜻이 아니다.
  it.each([
    { name: '기본 강사', me: teacher, allowed: false },
    { name: '기본 매니저', me: manager, allowed: true },
    { name: '기본 관리자', me: { ...manager, id: 3, name: '관리자', role: 'admin' } as Me, allowed: true },
    { name: '기본 대표', me: ceo, allowed: true },
    { name: '진입 false / CRUD true', me: { ...manager, canAdminPage: false }, allowed: false },
    { name: '진입 true / CRUD false', me: { ...manager, canCrudAll: false }, allowed: false },
    { name: '진입 false / CRUD false', me: { ...manager, canAdminPage: false, canCrudAll: false }, allowed: false },
    { name: '강사 money true만으로 상담을 열지 않음', me: { ...teacher, canMoney: true }, allowed: false },
    { name: '매니저 money true 예외', me: { ...manager, canMoney: true }, allowed: true },
    { name: '대표 money false여도 상담 접근 유지', me: { ...ceo, canMoney: false }, allowed: true },
  ])('$name: 메뉴와 본문/GET 허용=$allowed', async ({ me, allowed }) => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup(me);
    expect(Boolean(view.container.querySelector('a[href="/intake"]'))).toBe(allowed);

    if (allowed) {
      await waitFor(() => expect(view.getByText('접근 검수 학생')).toBeTruthy());
      expect(view.getByRole('link', { name: '상담' }).getAttribute('aria-current')).toBe('page');
      expect(get.mock.calls).toEqual([['/ops']]);
      expect(view.client.getQueryData(opsQueryKey(me.id, me.canMoney))).toEqual(response);
      expect(nav.replace).not.toHaveBeenCalled();
    } else {
      await act(async () => {});
      expect(view.queryByRole('heading', { name: '상담' })).toBeNull();
      expect(view.queryByText('접근 검수 학생')).toBeNull();
      expect(get).not.toHaveBeenCalled();
      expect(view.client.getQueryData(opsQueryKey(me.id, me.canMoney))).toBeUndefined();
      expect(nav.replace).toHaveBeenCalledWith('/schedule');
    }
  });

  it.each([false, true])('세션 없음·ready=%s에서는 상담 메뉴/본문/GET을 닫는다', async (ready) => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup(null, ready);
    await act(async () => {});
    expect(view.container.querySelector('a[href="/intake"]')).toBeNull();
    expect(view.queryByRole('heading', { name: '상담' })).toBeNull();
    expect(get).not.toHaveBeenCalled();
    if (ready) expect(nav.replace).toHaveBeenCalledWith('/login');
    else expect(nav.replace).not.toHaveBeenCalled();
  });

  it('금지 → 허용 → 금지에서 GET은 0 → 1 → 1이며 캐시가 남아도 본문은 즉시 사라진다', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup({ ...manager, canAdminPage: false });
    expect(get).not.toHaveBeenCalled();
    expect(view.container.querySelector('a[href="/intake"]')).toBeNull();

    act(() => useSession.setState({ me: manager }));
    await waitFor(() => expect(view.getByText('접근 검수 학생')).toBeTruthy());
    expect(view.getByRole('link', { name: '상담' })).toBeTruthy();
    expect(get.mock.calls).toEqual([['/ops']]);

    act(() => useSession.setState({ me: { ...manager, canCrudAll: false } }));
    expect(view.container.querySelector('a[href="/intake"]')).toBeNull();
    expect(view.queryByRole('heading', { name: '상담' })).toBeNull();
    expect(view.queryByText('접근 검수 학생')).toBeNull();
    // 회수 시 캐시 삭제를 가장하지 않는다. 남아 있는 캐시도 비허용 본문에서 소비되면 안 된다.
    expect(view.client.getQueryData(opsQueryKey(manager.id, manager.canMoney))).toEqual(response);
    expect(get.mock.calls).toEqual([['/ops']]);
    expect(nav.replace).toHaveBeenLastCalledWith('/schedule');
  });

  it('권한 회수 전에 시작한 /ops가 늦게 응답해도 비허용 본문을 다시 표시하지 않는다', async () => {
    let resolve!: (value: { data: Ops }) => void;
    const pending = new Promise<{ data: Ops }>((done) => { resolve = done; });
    const get = vi.spyOn(api, 'get').mockReturnValue(pending);
    const view = setup(manager);
    await waitFor(() => expect(get.mock.calls).toEqual([['/ops']]));
    act(() => useSession.setState({ me: { ...manager, canAdminPage: false } }));
    await act(async () => { resolve({ data: response }); await pending; });
    expect(view.container.querySelector('a[href="/intake"]')).toBeNull();
    expect(view.queryByRole('heading', { name: '상담' })).toBeNull();
    expect(view.queryByText('접근 검수 학생')).toBeNull();
    expect(get.mock.calls).toEqual([['/ops']]);
    expect(nav.replace).toHaveBeenLastCalledWith('/schedule');
  });
});
