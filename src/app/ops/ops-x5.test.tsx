/** @file-guide
 * 목적: ops-x5.test.tsx — 운영 잔여 물결(x5) — 제목 줄 탭 · 갈래별 기간 띠 · §59 등록·필터·범례 · §63 짧은 이름 · §64 날짜 상자 · §67 색·카드 (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원문 컷 §59·§60·§61·§62·§63·§64·§67 과 제품 운영 화면의 남은 차이(g6 C-1 · C-2 · C-3 · C-5 · C-7 · C-8 · C-9 ·
 * 59-3 · 59-4 · 59-5 · 62-2 · 62-3 · 63-7 · 64-1 · 67-3 · 67-4 · 67-7). 수와 낱말은 서버가 준 것을 그린다 (D-R37 · D-R18).
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api } from '@/api/client';
import type { Me, Ops } from '@/api/types';
import { useSession } from '@/store/useSession';
import { todayKst } from '@/lib/calendar';
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

const ops = (over: Partial<Ops> = {}): Ops => ({
  leads: [], complaints: [], todos: [], plans: [], meetings: [], suggestions: [], feedback: [],
  feedbackNeedsFix: 0, canComment: true, canSeeAmounts: true, planDues: [], planOverdue: 0,
  planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: INTAKE_HEAD_FIXTURE,
  marketing: [
    { id: 1, channel: 'kakao', item: 'channel', channelLabel: '카카오', itemLabel: '채널 응대', title: '카카오채널 문의 12건 응대',
      name: '카카오채널 문의 12건 응대', onDate: '2026-08-18', byId: 7, byName: 'Grace', impressions: null, inquiries: 12, enrolled: 4, cost: 0, costPerEnroll: 0 },
    { id: 2, channel: 'naver', item: 'ad', channelLabel: '네이버', itemLabel: '광고', title: '검색광고 · 대치 국제학교 키워드',
      name: '검색광고 · 대치 국제학교 키워드', onDate: '2026-08-19', byId: 8, byName: '김성재', impressions: 5000, inquiries: 3, enrolled: 1, cost: 50000, costPerEnroll: 50000 },
  ],
  mktChannels: [{ key: 'kakao', label: '카카오' }, { key: 'naver', label: '네이버' }],
  mktItems: [{ key: 'channel', label: '채널 응대' }, { key: 'ad', label: '광고' }],
  canCreateMarketing: true,
  mktChannelCounts: [{ key: 'kakao', label: '카카오', count: 1 }, { key: 'naver', label: '네이버', count: 1 }],
  mktByCounts: [{ key: '7', label: 'Grace', count: 1 }, { key: '8', label: '김성재', count: 1 }],
  mktItemCounts: [{ key: 'ad', label: '광고', count: 1 }, { key: 'channel', label: '채널 응대', count: 1 }],
  mktDays: 2,
  ...over,
});

const clients: QueryClient[] = [];
function setup(data: Ops, search = '') {
  nav.search = search;
  useSession.setState({ me, ready: true });
  const get = vi.spyOn(api, 'get').mockImplementation(((url: string) =>
    Promise.resolve({ data: url === '/meta' ? { staff: [] } : data })) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><OpsPage /></QueryClientProvider>);
  return { ...view, get };
}
const opsCalls = (get: { mock: { calls: unknown[][] } }) =>
  get.mock.calls.filter((c) => c[0] === '/ops').map((c) => (c[1] as { params: Record<string, string> }).params);

beforeEach(() => { useSession.setState({ me: null, ready: false }); });
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); nav.search = ''; });

describe('운영 셸 — 제목 줄 · 머리 칸 · 부제 (C-1 · C-2 · C-3)', () => {
  it('탭 카드는 제목과 같은 줄이고, 원문에 없는 머리 칸·바닥 설명은 없다 · 부제는 원문 문장', async () => {
    const view = setup(ops());
    await waitFor(() => expect(view.getByRole('tablist', { name: '운영 보기' })).toBeTruthy());
    const center = view.container.querySelector('[data-page-header-center]');
    expect(center?.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('운영 보기');
    expect(view.getByText('마케팅 · 기획 · 회의를 한 곳에서 봅니다')).toBeTruthy();
    for (const gone of ['열린 할 일', '접수 컴플레인', '검토 대기 기획', '속기록 미작성', '여기 모이는 이유']) {
      expect(view.queryByText(gone)).toBeNull();
    }
  });
});

describe('기간 띠는 원문이 두는 갈래에만 · 제 모양으로 (C-5 · 67-3)', () => {
  it('§64 할 일에는 띠가 없고 전체를 받는다', async () => {
    const view = setup(ops());
    await waitFor(() => expect(opsCalls(view.get)).toHaveLength(1));
    expect(opsCalls(view.get)[0]).toEqual({});
    expect(view.queryByRole('group', { name: '기간' })).toBeNull();
  });

  it('§59 는 「일간 주간 월간」(전체 없음) · 주간이 기본 — 그 주로 받는다', async () => {
    const view = setup(ops(), 'tab=mkt');
    const band = await waitFor(() => view.getByRole('group', { name: '기간' }));
    expect(within(band).getAllByRole('button').map((b) => b.textContent)).toEqual(['일간', '주간', '월간']);
    expect(within(band).getByRole('button', { name: '주간' }).getAttribute('aria-pressed')).toBe('true');
    const [week] = opsCalls(view.get);
    expect(week.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(week.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('§67 은 「일별 주별 월별 전체」 · 월별이 기본 — 그 달로 받는다', async () => {
    const view = setup(ops(), 'tab=complaint');
    const band = await waitFor(() => view.getByRole('group', { name: '기간' }));
    expect(within(band).getAllByRole('button').map((b) => b.textContent)).toEqual(['일별', '주별', '월별', '전체']);
    expect(within(band).getByRole('button', { name: '월별' }).getAttribute('aria-pressed')).toBe('true');
    expect(opsCalls(view.get)[0].from).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('§60 대표 피드백에는 띠가 없다 — 고쳐야 할 것은 기간으로 가리지 않는다', async () => {
    const view = setup(ops(), 'tab=mkt');
    const tabs = await waitFor(() => view.getByRole('tablist', { name: '마케팅 보기' }));
    fireEvent.click(within(tabs).getByRole('tab', { name: /^대표 피드백/ }));
    expect(view.queryByRole('group', { name: '기간' })).toBeNull();
  });
});

describe('§59 마케팅 트래킹 (59-3 · 59-4 · 59-5)', () => {
  it('「+ 오늘 한 것」은 서버가 열 때만 선다 (59-3 · D-R39)', async () => {
    const view = setup(ops(), 'tab=mkt');
    await waitFor(() => expect(view.getByRole('button', { name: '+ 오늘 한 것' })).toBeTruthy());
    cleanup();
    const closed = setup(ops({ canCreateMarketing: false }), 'tab=mkt');
    await waitFor(() => expect(closed.getByRole('tablist', { name: '마케팅 보기' })).toBeTruthy());
    expect(closed.queryByRole('button', { name: '+ 오늘 한 것' })).toBeNull();
  });

  it('「N건 M일 진행」과 항목 범례는 서버 수 그대로다 (59-5)', async () => {
    const view = setup(ops({ mktDays: 3 }), 'tab=mkt');
    await waitFor(() => expect(view.getByText('3일 진행')).toBeTruthy());
    expect(view.getByText('광고 1')).toBeTruthy();
    expect(view.getByText('채널 응대 1')).toBeTruthy();
  });

  it('「어디에 · 누가」 칩은 받은 줄을 거른다 — 요청이 늘지 않는다 (59-4)', async () => {
    const view = setup(ops(), 'tab=mkt');
    await waitFor(() => expect(view.getByText('검색광고 · 대치 국제학교 키워드')).toBeTruthy());
    fireEvent.click(within(view.getByRole('group', { name: '어디에' })).getByRole('button', { name: '카카오 1' }));
    expect(view.queryByText('검색광고 · 대치 국제학교 키워드')).toBeNull();
    expect(view.getByText('카카오채널 문의 12건 응대')).toBeTruthy();
    fireEvent.click(within(view.getByRole('group', { name: '어디에' })).getByRole('button', { name: '전체 2' }));
    fireEvent.click(within(view.getByRole('group', { name: '누가' })).getByRole('button', { name: '김성재 1' }));
    expect(view.getByText('검색광고 · 대치 국제학교 키워드')).toBeTruthy();
    expect(view.queryByText('카카오채널 문의 12건 응대')).toBeNull();
    expect(opsCalls(view.get)).toHaveLength(1);
  });
});

describe('§61 · §62 · §63 · §64 · §67', () => {
  it('§63 줄 머리 칩은 짧은 이름이고 종류 칩 줄의 눌린 칩은 진한 채움이다 (63-7 · C-8)', async () => {
    const view = setup(ops({
      meetings: [{ id: 11, mtType: 'plan', mtTypeLabel: '기획 회의', mtTypeShort: '기획', title: '겨울 특강', onDate: '2026-09-18',
        attendees: 0, confirmed: 0, hasMinutes: false, serId: null, startMin: null, endMin: null, placeLabel: null,
        waiting: 0, upcoming: true, attendeeList: [] }],
      mtTypeCounts: [{ key: 'plan', label: '기획', count: 1 }],
    }), 'tab=meeting');
    const row = await waitFor(() => view.getByRole('button', { name: /^회의 기획 회의/ }));
    expect(within(row).getByText('기획')).toBeTruthy();
    const chips = view.getByRole('group', { name: '회의 종류' });
    expect(within(chips).getByRole('button', { name: '전체' }).querySelector('[data-chip-pressed="ink"]')).toBeTruthy();
  });

  it('§64 날짜 묶음은 테두리 상자 · 긴 날짜 · 오늘이면 「오늘」 (64-1)', async () => {
    const today = todayKst();
    const view = setup(ops({
      todos: [{ id: 1, title: '교재 2권 미리 준비', toId: 7, toName: 'Hoon', fromName: '김민선', dueOn: today,
        done: false, src: 'lesson', srcLabel: '수업', overdueDays: 0, lesson: null, go: null }],
      todoOwnerCounts: [{ key: '7', label: 'Hoon', count: 1 }],
    }));
    const group = await waitFor(() => {
      const el = view.container.querySelector(`[data-todo-group="${today}"]`);
      if (!el) throw new Error('날짜 묶음이 아직 없다');
      return el as HTMLElement;
    });
    expect(group.className).toContain('rounded-xl');
    expect(within(group).getByRole('heading', { level: 3 }).textContent).toMatch(/^\d{2}년 \d{1,2}월 \d{1,2}일 .요일1건오늘$/);
  });

  it('§62 지난 줄은 분홍 · 구분·단계는 점 칩 (62-2 · 62-3)', async () => {
    const view = setup(ops({
      planDues: [
        { key: 'plan:1', kind: 'plan', kindLabel: '기획 마감', planId: 1, title: '9월 유입', planTitle: '9월 유입',
          dueOn: '2026-08-25', overdueDays: 4, dueLabel: '4일 지남', ownerName: '홍지승', stage: 'review', stageLabel: '검토 요청' },
      ],
    }), 'tab=plan');
    const tabs = await waitFor(() => view.getByRole('tablist', { name: '기획 보기' }));
    fireEvent.click(within(tabs).getByRole('tab', { name: /^기한/ }));
    const cell = view.getByText('4일 지남');
    expect(cell.closest('tr')?.className).toContain('bg-red/5');
    expect(view.getByText('기획 마감').closest('span')?.querySelector('[aria-hidden]')).toBeTruthy();
  });

  it('§61·§67 기한 지난 카드는 분홍 바탕 + 붉은 테두리 · §67 카드에 조치 글이 없고 보통은 주황 (C-9 · 67-7)', async () => {
    const view = setup(ops({
      cplStages: [{ key: 'received', label: '접수', sub: '받았습니다' }, { key: 'acting', label: '대응', sub: '조치 중' }],
      complaints: [
        { id: 1, area: 'lesson', areaLabel: '수업', studentName: '양찬욱', stage: 'acting', body: '수업 진도가 느리다는 말씀',
          action: '분반 검토 중', result: null, createdAt: '2026-08-20', ageDays: 1, ownerName: '김범준',
          dueOn: '2026-08-20', overdueDays: 1, severity: 'normal', severityLabel: '보통', teacherChanged: false, canWithdraw: false },
        { id: 2, area: 'intake', areaLabel: '상담', studentName: '고은설', stage: 'received', body: '안내가 늦음',
          action: null, result: null, createdAt: '2026-08-21', ageDays: 0, ownerName: null, overdueDays: 0, teacherChanged: false, canWithdraw: false },
      ],
      areaCounts: [{ key: 'lesson', label: '수업', count: 1 }, { key: 'intake', label: '상담', count: 0 }],
    }), 'tab=complaint');
    const late = await waitFor(() => view.getByRole('button', { name: '컴플레인 수업 진도가 느리다는 말씀' }));
    expect(late.closest('article')?.className).toContain('border-red/60');
    expect(view.getByRole('button', { name: '컴플레인 안내가 늦음' }).closest('article')?.className).not.toContain('border-red/60');
    expect(view.queryByText('분반 검토 중')).toBeNull();
    expect(within(late).getByText('보통').className).toContain('bg-orange');
    // 0 건 갈래는 숫자 없이 「상담」 · 색 점 (67-4 · C-8)
    const chips = view.getByRole('group', { name: '컴플레인 갈래' });
    expect(within(chips).getByRole('button', { name: '상담' })).toBeTruthy();
    expect(chips.querySelectorAll('[data-chip-dot]')).toHaveLength(2);
  });
});
