/** @file-guide
 * 목적: §43 안내 작성 — 상태 낱말을 화면이 보내지 않는다 (C51).
 * 책임/재사용: 실제 GuideWriter/useWriteGuideBody 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Guide, GuideTemplate, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { GuideWriter } from './GuideWriter';

const me: Me = {
  id: 1, name: '관리자', role: 'admin', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const guide: Guide = {
  id: 5, reason: 'new', state: 'draft', pending: true, studentName: '고은설',
  teacherName: 'Sophia', serTitle: 'Vocabulary', body: null, dueOn: '2026-09-20',
  createdAt: '2026-09-10', overdueDays: 0,
};

const templates: GuideTemplate[] = [
  { id: 1, name: '첫 수업 안내', body: '안녕하세요. 첫 수업은 9월 10일입니다.' },
  { id: 2, name: '강사 교체 안내', body: '선생님이 바뀌었습니다.' },
];

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let put: { url?: string; body?: unknown } = {};
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); put = {};
});

function setup(fail?: { status: number; data: unknown }) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'put') {
      put = { url: config.url, body: JSON.parse(config.data ?? '{}') };
      if (fail) return Promise.reject(Object.assign(new Error('x'), { response: { status: fail.status, data: fail.data } }));
      return { config, status: 200, statusText: 'OK', headers: {}, data: { ...guide, state: 'ready', body: (put.body as { body: string }).body } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: templates };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  let closed = false;
  const view = render(
    <QueryClientProvider client={client}><GuideWriter guide={guide} onClose={() => { closed = true; }} /></QueryClientProvider>,
  );
  return { view, wasClosed: () => closed };
}

it('보내는 것은 본문뿐이다 — 상태 낱말을 화면이 정하지 않는다 (D-R18)', async () => {
  const { view } = setup();
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '9월 10일 첫 수업입니다' } });
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(put.body).toBeTruthy());
  expect(Object.keys(put.body as object)).toEqual(['body']);
  expect(put.body).toEqual({ body: '9월 10일 첫 수업입니다' });
  expect(put.url).toBe('/guides/5/body');
});

it('문구 틀은 본문만 복사한다 — 어느 틀에서 왔는지는 안 보낸다', async () => {
  const { view } = setup();
  await waitFor(() => expect(view.getByRole('option', { name: '첫 수업 안내' })).toBeTruthy());
  fireEvent.change(view.getByLabelText('문구 틀에서 가져오기'), { target: { value: '1' } });
  expect((view.getByLabelText('안내 본문') as HTMLTextAreaElement).value).toBe(templates[0].body);
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(put.body).toBeTruthy());
  // 틀 id 는 어디에도 없다
  expect(JSON.stringify(put.body)).not.toContain('tpl');
  expect(Object.keys(put.body as object)).toEqual(['body']);
});

it('본문이 비면 작성을 누를 수 없다', () => {
  const { view } = setup();
  expect((view.getByRole('button', { name: '작성' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '내용' } });
  expect((view.getByRole('button', { name: '작성' }) as HTMLButtonElement).disabled).toBe(false);
});

it('거절 이유는 서버 문장을 그대로 보여 주고 창을 닫지 않는다', async () => {
  const { view, wasClosed } = setup({
    status: 409, data: { code: 'GUIDE_ALREADY_SENT', message: '이미 보낸 안내는 고칠 수 없습니다 — 새 안내를 만드세요' },
  });
  fireEvent.change(view.getByLabelText('안내 본문'), { target: { value: '내용' } });
  fireEvent.click(view.getByRole('button', { name: '작성' }));
  await waitFor(() => expect(view.getByText(/이미 보낸 안내/)).toBeTruthy());
  expect(wasClosed()).toBe(false);
});
