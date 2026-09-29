/** @file-guide
 * 목적: ops-w6.test.tsx (test) · §67 1:1 대조 wave 6 — 컴플레인 카드의 문의자 관계(67-5) · 결과 칸의 마무리 날짜(67-6) · 접수/처리 창의 관계 칸.
 * 책임/재사용: 실제 OpsPage·ComplaintForm·ComplaintDetail·useOps 캐시를 쓰고 네트워크만 대역으로 바꾼다. 낱말·날짜는 서버 픽스처 그대로다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api } from '@/api/client';
import type { Complaint, Me, Ops } from '@/api/types';
import { useSession } from '@/store/useSession';
import OpsPage from './page';
import { INTAKE_HEAD_FIXTURE } from '@/app/intake/intake-head.fixture';
import { OPS_HEAD_FIXTURE } from './ops-head.fixture';

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/ops/PlanReport', () => ({ PlanReport: () => null }));

const me: Me = {
  id: 4, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};

const cpl = (over: Partial<Complaint>): Complaint => ({
  id: 1, area: 'schedule', areaLabel: '스케줄', studentId: 5, studentName: '고은설', stage: 'received', body: '수업 시간 변경 안내가 늦었다는 말씀',
  action: null, result: null, createdAt: '2026-08-19', ageDays: 2, ownerName: null, overdueDays: 0, teacherChanged: false, canWithdraw: false, refunds: [],
  ...over,
});

const data: Ops = {
  leads: [], todos: [], plans: [], meetings: [], suggestions: [], feedback: [], marketing: [],
  feedbackNeedsFix: 0, canComment: true, canSeeAmounts: true, planDues: [], planOverdue: 0,
  planStages: [],
  cplStages: [{ key: 'received', label: '접수', sub: '받았습니다' }, { key: 'acting', label: '대응', sub: '조치 중' }, { key: 'closed', label: '결과', sub: '마무리했습니다' }],
  cplAreas: [{ key: 'lesson', label: '수업' }, { key: 'schedule', label: '스케줄' }, { key: 'teacher', label: '선생님' }],
  cplSeverities: [{ key: 'light', label: '가벼움' }],
  // 서버가 준 문의자 관계 낱말 둘 — 화면은 고르기만 한다
  cplRequesters: [{ key: 'mother', label: '어머니' }, { key: 'father', label: '아버지' }],
  complaints: [
    cpl({ id: 1, requester: 'mother', requesterLabel: '어머니' }),
    cpl({ id: 2, studentName: '이하린', area: 'teacher', areaLabel: '선생님', stage: 'closed', body: '강사 교체 요청', result: '교체', ownerName: '김범준',
      requester: 'mother', requesterLabel: '어머니', closedOn: '2026-08-12', ageDays: 40 }),
    // 옛 「결과」 행 — 마무리한 날을 모른다(null) · 관계도 모른다
    cpl({ id: 3, studentName: '양찬욱', stage: 'closed', body: '옛 결과 건', result: '마무리', ownerName: '김범준', closedOn: null, ageDays: 70 }),
  ],
  ...OPS_HEAD_FIXTURE,
  intakeHead: INTAKE_HEAD_FIXTURE,
};

const clients: QueryClient[] = [];
function setup() {
  nav.search = 'tab=complaint';
  useSession.setState({ me, ready: true });
  vi.spyOn(api, 'get').mockImplementation(((url: string) =>
    Promise.resolve({ data: url === '/meta' ? { staff: [{ id: 9, name: '김범준' }], students: [{ id: 5, name: '고은설', grade: '8' }] } : data })) as never);
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: data.complaints[0] } as never);
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: data.complaints[0] } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><OpsPage /></QueryClientProvider>);
  return { view, post, patch };
}

beforeEach(() => { useSession.setState({ me: null, ready: false }); });
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); nav.search = ''; });

describe('§67 카드 — 문의자 관계 · 마무리 날짜 (67-5 · 67-6)', () => {
  it('학생 이름 옆에 누가 알렸는지(서버 낱말) — 모르는 건은 아무것도 붙지 않는다', async () => {
    const { view } = setup();
    const card = await waitFor(() => view.getByRole('button', { name: '컴플레인 수업 시간 변경 안내가 늦었다는 말씀' }));
    expect(card.textContent).toContain('고은설어머니');
    const old = view.getByRole('button', { name: '컴플레인 옛 결과 건' });
    expect(old.textContent).not.toContain('어머니');
    expect(old.textContent).not.toContain('아버지');
  });

  it('결과 칸 카드의 바닥 오른쪽은 마무리한 날 「08-12」 — 모르면 「—」이고 접수 뒤 경과일을 적지 않는다', async () => {
    const { view } = setup();
    const done = await waitFor(() => view.getByRole('button', { name: '컴플레인 강사 교체 요청' }));
    expect(done.textContent).toContain('08-12');
    expect(done.textContent).not.toContain('일 지남');
    const old = view.getByRole('button', { name: '컴플레인 옛 결과 건' });
    expect(within(old).getByTitle('마무리 날짜 기록 없음').textContent).toBe('—');
    expect(old.textContent).not.toContain('일 지남');
  });

  it('「+ 접수」 창에서 고른 관계가 서버 코드값으로 간다', async () => {
    const { view, post } = setup();
    fireEvent.click(await waitFor(() => view.getByRole('button', { name: '+ 접수' })));
    const dialog = await waitFor(() => view.getByRole('dialog'));
    fireEvent.change(within(dialog).getByLabelText('갈래'), { target: { value: 'schedule' } });
    fireEvent.change(within(dialog).getByLabelText('내용'), { target: { value: '안내가 늦었다는 말씀' } });
    fireEvent.click(within(within(dialog).getByRole('group', { name: '누가 알렸나' })).getByRole('button', { name: '어머니' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '접수' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/complaints', expect.objectContaining({ requester: 'mother' })));
  });

  it('처리 창에서 관계를 바꾸면 그 칸만 보내고 · 결과 건은 마무리 날짜를 보여 준다(받는 칸은 아니다)', async () => {
    const { view, patch } = setup();
    fireEvent.click(await waitFor(() => view.getByRole('button', { name: '컴플레인 강사 교체 요청' })));
    const dialog = await waitFor(() => view.getByRole('dialog'));
    expect(dialog.textContent).toContain('마무리 2026-08-12');
    fireEvent.change(within(dialog).getByLabelText('누가 알렸나'), { target: { value: 'father' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/ops/complaints/2', { requester: 'father' }));
  });
});
