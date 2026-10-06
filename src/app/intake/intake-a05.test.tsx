/** @file-guide
 * 목적: intake-a05.test.tsx (test) · 최신 관리자 수정사항의 상담 → 공용 학생 등록 진입을 회귀한다.
 * 책임/재사용: 실제 IntakePage·useOps를 쓰고 route 이동과 쓰기 부작용이 없음을 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Lead, Ops } from '@/api/types';
import { useSession } from '@/store/useSession';
import IntakePage from './page';
import { INTAKE_HEAD_FIXTURE } from './intake-head.fixture';
import { OPS_HEAD_FIXTURE } from '@/app/ops/ops-head.fixture';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const failed = {
  id: 3, name: '신유나', school: '대치중', ownerName: 'Grace', reason: '비용', grade: 'G7', stage: 'failed', stopAt: 'after_first', failFrom: 'hold',
  ageDays: 3, createdAt: '2026-09-20', studentId: null, ownerId: 3, source: 'blog', sourceLabel: '블로그', nextStages: [], touches: [],
  nextOn: null, nextLabel: null, nextTone: null, stageDue: null, plan: [], appts: [], recheckOn: null, failedAt: '2026-08-18',
} as unknown as Lead;
const response = {
  leads: [failed], complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: true,
  feedback: [], feedbackNeedsFix: 0, canComment: false, planDues: [], planOverdue: 0, planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE, intakeHead: INTAKE_HEAD_FIXTURE,
} as unknown as Ops;

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); push.mockReset();
  useSession.setState({ me: null });
});

describe('최신 관리자 수정사항 — 상담 → 공용 학생 등록', () => {
  it('상담 번호만 URL로 넘기고 등록 쓰기나 성공 결과를 만들지 않는다', async () => {
    useSession.setState({ me: null, ready: true });
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: url === '/ops' ? response : { items: [] } }) as never);
    const post = vi.spyOn(api, 'post');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    clients.push(client);
    const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
    fireEvent.click(within(await waitFor(() => view.getByRole('group', { name: '상담 보기' }))).getByRole('button', { name: '등록 실패 내역' }));
    fireEvent.click(within(await waitFor(() => view.getByRole('list', { name: '실패한 상담' }))).getByRole('button', { name: '학생 등록' }));
    expect(push).toHaveBeenCalledWith('/students/new?source=intake&lead=3');
    expect(post).not.toHaveBeenCalled();
    expect(view.queryByRole('dialog', { name: /등록 확정/ })).toBeNull();
  });
});
