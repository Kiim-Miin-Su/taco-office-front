/** @file-guide
 * 목적: BOC-12a 관리자 수정사항 p118~120의 회의 속기록 전용 탭 회귀
 * 책임/재사용: OpsPage가 기존 MeetingDto와 MeetingDetail을 재사용해 작성 대상과 월별 이력을 연결하는지 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me, Ops } from '@/api/types';
import { addDays, todayKst } from '@/lib/calendar';
import { useSession } from '@/store/useSession';
import { INTAKE_HEAD_FIXTURE } from '@/app/intake/intake-head.fixture';
import { OPS_HEAD_FIXTURE } from './ops-head.fixture';
import OpsPage from './page';

const nav = vi.hoisted(() => ({ search: 'tab=minutes' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/ops/PlanReport', () => ({ PlanReport: () => null }));
vi.mock('@/components/ops/MeetingDetail', () => ({ MeetingDetail: ({ meetingId }: { meetingId: number | null }) => meetingId ? <div>회의 상세 #{meetingId}</div> : null }));

const me: Me = {
  id: 4, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};

const today = todayKst();
const meeting = (id: number, onDate: string, hasMinutes: boolean) => ({
  id, mtType: 'general' as const, mtTypeLabel: '일반 회의', mtTypeShort: '일반', title: `회의 ${id}`, onDate,
  attendees: 2, confirmed: 2, hasMinutes, serId: id, startMin: 600, endMin: 660,
  placeLabel: '1호', waiting: 0, upcoming: onDate >= today, attendeeList: [],
});
const data: Ops = {
  leads: [], complaints: [], todos: [], plans: [], suggestions: [], feedback: [], marketing: [],
  feedbackNeedsFix: 0, canComment: true, canSeeAmounts: true, planDues: [], planOverdue: 0,
  planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: INTAKE_HEAD_FIXTURE,
  meetings: [
    meeting(1, addDays(today, -2), false),
    meeting(2, addDays(today, 8), false),
    meeting(3, today, true),
    meeting(4, addDays(today, -7), false),
    meeting(5, addDays(today, 7), false),
    meeting(6, addDays(today, -8), false),
  ],
  mtTypeCounts: [{ key: 'general', label: '일반', count: 6 }],
  mtTypes: [{ key: 'general', label: '일반 회의' }],
  canCreateMeeting: true,
  canCreatePlan: true,
  range: { from: null, to: null, label: '전체' },
};

describe('BOC-12a 회의 속기록 전용 탭', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); useSession.setState({ me: null, ready: false }); });

  it('할 일 탭을 대기함으로 옮기고, 작성 대상과 월별 이력을 기존 회의 상세로 연결한다', async () => {
    useSession.setState({ me, ready: true });
    vi.spyOn(api, 'get').mockImplementation(((url: string) => Promise.resolve({ data: url === '/meta' ? { staff: [] } : data })) as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><OpsPage /></QueryClientProvider>);

    const tabs = await waitFor(() => within(view.getByRole('tablist', { name: '운영 보기' })).getAllByRole('tab'));
    expect(tabs.map((tab) => tab.querySelector('div')?.firstChild?.textContent))
      .toEqual(['마케팅', '기획', '회의', '회의 속기록', '컴플레인']);
    expect(within(view.getByRole('tablist', { name: '운영 보기' })).queryByRole('tab', { name: /^할 일/ })).toBeNull();

    expect(await view.findByRole('heading', { name: '속기록을 쓸 회의' })).toBeTruthy();
    expect(view.getByText('회의 1')).toBeTruthy();
    expect(view.getByText('회의 4')).toBeTruthy();
    expect(view.getByText('회의 5')).toBeTruthy();
    expect(view.queryByText('회의 2')).toBeNull();
    expect(view.queryByText('회의 6')).toBeNull();
    expect(view.getByRole('button', { name: '회의 1 속기록 쓰기' })).toBeTruthy();
    expect(view.getByRole('button', { name: '회의 1 미리 안건 쓰기' }).hasAttribute('disabled')).toBe(true);

    expect(view.getByRole('heading', { name: '월별 속기록 이력' })).toBeTruthy();
    expect(view.getByText('회의 3')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '회의 3 열기' }));
    expect(view.getByText('회의 상세 #3')).toBeTruthy();
  });
});
