/** @file-guide
 * 목적: §43 자동 채움 · 나머지 학생에게 복사 · 줌 안내 (C98 · F-60 · F-61 · F-63).
 * 책임/재사용: 실제 GuideWriter/GuidesTodo 와 생성 타입을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/api/client';
import * as queries from '@/api/queries';
import type { Guide, Guides, Me, PerLessonNotice } from '@/api/types';
import { useSession } from '@/store/useSession';
import { GuideWriter } from './GuideWriter';
import { GuidesTodo } from './GuidesTodo';

const me: Me = {
  id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const AUTO_BODY = '[첫 수업 안내]\n학생 고은설\n학년 G9\n강사 Sophia\n과목 Vocabulary\n형태 온라인\n시작일 2026-09-20\n교재 — 교재가 아직 배정되지 않았습니다\n\n';

const guide: Guide = {
  canSend: false, canAck: false, sendBlockedReason: null, acknowledgedAfterSeconds: null,
  id: 5, serId: 8, studentId: 4, teacherId: 2, reason: 'new', state: 'draft', pending: true, studentName: '고은설',
  teacherName: 'Sophia', serTitle: 'Vocabulary', body: null, dueOn: '2026-09-20', eventOn: '2026-09-20',
  sourceOccurrenceId: 55, createdAt: '2026-09-10', sentAt: null, acknowledgedAt: null, overdueDays: 0,
  siblingCount: 2,
  autoFill: {
    body: AUTO_BODY,
    facts: [
      { key: 'student', label: '학생', value: '고은설', filled: true },
      { key: 'grade', label: '학년', value: 'G9', filled: true },
      { key: 'teacher', label: '강사', value: 'Sophia', filled: true },
      { key: 'subject', label: '과목', value: 'Vocabulary', filled: true },
      { key: 'mode', label: '형태', value: '온라인', filled: true },
      { key: 'startOn', label: '시작일', value: '2026-09-20', filled: true },
      { key: 'books', label: '교재', value: null, filled: false },
    ],
  },
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let calls: Array<{ method?: string; url?: string; body?: unknown }> = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  vi.restoreAllMocks();
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); calls = [];
});

function client() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(c);
  return c;
}

function adapter(handler: (c: { method?: string; url?: string; body?: unknown }) => unknown) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    const call = { method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : undefined };
    calls.push(call);
    const data = handler(call);
    if (data instanceof Error) return Promise.reject(data);
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
}

/* ── F-60 자동 채움 ────────────────────────────────────────────────────────── */

it('작성 창이 서버 자동 채움으로 열리고 일곱 칸을 칩으로 보여 준다 (F-60)', () => {
  useSession.getState().signIn('fixture', me);
  adapter(() => []);
  const view = render(
    <QueryClientProvider client={client()}><GuideWriter guide={guide} onClose={() => {}} /></QueryClientProvider>,
  );
  expect((view.getByLabelText('안내 본문') as HTMLTextAreaElement).value).toBe(AUTO_BODY);
  const chips = view.getByLabelText('자동으로 채운 것').querySelectorAll('li');
  expect(chips.length).toBe(7);
  // 못 채운 칸도 칩으로 선다 — 빠뜨린 것처럼 보이지 않게
  expect(view.getByText(/교재 · 아직/)).toBeTruthy();
});

it('사람이 지우면 지워진다 — 서버 값을 다시 밀어 넣지 않는다 (F-60)', async () => {
  useSession.getState().signIn('fixture', me);
  adapter((c) => (c.method === 'put' ? { ...guide, state: 'ready', body: (c.body as { body: string }).body } : []));
  const view = render(
    <QueryClientProvider client={client()}><GuideWriter guide={guide} onClose={() => {}} /></QueryClientProvider>,
  );
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '직접 쓴 말' } });
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'put')).toBeTruthy());
  expect(calls.find((c) => c.method === 'put')?.body).toEqual({ body: '직접 쓴 말' });
});

/* ── F-61 나머지 학생에게 복사 ────────────────────────────────────────────── */

it('형제가 없으면 복사 단추가 서지 않는다 (F-61 · 서버 siblingCount)', () => {
  useSession.getState().signIn('fixture', me);
  adapter(() => []);
  const view = render(
    <QueryClientProvider client={client()}>
      <GuideWriter guide={{ ...guide, siblingCount: 0 }} onClose={() => {}} />
    </QueryClientProvider>,
  );
  expect(view.queryByRole('button', { name: /나머지 학생에게 복사/ })).toBeNull();
});

it('작성하고 복사하면 쓰기 → 복사 순서로 한 번씩 부르고 결과를 문장으로 보여 준다 (F-61)', async () => {
  useSession.getState().signIn('fixture', me);
  adapter((c) => {
    if (c.method === 'put') return { ...guide, state: 'ready', body: (c.body as { body: string }).body };
    if (c.method === 'post') {
      return {
        copied: [{ ...guide, id: 6, studentName: '이하린', state: 'ready' }],
        skipped: [{ id: 7, studentName: '강라율', reason: '이미 쓴 안내라 덮지 않았습니다' }],
        headReplaced: true,
      };
    }
    return [];
  });
  const view = render(
    <QueryClientProvider client={client()}><GuideWriter guide={guide} onClose={() => {}} /></QueryClientProvider>,
  );
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: `${AUTO_BODY}공통 문단` } });
  fireEvent.click(view.getByRole('button', { name: /나머지 학생에게 복사/ }));
  await waitFor(() => expect(view.getByText(/1명에게 옮겼습니다/)).toBeTruthy());
  const writes = calls.filter((c) => c.method === 'put' || c.method === 'post');
  expect(writes.map((c) => c.url)).toEqual(['/guides/5/body', '/guides/5/copy']);
  expect(view.getByText(/이하린/)).toBeTruthy();
  expect(view.getByText(/머리말은 각 학생 것으로 다시 만들었습니다/)).toBeTruthy();
  expect(view.getByText(/강라율\(이미 쓴 안내라 덮지 않았습니다\)/)).toBeTruthy();
});

/* ── F-63 줌 안내 ─────────────────────────────────────────────────────────── */

function lesson(over: Partial<PerLessonNotice> = {}): PerLessonNotice {
  return {
    id: 90, sourceOccurrenceId: 90, serId: 8, onDate: '2026-09-19', startMin: 600, endMin: 660,
    teacherId: 2, teacherName: 'Sophia', kindName: '수업', zaccId: 3, zaccLabel: 'Study',
    zoomAssigned: true, notices: [{ id: null, studentId: 4, studentName: '고은설', channel: null, body: null, sentAt: null }],
    parentDeliveryRecorded: false, teacherDeliveryRecorded: false, canSendTeacher: true, sendBlockedReason: null,
    channel: 'app', studentName: '고은설', serTitle: 'Vocabulary', body: '', sentAt: null, ...over,
  };
}

function guides(over: Partial<Guides> = {}): Guides {
  return {
    guides: [], perLesson: [lesson()], todoCount: 1, scopedTeacherId: null,
    stats: { monitoring: 0, overdue: 0, drafting: 0, sendPending: 0, teacherUnconfirmed: 0, repeatedTeacherChange: 0 },
    deliveryCapabilities: { parentExternal: false, teacherExternal: false, reason: '외부 발송 미연결' },
    ...over,
  };
}

it('한 번 안내의 편집 대상을 바꾸면 이전 초안을 새 GUIDE id로 보내지 않는다', async () => {
  useSession.getState().signIn('fixture', me);
  const first = { ...guide, body: '첫 안내', siblingCount: 0 };
  const second = { ...first, id: 6, studentName: '이하린', body: '둘째 안내' };
  adapter((c) => c.method === 'put' ? { ...second, state: 'ready' } : []);
  const view = render(<QueryClientProvider client={client()}>
    <GuidesTodo data={guides({ guides: [first, second], perLesson: [] })} />
  </QueryClientProvider>);
  fireEvent.click(view.getAllByRole('button', { name: '안내 작성' })[0]);
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '첫 안내의 미저장 초안' } });
  fireEvent.click(view.getAllByRole('button', { name: '안내 작성' })[1]);
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(calls.filter((c) => c.method === 'put')).toHaveLength(1));
  expect(calls.find((c) => c.method === 'put')).toMatchObject({ url: '/guides/6/body', body: { body: '둘째 안내' } });
});

it('한 번 안내의 같은 id refetch는 초안을 보존하며 최신 표시 정보를 사용한다', async () => {
  useSession.getState().signIn('fixture', me);
  adapter(() => []);
  const qc = client();
  const first = { ...guide, body: '기존 본문', siblingCount: 0 };
  const draw = (item: Guide) => <QueryClientProvider client={qc}>
    <GuidesTodo data={guides({ guides: [item], perLesson: [] })} />
  </QueryClientProvider>;
  const view = render(draw(first));
  fireEvent.click(view.getByRole('button', { name: '안내 작성' }));
  const input = view.getByLabelText('안내 본문');
  fireEvent.change(input, { target: { value: '유지할 초안' } });
  view.rerender(draw({ ...first, studentName: '새 표시 이름', body: '다시 조회한 본문' }));
  expect(view.getByText('안내 작성 — 새 표시 이름')).toBeTruthy();
  expect(view.getByLabelText('안내 본문')).toBe(input);
  expect((input as HTMLTextAreaElement).value).toBe('유지할 초안');
});

it('강사 안내를 누르면 회차 키 (serId, onDate) 를 보낸다 (F-63)', async () => {
  useSession.getState().signIn('fixture', me);
  adapter((c) => (c.method === 'post' ? { lesson: lesson({ teacherDeliveryRecorded: true, canSendTeacher: false }), teacherNotices: 1, parentNotices: 1 } : []));
  const view = render(
    <QueryClientProvider client={client()}><GuidesTodo data={guides()} /></QueryClientProvider>,
  );
  fireEvent.click(view.getByRole('button', { name: '강사 안내' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'post')).toBeTruthy());
  const post = calls.find((c) => c.method === 'post');
  expect(post?.url).toBe('/guides/zoom-notice');
  // sourceOccurrenceId 는 재투영 때 바뀐다 — 보내지 않는다
  expect(post?.body).toEqual({ serId: 8, onDate: '2026-09-19' });
});

it('못 보내는 회차는 단추가 잠기고 이유는 서버 문장이다 (F-63 · D-R39)', () => {
  useSession.getState().signIn('fixture', me);
  adapter(() => []);
  const view = render(
    <QueryClientProvider client={client()}>
      <GuidesTodo data={guides({ perLesson: [lesson({ canSendTeacher: false, sendBlockedReason: '줌 계정이 아직 배정되지 않았습니다', zaccId: null, zaccLabel: null, zoomAssigned: false })] })} />
    </QueryClientProvider>,
  );
  const button = view.getByRole('button', { name: '강사 안내' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.title).toBe('줌 계정이 아직 배정되지 않았습니다');
});

it('학부모 안내는 그대로 잠긴다 — 수신처가 없다 (N-42)', () => {
  useSession.getState().signIn('fixture', me);
  adapter(() => []);
  const view = render(
    <QueryClientProvider client={client()}><GuidesTodo data={guides()} /></QueryClientProvider>,
  );
  expect((view.getByRole('button', { name: '학부모 안내' }) as HTMLButtonElement).disabled).toBe(true);
});

it('보낸 회차는 「강사 보냄」이 되고 다시 누를 수 없다 (F-63)', () => {
  useSession.getState().signIn('fixture', me);
  adapter(() => []);
  const view = render(
    <QueryClientProvider client={client()}>
      <GuidesTodo data={guides({ perLesson: [lesson({ teacherDeliveryRecorded: true, canSendTeacher: false, sendBlockedReason: '이미 보냈습니다' })] })} />
    </QueryClientProvider>,
  );
  expect((view.getByRole('button', { name: '강사 보냄' }) as HTMLButtonElement).disabled).toBe(true);
});

/* ── S3-b §43 회차별 계정 배정 ──────────────────────────────────────────── */
const candidates = [{ id: 3, label: 'Study', meetingId: null }, { id: 4, label: 'TN', meetingId: null }];
const unassigned = () => lesson({ zaccId: null, zaccLabel: null, zoomAssigned: false, canSendTeacher: false });

function assignmentSetup(data = guides({ perLesson: [unassigned()] }), onRender?: ProfilerOnRenderCallback) {
  useSession.getState().signIn('fixture', me);
  adapter((call) => call.url === '/meta' ? { zaccs: candidates } : {});
  const qc = client();
  const tree = (next: Guides) => (
    <QueryClientProvider client={qc}>
      <Profiler id="guides-todo" onRender={onRender ?? (() => {})}><GuidesTodo data={next} /></Profiler>
    </QueryClientProvider>
  );
  const view = render(tree(data));
  return { ...view, qc, refresh: (next: Guides) => view.rerender(tree(next)) };
}

it('계정 배정은 선택 하나만 받고 빈값 요청0, 원래 회차 키와 고른 ID만 보낸다 (S3-ASSIGN-01)', async () => {
  const view = assignmentSetup();
  const post = vi.spyOn(api, 'post');
  expect(calls).toHaveLength(0); // 모달을 열기 전 meta를 읽지 않는다.
  fireEvent.click(view.getByRole('button', { name: '계정 배정 →' }));
  await view.findByRole('option', { name: 'TN' });
  const box = view.getByRole('dialog', { name: '줌 계정 배정' });
  expect(within(box).getByText('고은설 · 10:00 ~ 11:00')).toBeTruthy();
  expect(box.querySelectorAll('input,select,textarea')).toHaveLength(1);
  expect(view.getByLabelText('줌 계정').tagName).toBe('SELECT');
  const submit = within(box).getByRole('button', { name: '배정' });
  expect(submit).toHaveProperty('disabled', true);
  fireEvent.click(submit);
  expect(post).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '4' } });
  fireEvent.click(submit);
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/zoom/assign', { serId: 8, onDate: '2026-09-19', zaccId: 4 });
});

it('배정창은 학생이 없으면 수업명과 현재 시각을 보여 주며 원래 날짜를 오늘로 표시하지 않는다', async () => {
  const view = assignmentSetup(guides({ perLesson: [lesson({ ...unassigned(), notices: [], onDate: '2020-02-29', startMin: 780, endMin: 840 })] }));
  fireEvent.click(view.getByRole('button', { name: '계정 배정 →' }));
  await view.findByRole('option', { name: 'Study' });
  const box = view.getByRole('dialog');
  expect(within(box).getByText('Vocabulary · 13:00 ~ 14:00')).toBeTruthy();
  expect(box.textContent).not.toContain('2020-02-29');
});

it('배정된 계정 변경도 같은 창을 쓰고 취소·재진입은 미저장 선택을 버린다', async () => {
  const view = assignmentSetup(guides());
  const opener = view.getByRole('button', { name: '계정 변경' });
  opener.focus(); fireEvent.click(opener);
  await view.findByRole('option', { name: 'TN' });
  const select = view.getByLabelText('줌 계정');
  expect(select).toHaveProperty('value', '3');
  expect(document.activeElement).toBe(select);
  fireEvent.change(select, { target: { value: '4' } });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(view.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(opener);
  fireEvent.click(opener);
  expect(view.getByLabelText('줌 계정')).toHaveProperty('value', '3');
});

it('409 문장·선택은 재투영된 행 ID에도 남고 다른 계정으로 재시도한다 (S3-ASSIGN-02)', async () => {
  const view = assignmentSetup();
  const post = vi.spyOn(api, 'post').mockRejectedValueOnce(new ApiError('RESOURCE_CONFLICT', '같은 시간에 다른 수업이 있습니다', 409))
    .mockResolvedValueOnce({ data: { serId: 8, onDate: '2026-09-19', zaccId: 4, projected: 1 } });
  fireEvent.click(view.getByRole('button', { name: '계정 배정 →' }));
  await view.findByRole('option', { name: 'Study' });
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '3' } });
  fireEvent.click(view.getByRole('button', { name: '배정' }));
  await view.findByText('같은 시간에 다른 수업이 있습니다');
  view.refresh(guides({ perLesson: [{ ...unassigned(), id: 999, sourceOccurrenceId: 999 }] }));
  expect(view.getByLabelText('줌 계정')).toHaveProperty('value', '3');
  expect(view.getByText('같은 시간에 다른 수업이 있습니다')).toBeTruthy();
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '4' } });
  fireEvent.click(view.getByRole('button', { name: '배정' }));
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  expect(post).toHaveBeenCalledTimes(2);
  expect(post).toHaveBeenLastCalledWith('/zoom/assign', { serId: 8, onDate: '2026-09-19', zaccId: 4 });
});

it.each(['loading', 'error', 'empty'] as const)('계정 후보 %s 상태에서 배정 요청을 보내지 않는다', async (state) => {
  const view = assignmentSetup();
  const get = vi.spyOn(api, 'get');
  if (state === 'loading') get.mockReturnValue(new Promise(() => {}));
  else if (state === 'error') get.mockRejectedValue(new ApiError('UNAVAILABLE', '계정 후보를 읽지 못했습니다', 503));
  else get.mockResolvedValue({ data: { zaccs: [] } });
  const post = vi.spyOn(api, 'post');
  fireEvent.click(view.getByRole('button', { name: '계정 배정 →' }));
  if (state === 'error') await view.findByText('계정 후보를 읽지 못했습니다');
  if (state === 'empty') await view.findByText('배정할 수 있는 활성 계정이 없습니다.');
  const submit = view.getByRole('button', { name: '배정' });
  expect(submit).toHaveProperty('disabled', true);
  fireEvent.click(submit);
  expect(post).not.toHaveBeenCalled();
});

it('선택했던 계정이 비활성화되어 후보에서 빠지면 재선택 전 요청0이다', async () => {
  const view = assignmentSetup();
  const post = vi.spyOn(api, 'post');
  fireEvent.click(view.getByRole('button', { name: '계정 배정 →' }));
  await view.findByRole('option', { name: 'Study' });
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '3' } });
  act(() => view.qc.setQueryData(queries.sessionQueryKey(queries.qk.meta, me.id), { zaccs: [candidates[1]] }));
  await view.findByText('선택한 계정이 현재 후보에 없습니다. 다른 계정을 고르세요.');
  const submit = view.getByRole('button', { name: '배정' });
  expect(submit).toHaveProperty('disabled', true);
  fireEvent.click(submit);
  expect(post).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '4' } });
  expect(submit).toHaveProperty('disabled', false);
});

it('후보 재조회 실패도 오래된 선택으로 저장하지 않고 재시도 후 선택을 보존한다', async () => {
  const view = assignmentSetup();
  fireEvent.click(view.getByRole('button', { name: '계정 배정 →' }));
  await view.findByRole('option', { name: 'Study' });
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '3' } });
  vi.spyOn(api, 'get').mockRejectedValueOnce(new ApiError('UNAVAILABLE', '후보 새로 읽기 실패', 503))
    .mockResolvedValue({ data: { zaccs: candidates } });
  await act(async () => { await view.qc.refetchQueries({ queryKey: queries.qk.meta }); });
  await view.findByText('후보 새로 읽기 실패');
  expect(view.getByRole('button', { name: '배정' })).toHaveProperty('disabled', true);
  fireEvent.click(view.getByRole('button', { name: '다시 시도' }));
  await waitFor(() => expect(view.queryByText('후보 새로 읽기 실패')).toBeNull());
  expect(view.getByLabelText('줌 계정')).toHaveProperty('value', '3');
  expect(view.getByRole('button', { name: '배정' })).toHaveProperty('disabled', false);
});

it('연속 저장과 pending 취소·Escape·배경 닫기를 막고 실패 뒤 다시 배정한다', async () => {
  const view = assignmentSetup();
  let rejectFirst!: () => void;
  const failure = new Promise<never>((_, reject) => { rejectFirst = () => reject(new ApiError('FAILED', '배정 실패 — 다시 시도', 500)); });
  const post = vi.spyOn(api, 'post').mockReturnValueOnce(failure).mockResolvedValueOnce({ data: {} });
  fireEvent.click(view.getByRole('button', { name: '계정 배정 →' }));
  await view.findByRole('option', { name: 'Study' });
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '3' } });
  const box = view.getByRole('dialog');
  const submit = view.getByRole('button', { name: '배정' });
  const cancel = view.getByRole('button', { name: '취소' });
  act(() => {
    fireEvent.click(submit); fireEvent.click(submit);
    fireEvent.click(cancel); fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(box.parentElement!.firstElementChild!);
  });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(view.getByRole('dialog')).toBe(box);
  expect(view.getByLabelText('줌 계정')).toHaveProperty('disabled', true);
  await act(async () => rejectFirst());
  await view.findByText('배정 실패 — 다시 시도');
  expect(view.getByLabelText('줌 계정')).toHaveProperty('value', '3');
  expect(view.getByRole('button', { name: '배정' })).toHaveProperty('disabled', false);
  fireEvent.click(view.getByRole('button', { name: '배정' }));
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  expect(post).toHaveBeenCalledTimes(2);
});

it('실제 선택1회는 dialog commit1·기존 회차 형제 render0·추가 GET0이다 (S3-REFRESH-01)', async () => {
  // spy 기본 동작은 실제 훅 실행: 모든 기존 PerLessonRow는 렌더마다 이 훅을 호출한다.
  const rowRenders = vi.spyOn(queries, 'useSendZoomNotice');
  const commits: string[] = [];
  const view = assignmentSetup(guides({ perLesson: [unassigned(), lesson({ serId: 9, id: 91, sourceOccurrenceId: 91 })] }),
    (_id, phase) => { commits.push(phase); });
  fireEvent.click(view.getByRole('button', { name: '계정 배정 →' }));
  await view.findByRole('option', { name: 'Study' });
  await act(async () => {});
  const before = { commits: commits.length, rows: rowRenders.mock.calls.length, gets: calls.filter((c) => c.method === 'get').length };
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '4' } });
  await act(async () => {});
  const measured = {
    commits: commits.length - before.commits,
    siblingRenders: rowRenders.mock.calls.length - before.rows,
    additionalGets: calls.filter((c) => c.method === 'get').length - before.gets,
  };
  expect(measured).toEqual({ commits: 1, siblingRenders: 0, additionalGets: 0 });
  console.info('S3-b account selection measured', measured);
});
