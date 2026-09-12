/** @file-guide
 * 목적: ApprovalsPane.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §14 승인 대기함 — **줄마다 반려·승인** (C41).
 *
 * 원문 §14 는 줄마다 두 단추를 갖고 D-R13 의 절 칸에도 14 가 들어 있다. 다만
 * **적용 경로가 있는 갈래만** 여기서 처리한다 — 그 판정은 서버의 `canAct` 다.
 * 화면이 종류를 보고 스스로 정하면, 적용 경로가 없는 갈래에 눌러도 아무 일이 없는
 * 단추가 생긴다.
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ApFlow, ApRow } from '@/api/types';
import { ApprovalsPane } from './panes';

vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

afterEach(cleanup);

const row = (over: Partial<ApRow> = {}): ApRow => ({
  kind: 'req', id: 1, title: '시급 변경 요청', sub: '42,000원/시간 → 45,000원/시간',
  byId: 6, byName: '이다현', at: '2026-09-12 10:00', state: 'waiting', why: null, go: '/ops',
  reqType: 'wage_change', asked: '42,000원/시간 → 45,000원/시간', canAct: true, ...over,
});
const flow = (waiting: ApRow[]): ApFlow => ({
  back: [], waiting, mine: [], count: waiting.length, missingKinds: [],
});

function panel(waiting: ApRow[], onReview = vi.fn()) {
  const view = render(<ApprovalsPane flow={flow(waiting)} onGo={vi.fn()} onReview={onReview} />);
  return { view, onReview };
}

it('처리할 수 있는 줄에만 단추가 붙는다 — 나머지는 그 화면으로 보내는 링크 그대로다', () => {
  const { view } = panel([row(), row({ kind: 'rep', id: 2, title: '리포트', canAct: false, reqType: null })]);
  const cards = view.getAllByRole('listitem');
  expect(within(cards[0]).getByRole('button', { name: '승인' })).toBeTruthy();
  expect(within(cards[1]).queryByRole('button', { name: '승인' })).toBeNull();
  expect(within(cards[1]).getByRole('link')).toBeTruthy();
  // 무엇을 바라는지 줄에 적혀 있다 — 근거를 안 보고 누르는 승인이 되지 않게
  expect(cards[0].textContent).toContain('42,000원/시간 → 45,000원/시간');
});

it('승인은 두 번 눌러야 나간다', () => {
  const { view, onReview } = panel([row()]);
  const approve = view.getByRole('button', { name: '승인' });
  fireEvent.click(approve);
  expect(onReview).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 승인' }));
  expect(onReview).toHaveBeenCalledWith({ id: 1, decision: 'approve', reason: undefined });
});

it('반려는 사유를 적어야 열린다 (D-R13) — 그리고 적은 사유가 그대로 간다', () => {
  const { view, onReview } = panel([row()]);
  expect(view.getByRole('button', { name: '반려' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '3개월 뒤 재검토' } });
  fireEvent.click(view.getByRole('button', { name: '반려' }));
  fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 반려' }));
  expect(onReview).toHaveBeenCalledWith({ id: 1, decision: 'reject', reason: '3개월 뒤 재검토' });
});

it('사유를 고치면 확정이 풀린다 — 다른 글자를 두고 눌러 버리지 않게', () => {
  const { view, onReview } = panel([row()]);
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '재검토' } });
  fireEvent.click(view.getByRole('button', { name: '반려' }));
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '재검토합니다' } });
  expect(view.getByRole('button', { name: '반려' })).toBeTruthy();
  expect(onReview).not.toHaveBeenCalled();
});

it('서버가 거절하면 그 말을 그대로 띄운다', () => {
  const view = render(
    <ApprovalsPane flow={flow([row()])} onGo={vi.fn()} onReview={vi.fn()} error="이미 승인된 요청입니다" />,
  );
  expect(view.container.textContent).toContain('이미 승인된 요청입니다');
});

it('처리할 줄이 하나도 없으면 안내는 예전대로 「그 화면에서」만 말한다', () => {
  const view = render(
    <ApprovalsPane flow={flow([row({ canAct: false })])} onGo={vi.fn()} onReview={vi.fn()} />,
  );
  expect(view.container.textContent).toContain('줄을 눌러 그 화면에서');
  expect(view.container.textContent).not.toContain('반려에도 사유가 남습니다');
});
