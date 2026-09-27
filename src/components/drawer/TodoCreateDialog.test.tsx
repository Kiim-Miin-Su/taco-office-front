/** @file-guide
 * 목적: TodoCreateDialog.test.tsx — 수업 상세 「+ 할 일」(LessonTodoButton)이 공용 할 일 창으로 회차 키를 싣는다 (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * W11 · N-71 — 수업 상세 「+ 할 일」은 **새 창 · 새 경로가 아니다**. 서랍 §15 · 운영 §64 와 같은 창(`TodoCreateDialog`)과
 * 같은 쓰기(`POST /drawer/todos`)에 회차 키(serId · onDate)를 더 실을 뿐이다. 회차 검증 · 권한은 서버가 한다.
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/api/queries', () => ({ useDrawerWrite: () => ({ mutate, isPending: false }) }));
vi.mock('@/store/useSession', () => ({
  useSession: (pick: (s: { me: { id: number } }) => unknown) => pick({ me: { id: 7 } }),
}));

const { LessonTodoButton, TodoCreateDialog } = await import('./TodoCreateDialog');

const PEOPLE = [{ id: 7, name: '홍지승' }, { id: 8, name: 'Hoon' }];
/** 옮긴 회차 — 규칙이 찍은 날(키)은 09-03, 그려지는 날은 09-04 */
const LESSON = { serId: 3, onDate: '2026-09-03', date: '2026-09-04', label: 'AP Chemistry · 2026-09-04 10:00' };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('회차 키를 싣고 서랍과 같은 쓰기를 부른다 — 기한 기본은 그 회차가 그려지는 날 · 담당 기본은 나', async () => {
  mutate.mockImplementation((_w: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
  const v = render(<LessonTodoButton people={PEOPLE} lesson={LESSON} />);
  fireEvent.click(v.getByRole('button', { name: '+ 할 일' }));
  expect(v.getByText('AP Chemistry · 2026-09-04 10:00')).toBeTruthy();
  expect((v.getByLabelText('기한') as HTMLInputElement).value).toBe('2026-09-04');
  expect((v.getByLabelText('담당자') as HTMLSelectElement).value).toBe('7');
  fireEvent.change(v.getByLabelText('할 일'), { target: { value: '교재 2권 미리 준비' } });
  fireEvent.change(v.getByLabelText('담당자'), { target: { value: '8' } });
  fireEvent.click(v.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(mutate).toHaveBeenCalledWith(
    { kind: 'todoCreate', body: { title: '교재 2권 미리 준비', toId: 8, dueOn: '2026-09-04', serId: 3, onDate: '2026-09-03' } },
    expect.anything(),
  ));
  expect(v.getByRole('status').textContent).toBe('할 일을 걸었습니다 — 교재 2권 미리 준비');
});

it('막히면 서버 문장을 그대로 보인다 — 휴강한 회차 · 없는 회차 · 권한은 화면이 다시 판정하지 않는다', async () => {
  mutate.mockImplementation((_w: unknown, opts?: { onError?: (e: unknown) => void }) =>
    opts?.onError?.(new ApiError('TODO_LESSON_CANCELED', '휴강한 회차에는 할 일을 걸지 않습니다', 409)));
  const v = render(<LessonTodoButton people={PEOPLE} lesson={LESSON} />);
  fireEvent.click(v.getByRole('button', { name: '+ 할 일' }));
  fireEvent.change(v.getByLabelText('할 일'), { target: { value: '준비' } });
  fireEvent.click(v.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(v.getByRole('alert').textContent).toBe('휴강한 회차에는 할 일을 걸지 않습니다'));
});

it('서랍 · 운영의 「할 일 만들기」는 회차 키를 싣지 않는다 — 손으로 만든 할 일이다', () => {
  const onCreate = vi.fn();
  const v = render(<TodoCreateDialog open onClose={() => {}} people={PEOPLE} meId={7} onCreate={onCreate} />);
  fireEvent.change(v.getByLabelText('할 일'), { target: { value: '자료 정리' } });
  fireEvent.click(v.getByRole('button', { name: '만들기' }));
  expect(onCreate).toHaveBeenCalledTimes(1);
  expect(onCreate.mock.calls[0][0]).not.toHaveProperty('serId');
  expect(onCreate.mock.calls[0][0]).not.toHaveProperty('onDate');
});
