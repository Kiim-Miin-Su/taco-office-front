/** @file-guide
 * 목적: 강사 교체 마법사 — 화면은 원래/새 강사·범위·날짜·(수업·학생·컴플레인)만 보내고 여섯 단계는 서버 값 그대로다 (C93 · J-97 · D-46 · N-132).
 * 책임/재사용: 실제 TeacherChangeWizard/useTeacherChange/useMeta 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { TeacherChangeResult } from '@/api/types';
import { TeacherChangeWizard } from './TeacherChangeWizard';

const meta = {
  kinds: [], subs: [],
  staff: [
    { id: 7, name: '김재훈', role: 'teacher', canAdminPage: false, canGpaPack: false, title: null },
    { id: 3, name: '김범준', role: 'manager', canAdminPage: true, canGpaPack: false, title: null },
  ],
  rooms: [], students: [], zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [],
};
const result: TeacherChangeResult = {
  preview: true, mode: 'from', date: '2026-10-05',
  fromTeacher: { id: 7, name: '김재훈', active: true }, toTeacher: { id: 3, name: '김범준', active: true },
  series: [
    { serId: 12, newSerId: 40, title: '', kindName: '수업', subName: 'Writing', ruleLabel: '매주 월·수', startMin: 960, endMin: 1020, students: ['진예람'], occurrences: 8, firstOn: '2026-10-05' },
    { serId: 15, newSerId: 41, title: '', kindName: '수업', subName: 'SAT Math', ruleLabel: '매주 금', startMin: 1080, endMin: 1140, students: ['차서윤'], occurrences: 4, firstOn: '2026-10-09' },
  ],
  occurrences: 12, guideDrafts: 2, parentNotices: 2, books: [{ studentName: '진예람', title: 'Writing Builder 2', state: 'wait' }],
  payout: [{ month: '2026-10', occurrences: 12, fromConfirmed: false, toConfirmed: false }], notifiedTeachers: 2, notifiedStaff: 3,
  unavailable: [{ serId: 40, date: '2026-10-07', teacherId: 3, teacherName: '김범준', startMin: 960, endMin: 1020, reason: '병원' }],
  cpl: { id: 2, stage: 'acting', teacherChanged: true },
  steps: [
    { key: 'schedule', label: '스케줄', count: 12, note: '규칙 2개 · 회차 12회 — 10/5부터 계속(규칙을 가른다)' },
    { key: 'guide', label: '안내 초안', count: 2, note: '학생마다 강사 교체 안내 초안' },
    { key: 'parent', label: '학부모 안내', count: 2, note: '보낼 안내로 남겼습니다 — 학부모 수신처는 아직 없습니다 (N-42)' },
    { key: 'book', label: '교재 확인', count: 1, note: '이관 학생의 배부 교재' },
    { key: 'payout', label: '정산 시수', count: 12, note: '10월 12회 → 김범준' },
    { key: 'notify', label: '선생님 전달', count: 2, note: '새 강사 김범준 · 원래 강사 김재훈 · 관리자 3명' },
  ],
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: unknown }> = [];
const got: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; got.length = 0; });

function setup(onPost: (url: string, n: number) => { status: number; data: unknown } = (url) => ({ status: 201, data: url.endsWith('/preview') ? result : { ...result, preview: false } })) {
  let n = 0;
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const r = onPost(config.url ?? '', ++n);
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    got.push(config.url ?? '');
    const data = config.url === '/meta' ? meta
      : config.url === '/schedule/conflicts' ? { conflicts: [{ serId: 9, onDate: '2026-10-05', startMin: 960, endMin: 1020, title: 'SAT', with: 'teacher', whoName: '김범준' }] } : {};
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onClose = vi.fn();
  const onDone = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <TeacherChangeWizard open preset={{ cplId: 2, studentId: 21, studentName: '진예람' }} onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { view, onClose, onDone };
}

async function fill(view: ReturnType<typeof render>) {
  const dialog = await view.findByRole('dialog', { name: '강사 교체 — 진예람' });
  await waitFor(() => expect(within(dialog).getAllByRole('option', { name: '김재훈' }).length).toBeGreaterThan(0));
  fireEvent.change(within(dialog).getByLabelText('원래 강사'), { target: { value: '7' } });
  fireEvent.change(within(dialog).getByLabelText('새 강사'), { target: { value: '3' } });
  fireEvent.change(within(dialog).getByLabelText('시작일'), { target: { value: '2026-10-05' } });
  return dialog;
}

it('보내는 몸통은 강사 둘·범위·날짜·학생·컴플레인뿐이고, 여섯 단계는 서버 값 그대로 · 미리 본 뒤에야 「교체 확정」이 서며 수업을 빼면 다시 본다 (J-97 · D-46)', async () => {
  const { view, onClose, onDone } = setup();
  const dialog = await fill(view);
  const apply = within(dialog).getByRole('button', { name: '교체 확정' }) as HTMLButtonElement;
  expect(apply.disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ url: '/ops/teacher-change/preview', body: { fromTeacherId: 7, toTeacherId: 3, mode: 'from', date: '2026-10-05', studentId: 21, cplId: 2 } });
  const box = await view.findByLabelText('교체 미리보기');
  const text = (box.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('김재훈 → 김범준 · 2026-10-05부터 · 회차 12회');
  for (const w of ['1. 스케줄 12회', '2. 안내 초안 2건', '3. 학부모 안내 2건', '4. 교재 확인 1권', '5. 정산 시수 12회', '6. 선생님 전달 2명']) expect(text).toContain(w);
  expect(text).toContain('학부모 수신처는 아직 없습니다 (N-42)');
  expect(text).toContain('2026-10-07 16:00–17:00 · 김범준 — 병원');
  expect(text).toContain('컴플레인 #2 → 「강사 교체됨」 · 대응 칸으로');
  await waitFor(() => expect((within(dialog).getByRole('button', { name: '교체 확정' }) as HTMLButtonElement).disabled).toBe(false));
  // 수업 하나를 빼면 잠기고, 다시 본 미리보기는 남은 수업만 serIds 로 보낸다
  const target = within(dialog).getByLabelText(/SAT Math · 매주 금/);
  fireEvent.click(target);
  expect((within(dialog).getByRole('button', { name: '교체 확정' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[1]!.body).toMatchObject({ serIds: [12] });
  await waitFor(() => expect((within(dialog).getByRole('button', { name: '교체 확정' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(dialog).getByRole('button', { name: '교체 확정' }));
  await waitFor(() => expect(posted).toHaveLength(3));
  expect(posted[2]).toEqual({ url: '/ops/teacher-change', body: { fromTeacherId: 7, toTeacherId: 3, mode: 'from', date: '2026-10-05', serIds: [12], studentId: 21, cplId: 2 } });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ preview: false }));
});

it('하루만 대강은 날짜 하나로 보내고, 겹치면 서버 문장을 그대로 띄운 뒤 아는 수업으로 「누구와」를 한 번 묻는다 (N-132 · A-06)', async () => {
  const { view } = setup((_url, n) => (n === 1
    ? { status: 201, data: { ...result, mode: 'day', series: [result.series[0]!] } }
    : { status: 409, data: { code: 'RESOURCE_CONFLICT', message: '같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다 — Writing · 10/5 16:00–17:00 · 김범준' } }));
  const dialog = await fill(view);
  fireEvent.click(within(dialog).getByRole('button', { name: '하루만 대강' }));
  fireEvent.change(within(dialog).getByLabelText('대강 날짜'), { target: { value: '2026-10-05' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]!.body).toMatchObject({ mode: 'day', date: '2026-10-05' });
  await view.findByLabelText('교체 미리보기');
  // 두 번째 미리보기(예: 다른 새 강사)는 겹친다 → 문장 + 누구와
  fireEvent.change(within(dialog).getByLabelText('메모'), { target: { value: '아침에 연락' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(view.getByText(/이미 잡혀 있습니다 — Writing/)).toBeTruthy());
  await waitFor(() => expect(got.filter((u) => u === '/schedule/conflicts').length).toBe(1));
  await waitFor(() => expect(view.getByText(/2026-10-05 16:00–17:00 · 김범준/)).toBeTruthy());
  expect(view.queryByLabelText('교체 미리보기')).toBeNull();
  expect((within(dialog).getByRole('button', { name: '교체 확정' }) as HTMLButtonElement).disabled).toBe(true);
});
