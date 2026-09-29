/** @file-guide
 * 목적: ops-w11.test.tsx — 운영 W11(O) — 회의 동그라미 · §61 공개 범위/반려된 기한 칩 · §64 줄 모양 · 곧장 여는 질의 (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * W11 운영(O) — 결정표 N-96 · N-72 · N-95 · N-71 · N-32 · 7-3 ① ③ 의 화면 쪽.
 * 수 · 낱말 · 이동 주소는 전부 서버가 준 것을 그린다 (D-R37 · D-R18) — 여기서는 그 값이 제자리에 서는지를 본다.
 */
import { cleanup, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api } from '@/api/client';
import type { MeetingDetail, Me, Ops, Plan, Todo } from '@/api/types';
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
  leads: [], complaints: [], todos: [], plans: [], meetings: [], suggestions: [], feedback: [], marketing: [],
  feedbackNeedsFix: 0, canComment: true, canSeeAmounts: true, planDues: [], planOverdue: 0,
  planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: INTAKE_HEAD_FIXTURE,
  ...over,
});

const clients: QueryClient[] = [];
function setup(data: Ops, search = '', extra: Record<string, unknown> = {}) {
  nav.search = search;
  useSession.setState({ me, ready: true });
  const get = vi.spyOn(api, 'get').mockImplementation(((url: string) =>
    Promise.resolve({ data: url in extra ? extra[url] : url === '/meta' ? { staff: [] } : data })) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><OpsPage /></QueryClientProvider>);
  return { ...view, get };
}
const top = (view: ReturnType<typeof setup>) => within(view.getByRole('tablist', { name: '운영 보기' }));

beforeEach(() => { useSession.setState({ me: null, ready: false }); });
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); nav.search = ''; });

describe('회의 탭 동그라미 (N-96)', () => {
  it('동그라미는 이미 지난 회의 중 속기록이 빈 수다 — 회의 줄 수가 아니다 (서버 mtNeedsMinutes)', async () => {
    const view = setup(ops({ mtNeedsMinutes: 2 }), 'tab=meeting');
    await waitFor(() => expect(top(view).getByRole('tab', { name: /^회의 2건/ })).toBeTruthy());
    // 속 갈래 「회의 목록」 카드도 같은 수 — 원문 §63 은 두 자리 모두 「32」다
    expect(within(view.getByRole('tablist', { name: '회의 보기' })).getByRole('tab', { name: /^회의 목록 2건/ })).toBeTruthy();
    cleanup();
    // 손봐야 할 것이 없으면 동그라미가 없다
    const none = setup(ops({ mtNeedsMinutes: 0 }));
    await waitFor(() => expect(top(none).getByRole('tab', { name: /^회의/ })).toBeTruthy());
    expect(top(none).getByRole('tab', { name: /^회의/ }).parentElement?.textContent).not.toMatch(/\d/);
  });
});

describe('§61 카드 — 공개 범위 칩 · 반려된 기한 (N-72 · N-95)', () => {
  const plan = (over: Partial<Plan>): Plan => ({
    id: 1, title: '기획', stage: 'rework', stageLabel: '보완 요청', goal: null, ask: null, dueOn: null, ownerName: '김범준',
    overdueDays: 0, dueState: 'none', reworkCount: 0, taskDone: 0, taskTotal: 0, dueLabel: null, dueStateLabel: '기한 없음',
    dueRejectedOn: null, share: null, shareLabel: null, ...over,
  });

  it('카드 머리 칩 줄은 「지정 공개」 다음 「보완 1」 · 반려된 기한은 지운 날짜와 「D-2 · 기한 반려」로 선다', async () => {
    const view = setup(ops({ plans: [
      plan({ id: 3, title: '자습 관리 프로그램 정규화', share: 'picked', shareLabel: '지정 공개', reworkCount: 1,
        taskDone: 2, taskTotal: 3, dueRejectedOn: '2026-08-19', dueLabel: 'D-2', dueState: 'rejected', dueStateLabel: '기한 반려' }),
      plan({ id: 4, title: '교재 SE/TE 공개 범위 확대', stage: 'done', stageLabel: '완료', share: 'all', shareLabel: '전체 공개',
        dueOn: '2026-08-11', dueState: 'approved', dueStateLabel: '기한 승인' }),
      // 옛 기획 — 공개 범위가 없으면 칩이 없다(모두에게 보인다 · 지어 적지 않는다)
      plan({ id: 5, title: '옛 기획', stage: 'draft', stageLabel: '작성 중' }),
    ] }), 'tab=plan');
    const card = await waitFor(() => view.getByRole('button', { name: /자습 관리 프로그램 정규화/ }));
    const chips = within(card).getByText('지정 공개').parentElement!;
    expect([...chips.children].map((c) => c.textContent)).toEqual(['지정 공개', '보완 1']);
    expect(within(card).getByText('지정 공개').className).toContain('bg-orange');
    expect(within(card).getByText('D-2')).toBeTruthy();
    expect(within(card).getByText('08-19')).toBeTruthy();
    expect(within(card).getByText('기한 반려').className).toContain('bg-red');

    const done = view.getByRole('button', { name: /교재 SE\/TE 공개 범위 확대/ });
    expect(within(done).getByText('전체 공개').className).toContain('bg-green');
    expect(within(done).getByText('기한 승인').className).toContain('bg-green');
    const old = view.getByRole('button', { name: /옛 기획/ });
    expect(within(old).queryByText(/공개/)).toBeNull();
  });
});

describe('§64 할 일 줄 모양 (g6 64-2 · 64-3 · N-71)', () => {
  it('제목 앞 채운 출처 칩 · 오른쪽 연결 수업 칩(그 회차로 간다) · 「받는 사람 준 사람 지시」 · 「고치기」', async () => {
    const today = todayKst();
    const todo = (over: Partial<Todo>): Todo => ({
      id: 1, title: '할 일', toId: 7, toName: 'Hoon', fromName: '김민선', dueOn: today, done: false,
      src: 'manual', srcLabel: '직접 등록', overdueDays: 0, lesson: null, go: null, ...over,
    });
    const view = setup(ops({
      todos: [
        // 수업 할 일의 「원본」은 연결 수업 칩과 같은 주소다(서버 한 함수) — 칩이 곧 원본 링크다
        todo({ id: 1, title: '교재 2권 미리 준비', src: 'lesson', srcLabel: '수업',
          lesson: { label: '학습실 09:30', color: null, go: `/schedule?date=${today}&serId=3&onDate=${today}` },
          go: `/schedule?date=${today}&serId=3&onDate=${today}` }),
        todo({ id: 2, title: '지난 회의 결정사항 공유', toId: 8, toName: 'Lauren', src: 'meeting', srcLabel: '회의',
          go: '/ops?tab=meeting&meeting=5' }),
        todo({ id: 3, title: '손으로 적은 일', toId: 8, toName: 'Lauren' }),
      ],
      todoOwnerCounts: [{ key: '7', label: 'Hoon', count: 1 }, { key: '8', label: 'Lauren', count: 2 }],
    }));
    const row = (await waitFor(() => view.getByRole('checkbox', { name: '교재 2권 미리 준비 완료' }))).closest('li')!;
    const src = within(row).getByText('수업');
    expect(src.className).toContain('bg-blue');
    // 출처 칩이 제목 **앞**이다 — 제목 아래 둘째 줄이 아니다
    expect(src.compareDocumentPosition(within(row).getByText('교재 2권 미리 준비')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const lesson = within(row).getByRole('link', { name: '연결 수업 학습실 09:30 열기' });
    expect(lesson.getAttribute('href')).toBe(`/schedule?date=${today}&serId=3&onDate=${today}`);
    // 같은 주소의 「원본」을 한 번 더 세우지 않는다 — 이 줄의 링크는 칩 하나다
    expect(within(row).getAllByRole('link')).toHaveLength(1);
    expect(within(row).getByText('Hoon').tagName).toBe('B');
    expect(within(row).getByText('김민선 지시')).toBeTruthy();
    expect(row.textContent).not.toContain('→');
    expect(within(row).getByRole('button', { name: '교재 2권 미리 준비 기한 고치기' }).textContent).toBe('고치기');
    // 연결 수업이 없는 줄에는 칩이 없고, 서버가 준 「원본」(그 회의 상세)이 선다 (W11 A' 후속 2 · 원문 §64 규칙)
    const meeting = view.getByRole('checkbox', { name: '지난 회의 결정사항 공유 완료' }).closest('li')!;
    expect(within(meeting).getByText('회의').className).toContain('bg-violet');
    expect(within(meeting).getByRole('link', { name: '원본' }).getAttribute('href')).toBe('/ops?tab=meeting&meeting=5');
    // 원본이 없는 줄(손으로 적은 일)에는 링크가 없다 — 화면이 주소를 짓지 않는다
    const manual = view.getByRole('checkbox', { name: '손으로 적은 일 완료' }).closest('li')!;
    expect(within(manual).queryByRole('link')).toBeNull();
  });
});

describe('줄 하나를 곧장 여는 질의 (N-32 · 7-3 ①)', () => {
  const detail: MeetingDetail = {
    id: 5, mtType: 'general', mtTypeLabel: '일반 회의', title: null, onDate: '2026-08-20',
    startMin: 1110, endMin: 1170, placeLabel: '6호',
    attendees: [{ staffId: 4, name: '대표', title: null, state: 'waiting', stateLabel: '응답 대기' }],
    confirmed: 0, attendLabel: '참석 0/1 확인', preFiles: [], minutes: null, minutesAt: null, minutesByName: null,
    minutesTemplates: [], minutesHint: '', tasks: [], taskDone: 0,
    canEdit: true, canSendNotice: false, noticeBlockedReason: '안내를 받을 참석자가 없습니다',
    canRespond: true, myAttend: { state: 'waiting', stateLabel: '응답 대기' },
  };

  it('회의 안내 알림의 링크(`?tab=meeting&meeting=`)는 그 회의 상세를 연다 — 거기서 본인이 응답한다', async () => {
    const view = setup(ops(), 'tab=meeting&meeting=5', { '/ops/meetings/5': detail });
    const dialog = await waitFor(() => view.getByRole('dialog', { name: '일반 회의' }));
    expect(within(dialog).getByRole('group', { name: '내 참석 응답' })).toBeTruthy();
    expect(top(view).getByRole('tab', { name: /^회의/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('대표 보고의 컴플레인 줄(`?tab=complaint&cpl=`)은 그 처리 창을 열고, 이번 달 밖의 건도 찾도록 기간을 「전체」에서 시작한다', async () => {
    const view = setup(ops({
      cplStages: [{ key: 'received', label: '접수', sub: '받았습니다' }],
      complaints: [
        { id: 9, area: 'lesson', areaLabel: '수업', studentName: '양찬욱', stage: 'received', body: '진도가 느리다는 말씀',
          action: null, result: null, createdAt: '2026-06-02', ageDays: 80, ownerName: null, overdueDays: 0, teacherChanged: false, canWithdraw: false, refunds: [] },
      ],
    }), 'tab=complaint&cpl=9');
    await waitFor(() => expect(view.getByRole('dialog', { name: '컴플레인 — 양찬욱 · 수업' })).toBeTruthy());
    const periods = within(view.getByRole('group', { name: '기간' }));
    expect(periods.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('true');
    // 기간을 안 걸고 받는다 — 목록에 그 건이 있어야 창이 선다
    const calls = view.get.mock.calls.filter((c) => c[0] === '/ops').map((c) => (c[1] as { params: Record<string, string> }).params);
    expect(calls.at(-1)).not.toHaveProperty('from');
  });
});

describe('§67 카드 갈래 칩 (W11 재대조 · 67-7)', () => {
  it('선생님 갈래 칩은 분홍이다 — 원문 카드의 「선생님」은 옆의 「심각」(빨강)과 다른 색이다', async () => {
    const view = setup(ops({
      cplStages: [{ key: 'closed', label: '결과', sub: '마무리했습니다' }],
      complaints: [
        { id: 3, area: 'teacher', areaLabel: '선생님', studentName: '이하린', stage: 'closed', body: '강사 교체 요청',
          action: null, result: '교체', createdAt: '2026-08-10', ageDays: 12, ownerName: '김범준', overdueDays: 0,
          severity: 'severe', severityLabel: '심각', teacherChanged: false, canWithdraw: false, refunds: [] },
      ],
    }), 'tab=complaint');
    const card = await waitFor(() => view.getByRole('button', { name: '컴플레인 강사 교체 요청' }));
    expect(within(card).getByText('선생님').className).toContain('bg-pink');
    expect(within(card).getByText('심각').className).toContain('bg-red');
  });
});
