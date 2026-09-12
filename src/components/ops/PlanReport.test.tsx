/** @file-guide
 * 목적: §65 기획 보고서 — 단추가 열리는지를 화면이 판정하지 않는다 (C56).
 * 책임/재사용: 실제 PlanReport 를 쓰고 질의·쓰기 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlanDetail } from '@/api/types';

const { state, decide, review } = vi.hoisted(() => ({
  state: { data: undefined as PlanDetail | undefined, isLoading: false, isError: false, error: null },
  decide: vi.fn(),
  review: vi.fn(),
}));
vi.mock('@/api/queries', () => ({
  usePlanDetail: () => state,
  useDecidePlanDue: () => ({ mutate: decide, isPending: false, isError: false, error: null }),
  useReviewPlan: () => ({ mutate: review, isPending: false, isError: false, error: null }),
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
