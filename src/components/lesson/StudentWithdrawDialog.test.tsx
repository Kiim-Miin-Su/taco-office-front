/** @file-guide
 * 목적: §79 「수강 종료」 창 — 미리보기는 서버 값이고 화면은 날짜·범위·사유만 보낸다 (C94-c · H-80).
 * 책임/재사용: 실제 StudentWithdrawDialog/useWithdrawStudent 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { WithdrawResult } from '@/api/types';
import { StudentWithdrawDialog } from './StudentWithdrawDialog';

const preview: WithdrawResult = {
  studentId: 18, studentName: '문채원', endedOn: '2026-10-02', reason: null, preview: true,
  series: [
    { serId: 3, kindKey: 'class', subKey: 'sat-math', title: 'SAT Math', endedOn: '2026-10-02', remainingCount: 3 },
  ],
  invoices: [{ id: 42, yearMonth: '2026-10', title: '2026년 10월 수업료 청구', state: 'paid', amountBefore: 225000, amountAfter: 90000, paidAmount: 90000, refund: 135000, removedCount: 3, voided: false, needsCeoVoid: false }],
  remainingCount: 3, refundTotal: 135000, enrollmentsEnded: 1, canSeeAmounts: true,
  canConfirm: true, confirmBlockedReason: null,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: unknown }> = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; });

function setup(onPost: (url: string) => { status: number; data: unknown } = (url) => ({ status: 201, data: url.endsWith('/preview') ? preview : { ...preview, preview: false } })) {
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
  const onClose = vi.fn();
  const onDone = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <StudentWithdrawDialog open title="수강 종료 — 문채원" student={{ id: 18, name: '문채원' }} serId={3} defaultEndedOn="2026-10-02" onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { view, onClose, onDone };
}

it('여는 순간 서버에 미리 보고, 남은 회차·청구서 변화·환불 합계를 서버 값 그대로 그린다 (D-R37)', async () => {
  const { view } = setup();
  const box = await view.findByLabelText('종료 미리보기');
  const text = (box.textContent ?? '').replace(/\s+/g, ' ');
  expect(posted[0]).toEqual({ url: '/accounting/withdrawals/preview', body: { studentId: 18, endedOn: '2026-10-02', serIds: [3] } });
  expect(text).toContain('10/2까지 수업 · 남은 회차 3회 정리');
  expect(text).toContain('SAT Math');
  expect(text).toContain('남은 3회');
  expect(text).toContain('2026-10 청구서 · 3회 빠짐');
  expect(text).toContain('225,000원 → 90,000원');
  expect(text).toContain('환불 135,000원');
  expect(text).toContain('환불 합계 135,000원');
});

it('범위를 「모든 수업」으로 바꾸면 serIds 없이 다시 묻고, 「수강 종료」는 날짜·범위·사유만 보낸 뒤 닫힌다', async () => {
  const { view, onClose, onDone } = setup();
  await view.findByLabelText('종료 미리보기');
  fireEvent.change(view.getByLabelText('범위'), { target: { value: 'all' } });
  await waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[1]).toEqual({ url: '/accounting/withdrawals/preview', body: { studentId: 18, endedOn: '2026-10-02' } });
  fireEvent.change(view.getByLabelText('사유'), { target: { value: '이사' } });
  const dialog = view.getByRole('dialog');
  await waitFor(() => expect((within(dialog).getByRole('button', { name: '수강 종료' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(dialog).getByRole('button', { name: '수강 종료' }));
  await waitFor(() => expect(posted).toHaveLength(3));
  expect(posted[2]).toEqual({ url: '/accounting/withdrawals', body: { studentId: 18, endedOn: '2026-10-02', reason: '이사' } });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ preview: false, refundTotal: 135000 }));
});

it('컴플레인에서 열면(serId 없음 · C93 · J-99) 범위는 「모든 수업」뿐이고 사유에 컴플레인이 미리 적혀 그대로 보낸다', async () => {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      return { config, status: 201, statusText: 'OK', headers: {}, data: config.url?.endsWith('/preview') ? preview : { ...preview, preview: false } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <StudentWithdrawDialog open title="수강 종료 · 환불 — 문채원" student={{ id: 18, name: '문채원' }} defaultEndedOn="2026-10-02" defaultReason="컴플레인 #9 · 환불을 요구합니다" onClose={vi.fn()} onDone={vi.fn()} />
    </QueryClientProvider>,
  );
  await view.findByLabelText('종료 미리보기');
  expect(posted[0]).toEqual({ url: '/accounting/withdrawals/preview', body: { studentId: 18, endedOn: '2026-10-02' } });
  const scope = view.getByLabelText('범위') as HTMLSelectElement;
  expect(scope.disabled).toBe(true);
  expect([...scope.options].map((o) => o.value)).toEqual(['all']);
  expect((view.getByLabelText('사유') as HTMLTextAreaElement).value).toBe('컴플레인 #9 · 환불을 요구합니다');
  const dialog = view.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '수강 종료' }));
  await waitFor(() => expect(posted).toHaveLength(2));
  expect(posted[1]).toEqual({ url: '/accounting/withdrawals', body: { studentId: 18, endedOn: '2026-10-02', reason: '컴플레인 #9 · 환불을 요구합니다' } });
});

it('서버가 거절하면 그 문장을 그대로 보이고 보낼 수 없다 — 화면이 이유를 짓지 않는다', async () => {
  const { view } = setup(() => ({ status: 409, data: { code: 'WITHDRAW_NOTHING', message: '종료할 수강이 없습니다 — 그 날 뒤에 이 학생이 든 규칙이 없습니다' } }));
  await waitFor(() => expect(view.getByText(/종료할 수강이 없습니다/)).toBeTruthy());
  expect(view.queryByLabelText('종료 미리보기')).toBeNull();
  const dialog = view.getByRole('dialog');
  expect((within(dialog).getByRole('button', { name: '수강 종료' }) as HTMLButtonElement).disabled).toBe(true);
});

/**
 * **청구서가 통째로 비는 종료는 대표만 한다** (N-139 · S2). 화면은 역할을 다시 조합하지 않고
 * 서버가 준 `canConfirm` 과 그 이유 한 줄을 읽는다 — 조합하면 조건이 늘 때마다 두 답이 생긴다 (D-R39).
 */
it('서버가 확정을 닫으면 단추도 닫히고 이유가 선다 — 「대표만 가능」 (S2)', async () => {
  const blocked: WithdrawResult = {
    ...preview,
    invoices: [{ ...preview.invoices[0], amountAfter: 0, voided: true, needsCeoVoid: true }],
    canConfirm: false,
    confirmBlockedReason: '2026-10 청구서가 통째로 비어 취소됩니다 — 청구서 취소는 대표만 할 수 있습니다',
  };
  const { view } = setup((url) => ({ status: 201, data: url.endsWith('/preview') ? blocked : blocked }));
  await view.findByLabelText('종료 미리보기');
  expect(view.getByText(/청구서 취소는 대표만 할 수 있습니다/)).toBeTruthy();
  expect(view.getByText('대표만 가능')).toBeTruthy();
  const dialog = view.getByRole('dialog');
  expect((within(dialog).getByRole('button', { name: '수강 종료' }) as HTMLButtonElement).disabled).toBe(true);
  // 눌러도 보내지 않는다 — 미리보기 한 번뿐이다
  fireEvent.click(within(dialog).getByRole('button', { name: '수강 종료' }));
  expect(posted).toHaveLength(1);
});
