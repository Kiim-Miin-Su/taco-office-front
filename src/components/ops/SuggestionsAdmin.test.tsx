/** @file-guide
 * 목적: 건의 관리자 답변 입력과 기존 답변 수정 회귀 (test)
 * 책임/재사용: 실제 SuggestionsAdmin을 쓰고 mutation hook만 어댑터로 바꾼다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useReplySuggestion: () => ({ mutate, isPending: false, isError: false, error: null }),
}));
const { SuggestionsAdmin } = await import('./SuggestionsAdmin');

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const rows = [
  { id: 1, staffName: '강사 A', category: 'schedule', body: '목요일 시간을 옮기고 싶습니다', state: 'open', reply: null, createdAt: '2026-09-28', replyBy: null, replyOn: null },
  { id: 2, staffName: '강사 B', category: 'lesson', body: '교재를 확인해 주세요', state: 'done', reply: '새 교재로 배정했습니다', createdAt: '2026-09-27', replyBy: '대표', replyOn: '2026-09-28' },
] as const;

it('답변 필요 수와 기존 수신 사실을 보이고 새 답변을 id와 함께 보낸다', async () => {
  const view = render(<SuggestionsAdmin open rows={rows} onClose={() => {}} />);
  expect(view.getByText('답변 필요 1건 · 전체 2건')).toBeTruthy();
  expect(view.getByText('대표 · 2026-09-28')).toBeTruthy();
  const card = view.getByText('목요일 시간을 옮기고 싶습니다').closest('li')!;
  fireEvent.click(within(card).getByRole('button', { name: '답변하기' }));
  fireEvent.change(within(card).getByLabelText('강사 A 건의 답변'), { target: { value: '목요일 4시로 옮겼습니다' } });
  fireEvent.click(within(card).getByRole('button', { name: '답변 보내기' }));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith(
    { id: 1, reply: '목요일 4시로 옮겼습니다' }, expect.anything(),
  ));
});

it('기존 답변을 누르면 원문에서 시작해 같은 PATCH 경로로 수정한다', async () => {
  const view = render(<SuggestionsAdmin open rows={rows} onClose={() => {}} />);
  const card = view.getByText('교재를 확인해 주세요').closest('li')!;
  fireEvent.click(within(card).getByRole('button', { name: '답변 수정' }));
  const input = within(card).getByLabelText('강사 B 건의 답변') as HTMLTextAreaElement;
  expect(input.value).toBe('새 교재로 배정했습니다');
  fireEvent.change(input, { target: { value: '새 교재 두 권을 배정했습니다' } });
  fireEvent.click(within(card).getByRole('button', { name: '답변 수정' }));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith(
    { id: 2, reply: '새 교재 두 권을 배정했습니다' }, expect.anything(),
  ));
});
