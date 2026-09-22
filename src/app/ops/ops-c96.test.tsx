/** @file-guide
 * 목적: ops-c96.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * C96 — 운영에 **만드는 길**과 **기간·갈래로 좁히는 길** (N-46 ②③ · J-102).
 *
 * 여기서 보는 것은 네 가지다.
 *   ① **화면이 아무것도 세지 않는다** — 칩의 숫자는 서버가 준 `mtTypeCounts`·`areaCounts`·`todoOwnerCounts` 그대로다(D-R37).
 *   ② **기간 토글이 캐시 키를 바꾼다** — 그래서 한 번 더 받는다(같은 키면 받지 않는다).
 *   ③ **창이 보낸 본문이 DTO 그대로**이고, 겹침 409 문장은 **서버 문장**이 창 안에 뜬다.
 *   ④ **단추가 서는지도 서버가 정한다** — `canCreateMeeting`·`canCreatePlan` 이 false 면 단추가 없다(D-R39).
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/api/client';
import type { Me, Meta, Ops } from '@/api/types';
import { useSession } from '@/store/useSession';
import OpsPage from './page';
import { INTAKE_HEAD_FIXTURE } from '@/app/intake/intake-head.fixture';
import { OPS_HEAD_FIXTURE } from './ops-head.fixture';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/ops/PlanReport', () => ({ PlanReport: () => null }));
vi.mock('@/components/ops/MeetingDetail', () => ({ MeetingDetail: () => null }));

const me: Me = {
  id: 4, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};

const META: Meta = {
  kinds: [], subs: [], invTypes: [], cancelReasons: [], cancelTreats: [], students: [],
  rooms: [{ id: 1, branch: '본원', name: '1호', capacity: 10 }],
  zaccs: [{ id: 3, label: 'TN', meetingId: '123' }],
  staff: [
    { id: 4, name: '김민선', role: 'ceo', canAdminPage: true, canGpaPack: true, title: null },
    { id: 7, name: '김재훈', role: 'teacher', canAdminPage: false, canGpaPack: false, title: null },
  ],
};

/** 서버가 센 건수 — **화면이 다시 세면 이 수와 갈린다** */
const ops = (over: Partial<Ops> = {}): Ops => ({
  leads: [], complaints: [], todos: [], plans: [], marketing: [], suggestions: [], feedback: [],
  feedbackNeedsFix: 0, canComment: true, canSeeAmounts: true, planDues: [], planOverdue: 0,
  planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: INTAKE_HEAD_FIXTURE,
  meetings: [
    { id: 11, mtType: 'plan', mtTypeLabel: '기획 회의', title: '겨울 특강', onDate: '2026-09-18',
      attendees: 5, confirmed: 1, hasMinutes: false, serId: 900, startMin: 660, endMin: 720,
      placeLabel: '1호', waiting: 4 },
    { id: 12, mtType: 'general', mtTypeLabel: '일반 회의', title: '옛 회의', onDate: '2026-09-15',
      attendees: 2, confirmed: 2, hasMinutes: true, serId: null, startMin: null, endMin: null,
      placeLabel: null, waiting: 0 },
  ],
  // 「32건」이라 적혀 있으면 화면은 32 를 그린다 — 줄 수(2)를 세지 않는다
  mtTypeCounts: [
    { key: 'plan', label: '기획 회의', count: 32 },
    { key: 'consulting', label: '컨설팅 회의', count: 0 },
    { key: 'general', label: '일반 회의', count: 7 },
  ],
  mtTypes: [{ key: 'plan', label: '기획 회의' }, { key: 'general', label: '일반 회의' }],
  canCreateMeeting: true,
  canCreatePlan: true,
  range: { from: null, to: null, label: '전체' },
  ...over,
});

describe('S2-b — §64 상태·날짜·기한 입력', () => {
  const data = () => ops({
    todos: [
      { id: 31, title: '다음 자료', toId: 7, toName: '김재훈', fromName: '대표', dueOn: '2026-09-24', done: false, src: 'meeting', srcLabel: '회의', overdueDays: 0 },
      { id: 32, title: '오늘 자료', toId: 8, toName: '김재훈', fromName: '대표', dueOn: '2026-09-23', done: false, src: 'lesson', srcLabel: '수업', overdueDays: 0 },
      { id: 33, title: '날짜 없는 자료', toId: null, toName: null, fromName: null, dueOn: null, done: false, src: 'manual', srcLabel: '직접 등록', overdueDays: 0 },
      { id: 34, title: '끝낸 자료', toId: 7, toName: '김재훈', fromName: '대표', dueOn: '2026-09-22', done: true, src: 'plan', srcLabel: '기획', overdueDays: 0 },
    ],
    todoOwnerCounts: [{ key: '7', label: '김재훈', count: 1 }, { key: '8', label: '김재훈', count: 1 }, { key: '__none__', label: '담당 없음', count: 1 }],
    todoDoneOwnerCounts: [{ key: '7', label: '김재훈', count: 1 }],
  });
  const status = (view: ReturnType<typeof setup>) => within(view.getByRole('tablist', { name: '할 일 상태' }));
  const ready = async (view: ReturnType<typeof setup>) => waitFor(() => expect(view.getByRole('checkbox', { name: '다음 자료 완료' })).toBeTruthy());

  it('열린/끝난 카드·상태별 담당 수·날짜 순서·기한 없음은 같은 조회를 사용한다', async () => {
    const view = setup(data());
    await ready(view);
    expect(status(view).getByRole('tab', { name: '할 일 3건' })).toBeTruthy();
    expect(status(view).getByRole('tab', { name: '끝난 것 1건' })).toBeTruthy();
    expect(view.queryByText('끝낸 자료')).toBeNull();
    const sections = view.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(sections).toEqual(['9/23 (수)1건', '9/24 (목)1건', '기한 없음1건']);
    expect(view.getByText('수업')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '김재훈 · #7 1' }));
    expect(view.getByText('다음 자료')).toBeTruthy();
    expect(view.queryByText('오늘 자료')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '전체 3' }));
    fireEvent.click(view.getByRole('button', { name: '김재훈 · #8 1' }));
    expect(view.getByText('오늘 자료')).toBeTruthy();
    expect(view.queryByText('다음 자료')).toBeNull();
    fireEvent.click(status(view).getByRole('tab', { name: '끝난 것 1건' }));
    expect(view.getByText('끝낸 자료')).toBeTruthy();
    expect(view.getByRole('button', { name: '전체 1' })).toBeTruthy();
    expect(view.queryByRole('button', { name: '김재훈 · #8 1' })).toBeNull();
    expect(opsCalls(view.get)).toHaveLength(1); // 상태/담당 selector는 추가 요청이 없다.
  });

  it('카드와 전체 칩은 서버 담당 집계 합계를 소비한다', async () => {
    const rows = data();
    rows.todoOwnerCounts = [{ key: '7', label: '김재훈', count: 12 }];
    const view = setup(rows);
    await ready(view);
    expect(status(view).getByRole('tab', { name: '할 일 12건' })).toBeTruthy();
    expect(view.getByRole('button', { name: '전체 12' })).toBeTruthy();
    expect(within(view.getByRole('tablist', { name: '운영 보기' })).getByRole('tab', { name: /^할 일 12건/ })).toBeTruthy();
  });

  it.each([[false, false], [true, false], [false, true]])('기한 입력도 최종 권한 둘(%s,%s)을 모두 요구한다', async (canAdminPage, canCrudAll) => {
    const view = setup(data(), { ...me, canAdminPage, canCrudAll });
    await ready(view); // 이 시험의 RequireAuth 대역과 별개로 입력의 조건부 렌더를 검증한다.
    expect(view.queryByRole('button', { name: /기한 고치기$/ })).toBeNull();
  });

  it.each(['canAdminPage', 'canCrudAll'] as const)('편집 중 %s 회수는 모달과 입력을 즉시 숨기고 쓰기/추가 조회를 하지 않는다', async (flag) => {
    const view = setup(data());
    const patch = vi.spyOn(api, 'patch');
    await ready(view);
    fireEvent.click(view.getByRole('button', { name: '다음 자료 기한 고치기' }));
    fireEvent.change(view.getByLabelText('기한'), { target: { value: '2026-10-03' } });
    const before = view.get.mock.calls.length;
    act(() => useSession.setState({ me: { ...me, [flag]: false } }));
    expect(view.queryByRole('dialog')).toBeNull();
    expect(view.queryByRole('button', { name: /기한 고치기$/ })).toBeNull();
    expect(patch).not.toHaveBeenCalled();
    expect(view.get.mock.calls).toHaveLength(before);
  });

  it('완료와 해제는 기존 PATCH를 쓰고 재조회된 상태로 목록을 옮긴다', async () => {
    const rows = data();
    const view = setup(rows);
    const patch = vi.spyOn(api, 'patch').mockImplementation(async (_url, body) => {
      const done = (body as { done: boolean }).done;
      rows.todos = rows.todos.map((t) => t.id === 31 ? { ...t, done } : t);
      rows.todoOwnerCounts = done ? rows.todoOwnerCounts.filter((c) => c.key !== '7') : data().todoOwnerCounts;
      rows.todoDoneOwnerCounts = [{ key: '7', label: '김재훈', count: done ? 2 : 1 }];
      return { data: { ok: true } };
    });
    await ready(view);
    fireEvent.click(view.getByRole('checkbox', { name: '다음 자료 완료' }));
    await waitFor(() => expect(view.queryByText('다음 자료')).toBeNull());
    expect(patch).toHaveBeenLastCalledWith('/drawer/todos/31', { done: true });
    fireEvent.click(status(view).getByRole('tab', { name: '끝난 것 2건' }));
    expect((view.getByRole('checkbox', { name: '다음 자료 완료' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(view.getByRole('checkbox', { name: '다음 자료 완료' }));
    await waitFor(() => expect(view.queryByText('다음 자료')).toBeNull());
    expect(patch).toHaveBeenLastCalledWith('/drawer/todos/31', { done: false });
    fireEvent.click(status(view).getByRole('tab', { name: '할 일 3건' }));
    expect(view.getByText('다음 자료')).toBeTruthy();
  });

  it('고치기는 기한만 보내고 성공 뒤 닫는다 — 빈 기한은 null이다', async () => {
    const view = setup(data());
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { ok: true } });
    await ready(view);
    fireEvent.click(view.getByRole('button', { name: '다음 자료 기한 고치기' }));
    const dialog = within(view.getByRole('dialog', { name: '할 일 기한 고치기' }));
    expect((dialog.getByLabelText('기한') as HTMLInputElement).value).toBe('2026-09-24');
    expect(dialog.queryByRole('textbox')).toBeNull();
    expect(dialog.queryByRole('combobox')).toBeNull();
    fireEvent.change(dialog.getByLabelText('기한'), { target: { value: '2026-09-30' } });
    fireEvent.click(dialog.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    expect(patch).toHaveBeenLastCalledWith('/drawer/todos/31', { dueOn: '2026-09-30' });
    fireEvent.click(view.getByRole('button', { name: '다음 자료 기한 고치기' }));
    fireEvent.change(view.getByLabelText('기한'), { target: { value: '' } });
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith('/drawer/todos/31', { dueOn: null }));
  });

  it('실패하면 날짜 초안과 오류가 남고 취소 후 다른 행/생성에는 섞이지 않는다', async () => {
    const view = setup(data());
    vi.spyOn(api, 'patch').mockRejectedValue(new ApiError('FORBIDDEN', '기한을 고칠 권한이 없습니다', 403));
    await ready(view);
    fireEvent.click(view.getByRole('button', { name: '다음 자료 기한 고치기' }));
    fireEvent.change(view.getByLabelText('기한'), { target: { value: '2026-10-03' } });
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(within(view.getByRole('dialog')).getByText('기한을 고칠 권한이 없습니다')).toBeTruthy());
    expect((view.getByLabelText('기한') as HTMLInputElement).value).toBe('2026-10-03');
    fireEvent.click(view.getByRole('button', { name: '취소' }));
    fireEvent.click(view.getByRole('button', { name: '오늘 자료 기한 고치기' }));
    expect((view.getByLabelText('기한') as HTMLInputElement).value).toBe('2026-09-23');
    expect(view.queryByText('기한을 고칠 권한이 없습니다')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '취소' }));
    fireEvent.click(view.getByRole('button', { name: '+ 할 일 주기' }));
    expect((view.getByLabelText('할 일') as HTMLInputElement).value).toBe('');
    expect(view.getByLabelText('담당자')).toBeTruthy();
  });

  it('저장 중 재제출을 막고 완료 실패를 성공으로 표시하지 않는다', async () => {
    const view = setup(data());
    let reject!: (reason: Error) => void;
    const pending = new Promise((_resolve, no) => { reject = no; });
    const patch = vi.spyOn(api, 'patch').mockReturnValue(pending as never);
    await ready(view);
    fireEvent.click(view.getByRole('button', { name: '다음 자료 기한 고치기' }));
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    await waitFor(() => expect((view.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    expect(patch).toHaveBeenCalledOnce();
    reject(new ApiError('NOT_FOUND', '할 일을 찾을 수 없습니다', 404));
    await waitFor(() => expect(view.getByText('할 일을 찾을 수 없습니다')).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: '취소' }));
    patch.mockRejectedValue(new ApiError('FORBIDDEN', '완료할 권한이 없습니다', 403));
    fireEvent.click(view.getByRole('checkbox', { name: '다음 자료 완료' }));
    await waitFor(() => expect(view.getByText('완료할 권한이 없습니다')).toBeTruthy());
    expect((view.getByRole('checkbox', { name: '다음 자료 완료' }) as HTMLInputElement).checked).toBe(false);
  });
});

const clients: QueryClient[] = [];
function setup(data: Ops, viewer: Me = me) {
  useSession.setState({ me: viewer, ready: true });
  const get = vi.spyOn(api, 'get').mockImplementation(((url: string) =>
    Promise.resolve({ data: url === '/meta' ? META : data })) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><OpsPage /></QueryClientProvider>);
  return { ...view, get, client };
}
/** `/meta` 요청은 섞여 들어온다 — 세는 것은 `/ops` 뿐이다 */
const opsCalls = (get: { mock: { calls: unknown[][] } }): Array<Record<string, string>> =>
  get.mock.calls
    .filter((c) => c[0] === '/ops')
    .map((c) => (c[1] as { params: Record<string, string> }).params);

afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); });
beforeEach(() => { useSession.setState({ me: null, ready: false }); });

describe('C96 — 기간과 갈래로 좁히기 (N-46 ② · J-102)', () => {
  it('칩의 숫자는 **서버가 준 것**이다 — 화면은 줄 수를 다시 세지 않는다 (D-R37)', async () => {
    const view = setup(ops());
    await waitFor(() => expect(view.getByRole('tab', { name: /^회의/ })).toBeTruthy());
    fireEvent.click(view.getByRole('tab', { name: /^회의/ }));

    const chips = await waitFor(() => view.getByRole('group', { name: '회의 종류' }));
    // 줄은 둘인데 칩은 32·0·7 이라고 적는다 — 서버가 센 수가 화면의 수다
    expect(within(chips).getByRole('button', { name: '기획 회의 32' })).toBeTruthy();
    expect(within(chips).getByRole('button', { name: '일반 회의 7' })).toBeTruthy();
    // 0건 갈래도 선다 — 칩 줄은 **어휘**이지 데이터가 아니다 (C66)
    expect(within(chips).getByRole('button', { name: '컨설팅 회의 0' })).toBeTruthy();
  });

  it('기간 낱말은 서버가 만든다 — 화면이 「2026년 9월」을 짓지 않는다 (D-R18)', async () => {
    const view = setup(ops({ range: { from: '2026-09-01', to: '2026-09-30', label: '2026년 9월' } }));
    await waitFor(() => expect(view.getByText('2026년 9월')).toBeTruthy());
  });

  it('기간 토글이 캐시 키를 바꾼다 — 한 번 더 받고, 같은 기간을 다시 고르면 안 받는다', async () => {
    const view = setup(ops());
    await waitFor(() => expect(opsCalls(view.get)).toHaveLength(1));
    expect(opsCalls(view.get)[0]).toEqual({});

    fireEvent.click(view.getByRole('button', { name: '월간' }));
    await waitFor(() => expect(opsCalls(view.get)).toHaveLength(2));
    const month = opsCalls(view.get)[1];
    expect(month.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(month.to?.slice(0, 7)).toBe(month.from?.slice(0, 7));

    // 이미 받아 둔 기간으로 돌아가면 캐시가 답한다
    fireEvent.click(view.getByRole('button', { name: '전체' }));
    await waitFor(() => expect(view.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('true'));
    expect(opsCalls(view.get)).toHaveLength(2);
  });

  it('§67 갈래 칩은 **서버로 간다** — J-102 「지난달 컴플레인만」 (그 밖의 칩은 받은 목록에서 거른다)', async () => {
    const view = setup(ops({
      areaCounts: [{ key: 'teaching', label: '수업', count: 3 }, { key: 'payment', label: '수납', count: 1 }],
    }));
    await waitFor(() => expect(view.getByRole('tab', { name: /^컴플레인/ })).toBeTruthy());
    fireEvent.click(view.getByRole('tab', { name: /^컴플레인/ }));

    const chips = await waitFor(() => view.getByRole('group', { name: '컴플레인 갈래' }));
    fireEvent.click(within(chips).getByRole('button', { name: '수업 3' }));
    await waitFor(() => expect(opsCalls(view.get)).toHaveLength(2));
    expect(opsCalls(view.get)[1]).toEqual({ area: 'teaching' });
  });

  it('회의 종류 칩은 **받은 목록에서** 거른다 — 요청이 늘지 않는다 (§24 FQ 규약)', async () => {
    const view = setup(ops());
    await waitFor(() => expect(view.getByRole('tab', { name: /^회의/ })).toBeTruthy());
    fireEvent.click(view.getByRole('tab', { name: /^회의/ }));
    await waitFor(() => expect(view.getByText('겨울 특강')).toBeTruthy());

    const chips = view.getByRole('group', { name: '회의 종류' });
    fireEvent.click(within(chips).getByRole('button', { name: '일반 회의 7' }));
    await waitFor(() => expect(view.queryByText('겨울 특강')).toBeNull());
    expect(view.getByText('옛 회의')).toBeTruthy();
    expect(opsCalls(view.get)).toHaveLength(1);
  });

  it('시각과 자리는 **이어진 회차**에서 온다 — 옛 회의는 지어내지 않고 「시각 없음」이다 (N-25)', async () => {
    const view = setup(ops());
    await waitFor(() => expect(view.getByRole('tab', { name: /^회의/ })).toBeTruthy());
    fireEvent.click(view.getByRole('tab', { name: /^회의/ }));

    await waitFor(() => expect(view.getByText('11:00–12:00')).toBeTruthy());
    expect(view.getByText('1호')).toBeTruthy();
    // 원본 §63 의 「대기 4」 — 답 안 한 사람 수도 서버가 센다
    expect(view.getByText('대기 4')).toBeTruthy();
    expect(view.getByText('시각 없음')).toBeTruthy();
  });
});

describe('C96 — 운영에 만드는 길 (N-46 ③)', () => {
  it('단추가 서는지도 **서버가 정한다** — canCreate* 가 false 면 단추가 없다 (D-R39)', async () => {
    const view = setup(ops({ canCreateMeeting: false, canCreatePlan: false }));
    await waitFor(() => expect(view.getByRole('tab', { name: /^회의/ })).toBeTruthy());
    fireEvent.click(view.getByRole('tab', { name: /^회의/ }));
    expect(view.queryByRole('button', { name: '+ 회의 잡기' })).toBeNull();
    fireEvent.click(view.getByRole('tab', { name: /^기획/ }));
    expect(view.queryByRole('button', { name: '+ 기획 올리기' })).toBeNull();
  });

  it('「+ 회의 잡기」가 보내는 본문이 DTO 그대로다 — 겹침 판정은 서버가 한다', async () => {
    const view = setup(ops());
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        meeting: { id: 99, mtType: 'plan', mtTypeLabel: '기획 회의', title: '새 회의', onDate: '2026-10-01',
          attendees: 2, confirmed: 0, hasMinutes: false, serId: 901, startMin: 660, endMin: 720,
          placeLabel: '온라인 TN', waiting: 2 },
        attendees: 2, unavailable: [],
      },
    } as never);
    await waitFor(() => expect(view.getByRole('tab', { name: /^회의/ })).toBeTruthy());
    fireEvent.click(view.getByRole('tab', { name: /^회의/ }));
    fireEvent.click(view.getByRole('button', { name: '+ 회의 잡기' }));

    await waitFor(() => expect(view.getByLabelText('제목')).toBeTruthy());
    fireEvent.change(view.getByLabelText('제목'), { target: { value: '새 회의' } });
    fireEvent.change(view.getByLabelText('날짜'), { target: { value: '2026-10-01' } });
    fireEvent.change(view.getByLabelText('시작'), { target: { value: '11:00' } });
    fireEvent.change(view.getByLabelText('끝'), { target: { value: '12:00' } });
    fireEvent.click(view.getByRole('button', { name: '온라인' }));
    await waitFor(() => expect(view.getByLabelText('줌 계정')).toBeTruthy());
    fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '3' } });
    fireEvent.click(view.getByRole('button', { name: '김재훈' }));
    fireEvent.click(view.getByRole('button', { name: '회의 잡기' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/ops/meetings');
    expect(post.mock.calls[0][1]).toEqual({
      mtType: 'plan', title: '새 회의', onDate: '2026-10-01',
      startMin: 660, endMin: 720, mode: 'online', zaccId: 3, attendeeIds: [7],
    });
    // 잡은 뒤의 한 줄도 **서버가 준 낱말**로 적는다 — 「온라인 TN」을 화면이 짓지 않는다
    await waitFor(() => expect(view.getByText(/온라인 TN/)).toBeTruthy());
  });

  it('겹치면 **서버 문장**이 창 안에 뜨고 창이 닫히지 않는다 (C93·C95 와 같은 모양)', async () => {
    const view = setup(ops());
    vi.spyOn(api, 'post').mockRejectedValue({
      response: { status: 409, data: { code: 'RESOURCE_CONFLICT', message: '그 시간에 1호는 이미 찼습니다' } },
    } as never);
    await waitFor(() => expect(view.getByRole('tab', { name: /^회의/ })).toBeTruthy());
    fireEvent.click(view.getByRole('tab', { name: /^회의/ }));
    fireEvent.click(view.getByRole('button', { name: '+ 회의 잡기' }));

    await waitFor(() => expect(view.getByLabelText('날짜')).toBeTruthy());
    fireEvent.change(view.getByLabelText('날짜'), { target: { value: '2026-10-01' } });
    fireEvent.change(view.getByLabelText('시작'), { target: { value: '11:00' } });
    fireEvent.change(view.getByLabelText('끝'), { target: { value: '12:00' } });
    await waitFor(() => expect(view.getByLabelText('강의실')).toBeTruthy());
    fireEvent.change(view.getByLabelText('강의실'), { target: { value: '1' } });
    fireEvent.click(view.getByRole('button', { name: '회의 잡기' }));

    await waitFor(() => expect(view.getByText('그 시간에 1호는 이미 찼습니다')).toBeTruthy());
    // 창은 열려 있다 — 고쳐서 다시 낼 수 있어야 한다
    expect(view.getByRole('button', { name: '회의 잡기' })).toBeTruthy();
  });

  it('「+ 기획 올리기」는 **단계를 보내지 않는다** — 올린 기획은 언제나 첫 칸이다', async () => {
    const view = setup(ops());
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { plan: { id: 5, title: '겨울 특강 개설', stage: 'draft', stageLabel: '초안', overdueDays: 0, dueState: 'none' } },
    } as never);
    await waitFor(() => expect(view.getByRole('tab', { name: /^기획/ })).toBeTruthy());
    fireEvent.click(view.getByRole('tab', { name: /^기획/ }));
    fireEvent.click(view.getByRole('button', { name: '+ 기획 올리기' }));

    await waitFor(() => expect(view.getByLabelText('제목')).toBeTruthy());
    fireEvent.change(view.getByLabelText('제목'), { target: { value: '겨울 특강 개설' } });
    fireEvent.click(view.getByRole('button', { name: '올리기' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toEqual({ title: '겨울 특강 개설' });
    expect(post.mock.calls[0][1]).not.toHaveProperty('stage');
  });

  it('「+ 할 일 주기」는 **새 경로가 아니다** — 서랍이 쓰는 그 경로를 부른다 (C76)', async () => {
    const view = setup(ops({
      todos: [{ id: 1, title: '자료 정리', toId: 7, toName: '김재훈', fromName: '대표', srcLabel: '직접 등록', dueOn: null, done: false, src: 'manual', overdueDays: 0 }],
      todoOwnerCounts: [{ key: '7', label: '김재훈', count: 1 }, { key: '__none__', label: '담당 없음', count: 2 }],
    }));
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 41 } } as never);
    await waitFor(() => expect(view.getByRole('group', { name: '담당' })).toBeTruthy());
    // 담당 없는 할 일의 키는 서버가 `__none__` 이라 부른다 — 화면은 그 낱말을 그대로 쓴다
    expect(within(view.getByRole('group', { name: '담당' })).getByRole('button', { name: '담당 없음 2' })).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: '+ 할 일 주기' }));
    await waitFor(() => expect(view.getByLabelText('할 일')).toBeTruthy());
    fireEvent.change(view.getByLabelText('할 일'), { target: { value: '교재 주문' } });
    fireEvent.click(view.getByRole('button', { name: '만들기' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/drawer/todos');
    expect(post.mock.calls[0][1]).toMatchObject({ title: '교재 주문', toId: 4 });
  });
});
