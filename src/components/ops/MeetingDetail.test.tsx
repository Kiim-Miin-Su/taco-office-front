/** @file-guide
 * 목적: §66 회의 상세 — 참석 세 값과 머리 숫자를 화면이 다시 만들지 않는다 (C57).
 * 책임/재사용: 실제 MeetingDetail 을 쓰고 질의·쓰기 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { MeetingDetail as MeetingDetailDto, StaffBrief } from '@/api/types';

const { state, save, assign } = vi.hoisted(() => ({
  state: { data: undefined as MeetingDetailDto | undefined, isLoading: false, isError: false, error: null },
  save: vi.fn(),
  assign: vi.fn(),
}));
vi.mock('@/api/queries', () => ({
  useMeetingDetail: () => state,
  useWriteMinutes: () => ({ mutate: save, isPending: false, isError: false, error: null }),
  useAssignMeetingTask: () => ({ mutate: assign, isPending: false, isError: false, error: null }),
}));

const { MeetingDetail } = await import('./MeetingDetail');

const staff: StaffBrief[] = [
  { id: 2, name: '김민수' }, { id: 3, name: '김범준' },
] as unknown as StaffBrief[];

const base: MeetingDetailDto = {
  id: 4, mtType: 'general', mtTypeLabel: '일반 회의', title: '주간 운영 회의', onDate: '2026-08-20',
  attendees: [
    { staffId: 2, name: '김민수', title: '관리자', state: 'waiting', stateLabel: '응답 대기' },
    { staffId: 3, name: '김범준', title: null, state: 'in', stateLabel: '참석' },
    { staffId: 4, name: '정은채', title: null, state: 'out', stateLabel: '불참' },
  ],
  confirmed: 1, attendLabel: '참석 1/3 확인',
  preFiles: ['seed://pre/agenda.pdf'],
  minutes: '[정한 것]\n· 9월 블로그 8편',
  minutesAt: '2026-08-20T14:20:00+09:00', minutesByName: '김민선',
  minutesTemplates: ['[정한 것]', '[누가 무엇을]', '[다음 회의까지]', '[보류]'],
  minutesHint: '정한 것 · 누가 무엇을 · 다음 회의까지',
  tasks: [
    { id: 9, title: '단가 시뮬레이션', done: false, toName: '김범준', dueOn: '2026-08-26', overdueDays: 5 },
    { id: 8, title: '끝낸 것', done: true, toName: '김민수', dueOn: '2026-08-21', overdueDays: 0 },
  ],
  taskDone: 1,
};

const setup = (d: MeetingDetailDto) => {
  state.data = d;
  return render(<MeetingDetail meetingId={4} staff={staff} onClose={() => {}} />);
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('「참석 N/M 확인」은 서버가 준 문장이다 — 화면이 칩을 세지 않는다 (D-R37)', () => {
  const v = setup(base);
  expect(v.getByText('참석 1/3 확인')).toBeTruthy();
});

it('참석은 세 값이다 — 「응답 대기」와 「불참」을 같은 칩으로 접지 않는다', () => {
  const v = setup(base);
  expect(v.getByText('응답 대기')).toBeTruthy();
  expect(v.getByText('참석')).toBeTruthy();
  expect(v.getByText('불참')).toBeTruthy();
});

it('회의 종류 이름도 서버가 준 것이다 — 코드값이 화면으로 새지 않는다 (D-R18)', () => {
  const v = setup(base);
  expect(v.getByText(/일반 회의/)).toBeTruthy();
  expect(v.queryByText(/general/)).toBeNull();
});

it('마지막 저장 시각과 사람을 그대로 보인다', () => {
  const v = setup(base);
  expect(v.getByText('마지막 저장 2026-08-20 14:20 · 김민선')).toBeTruthy();
});

it('저장한 적이 없으면 그렇게 적는다 — 빈 시각을 지어내지 않는다', () => {
  const v = setup({ ...base, minutes: null, minutesAt: null, minutesByName: null });
  expect(v.getByText('아직 저장한 적이 없습니다')).toBeTruthy();
});

it('머리말 단추는 서버가 준 넷이고, 누르면 본문에 끼워진다', async () => {
  const v = setup({ ...base, minutes: '' });
  for (const w of base.minutesTemplates) expect(v.getByRole('button', { name: w })).toBeTruthy();
  fireEvent.click(v.getByRole('button', { name: '[누가 무엇을]' }));
  const box = v.getByLabelText('속기록') as HTMLTextAreaElement;
  await waitFor(() => expect(box.value).toContain('[누가 무엇을]'));
});

it('고치지 않은 속기록은 저장 단추가 닫혀 있다 — 같은 글을 다시 쓰지 않는다', () => {
  const v = setup(base);
  expect((v.getByRole('button', { name: '속기록 저장' }) as HTMLButtonElement).disabled).toBe(true);
});

it('고치면 열리고, 본문을 그대로 보낸다', async () => {
  const v = setup(base);
  fireEvent.change(v.getByLabelText('속기록'), { target: { value: '고친 속기록' } });
  fireEvent.click(v.getByRole('button', { name: '속기록 저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ id: 4, minutes: '고친 속기록' }));
});

it('할 일은 제목과 담당이 있어야 배정된다', async () => {
  const v = setup(base);
  fireEvent.click(v.getByRole('button', { name: /③ 할 일/ }));
  const send = v.getByRole('button', { name: '배정' }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.change(v.getByLabelText('할 일'), { target: { value: '단가 시뮬레이션' } });
  fireEvent.change(v.getByLabelText('담당'), { target: { value: '3' } });
  fireEvent.click(v.getByRole('button', { name: '배정' }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith(
    { id: 4, title: '단가 시뮬레이션', toId: 3 }, expect.anything(),
  ));
});

it('끝낸 할 일 수도 서버가 센다', () => {
  const v = setup(base);
  fireEvent.click(v.getByRole('button', { name: /③ 할 일/ }));
  expect(v.getByText('끝낸 것 1/2')).toBeTruthy();
  expect(v.getByText(/5일 지남/)).toBeTruthy();
});

it('사전 자료가 없으면 빈 상태를 보인다', () => {
  const v = setup({ ...base, preFiles: [] });
  fireEvent.click(v.getByRole('button', { name: /① 사전 자료/ }));
  expect(v.getByText('사전 자료가 없습니다')).toBeTruthy();
});
