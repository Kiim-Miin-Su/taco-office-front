/** @file-guide
 * 목적: url-state.test.ts — deep link 숫자·열거형·날짜 입력 방어 회귀
 * 책임/재사용: 공용 parser의 정상/거절 경계만 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { positiveQueryId, queryEnum, queryIsoDate } from './url-state';

describe('URL 상태 입력 방어', () => {
  it('양의 safe integer만 identity로 받는다', () => {
    expect(positiveQueryId('41')).toBe(41);
    for (const value of [null, '', '0', '-1', '1.5', '01', '9007199254740992']) {
      expect(positiveQueryId(value)).toBeNull();
    }
  });

  it('허용 열거형과 실제 존재하는 ISO 날짜만 받는다', () => {
    expect(queryEnum('week', ['day', 'week', 'month'] as const)).toBe('week');
    expect(queryEnum('inbox', ['day', 'week', 'month'] as const)).toBeNull();
    expect(queryIsoDate('2026-02-28')).toBe('2026-02-28');
    expect(queryIsoDate('2026-02-30')).toBeNull();
  });
});

