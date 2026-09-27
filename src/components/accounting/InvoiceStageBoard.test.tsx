/** @file-guide
 * 목적: §53 청구서 탭 다섯 칸 판 — 칸 · 카드 · 다음 칸 단추가 서버 값대로 서는지 (W11 · N-28 ②).
 * 책임/재사용: 실제 InvoiceStageBoard/useInvoiceAction 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { InvBoard, InvBoardCandidate, InvBoardCard, InvStageColumn, Invoice } from '@/api/types';
import { InvoiceStageBoard } from './InvoiceStageBoard';
import { MASKED } from '@/lib/money';

const card = (over: Partial<InvBoardCard> = {}): InvBoardCard => ({
  invId: 1, studentId: 1, studentName: '고은성', grade: 'G12', invType: 'consulting', invTypeLabel: '컨설팅비 청구',
  title: '대입 컨설팅 · 연간 패키지', stateLabel: '작성 중', amount: 4_800_000, paid: 0, paidPercent: null,
  dueOn: '2026-09-20', overdueDays: 0, whenLabel: 'D-21', ...over,
});
const cand = (over: Partial<InvBoardCandidate> = {}): InvBoardCandidate => ({
  studentId: 5, studentName: '서지호', grade: 'G9', yearMonth: '2026-09', invType: 'diag_intake', invTypeLabel: '진단고사 + 상담 비용',
  title: '2026년 9월 진단고사 + 상담 비용', amount: 150_000, canIssue: true, issueBlockedReason: null, ...over,
});
const col = (key: string, label: string, sub: string, next: InvStageColumn['next'], nextLabel: string | null, over: Partial<InvStageColumn> = {}): InvStageColumn => ({
  key: key as InvStageColumn['key'], label, sub, next, nextLabel, count: 0, amount: 0, cards: [], candidates: [], ...over,
});

/** 원문 §53 컷의 다섯 칸 — 이름 · 한 줄 · 다음 칸 단추 낱말은 서버 값이다 */
const board = (): InvBoard => ({
  canSeeAmounts: true,
  candidateMonth: '2026-09',
  columns: [],
  stages: [
    col('todo', '아직 안 씀', '청구서를 만들어야 합니다', 'issue', '청구서 작성 →', {
      count: 2, amount: 150_000,
      candidates: [cand(), cand({ studentId: 6, studentName: '김태린', invType: 'tuition', invTypeLabel: '수업료 청구', title: '2026년 9월 수업료 청구', amount: null, canIssue: false, issueBlockedReason: '단가표에 없는 과목이 있습니다: SAT Math — 단가를 먼저 등록하세요' })],
    }),
    col('draft', '청구서 작성', '보낼 준비가 됐습니다', 'deliver', '학부모 안내 →', {
      count: 2, amount: 5_000_000,
      cards: [card({ overdueDays: 11, whenLabel: '11일 지남' }), card({ invId: 2, studentName: '박하경', invType: 'tuition', invTypeLabel: '수업료 청구', title: '9월 수업료', amount: 200_000 })],
    }),
    col('sent', '학부모 안내', '보냈습니다 · 입금을 기다립니다', 'pay', '입금 완료 →', {
      count: 1, amount: 600_000, cards: [card({ invId: 3, studentName: '이하린', title: '보딩스쿨 EC 컨설팅 · 정기', amount: 600_000, stateLabel: '보냄', whenLabel: 'D-4' })],
    }),
    col('paid', '입금 완료', '돈이 들어왔습니다', null, null, {
      count: 1, amount: 1_170_000, cards: [card({ invId: 4, studentName: '강라율', invType: 'tuition', invTypeLabel: '수업료 청구', title: '8월 수업료', amount: 1_170_000, stateLabel: '완납' })],
    }),
    col('record', '입금 기록', '장부에 넣었습니다', null, null, {
      count: 1, amount: 2_200_000, cards: [card({ invId: 5, studentName: '고은설', title: 'BHA 원서 컨설팅 · 1차', amount: 2_200_000, paid: 1_100_000, paidPercent: 50, stateLabel: '일부 납부', whenLabel: 'D-16' })],
    }),
  ],
});

/** 「학부모 안내 →」가 서는지는 청구서 줄의 서버 `canDeliver` 다 — 표본은 1번만 전달할 수 있다 */
const invoice = (id: number, canDeliver: boolean) => ({ id, canDeliver } as unknown as Invoice);

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const posted: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; posted.length = 0; });

function setup(data: InvBoard = board(), deliver: { status: number; data: unknown } = { status: 201, data: {} }) {
  api.defaults.adapter = (async (config: { url?: string; method?: string }) => {
    if (config.method === 'post') {
      posted.push(config.url ?? '');
      if (deliver.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: deliver.status, data: deliver.data } }));
      return { config, status: deliver.status, statusText: 'OK', headers: {}, data: deliver.data };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onIssue = vi.fn();
  const onPay = vi.fn();
  const onOpen = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <InvoiceStageBoard data={data} invoices={[invoice(1, true), invoice(2, false)]} onIssue={onIssue} onPay={onPay} onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return { view, onIssue, onPay, onOpen };
}
const colOf = (v: ReturnType<typeof render>, label: string) => within(v.getByText(label).closest('section')!);

it('칸 다섯은 컷의 이름 · 한 줄 · 차례 그대로이고 1~5 번호가 선다 — 칸 합계는 서버 값이다', () => {
  const { view } = setup();
  const heads = [...view.container.querySelectorAll('section > header > div:first-child > span:first-child')].map((h) => [h.children[0]?.textContent, h.children[1]?.textContent]);
  expect(heads).toEqual([['1', '아직 안 씀'], ['2', '청구서 작성'], ['3', '학부모 안내'], ['4', '입금 완료'], ['5', '입금 기록']]);
  for (const sub of ['청구서를 만들어야 합니다', '보낼 준비가 됐습니다', '보냈습니다 · 입금을 기다립니다', '돈이 들어왔습니다', '장부에 넣었습니다']) {
    expect(view.getByText(sub)).toBeTruthy();
  }
  // ① 의 합은 낼 수 있는 대상의 예상 금액 합(서버) — 막힌 대상은 빠진 값을 화면이 다시 더하지 않는다
  expect(colOf(view, '아직 안 씀').getAllByText('₩150,000')).toHaveLength(2);
  // 칸 윗선 — 회색 · 파랑 · 청록 · 초록 · 검정
  const sections = [...view.container.querySelectorAll('section')].map((s) => s.className);
  expect(sections[0]).toContain('border-t-fg-subtle');
  expect(sections[1]).toContain('border-t-blue');
  expect(sections[2]).toContain('border-t-teal');
  expect(sections[3]).toContain('border-t-green');
  expect(sections[4]).toContain('border-t-fg');
});

it('① 「아직 안 씀」 카드는 청구서가 없어 「—」 · 번호도 「열기」도 없고, 「청구서 작성 →」이 그 대상을 발행 창에 넘긴다', () => {
  const { view, onIssue } = setup();
  const todo = colOf(view, '아직 안 씀');
  expect(todo.getAllByText('—').length).toBeGreaterThan(0);
  expect(todo.queryByRole('button', { name: /열기/ })).toBeNull();
  expect(todo.getByText('2026년 9월 진단고사 + 상담 비용')).toBeTruthy();
  fireEvent.click(todo.getByRole('button', { name: '서지호 2026년 9월 진단고사 + 상담 비용 청구서 작성 →' }));
  expect(onIssue).toHaveBeenCalledWith(expect.objectContaining({ studentId: 5, yearMonth: '2026-09', invType: 'diag_intake' }));
});

it('못 내는 대상도 숨기지 않는다 — 단추는 잠기고 까닭은 발행 409 와 같은 서버 문장이다', () => {
  const { view, onIssue } = setup();
  const todo = colOf(view, '아직 안 씀');
  const btn = todo.getByRole('button', { name: '김태린 2026년 9월 수업료 청구 청구서 작성 →' }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  expect(btn.title).toBe('단가표에 없는 과목이 있습니다: SAT Math — 단가를 먼저 등록하세요');
  expect(todo.getByText('단가표에 없는 과목이 있습니다: SAT Math — 단가를 먼저 등록하세요')).toBeTruthy();
  fireEvent.click(btn);
  expect(onIssue).not.toHaveBeenCalled();
});

it('② 「학부모 안내 →」는 서버가 전달을 허락한 청구서에만 서고, 누르면 전달 쓰기를 부른다', async () => {
  const { view } = setup();
  const draft = colOf(view, '청구서 작성');
  expect(draft.queryByRole('button', { name: '박하경 학부모 안내 →' })).toBeNull();
  fireEvent.click(draft.getByRole('button', { name: '고은성 학부모 안내 →' }));
  await waitFor(() => expect(posted).toEqual(['/accounting/invoices/1/deliver']));
});

it('전달이 막히면 그 카드 밑에 서버 문장을 그대로 둔다', async () => {
  const { view } = setup(board(), { status: 409, data: { code: 'MONTH_CLOSED', message: '2026년 9월은 마감됐습니다' } });
  fireEvent.click(colOf(view, '청구서 작성').getByRole('button', { name: '고은성 학부모 안내 →' }));
  await waitFor(() => expect(view.getByText('2026년 9월은 마감됐습니다')).toBeTruthy());
});

it('③ 「입금 완료 →」는 입금 기록을 그 청구서로 연다 · 「열기」는 그 청구서 줄로 간다', () => {
  const { view, onPay, onOpen } = setup();
  const sent = colOf(view, '학부모 안내');
  fireEvent.click(sent.getByRole('button', { name: '이하린 입금 완료 →' }));
  expect(onPay).toHaveBeenCalledWith(3);
  fireEvent.click(sent.getByRole('button', { name: '이하린 청구서 열기' }));
  expect(onOpen).toHaveBeenCalledWith(3);
});

it('④ · ⑤ 에는 다음 칸 단추가 없다 — 건너뛰기 · 되돌리기도 없다 · 「50% 냄」은 서버 비율 그대로', () => {
  const { view } = setup();
  const paid = colOf(view, '입금 완료');
  const record = colOf(view, '입금 기록');
  expect(paid.getAllByRole('button').map((b) => b.textContent)).toEqual(['열기']);
  expect(record.getAllByRole('button').map((b) => b.textContent)).toEqual(['열기']);
  expect(record.getByText('50% 냄')).toBeTruthy();
});

it('카드 머리는 종류 칩 · 이름 · 서버의 「D-N / N일 지남」이고, 기한 지난 카드는 분홍 바탕 · 붉은 테두리다', () => {
  const { view } = setup();
  const draft = colOf(view, '청구서 작성');
  const overdue = draft.getByText('11일 지남');
  expect(overdue.className).toContain('text-red');
  expect(overdue.closest('article')!.className).toContain('border-red/60');
  expect(draft.getByText('D-21').closest('article')!.className).not.toContain('border-red/60');
  // 종류 칩의 낱말은 서버 invTypeLabel · 빛깔은 §55 분류와 같은 한 벌(컨설팅 분홍 · 수업료 파랑)
  expect(draft.getAllByText('컨설팅비 청구')[0].className).toContain('bg-pink');
  expect(draft.getByText('수업료 청구').className).toContain('bg-blue');
});

it('금액을 못 보면 칸 합계 · 카드 금액은 숨긴 금액 낱말(「비공개」)이고 까닭 한 줄이 선다 (D-R39)', () => {
  const d = board();
  d.canSeeAmounts = false;
  d.stages = d.stages.map((s) => ({ ...s, amount: null, cards: s.cards.map((c) => ({ ...c, amount: null, paid: null, paidPercent: null })) }));
  const { view } = setup(d);
  expect(view.getByText(/금액은 대표만 봅니다/)).toBeTruthy();
  expect(colOf(view, '입금 기록').queryByText('50% 냄')).toBeNull();
  expect(colOf(view, '입금 기록').getAllByText(MASKED).length).toBeGreaterThan(0);
});
