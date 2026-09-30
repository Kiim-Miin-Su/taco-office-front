/** @file-guide
 * 목적: page.test.tsx — 강사 목록 선택과 일괄 상태 변경 회귀.
 * 책임/재사용: 실제 표 입력·선택 수·요청 수·부분 실패 UI를 검증하며 API·셸만 격리한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@/api/schema';
import { api } from '@/api/client';
import { useSession } from '@/store/useSession';
import StaffDirectoryPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

type Row = components['schemas']['StaffDirectoryRowDto'];
const rows: Row[] = [
  { id: 1, name: '김강사', englishName: 'Kim', title: '강사', active: true, hiredOn: null, createdAt: '2026-09-30T10:00:00+09:00' },
  { id: 2, name: '이강사', englishName: 'Lee', title: '강사', active: true, hiredOn: null, createdAt: '2026-09-29T10:00:00+09:00' },
];
const clients: QueryClient[] = [];

function setup(directoryRows: Row[] = rows) {
  useSession.setState({ me: { id: 7 } as NonNullable<ReturnType<typeof useSession.getState>['me']>, ready: true });
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: { items: directoryRows.map((row) => ({ ...row })), page: 1, pageSize: 10, total: directoryRows.length },
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><StaffDirectoryPage /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  vi.restoreAllMocks();
});

describe('강사 목록 선택', () => {
  it('개별 체크박스를 누르면 선택되고 다시 누르면 해제된다', async () => {
    const view = setup();
    const box = await view.findByRole('checkbox', { name: '김강사 선택' }) as HTMLInputElement;
    fireEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(true));
    expect(view.getByText('선택 1명')).toBeTruthy();
    fireEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(false));
    expect(view.getByText('선택 0명')).toBeTruthy();
  });

  it('페이지 전체 체크박스는 현재 페이지의 모든 강사를 선택·해제한다', async () => {
    const view = setup();
    const first = await view.findByRole('checkbox', { name: '김강사 선택' }) as HTMLInputElement;
    const all = view.getByRole('checkbox', { name: '이 페이지 강사 모두 선택' }) as HTMLInputElement;
    const second = view.getByRole('checkbox', { name: '이강사 선택' }) as HTMLInputElement;
    fireEvent.click(all);
    await waitFor(() => expect([all.checked, first.checked, second.checked]).toEqual([true, true, true]));
    expect(view.getByText('선택 2명')).toBeTruthy();
    fireEvent.click(all);
    await waitFor(() => expect([all.checked, first.checked, second.checked]).toEqual([false, false, false]));
    expect(view.getByText('선택 0명')).toBeTruthy();
  });

  it('일괄 상태 변경은 동시 요청을 4건 이하로 제한하고 실패한 행만 되돌린다', async () => {
    const serverRows = Array.from({ length: 9 }, (_, index): Row => ({
      ...rows[0], id: index + 1, name: `강사${index + 1}`,
    }));
    let inFlight = 0;
    let peakInFlight = 0;
    const pending: Array<() => void> = [];
    const patch = vi.spyOn(api, 'patch').mockImplementation((url, body) => new Promise((resolve, reject) => {
      const id = Number(url.match(/\/(\d+)\/active$/)?.[1]);
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      pending.push(() => {
        inFlight--;
        if (id === 3) { reject(new Error('권한 없음')); return; }
        serverRows[id - 1] = { ...serverRows[id - 1], active: (body as { active: boolean }).active };
        resolve({ data: {} });
      });
    }));
    const view = setup(serverRows);
    await view.findByRole('checkbox', { name: '강사1 선택' });
    fireEvent.click(view.getByRole('checkbox', { name: '이 페이지 강사 모두 선택' }));
    fireEvent.click(view.getByRole('button', { name: '사용 중지' }));

    let finished = 0;
    while (finished < serverRows.length) {
      await waitFor(() => expect(pending.length).toBeGreaterThan(0));
      const wave = pending.splice(0);
      await act(async () => { wave.forEach((complete) => complete()); });
      finished += wave.length;
    }

    await view.findByText('8명 변경 완료 · 1명 실패: 권한·현재 상태를 확인해 주세요');
    expect(patch.mock.calls.map(([url]) => url)).toEqual(serverRows.map((row) => `/drawer/staff/${row.id}/active`));
    expect(peakInFlight).toBeLessThanOrEqual(4);
    expect(view.getByText('선택 1명')).toBeTruthy();
    expect((view.getByRole('checkbox', { name: '강사3 선택' }) as HTMLInputElement).checked).toBe(true);
    expect(within(view.getByRole('link', { name: '강사3' }).closest('tr')!).getByText('사용 중')).toBeTruthy();
    expect(within(view.getByRole('link', { name: '강사1' }).closest('tr')!).getByText('사용 중지')).toBeTruthy();
  });

  it('세션이 바뀌면 대기 중인 행은 새 계정으로 보내지 않는다', async () => {
    const directoryRows = Array.from({ length: 6 }, (_, index): Row => ({
      ...rows[0], id: index + 1, name: `강사${index + 1}`,
    }));
    const pending: Array<() => void> = [];
    const patch = vi.spyOn(api, 'patch').mockImplementation(() => new Promise((resolve) => {
      pending.push(() => resolve({ data: {} }));
    }));
    const view = setup(directoryRows);
    await view.findByRole('checkbox', { name: '강사1 선택' });
    fireEvent.click(view.getByRole('checkbox', { name: '이 페이지 강사 모두 선택' }));
    fireEvent.click(view.getByRole('button', { name: '사용 중지' }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(4));

    await act(async () => {
      useSession.setState({ me: { id: 8 } as NonNullable<ReturnType<typeof useSession.getState>['me']> });
      pending.splice(0).forEach((complete) => complete());
    });
    await waitFor(() => expect(view.queryByText('변경 중…')).toBeNull());
    expect(patch).toHaveBeenCalledTimes(4);
  });
});
