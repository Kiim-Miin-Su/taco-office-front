/** @file-guide
 * 목적: 보호자 관리(GuardianList)와 선택 발송 창(GuardianSendDialog) · §43 학부모 안내 연결 (DQ3 · 2026-09-25).
 * 책임/재사용: 실제 컴포넌트와 queries 훅·생성 타입을 쓰고 네트워크만 어댑터로 갈아 끼운다. 판정은 서버 응답 그대로다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Guardian, GuardianChannels, GuardianList as GuardianListData, GuardianSendResult, Guides, PerLessonNotice } from '@/api/types';
import { GuidesTodo } from '@/components/guides/GuidesTodo';
import { GuardianList } from './GuardianList';
import { GuardianSendDialog } from './GuardianSendDialog';

const mom: Guardian = {
  id: 11, studentId: 4, name: '김엄마', relation: '어머니', email: 'mom@example.com', phone: '01000000001',
  phoneDisplay: '010-0000-0001', receiveEmail: true, receiveSms: true, receives: ['email', 'sms'],
  isPrimary: true, active: true, createdAt: '2026-09-25T09:00:00+09:00',
};
const dad: Guardian = {
  ...mom, id: 12, name: '김아빠', relation: '아버지', email: null, phone: '01000000002', phoneDisplay: '010-0000-0002',
  receiveEmail: false, receiveSms: true, receives: ['sms'], isPrimary: false,
};
const gone: Guardian = { ...dad, id: 13, name: '옛보호자', relation: null, active: false };

const list = (guardians: Guardian[] = [mom, dad]): GuardianListData => ({ studentId: 4, studentName: '고은설', guardians });
const channels = (smsReady = false): GuardianChannels => ({
  channels: [
    { channel: 'email', label: '메일', ready: true, reason: null },
    { channel: 'sms', label: '문자', ready: smsReady, reason: smsReady ? null : '문자 발송 설정이 없어 보내지 못합니다' },
  ],
});

type Call = { method?: string; url?: string; body?: unknown };
type Reply = unknown | { status: number; data: unknown };
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let calls: Call[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; calls = []; });

function adapter(handler: (c: Call) => Reply) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    const call = { method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : undefined };
    calls.push(call);
    const r = handler(call) as { status?: number; data?: unknown };
    if (r && typeof r === 'object' && typeof r.status === 'number' && r.status >= 400) {
      return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: r };
  }) as never;
}

function wrap(node: React.ReactNode) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(c);
  return render(<QueryClientProvider client={c}>{node}</QueryClientProvider>);
}

const sent = (over: Partial<GuardianSendResult> = {}): GuardianSendResult => ({
  requestKey: '00000000-0000-4000-8000-000000000001', studentId: 4, pnotiId: 70, replayed: false, pnotiSentAt: null,
  summary: '1건은 설정이 없어 보내지 않았습니다',
  counts: { sent: 0, failed: 0, notConfigured: 1, skipped: 0 },
  items: [{
    guardianId: 11, guardianName: '김엄마', relation: '어머니', channel: 'email', channelLabel: '메일',
    toMasked: 'mo***@example.com', status: 'not_configured', statusLabel: '설정 없음 — 보내지 않았습니다',
    error: '메일 발송 설정이 없어 보내지 못합니다', sentAt: '2026-09-25T10:00:00+09:00',
  }],
  skipped: [],
  ...over,
});

function reads(c: Call, extra: (c: Call) => Reply = () => ({})): Reply {
  if (c.method === 'get' && c.url === '/students/4/guardians') return list();
  if (c.method === 'get' && c.url === '/guardians/channels') return channels();
  return extra(c);
}

/* ── 선택 발송 창 ───────────────────────────────────────────────────────── */

it('대표 보호자와 그 사람이 받는 「보낼 수 있는」 채널이 미리 골라지고, 설정 없는 채널은 서버 까닭과 함께 잠긴다', async () => {
  adapter((c) => reads(c));
  const view = wrap(<GuardianSendDialog open student={{ id: 4, name: '고은설' }} pnotiId={70} defaultBody="오늘 줌 링크입니다" onClose={() => {}} />);
  const momBox = await view.findByRole('checkbox', { name: '김엄마 (어머니)' }) as HTMLInputElement;
  await waitFor(() => expect(momBox.checked).toBe(true));
  expect((view.getByRole('checkbox', { name: '김아빠 (아버지)' }) as HTMLInputElement).checked).toBe(false);
  const group = view.getByRole('group', { name: '보낼 채널' });
  const mail = within(group).getByRole('button', { name: '메일' });
  const sms = within(group).getByRole('button', { name: '문자' }) as HTMLButtonElement;
  expect(mail.getAttribute('aria-pressed')).toBe('true');
  expect(sms.disabled).toBe(true);
  expect(sms.title).toContain('문자 발송 설정이 없어');
  expect(view.getByText(/문자 · 문자 발송 설정이 없어 보내지 못합니다/)).toBeTruthy();
  expect((view.getByLabelText('보낼 내용') as HTMLTextAreaElement).value).toBe('오늘 줌 링크입니다');
});

it('보내기 — 고른 것만 보내고 서버 원장 결과(「설정 없음 — 보내지 않았습니다」)를 그대로 그린다', async () => {
  adapter((c) => reads(c, (x) => (x.method === 'post' && x.url === '/guardians/send' ? sent() : {})));
  const view = wrap(<GuardianSendDialog open student={{ id: 4, name: '고은설' }} pnotiId={70} defaultBody="오늘 줌 링크입니다" onClose={() => {}} />);
  const send = await view.findByRole('button', { name: '보내기' }) as HTMLButtonElement;
  await waitFor(() => expect(send.disabled).toBe(false));
  fireEvent.click(send);
  const box = await view.findByLabelText('보낸 결과');
  const post = calls.find((c) => c.method === 'post');
  expect(post?.url).toBe('/guardians/send');
  expect(post?.body).toEqual({
    studentId: 4, pnotiId: 70, guardianIds: [11], channels: ['email'], subject: null,
    body: '오늘 줌 링크입니다', requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  const text = (box.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('1건은 설정이 없어 보내지 않았습니다');
  expect(text).toContain('김엄마');
  expect(text).toContain('mo***@example.com');
  expect(text).toContain('설정 없음 — 보내지 않았습니다');
  expect(text).not.toContain('mom@example.com');
  // 결과를 본 뒤에는 다시 보내지 않는다 — 닫기만 남는다
  expect(view.queryByRole('button', { name: '보내기' })).toBeNull();
});

it('같은 「보내기」의 재시도는 같은 요청 키로 가고, 받는 사람을 바꾸면 새 키다', async () => {
  let fail = true;
  adapter((c) => reads(c, (x) => {
    if (x.method !== 'post') return {};
    if (fail) { fail = false; return { status: 503, data: { code: 'INTERNAL', message: '처리하지 못했습니다' } }; }
    return sent();
  }));
  const view = wrap(<GuardianSendDialog open student={{ id: 4, name: '고은설' }} defaultBody="본문" onClose={() => {}} />);
  const send = await view.findByRole('button', { name: '보내기' }) as HTMLButtonElement;
  await waitFor(() => expect(send.disabled).toBe(false));
  fireEvent.click(send);
  await view.findByRole('alert');
  fireEvent.click(send);
  await view.findByLabelText('보낸 결과');
  const keys = calls.filter((c) => c.method === 'post').map((c) => (c.body as { requestKey: string }).requestKey);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect((calls.find((c) => c.method === 'post')?.body as { pnotiId: unknown }).pnotiId).toBeNull();
});

it('고른 채널을 하나도 받지 않는 보호자를 고르면 먼저 알리고 보내기를 잠근다', async () => {
  adapter((c) => reads(c));
  const view = wrap(<GuardianSendDialog open student={{ id: 4, name: '고은설' }} defaultBody="본문" onClose={() => {}} />);
  const dadBox = await view.findByRole('checkbox', { name: '김아빠 (아버지)' });
  await waitFor(() => expect((view.getByRole('checkbox', { name: '김엄마 (어머니)' }) as HTMLInputElement).checked).toBe(true));
  fireEvent.click(dadBox);
  expect(view.getByText(/김아빠 님은 고른 채널로 받지 않습니다/)).toBeTruthy();
  expect((view.getByRole('button', { name: '보내기' }) as HTMLButtonElement).disabled).toBe(true);
});

it('보낼 수 있는 채널이 하나도 없으면 「고른 채널로 받지 않습니다」를 띄우지 않는다 — 따를 수 없는 안내다 (QA 0925 G3)', async () => {
  adapter((c) => (c.method === 'get' && c.url === '/guardians/channels'
    ? { channels: [
      { channel: 'email', label: '메일', ready: false, reason: '메일 발송 설정이 없어 보내지 못합니다' },
      { channel: 'sms', label: '문자', ready: false, reason: '문자 발송 설정이 없어 보내지 못합니다' },
    ] }
    : reads(c)));
  const view = wrap(<GuardianSendDialog open student={{ id: 4, name: '고은설' }} defaultBody="본문" onClose={() => {}} />);
  await waitFor(() => expect((view.getByRole('checkbox', { name: '김엄마 (어머니)' }) as HTMLInputElement).checked).toBe(true));
  expect(view.getByText('지금은 보낼 수 있는 채널이 없습니다.')).toBeTruthy();
  expect(view.queryByText(/고른 채널로 받지 않습니다/)).toBeNull();
  expect((view.getByRole('button', { name: '보내기' }) as HTMLButtonElement).disabled).toBe(true);
});

/* ── 보호자 관리 ────────────────────────────────────────────────────────── */

it('보호자 목록 — 대표·받는 채널(서버 낱말)·연락처를 그리고 사용 중지한 사람은 「다시 쓰기」만 선다', async () => {
  adapter((c) => (c.method === 'get' && c.url === '/students/4/guardians' ? list([mom, dad, gone]) : reads(c)));
  const view = wrap(<GuardianList studentId={4} />);
  const items = await view.findAllByRole('listitem');
  const first = (items[0].textContent ?? '').replace(/\s+/g, ' ');
  expect(first).toContain('김엄마');
  expect(first).toContain('대표');
  expect(first).toContain('mom@example.com');
  expect(first).toContain('010-0000-0001');
  await waitFor(() => expect(within(items[0]).getByText('메일')).toBeTruthy());
  expect(within(items[0]).getByText('문자')).toBeTruthy();
  expect(within(items[2]).getByText('사용 중지')).toBeTruthy();
  expect(within(items[2]).getByRole('button', { name: '다시 쓰기' })).toBeTruthy();
  expect(within(items[2]).queryByRole('button', { name: '고치기' })).toBeNull();
});

it('보호자 추가 — 빈 칸은 null 로 보내고, 서버 거절 문장을 그대로 띄운다', async () => {
  adapter((c) => reads(c, (x) => (x.method === 'post'
    ? { status: 400, data: { code: 'GUARDIAN_CHANNEL_CONTACT', message: '문자를 받으려면 휴대폰 번호가 있어야 합니다' } }
    : {})));
  const view = wrap(<GuardianList studentId={4} />);
  fireEvent.click(await view.findByRole('button', { name: '+ 보호자 추가' }));
  const form = view.getByRole('form', { name: '보호자 추가' });
  fireEvent.change(within(form).getByLabelText('이름'), { target: { value: '할머니' } });
  fireEvent.change(within(form).getByLabelText('이메일'), { target: { value: 'grand@example.com' } });
  await waitFor(() => expect(within(form).getByRole('checkbox', { name: '문자 받기' })).toBeTruthy());
  fireEvent.click(within(form).getByRole('checkbox', { name: '문자 받기' }));
  fireEvent.click(within(form).getByRole('button', { name: '저장' }));
  expect(await within(form).findByRole('alert')).toHaveProperty('textContent', '문자를 받으려면 휴대폰 번호가 있어야 합니다');
  expect(calls.find((c) => c.method === 'post')).toEqual({
    method: 'post', url: '/students/4/guardians',
    body: { name: '할머니', relation: null, email: 'grand@example.com', phone: null, receiveEmail: true, receiveSms: true, isPrimary: false },
  });
});

it('사용 중지는 DELETE, 다시 쓰기는 PATCH active:true — 지우지 않는다', async () => {
  adapter((c) => (c.method === 'get' && c.url === '/students/4/guardians' ? list([mom, gone]) : reads(c, (x) => (x.method === 'get' ? {} : mom))));
  const view = wrap(<GuardianList studentId={4} />);
  const items = await view.findAllByRole('listitem');
  fireEvent.click(within(items[0]).getByRole('button', { name: '사용 중지' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'delete' && c.url === '/guardians/11')).toBe(true));
  await waitFor(() => expect((within(items[1]).getByRole('button', { name: '다시 쓰기' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(items[1]).getByRole('button', { name: '다시 쓰기' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'patch')).toEqual({ method: 'patch', url: '/guardians/13', body: { active: true } }));
});

/* ── §43 회차 학부모 안내 → 선택 발송 ───────────────────────────────────── */

function lesson(over: Partial<PerLessonNotice> = {}): PerLessonNotice {
  return {
    id: 90, sourceOccurrenceId: 90, serId: 8, onDate: '2026-09-19', startMin: 600, endMin: 660,
    teacherId: 2, teacherName: 'Sophia', kindName: '수업', zaccId: 3, zaccLabel: 'Study',
    zoomAssigned: true,
    notices: [{ id: 70, studentId: 4, studentName: '고은설', channel: 'app', body: '[줌 안내] Vocabulary', sentAt: null }],
    parentDeliveryRecorded: false, teacherDeliveryRecorded: true, canSendTeacher: false, sendBlockedReason: '이미 보냈습니다',
    channel: 'app', studentName: '고은설', serTitle: 'Vocabulary', body: '[줌 안내] Vocabulary', sentAt: null, ...over,
  };
}
const guides = (perLesson: PerLessonNotice[]): Guides => ({
  guides: [], perLesson, missing: [], todoCount: 1, scopedTeacherId: null,
  stats: { monitoring: 0, overdue: 0, drafting: 0, sendPending: 0, teacherUnconfirmed: 0, repeatedTeacherChange: 0 },
  deliveryCapabilities: { parentExternal: false, teacherExternal: false, reason: '외부 발송 미연결' },
});

it('§43 「학부모 안내」 — 그 학생의 안내 줄과 본문으로 보호자 발송 창을 연다 (강사 안내는 그대로)', async () => {
  adapter((c) => reads(c));
  const view = wrap(<GuidesTodo data={guides([lesson()])} />);
  const parent = view.getByRole('button', { name: '학부모 안내' }) as HTMLButtonElement;
  expect(parent.disabled).toBe(false);
  expect((view.getByRole('button', { name: '강사 보냄' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(parent);
  const dialog = await view.findByRole('dialog', { name: '학부모 안내 — 고은설' });
  await waitFor(() => expect((within(dialog).getByLabelText('보낼 내용') as HTMLTextAreaElement).value).toBe('[줌 안내] Vocabulary'));
});

it('§43 학생이 여럿이면 누구의 보호자에게 보낼지 먼저 고른다', async () => {
  adapter((c) => reads(c));
  const two = lesson({
    notices: [
      { id: 70, studentId: 4, studentName: '고은설', channel: 'app', body: '안내 A', sentAt: null },
      { id: 71, studentId: 5, studentName: '이하린', channel: 'app', body: '안내 B', sentAt: null },
    ],
  });
  const view = wrap(<GuidesTodo data={guides([two])} />);
  fireEvent.click(view.getByRole('button', { name: '학부모 안내' }));
  const pick = view.getByRole('group', { name: '보낼 학생' });
  fireEvent.click(within(pick).getByRole('button', { name: '고은설' }));
  const dialog = await view.findByRole('dialog', { name: '학부모 안내 — 고은설' });
  await waitFor(() => expect((within(dialog).getByLabelText('보낼 내용') as HTMLTextAreaElement).value).toBe('안내 A'));
});
