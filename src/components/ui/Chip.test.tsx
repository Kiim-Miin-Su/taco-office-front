/** @file-guide
 * 목적: Chip.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Chip } from './Chip';

afterEach(cleanup);

describe('Chip — 원문 청록·주황 톤과 점 모양(§23 · §86)', () => {
  it('기본은 지금 모양 그대로다 — 중립 soft 알약', () => {
    const el = render(<Chip>상태</Chip>).getByText('상태');
    expect(el.className).toContain('rounded-full');
    expect(el.className).toContain('bg-inset text-fg-2');
    expect(el.querySelector('[aria-hidden]')).toBeNull();
  });

  it('청록·주황 톤은 토큰 클래스만 쓴다(색 값은 tokens.css 한 곳)', () => {
    const v = render(<><Chip tone="teal">2차 대기</Chip><Chip tone="orange" styleKind="solid">2차 상담</Chip></>);
    expect(v.getByText('2차 대기').className).toContain('bg-teal/10 text-teal');
    expect(v.getByText('2차 상담').className).toContain('bg-orange text-white');
  });

  it('점 모양은 바탕 없이 점 + 색 글자다(§86 「● 완료」)', () => {
    const el = render(<Chip tone="success" styleKind="dot">완료</Chip>).getByText('완료');
    expect(el.className).toContain('text-green');
    expect(el.className).not.toContain('rounded-full');
    expect(el.className).not.toMatch(/\bbg-/);
    const dot = el.querySelector('[aria-hidden]');
    expect(dot?.className).toContain('bg-green');
  });
});
