/** @file-guide
 * 목적: session-cache.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { opsQueryKey, qk, sessionQueryKey, type OccParams } from './queries';
import { clearSessionQueries } from './session-cache';

describe('session query cache boundary', () => {
  it('일정 query 생성 계약은 조회5필드·숫자 필터와 기존 캐시 키를 유지한다', () => {
    expectTypeOf<OccParams>().toEqualTypeOf<{
      from: string; to: string; teacherId?: number; studentId?: number; roomId?: number;
    }>();
    const params: OccParams = { from: '2026-09-11', to: '2026-09-11', teacherId: 11, studentId: 1, roomId: 4 };
    expect(sessionQueryKey(qk.occurrences(params), 11)).toEqual(['schedule', 'occurrences', params, 'viewer', 11]);
  });

  it('같은 요청도 사용자별로 다른 query key를 만든다', () => {
    const request = ['reports', { state: 'rej' }] as const;

    expect(sessionQueryKey(request, 1)).toEqual(['reports', { state: 'rej' }, 'viewer', 1]);
    expect(sessionQueryKey(request, 1)).not.toEqual(sessionQueryKey(request, 2));
  });

  it('인증 전환 시 전체 캐시를 폐기한다', () => {
    const clear = vi.fn();

    clearSessionQueries({ clear });

    expect(clear).toHaveBeenCalledOnce();
  });

  it('운영 캐시는 사용자와 비용 권한을 모두 구분하고 기존 무효화 prefix를 유지한다', () => {
    expect(opsQueryKey(1, true)).not.toEqual(opsQueryKey(1, false));
    expect(opsQueryKey(1, false)).not.toEqual(opsQueryKey(2, false));
    expect(opsQueryKey(1, false)).toEqual([...qk.ops, 'viewer', 1, { canMoney: false }]);
  });
});
