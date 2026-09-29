/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { Profiler, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me, Ops, Todo } from '@/api/types';
import { useSession } from '@/store/useSession';
import OpsPage from './page';
import { MASKED } from '@/lib/money';
import { INTAKE_HEAD_FIXTURE } from '@/app/intake/intake-head.fixture';
import { OPS_HEAD_FIXTURE } from './ops-head.fixture';

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search), useRouter: () => ({ replace: vi.fn() }) }));

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children, drawerEntry }: {
  children: ReactNode; drawerEntry?: { pane: string; identity: string } | null;
}) => <div data-drawer-entry={drawerEntry ? `${drawerEntry.pane}:${drawerEntry.identity}` : undefined}>{children}</div> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/ops/PlanReport', () => ({
  PlanReport: ({ planId }: { planId: number | null }) => planId ? <p>기획 보고서 {planId}</p> : null,
}));

const me: Me = {
  id: 4, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};
const response: Ops = {
  leads: [], complaints: [], todos: [], plans: [], meetings: [], suggestions: [], canSeeAmounts: true,
  feedback: [], feedbackNeedsFix: 0, canComment: true, planDues: [], planOverdue: 0, planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: INTAKE_HEAD_FIXTURE,
  marketing: [{ id: 1, channel: 'check', item: 'ad', channelLabel: '검수 채널', itemLabel: '광고',
    title: null, name: '검수 채널 · 광고', byId: null, byName: null,
    impressions: 3000, inquiries: 12, enrolled: 2, cost: 246800, costPerEnroll: 123400 }],
};
const clients: QueryClient[] = [];
function setup(viewer = me, selectMarketing = true) {
  /* 마케팅 갈래로 **바로 연다**(`?tab=mkt`). 할 일에서 눌러 옮기면 §59 의 주간 띠(x5 · C-5) 때문에 요청이 하나 더 는다 —
     이 파일의 금액·캐시 시험은 요청 수를 세므로 첫 화면을 마케팅으로 둔다 */
  if (selectMarketing && !nav.search) nav.search = 'tab=mkt';
  useSession.setState({ me: viewer, ready: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const commits = vi.fn();
  const view = render(<QueryClientProvider client={client}>
    <Profiler id="ops" onRender={commits}><OpsPage /></Profiler>
  </QueryClientProvider>);
  return { ...view, client, commits };
}
function expectHidden(view: ReturnType<typeof setup>) {
  expect(view.queryByText('₩246,800')).toBeNull();
  expect(view.queryByText('₩123,400')).toBeNull();
  expect(view.getAllByText(MASKED)).toHaveLength(2);
  expect(view.getByText('검수 채널')).toBeTruthy();
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  vi.restoreAllMocks();
  nav.search = '';
});

it('§75 운영 deep link는 기획 상세 또는 §14 원 요청 서랍으로 복원한다', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: response });
  nav.search = 'tab=plan&plan=31';
  const plan = setup(me, false);
  await waitFor(() => expect(plan.getByText('기획 보고서 31')).toBeTruthy());
  expect(within(plan.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^기획/ }).getAttribute('aria-selected')).toBe('true');
  cleanup();

  nav.search = 'tab=todo&request=44';
  const request = setup();
  expect(request.container.querySelector('[data-drawer-entry]')?.getAttribute('data-drawer-entry'))
    .toBe('approvals:request-44');
});

it('§14 건의 줄의 `/ops?view=suggestions` 링크는 기존 다섯 탭을 바꾸지 않고 관리자 답변 창을 연다', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: {
    ...response,
    suggestions: [{ id: 9, staffName: '강사 A', category: 'schedule', body: '목요일 수업을 옮기고 싶습니다', state: 'open', reply: null, createdAt: '2026-09-28' }],
  } });
  nav.search = 'view=suggestions';
  const view = setup(me, false);
  expect(await view.findByRole('dialog', { name: '건의 사항 답변' })).toBeTruthy();
  expect(await view.findByText('목요일 수업을 옮기고 싶습니다')).toBeTruthy();
  expect(within(view.getByRole('tablist', { name: '운영 보기' })).getAllByRole('tab')).toHaveLength(5);
});

describe('운영 금액 — 현재 Me와 서버 공개 범위의 교집합', () => {
  it('현재 canMoney=false이면 과거 권한의 응답도 금액 없이 소비한다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup({ ...me, canMoney: false });
    await waitFor(() => expect(view.getByText('검수 채널')).toBeTruthy());
    expectHidden(view);
    const cached = view.client.getQueryCache().getAll()[0].state.data as Ops;
    expect(cached.marketing[0]).toMatchObject({ cost: null, costPerEnroll: null, impressions: 3000 });
    expect(cached.canSeeAmounts).toBe(false);
    expect(response.marketing[0].cost).toBe(246800); // 응답 객체를 직접 변형하지 않는다.
  });

  it('서버 canSeeAmounts=false이면 값이 잘못 포함돼도 다시 공개하지 않는다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response, canSeeAmounts: false } });
    const view = setup();
    await waitFor(() => expect(view.getByText('검수 채널')).toBeTruthy());
    expectHidden(view);
  });

  it('역할명이 아니라 최종 canMoney=true인 매니저에게 허용된 값을 표시한다', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup({ ...me, role: 'manager', canSeeProfit: false });
    await waitFor(() => expect(view.getByText('₩246,800')).toBeTruthy());
    expect(view.getByText('₩123,400')).toBeTruthy();
    fireEvent.click(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^할 일/ }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    fireEvent.click(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^마케팅/ }));
    // §59 는 주간 띠, §64 는 띠가 없다(x5 · C-5) — 두 키를 한 번씩만 받고, 돌아오면 캐시가 답한다
    const params = get.mock.calls.map((c) => (c[1] as { params: Record<string, string> }).params);
    expect(params).toHaveLength(2);
    expect(params[0].from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params[1]).toEqual({});
  });

  /**
   * **C96 ⓐ** — 원문 §64 의 탭 머리는 밑줄 탭이 아니라 **카드 다섯**이고 차례가 정해져 있다:
   * 마케팅 · 기획 · 회의 · 할 일 · 컴플레인. 제품은 `Tabs` 에 **건수를 label 문자열로 박아**
   * 「할 일 3」처럼 붙이고 있었다 — 그러면 건수와 이름이 한 낱말이 되어 **둘 중 하나만
   * 바꿀 수가 없다.**
   *
   * 아래 한 줄은 **원문 카드에 적힌 그대로**이고(그 탭이 무엇을 담는지), 동그라미의 수는
   * 보이기만 하는 것이 아니라 **이름에도 들어가야 한다** — 밑줄 탭 시절에는 들어 있던 것이
   * 카드로 오면서 조용히 사라질 뻔했다.
   */
  it('⭐ 탭 머리는 원문 차례의 카드 다섯이고, 아래 한 줄과 동그라미 수를 보조기기도 읽는다 (C96 ⓐ)', async () => {
    // 마케팅 동그라미는 **고쳐야 할 피드백** 수다 (w5 · C-4) — 활동 줄 수가 아니다
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response, feedbackNeedsFix: 1 } });
    const view = setup();
    // 건수가 실린 뒤에 센다 — 탭 다섯은 데이터 없이도 서므로 개수만 기다리면 0 건 상태를 잰다
    await waitFor(() => expect(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^마케팅 1건/ })).toBeTruthy());
    const topTabs = within(view.getByRole('tablist', { name: '운영 보기' }));
    const tabs = topTabs.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    // 차례가 원문이다 — 제목 div 로 센다(`textContent` 는 아래 한 줄까지 붙여 준다)
    expect(tabs.map((t) => t.querySelector('div')?.firstChild?.textContent))
      .toEqual(['마케팅', '기획', '회의', '할 일', '컴플레인']);
    // 아래 한 줄 — 건수가 아니라 그 탭이 무엇을 담는지다
    for (const sub of ['트래킹 · 회의 · 피드백', '보고 · 결재', '속기록 · 할 일', '배정 · 완료', '접수 · 대응 · 결과']) {
      expect(view.getByText(sub)).toBeTruthy();
    }
    // 건수는 **이름에도** 들어간다 — 눈에만 보이면 보조기기는 한 번도 못 듣는다
    expect(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^마케팅 1건/ })).toBeTruthy();
    // 0 건은 동그라미를 달지 않는다 — 없는 것을 굳이 보여 주지 않는다 (시드 todos 0건)
    expect(topTabs.getByRole('tab', { name: /^할 일/ }).parentElement?.textContent).not.toMatch(/\d/);
    // 고른 탭만 선택으로 읽힌다
    fireEvent.click(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^회의/ }));
    expect(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^회의/ }).getAttribute('aria-selected')).toBe('true');
    expect(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^마케팅/ }).getAttribute('aria-selected')).toBe('false');
  });

  /**
   * **N-19** — 같은 이름의 수가 한 화면에 둘이면 둘 중 하나는 반드시 틀린 값이다. 원문 §64 는
   * 동그라미 3 · 담당 칩 「전체 3」 · 「할 일 3건」이 **전부 같은 수**다. 제품의 동그라미는
   * `todos.length` 라 **끝난 것까지 세고 있었다.**
   */
  it('⭐ 할 일 동그라미는 열린 것만 센다 — 담당 칩의 「전체 N」과 같은 수다 (N-19)', async () => {
    const todo = (id: number, done: boolean): Todo => ({
      id, title: `할 일 ${id}`, done, src: 'manual', srcLabel: '직접 등록', toId: 2, toName: '김민수', fromName: '대표',
      dueOn: '2026-09-21', overdueDays: 0, lesson: null, go: null,
    });
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response,
      todos: [todo(1, false), todo(2, false), todo(3, true)],
      todoOwnerCounts: [{ key: '2', label: '김민수', count: 2 }],
      todoDoneOwnerCounts: [{ key: '2', label: '김민수', count: 1 }],
    } });
    const view = setup(me, false);
    await waitFor(() => expect(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^할 일 2건/ })).toBeTruthy());
    // 동그라미 · 담당 칩 줄 · 머리 칸은 열린 둘이다. 끝난 하나는 별도 상태 카드로 옮긴다.
    expect(view.getByRole('button', { name: '전체 2' })).toBeTruthy();
    // 원문에 없는 머리 칸 「열린 할 일」은 걷었다(x5 · C-2) — 같은 수를 속 갈래 카드가 말한다
    expect(view.queryByText('열린 할 일')).toBeNull();
    expect(within(view.getByRole('tablist', { name: '할 일 상태' })).getByRole('tab', { name: '할 일 2건' })).toBeTruthy();
    expect(view.getAllByText(/^할 일 [123]$/)).toHaveLength(2);
    fireEvent.click(within(view.getByRole('tablist', { name: '할 일 상태' })).getByRole('tab', { name: '끝난 것 1건' }));
    expect(view.getAllByText(/^할 일 [123]$/)).toHaveLength(1);
    expect(view.getByRole('button', { name: '전체 1' })).toBeTruthy();
  });

  it('허용된 ₩0 과 등록이 없어 계산할 수 없는 null을 구분한다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: {
      ...response, marketing: [{ ...response.marketing[0], cost: 0, costPerEnroll: null, enrolled: 0 }],
    } });
    const view = setup();
    await waitFor(() => expect(view.getByText('₩0')).toBeTruthy());
    expect(view.queryByText(MASKED)).toBeNull();
    const heads = [...view.container.querySelectorAll('thead th')];
    const costPerEnroll = heads.findIndex((head) => head.textContent === '등록당');
    const cells = view.container.querySelectorAll('tbody tr td');
    expect(cells[costPerEnroll]?.textContent).toBe('—');
  });

  it('같은 사용자 권한 회수 직후 기존 비용을 숨기고 새 응답도 비공개로 유지한다', async () => {
    let resolve!: (value: { data: Ops }) => void;
    const pending = new Promise<{ data: Ops }>((done) => { resolve = done; });
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: response }).mockReturnValueOnce(pending);
    const view = setup();
    await waitFor(() => expect(view.getByText('₩246,800')).toBeTruthy());
    const loadedCommits = view.commits.mock.calls.length;
    act(() => useSession.setState({ me: { ...me, canMoney: false } }));
    expect(view.queryByText('₩246,800')).toBeNull();
    expect(view.queryByText('₩123,400')).toBeNull();
    expect(view.commits).toHaveBeenCalledTimes(loadedCommits + 1);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await act(async () => { resolve({ data: response }); await pending; });
    await waitFor(() => expectHidden(view));
    expect(view.commits).toHaveBeenCalledTimes(loadedCommits + 2);
  });

  it('권한 회수 전 요청이 나중에 끝나도 현재 비공개 응답을 덮어쓰지 않는다', async () => {
    let resolve!: (value: { data: Ops }) => void;
    const pending = new Promise<{ data: Ops }>((done) => { resolve = done; });
    const get = vi.spyOn(api, 'get').mockReturnValueOnce(pending).mockResolvedValueOnce({ data: response });
    const view = setup();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    act(() => useSession.setState({ me: { ...me, canMoney: false } }));
    await waitFor(() => expectHidden(view));
    await act(async () => { resolve({ data: response }); await pending; });
    expectHidden(view);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('권한 재부여 시 비공개 캐시를 재사용하지 않고 허용 응답을 새로 조회한다', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup({ ...me, canMoney: false });
    await waitFor(() => expectHidden(view));
    act(() => useSession.setState({ me }));
    await waitFor(() => expect(view.getByText('₩246,800')).toBeTruthy());
    expect(get).toHaveBeenCalledTimes(2);
  });
});

/**
 * §67 컴플레인 보드 — C86-d.
 *
 * 칸 이름·순서·한 줄과 갈래 이름이 전부 서버에서 온다. 화면에는 **색만** 남는다 —
 * 이름을 화면이 들고 있으면 저장되는 말이 바뀌어도 **화면만 멀쩡해 보인다**.
 */
describe('§67 컴플레인 보드 (C86-d)', () => {
  const cplStages = [
    { key: 'received', label: '접수', sub: '받았습니다 · 담당을 정해야 합니다' },
    { key: 'acting', label: '대응', sub: '연락하고 조치하는 중입니다' },
    { key: 'closed', label: '결과', sub: '마무리했습니다' },
  ];
  const complaints = [
    { id: 1, area: 'schedule', areaLabel: '스케줄', studentName: '고은설', stage: 'received',
      body: '수업 시간 변경 안내가 늦었다는 말씀', action: null, result: null,
      createdAt: '2026-08-19', ageDays: 2, ownerName: null },
    { id: 2, area: 'lesson', areaLabel: '수업', studentName: '양찬욱', stage: 'acting',
      body: '수업 진도가 느리다는 말씀', action: '분반 검토 중', result: null,
      createdAt: '2026-08-20', ageDays: 1, ownerName: '김범준' },
    // C93 — 심각도·기한·강사 교체 도장은 서버 낱말이다. 옛 건(위 둘)은 칩이 서지 않는다
    { id: 3, area: 'teacher', areaLabel: '선생님', studentId: 5, studentName: '고은설', stage: 'received',
      body: '수업 시작이 10분씩 늦습니다', action: null, result: null,
      createdAt: '2026-08-21', ageDays: 0, ownerId: 4, ownerName: '강민지', dueOn: '2026-08-19', overdueDays: 2, severity: 'severe', severityLabel: '심각', teacherChanged: true },
  ];
  const open = () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response, cplStages, complaints } });
    const view = setup(me, false);
    fireEvent.click(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^컴플레인/ }));
    return view;
  };

  it('칸마다 번호와 **다음에 무엇을 하는지** 한 줄이 선다', async () => {
    const view = open();
    await waitFor(() => expect(view.container.textContent).toContain('받았습니다 · 담당을 정해야 합니다'));
    const text = view.container.textContent ?? '';
    for (const w of ['연락하고 조치하는 중입니다', '마무리했습니다']) expect(text).toContain(w);
  });

  it('칸 이름과 갈래 이름은 서버가 준 것을 쓴다 — 화면에 제 표가 없다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        ...response,
        cplStages: cplStages.map((s) => ({ ...s, label: `${s.label}(서버)` })),
        complaints: complaints.map((c) => ({ ...c, areaLabel: `${c.areaLabel}(서버)` })),
      },
    });
    const view = setup(me, false);
    fireEvent.click(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^컴플레인/ }));
    await waitFor(() => expect(view.container.textContent).toContain('접수(서버)'));
    const text = view.container.textContent ?? '';
    for (const w of ['대응(서버)', '결과(서버)', '스케줄(서버)', '수업(서버)']) expect(text).toContain(w);
  });

  it('「+ 접수」·「강사 교체」 입구가 서고, 카드의 심각도·기한 지남·강사 교체됨은 서버 낱말이며, 카드를 누르면 처리 창이 열린다 (C93 · J-96 · J-98)', async () => {
    const view = open();
    await waitFor(() => expect(view.getByRole('button', { name: '+ 접수' })).toBeTruthy());
    expect(view.getByRole('button', { name: '강사 교체' })).toBeTruthy();
    const text = view.container.textContent ?? '';
    expect(text).toContain('심각');
    expect(text).toContain('기한 2일 지남');
    expect(text).toContain('강사 교체됨');
    expect(text).not.toContain('미정'); // 옛 건의 빈 심각도에 「미정」을 지어 붙이지 않는다
    fireEvent.click(view.getByRole('button', { name: '컴플레인 수업 시작이 10분씩 늦습니다' }));
    const dialog = await view.findByRole('dialog', { name: '컴플레인 — 고은설 · 선생님' });
    expect(within(dialog).getByRole('button', { name: '강사 교체' })).toBeTruthy();
  });

  it('담당 없는 건은 빈칸이 아니라 **할 일**로 선다 — 지난 날은 서버가 센 값이다', async () => {
    const view = open();
    await waitFor(() => expect(view.container.textContent).toContain('담당 없음'));
    const text = view.container.textContent ?? '';
    expect(text).toContain('2일 지남');
    expect(text).toContain('김범준');
    expect(text).toContain('1일 지남');
  });
});

/**
 * §63 회의 목록의 참석 — C86-f.
 * 같은 줄의 종류·속기록이 이미 칩인데 참석만 맨 글씨였다. 원본은 칩이다.
 */
it('참석은 **이름 칩**으로 서고 상태(세 값)가 색이다 — 원문 §63 줄 (w5 · 63-2)', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      ...response,
      meetings: [
        { id: 1, mtType: 'plan', mtTypeLabel: '기획 회의', mtTypeShort: '기획', title: '주간 기획', onDate: '2026-08-20',
          attendees: 2, confirmed: 1, waiting: 1, hasMinutes: false, serId: null, startMin: null, endMin: null, placeLabel: null,
          upcoming: false,
          attendeeList: [
            { staffId: 3, name: '홍지승', title: null, state: 'waiting', stateLabel: '응답 대기' },
            { staffId: 4, name: '김성재', title: null, state: 'in', stateLabel: '참석' },
          ] },
      ],
    },
  });
  const view = setup(me, false);
  fireEvent.click(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^회의/ }));
  await waitFor(() => expect(view.container.textContent).toContain('주간 기획'));
  // 이름과 상태는 서버가 준 값 그대로다 — 화면이 참석을 다시 세거나 판정하지 않는다
  const waiting = view.getByText('홍지승');
  expect(waiting.getAttribute('title')).toBe('응답 대기');
  expect(waiting.className).toContain('bg-amber');
  expect(view.getByText('김성재').className).toContain('bg-green');
  expect(view.getByText('대기 1')).toBeTruthy();
  // 지난 회의는 「예정」이 아니라 속기록이 끝맺음이다
  expect(view.queryByText('예정')).toBeNull();
  expect(view.getByText('속기록 없음')).toBeTruthy();
});

/**
 * §61 rework 카드의 **「보완 1」** — 컷에 있는 칩이다 (S6).
 *
 * 세는 것은 서버이고(`log` 의 rework 줄), 화면은 **0 이면 안 그린다** — 손으로 박은 옛 건은
 * 누가 언제 반려했는지 몰라 0 이다. 「보완 1」이라 적으면 없는 사실을 지어내는 것이다 (N-25).
 */
it('§61 카드의 「보완 N」은 서버가 센 값이고 0 이면 칩이 서지 않는다', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response, plans: [
    { id: 7, title: '되돌아온 기획', stage: 'rework', stageLabel: '보완 요청', goal: null, ask: null,
      dueOn: null, ownerName: '홍지승', overdueDays: 0, dueState: 'none', reworkCount: 2,
      taskDone: 0, taskTotal: 0, dueLabel: null, dueStateLabel: '기한 없음' },
    { id: 8, title: '손으로 박은 건', stage: 'rework', stageLabel: '보완 요청', goal: null, ask: null,
      dueOn: null, ownerName: '홍지승', overdueDays: 0, dueState: 'none', reworkCount: 0,
      taskDone: 0, taskTotal: 0, dueLabel: null, dueStateLabel: '기한 없음' },
  ] } });
  const view = setup(me, false);
  fireEvent.click(await waitFor(() => within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^기획/ })));
  expect(view.getByText('보완 2')).toBeTruthy();
  expect(view.queryByText('보완 0')).toBeNull();
});

/* ── w5 · 1:1 대조 둘째 물결 — 원문 §61 · §67 · C-4 ───────────────────────── */

it('§61 카드 — 「과제 N/M」·기한 낱말·기한 상태 칩은 서버 값이고, 탭 동그라미는 검토+보완 수다 (61-1 · 61-2 · 61-3 · C-4)', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response, planPending: 2, plans: [
    { id: 7, title: '9월 신규 상담 유입 30% 늘리기', stage: 'review', stageLabel: '검토 요청', goal: null, ask: null,
      dueOn: '2026-08-25', ownerName: '홍지승', overdueDays: 4, dueState: 'proposed', reworkCount: 0,
      taskDone: 1, taskTotal: 3, dueLabel: '4일 지남', dueStateLabel: '기한 제안' },
    { id: 9, title: 'SE/TE 공개 범위 확대', stage: 'done', stageLabel: '완료', goal: null, ask: null,
      dueOn: '2026-08-11', ownerName: '김범준', overdueDays: 0, dueState: 'approved', reworkCount: 0,
      taskDone: 2, taskTotal: 2, dueLabel: null, dueStateLabel: '기한 승인' },
  ] } });
  const view = setup(me, false);
  await waitFor(() => expect(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^기획 2건/ })).toBeTruthy());
  fireEvent.click(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^기획/ }));
  expect(view.getByText('기획 결재')).toBeTruthy();
  expect(view.getByText('과제 1/3')).toBeTruthy();
  expect(view.getByText('과제 2/2')).toBeTruthy();
  const late = view.getByText('4일 지남');
  expect(late.className).toContain('text-red');
  expect(view.getByText('08-25')).toBeTruthy();
  expect(view.getByText('기한 제안')).toBeTruthy();
  expect(view.getByText('기한 승인')).toBeTruthy();
  // 속 갈래도 카드형이고 동그라미는 같은 수(서버 planPending)다
  expect(within(view.getByRole('tablist', { name: '기획 보기' })).getByRole('tab', { name: /^단계 보드 2건/ })).toBeTruthy();
  // C-9 — 칸 머리 윗선 단계색 · 오른쪽 큰 단계색 건수(검토 요청 호박 · 완료 초록)
  const review = view.container.querySelector('[data-board-column="review"]') as HTMLElement;
  expect(review.className).toContain('border-t-amber');
  expect(within(review).getByText('1', { selector: 'span.text-\\[20px\\]' }).className).toContain('text-amber');
  expect((view.container.querySelector('[data-board-column="done"]') as HTMLElement).className).toContain('border-t-green');
});

it('§67 「이력」 — 줄을 펼치면 대응 기록 전부(조치 · 결과 · 담당 · 기한 · 마무리 날짜 · 환불)가 보이고 다시 누르면 접힌다 (PDF J-102 · all160)', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response, cplOverdue: 0,
    cplStages: [{ key: 'closed', label: '결과', sub: '마무리' }],
    complaints: [{ id: 6, area: 'lesson', areaLabel: '수업', studentId: 3, studentName: '서지안', stage: 'closed',
      body: '수업 취소 환불이 지연됩니다.', action: '회계에 환불 일정 확인 요청', result: '9/12 환불 완료 안내', createdAt: '2026-09-01', ageDays: 20,
      ownerId: 3, ownerName: '김범준', dueOn: '2026-09-10', overdueDays: 0, severity: 'normal', severityLabel: '보통',
      teacherChanged: false, canWithdraw: false, closedOn: '2026-09-12',
      refunds: [{ at: '2026-09-12 14:10', endedOn: '2026-09-15', refundTotal: 120000, byName: '김민선' }] }],
  } });
  const view = setup(me, false);
  await waitFor(() => expect(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^컴플레인/ })).toBeTruthy());
  fireEvent.click(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^컴플레인/ }));
  fireEvent.click(within(await waitFor(() => view.getByRole('tablist', { name: '컴플레인 보기' }))).getByRole('tab', { name: /^이력/ }));
  const table = await waitFor(() => view.getByRole('table'));
  const toggle = within(table).getByRole('button', { name: /수업 취소 환불이 지연됩니다/ });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(within(table).queryByText('회계에 환불 일정 확인 요청')).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const record = within(table).getByRole('region', { name: '수업 취소 환불이 지연됩니다. 대응 기록' });
  expect(within(record).getByText('회계에 환불 일정 확인 요청')).toBeTruthy();
  expect(within(record).getByText('9/12 환불 완료 안내')).toBeTruthy();
  expect(within(record).getByText('김범준')).toBeTruthy();
  expect(within(record).getByText('2026-09-10')).toBeTruthy();
  expect(within(record).getByText('2026-09-12')).toBeTruthy();
  expect(within(record).getByRole('region', { name: '환불 이력' }).textContent).toContain('김민선');
  fireEvent.click(toggle);
  expect(within(table).queryByRole('region', { name: '수업 취소 환불이 지연됩니다. 대응 기록' })).toBeNull();
});

it('§67 — 「기한 지남 N」 칩과 탭 동그라미는 서버 cplOverdue 이고, 「이력」은 같은 컴플레인을 표로 보인다 (67-1 · 67-2 · C-4)', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { ...response, cplOverdue: 2,
    cplStages: [{ key: 'received', label: '접수', sub: '받았습니다' }],
    complaints: [{ id: 5, area: 'lesson', areaLabel: '수업', studentId: null, studentName: '양찬욱', stage: 'received',
      body: '진도가 느리다는 말씀', action: null, result: null, createdAt: '2026-08-20', ageDays: 1,
      ownerId: null, ownerName: null, dueOn: '2026-08-19', overdueDays: 2, severity: null, severityLabel: null,
      teacherChanged: false, canWithdraw: false, refunds: [] }],
  } });
  const view = setup(me, false);
  await waitFor(() => expect(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^컴플레인 2건/ })).toBeTruthy());
  fireEvent.click(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^컴플레인/ }));
  expect(view.getByText('기한 지남 2')).toBeTruthy();
  fireEvent.click(within(view.getByRole('tablist', { name: '컴플레인 보기' })).getByRole('tab', { name: /^이력/ }));
  const table = view.getByRole('table');
  expect(within(table).getByText('진도가 느리다는 말씀')).toBeTruthy();
  expect(within(table).getByText('담당 없음')).toBeTruthy();
  expect(within(table).getByText('접수')).toBeTruthy();
});
