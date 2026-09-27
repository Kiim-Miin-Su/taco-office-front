/** @file-guide
 * 목적: guardian-weekly.test.tsx — 보호자 발송 창을 §47 주간 묶음(N-54 · wrepId)으로 열 때의 요청 모양 · 읽기 전용 본문 회귀(W11 R2).
 * 책임/재사용: 실제 GuardianSendDialog 와 queries 훅을 쓰고 네트워크만 어댑터로 갈아 끼운다. 묶음 판정 · 원장은 서버 시험(reports-weekly-db)이 본다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Guardian, GuardianSendResult } from '@/api/types';
import { GuardianSendDialog } from './GuardianSendDialog';

const mom: Guardian = {
  id: 11, studentId: 4, name: '김엄마', relation: '어머니', email: 'mom@example.com', phone: '01000000001',
  phoneDisplay: '010-0000-0001', receiveEmail: true, receiveSms: true, receives: ['email', 'sms'],
  isPrimary: true, active: true, createdAt: '2026-09-25T09:00:00+09:00',
};

type Call = { method?: string; url?: string; body?: unknown };
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let calls: Call[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; calls = []; });

const result: GuardianSendResult = {
  requestKey: '00000000-0000-4000-8000-000000000001', studentId: 4, pnotiId: null, replayed: false, pnotiSentAt: null,
  summary: '1건 보냈습니다', counts: { sent: 1, failed: 0, notConfigured: 0, skipped: 0 },
  items: [{
    guardianId: 11, guardianName: '김엄마', relation: '어머니', channel: 'email', channelLabel: '메일',
    toMasked: 'mo***@example.com', status: 'sent', statusLabel: '보냄', error: null, sentAt: '2026-08-10T09:00:00+09:00',
  }],
  skipped: [],
};

it('주간 묶음으로 열면 본문은 서버가 모은 글 그대로(읽기 전용)이고 요청에 wrepId 를 싣는다', async () => {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    const call = { method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : undefined };
    calls.push(call);
    const data = call.method === 'get' && call.url === '/students/4/guardians' ? { studentId: 4, studentName: '고은설', guardians: [mom] }
      : call.method === 'get' && call.url === '/guardians/channels'
        ? { channels: [{ channel: 'email', label: '메일', ready: true, reason: null }, { channel: 'sms', label: '문자', ready: false, reason: '문자 발송 설정이 없어 보내지 못합니다' }] }
        : call.method === 'post' && call.url === '/guardians/send' ? result : {};
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const body = '① 학생: 고은설\n\n총평\n잘했습니다';
  const view = render(<QueryClientProvider client={client}>
    <GuardianSendDialog open student={{ id: 4, name: '고은설' }} wrepId={7} defaultBody={body}
      defaultSubject="고은설 학생 주간 리포트 · 08-03 ~ 08-09" onClose={() => {}} />
  </QueryClientProvider>);
  const shown = await view.findByLabelText('보낼 내용');
  // 고칠 수 없다 — 원장(guardian_send.body)이 서버 묶음과 같아야 해서다
  expect(shown.tagName).toBe('PRE');
  expect(shown.getAttribute('aria-readonly')).toBe('true');
  expect(shown.textContent).toBe(body);
  const send = await view.findByRole('button', { name: '보내기' }) as HTMLButtonElement;
  await waitFor(() => expect(send.disabled).toBe(false));
  fireEvent.click(send);
  await view.findByLabelText('보낸 결과');
  expect(calls.find((c) => c.method === 'post')?.body).toEqual({
    studentId: 4, pnotiId: null, wrepId: 7, guardianIds: [11], channels: ['email'],
    subject: '고은설 학생 주간 리포트 · 08-03 ~ 08-09', body, requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
});
