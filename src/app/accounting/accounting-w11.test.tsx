/** @file-guide
 * 목적: 회계 W11 화면 회귀 — 탭 두 층(N-37 ①) · §53 다섯 칸 판의 다음 칸 단추(N-28 ②) · 분납 예정일(N-79) · 월 마감 · 시급 · 못 받은 돈.
 * 책임/재사용: 실제 AccountingPage 와 회계 부품 · 질의 훅을 쓰고 셸과 네트워크만 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Accounting, Cashflow, InvBoard, Invoice, Me, Tuition } from '@/api/types';
import { MASKED, won } from '@/lib/money';
import { monthBounds, todayKst } from '@/lib/calendar';
import { useSession } from '@/store/useSession';
import AccountingPage from './page';

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
const me: Me = { id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true };

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter;
  useSession.getState().signOut(); nav.search = '';
});

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 42, studentId: 7, studentName: '양찬욱', grade: 'G10', studentTag: 'G10', yearMonth: '2026-09',
  title: '2026년 9월 수업료 청구', amount: 250000, paidAmount: 0, state: 'sent', stateLabel: '보냄',
  invType: 'tuition', invTypeLabel: '수업료 청구',
  issuedOn: '2026-09-12', dueOn: '2026-09-30', paidAt: null, remaining: 250000, overdueDays: 0,
  sentAt: '2026-09-12T01:00:00.000Z', canDeliver: false, canVoid: false, voidBlockedReason: null, voidReason: null, lines: [],
  installments: [], nextDueOn: '2026-09-30', nextInstallmentSeq: null, notice: null, ...over,
});
const accounting = (invoices: Invoice[] = []): Accounting => ({
  summary: { sent: 0, collected: 0, unpaid: 0, overdue: 0, net: 0, todo: 0, canSeeAmounts: true },
  invoices, payments: [], expenses: [], expenseTotals: [], payCategories: [], payouts: [], expenseCategories: [],
});
const flow = (over: Partial<Cashflow> = {}): Cashflow => ({
  from: '2026-09-01', to: '2026-09-30', label: '2026년 9월', dayCount: 30, category: null, today: '2026-09-18',
  count: 0, billed: 0, paid: 0, expected: 0, days: [], categories: [], open: [], canSeeAmounts: true, ...over,
});
const tuition = (over: Partial<Tuition> = {}): Tuition => ({
  month: '2026-08', today: '2026-09-18', daysPast: 31, daysLeft: 0, canSeeAmounts: true,
  doneCount: 0, totalCount: 0, canceledCount: 0, deductedCount: 0, extraCount: 0, doneAmount: 0, carryAmount: 0,
  carriedInCount: 0, carriedInAmount: 0, items: [], close: null, canClose: true, canReopen: false, ...over,
});
/** §53 판 표본 — ① 대상 하나 · ③ 보낸 청구서 하나 */
const board = (): InvBoard => ({
  canSeeAmounts: true, candidateMonth: '2026-09', columns: [],
  stages: [
    { key: 'todo', label: '아직 안 씀', sub: '청구서를 만들어야 합니다', next: 'issue', nextLabel: '청구서 작성 →', count: 1, amount: 150000, cards: [],
      candidates: [{ studentId: 7, studentName: '양찬욱', grade: 'G10', studentTag: 'G10', yearMonth: '2026-09', invType: 'diag_intake', invTypeLabel: '진단고사 + 상담 비용', title: '2026년 9월 진단고사 + 상담 비용', amount: 150000, canIssue: true, issueBlockedReason: null }] },
    { key: 'draft', label: '청구서 작성', sub: '보낼 준비가 됐습니다', next: 'deliver', nextLabel: '학부모 안내 →', count: 0, amount: 0, cards: [], candidates: [] },
    { key: 'sent', label: '학부모 안내', sub: '보냈습니다 · 입금을 기다립니다', next: 'pay', nextLabel: '입금 완료 →', count: 1, amount: 250000, candidates: [],
      cards: [{ invId: 43, studentId: 8, studentName: '이하린', grade: 'G9', studentTag: 'G9', invType: 'tuition', invTypeLabel: '수업료 청구', title: '2026년 9월 수업료 청구', stateLabel: '보냄', amount: 250000, paid: 0, paidPercent: null, dueOn: '2026-09-30', overdueDays: 0, whenLabel: 'D-12' }] },
    { key: 'paid', label: '입금 완료', sub: '돈이 들어왔습니다', next: null, nextLabel: null, count: 0, amount: 0, cards: [], candidates: [] },
    { key: 'record', label: '입금 기록', sub: '장부에 넣었습니다', next: null, nextLabel: null, count: 0, amount: 0, cards: [], candidates: [] },
  ],
});
const META = {
  kinds: [], subs: [], rooms: [], zaccs: [], staff: [],
  students: [{ id: 7, name: '양찬욱', grade: 'G10', school: null, tag: 'G10', label: '양찬욱 · G10' }],
  invTypes: [
    { key: 'tuition', label: '수업료 청구', sub: '정규 수업', other: false, issuable: true, issueBlockedReason: null, manualLines: false },
    { key: 'diag_intake', label: '진단고사 + 상담 비용', sub: '진단고사 · 입학 상담', other: true, issuable: true, issueBlockedReason: null, manualLines: false },
  ],
};

type Req = { url?: string; method?: string; params?: Record<string, string>; data?: string };
function mount(route: (c: Req) => unknown) {
  useSession.getState().signIn('fixture', me);
  const seen: Req[] = [];
  api.defaults.adapter = (async (config: Req) => {
    seen.push(config);
    return { config, status: config.method === 'post' ? 201 : 200, statusText: 'OK', headers: {}, data: route(config) };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AccountingPage /></QueryClientProvider>);
  return { view, seen };
}
/** 탭 줄 안의 단추만 본다 — 입금 기록 칸의 「입금 기록」 단추와 이름이 같다 */
const pressed = (v: ReturnType<typeof render>, name: string) =>
  within(v.getByRole('group', { name: '회계 탭' })).getByRole('button', { name }).getAttribute('aria-pressed');
/** 강사료 시트 표본 — 「나간 돈」 묶음이 처음 여는 탭 */
const SHEET = {
  month: '2026-09', today: '2026-09-18', monthEnded: false, rows: [], unwrittenCount: 0, netTotal: 0, canSeeAmounts: true,
  writtenMinutes: 0, unwrittenMinutes: 0, grossTotal: 0, lateCutTotal: 0, taxTotal: 0,
  bonusTotal: 0, correctionCount: 0, amountsHidden: false,
};
/** 탭 줄 오른쪽 두 비공개 스위치 표본 (N-94 · W11 M2) — 꺼져 있고 대표가 켤 수 있다 */
const PRIVACY = {
  canSet: true, canSeeHidden: true,
  switches: [
    { key: 'wage', label: '시급 비공개', private: false, scope: '강사료 정산 줄의 시급 · 금액이 가려집니다', setByName: null, setAt: null },
    { key: 'consulting', label: '컨설팅 비공개', private: false, scope: '컨설팅비 줄의 금액이 가려집니다', setByName: null, setAt: null },
  ],
};

it('탭은 두 층이다 — 처음은 받을 돈 › 트래킹 보드 · 묶음을 누르면 그 아래 탭이 선다 · 없는 기능은 잠기고 까닭이 있다 (N-37 ① · C-08)', async () => {
  const { view } = mount((c) => (
    c.url === '/accounting/board' ? board()
      : c.url === '/accounting/cashflow' ? flow()
        : c.url === '/accounting/privacy' ? PRIVACY
          : c.url === '/accounting/tuition' ? tuition()
            : c.url === '/accounting/payouts' ? SHEET : accounting()));
  await waitFor(() => expect(view.getByRole('button', { name: '받을 돈' })).toBeTruthy());
  const group = view.getByRole('group', { name: '회계 탭' });
  expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(
    ['받을 돈', '트래킹 보드', '청구서', '수업료 계산', '그 밖의 수입', '들어온 돈', '나간 돈', '정리 · 기준'],
  );
  expect(pressed(view, '받을 돈')).toBe('true');
  expect(pressed(view, '트래킹 보드')).toBe('true');
  expect(pressed(view, '청구서')).toBe('false');

  fireEvent.click(view.getByRole('button', { name: '들어온 돈' }));
  expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(
    ['받을 돈', '들어온 돈', '입금 기록', '영수증 · 세금계산서', '못 받은 돈', '학생별 누적', '나간 돈', '정리 · 기준'],
  );
  expect(pressed(view, '입금 기록')).toBe('true');
  for (const name of ['영수증 · 세금계산서', '학생별 누적']) {
    const b = view.getByRole('button', { name }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/^아직 없는 기능입니다 — /);
  }

  fireEvent.click(view.getByRole('button', { name: '나간 돈' }));
  expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(
    ['받을 돈', '들어온 돈', '나간 돈', '강사료 정산', '지출', '정리 · 기준'],
  );
  expect(pressed(view, '강사료 정산')).toBe('true');
  fireEvent.click(view.getByRole('button', { name: '지출' }));
  expect(pressed(view, '지출')).toBe('true');
  // W11 M2 — 탭 줄 오른쪽은 원문대로 「+ 청구서 · 시급 비공개 · 컨설팅 비공개」(N-94) · 정리 · 기준에 「가산 규칙」(N-93)
  await waitFor(() => expect(view.getByRole('button', { name: '시급 비공개' })).toBeTruthy());
  expect(view.getByRole('button', { name: '컨설팅 비공개' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '정리 · 기준' }));
  expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(
    ['받을 돈', '들어온 돈', '나간 돈', '정리 · 기준', '월 마감', '단가표', '시급', '가산 규칙'],
  );
});

/**
 * 첫 화면은 원문(§52)대로 **트래킹 보드**다 (C-08 · W11 A' 후속 — 리드 결정).
 * 「보드 질의 1건 절약」 까닭은 청구서 탭도 같은 판을 읽게 되며 사라졌다 — 이제 세는 것은 「판 질의는 한 번 · 두 탭이 같은 캐시」다.
 */
it('처음 화면은 받을 돈 › 트래킹 보드다 — 판 질의 한 번 · 「자세히 ›」로 청구서 탭에 가도 다시 묻지 않는다 · `?tab=inv&invId=` 는 청구서 탭 (C-08)', async () => {
  const card = {
    invId: 43, studentId: 8, studentName: '이하린', grade: 'G9', studentTag: 'G9', invType: 'tuition', invTypeLabel: '수업료 청구', title: '2026년 9월 수업료 청구',
    stateLabel: '보냄', amount: 250000, paid: 0, paidPercent: null, dueOn: '2026-09-30', overdueDays: 0, whenLabel: 'D-12',
  };
  const tracking: InvBoard = {
    ...board(),
    columns: [
      { key: 'draft', label: '청구서 작성', sub: '아직 안 만들었습니다', count: 0, amount: 0, cards: [] },
      { key: 'sent', label: '청구서 전달', sub: '보냈습니다 · 입금을 기다립니다', count: 1, amount: 250000, cards: [card] },
      { key: 'paid', label: '입금 완료', sub: '돈이 들어왔습니다', count: 0, amount: 0, cards: [] },
      { key: 'record', label: '입금 기록', sub: '장부에 넣었습니다', count: 0, amount: 0, cards: [] },
    ],
  };
  const { view, seen } = mount((c) => (c.url === '/accounting/board' ? tracking : accounting([inv({ id: 43, studentId: 8, studentName: '이하린' })])));
  await waitFor(() => expect(view.getByRole('button', { name: '이하린 청구서 자세히' })).toBeTruthy());
  expect(pressed(view, '트래킹 보드')).toBe('true');
  // 청구서 표는 그 탭을 열 때 선다 — 첫 화면에는 없다
  expect(view.queryByText('전체 1건')).toBeNull();
  const boardReads = () => seen.filter((c) => c.url === '/accounting/board').length;
  expect(boardReads()).toBe(1);

  fireEvent.click(view.getByRole('button', { name: '이하린 청구서 자세히' }));
  await waitFor(() => expect(pressed(view, '청구서')).toBe('true'));
  expect(view.getByText('전체 1건')).toBeTruthy();
  // 청구서 탭의 다섯 칸 판도 같은 질의 · 같은 캐시다 — 탭을 옮겨도 판을 다시 묻지 않는다
  expect(boardReads()).toBe(1);

  cleanup();
  nav.search = 'tab=inv&invId=43';
  const again = mount((c) => (c.url === '/accounting/board' ? tracking : accounting([inv({ id: 43, studentId: 8, studentName: '이하린' })])));
  await waitFor(() => expect(again.view.getByText('전체 1건')).toBeTruthy());
  expect(pressed(again.view, '청구서')).toBe('true');
  expect(pressed(again.view, '트래킹 보드')).toBe('false');
});

it('옛 `?tab=pay`(들어온 돈) 링크는 「들어온 돈 › 입금 기록」으로 연다 — 기간 요약과 입금 붙이기가 한 탭이다', async () => {
  nav.search = 'tab=pay';
  const { view, seen } = mount((c) => (c.url === '/accounting/cashflow' ? flow() : accounting([inv({})])));
  await waitFor(() => expect(view.getByRole('group', { name: '기간 요약' })).toBeTruthy());
  expect(pressed(view, '입금 기록')).toBe('true');
  // 청구서에 입금을 붙이는 칸도 같은 탭에 있다 · 보드는 부르지 않는다
  expect(view.getByText('받을 돈 · 1건')).toBeTruthy();
  expect(seen.some((c) => c.url === '/accounting/board')).toBe(false);
});

it('「못 받은 돈」은 미수 전체 목록이다 — 줄은 서버가 준 대로(분납이면 회차마다 한 줄)', async () => {
  nav.search = 'tab=unpaid';
  const open: Cashflow['open'] = [
    { invId: 3, seq: 2, studentName: '고은성', partLabel: '2회차', amount: 413300, dueOn: '2026-09-28', whenLabel: 'D-10', tone: null },
    { invId: 1, seq: null, studentName: '양찬욱', partLabel: '전액', amount: 1170000, dueOn: '2026-08-28', whenLabel: '21일 연체', tone: 'danger' },
  ];
  const { view, seen } = mount((c) => (c.url === '/accounting/cashflow' ? flow({ open }) : accounting()));
  await waitFor(() => expect(view.getByRole('region', { name: '미수 전체' })).toBeTruthy());
  expect(pressed(view, '못 받은 돈')).toBe('true');
  const rows = within(view.getByRole('region', { name: '미수 전체' })).getAllByRole('listitem').map((li) => li.textContent);
  expect(rows).toEqual(['고은성2회차₩413,300D-10', '양찬욱전액₩1,170,00021일 연체']);
  // 입금 기록 탭의 처음 조건(이번 달)과 같은 질의 — 캐시를 나눠 쓴다
  expect(seen.find((c) => c.url === '/accounting/cashflow')?.params).toEqual(monthBounds(todayKst()));
});

it('월 마감은 「정리 · 기준 › 월 마감」에서 한다 — 서버 판정대로 단추가 서고 달을 그대로 보낸다 · §54 표에는 단추가 없다', async () => {
  nav.search = 'tab=close';
  const { view, seen } = mount((c) => (c.url === '/accounting/tuition' ? tuition() : c.url === '/accounting/tuition/close' ? { id: 1, month: '2026-08', closedAt: '2026-09-18T01:00:00.000Z', closedBy: '대표' } : accounting()));
  await waitFor(() => expect(view.getByRole('button', { name: '8월 마감하기' })).toBeTruthy());
  expect(pressed(view, '월 마감')).toBe('true');
  expect((view.getByLabelText('달') as HTMLInputElement).value).toBe('2026-08');
  fireEvent.click(view.getByRole('button', { name: '8월 마감하기' }));
  fireEvent.click(await view.findByRole('button', { name: '마감' }));
  await waitFor(() => expect(seen.some((c) => c.method === 'post' && c.url === '/accounting/tuition/close')).toBe(true));
  expect(JSON.parse(seen.find((c) => c.url === '/accounting/tuition/close')!.data!)).toEqual({ month: '2026-08' });

  cleanup();
  nav.search = 'tab=tuition';
  const again = mount((c) => (c.url === '/accounting/tuition' ? tuition() : accounting()));
  await waitFor(() => expect(again.view.getByText('8월 수업 진행')).toBeTruthy());
  expect(again.view.queryByRole('button', { name: '8월 마감하기' })).toBeNull();
});

it('「정리 · 기준 › 시급」은 서랍 구성원과 같은 값이다 — 시급 줄을 둘 강사만 서고 「시급 수정」이 붙는다', async () => {
  nav.search = 'tab=wage';
  const member = (id: number, name: string, over: Record<string, unknown> = {}) => ({
    id, name, loginId: `u${id}`, email: null, role: 'teacher', active: true, wageRate: 42000, wageFrom: '2026-01-01', wageable: true, ...over,
  });
  const drawer = { canWage: true, members: [member(6, '이다현'), member(7, '박매니저', { role: 'manager', wageable: false, wageRate: null, wageFrom: null }), member(8, '김새강사', { wageRate: null, wageFrom: null })] };
  const { view, seen } = mount((c) => (c.url === '/drawer' ? drawer : accounting()));
  await waitFor(() => expect(view.getByText('이다현')).toBeTruthy());
  expect(pressed(view, '시급')).toBe('true');
  expect(seen.some((c) => c.url === '/drawer')).toBe(true);
  expect(view.queryByText('박매니저')).toBeNull();
  const row = (name: string) => within(view.getByText(name).closest('tr')!).getAllByRole('cell').map((c) => c.textContent);
  expect(row('이다현')).toEqual(['이다현', '₩42,000', '2026-01-01', '시급 수정']);
  expect(row('김새강사')).toEqual(['김새강사', '—', '—', '시급 수정']);
});

it('§53 ③ 「입금 완료 →」은 들어온 돈 › 입금 기록을 그 청구서로 연다 · ① 「청구서 작성 →」은 발행 칸을 그 대상으로 채운다 (N-28 ②)', async () => {
  nav.search = 'tab=inv'; // 다섯 칸 판은 청구서 탭에 선다
  const { view } = mount((c) => (
    c.url === '/accounting/board' ? board()
      : c.url === '/accounting/cashflow' ? flow()
        : c.url === '/meta' ? META
          : accounting([inv({ id: 43, studentId: 8, studentName: '이하린' })])));
  await waitFor(() => expect(view.getByRole('button', { name: '이하린 입금 완료 →' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '양찬욱 2026년 9월 진단고사 + 상담 비용 청구서 작성 →' }));
  await waitFor(() => expect(view.getByRole('option', { name: /양찬욱/ })).toBeTruthy());
  expect((view.getByLabelText('학생') as HTMLSelectElement).value).toBe('7');
  expect((view.getByLabelText('종류') as HTMLSelectElement).value).toBe('diag_intake');
  expect((view.getByLabelText('납부 기한') as HTMLInputElement).value).toBe('');

  fireEvent.click(view.getByRole('button', { name: '이하린 입금 완료 →' }));
  await waitFor(() => expect(pressed(view, '입금 기록')).toBe('true'));
  expect(view.getByRole('button', { name: /이하린/ }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByText('입금 기록 · 이하린')).toBeTruthy();
});

it('청구서 표의 예정일은 분납이면 지금 기한과 그 회차다 — 둘 다 서버 값 (N-79)', async () => {
  const split = inv({
    id: 44, studentName: '고은성', dueOn: '2026-10-30', nextDueOn: '2026-09-28', nextInstallmentSeq: 2,
    installments: [
      { seq: 1, dueOn: '2026-08-28', amount: 100000, covered: true },
      { seq: 2, dueOn: '2026-09-28', amount: 100000, covered: false },
      { seq: 3, dueOn: '2026-10-30', amount: 50000, covered: false },
    ],
  });
  // 판은 비운다 — 같은 이름이 카드와 표 두 곳에 서지 않게
  nav.search = 'tab=inv';
  const { view } = mount((c) => (c.url === '/accounting/board' ? { ...board(), stages: [] } : accounting([split, inv({})])));
  await waitFor(() => expect(view.getByText('고은성')).toBeTruthy());
  const due = (name: string) => within(view.getByText(name).closest('tr')!).getAllByRole('cell')[8].textContent;
  expect(due('고은성')).toBe('2026-09-282회차');
  expect(due('양찬욱')).toBe('2026-09-30');
});

/**
 * 회계 쓰기 뒤에는 **회계 갈래를 통째로** 다시 읽는다 — 전에는 `/accounting` 한 질의만 버려서
 * 「학부모 안내 →」를 눌러도 판(`/accounting/board`)이 옛 칸에 카드를 세워 두었다.
 */
it('「학부모 안내 →」(전달) 뒤에는 판을 다시 읽는다 — 카드가 저절로 다음 칸으로 옮는다', async () => {
  const b = board();
  b.stages[1] = { ...b.stages[1], count: 1, amount: 200000, cards: [{
    invId: 45, studentId: 9, studentName: '박하경', grade: 'G11', studentTag: 'G11', invType: 'tuition', invTypeLabel: '수업료 청구', title: '2026년 9월 수업료 청구',
    stateLabel: '작성 중', amount: 200000, paid: 0, paidPercent: null, dueOn: '2026-09-30', overdueDays: 0, whenLabel: 'D-12' }] };
  let boardReads = 0;
  nav.search = 'tab=inv';
  const { view, seen } = mount((c) => {
    if (c.url === '/accounting/board') { boardReads += 1; return b; }
    if (c.method === 'post') return inv({ id: 45, studentName: '박하경', state: 'sent' });
    return accounting([inv({ id: 45, studentName: '박하경', state: 'draft', canDeliver: true })]);
  });
  await waitFor(() => expect(view.getByRole('button', { name: '박하경 학부모 안내 →' })).toBeTruthy());
  expect(boardReads).toBe(1);
  fireEvent.click(view.getByRole('button', { name: '박하경 학부모 안내 →' }));
  await waitFor(() => expect(seen.some((c) => c.method === 'post' && c.url === '/accounting/invoices/45/deliver')).toBe(true));
  await waitFor(() => expect(boardReads).toBe(2));
});

/* ── W11 M2 — 회계 비공개(N-94) · 가산 규칙(N-93). 금액 글자는 `lib/money` 로 만든다 ── */

it('부제 뒤 절이 되살아나고, 컨설팅 비공개로 가려진 줄은 「비공개」 — 입금 줄의 null 은 컨설팅일 때만 「비공개」, 그 밖은 「미확인」 (N-94)', async () => {
  nav.search = 'tab=inv';
  const hidden = { ...PRIVACY, canSeeHidden: false, switches: PRIVACY.switches.map((x) => (x.key === 'consulting' ? { ...x, private: true } : x)) };
  const data: Accounting = {
    ...accounting([
      inv({ id: 42 }),
      inv({ id: 43, invType: 'consulting', invTypeLabel: '컨설팅비 청구', studentName: '김하늘', amount: null, paidAmount: null, remaining: null }),
    ]),
    payments: [
      { id: 1, studentName: '김하늘', paidOn: '2026-09-12', amount: null, method: 'bank', category: 'consulting', categoryLabel: '컨설팅비' },
      { id: 2, studentName: '미확인 학생', paidOn: null, amount: null, method: null, category: 'etc', categoryLabel: '기타' },
    ],
  };
  const { view } = mount((c) => (
    c.url === '/accounting/privacy' ? hidden
      : c.url === '/accounting/board' ? board()
        : c.url === '/accounting/cashflow' ? flow() : data));
  expect(view.getByText('매출 · 수납 · 지출 · 결산을 한 곳에서 봅니다 · 개별 내역을 비공개로 지정할 수 있습니다')).toBeTruthy();
  await waitFor(() => expect(view.getByText('김하늘')).toBeTruthy());
  const cells = (name: string) => within(view.getAllByText(name).at(-1)!.closest('tr')!).getAllByRole('cell').map((c) => c.textContent);
  await waitFor(() => expect(view.getByRole('button', { name: '컨설팅 비공개' }).getAttribute('aria-pressed')).toBe('true'));
  expect(cells('김하늘').slice(4, 7)).toEqual([MASKED, MASKED, MASKED]);
  expect(cells('양찬욱')[4]).toBe(won(250000));
  fireEvent.click(within(view.getByRole('group', { name: '회계 탭' })).getByRole('button', { name: '들어온 돈' }));
  await waitFor(() => expect(view.getByText('미확인 학생')).toBeTruthy());
  expect(cells('김하늘')[3]).toBe(MASKED);
  expect(cells('미확인 학생')[3]).toBe('미확인');
});

it('강사료 정산 왼쪽 「추가로 드리는 돈」은 오늘 걸린 가산을 읽기만 하고 「정리 · 기준 › 가산 규칙」으로 데려간다 (N-93)', async () => {
  nav.search = 'tab=payout';
  const BOOK = {
    today: '2026-09-18', canWrite: true, rule: '가산은 리포트를 쓴 수업에만 붙습니다',
    slots: [
      { kind: 'per_session', kindKey: 'mock', label: '모의수업', hint: '한 번에 얼마', d1Amount: 15000, currentAmount: 15000, currentFrom: '2026-09-18', nextAmount: null, nextFrom: null, applied: true, note: null },
      { kind: 'group_per_student', kindKey: null, label: '그룹 학생 한 명 늘 때', hint: '한 명당', d1Amount: 5000, currentAmount: null, currentFrom: null, nextAmount: null, nextFrom: null, applied: true, note: null },
    ],
    rules: [],
  };
  const { view, seen } = mount((c) => (
    c.url === '/accounting/payouts' ? SHEET
      : c.url === '/accounting/bonus-rules' ? BOOK
        : c.url === '/accounting/privacy' ? PRIVACY : accounting()));
  const box = await view.findByRole('region', { name: '추가로 드리는 돈' });
  expect(box.textContent).toContain(`모의수업한 번에 얼마${won(15000)}`);
  expect(box.textContent).toContain('그룹 학생 한 명 늘 때한 명당없음');
  fireEvent.click(within(box).getByRole('button', { name: '정리 · 기준 › 가산 규칙에서 바꿉니다 ›' }));
  await waitFor(() => expect(pressed(view, '가산 규칙')).toBe('true'));
  await waitFor(() => expect(view.getByText('가산은 리포트를 쓴 수업에만 붙습니다')).toBeTruthy());
  // 두 자리가 같은 규칙 질의(같은 키 · 같은 경로)를 읽는다 — 세는 곳이 둘이 되지 않는다
  expect(new Set(seen.filter((c) => c.url?.includes('bonus')).map((c) => c.url))).toEqual(new Set(['/accounting/bonus-rules']));
});

it('「정리 · 기준 › 시급」 — 시급 비공개로 가려진 줄(적용일은 있고 값이 null)은 「비공개」, 줄이 없으면 「—」 (N-94)', async () => {
  nav.search = 'tab=wage';
  const member = (id: number, name: string, over: Record<string, unknown> = {}) => ({
    id, name, loginId: `u${id}`, email: null, role: 'teacher', active: true, wageRate: 42000, wageFrom: '2026-01-01', wageable: true, ...over,
  });
  const drawer = { canWage: true, members: [member(6, '이다현', { wageRate: null }), member(8, '김새강사', { wageRate: null, wageFrom: null })] };
  const { view } = mount((c) => (c.url === '/drawer' ? drawer : c.url === '/accounting/privacy' ? PRIVACY : accounting()));
  await waitFor(() => expect(view.getByText('이다현')).toBeTruthy());
  const row = (name: string) => within(view.getByText(name).closest('tr')!).getAllByRole('cell').map((c) => c.textContent);
  expect(row('이다현')).toEqual(['이다현', MASKED, '2026-01-01', '시급 수정']);
  expect(row('김새강사')).toEqual(['김새강사', '—', '—', '시급 수정']);
});
