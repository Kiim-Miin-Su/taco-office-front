/** @file-guide
 * 목적: §57 강사료 시트 · 지급 확정 — 화면은 세지 않고 서버 판정(canConfirm)만 따른다 (C94-b).
 * 책임/재사용: 실제 PayoutSheet/useConfirmPayout 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Me, PayoutSheet as PayoutSheetData, PayoutSheetRow } from '@/api/types';
import { useSession } from '@/store/useSession';
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
};
const sheet: PayoutSheetData = {
  month: '2026-08', today: '2026-09-18', monthEnded: true, rows: [row, { ...row, staffId: 8, staffName: '이다현', unwrittenCount: 0, unwrittenAmount: 0, canConfirm: false, confirmed: true, confirmedAt: '2026-09-03T02:00:00.000Z', confirmedBy: '김민선', savedDiffers: false }],
  unwrittenCount: 2, netTotal: 1025020, canSeeAmounts: true,
};
/** 자습 감독뿐인 사람 — 쓴 것도 안 쓴 것도 없다 */
const nothingRow: PayoutSheetRow = {
  ...row, staffId: 9, staffName: '강민지', writtenCount: 0, writtenMinutes: 0, unwrittenCount: 0, unwrittenMinutes: 0, unwrittenAmount: 0,
  canceledCount: 0, naCount: 3, gross: 0, lateCut: 0, incomeTax: 0, localTax: 0, net: 0, saved: false, savedDiffers: false, savedNet: null, canConfirm: false,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let posted: { url?: string; body: unknown } | null = null;
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); posted = null;
});

function setup(data: PayoutSheetData = sheet, onPost: () => { status: number; data: unknown } = () => ({ status: 201, data: { ...row, confirmed: true, canConfirm: false, confirmedBy: '대표', savedDiffers: false } })) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posted = { url: config.url, body: JSON.parse(config.data ?? '{}') };
      const r = onPost();
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <PayoutSheet data={data} month={data.month} onMonthChange={() => {}} />
    </QueryClientProvider>,
  );
  return view;
}

it('서버가 센 수를 그대로 그린다 — 쓴 수업·미작성과 빠진 금액·휴강·세금 둘·실지급·저장값 다름 (H-82 · D-43 · D-R37)', () => {
  const view = setup();
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('8월 강사료 정산');
  expect(text).toContain('미작성 2건 빠짐');
  expect(text).toContain('실지급 합계 1,025,020원');
  expect(text).toContain('80,000원 빠짐');
  expect(text).toContain('13.5h');
  expect(text).toContain('휴강 1');
  expect(text).toContain('대상 아님 2');
  expect(text).toContain('소득세 15,900원');
  expect(text).toContain('지방세 1,590원');
  expect(text).toContain('512,510원');
  expect(view.getByText('저장값 다름')).toBeTruthy();
  expect(view.getByText('확정 · 김민선')).toBeTruthy();
  expect(view.getByText('대기')).toBeTruthy();
  cleanup();
  // 쓴 것도 안 쓴 것도 없는 줄은 「대기」가 아니다 — 확정할 것이 없다
  const none = setup({ ...sheet, rows: [nothingRow] });
  expect(none.getByText('정산 없음')).toBeTruthy();
  expect(none.queryByText('대기')).toBeNull();
  expect(none.getByText('대상 아님 3')).toBeTruthy();
});

it('「지급 확정」은 서버가 canConfirm 이라 한 줄에만 선다 — 화면이 역할·달·상태를 다시 보지 않는다 (D-R39)', () => {
  const view = setup();
  // 두 줄 중 한 줄만 canConfirm — 단추도 하나
  expect(view.getAllByRole('button', { name: '지급 확정' })).toHaveLength(1);
  cleanup();
  const closed = setup({ ...sheet, monthEnded: false, rows: sheet.rows.map((r) => ({ ...r, canConfirm: false })) });
  expect(closed.queryByRole('button', { name: '지급 확정' })).toBeNull();
  expect((closed.container.textContent ?? '')).toContain('아직 끝나지 않은 달입니다');
});

it('확정 창은 굳히는 값을 보여 주고 staffId 하나만 보낸다 — 성공하면 닫힌다 (O-148)', async () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: '지급 확정' }));
  const dialog = view.getByRole('dialog');
  const text = (dialog.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('지급 확정 — 김재훈 · 8월');
  expect(text).toContain('9회 · 13.5h');
  expect(text).toContain('2회 · 80,000원');
  expect(text).toContain('저장돼 있던 386,800원 은 덮입니다');
  fireEvent.click(view.getAllByRole('button', { name: '지급 확정' }).at(-1)!);
  await waitFor(() => expect(posted).not.toBeNull());
  expect(posted).toEqual({ url: '/accounting/payouts/2026-08/confirm', body: { staffId: 7 } });
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
});

it('거절 이유는 서버 문장을 그대로 보여 준다 — 창은 열려 있다', async () => {
  const view = setup(sheet, () => ({ status: 409, data: { code: 'PAYOUT_NO_RATE', message: '시급이 없는 수업이 1건 있습니다 — 시급을 먼저 등록하세요' } }));
  fireEvent.click(view.getByRole('button', { name: '지급 확정' }));
  fireEvent.click(view.getAllByRole('button', { name: '지급 확정' }).at(-1)!);
  await waitFor(() => expect(view.getByText(/시급을 먼저 등록하세요/)).toBeTruthy());
  expect(view.getByRole('dialog')).toBeTruthy();
});

it('금액을 못 보면 회차 수만 보이고 금액 자리는 「가려짐」이다 (D-R39)', () => {
  const masked: PayoutSheetData = {
    ...sheet, canSeeAmounts: false, netTotal: null,
    rows: [{ ...row, gross: null, lateCut: null, incomeTax: null, localTax: null, net: null, unwrittenAmount: null, savedNet: null, canConfirm: false }],
  };
  const view = setup(masked);
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('가려짐');
  expect(text).not.toContain('512,510');
  expect(text).toContain('금액은 대표만 봅니다');
  expect(view.queryByRole('button', { name: '지급 확정' })).toBeNull();
});
