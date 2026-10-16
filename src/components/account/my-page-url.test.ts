/** @file-guide
 * 목적: my-page-url.test.ts (test)
 * 책임/재사용: 마이 페이지 질의(`?mypage=1`)를 켜고 끌 때 다른 질의를 보존하는지 실제 myPageHref 로 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import { MY_PAGE_QUERY, myPageHref } from './my-page-url';

describe('마이 페이지 질의 (AUTH-SELF-01 · D1)', () => {
  it('켜면 질의 하나만 더하고 다른 질의는 그대로 둔다', () => {
    expect(MY_PAGE_QUERY).toBe('mypage');
    expect(myPageHref('/teacher', '', true)).toBe('/teacher?mypage=1');
    expect(myPageHref('/schedule', 'date=2026-10-16&view=week', true)).toBe('/schedule?date=2026-10-16&view=week&mypage=1');
    // 이미 켜져 있으면 같은 주소 — 질의가 두 번 붙지 않는다
    expect(myPageHref('/board', 'mypage=1', true)).toBe('/board?mypage=1');
  });

  it('끄면 그 질의만 걷는다 — 다른 질의를 보존하고, 남은 질의가 없으면 경로만 남는다', () => {
    expect(myPageHref('/teacher', 'meeting=3&mypage=1', false)).toBe('/teacher?meeting=3');
    expect(myPageHref('/board', 'mypage=1', false)).toBe('/board');
    expect(myPageHref('/reports', 'mypage=0&tab=weekly', false)).toBe('/reports?tab=weekly');
  });
});
