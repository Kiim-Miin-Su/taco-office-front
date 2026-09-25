/** @file-guide
 * 목적: ChipRow.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChipButton, ChipRow } from './ChipRow';

afterEach(cleanup);

describe('ChipRow · ChipButton — 칩 앞 색 점(§34 과목 · §14·§16 분류)', () => {
  it('기본은 점 없이 지금 모양 그대로다', () => {
    const v = render(<ChipButton pressed={false} onClick={() => undefined}>Writing</ChipButton>);
    expect(v.container.querySelector('[data-chip-dot]')).toBeNull();
  });

  it('dot 을 주면 그 CSS 색의 점이 이름 앞에 서고, 이름은 그대로 읽힌다', () => {
    const v = render(<ChipButton pressed={false} dot="#123456" onClick={() => undefined}>Writing</ChipButton>);
    const button = v.getByRole('button', { name: 'Writing' });
    const dot = button.querySelector('[data-chip-dot]') as HTMLElement | null;
    expect(dot?.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
  });

  it('ChipRow 옵션의 dot 은 그 칩에만 서고 「전체」에는 없다', () => {
    const onChange = vi.fn();
    const v = render(
      <ChipRow ariaLabel="분류" value="" onChange={onChange}
        options={[{ value: 'gpa', label: 'GPA', dot: 'var(--kind-gpa)' }, { value: 'etc', label: '기타' }]} />,
    );
    expect(v.getByRole('button', { name: '전체' }).querySelector('[data-chip-dot]')).toBeNull();
    expect(v.getByRole('button', { name: 'GPA' }).querySelector('[data-chip-dot]')).not.toBeNull();
    expect(v.getByRole('button', { name: '기타' }).querySelector('[data-chip-dot]')).toBeNull();
    fireEvent.click(v.getByRole('button', { name: 'GPA' }));
    expect(onChange).toHaveBeenCalledWith('gpa');
  });

  it('pressedTone="ink" 면 눌린 칩만 진한 채움 안에 이름이 서고, 기본은 지금 모양 그대로다 (§63 종류 칩 · x5)', () => {
    const options = [{ value: 'plan', label: '기획' }, { value: 'dev', label: '개발' }];
    const ink = render(<ChipRow ariaLabel="종류" value="plan" onChange={() => undefined} options={options} pressedTone="ink" />);
    expect(ink.getByRole('button', { name: '기획' }).querySelector('[data-chip-pressed="ink"]')).not.toBeNull();
    expect(ink.getByRole('button', { name: '개발' }).querySelector('[data-chip-pressed]')).toBeNull();
    expect(ink.getByRole('button', { name: '기획' }).getAttribute('aria-pressed')).toBe('true');
    cleanup();
    const plain = render(<ChipRow ariaLabel="종류" value="plan" onChange={() => undefined} options={options} />);
    expect(plain.container.querySelector('[data-chip-pressed]')).toBeNull();
  });
});
