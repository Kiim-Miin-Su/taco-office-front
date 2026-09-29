/** @file-guide
 * 목적: intake-a05.test.tsx (test) · PDF A-05 「화면이 그 학생 주간 시간표로 이동한다」 — 등록 확정 성공 뒤의 이동과 결과 한 줄.
 * 책임/재사용: 실제 IntakePage·useOps 를 쓰고 등록 확정 창만 결과를 돌려주는 대역으로 바꾼다(창 안의 흐름은 LeadEnrollDialog.test 가 본다).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { EnrollResult, Lead, Ops } from '@/api/types';
import { useSession } from '@/store/useSession';
import { useWorkspace } from '@/store/useWorkspace';
import IntakePage from './page';
import { INTAKE_HEAD_FIXTURE } from './intake-head.fixture';
import { OPS_HEAD_FIXTURE } from '@/app/ops/ops-head.fixture';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

/** 서버가 돌려준 등록 결과 — 수업 둘 · 둘째 줄이 더 이른 첫 수업이다(이동할 주는 **가장 이른** 첫 수업의 주) */
const RESULT = {
  leadId: 3, preview: false, studentId: 57, studentName: '신유나', studentCreated: true, startedOn: '2026-10-01',
  enrollments: [], invoice: null, invoiceSkipped: null, bookIssues: [], booksMissing: [], guideDrafts: 1,
  notifiedTeachers: 2, notifiedStaff: 3, unavailable: [], stage: 'enrolled', diagBookApplied: false, latestDiag: null, guardianCarried: null,
  series: [
    { serId: 901, kindKey: 'class', title: 'Writing', ruleLabel: '매주 월·수', startMin: 960, endMin: 1020, monthCount: 9, firstLessonOn: '2026-10-05' },
    { serId: 902, kindKey: 'class', title: 'MAP Reading', ruleLabel: '매주 금', startMin: 1020, endMin: 1080, monthCount: 5, firstLessonOn: '2026-10-02' },
  ],
} as unknown as EnrollResult;

vi.mock('@/components/ops/LeadEnrollDialog', () => ({
  LeadEnrollDialog: ({ open, onDone, onClose }: { open: boolean; onDone?: (r: EnrollResult) => void; onClose: () => void }) =>
    open ? <button type="button" onClick={() => { onDone?.(RESULT); onClose(); }}>대역 등록 확정</button> : null,
}));

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
  useSession.setState({ me: null }); useWorkspace.setState({ handoff: null });
});

describe('A-05 등록 확정 → 그 학생 주간 시간표', () => {
  it('성공하면 가장 이른 첫 수업의 주로 학생별 시간표를 열고, 결과 한 줄을 그 화면에 넘긴다', async () => {
    useSession.setState({ me: null, ready: true });
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: url === '/ops' ? response : { items: [] } }) as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    clients.push(client);
    const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
    fireEvent.click(within(await waitFor(() => view.getByRole('group', { name: '상담 보기' }))).getByRole('button', { name: '등록 실패 내역' }));
    fireEvent.click(within(await waitFor(() => view.getByRole('list', { name: '실패한 상담' }))).getByRole('button', { name: '바로 수업 등록' }));
    fireEvent.click(await waitFor(() => view.getByRole('button', { name: '대역 등록 확정' })));

    expect(push).toHaveBeenCalledWith('/schedule?studentId=57&date=2026-10-02');
    expect(useWorkspace.getState().handoff).toEqual({
      to: '/schedule',
      text: '신유나 등록 확정 — 수업 2개 · 첫 수업 2026-10-02 · 안내 초안 1건',
    });
  });
});
