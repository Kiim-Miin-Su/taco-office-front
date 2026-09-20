/** @file-guide
 * 목적: §31 「+ 회차 기록」 창 — 날짜 여러 개를 보내고 순번·연결·「한 회차」는 서버 미리보기를 그대로 그리며, 미리 본 뒤에만 확정이 선다 (C95 · I-91).
 * 책임/재사용: 실제 ConsultingSessionDialog/useAddConsultingSessions/useMeta 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { ConsSessionsResult, ConsultingDetail } from '@/api/types';
import { ConsultingSessionDialog } from './ConsultingSessionDialog';

const meta = {
  kinds: [], subs: [], staff: [
    { id: 3, name: '김범준', role: 'manager', canAdminPage: true, canGpaPack: false, title: null },
    { id: 7, name: '김재훈', role: 'teacher', canAdminPage: false, canGpaPack: false, title: null },
  ],
  rooms: [], students: [], zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [],
};
const detail = {
  id: 1, consType: 'admissions', consTypeLabel: '국제학교 지원', stage: 'running', contractStep: 5,
  studentIds: [5], studentNames: ['오예린'], requester: 'mother', ownerId: 3, ownerName: '김범준',
  startOn: '2026-07-08', endOn: '2027-01-31', amount: 8400000, sessions: 13,
  share: 'money_only', pickedStaffIds: [], pickedStaffNames: [], createdAt: '2026-07-08T00:00:00+09:00',
  typeCapability: { defaultItemsSupported: true, reason: null, scheduleCreationSupported: false, scheduleCreationReason: '약정 회차만 저장' },
  capabilities: {
    canEdit: false, canChangeShare: false, canSetPrivate: false, canAddContractFile: false, canRemoveContractFile: false, canAddFeedback: false, canResolveFeedback: false,
    canDeliver: false, canAddSignedFile: false, canAddPayment: false, canCreateInvoice: false, canArchive: true,
    externalParentSendSupported: false, externalParentSendReason: null,
    canAddSession: true, canClose: false, closeBlockedReason: '약정 13회 중 8회를 했습니다 — 남은 5회를 마쳐야 종료할 수 있습니다 (예외 종료는 N-18-a)',
  },
  contractFiles: [], signedFiles: [], feedback: [], delivery: null, payment: { paid: 4400000, due: 4000000, invoiceId: null },
  sessionsDone: 8, sessionsPlanned: 0, requiredLeft: 3, closedAt: null, closedByName: null,
} satisfies ConsultingDetail;
const result: ConsSessionsResult = {
  preview: true, consId: 1, staffId: 3, staffName: '김범준', studentNames: ['오예린'],
  rows: [
    { date: '2026-09-23', seq: 9, sessId: 91, serId: 12, linked: true, startMin: 1020, endMin: 1110, done: false, todoId: 71 },
    { date: '2026-09-25', seq: 10, sessId: 92, serId: 88, linked: false, startMin: 600, endMin: 660, done: false, todoId: 72 },
  ],
  created: 1, linked: 1, sessionsDone: 8, sessionsPlanned: 2, sessions: 13, overContract: false, unavailable: [], notified: false,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posts: Array<{ url?: string; body: unknown }> = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posts.length = 0; });

function setup() {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posts.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const preview = config.url?.endsWith('/preview') ?? false;
      return { config, status: 201, statusText: 'Created', headers: {}, data: { ...result, preview } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/meta' ? meta : {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const onClose = vi.fn();
  const view = render(<QueryClientProvider client={client}><ConsultingSessionDialog open detail={detail} onClose={onClose} onDone={onDone} /></QueryClientProvider>);
  return { view, onDone, onClose };
}

it('날짜 둘·시각·담당(기본 = 건의 담당)을 보내고, 순번·연결·「앞으로」는 서버 미리보기 그대로 그리며, 미리 본 뒤에만 「회차 확정」이 선다 (I-91)', async () => {
  const { view, onDone, onClose } = setup();
  const dialog = await view.findByRole('dialog', { name: '회차 기록 — 오예린' });
  await waitFor(() => expect(within(dialog).getByRole('option', { name: '김범준' })).toBeTruthy());
  expect((within(dialog).getByLabelText('담당') as HTMLSelectElement).value).toBe('3'); // 건의 담당이 기본
  const confirm = within(dialog).getByRole('button', { name: '회차 확정' }) as HTMLButtonElement;
  const preview = within(dialog).getByRole('button', { name: '미리 보기' }) as HTMLButtonElement;
  expect(preview.disabled).toBe(true); // 날짜가 없다
  fireEvent.change(within(dialog).getByLabelText('날짜 1'), { target: { value: '2026-09-25' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '+ 날짜 더하기' }));
  fireEvent.change(within(dialog).getByLabelText('날짜 2'), { target: { value: '2026-09-23' } });
  fireEvent.change(within(dialog).getByLabelText('시작'), { target: { value: '10:00' } });
  expect(preview.disabled).toBe(true); // 끝이 없다 — 시작과 끝은 함께
  fireEvent.change(within(dialog).getByLabelText('끝'), { target: { value: '11:00' } });
  expect(preview.disabled).toBe(false);
  expect(confirm.disabled).toBe(true); // 아직 미리 보지 않았다
  fireEvent.click(preview);
  await waitFor(() => expect(posts).toHaveLength(1));
  // 날짜는 오름차순으로 · 시각은 분으로 · 담당은 숫자로 — 순번은 보내지 않는다
  expect(posts[0]).toEqual({ url: '/consulting/1/sessions/preview', body: { dates: ['2026-09-23', '2026-09-25'], staffId: 3, mode: 'offline', startMin: 600, endMin: 660 } });
  const box = await within(dialog).findByLabelText('회차 미리보기');
  const text = (box.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('9회차');
  expect(text).toContain('9/23 17:00–18:30');
  expect(text).toContain('시간표 회차에 연결');
  expect(text).toContain('10회차');
  expect(text).toContain('새 회차');
  expect(text).toContain('회차 8 / 약정 13 · 잡힌 날짜 2');
  await waitFor(() => expect((within(dialog).getByRole('button', { name: '회차 확정' }) as HTMLButtonElement).disabled).toBe(false));
  // 날짜를 고치면 다시 잠긴다 — 지금 입력 그대로 미리 본 것만 확정한다
  fireEvent.change(within(dialog).getByLabelText('날짜 2'), { target: { value: '2026-09-24' } });
  expect((within(dialog).getByRole('button', { name: '회차 확정' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('날짜 2'), { target: { value: '2026-09-23' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '회차 확정' }));
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1]!.url).toBe('/consulting/1/sessions');
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ preview: false, created: 1, linked: 1 })));
  expect(onClose).toHaveBeenCalled();
});
