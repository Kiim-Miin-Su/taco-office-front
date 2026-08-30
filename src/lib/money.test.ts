/**
 * 금액 — `null` 과 `0` 이 다른 것이 요점이다.
 * 「미입력·가려짐」과 「0원 확정」을 같은 화면으로 만들면 회계에서 사고가 난다.
 */
import { describe, it, expect } from 'vitest';
import { won, wonCompact, wonTone, MASKED } from './money';

describe('won', () => {
  it('세 자리마다 쉼표 · 뒤에 원', () => {
    expect(won(1234567)).toBe('1,234,567원');
    expect(won(0)).toBe('0원');
  });
  it('단위를 뗄 수 있다 — 카드처럼 좁은 자리', () => {
    expect(won(45000, { unit: false })).toBe('45,000');
  });
  it('★ null 은 0 이 아니다 — 가려진 것이다 (D-R39)', () => {
    expect(won(null)).toBe(MASKED);
    expect(won(undefined)).toBe(MASKED);
    expect(won(0)).not.toBe(MASKED);
  });
  it('빈 자리 글자를 바꿀 수 있다', () => {
    expect(won(null, { empty: '—' })).toBe('—');
  });
  it('부호 — 음수는 빼기 기호(−)로. 하이픈은 글자 폭이 달라 표가 흔들린다', () => {
    expect(won(-25000)).toBe('−25,000원');
    expect(won(25000, { signed: true })).toBe('+25,000원');
    expect(won(0, { signed: true })).toBe('0원');
  });
});

describe('wonCompact', () => {
  it('만 단위로 접는다', () => {
    expect(wonCompact(795358)).toBe('약 79.5만');
    expect(wonCompact(12_400_000)).toBe('약 1240만');
    expect(wonCompact(250_000_000)).toBe('약 2.5억');
  });
  it('만 원 미만은 그대로', () => {
    expect(wonCompact(9900)).toBe('9,900원');
  });
  it('가려진 것은 여기서도 가려진다', () => {
    expect(wonCompact(null)).toBe(MASKED);
  });
});

describe('wonTone', () => {
  it('부호에 따라 색이 정해진다 — 화면마다 삼항을 적지 않게', () => {
    expect(wonTone(1)).toBe('success');
    expect(wonTone(-1)).toBe('danger');
    expect(wonTone(0)).toBe('neutral');
    expect(wonTone(null)).toBe('neutral');
  });
});
