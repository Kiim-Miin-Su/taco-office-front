/** @file-guide
 * 목적: money.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 금액 — `null` 과 `0` 이 다른 것이 요점이다.
 * 「미입력·가려짐」과 「₩0 확정」을 같은 화면으로 만들면 회계에서 사고가 난다.
 *
 * 표기는 원문 컷 모양 「₩7,214,000」이다 (N-92 · W11 D) — 이 파일의 글자가 전 화면의 금액 모양이다.
 */
import { describe, it, expect } from 'vitest';
import { won, wonCompact, wonTone, MASKED } from './money';

describe('won', () => {
  it('앞에 ₩ · 세 자리마다 쉼표 — 원문 컷 「₩7,214,000」', () => {
    expect(won(7_214_000)).toBe('₩7,214,000');
    expect(won(1234567)).toBe('₩1,234,567');
  });
  it('0 은 「₩0」 — 원문 §69 「오늘 들어온 돈 ₩0」', () => {
    expect(won(0)).toBe('₩0');
  });
  it('뒤에 「원」을 붙이지 않는다 — 앞붙임과 뒤붙임이 한 화면에 섞이지 않게', () => {
    for (const n of [0, 5, 45_000, -25_000]) expect(won(n)).not.toMatch(/원/);
  });
  it('단위를 뗄 수 있다 — 숫자만(원문 §55 입금 달력 칸 「840,000」)', () => {
    expect(won(840_000, { unit: false })).toBe('840,000');
    expect(won(-25_000, { unit: false })).toBe('−25,000');
  });
  it('★ null 은 0 이 아니다 — 가려진 것이다 (D-R39)', () => {
    expect(won(null)).toBe(MASKED);
    expect(won(undefined)).toBe(MASKED);
    expect(won(0)).not.toBe(MASKED);
  });
  it('빈 자리 글자를 바꿀 수 있다', () => {
    expect(won(null, { empty: '—' })).toBe('—');
  });
  it('부호는 맨 앞 · 빼기 기호(−) — 원문 §56 「차감 −₩95,000 · 세금 −₩165,058」. 하이픈은 글자 폭이 달라 표가 흔들린다', () => {
    expect(won(-95_000)).toBe('−₩95,000');
    expect(won(-165_058)).toBe('−₩165,058');
    expect(won(-3_052_172)).not.toContain('-');
    expect(won(25000, { signed: true })).toBe('+₩25,000');
    expect(won(0, { signed: true })).toBe('₩0');
  });
});

describe('숨긴 금액 낱말', () => {
  it('한 벌이다 — 원문 탭 줄 스위치 이름(「시급 비공개 · 컨설팅 비공개」)의 낱말 「비공개」', () => {
    expect(MASKED).toBe('비공개');
  });
});

describe('wonCompact', () => {
  it('만 단위로 접는다 — 지금 규칙(「약 79.5만」)에 ₩ 만 숫자 앞에', () => {
    expect(wonCompact(795358)).toBe('약 ₩79.5만');
    expect(wonCompact(12_400_000)).toBe('약 ₩1240만');
    expect(wonCompact(250_000_000)).toBe('약 ₩2.5억');
  });
  it('음수는 부호가 맨 앞이다 — won 과 같은 차례', () => {
    expect(wonCompact(-795358)).toBe('−약 ₩79.5만');
    expect(wonCompact(-9900)).toBe('−₩9,900');
  });
  it('만 원 미만은 그대로', () => {
    expect(wonCompact(9900)).toBe('₩9,900');
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
