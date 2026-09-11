/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Guide, Guides, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import GuidesPage from './page';

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 4, name: '대표', role: 'ceo', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};
const guide = (id: number, state: Guide['state'], pending: boolean): Guide => ({
  id, reason: 'new', state, pending, studentName: `학생${id}`, teacherName: null, serTitle: null,
  body: null, dueOn: null, createdAt: '2026-09-01', overdueDays: 0,
});
const clients: QueryClient[] = [];
function setup(response: Guides) {
  vi.spyOn(api, 'get').mockResolvedValue({ data: response });
  useSession.setState({ me, ready: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><GuidesPage /></QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  vi.restoreAllMocks();
});

describe('안내 집계 — 「보내야 함」은 서버 pending 플래그가 정본 (GUIDE_PENDING_DB)', () => {
  it('카드 둘이 pending으로만 갈린다', async () => {
    const view = setup({
      guides: [guide(1, 'draft', true), guide(2, 'ready', true), guide(3, 'sent', false), guide(4, 'read', false)],
      perLesson: [], todoCount: 2, scopedTeacherId: null,
    });
    await waitFor(() => expect(view.getByText('학생1')).toBeTruthy());
    const card = (label: string) => view.getByText(label).parentElement?.textContent ?? '';
    expect(card('안내 — 보내야 함')).toContain('2');
    expect(card('안내 — 보냄')).toContain('2');
  });

  it('낱말이 아니라 플래그를 따른다 — 서버가 pending을 뒤집으면 집계도 뒤집힌다', async () => {
    // 화면이 몰래 state 목록(draft·ready)을 다시 정의하면 이 응답에서 1이 아니라 2가 나온다.
    const view = setup({
      guides: [guide(1, 'draft', false), guide(2, 'sent', true)],
      perLesson: [], todoCount: 1, scopedTeacherId: null,
    });
    await waitFor(() => expect(view.getByText('학생1')).toBeTruthy());
    const card = (label: string) => view.getByText(label).parentElement?.textContent ?? '';
    expect(card('안내 — 보내야 함')).toContain('1');
    expect(card('안내 — 보냄')).toContain('1');
  });
});
