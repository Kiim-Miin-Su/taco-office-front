/** @file-guide
 * 목적: intake-plan-appt.test.tsx (test) · §23·§24 1:1 대조 wave 3 — 배치안 초안 · 보류 연장 · 2차/진단 일정 · 당시 배치안 · 등록 창 채움.
 * 책임/재사용: 실제 IntakePage·useOps 캐시를 쓰고 네트워크만 대역으로 바꾼다. 줄 낱말·단가·「미생성」·재확인 날짜는 서버 픽스처 그대로다(화면이 짓지 않는다).
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

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const line = (seq: number, sub: [string, string], perWeek: number, teacher: [number, string] | null, unitPrice: number | null = null) => ({
  seq, kindKey: 'class', kindLabel: '수업', subKey: sub[0], subLabel: sub[1], perWeek,
  teacherId: teacher?.[0] ?? null, teacherName: teacher?.[1] ?? null,
  label: `${sub[1]} 주${perWeek}${teacher ? ` · ${teacher[1]}` : ''}`, unitPrice,
});

const base: Lead = {
  id: 1, name: '정하윤', school: '대치중', ownerName: 'Grace', reason: null, grade: 'G7',
  stage: 'hold', stopAt: null, ageDays: 3, createdAt: '2026-09-20', studentId: null, ownerId: 3,
  source: 'blog', sourceLabel: '블로그', nextStages: [{ key: 'second', label: '2차 상담' }], touches: [], nextOn: null, nextLabel: null, nextTone: null,
  stageDue: { task: '배치안 수락 여부 확인', dueOn: '2026-09-27', dueLabel: 'D-2', tone: 'neutral' },
  plan: [line(1, ['map-read', 'MAP Reading'], 3, [7, 'Allissa'], 90000), line(2, ['writing', 'Writing'], 2, [8, 'Kim'])],
  appts: [], recheckOn: '2026-09-27',
};
const waiting: Lead = {
  ...base, id: 2, name: '임채린', stage: 'wait2nd', recheckOn: null, plan: [],
  stageDue: { task: '2차 상담 2026-09-30 14:30', dueOn: '2026-09-30', dueLabel: 'D-5', tone: 'neutral' },
  appts: [
    { kind: 'diag', kindLabel: '진단', onDate: '2026-09-27', startMin: 600, endMin: 660, mode: 'offline', roomId: 3, placeLabel: '3층 컨설팅룸', serId: null, scheduled: false },
    { kind: 'second', kindLabel: '2차', onDate: '2026-09-30', startMin: 870, endMin: 930, mode: 'online', roomId: null, placeLabel: '온라인 줌', serId: 41, scheduled: true },
  ],
};
const failed: Lead = {
  ...base, id: 3, name: '신유나', stage: 'failed', stopAt: 'after_first', failFrom: 'hold', recheckOn: null, stageDue: null,
  reason: '비용 · 타 학원 등록', failedAt: '2026-08-18',
  plan: [line(1, ['map-read', 'MAP Reading'], 2, [7, 'Allissa'], 90000)],
};

const response: Ops = {
  leads: [base, waiting, failed],
  complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: true,
  feedback: [], feedbackNeedsFix: 0, canComment: false, planDues: [], planOverdue: 0, planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: { ...INTAKE_HEAD_FIXTURE, apptKinds: [{ key: 'diag', label: '진단' }, { key: 'second', label: '2차' }] },
};
const META = {
  kinds: [{ key: 'class', name: '수업' }], subs: [{ key: 'map-read', name: 'MAP Reading' }, { key: 'writing', name: 'Writing' }],
  rooms: [{ id: 3, name: '3층 컨설팅룸' }], staff: [{ id: 7, name: 'Allissa' }, { id: 8, name: 'Kim' }], students: [],
};

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); useSession.setState({ me: null }); });

async function setup() {
  useSession.setState({ me: null, ready: true });
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: url === '/ops' ? response : url === '/meta' ? META : { items: [] } }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText('정하윤')).toBeTruthy());
  return view;
}
const openCard = (view: Awaited<ReturnType<typeof setup>>, name: string) =>
  fireEvent.click(view.getAllByRole('button').find((b) => b.getAttribute('aria-pressed') !== null && b.textContent?.startsWith(name))!);

describe('§23 카드 — 배치안 한 줄 · 2차/진단 일정 · 보류 재확인 (23-15 · 23-16)', () => {
  it('배치안은 서버 줄 낱말을 잇고, 일정은 시간표에 없을 때만 「미생성」, 보류 카드는 재확인 날짜', async () => {
    const view = await setup();
    expect(view.getByText('MAP Reading 주3 · Allissa · Writing 주2 · Kim')).toBeTruthy();
    expect(view.getByText('재확인 2026-09-27')).toBeTruthy();
    const rows = within(view.getByRole('list', { name: '임채린 일정' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['진단09-27 10:00 · 3층 컨설팅룸미생성', '2차09-30 14:30 · 온라인 줌']);
    // 실패 칸 카드의 한 줄은 사유(기울임)이고 배치안은 싣지 않는다 — 배치안은 §24 「당시 배치안」에서 본다 (23-11)
    const reason = view.getByText('비용 · 타 학원 등록');
    expect(reason.className).toContain('italic');
    expect(view.queryByText('MAP Reading 주2 · Allissa')).toBeNull();
  });
});

describe('상세 서랍 — 배치안 · 연장 +2일 · 일정 · 스케줄에 만들기', () => {
  it('배치안을 고쳐 저장하면 과목 · 주 N회 · 강사만 보낸다(단가는 보내지 않는다) · 「연장 +2일」은 서버에 묻는다', async () => {
    const view = await setup();
    openCard(view, '정하윤');
    const plan = await waitFor(() => view.getByRole('region', { name: '배치안' }));
    expect(within(plan).getByText('₩90,000')).toBeTruthy();
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: base } as never);
    fireEvent.click(within(plan).getByRole('button', { name: '고치기' }));
    await waitFor(() => expect((within(plan).getByLabelText('배치안 1 종류') as HTMLSelectElement).value).toBe('class'));
    fireEvent.change(within(plan).getByLabelText('배치안 1 주 N회'), { target: { value: '4' } });
    fireEvent.click(within(plan).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/ops/leads/1/plan', {
      lines: [
        { kindKey: 'class', subKey: 'map-read', perWeek: 4, teacherId: 7 },
        { kindKey: 'class', subKey: 'writing', perWeek: 2, teacherId: 8 },
      ],
    }));
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...base, recheckOn: '2026-09-29' } } as never);
    fireEvent.click(within(plan).getByRole('button', { name: '연장 +2일' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/1/hold/extend'));
    await waitFor(() => expect(view.getByText('재확인 날짜를 2026-09-29(으)로 늘렸습니다')).toBeTruthy());
  });

  it('일정 한 줄을 적고, 시간표에 없는 줄 수만큼 「스케줄에 N건 만들기」 — 만든 줄은 여기서 고치지 않는다', async () => {
    const view = await setup();
    openCard(view, '임채린');
    const sec = await waitFor(() => view.getByRole('region', { name: '2차 · 진단 일정' }));
    expect(within(sec).queryByRole('button', { name: '2차 일정 고치기' })).toBeNull();
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: waiting } as never);
    fireEvent.click(within(sec).getByRole('button', { name: '진단 일정 고치기' }));
    fireEvent.change(within(sec).getByLabelText('시작'), { target: { value: '11:00' } });
    fireEvent.change(within(sec).getByLabelText('끝'), { target: { value: '12:00' } });
    fireEvent.click(within(sec).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/ops/leads/2/appts', {
      kind: 'diag', onDate: '2026-09-27', startMin: 660, endMin: 720, mode: 'offline', roomId: 3,
    }));
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { lead: waiting, created: 1, unavailable: [] } } as never);
    fireEvent.click(within(sec).getByRole('button', { name: '스케줄에 1건 만들기' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/2/appts/schedule'));
    await waitFor(() => expect(view.getByText('시간표에 1건 만들었습니다')).toBeTruthy());
  });
});

describe('§24 당시 배치안 · 바로 수업 등록 (24-07)', () => {
  it('실패 카드에 당시 배치안(단가는 서버 값) · 「바로 수업 등록」 창은 그 줄로 종류 · 과목 · 강사를 채운다', async () => {
    const view = await setup();
    fireEvent.click(within(view.getByRole('group', { name: '상담 보기' })).getByRole('button', { name: '등록 실패 내역' }));
    const box = await waitFor(() => view.getByRole('region', { name: '당시 배치안' }));
    expect(box.textContent).toContain('MAP Reading 주2 · Allissa · ₩90,000');
    expect(view.getByText('당시 배치안이 그대로 채워지고, 요일·시간만 다시 잡으면 됩니다')).toBeTruthy();
    fireEvent.click(within(view.getByRole('list', { name: '실패한 상담' })).getByRole('button', { name: '바로 수업 등록' }));
    const dialog = await waitFor(() => view.getByRole('dialog', { name: '등록 확정 — 신유나' }));
    await waitFor(() => expect((within(dialog).getByLabelText('수업 1 종류') as HTMLSelectElement).value).toBe('class'));
    expect((within(dialog).getByLabelText('수업 1 과목') as HTMLSelectElement).value).toBe('map-read');
    expect((within(dialog).getByLabelText('수업 1 강사') as HTMLSelectElement).value).toBe('7');
    expect(within(dialog).getByText('상담 배치안 1줄이 채워졌습니다 — 요일·시간만 다시 잡으면 됩니다.')).toBeTruthy();
    expect(within(dialog).getByText('배치안 주 2회')).toBeTruthy();
  });
});
