/** @file-guide
 * 목적: §53 청구서 줄의 「전달」·「취소」 — 단추는 서버 판정, 취소는 사유 필수 (C94-a).
 * 책임/재사용: 실제 InvoiceActions/useInvoiceAction 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Invoice } from '@/api/types';
import { InvoiceActions } from './InvoiceActions';

const base: Invoice = {
  id: 42, studentId: 7, studentName: '양찬욱', grade: 'G10', yearMonth: '2026-08',
  title: '2026년 8월 수업료 청구', amount: 250000, paidAmount: 0, state: 'draft', stateLabel: '작성 중',
  issuedOn: '2026-09-12', dueOn: null, paidAt: null, remaining: 250000, overdueDays: 0,
  sentAt: null, canDeliver: true, canVoid: true, voidReason: null, lines: [],
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url: string; body: unknown }> = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; });

function setup(inv: Invoice, status = 201, data: unknown = inv) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url ?? '', body: config.data ? JSON.parse(config.data) : undefined });
      if (status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status, data } }));
      return { config, status, statusText: 'OK', headers: {}, data };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><InvoiceActions invoice={inv} /></QueryClientProvider>);
}

it('「전달」은 서버의 canDeliver 로 서고 누르면 그 줄의 deliver 를 부른다 (H-76)', async () => {
  const v = setup(base);
  fireEvent.click(v.getByRole('button', { name: '전달' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]!.url).toContain('/accounting/invoices/42/deliver');
});

it('「취소」는 사유가 있어야 보내고, 지우지 않고 접는다는 말을 창이 한다 (N-139)', async () => {
  const v = setup(base);
  fireEvent.click(v.getByRole('button', { name: '취소' }));
  const dialog = v.getByRole('dialog', { name: /^청구서 취소 — 양찬욱/ });
  expect(within(dialog).getByText(/지우지 않고 「취소」로 접습니다/)).toBeTruthy();
  const submit = within(dialog).getByRole('button', { name: '청구서 취소' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('취소 사유'), { target: { value: ' 단가를 잘못 넣었다 ' } });
  fireEvent.click(submit);
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ url: expect.stringContaining('/accounting/invoices/42/void'), body: { reason: '단가를 잘못 넣었다' } });
});

it('단추가 둘 다 없으면(대표 아님 · 이미 보냄) 아무것도 그리지 않고, 취소된 줄은 사유를 적는다 (D-R39)', () => {
  const none = setup({ ...base, canDeliver: false, canVoid: false });
  expect(none.queryByRole('button')).toBeNull();
  cleanup();
  const voided = setup({ ...base, state: 'void', stateLabel: '취소', canDeliver: false, canVoid: false, voidReason: '단가를 잘못 넣었다' });
  expect(voided.getByText('취소 · 단가를 잘못 넣었다')).toBeTruthy();
});
