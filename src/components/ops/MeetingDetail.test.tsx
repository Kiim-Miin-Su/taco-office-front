/** @file-guide
 * 목적: §66 회의 상세 — 참석 세 값과 머리 숫자를 화면이 다시 만들지 않는다 (C57).
 * 책임/재사용: 실제 MeetingDetail 을 쓰고 질의·쓰기 훅만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { MeetingDetail as MeetingDetailDto, StaffBrief } from '@/api/types';

const { state, save, assign, todo, notice, respond } = vi.hoisted(() => ({
  state: { data: undefined as MeetingDetailDto | undefined, isLoading: false, isError: false, error: null },
  save: vi.fn(),
  assign: vi.fn(),
  todo: vi.fn(),
  notice: vi.fn(),
  respond: vi.fn(),
}));
vi.mock('@/api/queries', () => ({
  useMeetingDetail: () => state,
  useWriteMinutes: () => ({ mutate: save, isPending: false, isError: false, error: null }),
  useAssignMeetingTask: () => ({ mutate: assign, isPending: false, isError: false, error: null }),
  // ③ 할 일 체크는 서랍·운영 할 일과 같은 쓰기다 (w5)
  useDrawerWrite: () => ({ mutate: todo, isPending: false, isError: false, error: null }),
  // W11 · N-32 — 「안내 보내기」 · 본인 참석 응답
  useSendMeetingNotice: () => ({ mutate: notice, isPending: false, isError: false, error: null }),
  useRespondMeeting: () => ({ mutate: respond, isPending: false, isError: false, error: null }),
}));

const { MeetingDetail } = await import('./MeetingDetail');

const staff: StaffBrief[] = [
  { id: 2, name: '김민수' }, { id: 3, name: '김범준' },
] as unknown as StaffBrief[];

const base: MeetingDetailDto = {
  id: 4, mtType: 'general', mtTypeLabel: '일반 회의', title: '주간 운영 회의', onDate: '2026-08-20',
  // w5 · 66-2 — 이어진 회차의 시각·자리 (§63 줄과 같은 값)
  startMin: 1110, endMin: 1170, placeLabel: '6호',
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
    { id: 9, title: '단가 시뮬레이션', done: false, toName: '김범준', dueOn: '2026-08-26', overdueDays: 5, canToggle: true },
    { id: 8, title: '끝낸 것', done: true, toName: '김민수', dueOn: '2026-08-21', overdueDays: 0, canToggle: true },
  ],
  taskDone: 1,
  // 운영 권한으로 여는 사람(참석자 아님) — 단추가 서는지는 서버가 정한다 (W11 · N-32 · D-R39)
  canEdit: true, canSendNotice: true, noticeBlockedReason: null, canRespond: false, myAttend: null,
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

/* ── 원문 §66 — 가운데 큰 창 (66-1) ─────────────────────────────────── */

it('회의 상세는 오른쪽 서랍이 아니라 가운데 큰 창이다 — 머리 × 와 원문 §66 바닥 「닫기」 (66-1 · w5 재대조)', () => {
  const v = setup(base);
  // 머리는 회의 **종류**다 — 원문 §66 「일반 회의」 (66-2)
  const dialog = v.getByRole('dialog', { name: '일반 회의' });
  expect(dialog.tagName).toBe('DIV');
  expect(dialog.style.maxWidth).toBe('1480px');
  // 닫는 자리 둘 — 머리의 × 와, 원문 §66 컷 바닥 「닫기」(§65 컷에는 없고 §66 컷에는 있다 · D-R44)
  const closes = within(dialog).getAllByRole('button', { name: '닫기' });
  expect(closes.map((b) => b.textContent)).toEqual(['×', '닫기']);
  // 바닥 줄 — 일정 보기 · 닫기 · 속기록 저장
  expect(within(dialog).getByRole('button', { name: '속기록 저장' })).toBeTruthy();
  expect(within(dialog).getByRole('link', { name: '일정 보기' })).toBeTruthy();
});

/* ── w5 · 원문 §66 재대조 (66-2 · 66-4 · 66-5 · 66-6 · ③ 체크박스) ───────────── */

it('머리 = 종류 + 날짜 칩, 부제 = 시각 · 참석자 · 자리 — 시각·자리는 서버 값이다 (66-2)', () => {
  const v = setup(base);
  expect(v.getByText('8월 20일 목요일')).toBeTruthy();
  expect(v.getByText('주간 운영 회의 · 18:30–19:30 · 김민수, 김범준, 정은채 · 6호')).toBeTruthy();
});

it('옛 회의(이어진 회차 없음)는 시각·자리를 지어내지 않고 부제에서 뺀다 (N-25)', () => {
  const v = setup({ ...base, title: null, startMin: null, endMin: null, placeLabel: null });
  expect(v.getByText('김민수, 김범준, 정은채')).toBeTruthy();
});

it('참석 줄에는 직함이 없고 이름 바로 뒤에 상태 칩이 선다 (66-6)', () => {
  const v = setup(base);
  expect(v.queryByText('관리자')).toBeNull();
  const name = v.getByText('김민수');
  expect(name.nextElementSibling?.textContent).toBe('응답 대기');
});

it('「속기록 *」 필수 표시 · 「일정 보기」는 그 날의 시간표로 간다 (66-4 · 66-5)', () => {
  const v = setup(base);
  expect(v.getByText('*')).toBeTruthy();
  expect(v.getByRole('link', { name: '일정 보기' }).getAttribute('href')).toBe('/schedule?date=2026-08-20');
});

it('③ 할 일 줄은 체크박스다 — 누르면 할 일 완료 경로(서랍과 같은 쓰기)로 보낸다 (1차 물결 남김)', async () => {
  const v = setup(base);
  fireEvent.click(v.getByRole('button', { name: /③ 할 일/ }));
  const open = v.getByRole('checkbox', { name: '단가 시뮬레이션 완료' }) as HTMLInputElement;
  expect(open.checked).toBe(false);
  expect((v.getByRole('checkbox', { name: '끝낸 것 완료' }) as HTMLInputElement).checked).toBe(true);
  expect(v.queryByText('☐')).toBeNull();
  fireEvent.click(open);
  await waitFor(() => expect(todo).toHaveBeenCalledWith({ kind: 'todo', id: 9, done: true }, expect.anything()));
});

/* ── W11 · N-32 — 「안내 보내기」와 본인 참석 응답 ─────────────────────────────── */

it('「안내 보내기」는 원문 §66 바닥 왼쪽(「일정 보기」 옆)에 서고, 누르면 이 회의로 보낸 뒤 서버가 센 수를 알린다', async () => {
  notice.mockImplementation((_vars: unknown, opts?: { onSuccess?: (r: { sent: number }) => void }) => opts?.onSuccess?.({ sent: 3 }));
  const v = setup(base);
  const dialog = v.getByRole('dialog', { name: '일반 회의' });
  const send = within(dialog).getByRole('button', { name: '안내 보내기' }) as HTMLButtonElement;
  expect(send.disabled).toBe(false);
  // 「일정 보기」와 한 묶음(왼쪽)이다 — 「닫기」·「속기록 저장」은 오른쪽
  expect(send.parentElement).toBe(within(dialog).getByRole('link', { name: '일정 보기' }).parentElement);
  fireEvent.click(send);
  await waitFor(() => expect(notice).toHaveBeenCalledWith({ id: 4 }, expect.anything()));
  expect(v.getByRole('status').textContent).toBe('참석자 3명에게 안내를 보냈습니다.');
});

it('막힌 안내는 단추가 닫히고 서버가 준 이유를 그대로 말한다 (취소된 회의 · 받을 사람 없음)', () => {
  const v = setup({ ...base, canSendNotice: false, noticeBlockedReason: '취소된 회의에는 안내를 보내지 않습니다' });
  const send = v.getByRole('button', { name: '안내 보내기' }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  expect(send.title).toBe('취소된 회의에는 안내를 보내지 않습니다');
});

it('참석자로만 여는 사람(강사 참석자 포함)은 읽기만 한다 — 안내 · 속기록 저장 · 머리말 · 배정이 서지 않는다', () => {
  const v = setup({
    ...base, canEdit: false, canSendNotice: false, noticeBlockedReason: null,
    canRespond: true, myAttend: { state: 'waiting', stateLabel: '응답 대기' },
  });
  expect(v.queryByRole('button', { name: '안내 보내기' })).toBeNull();
  expect(v.queryByRole('button', { name: '속기록 저장' })).toBeNull();
  expect(v.queryByRole('button', { name: '[정한 것]' })).toBeNull();
  expect((v.getByLabelText('속기록') as HTMLTextAreaElement).readOnly).toBe(true);
  fireEvent.click(v.getByRole('button', { name: /③ 할 일/ }));
  expect(v.queryByRole('button', { name: '배정' })).toBeNull();
});

it('참석 응답은 본인 줄만 — 「참석 · 불참」을 누르면 그 값 하나를 보낸다(대리 입력 없음)', async () => {
  const v = setup({ ...base, canEdit: false, canSendNotice: false, canRespond: true, myAttend: { state: 'waiting', stateLabel: '응답 대기' } });
  const group = within(v.getByRole('group', { name: '내 참석 응답' }));
  expect(group.getByRole('button', { name: '참석' }).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(group.getByRole('button', { name: '불참' }));
  await waitFor(() => expect(respond).toHaveBeenCalledWith({ id: 4, confirmed: false }));
  cleanup();

  // 이미 답한 값은 눌린 채로 선다 — 바꾸려면 다른 쪽을 누른다
  const again = setup({ ...base, canRespond: true, myAttend: { state: 'in', stateLabel: '참석' } });
  expect(within(again.getByRole('group', { name: '내 참석 응답' })).getByRole('button', { name: '참석' }).getAttribute('aria-pressed')).toBe('true');
});

it('참석자가 아니면 응답 단추가 없다 — 남의 줄을 대신 적지 않는다', () => {
  const v = setup(base);
  expect(v.queryByRole('group', { name: '내 참석 응답' })).toBeNull();
});

/* ── W11 A' 후속 — 강사 참석자의 회의 상세 ─────────────────────────────── */

it('할 일 체크 칸은 서버의 canToggle 이 연다 — 강사 참석자는 자기에게 온 것만 체크한다', () => {
  const v = setup({
    ...base, canEdit: false, canSendNotice: false, canRespond: true, myAttend: { state: 'waiting', stateLabel: '응답 대기' },
    tasks: [{ ...base.tasks[0], canToggle: true }, { ...base.tasks[1], canToggle: false }],
  });
  fireEvent.click(v.getByRole('button', { name: /③ 할 일/ }));
  expect((v.getByRole('checkbox', { name: '단가 시뮬레이션 완료' }) as HTMLInputElement).disabled).toBe(false);
  // 남의 할 일은 닫힌 칸이다(서버도 그 체크 쓰기를 404 로 막는다)
  expect((v.getByRole('checkbox', { name: '끝낸 것 완료' }) as HTMLInputElement).disabled).toBe(true);
});
