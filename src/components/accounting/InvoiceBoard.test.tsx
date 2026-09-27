/** @file-guide
 * 목적: §52 회계 트래킹 보드 — 화면이 칸을 고르지 않는다 (C69).
 * 책임/재사용: 실제 InvoiceBoard 를 쓰고 props 로만 상태를 준다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { InvBoard } from '@/api/types';
import { InvoiceBoard } from './InvoiceBoard';

const card = (over: Partial<InvBoard['columns'][number]['cards'][number]> = {}) => ({
  invId: 1, studentId: 1, studentName: '고은설', grade: 'G8',
  invType: 'consulting', invTypeLabel: '컨설팅비 청구', title: 'BHA 원서 컨설팅 · 1차',
  stateLabel: '일부 납부', amount: 2_200_000, paid: 1_100_000, paidPercent: 50,
  dueOn: '2026-08-16', overdueDays: 0, whenLabel: 'D-16', ...over,
});

const base: InvBoard = {
  canSeeAmounts: true,
  // §53 다섯 칸(W11 · N-28 ②)은 이 부품이 그리지 않는다 — 같은 응답의 다른 칸이다
  stages: [],
  candidateMonth: '2026-08',
  columns: [
    { key: 'draft', label: '청구서 작성', sub: '아직 안 만들었습니다', count: 1, amount: 150_000, cards: [card({ invId: 9, studentName: '서지호', title: '진단고사 + 1차 상담', stateLabel: '작성 중', amount: 150_000, paid: 0, paidPercent: null })] },
    { key: 'sent', label: '청구서 전달', sub: '보냈습니다 · 입금을 기다립니다', count: 0, amount: 0, cards: [] },
    { key: 'paid', label: '입금 완료', sub: '돈이 들어왔습니다', count: 0, amount: 0, cards: [] },
    { key: 'record', label: '입금 기록', sub: '장부에 넣었습니다', count: 1, amount: 2_200_000, cards: [card()] },
  ],
};
const clone = (): InvBoard => JSON.parse(JSON.stringify(base)) as InvBoard;

afterEach(cleanup);

const colOf = (v: ReturnType<typeof render>, label: string) =>
  within(v.getByText(label).closest('section')!);

it('칸 넷은 컷의 이름과 한 줄 설명을 그대로 쓴다 — 비어도 선다', () => {
  const v = render(<InvoiceBoard data={clone()} />);
  for (const [label, sub] of [
    ['청구서 작성', '아직 안 만들었습니다'],
    ['청구서 전달', '보냈습니다 · 입금을 기다립니다'],
    ['입금 완료', '돈이 들어왔습니다'],
    ['입금 기록', '장부에 넣었습니다'],
  ]) {
    expect(v.getByText(label)).toBeTruthy();
    expect(v.getByText(sub)).toBeTruthy();
  }
  expect(colOf(v, '입금 완료').getByText('없습니다')).toBeTruthy();
});

/** 원문 §52 칸 머리의 번호 ①②③④ — 옮겨 가는 순서를 번호로 적는다 (w5 · 52-01) */
it('칸 머리에 1~4 번호가 칸의 자리대로 선다', () => {
  const v = render(<InvoiceBoard data={clone()} />);
  const heads = [...v.container.querySelectorAll('section > header > div > span:first-child')].map((h) => [h.children[0]?.textContent, h.children[1]?.textContent]);
  expect(heads).toEqual([['1', '청구서 작성'], ['2', '청구서 전달'], ['3', '입금 완료'], ['4', '입금 기록']]);
});

/**
 * 화면이 `stateLabel` 을 읽어 칸을 고르면 **판정이 두 벌**이 된다 (N-28 · 대표 결정).
 * 서버가 「일부 납부」 카드를 어느 칸에 넣든 화면은 그 칸에 그린다.
 */
it('카드는 **서버가 넣어 준 칸**에 그대로 선다 — 화면이 상태로 다시 고르지 않는다', () => {
  const d = clone();
  // 서버가 완납 카드를 「청구서 전달」 칸에 넣었다면 화면은 거기 그린다
  d.columns[1].cards = [card({ invId: 7, studentName: '강라율', stateLabel: '입금 완료', paidPercent: null })];
  d.columns[1].count = 1;
  const v = render(<InvoiceBoard data={d} />);
  expect(colOf(v, '청구서 전달').getByText('강라율')).toBeTruthy();
  expect(colOf(v, '입금 완료').getByText('없습니다')).toBeTruthy();
});

it('칸 합계도 서버 값이다 — 화면이 카드를 더하지 않는다 (D-R37)', () => {
  const d = clone();
  // 카드는 하나인데 서버가 5,400,000 이라 했다면 그것이 맞다 — 안 보이는 건까지 센 값이다
  d.columns[3].amount = 5_400_000;
  const v = render(<InvoiceBoard data={d} />);
  expect(colOf(v, '입금 기록').getByText('₩5,400,000')).toBeTruthy();
});

/*
 * 원문 §52 카드는 **한 줄**이다 — 이름 · 학년 칩(+ 연체 칩) · 「자세히 ›」 (x5 · 52-02 · D-R44).
 * 금액·종류·「N% 냄」은 칸 머리 합계와 청구서 탭 줄이 말한다 — 「자세히 ›」가 그 줄로 간다 (52-03).
 */
it('카드는 한 줄 — 이름 · 학년 · 「자세히 ›」가 그 청구서 줄로 보낸다 (52-02 · 52-03)', () => {
  const d = clone();
  d.columns[3].cards[0].paidPercent = 73;
  const onOpen = vi.fn();
  const v = render(<InvoiceBoard data={d} onOpenInvoice={onOpen} />);
  expect(v.queryByText('73% 냄')).toBeNull();
  const col = colOf(v, '입금 기록');
  fireEvent.click(col.getByRole('button', { name: /청구서 자세히$/ }));
  expect(onOpen).toHaveBeenCalledWith(d.columns[3].cards[0].invId);
});

it('윗선·채운 번호·큰 건수 — 넷째 「입금 기록」은 검정이다 (§52 윗선 · x5)', () => {
  const v = render(<InvoiceBoard data={clone()} />);
  const record = v.container.querySelector('[data-board-column="record"]') as HTMLElement;
  expect(record.className).toContain('border-t-fg');
  const sent = v.container.querySelector('[data-board-column="sent"]') as HTMLElement;
  expect(sent.className).toContain('border-t-blue');
});

it('기한이 지나면 「연체」 칩이 선다 — 판정은 서버의 overdueDays', () => {
  const v = render(<InvoiceBoard data={clone()} />);
  expect(v.queryByText('연체')).toBeNull();

  cleanup();
  const d = clone();
  d.columns[3].cards[0] = card({ overdueDays: 7, whenLabel: '7일 지남' });
  const late = render(<InvoiceBoard data={d} />);
  expect(late.getByText('연체')).toBeTruthy();
});

it('금액을 못 보면 배너로 알리고 비율도 안 그린다 (D-R39)', () => {
  const d = clone();
  d.canSeeAmounts = false;
  d.columns = d.columns.map((c) => ({
    ...c, amount: null,
    cards: c.cards.map((x) => ({ ...x, amount: null, paid: null, paidPercent: null })),
  }));
  const v = render(<InvoiceBoard data={d} />);
  expect(v.getByText(/받은 비율도 내려오지 않습니다/)).toBeTruthy();
  expect(v.queryByText(/% 냄/)).toBeNull();
  // 카드와 이름은 그대로 보인다 — 세는 것은 금액과 무관하다
  expect(v.getByText('고은설')).toBeTruthy();
});

/**
 * 컷의 카드에는 「청구서 작성 →」 같은 다음 칸 단추가 있지만, 실제로 카드를 옮기는 것은
 * **입금과 발송**이다 (대표 결정 「자동 전이에 유리하게」). 눌러도 아무 일이 없는 단추를 두지 않는다.
 */
it('칸을 미는 단추를 두지 않는다 — 카드를 옮기는 것은 입금과 발송이다', () => {
  const v = render(<InvoiceBoard data={clone()} />);
  expect(v.queryByRole('button', { name: /→/ })).toBeNull();
});
