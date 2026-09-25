/** @file-guide
 * 목적: ConsultingStageBoard.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Consulting } from '@/api/types';
import { ConsultingStageBoard } from './ConsultingStageBoard';
import { CONSULTING_STAGE_FIXTURE, consultingItem } from './consulting.fixture';

const item = consultingItem;

describe('ConsultingStageBoard', () => {
  it('Figma §26의 세 단계와 계약 5칸을 한 보드에 표시한다', () => {
    const view = render(<ConsultingStageBoard stages={CONSULTING_STAGE_FIXTURE} items={[
      item({ id: 1, stage: 'contract', contractStep: 3 }),
      item({ id: 2, stage: 'running', contractStep: 5, sessions: 4, sessionsDone: 1, sessionsLog: [
        { id: 1, seq: 1, onDate: '2026-09-01', who: null, what: null, why: null, how: null, serId: null, done: true },
        { id: 2, seq: 2, onDate: '2026-12-01', who: null, what: null, why: null, how: null, serId: null, done: false },
      ] }),
      item({ id: 3, stage: 'done', contractStep: 5, endOn: '2026-08-15' }),
    ]} onOpen={() => undefined} />);

    expect(view.getByText('계약')).toBeTruthy();
    expect(view.getByText('진행')).toBeTruthy();
    expect(view.getByText('종료')).toBeTruthy();
    expect(view.getByRole('img', { name: '계약 3/5' }).children).toHaveLength(5);
    // 회차 바는 서버의 「한 회차」(sessionsDone)를 그린다 — 앞으로 잡아 둔 날짜(12/01)는 세지 않고 따로 말한다 (C95 · N-18)
    expect(view.getByRole('img', { name: '회차 1 / 약정 4회' }).firstElementChild?.classList.contains('bg-violet')).toBe(true);
    // 원본 §26 — 진행 카드는 막대 왼쪽 보라 「1/4회」, 앞으로 잡은 날짜는 따로 한 줄 (26-09)
    expect(view.getByText('1/4회').className).toContain('text-violet');
    expect(view.getByText('잡힌 날짜 1')).toBeTruthy();
    // 계약 카드는 막대만 — 「계약 3/5」 글은 없다
    expect(view.queryByText('계약 3/5')).toBeNull();
    expect(view.getByRole('img', { name: '계약 3/5' }).firstElementChild?.classList.contains('bg-blue')).toBe(true);
    expect(view.getByRole('img', { name: '컨설팅 종료' }).firstElementChild?.classList.contains('bg-green')).toBe(true);
    expect(view.getByRole('img', { name: '컨설팅 종료' }).firstElementChild?.getAttribute('style')).toContain('width: 100%');
    expect(view.getByText('2026-08-15 · 종료')).toBeTruthy();
  });

  it('열람 불가 카드는 기록 수를 추측하지 않고 상세도 열지 않는다', () => {
    const onOpen = vi.fn();
    const view = render(<ConsultingStageBoard stages={CONSULTING_STAGE_FIXTURE} items={[
      item({ canOpen: false, stage: 'running', contractStep: 5, sessions: 8, sessionsLog: [] }),
    ]} onOpen={onOpen} />);

    const button = view.getByRole('button', { name: '김민준 컨설팅 상세 잠김' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(view.getByText('회차 기록 잠김')).toBeTruthy();
    fireEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('카드는 기존 상세 패널을 여는 콜백만 호출한다', () => {
    const onOpen = vi.fn();
    const row = item({ id: 9 });
    const view = render(<ConsultingStageBoard stages={CONSULTING_STAGE_FIXTURE} items={[row]} onOpen={onOpen} />);

    fireEvent.click(view.getByRole('button', { name: '김민준 컨설팅 상세' }));
    expect(onOpen).toHaveBeenCalledWith(row);
  });
});

/**
 * 원본 §26 의 카드와 칸 — C86-e.
 *
 * 낱말은 하나도 화면에서 나오지 않는다. 서버가 이름을 바꿔 보내면 칩도 칸도 따라온다.
 */
describe('§26 카드와 칸 (C86-e)', () => {
  const board = (over: Partial<Consulting> = {}) => render(
    <ConsultingStageBoard
      stages={CONSULTING_STAGE_FIXTURE}
      items={[consultingItem({ amount: 900000, paidAmount: 400000, ...over })]}
      onOpen={() => undefined}
    />,
  );

  it('칸마다 번호와 **다음에 무엇을 하는지** 한 줄이 선다', () => {
    const text = board().container.textContent ?? '';
    for (const s of CONSULTING_STAGE_FIXTURE) {
      expect(text).toContain(s.label);
      expect(text).toContain(s.sub);
    }
  });

  it('칸 머리는 윗선 단계색(파랑 · 보라 · 초록)이고 번호 원이 단계색으로 채워진다 (26-05)', () => {
    const { container } = board();
    const col = (key: string) => container.querySelector(`[data-board-column="${key}"]`) as HTMLElement;
    expect(col('contract').className).toContain('border-t-blue');
    expect(col('running').className).toContain('border-t-violet');
    expect(col('done').className).toContain('border-t-green');
    expect(within(col('running')).getByText('2', { selector: 'span.h-5' }).className).toContain('bg-violet text-white');
  });

  it('칩 셋·요청자·담당·지난 날이 **서버가 준 낱말과 수** 그대로다 — 공개 칩은 원본의 짧은 낱말 「수납만」(26-08)', () => {
    const text = board({
      typeLabel: '에세이 지도', contractStepLabel: '피드백', share: 'money_only', shareLabel: '수납만 공개', shareChipLabel: '수납만',
      requesterLabel: '어머니', ownerName: '김범준', ageDays: 60,
    }).container.textContent ?? '';
    for (const w of ['에세이 지도', '피드백', '수납만', '어머니 · 김범준', '60일 지남']) {
      expect(text).toContain(w);
    }
    expect(text).not.toContain('수납만 공개');
  });

  it('시작 전·시작일 미정이면 「N일 지남」 칸이 서지 않는다 — 「0일 지남」을 적지 않는다 (26-10 · qa-w3)', () => {
    const text = board({ ageDays: null }).container.textContent ?? '';
    expect(text).not.toContain('일 지남');
  });

  it('금액쌍은 받은 돈 / 계약 금액이고 **못 보면 줄이 아예 없다** (D-R39)', () => {
    expect(board().container.textContent).toContain('₩400,000 / ₩900,000');
    // 한쪽만 보이면 나머지가 빼기로 드러난다 — 서버가 둘 다 null 로 내린다
    const hidden = board({ amount: null, paidAmount: null }).container.textContent ?? '';
    expect(hidden).not.toContain('₩');
    expect(hidden).toContain('60일 지남');
  });

  it('진행 카드에는 종류 칩만 · 전체 공개는 공개 칩이 없다 — 칩 줄이 이름 위에 온다 (26-06 · 26-07)', () => {
    const view = render(<ConsultingStageBoard stages={CONSULTING_STAGE_FIXTURE} items={[
      item({ id: 5, stage: 'running', contractStep: 5, contractStepLabel: '수납', share: 'all', shareLabel: '전체 공개', typeLabel: '국제학교 지원' }),
    ]} onOpen={() => undefined} />);
    const text = view.container.textContent ?? '';
    expect(text).toContain('국제학교 지원');
    expect(text).not.toContain('수납');
    expect(text).not.toContain('전체 공개');
    expect(text.indexOf('국제학교 지원')).toBeLessThan(text.indexOf('김민준'));
  });

  it('계약 단계가 미정이면 그 칩은 서지 않는다 — 없는 이름을 지어내지 않는다', () => {
    const text = board({ contractStepLabel: null }).container.textContent ?? '';
    expect(text).toContain('국제학교 지원');
    expect(text).not.toContain('전달');
  });
});
