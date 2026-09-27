/** @file-guide
 * 목적: 정리 · 기준 › 가산 규칙 (N-93) — 칸 · 금액 · 예약 · 셈에 드는가는 서버 값, 쓰기는 새 줄 하나(소급 없음)만 보낸다.
 * 책임/재사용: 실제 BonusRules/BonusSummary 와 useBonusBook/useWriteBonusRule 을 쓰고 네트워크만 어댑터로 갈아 끼운다. 금액 글자는 lib/money 로 만든다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me, PayoutBonusBook } from '@/api/types';
import { useSession } from '@/store/useSession';
import { won } from '@/lib/money';
import { BonusRules, BonusSummary } from './BonusRules';

const ceo: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};
const KINDER_NOTE = 'Kinder 수업을 가르는 표시가 아직 없어 0원으로 셉니다 — 규칙은 적어 둘 수 있습니다';
const book: PayoutBonusBook = {
  today: '2026-09-27', canWrite: true, rule: '가산은 리포트를 쓴 수업에만 붙습니다',
  slots: [
    { kind: 'per_session', kindKey: 'mock', label: '모의수업', hint: '한 번에 얼마', d1Amount: 15000, currentAmount: 15000, currentFrom: '2026-09-27', nextAmount: null, nextFrom: null, applied: true, note: null },
    { kind: 'per_session', kindKey: 'diagx', label: '진단고사', hint: '한 번에 얼마', d1Amount: 15000, currentAmount: null, currentFrom: null, nextAmount: 20000, nextFrom: '2026-10-01', applied: true, note: null },
    { kind: 'kinder_hourly', kindKey: null, label: 'Kinder 수업', hint: '시급에 더함', d1Amount: 10000, currentAmount: null, currentFrom: null, nextAmount: null, nextFrom: null, applied: false, note: KINDER_NOTE },
    { kind: 'group_per_student', kindKey: null, label: '그룹 학생 한 명 늘 때', hint: '한 명당', d1Amount: 5000, currentAmount: null, currentFrom: null, nextAmount: null, nextFrom: null, applied: true, note: null },
  ],
  rules: [
    { id: 2, kind: 'per_session', kindLabel: '한 번에', kindKey: 'diagx', kindName: '진단고사', amount: 20000, fromDate: '2026-10-01', reason: '10월부터 인상', setByName: '김민선', createdAt: '2026-09-27T10:00:00+09:00', current: false },
    { id: 1, kind: 'per_session', kindLabel: '한 번에', kindKey: 'mock', kindName: '모의수업', amount: 15000, fromDate: '2026-09-27', reason: null, setByName: '김민선', createdAt: '2026-09-27T09:00:00+09:00', current: true },
  ],
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let posts: Array<{ url?: string; body: unknown }> = [];
let gets: string[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); posts = []; gets = [];
});

function setup(ui: ReactNode, o: { data?: PayoutBonusBook; me?: Me; onPost?: () => { status: number; data: unknown } } = {}) {
  useSession.getState().signIn('fixture', o.me ?? ceo);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posts.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const r = o.onPost?.() ?? { status: 201, data: book.rules[0] };
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    gets.push(config.url ?? '');
    return { config, status: 200, statusText: 'OK', headers: {}, data: o.data ?? book };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const flat = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ');

it('칸 넷은 서버 차례 · 낱말 그대로 — 오늘 금액 · 예약 줄 · Kinder 는 셈에 들지 않는 까닭까지 (N-93)', async () => {
  const view = setup(<BonusRules />);
  await waitFor(() => expect(view.getByText('가산은 리포트를 쓴 수업에만 붙습니다')).toBeTruthy());
  expect(gets).toEqual(['/accounting/bonus-rules']);
  const rows = view.getAllByRole('row').map((r) => flat(r));
  const slot = (label: string) => rows.find((r) => r.startsWith(label))!;
  expect(slot('모의수업한 번에 얼마')).toContain(won(15000));
  expect(slot('모의수업한 번에 얼마')).toContain('2026-09-27');
  expect(slot('진단고사한 번에 얼마')).toContain('없음');
  expect(slot('진단고사한 번에 얼마')).toContain(`2026-10-01부터 ${won(20000)}`);
  expect(slot('Kinder 수업시급에 더함')).toContain(KINDER_NOTE);
  expect(slot('그룹 학생 한 명 늘 때한 명당')).toContain('셈에 듦');
  // 적은 줄 — 「한 번에」는 수업 종류 이름이 앞에 선다 · 오늘 붙는 줄은 「지금」
  expect(rows.find((r) => r.startsWith('진단고사 · 한 번에'))).toContain('10월부터 인상');
  expect(rows.find((r) => r.startsWith('모의수업 · 한 번에'))).toContain('지금');
});

it('「새 줄」은 그 칸의 지금 금액(없으면 D1 값)과 오늘로 채워 열고 — 칸 · 금액 · 날짜 · 사유만 보낸다', async () => {
  const view = setup(<BonusRules />);
  await waitFor(() => expect(view.getAllByRole('button', { name: '새 줄' })).toHaveLength(4));
  // 진단고사 — 지금 줄이 없어 D1 값(15,000)으로 채운다(데이터가 아니라 칸의 첫 값)
  fireEvent.click(view.getAllByRole('button', { name: '새 줄' })[1]!);
  const dialog = view.getByRole('dialog', { name: '가산 규칙 — 진단고사' });
  const amount = within(dialog).getByLabelText(/금액/) as HTMLInputElement;
  const from = within(dialog).getByLabelText(/언제부터/) as HTMLInputElement;
  expect(amount.value).toBe('15000');
  expect(from.value).toBe('2026-09-27');
  expect(from.min).toBe('2026-09-27');
  fireEvent.change(amount, { target: { value: '20000' } });
  fireEvent.change(within(dialog).getByLabelText(/사유/), { target: { value: '  인상  ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '새 줄 적기' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toEqual({
    url: '/accounting/bonus-rules',
    body: { kind: 'per_session', kindKey: 'diagx', amount: 20000, fromDate: '2026-09-27', reason: '인상' },
  });
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
});

it('그룹 · Kinder 는 수업 종류를 보내지 않고, Kinder 창은 셈에 들지 않는 까닭을 먼저 말한다 · 거절은 서버 문장 그대로', async () => {
  const view = setup(<BonusRules />, {
    onPost: () => ({ status: 409, data: { code: 'BONUS_SAME_DAY', message: '같은 날짜에 이미 적은 줄이 있습니다 — 다른 날짜로 새 줄을 적으세요' } }),
  });
  await waitFor(() => expect(view.getAllByRole('button', { name: '새 줄' })).toHaveLength(4));
  fireEvent.click(view.getAllByRole('button', { name: '새 줄' })[2]!);
  const kinder = view.getByRole('dialog', { name: '가산 규칙 — Kinder 수업' });
  expect(within(kinder).getByText(KINDER_NOTE)).toBeTruthy();
  expect((within(kinder).getByLabelText(/금액/) as HTMLInputElement).value).toBe('10000');
  fireEvent.click(within(kinder).getByRole('button', { name: '취소 (Esc)' }));
  fireEvent.click(view.getAllByRole('button', { name: '새 줄' })[3]!);
  const group = view.getByRole('dialog', { name: '가산 규칙 — 그룹 학생 한 명 늘 때' });
  fireEvent.click(within(group).getByRole('button', { name: '새 줄 적기' }));
  await waitFor(() => expect(within(group).getByText('같은 날짜에 이미 적은 줄이 있습니다 — 다른 날짜로 새 줄을 적으세요')).toBeTruthy());
  expect(posts[0]!.body).toEqual({ kind: 'group_per_student', amount: 5000, fromDate: '2026-09-27' });
  expect(view.getByRole('dialog')).toBeTruthy();
});

it('적을 수 없으면(canWrite=false) 「새 줄」이 서지 않는다 (D-R39)', async () => {
  const view = setup(<BonusRules />, { data: { ...book, canWrite: false } });
  await waitFor(() => expect(view.getByText('가산 규칙을 적을 권한이 없습니다 — 보기만 합니다.')).toBeTruthy());
  expect(view.queryByRole('button', { name: '새 줄' })).toBeNull();
});

it('강사료 정산의 「추가로 드리는 돈」은 오늘 걸린 값을 읽기만 한다 — 고치는 곳으로 가는 단추 하나 · 권한이 없으면 부르지도 않는다', async () => {
  const onEdit = vi.fn();
  const view = setup(<BonusSummary onEdit={onEdit} />);
  const box = await view.findByRole('region', { name: '추가로 드리는 돈' });
  expect(flat(box)).toContain(`모의수업한 번에 얼마${won(15000)}`);
  expect(flat(box)).toContain('진단고사한 번에 얼마없음');
  expect(flat(box)).toContain(KINDER_NOTE);
  expect(within(box).queryByRole('spinbutton')).toBeNull();
  fireEvent.click(within(box).getByRole('button', { name: '정리 · 기준 › 가산 규칙에서 바꿉니다 ›' }));
  expect(onEdit).toHaveBeenCalledTimes(1);
  cleanup();
  gets = [];
  // 금액 예외로 회계만 보는 사람(canWage 없음) — 규칙 읽기 경로는 canWage 라 부르지 않는다
  const noWage = setup(<BonusSummary />, { me: { ...ceo, canWage: false } });
  await new Promise((r) => setTimeout(r, 0));
  expect(gets).toEqual([]);
  expect(noWage.queryByRole('region', { name: '추가로 드리는 돈' })).toBeNull();
});
