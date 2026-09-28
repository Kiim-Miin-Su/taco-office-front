/** @file-guide
 * 목적: MyExpenses.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Expense, FileRef, MyExpenseList } from '@/api/types';
import { MyExpenses } from './MyExpenses';

/**
 * N-52 — 서랍 「내 지출 신청」: 본인 것만 주는 경로(GET /accounting/expenses/mine)를 그리고,
 * 「+ 지출 신청」은 회계 탭과 같은 창 · 같은 본문(POST /accounting/expenses)이다.
 */
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); });

const receipt: FileRef = {
  id: 88, kind: 'expense-receipt', name: '문구점.png', mime: 'image/png', bytes: 4,
  url: '/files/88', uploaderName: '김범준', uploadedAt: '2026-09-20T10:00:00+09:00',
};
const expense = (over: Partial<Expense>): Expense => ({
  id: 1, spendOn: '2026-09-20', category: 'supply', categoryLabel: '소모품', merchant: '문구점', purpose: '마커',
  requestedAmount: 12000, amount: null, reason: null, hasReceipt: true, receiptFile: null, requesterName: '김범준', requesterId: 3,
  filedById: 3, filedByName: '김범준', state: 'pending', reviewerName: null, reviewedAt: null, ...over,
});
const list: MyExpenseList = {
  items: [
    expense({ receiptFile: receipt }),
    expense({ id: 2, state: 'approved', amount: 10000, reason: '영수증 금액대로', merchant: '서점', categoryLabel: '교재' }),
    expense({ id: 3, state: 'rejected', reason: '개인 물품입니다', merchant: '카페' }),
  ],
  categories: [{ key: 'supply', label: '소모품' }, { key: 'book', label: '교재' }],
};

function paint(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MyExpenses summary={{ total: 3, pending: 1, rejected: 1 }} enabled={enabled} />
    </QueryClientProvider>,
  );
}

it('닫혀 있으면 읽지 않는다 — 머리 건수는 서랍이 센 값이다', () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: list } as never);
  const view = paint(false);
  expect(get).not.toHaveBeenCalled();
  expect(view.getByRole('region', { name: '내 지출 신청' }).textContent).toContain('심사 대기 1 · 반려 1');
});

it('본인 신청을 상태 · 신청 금액 · 확정 금액 · 사유와 함께 그린다', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: list } as never);
  const view = paint();
  await waitFor(() => expect(view.getAllByRole('listitem')).toHaveLength(3));
  expect(get).toHaveBeenCalledWith('/accounting/expenses/mine');
  const [pending, approved, rejected] = view.getAllByRole('listitem');
  expect(pending!.textContent).toContain('심사 대기');
  expect(approved!.textContent).toContain('→');
  expect(approved!.textContent).toContain('승인');
  expect(rejected!.textContent).toContain('반려');
  expect(rejected!.textContent).toContain('사유 — 개인 물품입니다');
  expect(pending!.textContent).not.toContain('사유');
  expect(within(pending!).getByRole('button', { name: '영수증 열기' })).toBeTruthy();
  expect(within(approved!).queryByRole('button', { name: '영수증 열기' })).toBeNull();
});

it('「+ 지출 신청」은 회계 탭과 같은 창이고 본문도 같다 — 상태 · 확정 금액을 보내지 않는다', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: list } as never);
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: expense({ id: 9 }) } as never);
  const view = paint();
  fireEvent.click(await view.findByRole('button', { name: '+ 지출 신청' }));
  const dialog = view.getByRole('dialog', { name: '지출 신청' });
  fireEvent.change(within(dialog).getByLabelText('신청 금액'), { target: { value: '8000' } });
  fireEvent.change(within(dialog).getByLabelText('가맹점'), { target: { value: '문구점' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '신청' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/accounting/expenses', expect.objectContaining({
    category: 'supply', requestedAmount: 8000, merchant: '문구점',
  })));
  const body = post.mock.calls[0]![1] as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(['category', 'merchant', 'requestedAmount', 'spendOn']);
});
