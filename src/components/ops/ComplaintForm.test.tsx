/** @file-guide
 * 목적: §67 「+ 접수」 — 화면은 갈래·학생·내용·담당·기한·심각도만 보내고 상태는 보내지 않는다 (C93 · J-96 · J-98).
 * 책임/재사용: 실제 ComplaintCreateButton/useCreateComplaint/useMeta 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { ComplaintCreateButton } from './ComplaintForm';

const meta = {
  kinds: [], subs: [], staff: [{ id: 3, name: '김범준', role: 'manager', canAdminPage: true, canGpaPack: false, title: null }],
  rooms: [], students: [{ id: 7, name: '정하람', grade: '10' }], zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [],
};
const areas = [{ key: 'lesson', label: '수업' }, { key: 'teacher', label: '선생님' }];
const severities = [{ key: 'light', label: '가벼움' }, { key: 'normal', label: '보통' }, { key: 'severe', label: '심각' }];

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: unknown }> = [];
const got: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; got.length = 0; });

function setup(status = 201) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      if (status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status, data: { code: 'STUDENT_NOT_FOUND', message: '그 학생을 찾을 수 없습니다' } } }));
      return { config, status, statusText: 'OK', headers: {}, data: { id: 9, area: 'lesson', areaLabel: '수업', studentName: '정하람', stage: 'received', body: 'x', createdAt: '2026-09-18', ageDays: 0, overdueDays: 0, teacherChanged: false, ownerName: '김범준' } };
    }
    got.push(config.url ?? '');
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/meta' ? meta : {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const view = render(<QueryClientProvider client={client}><ComplaintCreateButton areas={areas} severities={severities} onDone={onDone} /></QueryClientProvider>);
  return { view, onDone };
}

it('갈래·내용이 있어야 「접수」가 서고, 보내는 몸통은 갈래·학생·내용·담당·기한·심각도뿐이다 — 상태는 없다 (J-96 · J-98)', async () => {
  const { view, onDone } = setup();
  expect(got).toEqual([]); // 단추만 있을 때는 코드표를 안 읽는다
  fireEvent.click(view.getByRole('button', { name: '+ 접수' }));
  const dialog = await view.findByRole('dialog');
  await waitFor(() => expect(got).toContain('/meta'));
  const submit = within(dialog).getByRole('button', { name: '접수' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('갈래'), { target: { value: 'lesson' } });
  fireEvent.change(within(dialog).getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(within(dialog).getByLabelText('내용'), { target: { value: '  진도가 느립니다  ' } });
  fireEvent.change(within(dialog).getByLabelText('담당'), { target: { value: '3' } });
  fireEvent.change(within(dialog).getByLabelText('대응 기한'), { target: { value: '2026-09-25' } });
  fireEvent.click(within(within(dialog).getByRole('group', { name: '심각도' })).getByRole('button', { name: '심각' }));
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ url: '/ops/complaints', body: { area: 'lesson', studentId: 7, body: '진도가 느립니다', ownerId: 3, dueOn: '2026-09-25', severity: 'severe' } });
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })));
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
});

it('서버가 거절하면 그 문장을 그대로 띄우고 창은 남는다', async () => {
  const { view } = setup(404);
  fireEvent.click(view.getByRole('button', { name: '+ 접수' }));
  const dialog = await view.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('갈래'), { target: { value: 'teacher' } });
  fireEvent.change(within(dialog).getByLabelText('내용'), { target: { value: '강사를 바꿔 주세요' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '접수' }));
  await waitFor(() => expect(view.getByText('그 학생을 찾을 수 없습니다')).toBeTruthy());
  expect(posted[0]!.body).toEqual({ area: 'teacher', body: '강사를 바꿔 주세요' });
  expect(view.getByRole('dialog')).toBeTruthy();
});
