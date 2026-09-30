/** @file-guide
 * 목적: ApprovalFlowDialog.test.tsx — §75 결재 흐름의 서버 projection·순서·읽기 전용 회귀
 * 책임/재사용: 생성 타입 fixture로 표시 계약만 검증하며 제품 집계 규칙을 테스트 안에서 재구현하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalFlow, ApprovalFlowItem } from '@/api/types';
import { ApprovalFlowDialog } from './ApprovalFlowDialog';
import { approvalKindLabel } from './ApprovalRowContent';

const kinds = [
  ['rpt', '대표 보고', '대표에게', 0],
  ['plan', '기획 결재', '대표에게', 1],
  ['req', '강사 요청', '실장에게', 2],
  ['chreq', '변경 요청', '실장에게', 0],
  ['gpapack', '자료 요청', '실장에게', 1],
] as const;

function item(overrides: Partial<ApprovalFlowItem> = {}): ApprovalFlowItem {
  return {
    kind: 'plan',
    kindLabel: '기획 결재',
    id: 21,
    title: '자습 관리 프로그램 정규화',
    sub: '마감 08-19',
    byId: 7,
    byName: '김범준',
    to: 'ceo',
    toLabel: '대표에게',
    at: '2026-08-07T10:24:00+09:00',
    state: 'back',
    why: '근거 자료를 보강해 주세요',
    go: '/ops?tab=plan&plan=21',
    ...overrides,
    toName: overrides.toName ?? '대표',
  };
}

const flow: ApprovalFlow = {
  canView: true,
  tiles: kinds.map(([kind, kindLabel, toLabel, count]) => ({
    kind,
    kindLabel,
    to: toLabel === '대표에게' ? 'ceo' : 'head',
    toLabel,
    count,
  })),
  back: [item()],
  waiting: [item({
    kind: 'req', kindLabel: '강사 요청', id: 22, title: '강사 요청', byName: 'Sophia',
    to: 'head', toName: '실장', toLabel: '실장에게', state: 'waiting', why: null, go: '/ops?tab=todo&request=22',
  })],
  mine: [item({
    kind: 'gpapack', kindLabel: '자료 요청', id: 23, title: '시험 대비 자료 요청',
    byName: '김민수', state: 'mine', why: null, go: '/books?tab=requests&pack=23',
  })],
  total: 4,
  backCount: 1,
};

afterEach(cleanup);

describe('§75 결재 흐름', () => {
  it('§14 fallback 종류 이름도 공유 함수 한 곳에서 유지한다', () => {
    expect(approvalKindLabel('gpapack')).toBe('자료 요청');
    expect(approvalKindLabel('future-kind')).toBe('future-kind');
  });

  it('서버가 준 exact 5종 타일과 back → waiting → mine 순서를 그대로 그린다', () => {
    const view = render(<ApprovalFlowDialog open flow={flow} onClose={vi.fn()} />);
    const tiles = view.getByLabelText('결재 종류별 대기 건수');
    expect(within(tiles).getAllByText(/대표 보고|기획 결재|강사 요청|변경 요청|자료 요청/).map((node) => node.textContent))
      .toEqual(['대표 보고', '기획 결재', '강사 요청', '변경 요청', '자료 요청']);
    expect(view.getByText(/지금 4건 대기 · 되돌아온 것 1건/)).toBeTruthy();
    // 절 머리는 원문 낱말 그대로 — 「되돌아온 것 1건 · 고쳐서 다시 올려주세요」 · 「기다리는 것 4건」 (g2 75-4)
    expect(view.getAllByRole('heading', { level: 3 }).map((node) => node.textContent))
      .toEqual(['되돌아온 것1건 · 고쳐서 다시 올려주세요', '기다리는 것4건', '내가 올린 것1건']);
  });

  /* g2 대조 75-4 · 75-5 — 되돌아온 것은 붉은 머리, 「내가 올린 것」은 줄이 있을 때만 선다 */
  it('되돌아온 것 머리는 붉고, 내가 올린 것이 없으면 그 절이 없다', () => {
    const view = render(<ApprovalFlowDialog open flow={{ ...flow, mine: [] }} onClose={vi.fn()} />);
    expect(view.getByText('되돌아온 것').className).toContain('text-red');
    expect(view.queryByText('내가 올린 것')).toBeNull();
  });

  /* g2 대조 75-3 — 타일은 큰 숫자(종류 색) → 종류 이름 → 받는 이, 건수가 있는 타일은 종류 색 테두리·옅은 바탕 */
  it('타일은 숫자 → 이름 → 받는 이 차례이고, 건수가 있으면 종류 색 테두리를 두른다', () => {
    const view = render(<ApprovalFlowDialog open flow={flow} onClose={vi.fn()} />);
    const tiles = within(view.getByLabelText('결재 종류별 대기 건수'));
    const req = tiles.getByText('강사 요청').parentElement!;
    expect([...req.children].map((c) => c.textContent)).toEqual(['2', '강사 요청', '실장에게']);
    expect(req.className).toContain('border-amber/50');
    expect(req.firstElementChild!.className).toContain('text-amber');
    const rpt = tiles.getByText('대표 보고').parentElement!;
    expect(rpt.className).not.toContain('/50');
  });

  /* g2 대조 75-2 · 공용 × — 줄마다 종류 색 세로 띠, 머리 오른쪽 × 는 창을 닫는다 */
  it('줄은 종류 색 세로 띠를 두르고, 머리 × 로도 닫힌다', () => {
    const close = vi.fn();
    const view = render(<ApprovalFlowDialog open flow={flow} onClose={close} />);
    const req = view.getByRole('link', { name: '강사 요청 원본 열기' });
    expect(req.className).toContain('border-l-4');
    expect(req.className).toContain('border-l-amber');
    // 배지도 같은 종류 색이다 — 되돌아온 줄의 배지도 붉게 바꾸지 않는다(줄 바탕이 말한다)
    expect(within(view.getByRole('link', { name: '자습 관리 프로그램 정규화 원본 열기' })).getByText('기획 결재').className)
      .toContain('bg-violet');
    fireEvent.click(view.getByRole('button', { name: '창 닫기' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('반려 사유·발신자→수신자·원본 deep link만 제공하고 승인/반려 동작은 만들지 않는다', () => {
    const close = vi.fn();
    const view = render(<ApprovalFlowDialog open flow={flow} onClose={close} />);
    expect(view.getByText(/근거 자료를 보강해 주세요/)).toBeTruthy();
    expect(view.getByText(/김범준 → 대표/)).toBeTruthy();
    expect(view.getByText(/Sophia → 실장/)).toBeTruthy();
    expect(view.getAllByText('08-07 10:24').length).toBeGreaterThan(0);
    expect(view.queryByText('2026-08-07 10:24')).toBeNull();
    expect(view.getByRole('link', { name: '자습 관리 프로그램 정규화 원본 열기' }).getAttribute('href'))
      .toBe('/ops?tab=plan&plan=21');
    expect(view.queryByRole('button', { name: '승인' })).toBeNull();
    expect(view.queryByRole('button', { name: '반려' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '닫기' }));
    expect(close).toHaveBeenCalledOnce();
  });

  /* g2 대조 75-2 — 원문 줄은 한 줄이다: 배지 · 굵은 제목 · 회색 부제 … 오른쪽 「보낸 이 → 받는 이」 · 날짜 · › */
  it('§75 줄은 한 줄 모양이다 — 경로는 부제와 붙지 않고 오른쪽에 따로 서며 끝에 이동 표시가 있다', () => {
    const view = render(<ApprovalFlowDialog open flow={flow} onClose={vi.fn()} />);
    const link = view.getByRole('link', { name: '자습 관리 프로그램 정규화 원본 열기' });
    const route = within(link).getByText('김범준 → 대표');
    expect(route.className).toContain('font-bold');
    expect(within(link).getByText('마감 08-19')).toBeTruthy();
    // 옛 두 줄 모양 「김범준 → 대표 · 마감 08-19」 으로 이어 붙이지 않는다
    expect(within(link).queryByText(/김범준 → 대표 · 마감/)).toBeNull();
    // 배지·제목·경로·날짜가 한 줄(같은 부모)에 있다
    expect(route.parentElement).toBe(within(link).getByText('자습 관리 프로그램 정규화').parentElement);
    expect(link.querySelector('svg')).not.toBeNull();
  });

  /* H-83 · H-84 (2026-09-30 대표 답변 「지출 갈래 추가」 · N-64 번복) — 여섯째 갈래는 서버 tiles 를 그대로 따른다 */
  it('지출 갈래 — 여섯째 타일과 되돌아온 지출 줄(사유 · 주황 띠)을 서버 projection 그대로 그린다', () => {
    const expenseFlow: ApprovalFlow = {
      ...flow,
      tiles: [...flow.tiles, { kind: 'expense', kindLabel: '지출 결재', to: 'ceo', toLabel: '대표에게', count: 1 }],
      back: [item({
        kind: 'expense', kindLabel: '지출 결재', id: 31, title: '교재 인쇄비', sub: '38,000원',
        byName: '강민지', why: '영수증을 붙여 주세요', go: '/accounting?tab=out&expense=31',
      })],
    };
    const view = render(<ApprovalFlowDialog open flow={expenseFlow} onClose={vi.fn()} />);
    const tiles = within(view.getByLabelText('결재 종류별 대기 건수'));
    expect(tiles.getAllByText(/대표 보고|기획 결재|강사 요청|변경 요청|자료 요청|지출 결재/).map((node) => node.textContent))
      .toEqual(['대표 보고', '기획 결재', '강사 요청', '변경 요청', '자료 요청', '지출 결재']);
    const tile = tiles.getByText('지출 결재').parentElement!;
    expect([...tile.children].map((c) => c.textContent)).toEqual(['1', '지출 결재', '대표에게']);
    expect(tile.className).toContain('border-orange/50');
    const row = view.getByRole('link', { name: '교재 인쇄비 원본 열기' });
    expect(row.className).toContain('border-l-orange');
    expect(row.getAttribute('href')).toBe('/accounting?tab=out&expense=31');
    expect(view.getByText(/영수증을 붙여 주세요/)).toBeTruthy();
    // 이동만 — 여섯째 갈래에도 승인 · 반려 단추는 없다(D-R27)
    expect(view.queryByRole('button', { name: '승인' })).toBeNull();
    expect(approvalKindLabel('expense')).toBe('지출');
  });

  it('닫혀 있으면 결재 데이터가 DOM에 없다', () => {
    const view = render(<ApprovalFlowDialog open={false} flow={flow} onClose={vi.fn()} />);
    expect(view.queryByText('결재 흐름')).toBeNull();
    expect(view.queryByText('자습 관리 프로그램 정규화')).toBeNull();
  });
});
