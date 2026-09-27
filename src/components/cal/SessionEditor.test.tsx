/** @file-guide
 * 목적: 새 일정 창 — 겹침으로 막히면 「누구와 · 어느 수업」까지 말한다 (QA-a · B-17 · B-18 · D-R43).
 * 책임/재사용: 실제 SessionEditor/useScheduleWrite/conflictLines 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Meta, Occurrence } from '@/api/types';
import { SessionEditor } from './SessionEditor';

const meta = {
  kinds: [{ key: 'class', name: '수업', cap: 4, rep: true, grp: 'lesson', grpLabel: '수업', color: '#111', extra: false }],
  subs: [{ key: 'vocab', name: 'Vocabulary', color: '#222' }],
  staff: [{ id: 7, name: '김재훈', role: 'teacher', canAdminPage: false, canGpaPack: false, title: null }],
  rooms: [{ id: 1, name: '1호' }],
  students: [{ id: 1, name: '김민준', grade: '고1' }],
  zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [],
} as unknown as Meta;

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const got: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; got.length = 0; });

function setup(conflicts: unknown[]) {
  api.defaults.adapter = (async (config: { url?: string; method?: string }) => {
    if (config.method === 'post') {
      return Promise.reject(Object.assign(new Error('conflict'), {
        response: { status: 409, data: { code: 'RESOURCE_CONFLICT', message: '같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다' } },
      }));
    }
    got.push(config.url ?? '');
    return { config, status: 200, statusText: 'OK', headers: {}, data: { conflicts } };
  }) as never;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(qc);
  const view = render(
    <QueryClientProvider client={qc}>
      <SessionEditor
        draft={{ date: '2026-09-28', startMin: 570, endMin: 660, roomId: 1 }}
        meta={meta}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return view;
}

it('겹쳐서 막히면 원래 문구 뒤에 누구와·어느 수업인지 붙는다 (B-17·B-18)', async () => {
  const view = setup([
    { serId: 9, onDate: '2026-09-28', startMin: 570, endMin: 660, title: 'MAP Reading', with: 'room', whoName: '1호' },
  ]);
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(view.getByText(/같은 시간에/)).toBeTruthy());
  await waitFor(() => expect(view.getByText(/\[강의실\] 1호 · 2026-09-28 09:30–11:00 · MAP Reading/)).toBeTruthy());
  // 설명은 **막힌 뒤 한 번**만 묻는다 — 미리 물어 비었다고 저장을 건너뛰면 그 사이에 남이 그 자리를 잡는다
  expect(got.filter((u) => u === '/schedule/conflicts').length).toBe(1);
});

it('설명을 못 가져와도 원래 문구는 남는다 — 실패가 실패를 덮지 않는다', async () => {
  const view = setup([]);
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(view.getByText(/같은 시간에/)).toBeTruthy());
  expect(view.queryByText(/\[강의실\]/)).toBeNull();
});

/* ── 개인표에서 연 새 일정 (원문 §10·§11 본문 「일정 추가 시 학생/강사가 자동으로 채워집니다」) ── */

it('초안에 학생·강사가 들어 있으면 그대로 골라진 채 열리고 만들기 계약에 실린다 (§10·§11)', async () => {
  const sent: Array<{ method?: string; url?: string; data?: unknown }> = [];
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    sent.push({ method: config.method, url: config.url, data: config.data ? JSON.parse(config.data) : undefined });
    return { config, status: 201, statusText: 'Created', headers: {}, data: { effScope: 'this', log: [], projected: 1, serIds: [9], unavailable: [] } };
  }) as never;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(qc);
  const view = render(
    <QueryClientProvider client={qc}>
      <SessionEditor draft={{ date: '2026-09-28', startMin: 570, endMin: 660, roomId: null, studentIds: [1], teacherId: 7 }}
        meta={meta} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  expect((view.getByLabelText('강사') as HTMLSelectElement).value).toBe('7');
  expect(view.getByText(/수강 학생 · 1명/)).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(sent.some((r) => r.method === 'post')).toBe(true));
  expect(sent.find((r) => r.method === 'post')!.data).toMatchObject({ teacherId: 7, studentIds: [1], fromDate: '2026-09-28' });
});

it('매일 반복은 종료일을, 격주는 고른 요일과 /2 간격을 생성 계약에 싣는다', async () => {
  const sent: Array<Record<string, unknown>> = [];
  api.defaults.adapter = (async (config: { data?: string }) => {
    sent.push(config.data ? JSON.parse(config.data) : {});
    return { config, status: 201, statusText: 'Created', headers: {}, data: { effScope: 'this', log: [], projected: 1, serIds: [9], unavailable: [] } };
  }) as never;
  const renderEditor = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(qc);
    return render(
      <QueryClientProvider client={qc}>
        <SessionEditor draft={{ date: '2026-09-28', startMin: 570, endMin: 660, roomId: 1 }} meta={meta} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
  };

  const daily = renderEditor();
  fireEvent.click(daily.getByRole('button', { name: '매일' }));
  fireEvent.change(daily.getByLabelText('반복 종료일'), { target: { value: '2026-10-31' } });
  fireEvent.click(daily.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({ fromDate: '2026-09-28', toDate: '2026-10-31', rrule: 'DAILY' });
  daily.unmount();

  const biweekly = renderEditor();
  fireEvent.click(biweekly.getByRole('button', { name: '격주' }));
  fireEvent.click(biweekly.getByRole('button', { name: '월' }));
  fireEvent.click(biweekly.getByRole('button', { name: '수' }));
  fireEvent.click(biweekly.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]).toMatchObject({ fromDate: '2026-09-28', toDate: null, rrule: 'WEEKLY:MO,WE/2' });
});

it('매주·격주는 요일 없이 보내지 않고 반복 종료일이 시작일보다 앞서도 보내지 않는다', async () => {
  const sent: unknown[] = [];
  api.defaults.adapter = (async (config: { data?: string }) => {
    sent.push(config.data);
    return { config, status: 201, statusText: 'Created', headers: {}, data: {} };
  }) as never;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(qc);
  const view = render(
    <QueryClientProvider client={qc}>
      <SessionEditor draft={{ date: '2026-09-28', startMin: 570, endMin: 660, roomId: 1 }} meta={meta} onClose={vi.fn()} />
    </QueryClientProvider>,
  );

  fireEvent.click(view.getByRole('button', { name: '매주' }));
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  expect(await view.findByText('매주·격주 일정은 요일을 하나 이상 골라 주세요')).toBeTruthy();
  expect(sent).toHaveLength(0);

  fireEvent.click(view.getByRole('button', { name: '매일' }));
  const toDate = view.getByLabelText('반복 종료일') as HTMLInputElement;
  fireEvent.change(toDate, { target: { value: '2026-09-27' } });
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  expect(toDate.validity.rangeUnderflow).toBe(true);
  expect(sent).toHaveLength(0);
});

/* ── 일정 수정 — 수업 상세의 「일정 수정」 (원문 §12 · OccurrencePatchDto) ── */

const lesson: Occurrence = {
  serId: 3, date: '2026-09-28', onDate: '2026-09-28', startMin: 600, endMin: 660,
  kindKey: 'class', extra: false, subKey: 'vocab', title: null,
  teacherId: 7, teacherName: '김재훈', roomId: 1, roomName: '1호', zaccId: null, mode: 'offline',
  canceled: false, hasException: false, recurring: false, repState: 'plan', ended: false, written: false,
  attendanceMode: 'manage', attendance: null, students: [],
};
const editMeta = {
  ...meta,
  staff: [...meta.staff, { id: 8, name: '이다현', role: 'teacher', canAdminPage: false, canGpaPack: false, title: null }],
  rooms: [...meta.rooms, { id: 2, name: '2호' }],
  zaccs: [{ id: 5, label: 'TN Zoom 1' }],
} as unknown as Meta;

function setupEdit(occ: Occurrence, reply: 'ok' | 'conflict' = 'ok', freeLine: string | null = null) {
  const sent: Array<{ method?: string; url?: string; data?: Record<string, unknown>; params?: Record<string, unknown> }> = [];
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string; params?: Record<string, unknown> }) => {
    sent.push({ method: config.method, url: config.url, data: config.data ? JSON.parse(config.data) : undefined, params: config.params });
    if (config.method === 'patch') {
      if (reply === 'conflict') {
        return Promise.reject(Object.assign(new Error('conflict'), {
          response: { status: 409, data: { code: 'RESOURCE_CONFLICT', message: '같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다' } },
        }));
      }
      return { config, status: 200, statusText: 'OK', headers: {}, data: { effScope: 'this', log: [], projected: 1, serIds: [3], unavailable: [], undoToken: 'u1' } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: { conflicts: [
      { serId: 9, onDate: '2026-09-28', startMin: 630, endMin: 690, title: 'MAP Reading', with: 'teacher', whoName: '김재훈' },
    ], freeLine } };
  }) as never;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(qc);
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <QueryClientProvider client={qc}>
      <SessionEditor edit={{ occ, name: 'Vocabulary' }} meta={editMeta} onClose={onClose} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { view, sent, onSaved, onClose, patches: () => sent.filter((r) => r.method === 'patch') };
}

it('편집은 지금 값으로 채워 열리고, 바꾼 칸만 PATCH 로 보낸다 — 단발은 범위를 묻지 않는다', async () => {
  const { view, patches, onSaved, onClose } = setupEdit(lesson);
  expect(view.getByRole('dialog', { name: '일정 수정 — Vocabulary · 2026-09-28' })).toBeTruthy();
  expect((view.getByLabelText('날짜') as HTMLInputElement).value).toBe('2026-09-28');
  expect((view.getByLabelText('시작') as HTMLInputElement).value).toBe('10:00');
  expect((view.getByLabelText('끝') as HTMLInputElement).value).toBe('11:00');
  expect((view.getByLabelText('강사') as HTMLSelectElement).value).toBe('7');
  expect((view.getByLabelText('강의실') as HTMLSelectElement).value).toBe('1');
  // 계약(OccurrencePatchDto)에 없는 칸은 편집 창에 없다 — 종류·과목·반복·명단은 여기서 바꾸지 않는다
  expect(view.queryByLabelText('종류')).toBeNull();
  expect(view.queryByLabelText('과목')).toBeNull();
  expect(view.queryByText(/반복 — 요일을 고르면/)).toBeNull();

  fireEvent.change(view.getByLabelText('시작'), { target: { value: '10:30' } });
  fireEvent.change(view.getByLabelText('끝'), { target: { value: '11:30' } });
  fireEvent.change(view.getByLabelText('강사'), { target: { value: '8' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0].url).toBe('/schedule/3');
  expect(patches()[0].data).toEqual({ startMin: 630, endMin: 690, teacherId: 8, scope: 'this', onDate: '2026-09-28' });
  expect(view.queryByRole('dialog', { name: /반복 수업입니다/ })).toBeNull();
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(onSaved.mock.calls[0][0]).toMatchObject({ undoToken: 'u1' });
  expect(onClose).toHaveBeenCalled();
});

it('반복 수업은 저장 직전에 범위를 한 번 묻고 고른 범위를 싣는다 — 다른 날·미정 강사도 계약 그대로', async () => {
  const { view, patches } = setupEdit({ ...lesson, recurring: true });
  fireEvent.change(view.getByLabelText('날짜'), { target: { value: '2026-09-30' } });
  fireEvent.change(view.getByLabelText('강사'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));

  // 고르기 전에는 아무것도 보내지 않는다
  const future = await view.findByRole('button', { name: /향후/ });
  expect(patches()).toHaveLength(0);
  fireEvent.click(future);
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0].data).toEqual({ date: '2026-09-30', teacherId: null, scope: 'future', onDate: '2026-09-28' });
});

it('바뀐 것이 없거나 시각이 틀리면 보내지 않는다 — 겹침이 아니면 「강행할 수 없습니다」 안내를 붙이지 않는다', async () => {
  const { view, patches } = setupEdit(lesson);
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  expect(await view.findByText('바뀐 것이 없습니다')).toBeTruthy();
  expect(view.queryByText(/강행할 수 없습니다/)).toBeNull();
  fireEvent.change(view.getByLabelText('끝'), { target: { value: '10:05' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  expect(await view.findByText(/길이는 10분에서 8시간 사이/)).toBeTruthy();
  expect(patches()).toHaveLength(0);
});

it('코드표에 없는 지금 강사·강의실도 그대로 골라진 채 열린다 — 모르는 값을 「미정」으로 바꿔 보내지 않는다', async () => {
  // 그만둔 강사처럼 목록(meta.staff)에 없는 사람이 맡은 회차 — 목록에 없다고 빈 값이 되면 저장이 강사를 지운다
  const { view, patches } = setupEdit({ ...lesson, teacherId: 99, teacherName: '옛 강사', roomId: 77, roomName: '옛 강의실' });
  expect((view.getByLabelText('강사') as HTMLSelectElement).value).toBe('99');
  expect((view.getByLabelText('강의실') as HTMLSelectElement).value).toBe('77');
  fireEvent.change(view.getByLabelText('끝'), { target: { value: '11:30' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0].data).toEqual({ startMin: 600, endMin: 690, scope: 'this', onDate: '2026-09-28' });
});

it('겹쳐서 막히면 새 일정과 같은 ConflictGuard 로 누구와를 붙인다 — 자기 회차는 겹침에서 뺀다', async () => {
  const { view, sent, onSaved } = setupEdit(lesson, 'conflict');
  fireEvent.change(view.getByLabelText('시작'), { target: { value: '10:30' } });
  fireEvent.change(view.getByLabelText('끝'), { target: { value: '11:30' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(view.getByText(/같은 시간에/)).toBeTruthy());
  await waitFor(() => expect(view.getByText(/\[강사\] 김재훈 · 2026-09-28 10:30–11:30 · MAP Reading/)).toBeTruthy());
  expect(view.getByText(/강행할 수 없습니다/)).toBeTruthy();
  const probe = sent.filter((r) => r.url === '/schedule/conflicts');
  expect(probe).toHaveLength(1);
  expect(probe[0].params).toMatchObject({ date: '2026-09-28', startMin: 630, endMin: 690, teacherId: 7, roomId: 1, exceptSerId: 3 });
  expect(onSaved).not.toHaveBeenCalled();
  expect(view.getByRole('dialog', { name: /^일정 수정/ })).toBeTruthy();
});

/* ── W11 — 회차 방식 전환(N-56) · 회차 메모(N-57) · 409 뒤 빈 자원 한 줄(N-70) ── */

it('온라인으로 바꾸면 강의실은 보내지 않고 고른 줌 계정만 싣는다 — 부르는 쪽에 「방식을 바꿨다」를 알린다', async () => {
  const { view, patches, onSaved } = setupEdit(lesson);
  // 이미 온라인인 회차가 아니면 줌 칸은 온라인을 고른 뒤에만 선다
  expect(view.queryByLabelText('줌 계정')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: '온라인' }));
  expect((view.getByLabelText('강의실') as HTMLSelectElement).disabled).toBe(true);
  expect(view.getByRole('status').textContent).toContain('강의실을 비웁니다');
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '5' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0].data).toEqual({ mode: 'online', zaccId: 5, scope: 'this', onDate: '2026-09-28' });
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(onSaved.mock.calls[0][1]).toEqual({ modeChanged: true, memoOnly: false });
});

it('줌 계정을 고르지 않고 온라인으로 바꾸면 방식만 보낸다 — 계정을 지어내 붙이지 않는다', async () => {
  const { view, patches } = setupEdit(lesson);
  fireEvent.click(view.getByRole('button', { name: '온라인' }));
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0].data).toEqual({ mode: 'online', scope: 'this', onDate: '2026-09-28' });
});

it('현장으로 바꾸면 강의실을 고를 수 있고 그 강의실만 싣는다 — 줌 칸은 서지 않는다', async () => {
  const { view, patches } = setupEdit({ ...lesson, mode: 'online', roomId: null, roomName: null, zaccId: 5 });
  expect((view.getByLabelText('강의실') as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(view.getByRole('button', { name: '현장' }));
  expect(view.queryByLabelText('줌 계정')).toBeNull();
  const room = view.getByLabelText('강의실') as HTMLSelectElement;
  expect(room.disabled).toBe(false);
  fireEvent.change(room, { target: { value: '2' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0].data).toEqual({ mode: 'offline', roomId: 2, scope: 'this', onDate: '2026-09-28' });
});

it('온라인 전환이 막히면 줌 계정 자리를 다시 묻고, 서버의 빈 자원 한 줄을 붙인다 (N-70)', async () => {
  const { view, sent } = setupEdit(lesson, 'conflict', '그 시각 비어 있는 줌 계정 — TN Zoom 2');
  fireEvent.click(view.getByRole('button', { name: '온라인' }));
  fireEvent.change(view.getByLabelText('줌 계정'), { target: { value: '5' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(view.getByText(/그 시각 비어 있는 줌 계정 — TN Zoom 2/)).toBeTruthy());
  const probe = sent.filter((r) => r.url === '/schedule/conflicts');
  expect(probe).toHaveLength(1);
  // 온라인이면 강의실이 아니라 줌 계정을 묻는다 — 비운 강의실(null)은 싣지 않는다
  expect(probe[0].params).toMatchObject({ zaccId: 5, teacherId: 7, exceptSerId: 3 });
  expect(probe[0].params).not.toHaveProperty('roomId');
});

it('메모만 고치면 반복이어도 범위를 묻지 않는다 — 부르는 쪽에 「메모만」을 알린다 (N-57)', async () => {
  const { view, patches, onSaved } = setupEdit({ ...lesson, recurring: true, memo: null });
  fireEvent.change(view.getByLabelText('회차 메모 (이번 회차만)'), { target: { value: '오답 리뷰' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(view.queryByRole('button', { name: /향후/ })).toBeNull();
  expect(patches()[0].data).toEqual({ memo: '오답 리뷰', scope: 'this', onDate: '2026-09-28' });
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(onSaved.mock.calls[0][1]).toEqual({ modeChanged: false, memoOnly: true });
});
