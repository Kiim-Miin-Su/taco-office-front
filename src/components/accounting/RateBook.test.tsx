/** @file-guide
 * 목적: 단가표 — 「살아 있는 줄」은 서버 값이고 창은 종류·과목·인원·단가·날짜(·사유)만 보낸다 (C94-d · H-81 · C-38).
 * 책임/재사용: 실제 RateBook/useWriteRate/useWriteStudentRate/useMeta 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { RateBook as RateBookData } from '@/api/types';
import { RateBook } from './RateBook';

const book: RateBookData = {
  rates: [
    { id: 11, kindKey: 'extra', kindName: '추가 수업', kindExtra: true, subKey: null, subName: null, heads: 1, unitPrice: 75000, fromDate: '2026-02-01', current: true },
    { id: 10, kindKey: 'extra', kindName: '추가 수업', kindExtra: true, subKey: null, subName: null, heads: 1, unitPrice: 70000, fromDate: '2026-01-01', current: false },
    { id: 1, kindKey: 'class', kindName: '수업', kindExtra: false, subKey: 'writing', subName: 'Writing', heads: 2, unitPrice: 33000, fromDate: '2026-01-01', current: true },
  ],
  studentRates: [
    { id: 5, studentId: 7, studentName: '정하람', kindKey: 'class', kindName: '수업', unitPrice: 54000, fromDate: '2026-04-06', reason: '형제 할인', byName: '김민수', createdAt: '2026-04-01T10:00:00+09:00', current: true },
  ],
};
const meta = {
  kinds: [{ key: 'class', name: '수업', extra: false }, { key: 'extra', name: '추가 수업', extra: true }],
  subs: [{ key: 'writing', name: 'Writing' }],
  students: [{ id: 7, name: '정하람', grade: '10' }, { id: 8, name: '윤도현', grade: '11' }],
  rooms: [], zaccs: [], staff: [], invTypes: [], cancelReasons: [], cancelTreats: [],
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: Array<{ url?: string; body: unknown }> = [];
const got: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; got.length = 0; });

function setup(onPost: (url: string) => { status: number; data: unknown } = () => ({ status: 201, data: book.rates[0] })) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const r = onPost(config.url ?? '');
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    got.push(config.url ?? '');
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/meta' ? meta : book };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <RateBook data={book} loading={false} />
    </QueryClientProvider>,
  );
}

it('두 표를 서버 값 그대로 그린다 — 「지금」은 서버의 current 이고 화면이 날짜를 견주지 않는다 · 코드표는 창을 열기 전엔 부르지 않는다', () => {
  const view = setup();
  const rows = view.getAllByRole('row');
  const text = (r: HTMLElement) => (r.textContent ?? '').replace(/\s+/g, ' ');
  // 같은 종류·인원의 두 줄 — 나중 날짜가 「지금」, 지난 줄은 남는다
  const extraRows = rows.filter((r) => text(r).includes('추가 수업'));
  expect(extraRows).toHaveLength(2);
  expect(text(extraRows[0]!)).toContain('75,000원');
  expect(within(extraRows[0]!).getByText('지금')).toBeTruthy();
  expect(text(extraRows[1]!)).toContain('70,000원');
  expect(within(extraRows[1]!).queryByText('지금')).toBeNull();
  expect(text(extraRows[0]!)).toContain('추가');
  // 학생별 예외 — 사유 · 누가
  const stu = rows.find((r) => text(r).includes('정하람'))!;
  expect(text(stu)).toContain('형제 할인');
  expect(text(stu)).toContain('김민수');
  expect(got).not.toContain('/meta');
});

it('「+ 예외 등록」 — 사유가 비면 보낼 수 없고, 채우면 학생·종류·단가·날짜·사유만 보낸다 (H-81)', async () => {
  const view = setup(() => ({ status: 201, data: book.studentRates[0] }));
  fireEvent.click(view.getByRole('button', { name: '+ 예외 등록' }));
  const dialog = await view.findByRole('dialog');
  await waitFor(() => expect(got).toContain('/meta'));
  await waitFor(() => expect(within(dialog).getByRole('option', { name: '정하람 · 10' })).toBeTruthy());
  fireEvent.change(within(dialog).getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(within(dialog).getByLabelText('종류'), { target: { value: 'class' } });
  fireEvent.change(within(dialog).getByLabelText('회당 단가'), { target: { value: '30000' } });
  fireEvent.change(within(dialog).getByLabelText('언제부터'), { target: { value: '2026-10-01' } });
  const submit = within(dialog).getByRole('button', { name: '등록' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('사유'), { target: { value: '형제 할인' } });
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ url: '/accounting/sturates', body: { studentId: 7, kindKey: 'class', unitPrice: 30000, fromDate: '2026-10-01', reason: '형제 할인' } });
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
});

it('「+ 단가 등록」 — 과목을 비우면 subKey 없이 보내고, 서버가 거절하면 그 문장을 그대로 보인다', async () => {
  const view = setup((url) => (url === '/accounting/rates'
    ? { status: 409, data: { code: 'RATE_DUPLICATE', message: '같은 종류·과목·인원에 2026-10-01부터의 단가(70,000원)가 이미 있습니다' } }
    : { status: 201, data: {} }));
  fireEvent.click(view.getByRole('button', { name: '+ 단가 등록' }));
  const dialog = await view.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByRole('option', { name: '추가 수업 · 추가 수업' })).toBeTruthy());
  fireEvent.change(within(dialog).getByLabelText('종류'), { target: { value: 'extra' } });
  fireEvent.change(within(dialog).getByLabelText('회당 단가'), { target: { value: '70000' } });
  fireEvent.change(within(dialog).getByLabelText('언제부터'), { target: { value: '2026-10-01' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ url: '/accounting/rates', body: { kindKey: 'extra', heads: 1, unitPrice: 70000, fromDate: '2026-10-01' } });
  await waitFor(() => expect(within(dialog).getByText(/이미 있습니다/)).toBeTruthy());
});

/**
 * C100 · P-157 — **창은 열 때마다 빈 칸에서 시작한다.**
 *
 * 이 두 창은 목록 옆에 **늘 마운트돼 있어서** 닫아도 상태가 살아 있었다. 성공하면 단가만
 * 지우고 종류·과목·인원·적용일·오류 문구는 남았고, 「취소」로 닫으면 아무것도 안 지워졌다 —
 * 다음에 여는 사람은 **남의 초안 위에** 적게 된다. 창 열다섯이 이미 쓰는 초기화를 같이 쓴다.
 */
it('⭐ 단가 등록 창은 닫았다 다시 열면 앞사람의 초안이 남아 있지 않다', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 단가 등록' }));
  const first = await view.findByRole('dialog');
  await waitFor(() => expect(within(first).getByRole('option', { name: '추가 수업 · 추가 수업' })).toBeTruthy());
  fireEvent.change(within(first).getByLabelText('종류'), { target: { value: 'extra' } });
  fireEvent.change(within(first).getByLabelText('인원'), { target: { value: '3' } });
  fireEvent.change(within(first).getByLabelText('회당 단가'), { target: { value: '70000' } });
  fireEvent.change(within(first).getByLabelText('언제부터'), { target: { value: '2026-10-01' } });
  // **보내지 않고 취소한다** — 성공 갈래는 전부터 단가만 지웠고, 진짜 새는 자리는 이쪽이다
  fireEvent.click(within(first).getByRole('button', { name: '취소 (Esc)' }));
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());

  fireEvent.click(view.getByRole('button', { name: '+ 단가 등록' }));
  const again = await view.findByRole('dialog');
  expect((within(again).getByLabelText('종류') as HTMLSelectElement).value).toBe('');
  expect((within(again).getByLabelText('인원') as HTMLInputElement).value).toBe('1');
  expect((within(again).getByLabelText('회당 단가') as HTMLInputElement).value).toBe('');
  expect(posted).toHaveLength(0);
});

it('⭐ 학생별 예외 창도 마찬가지 — 사유가 남으면 다른 학생에게 남의 사유가 붙는다', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '+ 예외 등록' }));
  const first = await view.findByRole('dialog');
  await waitFor(() => expect(within(first).getByRole('option', { name: /정하람/ })).toBeTruthy());
  fireEvent.change(within(first).getByLabelText('학생'), { target: { value: '7' } });
  fireEvent.change(within(first).getByLabelText('회당 단가'), { target: { value: '54000' } });
  fireEvent.change(within(first).getByLabelText('사유'), { target: { value: '형제 할인' } });
  fireEvent.click(within(first).getByRole('button', { name: '취소 (Esc)' }));
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());

  fireEvent.click(view.getByRole('button', { name: '+ 예외 등록' }));
  const again = await view.findByRole('dialog');
  expect((within(again).getByLabelText('학생') as HTMLSelectElement).value).toBe('');
  expect((within(again).getByLabelText('회당 단가') as HTMLInputElement).value).toBe('');
  expect((within(again).getByLabelText('사유') as HTMLInputElement).value).toBe('');
  expect(posted).toHaveLength(0);
});
