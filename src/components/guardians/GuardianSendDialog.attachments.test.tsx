/** @file-guide
 * 목적: 보호자 선택 발송 창의 계약서 첨부(§30 ③ 「계약서 전달하기」 · W11) — 고른 파일 id 만 보내고, 파일은 메일에만 붙는다.
 * 책임/재사용: 실제 GuardianSendDialog · queries 훅 · 생성 타입을 쓰고 네트워크만 어댑터로 갈아 끼운다. 한도 · 권한 판정은 서버 몫이라 여기서 세지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Guardian, GuardianChannels, GuardianSendResult } from '@/api/types';
import { GuardianSendDialog } from './GuardianSendDialog';

const mom: Guardian = {
  id: 11, studentId: 4, name: '김엄마', relation: '어머니', email: 'mom@example.com', phone: '01000000001',
  phoneDisplay: '010-0000-0001', receiveEmail: true, receiveSms: true, receives: ['email', 'sms'],
  isPrimary: true, active: true, createdAt: '2026-09-25T09:00:00+09:00',
};
const channels: GuardianChannels = {
  channels: [
    { channel: 'email', label: '메일', ready: true, reason: null },
    { channel: 'sms', label: '문자', ready: true, reason: null },
  ],
};
const result: GuardianSendResult = {
  requestKey: '00000000-0000-4000-8000-000000000001', studentId: 4, pnotiId: null, replayed: false, pnotiSentAt: null,
  summary: '1건을 보냈습니다',
  counts: { sent: 1, failed: 0, notConfigured: 0, skipped: 0 },
  items: [{
    guardianId: 11, guardianName: '김엄마', relation: '어머니', channel: 'email', channelLabel: '메일',
    toMasked: 'mo***@example.com', status: 'sent', statusLabel: '보냈습니다', error: null, sentAt: '2026-09-26T10:00:00+09:00',
  }],
  skipped: [],
};
/** 계약서 두 판 — 여는 쪽(§30 ③)이 가장 최근 판을 미리 고른다 */
const files = [
  { id: 31, name: '계약서 초안.pdf', bytes: 2048 },
  { id: 32, name: '계약서 수정본.pdf', bytes: 4096, checked: true },
];

type Call = { method?: string; url?: string; body?: unknown };
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let calls: Call[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; calls = []; });

function setup() {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    const call = { method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : undefined };
    calls.push(call);
    const data = config.url === '/students/4/guardians' ? { studentId: 4, studentName: '고은설', guardians: [mom] }
      : config.url === '/guardians/channels' ? channels
        : config.method === 'post' ? result : {};
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>
    <GuardianSendDialog open student={{ id: 4, name: '고은설' }} title="계약서 전달하기 — 고은설" defaultBody="" attachments={files} onClose={() => {}} />
  </QueryClientProvider>);
}

it('고른 계약서 id 만 consFileIds 로 보낸다 — 본문은 사람이 적고, 처음 고른 것은 여는 쪽이 정한 판이다 (W11)', async () => {
  const view = setup();
  const fieldset = await view.findByRole('group', { name: '메일에 붙일 파일' });
  expect((within(fieldset).getByRole('checkbox', { name: '계약서 초안.pdf · 2KB' }) as HTMLInputElement).checked).toBe(false);
  expect((within(fieldset).getByRole('checkbox', { name: '계약서 수정본.pdf · 4KB' }) as HTMLInputElement).checked).toBe(true);
  expect(fieldset.textContent).toContain('파일은 메일에만 붙습니다');
  const send = view.getByRole('button', { name: '보내기' }) as HTMLButtonElement;
  // 본문이 비어 있으면 보내지 않는다 — 학부모에게 가는 글은 창이 짓지 않는다
  await waitFor(() => expect((view.getByRole('checkbox', { name: '김엄마 (어머니)' }) as HTMLInputElement).checked).toBe(true));
  expect(send.disabled).toBe(true);
  fireEvent.change(view.getByLabelText('보낼 내용'), { target: { value: '계약서를 보내 드립니다. 확인 부탁드립니다.' } });
  await waitFor(() => expect(send.disabled).toBe(false));
  fireEvent.click(send);
  await view.findByLabelText('보낸 결과');
  const post = calls.find((c) => c.method === 'post');
  expect(post?.url).toBe('/guardians/send');
  expect(post?.body).toEqual(expect.objectContaining({
    studentId: 4, guardianIds: [11], channels: ['email', 'sms'], body: '계약서를 보내 드립니다. 확인 부탁드립니다.', consFileIds: [32],
  }));
});

it('파일을 하나도 고르지 않았거나 메일을 빼면 까닭을 띄우고 보내기를 잠근다 — 파일은 문자로 가지 않는다', async () => {
  const view = setup();
  await waitFor(() => expect((view.getByRole('checkbox', { name: '김엄마 (어머니)' }) as HTMLInputElement).checked).toBe(true));
  fireEvent.change(view.getByLabelText('보낼 내용'), { target: { value: '계약서입니다' } });
  const send = view.getByRole('button', { name: '보내기' }) as HTMLButtonElement;
  await waitFor(() => expect(send.disabled).toBe(false));

  fireEvent.click(view.getByRole('checkbox', { name: '계약서 수정본.pdf · 4KB' }));
  expect(view.getByText('메일에 붙일 파일을 하나 이상 고르세요.')).toBeTruthy();
  expect(send.disabled).toBe(true);

  fireEvent.click(view.getByRole('checkbox', { name: '계약서 초안.pdf · 2KB' }));
  fireEvent.click(within(view.getByRole('group', { name: '보낼 채널' })).getByRole('button', { name: '메일' }));
  expect(view.getByText('파일은 메일에만 붙습니다 — 메일을 골라 주세요.')).toBeTruthy();
  expect(send.disabled).toBe(true);
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it('첨부가 없는 여는 쪽(§43 안내 등)에는 파일 칸도 consFileIds 도 없다', async () => {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    calls.push({ method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : undefined });
    const data = config.url === '/students/4/guardians' ? { studentId: 4, studentName: '고은설', guardians: [mom] }
      : config.url === '/guardians/channels' ? channels : config.method === 'post' ? result : {};
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}>
    <GuardianSendDialog open student={{ id: 4, name: '고은설' }} defaultBody="안내입니다" onClose={() => {}} />
  </QueryClientProvider>);
  const send = await view.findByRole('button', { name: '보내기' }) as HTMLButtonElement;
  await waitFor(() => expect(send.disabled).toBe(false));
  expect(view.queryByRole('group', { name: '메일에 붙일 파일' })).toBeNull();
  fireEvent.click(send);
  await view.findByLabelText('보낸 결과');
  expect(calls.find((c) => c.method === 'post')?.body).not.toHaveProperty('consFileIds');
});
