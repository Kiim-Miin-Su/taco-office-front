/** @file-guide
 * 목적: §56 「+ 지출 등록」 — 상태·확정 금액은 보내지 않고 영수증은 파일부터 올린다 (C94-d · H-83).
 * 책임/재사용: 실제 ExpenseCreateButton/useCreateExpense/useUploadFile 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Expense, ExpenseCategory } from '@/api/types';
import { ExpenseCreateButton } from './ExpenseForm';

const categories: ExpenseCategory[] = [{ key: 'supply', label: '소모품비' }, { key: 'book', label: '도서·교재비' }];
const made: Expense = {
  id: 31, spendOn: '2026-09-18', category: 'supply', categoryLabel: '소모품비', merchant: '문구점', purpose: '마커',
  requestedAmount: 35000, amount: null, reason: null, hasReceipt: false, requesterName: '강민지', requesterId: 4, state: 'pending', reviewerName: null, reviewedAt: null,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: Record<string, unknown> }> = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; });

function setup(onPost: (url: string) => { status: number; data: unknown } = () => ({ status: 201, data: made })) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const r = onPost(config.url ?? '');
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <ExpenseCreateButton categories={categories} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { view, onDone };
}

it('사용일·분류·가맹점·용도·신청 금액만 보낸다 — 상태도 확정 금액도 화면이 정하지 않는다 (H-83)', async () => {
  const { view, onDone } = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 지출 등록' }));
  const dialog = await view.findByRole('dialog');
  const submit = within(dialog).getByRole('button', { name: '등록' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('사용일'), { target: { value: '2026-09-18' } });
  fireEvent.change(within(dialog).getByLabelText('분류'), { target: { value: 'book' } });
  fireEvent.change(within(dialog).getByLabelText('가맹점'), { target: { value: '문구점' } });
  fireEvent.change(within(dialog).getByLabelText('용도'), { target: { value: '마커' } });
  fireEvent.change(within(dialog).getByLabelText('신청 금액'), { target: { value: '35000' } });
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ url: '/accounting/expenses', body: { spendOn: '2026-09-18', category: 'book', merchant: '문구점', purpose: '마커', requestedAmount: 35000 } });
  expect(Object.keys(posted[0]!.body)).not.toContain('state');
  expect(Object.keys(posted[0]!.body)).not.toContain('amount');
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 31, state: 'pending' })));
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
});

it('영수증을 고르면 파일을 먼저 올리고 그 id 로 지출을 가리킨다 · 서버가 거절하면 그 문장을 보인다', async () => {
  const { view } = setup((url) => (url === '/files'
    ? { status: 201, data: { id: 77, kind: 'expense-receipt', name: '영수증.png', mime: 'image/png', bytes: 3, url: '/files/77', uploadedAt: '2026-09-18T10:00:00+09:00' } }
    : { status: 409, data: { code: 'EXPENSE_RECEIPT_USED', message: '그 영수증은 이미 지출 #30 에 붙어 있습니다' } }));
  fireEvent.click(view.getByRole('button', { name: '+ 지출 등록' }));
  const dialog = await view.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('신청 금액'), { target: { value: '1000' } });
  // jsdom 의 File 에는 arrayBuffer 가 없다 — 변환은 lib/file-upload 회귀가 따로 본다
  const file = { name: '영수증.png', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as File;
  fireEvent.change(within(dialog).getByLabelText('영수증'), { target: { files: [file] } });
  fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  await waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[0]!.url).toBe('/files');
  expect(posted[0]!.body).toMatchObject({ kind: 'expense-receipt', name: '영수증.png' });
  expect(posted[1]).toEqual({ url: '/accounting/expenses', body: { spendOn: expect.any(String), category: 'supply', requestedAmount: 1000, receiptFileId: 77 } });
  await waitFor(() => expect(within(dialog).getByText(/이미 지출 #30/)).toBeTruthy());
});
