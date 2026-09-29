/** @file-guide
 * 목적: §55 「+ 결제 등록」 — 청구서 없이 들어온 돈(A-D1 ②)을 학생·금액·입금일·수단·사유로만 보낸다.
 * 책임/재사용: 실제 ManualPaymentButton/useCreateManualPayment/useMeta 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Payment } from '@/api/types';
import { ManualPaymentButton } from './ManualPaymentForm';

const made: Payment = {
  id: 91, paidOn: '2026-09-21', studentId: 11, studentName: '김하윤', amount: 35000, method: 'transfer',
  reason: '교재비', invId: null, category: 'etc', categoryLabel: '기타',
};
const meta = { students: [{ id: 11, name: '김하윤', grade: '중2' }, { id: 12, name: '이서우', grade: '중1' }] };

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: Record<string, unknown> }> = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; });

function setup(onPost: () => { status: number; data: unknown } = () => ({ status: 201, data: made })) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const r = onPost();
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/meta' ? meta : {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <ManualPaymentButton />
    </QueryClientProvider>,
  );
  return { view };
}

it('학생·금액·입금일·수단·사유만 보낸다 — 청구서 번호도 분류도 화면이 정하지 않는다 (A-D1 ② · N-37 ③)', async () => {
  const { view } = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 결제 등록' }));
  const dialog = await view.findByRole('dialog');
  const submit = within(dialog).getByRole('button', { name: '등록' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  await within(dialog).findByRole('option', { name: '김하윤 · 중2' });
  fireEvent.change(within(dialog).getByLabelText('학생'), { target: { value: '11' } });
  fireEvent.change(within(dialog).getByLabelText('입금일'), { target: { value: '2026-09-21' } });
  fireEvent.change(within(dialog).getByLabelText('금액'), { target: { value: '35000' } });
  // 무엇에 대한 돈인지가 비면 잠긴다 — 청구서가 없으니 사유가 곧 장부의 설명이다
  expect(submit.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('무엇에 대한 돈인가'), { target: { value: '  교재비  ' } });
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({
    url: '/accounting/payments/manual',
    body: {
      studentId: 11, amount: 35000, paidOn: '2026-09-21', method: 'transfer', reason: '교재비',
      requestKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    },
  });
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
});

it('서버 거절 문장은 창 안에 그대로 — 창은 닫히지 않는다', async () => {
  const { view } = setup(() => ({ status: 404, data: { code: 'STUDENT_NOT_FOUND', message: '학생을 찾을 수 없습니다' } }));
  fireEvent.click(view.getByRole('button', { name: '+ 결제 등록' }));
  const dialog = await view.findByRole('dialog');
  await within(dialog).findByRole('option', { name: '이서우 · 중1' });
  fireEvent.change(within(dialog).getByLabelText('학생'), { target: { value: '12' } });
  fireEvent.change(within(dialog).getByLabelText('금액'), { target: { value: '5000' } });
  fireEvent.change(within(dialog).getByLabelText('무엇에 대한 돈인가'), { target: { value: '조정' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  expect(await within(dialog).findByText('학생을 찾을 수 없습니다')).toBeTruthy();
  expect(view.getByRole('dialog')).toBeTruthy();
});

/** 안건 N-132 — 끊긴 응답 뒤 「등록」을 다시 누르면 같은 요청 키(서버가 앞선 줄로 수렴) · 사유를 고치면 새 키 */
it('실패 뒤 같은 내용으로 다시 누르면 같은 요청 키 · 고치면 새 키 (N-132)', async () => {
  const { view } = setup(() => ({ status: 503, data: { code: 'UPSTREAM', message: '잠시 뒤 다시 시도해 주세요' } }));
  fireEvent.click(view.getByRole('button', { name: '+ 결제 등록' }));
  const dialog = await view.findByRole('dialog');
  await within(dialog).findByRole('option', { name: '김하윤 · 중2' });
  fireEvent.change(within(dialog).getByLabelText('학생'), { target: { value: '11' } });
  fireEvent.change(within(dialog).getByLabelText('금액'), { target: { value: '35000' } });
  fireEvent.change(within(dialog).getByLabelText('무엇에 대한 돈인가'), { target: { value: '교재비' } });
  const submit = () => fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  submit();
  await within(dialog).findByText('잠시 뒤 다시 시도해 주세요');
  submit();
  await waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[1].body.requestKey).toBe(posted[0].body.requestKey);
  fireEvent.change(within(dialog).getByLabelText('무엇에 대한 돈인가'), { target: { value: '교재비 2권' } });
  submit();
  await waitFor(() => expect(posted).toHaveLength(3));
  expect(posted[2].body.requestKey).not.toBe(posted[0].body.requestKey);
});
