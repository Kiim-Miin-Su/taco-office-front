import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Consulting } from '@/api/types';
import { ConsultingStageBoard } from './ConsultingStageBoard';

const item = (overrides: Partial<Consulting>): Consulting => ({
  id: 1,
  consType: 'admissions',
  stage: 'contract',
  contractStep: 3,
  studentNames: ['김민준'],
  ownerName: '이수현',
  sessions: 5,
  endOn: null,
  createdAt: '2026-09-01',
  amount: null,
  share: 'all',
  canOpen: true,
  sessionsLog: [],
  ...overrides,
});

describe('ConsultingStageBoard', () => {
  it('Figma §26의 세 단계와 계약 5칸을 한 보드에 표시한다', () => {
    const view = render(<ConsultingStageBoard items={[
      item({ id: 1, stage: 'contract', contractStep: 3 }),
      item({ id: 2, stage: 'running', sessions: 4, sessionsLog: [
        { id: 1, seq: 1, onDate: '2026-09-01', who: null, what: null, why: null, how: null, serId: null },
      ] }),
      item({ id: 3, stage: 'done', endOn: '2026-08-15' }),
    ]} onOpen={() => undefined} />);

    expect(view.getByText('계약')).toBeTruthy();
    expect(view.getByText('진행')).toBeTruthy();
    expect(view.getByText('종료')).toBeTruthy();
    expect(view.getByRole('img', { name: '계약 3/5' }).children).toHaveLength(5);
    expect(view.getByRole('img', { name: '회차 1/4' })).toBeTruthy();
    expect(view.getByRole('img', { name: '컨설팅 종료' }).firstElementChild?.getAttribute('style')).toContain('width: 100%');
    expect(view.getByText('2026-08-15 · 종료')).toBeTruthy();
  });

  it('열람 불가 카드는 기록 수를 추측하지 않고 상세도 열지 않는다', () => {
    const onOpen = vi.fn();
    const view = render(<ConsultingStageBoard items={[
      item({ canOpen: false, stage: 'running', sessions: 8, sessionsLog: [] }),
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
    const view = render(<ConsultingStageBoard items={[row]} onOpen={onOpen} />);

    fireEvent.click(view.getByRole('button', { name: '김민준 컨설팅 상세' }));
    expect(onOpen).toHaveBeenCalledWith(row);
  });
});
