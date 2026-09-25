/** @file-guide
 * 목적: §65 기획 보고서 — 단추가 열리는지를 화면이 판정하지 않는다 (C56).
 * 책임/재사용: 실제 PlanReport 를 쓰고 질의·쓰기 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlanDetail } from '@/api/types';

const { state, decide, review, patch, move, todo, addTask } = vi.hoisted(() => ({
  state: { data: undefined as PlanDetail | undefined, isLoading: false, isError: false, error: null },
  decide: vi.fn(),
  review: vi.fn(),
  patch: vi.fn(),
  move: vi.fn(),
  todo: vi.fn(),
  addTask: vi.fn(),
}));
vi.mock('@/api/queries', () => ({
  usePlanDetail: () => state,
  useDecidePlanDue: () => ({ mutate: decide, isPending: false, isError: false, error: null }),
  useReviewPlan: () => ({ mutate: review, isPending: false, isError: false, error: null }),
  usePatchPlan: () => ({ mutate: patch, isPending: false, isError: false, error: null }),
  useMovePlanStage: () => ({ mutate: move, isPending: false, isError: false, error: null }),
  // 과제 체크는 **서랍·운영 할 일과 같은 쓰기**다 — 새 경로를 만들지 않는다
  useDrawerWrite: () => ({ mutate: todo, isPending: false, isError: false, error: null }),
}));

// 「+ 대표 지시」 (w5 · 65-4) — 새 쓰기 경로 하나. 몸통은 서버다
vi.mock('./ops-queries', () => ({
  useAddPlanTask: () => ({ mutate: addTask, isPending: false, isError: false, error: null }),
}));

const { PlanReport } = await import('./PlanReport');

const base: PlanDetail = {
  id: 3, title: '9월 신규 상담 유입 30% 늘리기', stage: 'review', stageLabel: '검토 요청',
  ownerName: '홍지승', createdOn: '2026-08-15',
  goal: '9월 신규 상담을 8월 대비 30% 늘립니다. 목표 42건.',
  tasks: [
    { id: 1, title: '블로그 MAP 준비 시리즈 3편 발행', done: true, toName: '홍지승', dueOn: '2026-08-23', overdueDays: 0 },
    { id: 2, title: '인스타 릴스 주 2회로 확대', done: false, toName: '홍지승', dueOn: '2026-08-26', overdueDays: 5 },
  ],
  taskDone: 1,
  research: '8월 유입 32건 중 블로그 14 · 인스타 7.',
  ask: '블로그 발행 편수를 월 4편에서 8편으로 늘리고,',
  dueOn: '2026-08-25', dueState: 'proposed', dueStateLabel: '기한 제안',
  dueApprovedByName: null, overdueDays: 4,
  canDecideDue: true, canReview: false, reviewBlockedReason: '기한부터 승인하세요',
  // S6 — 올라간 기획은 고칠 수 없고 옮길 곳도 없다(다음 칸은 대표의 결재가 정한다)
  reworkReason: null, canEdit: false,
  editBlockedReason: '대표 확인을 기다리는 중입니다 — 보완 요청을 받은 뒤에 고칠 수 있습니다',
  nextStages: [],
  // w5 · 65-4 — 서는지와 막힌 이유는 서버가 준다
  canAddTask: true, addTaskBlockedReason: null,
};

/** 작성 중 — 담당이 적고 올리는 쪽의 화면 (S6) */
const drafting: PlanDetail = {
  ...base, stage: 'draft', stageLabel: '작성 중', research: null,
  dueState: 'approved', dueStateLabel: '기한 승인됨', canDecideDue: false,
  canReview: false, reviewBlockedReason: '아직 검토 요청이 올라오지 않았습니다',
  canEdit: true, editBlockedReason: null, nextStages: [{ key: 'review', label: '검토 요청' }],
};

const STAFF = [{ id: 7, name: '홍지승' }, { id: 8, name: '김성재' }];
const setup = (d: PlanDetail) => { state.data = d; return render(<PlanReport planId={3} staff={STAFF} onClose={() => {}} />); };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('기한 승인 전에는 최종 승인 단추가 「기한부터 승인하세요」로 닫혀 있다', () => {
  const v = setup(base);
  const btn = v.getByRole('button', { name: '기한부터 승인하세요' }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  expect(v.getByText('기한 제안 2026-08-25')).toBeTruthy();
  expect(v.getByText('대표 확인을 기다립니다')).toBeTruthy();
});

it('막힌 이유는 서버가 준 문장이다 — 화면이 조건을 다시 적지 않는다', () => {
  const v = setup({ ...base, canDecideDue: false, reviewBlockedReason: '기획 결재는 대표만 합니다' });
  expect(v.getByText('기획 결재는 대표만 합니다')).toBeTruthy();
  expect(v.queryByRole('button', { name: '기한 승인' })).toBeNull();
});

it('기한 승인·반려를 서버에 그대로 보낸다', async () => {
  const v = setup(base);
  fireEvent.click(v.getByRole('button', { name: '기한 승인' }));
  await waitFor(() => expect(decide).toHaveBeenCalledWith({ id: 3, approve: true }));
  fireEvent.click(v.getByRole('button', { name: '기한 반려' }));
  await waitFor(() => expect(decide).toHaveBeenCalledWith({ id: 3, approve: false }));
});

it('기한이 승인되면 최종 승인이 열리고 누가 승인했는지 남는다', () => {
  const v = setup({
    ...base, dueState: 'approved', dueStateLabel: '기한 승인됨', dueApprovedByName: '김민선',
    canDecideDue: false, canReview: true, reviewBlockedReason: null,
  });
  const btn = v.getByRole('button', { name: '최종 승인' }) as HTMLButtonElement;
  expect(btn.disabled).toBe(false);
  expect(v.getByText('기한은 김민선 님이 승인했습니다.')).toBeTruthy();
  expect(v.queryByText('대표 확인을 기다립니다')).toBeNull();
});

it('보완 요청은 사유를 적기 전에는 보내지 않는다', async () => {
  const v = setup({ ...base, dueState: 'approved', dueStateLabel: '기한 승인됨', canReview: true, reviewBlockedReason: null });
  fireEvent.click(v.getByRole('button', { name: '보완 요청' }));
  const send = v.getByRole('button', { name: '보완 요청 보내기' }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.change(v.getByLabelText('보완 요청 사유 (필수)'), { target: { value: '리서치 근거 부족' } });
  fireEvent.click(v.getByRole('button', { name: '보완 요청 보내기' }));
  await waitFor(() => expect(review).toHaveBeenCalledWith(
    { id: 3, decision: 'rework', reason: '리서치 근거 부족' }, expect.anything(),
  ));
});

it('과제 수와 지난 날은 서버가 준 값을 그린다 — 화면이 다시 세지 않는다', () => {
  const v = setup(base);
  // 레터헤드의 「과제」 칸 (65-2) — 값은 서버의 taskDone / tasks.length
  expect(v.getByLabelText('과제 1/2').textContent).toBe('1/2');
  expect(v.getByText(/5일 지남/)).toBeTruthy();
  expect(v.getByText('4일 지남')).toBeTruthy();
});

it('네 칸을 원문 차례대로 보인다', () => {
  const v = setup(base);
  for (const h of ['1 · 목표', '2 · 과제', '3 · 리서치', '4 · 결정 요청']) {
    expect(v.getByText(h)).toBeTruthy();
  }
});

/* ── S6 「기획이 결재까지 간다」 ─────────────────────────────────────── */

it('올린 기획은 칸이 잠기고 이유가 뜬다 — 칸을 없애지는 않는다 (S5 와 같은 모양)', () => {
  const v = setup(base);
  expect(v.queryByLabelText('리서치')).toBeNull();
  expect(v.getByText('대표 확인을 기다리는 중입니다 — 보완 요청을 받은 뒤에 고칠 수 있습니다')).toBeTruthy();
  expect(v.queryByRole('button', { name: '저장' })).toBeNull();
  expect(v.queryByRole('button', { name: '검토 요청 보내기' })).toBeNull();
});

it('작성 중이면 목표·리서치·결정 요청을 적고, **바뀐 칸만** 보낸다', async () => {
  const v = setup(drafting);
  const save = v.getByRole('button', { name: '저장됨' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true); // 아직 고친 것이 없다

  fireEvent.change(v.getByLabelText('리서치'), { target: { value: '8월 유입 32건 중 블로그 14' } });
  fireEvent.click(v.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith({ id: 3, research: '8월 유입 32건 중 블로그 14' }));
  // 목표·결정 요청은 손대지 않았으므로 본문에 없다 — 남의 줄을 덮지 않는다
  expect(Object.keys(patch.mock.calls[0]![0] as object)).toEqual(['id', 'research']);
});

it('「검토 요청 보내기」는 적은 것을 먼저 저장한 뒤에 올린다 (C85-a 대표 보고와 같은 순서)', async () => {
  const v = setup(drafting);
  fireEvent.change(v.getByLabelText('리서치'), { target: { value: '근거' } });
  fireEvent.click(v.getByRole('button', { name: '검토 요청 보내기' }));

  await waitFor(() => expect(patch).toHaveBeenCalledWith({ id: 3, research: '근거' }, expect.anything()));
  expect(move).not.toHaveBeenCalled(); // 저장이 끝나기 전에는 안 올린다
  (patch.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess();
  expect(move).toHaveBeenCalledWith({ id: 3, to: 'review' });
});

it('고친 것이 없으면 바로 올린다 — 빈 저장을 먼저 보내지 않는다', async () => {
  const v = setup(drafting);
  fireEvent.click(v.getByRole('button', { name: '검토 요청 보내기' }));
  await waitFor(() => expect(move).toHaveBeenCalledWith({ id: 3, to: 'review' }));
  expect(patch).not.toHaveBeenCalled();
});

it('갈 수 있는 곳은 서버가 준 nextStages 뿐이다 — 화면이 전이표를 들지 않는다 (D-R39)', async () => {
  const v = setup({
    ...drafting, stage: 'approved', stageLabel: '승인', canEdit: false,
    editBlockedReason: '결재가 끝난 기획은 고칠 수 없습니다',
    nextStages: [{ key: 'done', label: '완료' }],
  });
  expect(v.queryByRole('button', { name: '검토 요청 보내기' })).toBeNull();
  fireEvent.click(v.getByRole('button', { name: '완료 처리' }));
  await waitFor(() => expect(move).toHaveBeenCalledWith({ id: 3, to: 'done' }));
});

it('보완 요청 사유가 화면에 뜬다 — 그동안 log 에만 있어 담당자가 볼 데가 없었다', () => {
  const v = setup({
    ...drafting, stage: 'rework', stageLabel: '보완 요청', reworkReason: '리서치 근거가 없습니다',
  });
  // 보는 것은 **사유**다 — 「보완 요청」이라는 낱말은 칸 이름이자 단추 이름이기도 해서 혼자서는 증거가 못 된다
  const banner = v.getByText(/리서치 근거가 없습니다/);
  expect(banner.textContent).toContain('보완 요청');
  // 되돌아왔으니 다시 적을 수 있다
  expect(v.getByLabelText('리서치')).toBeTruthy();
});

it('막힌 이유가 단추의 이름이다 — 한 자리에서 두 말이 나지 않는다 (S6 에서 고쳤다)', () => {
  // 기한은 이미 승인됐는데 대표가 아니다 — 전에는 단추가 「기한부터 승인하세요」라 거짓말했다
  const v = setup({
    ...base, dueState: 'approved', dueStateLabel: '기한 승인됨', canDecideDue: false,
    reviewBlockedReason: '기획 결재는 대표만 합니다',
  });
  const btn = v.getByRole('button', { name: '기획 결재는 대표만 합니다' }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  expect(btn.getAttribute('title')).toBe('기획 결재는 대표만 합니다');
  expect(v.queryByRole('button', { name: '기한부터 승인하세요' })).toBeNull();
});

/* ── 원문 §65 — 가운데 큰 창 · 과제 체크 (65-1 · 65-3 · 65-6 · 65-8) ───────────────── */

it('보고서는 오른쪽 서랍이 아니라 가운데 큰 창으로 열리고, 닫기는 머리의 × 하나다 (65-1)', () => {
  const v = setup(base);
  const dialog = v.getByRole('dialog', { name: '9월 신규 상담 유입 30% 늘리기' });
  // 서랍은 <aside> 로 오른쪽에 붙는다 — 큰 창은 가운데 놓인 넓은 상자다
  expect(dialog.tagName).toBe('DIV');
  expect(dialog.style.maxWidth).toBe('1480px');
  const close = within(dialog).getByRole('button', { name: '닫기' });
  expect(close.textContent).toBe('×');
  // 바닥 「닫기」 단추는 원문에 없다 — 닫는 자리는 하나다
  expect(within(dialog).getAllByRole('button', { name: '닫기' })).toHaveLength(1);
});

it('단계 칩은 제목 옆(머리)에 선다 (65-6)', () => {
  const v = setup(base);
  const heading = v.getByRole('heading', { name: '9월 신규 상담 유입 30% 늘리기' });
  expect(heading.parentElement!.textContent).toContain('검토 요청');
});

it('과제 줄은 체크박스다 — 누르면 할 일 완료 경로(서랍과 같은 쓰기)로 보낸다 (65-3)', async () => {
  const v = setup(base);
  const open = v.getByRole('checkbox', { name: '인스타 릴스 주 2회로 확대 완료' }) as HTMLInputElement;
  expect(open.checked).toBe(false);
  const done = v.getByRole('checkbox', { name: '블로그 MAP 준비 시리즈 3편 발행 완료' }) as HTMLInputElement;
  expect(done.checked).toBe(true);
  fireEvent.click(open);
  await waitFor(() => expect(todo).toHaveBeenCalledWith({ kind: 'todo', id: 2, done: true }, expect.anything()));
  fireEvent.click(done);
  await waitFor(() => expect(todo).toHaveBeenCalledWith({ kind: 'todo', id: 1, done: false }, expect.anything()));
});

/* ── w5 · 원문 §65 레터헤드 · 「+ 대표 지시」 (65-2 · 65-4) ───────────────── */

it('본문은 레터헤드 문서다 — 「TN ACADEMY · 기획 보고」 · 작성일 · 큰 제목 · 담당/마감/과제 격자 (65-2)', () => {
  const v = setup(base);
  const doc = v.getByRole('article', { name: '기획 보고서 본문' });
  expect(within(doc).getByText('TN ACADEMY · 기획 보고')).toBeTruthy();
  expect(within(doc).getByText('2026.08.15')).toBeTruthy();
  // 큰 제목은 글이다 — 창의 제목(heading)은 하나뿐이다
  expect(v.getAllByRole('heading', { name: '9월 신규 상담 유입 30% 늘리기' })).toHaveLength(1);
  expect(within(doc).getByText('홍지승', { selector: 'dd' })).toBeTruthy();
  const due = within(doc).getByText('2026-08-25', { selector: 'b' });
  expect(due.className).toContain('text-red');
  // 기한 상태 칩도 서버 낱말이다
  expect(within(doc).getAllByText('기한 제안').length).toBeGreaterThan(0);
});

it('「+ 대표 지시」는 서버가 열 때만 서고, 같은 「할 일 만들기」 창으로 과제를 보낸다 (65-4)', async () => {
  const closed = setup({ ...base, canAddTask: false, addTaskBlockedReason: '끝난 기획에는 과제를 더하지 않습니다' });
  expect(closed.queryByRole('button', { name: '+ 대표 지시' })).toBeNull();
  cleanup();

  const v = setup(base);
  fireEvent.click(v.getByRole('button', { name: '+ 대표 지시' }));
  const dialog = await v.findByRole('dialog', { name: '할 일 만들기' });
  fireEvent.change(within(dialog).getByLabelText('할 일'), { target: { value: '검색광고 키워드 재조정' } });
  fireEvent.change(within(dialog).getByLabelText('담당자'), { target: { value: '8' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(addTask).toHaveBeenCalledWith(
    expect.objectContaining({ id: 3, title: '검색광고 키워드 재조정', toId: 8 }),
  ));
});
