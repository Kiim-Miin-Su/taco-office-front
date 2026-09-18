/** @file-guide
 * 목적: 컨설팅 종료 창 — 서는지는 서버(canClose)가 정하고 막힌 이유를 그대로 띄우며, 안내문은 미리보기 응답 그대로 · 미리 본 뒤에만 확정 (C95 · I-95 · N-18).
 * 책임/재사용: 실제 ConsultingCloseDialog/useCloseConsulting/useGuideTemplates 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { ConsCloseResult, ConsultingDetail } from '@/api/types';
import { ConsultingCloseDialog } from './ConsultingCloseDialog';

const base = {
  id: 1, consType: 'essay', consTypeLabel: '에세이 지도', stage: 'running', contractStep: 5,
  studentIds: [6], studentNames: ['정하람'], requester: 'father', ownerId: 7, ownerName: '김재훈',
  startOn: '2026-07-08', endOn: '2026-12-20', amount: 3600000, sessions: 8,
  share: 'money_only', pickedStaffIds: [], pickedStaffNames: [], createdAt: '2026-07-08T00:00:00+09:00',
  typeCapability: { defaultItemsSupported: false, reason: '미확정', scheduleCreationSupported: false, scheduleCreationReason: '약정 회차만 저장' },
  capabilities: {
    canEdit: false, canChangeShare: false, canAddContractFile: false, canRemoveContractFile: false, canAddFeedback: false, canResolveFeedback: false,
    canDeliver: false, canAddSignedFile: false, canAddPayment: false, canCreateInvoice: false, canArchive: true,
    externalParentSendSupported: false, externalParentSendReason: null,
    canAddSession: true, canClose: false, closeBlockedReason: '약정 8회 중 3회를 했습니다 — 남은 5회를 마쳐야 종료할 수 있습니다 (예외 종료는 N-18-a)',
  },
  contractFiles: [], signedFiles: [], feedback: [], delivery: null, payment: { paid: 3600000, due: 0, invoiceId: null },
  sessionsDone: 3, sessionsPlanned: 0, requiredLeft: 0, closedAt: null, closedByName: null,
} satisfies ConsultingDetail;
const result: ConsCloseResult = {
  preview: true, consId: 1, stage: 'done', studentNames: ['정하람'],
  noticeBody: '컨설팅 종료 안내 — 에세이 지도 컨설팅(8회)이 마무리되었습니다. 그동안 함께해 주셔서 감사합니다. · 수고 많으셨습니다',
  parentNotices: 1, sessionsDone: 8, sessions: 8, endOn: '2026-09-18', notified: true,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posts: Array<{ url?: string; body: unknown }> = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posts.length = 0; });

function setup(detail: ConsultingDetail) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posts.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      return { config, status: 201, statusText: 'Created', headers: {}, data: { ...result, preview: config.url?.endsWith('/preview') ?? false } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/guides/templates' ? [{ id: 4, name: '컨설팅 종료', body: '틀 본문' }] : {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const onClose = vi.fn();
  const view = render(<QueryClientProvider client={client}><ConsultingCloseDialog open detail={detail} onClose={onClose} onDone={onDone} /></QueryClientProvider>);
  return { view, onDone, onClose };
}

it('서버가 막으면 이유 문장을 그대로 띄우고 미리 보기부터 잠긴다 — 화면이 회차를 다시 세지 않는다 (N-18)', async () => {
  const { view } = setup(base);
  const dialog = await view.findByRole('dialog', { name: '컨설팅 종료 — 정하람' });
  expect((dialog.textContent ?? '')).toContain('남은 5회를 마쳐야 종료할 수 있습니다');
  expect((within(dialog).getByRole('button', { name: '미리 보기' }) as HTMLButtonElement).disabled).toBe(true);
  expect((within(dialog).getByRole('button', { name: '종료 확정' }) as HTMLButtonElement).disabled).toBe(true);
  expect(posts).toHaveLength(0);
});

it('열리면 문구 틀·한 줄을 보내 미리 보고, 안내문은 응답 그대로 · 미리 본 뒤에만 「종료 확정」 (I-95)', async () => {
  const { view, onDone, onClose } = setup({ ...base, sessionsDone: 8, capabilities: { ...base.capabilities, canClose: true, closeBlockedReason: null } });
  const dialog = await view.findByRole('dialog', { name: '컨설팅 종료 — 정하람' });
  expect((dialog.textContent ?? '')).toContain('회차 8 / 약정 8');
  await waitFor(() => expect(within(dialog).getByRole('option', { name: '컨설팅 종료' })).toBeTruthy());
  const confirm = within(dialog).getByRole('button', { name: '종료 확정' }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('안내 문구 틀'), { target: { value: '4' } });
  fireEvent.change(within(dialog).getByLabelText(/안내문 뒤에 붙는 한 줄/), { target: { value: ' 수고 많으셨습니다 ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '미리 보기' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toEqual({ url: '/consulting/1/close/preview', body: { templateId: 4, memo: '수고 많으셨습니다' } });
  const box = await within(dialog).findByLabelText('종료 미리보기');
  expect(box.textContent).toContain(result.noticeBody);
  expect(box.textContent).toContain('학부모 안내 · 1명 · 종료일 2026-09-18 · 회차 8 / 8');
  await waitFor(() => expect((within(dialog).getByRole('button', { name: '종료 확정' }) as HTMLButtonElement).disabled).toBe(false));
  // 한 줄을 고치면 다시 잠긴다
  fireEvent.change(within(dialog).getByLabelText(/안내문 뒤에 붙는 한 줄/), { target: { value: '다른 말' } });
  expect((within(dialog).getByRole('button', { name: '종료 확정' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText(/안내문 뒤에 붙는 한 줄/), { target: { value: '수고 많으셨습니다' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '종료 확정' }));
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1]!.url).toBe('/consulting/1/close');
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ preview: false, parentNotices: 1 })));
  expect(onClose).toHaveBeenCalled();
});
