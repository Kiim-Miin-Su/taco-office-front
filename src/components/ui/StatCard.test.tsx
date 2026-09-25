/** @file-guide
 * 목적: StatCard.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatCard } from './StatCard';

afterEach(cleanup);

const card = (el: HTMLElement) => el.parentElement as HTMLElement;

describe('StatCard — 톤 채움 · 색 윗줄 · 0 흐림(§34-9 · §38-6 · §43-12)', () => {
  it('기본은 흰 카드 · 윗줄 없음 · 숫자만 톤 색이다', () => {
    const v = render(<StatCard label="교재 안 됨" value={16} tone="danger" />);
    const box = card(v.getByText('교재 안 됨'));
    expect(box.className).toContain('border-line bg-card');
    expect(box.className).not.toContain('border-t-[3px]');
    expect(v.getByText('16').className).toContain('text-red');
  });

  it('fill 은 톤 옅은 바탕 + 톤 테두리다(§34 「안 됨」 분홍 채움)', () => {
    const v = render(<StatCard label="교재 안 됨" value={16} tone="danger" fill />);
    const box = card(v.getByText('교재 안 됨'));
    expect(box.className).toContain('border-red/30 bg-red/10');
    expect(box.className).not.toContain('bg-card');
  });

  it('accent 는 윗변 3px 톤 줄이고, dim 이면 줄은 옅고 숫자는 흐린 글자다', () => {
    const on = render(<StatCard label="전달 대기" value={2} tone="teal" accent="teal" />);
    expect(card(on.getByText('전달 대기')).className).toContain('border-t-[3px] border-t-teal');
    expect(on.getByText('2').className).toContain('text-teal');
    cleanup();
    const off = render(<StatCard label="전달 대기" value={0} tone="teal" accent="teal" dim />);
    expect(card(off.getByText('전달 대기')).className).toContain('border-t-teal/40');
    expect(off.getByText('0').className).toContain('text-fg-subtle');
  });
});
