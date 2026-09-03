import { describe, expect, it, vi } from 'vitest';
import { sessionQueryKey } from './queries';
import { clearSessionQueries } from './session-cache';

describe('session query cache boundary', () => {
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
});
