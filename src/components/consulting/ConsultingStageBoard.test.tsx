/** @file-guide
 * 목적: ConsultingStageBoard.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Consulting } from '@/api/types';
import { ConsultingStageBoard } from './ConsultingStageBoard';
import { CONSULTING_STAGE_FIXTURE, consultingItem } from './consulting.fixture';

const item = consultingItem;

describe('ConsultingStageBoard', () => {
  it('Figma §26의 세 단계와 계약 5칸을 한 보드에 표시한다', () => {
    const view = render(<ConsultingStageBoard stages={CONSULTING_STAGE_FIXTURE} items={[
      item({ id: 1, stage: 'contract', contractStep: 3 }),
      item({ id: 2, stage: 'running', contractStep: 5, sessions: 4, sessionsLog: [
        { id: 1, seq: 1, onDate: '2026-09-01', who: null, what: null, why: null, how: null, serId: null },
      ] }),
      item({ id: 3, stage: 'done', contractStep: 5, endOn: '2026-08-15' }),
    ]} onOpen={() => undefined} />);

    expect(view.getByText('계약')).toBeTruthy();
    expect(view.getByText('진행')).toBeTruthy();
    expect(view.getByText('종료')).toBeTruthy();
    expect(view.getByRole('img', { name: '계약 3/5' }).children).toHaveLength(5);
    expect(view.getByRole('img', { name: '기록 1건 / 약정 4회' }).firstElementChild?.classList.contains('bg-violet')).toBe(true);
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

  it('칩 셋·요청자·담당·지난 날이 **서버가 준 낱말과 수** 그대로다', () => {
    const text = board({
      typeLabel: '에세이 지도', contractStepLabel: '피드백', shareLabel: '수납만 공개',
      requesterLabel: '어머니', ownerName: '김범준', ageDays: 60,
    }).container.textContent ?? '';
    for (const w of ['에세이 지도', '피드백', '수납만 공개', '어머니 · 김범준', '60일 지남']) {
      expect(text).toContain(w);
    }
  });

  it('금액쌍은 받은 돈 / 계약 금액이고 **못 보면 줄이 아예 없다** (D-R39)', () => {
    expect(board().container.textContent).toContain('₩400,000 / ₩900,000');
    // 한쪽만 보이면 나머지가 빼기로 드러난다 — 서버가 둘 다 null 로 내린다
    const hidden = board({ amount: null, paidAmount: null }).container.textContent ?? '';
    expect(hidden).not.toContain('₩');
    expect(hidden).toContain('60일 지남');
  });

  it('계약 단계가 미정이면 그 칩은 서지 않는다 — 없는 이름을 지어내지 않는다', () => {
    const text = board({ contractStepLabel: null }).container.textContent ?? '';
    expect(text).toContain('국제학교 지원');
    expect(text).not.toContain('전달');
  });
});
