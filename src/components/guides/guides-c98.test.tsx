/** @file-guide
 * 목적: §43 자동 채움 · 나머지 학생에게 복사 · 줌 안내 (C98 · F-60 · F-61 · F-63).
 * 책임/재사용: 실제 GuideWriter/GuidesTodo 와 생성 타입을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
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
