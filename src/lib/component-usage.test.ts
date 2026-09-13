/** @file-guide
 * 목적: component-usage.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §86 의 「N회 씀」이 **오래되지 않았는지** 기계가 본다 (C60).
 *
 * 손으로 적은 숫자는 적은 그날부터 틀리기 시작하고, 틀린 줄 아무도 모른다.
 * 그래서 세는 자리를 `scripts/component-usage.mjs` 하나로 두고, 여기서 **다시 세어** 맞춘다.
 * 컴포넌트를 하나 더 쓰면 이 회귀가 먼저 빨개진다 — `npm run usage:gen` 이 답이다.
 */
import { describe, expect, it } from 'vitest';
import { COUNTED, count } from '../../scripts/component-usage.mjs';
import usage from './component-usage.json';
import { GALLERY } from './design-system';

describe('§86 「N회 씀」', () => {
  it('적어 둔 숫자가 지금 소스를 다시 센 값과 같다 — 다르면 `npm run usage:gen`', () => {
    expect(usage.counts).toEqual(count());
  });

  it('갤러리 카드와 세는 목록이 1:1 이다 — 세지 않는 카드도, 안 보여 주는 숫자도 없다', () => {
    expect(Object.keys(usage.counts).sort()).toEqual(GALLERY.map((g) => g.key).sort());
    expect(Object.keys(COUNTED).sort()).toEqual(GALLERY.map((g) => g.key).sort());
  });

  it('한 번도 안 쓰는 컴포넌트를 갤러리에 두지 않는다 — 갤러리는 있는 것을 보여 주는 자리다', () => {
    for (const [key, n] of Object.entries(usage.counts)) expect(n, key).toBeGreaterThan(0);
  });
});
