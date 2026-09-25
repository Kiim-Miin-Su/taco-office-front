/** @file-guide
 * 목적: §59 「+ 오늘 한 것」 — 화면은 무엇을·어디에·항목·URL·날짜·담당만 보내고 기본값(오늘·나)은 서버가 정한다 (x5 · 59-3).
 * 책임/재사용: 실제 MarketingCreateButton/useCreateMarketing/useMeta 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { MarketingCreateButton } from './MarketingCreateDialog';

const meta = {
  kinds: [], subs: [], staff: [{ id: 3, name: '김범준', role: 'manager', canAdminPage: true, canGpaPack: false, title: null }],
  rooms: [], students: [], zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [],
};
const channels = [{ key: 'instagram', label: '인스타그램' }, { key: 'naver', label: '네이버' }];
const items = [{ key: 'video', label: '영상' }, { key: 'blog', label: '블로그 글' }];

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: unknown }> = [];
const got: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; got.length = 0; });

function setup({ can = true, status = 201 }: { can?: boolean; status?: number } = {}) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      if (status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status, data: { code: 'STAFF_NOT_FOUND', message: '그 담당자를 찾을 수 없습니다' } } }));
      return { config, status, statusText: 'OK', headers: {}, data: { id: 99, title: '학습실 하루', channel: 'instagram', channelLabel: '인스타그램', item: 'video', itemLabel: '영상' } };
    }
    got.push(config.url ?? '');
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/meta' ? meta : {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <MarketingCreateButton channels={channels} items={items} can={can} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { view, onDone };
}

it('서버가 열지 않으면 단추가 없고 코드표도 읽지 않는다 (D-R39)', () => {
  const { view } = setup({ can: false });
  expect(view.queryByRole('button', { name: '+ 오늘 한 것' })).toBeNull();
  expect(got).toEqual([]);
});

it('무엇을·어디에·항목이 있어야 「적기」가 서고, 비운 날짜·담당은 보내지 않는다 — 기본값은 서버가 정한다', async () => {
  const { view, onDone } = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 오늘 한 것' }));
  const dialog = await view.findByRole('dialog');
  const submit = within(dialog).getByRole('button', { name: '적기' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(within(dialog).getByText('무엇을 했는지 적어 주세요')).toBeTruthy();
  // 채널·항목 선택지는 받은 낱말 그대로다 (D-R18)
  expect([...(within(dialog).getByLabelText('어디에') as HTMLSelectElement).options].map((o) => o.textContent))
    .toEqual(['고르세요', '인스타그램', '네이버']);
  fireEvent.change(within(dialog).getByLabelText('무엇을'), { target: { value: '  학습실 하루  ' } });
  fireEvent.change(within(dialog).getByLabelText('어디에'), { target: { value: 'instagram' } });
  expect(submit.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('항목'), { target: { value: 'video' } });
  fireEvent.change(within(dialog).getByLabelText('URL'), { target: { value: ' https://instagram.com/p/x5 ' } });
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ url: '/ops/marketing', body: { title: '학습실 하루', channel: 'instagram', item: 'video', url: 'https://instagram.com/p/x5' } });
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 99 })));
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
});

it('날짜·담당을 고르면 그대로 보내고, 서버가 거절한 문장을 그대로 띄우며 창은 닫지 않는다', async () => {
  const { view, onDone } = setup({ status: 404 });
  fireEvent.click(view.getByRole('button', { name: '+ 오늘 한 것' }));
  const dialog = await view.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByRole('option', { name: '김범준' })).toBeTruthy());
  fireEvent.change(within(dialog).getByLabelText('무엇을'), { target: { value: '블로그 후기' } });
  fireEvent.change(within(dialog).getByLabelText('어디에'), { target: { value: 'naver' } });
  fireEvent.change(within(dialog).getByLabelText('항목'), { target: { value: 'blog' } });
  fireEvent.change(within(dialog).getByLabelText('날짜'), { target: { value: '2026-09-20' } });
  fireEvent.change(within(dialog).getByLabelText('담당'), { target: { value: '3' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '적기' }));
  await waitFor(() => expect(within(dialog).getByText('그 담당자를 찾을 수 없습니다')).toBeTruthy());
  expect(posted[0]).toEqual({ url: '/ops/marketing', body: { title: '블로그 후기', channel: 'naver', item: 'blog', onDate: '2026-09-20', byId: 3 } });
  expect(onDone).not.toHaveBeenCalled();
  expect(view.getByRole('dialog')).toBeTruthy();
});
