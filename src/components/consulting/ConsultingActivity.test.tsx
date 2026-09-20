/** @file-guide
 * 목적: §31 회차 기록 패널 — 「+ 회차 기록」은 서버 canAddSession 에만 서고, 육하원칙은 바뀐 칸만 보내며, 앞으로 잡아 둔 날짜는 「앞으로」로 갈린다 (C95).
 * 책임/재사용: 실제 ConsultingActivity/useWriteConsultingSession 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { ConsultingDetail } from '@/api/types';
import { ConsultingActivity } from './ConsultingActivity';
import { consultingItem } from './consulting.fixture';

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const patched: Array<{ url?: string; body: unknown }> = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; patched.length = 0; });

const item = consultingItem({
  id: 2, stage: 'running', contractStep: 5, sessions: 8, sessionsDone: 1,
  sessionsLog: [
    { id: 31, seq: 3, onDate: '2026-09-16', who: '김재훈 · 정하람', what: 'Body Paragraph 논거 재배치', why: null, how: null, serId: 15, done: true },
    { id: 32, seq: 4, onDate: '2026-12-01', who: '김재훈 · 정하람', what: null, why: null, how: null, serId: 90, done: false },
  ],
});
const capabilities = {
  canEdit: false, canChangeShare: false, canSetPrivate: false, canAddContractFile: false, canRemoveContractFile: false, canAddFeedback: false, canResolveFeedback: false,
  canDeliver: false, canAddSignedFile: false, canAddPayment: false, payBlockedReason: null, canCreateInvoice: false, canArchive: true,
  externalParentSendSupported: false, externalParentSendReason: null, canAddSession: true, canClose: false, closeBlockedReason: '남았다',
} satisfies ConsultingDetail['capabilities'];

function setup(detail?: Partial<ConsultingDetail>) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'patch') {
      patched.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      return { config, status: 200, statusText: 'OK', headers: {}, data: { ...item.sessionsLog[0], why: '주제문 순서', how: '문단 단위 교정' } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onAddSession = vi.fn();
  const view = render(<QueryClientProvider client={client}>
    <ConsultingActivity item={item} detail={detail ? { capabilities, ...detail } as ConsultingDetail : undefined} onAddSession={onAddSession} />
  </QueryClientProvider>);
  return { view, onAddSession };
}

it('머리는 서버의 「한 회차」이고 잡아 둔 날짜는 「앞으로」 · 「+ 회차 기록」은 canAddSession 에만 선다', () => {
  const { view, onAddSession } = setup({ capabilities });
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('회차 기록 — 2건');
  expect(text).toContain('회차 1 / 약정 8회');
  expect(view.getAllByText('앞으로')).toHaveLength(1);
  fireEvent.click(view.getByRole('button', { name: '+ 회차 기록' }));
  expect(onAddSession).toHaveBeenCalled();
  cleanup();
  const locked = setup({ capabilities: { ...capabilities, canAddSession: false } });
  expect(locked.view.queryByRole('button', { name: '+ 회차 기록' })).toBeNull();
});

it('「기록」을 펼쳐 왜·어떻게만 적으면 그 둘만 보낸다 (보낸 칸만 · C93 PATCH 규약)', async () => {
  const { view } = setup({ capabilities });
  fireEvent.click(view.getByRole('button', { name: '3회차 기록' }));
  const form = view.getByLabelText('3회차 육하원칙');
  expect((within(form).getByLabelText('무엇을') as HTMLTextAreaElement).value).toBe('Body Paragraph 논거 재배치');
  const save = within(form).getByRole('button', { name: '저장' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true); // 바뀐 것이 없다
  fireEvent.change(within(form).getByLabelText('왜'), { target: { value: ' 주제문 순서 ' } });
  fireEvent.change(within(form).getByLabelText('어떻게'), { target: { value: '문단 단위 교정' } });
  fireEvent.click(save);
  await waitFor(() => expect(patched).toHaveLength(1));
  expect(patched[0]).toEqual({ url: '/consulting/2/sessions/31', body: { why: '주제문 순서', how: '문단 단위 교정' } });
  await waitFor(() => expect(view.queryByLabelText('3회차 육하원칙')).toBeNull());
});
