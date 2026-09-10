/** @file-guide
 * 목적: session-cache.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { useSession } from '@/store/useSession';
import { api, ApiError, getSessionGeneration } from './client';
import type { Me } from './types';
import { opsQueryKey, qk, sessionQueryKey, type OccParams } from './queries';
import { clearSessionQueries, revalidateSession } from './session-cache';

const me: Me = { id: 5, name: '강사', role: 'teacher', title: null, canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const originalAdapter = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = originalAdapter; useSession.getState().signOut(); });

function pendingResponse(next: Me) {
  let finish!: () => void, started!: () => void;
  const ready = new Promise<void>((done) => { started = done; });
  const gate = new Promise<void>((done) => { finish = done; });
  api.defaults.adapter = async (config) => {
    started(); await gate;
    return { config, status: 200, statusText: 'OK', headers: {}, data: next };
  };
  return { ready, finish };
}

describe('session query cache boundary', () => {
  it.each(['logout', 'new login'] as const)('늦은 Me는 %s 뒤 현재 계정/캐시를 덮지 않는다', async (mode) => {
    useSession.getState().signIn('old', me);
    const client = new QueryClient();
    const pending = pendingResponse({ ...me, canMoney: true });
    const check = revalidateSession(client).catch((error: unknown) => error);
    await pending.ready;
    if (mode === 'logout') useSession.getState().signOut();
    else useSession.getState().signIn('new', { ...me, id: 6 });
    client.setQueryData(['current'], 'do not clear');
    pending.finish();
    expect(await check).toMatchObject({ code: 'SESSION_CHANGED' });
    expect(useSession.getState().me?.id ?? null).toBe(mode === 'logout' ? null : 6);
    expect(client.getQueryData(['current'])).toBe('do not clear');
  });

  it('다른 계정 Me가 오면 자동 계정 전환 대신 로그아웃·캐시 폐기를 한다', async () => {
    useSession.getState().signIn('old', me);
    const client = new QueryClient(); client.setQueryData(['private'], true);
    const pending = pendingResponse({ ...me, id: 6 });
    const check = revalidateSession(client);
    await pending.ready; pending.finish(); await check;
    expect(useSession.getState().me).toBeNull();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('동일 계정의 이름/직함 변경은 권한 세대와 업무 캐시를 유지한다', async () => {
    useSession.getState().signIn('old', me);
    const generation = getSessionGeneration();
    const client = new QueryClient(); client.setQueryData(['private'], true);
    const next = { ...me, name: '새 이름', title: '새 직함' };
    const pending = pendingResponse(next);
    const check = revalidateSession(client);
    await pending.ready; pending.finish(); await check;
    expect(useSession.getState().me).toEqual(next);
    expect(getSessionGeneration()).toBe(generation);
    expect(client.getQueryData(['private'])).toBe(true);
  });

  it('권한 변경 전에 시작된 보호 응답은 캐시 초기화 뒤 다시 사용할 수 없다', async () => {
    useSession.getState().signIn('old', me);
    const client = new QueryClient();
    let finish!: () => void, started!: () => void;
    const ready = new Promise<void>((done) => { started = done; });
    const gate = new Promise<void>((done) => { finish = done; });
    api.defaults.adapter = async (config) => {
      if (config.url !== '/auth/me') { started(); await gate; }
      return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/auth/me' ? { ...me, canMoney: true } : 'old data' };
    };
    const old = api.get('/ops').catch((error: unknown) => error);
    await ready;
    await revalidateSession(client);
    finish();
    expect(await old).toBeInstanceOf(ApiError);
    expect(await old).toMatchObject({ code: 'SESSION_CHANGED' });
  });

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
