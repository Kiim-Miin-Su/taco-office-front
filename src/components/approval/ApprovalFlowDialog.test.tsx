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
    expect(view.getAllByRole('heading', { level: 3 }).map((node) => node.textContent))
      .toEqual(['되돌아온 것1', '기다리는 것4', '내가 올린 것']);
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

  it('닫혀 있으면 결재 데이터가 DOM에 없다', () => {
    const view = render(<ApprovalFlowDialog open={false} flow={flow} onClose={vi.fn()} />);
    expect(view.queryByText('결재 흐름')).toBeNull();
    expect(view.queryByText('자습 관리 프로그램 정규화')).toBeNull();
  });
});
