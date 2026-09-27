/** @file-guide
 * 목적: providers.test.tsx — 새로고침 세션 복구의 성공·401·일시 장애 회귀
 * 책임/재사용: SessionBoot가 인증 거절만 익명 처리하고 네트워크/5xx는 재시도 가능한 상태로 보존하는지 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { useSession } from '@/store/useSession';

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), token: vi.fn() }));

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return {
    ...actual,
    api: { post: mocks.post, get: mocks.get },
    setAccessToken: mocks.token,
  };
});

import { SessionBoot } from './providers';

const me = {
  id: 1, name: '대표', role: 'ceo' as const, roleLabel: '대표', title: null,
  canAdminPage: true, canCrudAll: true, canSeeProfit: true, canCrudAttendance: true,
  canMoney: true, canWage: true, canApprove: true, canHide: true, canGpaPack: true,
};

beforeEach(() => {
  mocks.post.mockReset();
  mocks.get.mockReset();
  mocks.token.mockReset();
  useSession.setState({ me: null, ready: false });
});

afterEach(() => cleanup());

describe('SessionBoot 새로고침 인증 경계', () => {
  it('refresh와 me가 성공하면 토큰·사용자를 복구하고 화면을 연다', async () => {
    mocks.post.mockResolvedValue({ data: { accessToken: 'memory-only-token' } });
    mocks.get.mockResolvedValue({ data: me });
    render(<SessionBoot><p>보호 화면</p></SessionBoot>);
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(await screen.findByText('보호 화면')).toBeTruthy();
    expect(mocks.token).toHaveBeenCalledWith('memory-only-token');
    expect(useSession.getState()).toMatchObject({ me, ready: true });
  });

  it('refresh 401만 익명 세션으로 확정한다', async () => {
    mocks.post.mockRejectedValue(new ApiError('UNAUTHORIZED', '다시 로그인해 주세요.', 401));
    render(<SessionBoot><p>공개 라우트</p></SessionBoot>);
    expect(await screen.findByText('공개 라우트')).toBeTruthy();
    expect(useSession.getState()).toMatchObject({ me: null, ready: true });
  });

  it('네트워크 장애는 로그아웃시키지 않고 오류와 다시 시도를 제공한다', async () => {
    mocks.post.mockRejectedValueOnce(new ApiError('NETWORK', '서버에 닿지 못했습니다', 0));
    mocks.post.mockResolvedValueOnce({ data: { accessToken: 'retried-token' } });
    mocks.get.mockResolvedValueOnce({ data: me });
    render(<SessionBoot><p>보호 화면</p></SessionBoot>);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('서버에 닿지 못했습니다')).toBeTruthy();
    expect(useSession.getState()).toMatchObject({ me: null, ready: false });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '다시 시도' })); });
    await waitFor(() => expect(screen.getByText('보호 화면')).toBeTruthy());
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.token).toHaveBeenCalledWith('retried-token');
  });

  it('refresh 500도 인증 만료로 오인하지 않는다', async () => {
    mocks.post.mockRejectedValue(new ApiError('ERROR', '서버 오류', 500));
    render(<SessionBoot><p>보호 화면</p></SessionBoot>);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('서버 오류')).toBeTruthy();
    expect(useSession.getState()).toMatchObject({ me: null, ready: false });
    expect(screen.queryByText('보호 화면')).toBeNull();
  });
});
