/** @file-guide
 * 목적: §65 기획 보고서 — 단추가 열리는지를 화면이 판정하지 않는다 (C56).
 * 책임/재사용: 실제 PlanReport 를 쓰고 질의·쓰기 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlanDetail } from '@/api/types';

const { state, decide, review, patch, move } = vi.hoisted(() => ({
  state: { data: undefined as PlanDetail | undefined, isLoading: false, isError: false, error: null },
  decide: vi.fn(),
  review: vi.fn(),
  patch: vi.fn(),
  move: vi.fn(),
}));
vi.mock('@/api/queries', () => ({
  usePlanDetail: () => state,
  useDecidePlanDue: () => ({ mutate: decide, isPending: false, isError: false, error: null }),
  useReviewPlan: () => ({ mutate: review, isPending: false, isError: false, error: null }),
  usePatchPlan: () => ({ mutate: patch, isPending: false, isError: false, error: null }),
  useMovePlanStage: () => ({ mutate: move, isPending: false, isError: false, error: null }),
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
};

/** 작성 중 — 담당이 적고 올리는 쪽의 화면 (S6) */
const drafting: PlanDetail = {
  ...base, stage: 'draft', stageLabel: '작성 중', research: null,
  dueState: 'approved', dueStateLabel: '기한 승인됨', canDecideDue: false,
  canReview: false, reviewBlockedReason: '아직 검토 요청이 올라오지 않았습니다',
  canEdit: true, editBlockedReason: null, nextStages: [{ key: 'review', label: '검토 요청' }],
};

const setup = (d: PlanDetail) => { state.data = d; return render(<PlanReport planId={3} onClose={() => {}} />); };
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
  expect(v.getByText('과제 1/2')).toBeTruthy();
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
