/** @file-guide
 * 목적: §56 강사료 계산 · 지급 확정 — 왼쪽 카드 · 오른쪽 상세 · 합계 카드. 화면은 세지 않고 서버 판정(canConfirm)만 따른다 (C94-b · w5 56-01 · 56-02 · 56-05).
 * 책임/재사용: 실제 PayoutSheet/useConfirmPayout/usePayoutDetail 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Me, PayoutDetail, PayoutSheet as PayoutSheetData, PayoutSheetRow } from '@/api/types';
import { useSession } from '@/store/useSession';
import { MASKED, won } from '@/lib/money';
import { PayoutSheet } from './PayoutSheet';

const me: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};

const row: PayoutSheetRow = {
  staffId: 7, staffName: '김재훈', yearMonth: '2026-08',
  writtenCount: 9, writtenMinutes: 810, unwrittenCount: 2, unwrittenMinutes: 120,
  canceledCount: 1, naCount: 2, noRateCount: 0,
  gross: 540000, lateCut: 10000, incomeTax: 15900, localTax: 1590, net: 512510, unwrittenAmount: 80000,
  saved: true, savedDiffers: true, savedNet: 386800,
  confirmed: false, confirmedAt: null, confirmedBy: null, canConfirm: true,
  correctionCount: 0, correctionMinutes: 0, lateCount: 0, bonus: 0, amountsHidden: false, confirmBlockedReason: null,
};
const sheet: PayoutSheetData = {
  month: '2026-08', today: '2026-09-18', monthEnded: true, rows: [row, { ...row, staffId: 8, staffName: '이다현', unwrittenCount: 0, unwrittenMinutes: 0, unwrittenAmount: 0, canConfirm: false, confirmed: true, confirmedAt: '2026-09-03T02:00:00.000Z', confirmedBy: '김민선', savedDiffers: false }],
  unwrittenCount: 2, netTotal: 1025020, canSeeAmounts: true,
  // 합계 카드 — 줄의 합을 서버가 낸 값 (화면은 더하지 않는다)
  writtenMinutes: 1620, unwrittenMinutes: 120, grossTotal: 1080000, lateCutTotal: 20000, taxTotal: 34980,
  bonusTotal: 0, correctionCount: 0, amountsHidden: false,
};
/** 자습 감독뿐인 사람 — 쓴 것도 안 쓴 것도 없다 */
const nothingRow: PayoutSheetRow = {
  ...row, staffId: 9, staffName: '강민지', writtenCount: 0, writtenMinutes: 0, unwrittenCount: 0, unwrittenMinutes: 0, unwrittenAmount: 0,
  canceledCount: 0, naCount: 3, gross: 0, lateCut: 0, incomeTax: 0, localTax: 0, net: 0, saved: false, savedDiffers: false, savedNet: null, canConfirm: false,
};
const detailOf = (r: PayoutSheetRow): PayoutDetail => ({
  staffId: r.staffId, staffName: r.staffName, month: '2026-08', row: r,
  rates: [{ fromDate: '2026-01-01', rate: r.gross === null ? null : 60000 }],
  lessons: [
    { serId: 11, onDate: '2026-08-20', date: '2026-08-20', startMin: 900, durMin: 90, name: 'SAT Math', students: '김하윤', studentCount: 1, canceled: false, settle: 'unwritten', settleLabel: '리포트 미작성', pay: null, lateCut: null,
      bonus: null, unitRate: null, correctionOf: null, paidIn: null, frozen: false },
    { serId: 11, onDate: '2026-08-13', date: '2026-08-13', startMin: 900, durMin: 90, name: 'SAT Math', students: '김하윤', studentCount: 1, canceled: false, settle: 'written', settleLabel: '리포트 씀', pay: r.gross === null ? null : 90000, lateCut: r.gross === null ? null : 5000,
      bonus: r.gross === null ? null : 0, unitRate: r.gross === null ? null : 60000, correctionOf: null, paidIn: null, frozen: false },
  ],
});

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let posted: { url?: string; body: unknown } | null = null;
let gets: Array<{ url?: string; params?: Record<string, string> }> = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); posted = null; gets = [];
});

function setup(
  data: PayoutSheetData = sheet,
  onPost: () => { status: number; data: unknown } = () => ({ status: 201, data: { ...row, confirmed: true, canConfirm: false, confirmedBy: '대표', savedDiffers: false } }),
  detailFor: (r: PayoutSheetRow) => PayoutDetail = detailOf,
  below?: ReactNode,
) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string; params?: Record<string, string> }) => {
    if (config.method === 'post') {
      posted = { url: config.url, body: JSON.parse(config.data ?? '{}') };
      const r = onPost();
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    gets.push({ url: config.url, params: config.params });
    // 상세 — 그 사람의 줄은 시트의 그 줄 그대로다 (같은 함수가 셌다)
    const m = /^\/accounting\/payouts\/(\d+)$/.exec(config.url ?? '');
    const hit = m ? data.rows.find((r) => r.staffId === Number(m[1])) : undefined;
    return { config, status: 200, statusText: 'OK', headers: {}, data: hit ? detailFor(hit) : data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <PayoutSheet data={data} month={data.month} onMonthChange={() => {}} below={below} />
    </QueryClientProvider>,
  );
  return view;
}

const flat = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ');

it('왼쪽 카드와 합계 카드는 서버가 센 수를 그대로 그린다 — 고르기 전에는 오른쪽이 빈 안내다 (56-01 · 56-02 · D-R37)', () => {
  const view = setup();
  const text = flat(view.container);
  expect(text).toContain('8월 강사료 정산');
  expect(text).toContain('미작성 2건 빠짐');
  expect(text).toContain('선생님 2명 · 눌러서 자세히');
  // 원문 카드 모양 — 「3번 · 3.8시간 · 못 드림 5h」 · 「리포트 −5,000」 · 금액 · 「자세히 ›」
  const card = view.getByRole('button', { name: '김재훈 자세히 보기' });
  expect(flat(card)).toContain('9번 · 13.5시간 · 못 드림 2h');
  expect(flat(card)).toContain('리포트 −₩10,000');
  expect(flat(card)).toContain('₩512,510');
  expect(flat(card)).toContain('자세히 ›');
  // 못 드림이 0 이면 그 절이 서지 않는다
  expect(flat(view.getByRole('button', { name: '이다현 자세히 보기' }))).not.toContain('못 드림');
  // 합계 카드 — 원문 「8월에 드릴 돈 · 88.7시간 · 강사료 · 차감 · 세금 · 보류」
  const totals = view.getByRole('region', { name: '합계' });
  expect(flat(totals)).toContain('8월에 드릴 돈₩1,025,020');
  for (const t of ['27시간', '강사료 ₩1,080,000', '차감 −₩20,000', '세금 −₩34,980', '보류 2h']) expect(within(totals).getByText(t)).toBeTruthy();
  expect(view.getByText('저장값 다름')).toBeTruthy();
  expect(view.getByText('확정 · 김민선')).toBeTruthy();
  expect(view.getByText('대기')).toBeTruthy();
  expect(view.getByText('왼쪽에서 선생님을 눌러주세요')).toBeTruthy();
  expect(view.getByText('시급 · 수업 날짜 · 리포트 미작성 · 정산 내역을 봅니다')).toBeTruthy();
  // 고르기 전에는 상세를 부르지 않는다
  expect(gets).toHaveLength(0);
  cleanup();
  // 쓴 것도 안 쓴 것도 없는 줄은 「대기」가 아니다 — 확정할 것이 없다
  const none = setup({ ...sheet, rows: [nothingRow] });
  expect(none.getByText('정산 없음')).toBeTruthy();
  expect(none.queryByText('대기')).toBeNull();
  cleanup();
  // 56-05 — 그런데 저장된 정산 행이 있으면 「정산 없음」은 거짓이다
  const saved = setup({ ...sheet, rows: [{ ...nothingRow, saved: true, savedNet: 1218420, savedDiffers: true }] });
  expect(saved.getByText('저장됨 · 미확정')).toBeTruthy();
  expect(saved.queryByText('정산 없음')).toBeNull();
  expect(saved.getByText('저장값 다름')).toBeTruthy();
});

it('카드를 누르면 그 사람의 상세를 그 달로 부른다 — 정산 내역 · 시급 · 수업 날짜(리포트 미작성 포함) (56-01)', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '김재훈 자세히 보기' }));
  expect(view.getByRole('button', { name: '김재훈 자세히 보기' }).getAttribute('aria-pressed')).toBe('true');
  await waitFor(() => expect(view.getByText('2026-01-01부터 ₩60,000/시간')).toBeTruthy());
  expect(gets).toEqual([{ url: '/accounting/payouts/7', params: { month: '2026-08' } }]);
  expect(view.getByRole('heading', { name: '김재훈 · 8월 정산' })).toBeTruthy();
  const sum = flat(view.getByLabelText('정산 내역'));
  for (const t of ['9회 · 13.5h', '2회 · ₩80,000 빠짐', '휴강 1 · 대상 아님 2', '₩540,000', '−₩10,000', '소득세 ₩15,900 · 지방세 ₩1,590', '₩512,510']) expect(sum).toContain(t);
  const lessons = view.getByRole('region', { name: '수업 날짜' });
  const rows = within(lessons).getAllByRole('row').slice(1).map((r) => flat(r));
  expect(rows[0]).toContain('8/20 (목)');
  expect(rows[0]).toContain('15:00–16:30');
  expect(rows[0]).toContain('리포트 미작성');
  expect(rows[1]).toContain('리포트 씀');
  expect(rows[1]).toContain('₩90,000');
  expect(rows[1]).toContain('−₩5,000');
  // 다시 누르면 접힌다
  fireEvent.click(view.getByRole('button', { name: '김재훈 자세히 보기' }));
  expect(view.getByText('왼쪽에서 선생님을 눌러주세요')).toBeTruthy();
});

it('「지급 확정」은 서버가 canConfirm 이라 한 사람의 상세에만 선다 — 화면이 역할·달·상태를 다시 보지 않는다 (D-R39)', async () => {
  const view = setup();
  expect(view.queryByRole('button', { name: '지급 확정' })).toBeNull();
  fireEvent.click(view.getByRole('button', { name: '김재훈 자세히 보기' }));
  expect(view.getAllByRole('button', { name: '지급 확정' })).toHaveLength(1);
  fireEvent.click(view.getByRole('button', { name: '이다현 자세히 보기' }));
  expect(view.queryByRole('button', { name: '지급 확정' })).toBeNull();
  cleanup();
  const closed = setup({ ...sheet, monthEnded: false, rows: sheet.rows.map((r) => ({ ...r, canConfirm: false })) });
  fireEvent.click(closed.getByRole('button', { name: '김재훈 자세히 보기' }));
  expect(closed.queryByRole('button', { name: '지급 확정' })).toBeNull();
  expect((closed.container.textContent ?? '')).toContain('아직 끝나지 않은 달입니다');
});

it('확정 창은 굳히는 값을 보여 주고 staffId 하나만 보낸다 — 성공하면 닫힌다 (O-148)', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '김재훈 자세히 보기' }));
  fireEvent.click(view.getByRole('button', { name: '지급 확정' }));
  const dialog = view.getByRole('dialog');
  const text = flat(dialog);
  expect(text).toContain('지급 확정 — 김재훈 · 8월');
  expect(text).toContain('9회 · 13.5h');
  expect(text).toContain('2회 · ₩80,000');
  expect(text).toContain('저장돼 있던 ₩386,800 은 덮입니다');
  fireEvent.click(view.getAllByRole('button', { name: '지급 확정' }).at(-1)!);
  await waitFor(() => expect(posted).not.toBeNull());
  expect(posted).toEqual({ url: '/accounting/payouts/2026-08/confirm', body: { staffId: 7 } });
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
});

it('거절 이유는 서버 문장을 그대로 보여 준다 — 창은 열려 있다', async () => {
  const view = setup(sheet, () => ({ status: 409, data: { code: 'PAYOUT_NO_RATE', message: '시급이 없는 수업이 1건 있습니다 — 시급을 먼저 등록하세요' } }));
  fireEvent.click(view.getByRole('button', { name: '김재훈 자세히 보기' }));
  fireEvent.click(view.getByRole('button', { name: '지급 확정' }));
  fireEvent.click(view.getAllByRole('button', { name: '지급 확정' }).at(-1)!);
  await waitFor(() => expect(view.getByText(/시급을 먼저 등록하세요/)).toBeTruthy());
  expect(view.getByRole('dialog')).toBeTruthy();
});

it('금액을 못 보면 회차 수·시간만 보이고 금액 자리는 숨긴 금액 낱말(「비공개」)이다 — 금액 칩은 서지 않는다 (D-R39)', async () => {
  const masked: PayoutSheetData = {
    ...sheet, canSeeAmounts: false, netTotal: null, grossTotal: null, lateCutTotal: null, taxTotal: null,
    rows: [{ ...row, gross: null, lateCut: null, incomeTax: null, localTax: null, net: null, unwrittenAmount: null, savedNet: null, canConfirm: false }],
  };
  const view = setup(masked);
  const text = flat(view.container);
  expect(text).toContain(MASKED);
  expect(text).not.toContain('512,510');
  expect(text).toContain('금액은 대표만 봅니다');
  const totals = view.getByRole('region', { name: '합계' });
  expect(within(totals).getByText('27시간')).toBeTruthy();
  expect(flat(totals)).not.toContain('강사료');
  expect(flat(totals)).not.toContain('세금');
  fireEvent.click(view.getByRole('button', { name: '김재훈 자세히 보기' }));
  await waitFor(() => expect(view.getByText(`2026-01-01부터 ${MASKED}/시간`)).toBeTruthy());
  expect(view.queryByRole('button', { name: '지급 확정' })).toBeNull();
  expect(flat(view.getByRole('region', { name: '수업 날짜' }))).not.toContain('90,000');
});

/* ── W11 M2 — 가산(N-93) · 보정 줄(N-51) · 시급 비공개(N-94). 금액 글자는 `lib/money` 로 만든다(표기가 바뀌어도 시험이 따라간다) ── */

const corrRow: PayoutSheetRow = {
  ...row, staffId: 12, staffName: '박도윤', gross: 555000, bonus: 15000, correctionCount: 1, correctionMinutes: 60, lateCount: 1,
  savedDiffers: false, saved: false, savedNet: null,
};
const corrSheet: PayoutSheetData = { ...sheet, rows: [corrRow], bonusTotal: 15000, correctionCount: 1 };
const corrDetail = (r: PayoutSheetRow): PayoutDetail => ({
  ...detailOf(r),
  lessons: [
    { serId: 21, onDate: '2026-08-25', date: '2026-08-25', startMin: 600, durMin: 60, name: '모의수업', students: '김하윤', studentCount: 1, canceled: false,
      settle: 'written', settleLabel: '리포트 씀', pay: 60000, lateCut: 0, bonus: 15000, unitRate: 60000, correctionOf: null, paidIn: null, frozen: false },
    { serId: 22, onDate: '2026-08-11', date: '2026-08-11', startMin: 600, durMin: 60, name: 'SAT Math', students: '김하윤', studentCount: 1, canceled: false,
      settle: 'late', settleLabel: '확정된 달 — 다음 달 보정', pay: null, lateCut: null, bonus: null, unitRate: 60000, correctionOf: null, paidIn: null, frozen: false },
    { serId: 23, onDate: '2026-07-28', date: '2026-07-28', startMin: 600, durMin: 60, name: 'SAT Math', students: '김하윤', studentCount: 1, canceled: false,
      settle: 'correction', settleLabel: '보정 · 7월 회차', pay: 60000, lateCut: 5000, bonus: 0, unitRate: 60000, correctionOf: '2026-07', paidIn: null, frozen: true },
  ],
});

it('가산 · 보정 줄 — 카드 · 합계 · 상세가 서버 값을 그대로 보인다(가산은 총액 안 · 보정 줄은 원래 달 낱말 · 확정 값 표시) (N-93 · N-51)', async () => {
  const view = setup(corrSheet, undefined, corrDetail);
  const card = view.getByRole('button', { name: '박도윤 자세히 보기' });
  expect(flat(card)).toContain('보정 1');
  expect(flat(card)).toContain('다음 달 보정 1');
  const totals = view.getByRole('region', { name: '합계' });
  expect(within(totals).getByText(`가산 ${won(15000)}`)).toBeTruthy();
  expect(within(totals).getByText('보정 1건')).toBeTruthy();

  fireEvent.click(card);
  await waitFor(() => expect(view.getByText('보정 · 7월 회차')).toBeTruthy());
  const sum = flat(view.getByLabelText('정산 내역'));
  expect(sum).toContain('보정 줄 1회 · 1.0h · 다음 달 보정 1회');
  expect(sum).toContain(`${won(15000)} (총액에 포함)`);
  const rows = within(view.getByRole('region', { name: '수업 날짜' })).getAllByRole('row').slice(1).map((r) => flat(r));
  expect(rows[0]).toContain(`+${won(15000)}`);
  expect(rows[1]).toContain('확정된 달 — 다음 달 보정');
  // 보정 줄 — 앞선 달 날짜 · 지급 확정 근거 줄의 굳은 값
  expect(rows[2]).toContain('7/28');
  expect(rows[2]).toContain('확정 값');
  expect(rows[2]).toContain(won(60000));
});

it('확정이 막히면 단추 대신 서버 문장을 그 자리에 적는다 (D-R39 · confirmBlockedReason)', async () => {
  const reason = '보정 줄이 있어 보정 승인 권한이 있어야 확정할 수 있습니다';
  const view = setup({ ...sheet, rows: [{ ...row, canConfirm: false, confirmBlockedReason: reason }] });
  fireEvent.click(view.getByRole('button', { name: '김재훈 자세히 보기' }));
  expect(view.getByText(reason)).toBeTruthy();
  expect(view.queryByRole('button', { name: '지급 확정' })).toBeNull();
});

it('시급 비공개로 가려진 줄도 숨긴 금액 낱말 한 벌(「비공개」) — 합계 카드는 그대로다 (N-94 · W11 D)', async () => {
  const hidden: PayoutSheetRow = {
    ...row, amountsHidden: true, gross: null, lateCut: null, incomeTax: null, localTax: null, net: null, unwrittenAmount: null, bonus: null,
    savedNet: null, savedDiffers: false,
  };
  const hiddenDetail = (r: PayoutSheetRow): PayoutDetail => ({
    ...detailOf(r),
    rates: [{ fromDate: '2026-01-01', rate: null }],
    lessons: detailOf(r).lessons.map((l) => ({ ...l, pay: null, lateCut: null, bonus: null, unitRate: null })),
  });
  const view = setup({ ...sheet, amountsHidden: true, rows: [hidden] }, undefined, hiddenDetail);
  expect(flat(view.getByRole('button', { name: '김재훈 자세히 보기' }))).toContain(MASKED);
  expect(flat(view.container)).toContain('시급 비공개가 켜져 있어');
  // 합계는 가리지 않은 값에서 서버가 낸 그대로
  const totals = view.getByRole('region', { name: '합계' });
  expect(within(totals).getByText(`강사료 ${won(1080000)}`)).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '김재훈 자세히 보기' }));
  await waitFor(() => expect(view.getByText(`2026-01-01부터 ${MASKED}/시간`)).toBeTruthy());
  const rows = within(view.getByRole('region', { name: '수업 날짜' })).getAllByRole('row').slice(1).map((r) => flat(r));
  // 쓴 수업의 강사료 자리는 「비공개」, 미작성 줄은 원래대로 「—」
  expect(rows[1]).toContain(MASKED);
  expect(rows[0]).not.toContain(MASKED);
  expect(flat(view.getByLabelText('정산 내역'))).not.toContain('가려짐');
});

it('합계 카드 밑 자리(below)는 페이지가 채운다 — 원문 §56 「추가로 드리는 돈」', () => {
  const view = setup(sheet, undefined, detailOf, <section aria-label="추가로 드리는 돈">가산 칸</section>);
  expect(view.getByRole('region', { name: '추가로 드리는 돈' }).textContent).toBe('가산 칸');
});

/* 옮긴 회차 — 「날짜」 칸은 실제 수업일(date)이다. 근거 줄의 키(onDate)와 다를 수 있다 (TBO-54 MEETING-MOVE) */
it('상세의 수업 날짜는 실제 수업일이다 — 규칙 날짜와 다른 옮긴 회차는 옮긴 날로 적는다', async () => {
  const view = setup(sheet, undefined, (r) => ({ ...detailOf(r), lessons: [{ ...detailOf(r).lessons[0], onDate: '2026-08-20', date: '2026-08-27' }] }));
  fireEvent.click(view.getByRole('button', { name: '김재훈 자세히 보기' }));
  await waitFor(() => expect(view.getByRole('region', { name: '수업 날짜' })).toBeTruthy());
  const rows = within(view.getByRole('region', { name: '수업 날짜' })).getAllByRole('row').slice(1).map((r) => flat(r));
  expect(rows[0]).toContain('8/27 (목)');
  expect(rows[0]).not.toContain('8/20');
});
