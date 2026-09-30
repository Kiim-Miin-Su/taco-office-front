/** @file-guide
 * 목적: MeetingCreateDialog.test.tsx — §63 회의 잡기 시간 입력·저장 계약 회귀 (UX-13C1)
 * 책임/재사용: 실제 MeetingCreateButton/useCreateMeeting/useMeta 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { MeetingCreateButton } from './MeetingCreateDialog';

const mtTypes = [{ key: 'general', label: '일반 회의' }];
const meta = {
  kinds: [], subs: [], staff: [{ id: 3, name: '김범준' }],
  rooms: [{ id: 7, name: '본원 상담실' }], students: [], zaccs: [],
  invTypes: [], cancelReasons: [], cancelTreats: [],
};
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: unknown }> = [];
const got: string[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((client) => client.clear());
  api.defaults.adapter = originalAdapter; posted.length = 0; got.length = 0;
});

function setup({ can = true, conflict = false }: { can?: boolean; conflict?: boolean } = {}) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      if (conflict) return Promise.reject(Object.assign(new Error('conflict'), {
        response: { status: 409, data: { code: 'RESOURCE_CONFLICT', message: '같은 시간에 주관자·강의실이 이미 잡혀 있습니다' } },
      }));
      return { config, status: 201, statusText: 'Created', headers: {}, data: { meeting: { id: 42 }, attendees: 1, unavailable: [] } };
    }
    got.push(config.url ?? '');
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/meta' ? meta : {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const view = render(<QueryClientProvider client={client}>
    <MeetingCreateButton mtTypes={mtTypes} can={can} onDone={onDone} />
  </QueryClientProvider>);
  return { view, onDone };
}

async function openReady(options: { conflict?: boolean } = {}) {
  const { view, onDone } = setup(options);
  fireEvent.click(view.getByRole('button', { name: '+ 회의 잡기' }));
  const dialog = await view.findByRole('dialog', { name: '회의 잡기' });
  await waitFor(() => expect(within(dialog).getByRole('option', { name: '본원 상담실' })).toBeTruthy());
  fireEvent.change(within(dialog).getByLabelText('날짜'), { target: { value: '2026-10-03' } });
  fireEvent.change(within(dialog).getByLabelText('강의실'), { target: { value: '7' } });
  return { view, dialog, onDone };
}

it('권한이 없으면 회의 잡기 단추와 meta 질의가 없다', () => {
  const { view } = setup({ can: false });
  expect(view.queryByRole('button', { name: '+ 회의 잡기' })).toBeNull();
  expect(got).toEqual([]);
});

it('UX-13C1 — 시각 둘은 1분 단위 선택기이고, 24:00 종료는 출력과 1440분으로 저장된다', async () => {
  const { dialog, onDone } = await openReady();
  const start = within(dialog).getByLabelText('시작') as HTMLInputElement;
  const end = within(dialog).getByLabelText('끝') as HTMLInputElement;
  expect(start.type).toBe('time');
  expect(end.type).toBe('time');
  expect(start.step).toBe('60');
  expect(end.step).toBe('60');
  fireEvent.change(start, { target: { value: '23:00' } });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: '24:00 (자정에 종료)' }));
  expect(end.hidden).toBe(true);
  expect(end.tabIndex).toBe(-1);
  expect(within(dialog).getByRole('status', { name: '끝 시각' }).textContent).toBe('24:00');
  fireEvent.click(within(dialog).getByRole('button', { name: '회의 잡기' }));
  await waitFor(() => expect(posted).toEqual([{ url: '/ops/meetings', body: {
    mtType: 'general', onDate: '2026-10-03', startMin: 1380, endMin: 1440, mode: 'offline', roomId: 7,
  } }]));
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ meeting: { id: 42 } })));
});

it('UX-13C1 — 00:00 시작은 허용하고 24:00 선택 해제 시 종료를 다시 고르게 한다', async () => {
  const { dialog } = await openReady();
  const start = within(dialog).getByLabelText('시작') as HTMLInputElement;
  const end = within(dialog).getByLabelText('끝') as HTMLInputElement;
  fireEvent.change(start, { target: { value: '00:00' } });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: '24:00 (자정에 종료)' }));
  expect((within(dialog).getByRole('button', { name: '회의 잡기' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole('checkbox', { name: '24:00 (자정에 종료)' }));
  expect(end.hidden).toBe(false);
  expect(end.value).toBe('');
  fireEvent.change(end, { target: { value: '00:10' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '회의 잡기' }));
  await waitFor(() => expect(posted).toEqual([{ url: '/ops/meetings', body: {
    mtType: 'general', onDate: '2026-10-03', startMin: 0, endMin: 10, mode: 'offline', roomId: 7,
  } }]));
});

it('UX-13C1 — 역순·9분·8시간 초과는 POST 전에 막고, 경계 10분은 허용한다', async () => {
  const { dialog } = await openReady();
  const start = within(dialog).getByLabelText('시작') as HTMLInputElement;
  const end = within(dialog).getByLabelText('끝') as HTMLInputElement;
  const submit = within(dialog).getByRole('button', { name: '회의 잡기' }) as HTMLButtonElement;
  for (const [s, e] of [['10:00', '09:59'], ['10:00', '10:09'], ['10:00', '18:01']]) {
    fireEvent.change(start, { target: { value: s } });
    fireEvent.change(end, { target: { value: e } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(posted).toHaveLength(0);
  }
  fireEvent.change(end, { target: { value: '10:10' } });
  expect(submit.disabled).toBe(false);
});

it('UX-13C1 — 겹침 409 문장을 그대로 보이며 자정 종료 선택과 폼을 유지한다', async () => {
  const { view, dialog, onDone } = await openReady({ conflict: true });
  fireEvent.change(within(dialog).getByLabelText('시작'), { target: { value: '23:00' } });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: '24:00 (자정에 종료)' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '회의 잡기' }));
  await waitFor(() => expect(within(dialog).getByText('같은 시간에 주관자·강의실이 이미 잡혀 있습니다')).toBeTruthy());
  expect(view.getByRole('dialog', { name: '회의 잡기' })).toBeTruthy();
  expect((within(dialog).getByRole('checkbox', { name: '24:00 (자정에 종료)' }) as HTMLInputElement).checked).toBe(true);
  expect(onDone).not.toHaveBeenCalled();
});
