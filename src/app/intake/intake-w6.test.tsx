/** @file-guide
 * 목적: intake-w6.test.tsx (test) · §23 1:1 대조 wave 6 — 등록 카드 「등록 수업」 한 줄(23-11) · 카드 단계별 단추 줄(23-14).
 * 책임/재사용: 실제 IntakePage·useOps 캐시를 쓰고 네트워크만 대역으로 바꾼다. 낱말·서는 단추는 서버 픽스처 그대로다(화면이 짓지 않는다).
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

// 서랍 할 일의 「원본」이 여는 주소(`/intake?lead=`) — 시험마다 바꾼다 (W11 A')
const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(nav.search) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const base: Lead = {
  id: 0, name: '', school: null, ownerName: '김민선', reason: null, grade: 'G8',
  stage: 'first', stopAt: null, ageDays: 1, createdAt: '2026-09-20', studentId: null, ownerId: 1,
  source: 'kakao', sourceLabel: '카카오채널', nextStages: [], touches: [], nextOn: null, nextLabel: null, nextTone: null,
};
// 서버가 만든 「등록 수업」 줄과 단추 줄 — 화면은 그대로 그린다
const enrolled: Lead = {
  ...base, id: 31, name: '박시온', stage: 'enrolled', studentId: 21,
  lessons: ['모의수업 A 주1 · 김재훈', 'SAT Math 주2 · 김재훈'],
  cardActions: [{ key: 'touch', label: '사후 관리', to: null }],
};
const hold: Lead = {
  ...base, id: 32, name: '정하윤', stage: 'hold', recheckOn: '2026-09-21',
  nextStages: [{ key: 'wait2nd', label: '2차 대기' }, { key: 'second', label: '2차 상담' }],
  cardActions: [{ key: 'enroll', label: '등록', to: null }, { key: 'fail', label: '실패', to: null }, { key: 'extend', label: '연장 +2일', to: null }],
};
const waiting: Lead = {
  ...base, id: 33, name: '임채린', stage: 'wait2nd', want: '겨울 특강',
  nextStages: [{ key: 'second', label: '2차 상담' }, { key: 'hold', label: '보류' }],
  cardActions: [{ key: 'schedule', label: '스케줄에 2건 만들기', to: null }, { key: 'move', label: '2차 진행', to: 'second' }],
};
const failed: Lead = {
  ...base, id: 34, name: '신유나', stage: 'failed', stopAt: 'after_first', failFrom: 'first', revivalStage: 'first', revivalSource: 'explicit',
  cardActions: [{ key: 'detail', label: '내역 · 상태', to: null }, { key: 'resume', label: '되살리기', to: null }],
};
const first: Lead = {
  ...base, id: 35, name: '백승우', stage: 'first', want: 'MAP Reading 점수 올리기',
  nextStages: [{ key: 'wait2nd', label: '2차 대기' }, { key: 'second', label: '2차 상담' }, { key: 'hold', label: '보류' }],
  cardActions: [{ key: 'appt', label: '2차 · 진단 잡기', to: null }, { key: 'enroll', label: '바로 등록', to: null }, { key: 'fail', label: '여기서 종료', to: null }],
};

const response: Ops = {
  leads: [enrolled, hold, waiting, failed, first],
  complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: false,
  feedback: [], feedbackNeedsFix: 0, canComment: false, planDues: [], planOverdue: 0, planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: INTAKE_HEAD_FIXTURE,
};

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); useSession.setState({ me: null }); nav.search = ''; });

async function setup() {
  useSession.setState({ me: null, ready: true });
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: url === '/ops' ? response : { staff: [], students: [], lib: [], rooms: [], kinds: [], subs: [] } }) as never);
  const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) => ({ data: url.includes('/appts/schedule') ? { lead: hold, created: 2, unavailable: [] } : hold }) as never);
  const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: waiting } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText('박시온')).toBeTruthy());
  return { view, post, patch };
}

const actionsOf = (view: ReturnType<typeof render>, name: string) => view.getByRole('group', { name: `${name} 카드 단추` });

describe('§23 등록 카드의 「등록 수업」 한 줄 (23-11)', () => {
  it('서버가 만든 줄을 원본 모양(「과목 주N · 강사」)으로 잇는다 — 등록 건에만 선다', async () => {
    const { view } = await setup();
    expect(view.getByText('모의수업 A 주1 · 김재훈 · SAT Math 주2 · 김재훈')).toBeTruthy();
    // 읽는 사람에게는 앞말 「등록 수업:」이 붙는다(보이지 않는 글) — 등록 건 하나에만 선다(서버 undefined/null 이면 줄이 없다)
    expect(view.getAllByText(/^등록 수업:/)).toHaveLength(1);
    expect(view.getByRole('button', { name: /^박시온.*등록 수업: 모의수업 A 주1/ })).toBeTruthy();
  });
});

describe('§23 1차 카드의 「원하는 것」 한 줄 (23-11 · A-01)', () => {
  it('1차 카드에만 서버 칸(want) 그대로 — 다른 단계는 배치안 자리라 싣지 않는다', async () => {
    const { view } = await setup();
    expect(view.getByText('MAP Reading 점수 올리기')).toBeTruthy();
    expect(view.getByRole('button', { name: /^백승우.*원하는 것: MAP Reading 점수 올리기/ })).toBeTruthy();
    expect(view.queryByText('겨울 특강')).toBeNull();
    expect(view.getAllByText(/^원하는 것:/)).toHaveLength(1);
  });
});

describe('§23 카드 단계별 단추 줄 (23-14)', () => {
  it('카드 몸통과 단추 줄은 형제다 — 단추 안에 단추가 없다(접근성) · 몸통을 누르면 상세 서랍', async () => {
    const { view } = await setup();
    expect(view.container.querySelectorAll('button button')).toHaveLength(0);
    // 단계마다 서버가 준 단추 그대로
    expect(within(actionsOf(view, '정하윤')).getAllByRole('button').map((b) => b.textContent)).toEqual(['등록', '실패', '연장 +2일']);
    expect(within(actionsOf(view, '백승우')).getAllByRole('button').map((b) => b.textContent)).toEqual(['2차 · 진단 잡기', '바로 등록', '여기서 종료']);
    expect(within(actionsOf(view, '박시온')).getAllByRole('button').map((b) => b.textContent)).toEqual(['사후 관리']);
    fireEvent.click(view.getByRole('button', { name: /^임채린/ }));
    await waitFor(() => expect(view.getByRole('dialog')).toBeTruthy());
  });

  it('「연장 +2일」 · 「스케줄에 N건 만들기」는 이미 있는 서버 경로를 바로 부른다', async () => {
    const { view, post } = await setup();
    fireEvent.click(within(actionsOf(view, '정하윤')).getByRole('button', { name: '연장 +2일' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/32/hold/extend'));
    fireEvent.click(within(actionsOf(view, '임채린')).getByRole('button', { name: '스케줄에 2건 만들기' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/33/appts/schedule'));
  });

  it('단계 이동 · 되살리기는 두 번 눌러야 한다(서랍과 같은 확정) — 도착 단계는 서버가 준 to 그대로', async () => {
    const { view, post, patch } = await setup();
    const move = within(actionsOf(view, '임채린')).getByRole('button', { name: '2차 진행' });
    fireEvent.click(move);
    expect(patch).not.toHaveBeenCalled();
    fireEvent.click(within(actionsOf(view, '임채린')).getByRole('button', { name: '한 번 더 누르면 2차 진행' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/ops/leads/33/stage', { to: 'second' }));

    fireEvent.click(within(actionsOf(view, '신유나')).getByRole('button', { name: '되살리기' }));
    expect(post).not.toHaveBeenCalledWith('/ops/leads/34/resume', expect.anything());
    fireEvent.click(within(actionsOf(view, '신유나')).getByRole('button', { name: '한 번 더 누르면 되살리기' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/34/resume', {}));
  });

  it('입력이 필요한 단추(실패 · 사후 관리)는 상세 서랍의 그 칸을 연다 — 사유 분류 고르기(중단 지점은 묻지 않는다 · N-87) · 접촉 기록', async () => {
    const { view } = await setup();
    fireEvent.click(within(actionsOf(view, '정하윤')).getByRole('button', { name: '실패' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('lead-reason-kind'));
    fireEvent.click(within(actionsOf(view, '박시온')).getByRole('button', { name: '사후 관리' }));
    await waitFor(() => expect(view.getByRole('dialog').textContent).toContain('박시온'));
    // 접촉 기록 칸이 열려 있다(「어떻게」 고르기)
    await waitFor(() => expect(view.getByLabelText('어떻게')).toBeTruthy());
  });
});

describe('서랍 할 일의 「원본」이 그 상담 건을 연다 (W11 A\' · N-86 사후 관리)', () => {
  it('`/intake?lead=<id>` 로 들어오면 그 건의 상세 서랍이 열린다 — 번호는 서버가 준 것 그대로', async () => {
    nav.search = '?lead=31';
    const { view } = await setup();
    await waitFor(() => expect(view.getByRole('dialog').textContent).toContain('박시온'));
  });

  it('목록에 없는 번호 · 형식이 틀린 번호면 아무것도 열리지 않는다(볼 수 있는지는 서버 목록이 정한다)', async () => {
    nav.search = '?lead=999';
    const missing = await setup();
    expect(missing.view.queryByRole('dialog')).toBeNull();
    cleanup();
    nav.search = '?lead=31abc';
    const malformed = await setup();
    expect(malformed.view.queryByRole('dialog')).toBeNull();
  });
});
