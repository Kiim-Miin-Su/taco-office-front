/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Profiler } from 'react';
import type { LoginResult } from '@/api/types';

const { clear, get, post, replace, signIn } = vi.hoisted(() => ({
  clear: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  replace: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear }) }));
vi.mock('@/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/client')>(),
  api: { get, post },
}));
vi.mock('@/store/useSession', () => ({ useSession: () => signIn }));

import LoginPage from './page';
import { ApiError } from '@/api/client';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const result: LoginResult = {
  accessToken: 'access-token',
  user: {
    id: 1,
    name: '김민선',
    role: 'ceo',
    title: '대표',
    canAdminPage: true,
    canCrudAll: true,
    canSeeProfit: true,
    canCrudAttendance: true,
    canMoney: true,
    canWage: true,
    canApprove: true,
    canHide: true,
    canGpaPack: true,
  },
};

describe('LoginPage — 생성 로그인 계약', () => {
  it('입력은 2개를 유지하고 이메일 한 타는 폼 update 1회·요청 0회다', () => {
    const onRender = vi.fn();
    const view = render(<Profiler id="login" onRender={onRender}><LoginPage /></Profiler>);
    expect(view.container.querySelectorAll('input, select, textarea')).toHaveLength(2);
    onRender.mockClear();

    fireEvent.change(view.getByLabelText('이메일'), { target: { value: 'qa@tnacademy.kr' } });

    expect(onRender).toHaveBeenCalledOnce();
    expect(onRender.mock.calls[0][1]).toBe('update');
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('공용 시간 초과 문구를 표시하고 수동 재제출로 복구한다', async () => {
    const message = '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
    post.mockRejectedValueOnce(new ApiError('TIMEOUT', message, 0));
    post.mockResolvedValueOnce({ data: result });
    const view = render(<LoginPage />);

    fireEvent.click(view.getByRole('button', { name: '들어가기' }));

    await waitFor(() => expect(view.getByText(message)).toBeTruthy());
    expect(signIn).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledOnce();
    expect(view.getByRole('button', { name: '들어가기' }).hasAttribute('disabled')).toBe(false);

    fireEvent.click(view.getByRole('button', { name: '들어가기' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith(result.accessToken, result.user));
    expect(view.queryByText(message)).toBeNull();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('LoginResult의 user로 세션을 만들고 /auth/me를 다시 부르지 않는다', async () => {
    post.mockResolvedValueOnce({ data: result });
    const view = render(<LoginPage />);

    fireEvent.click(view.getByRole('button', { name: '들어가기' }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith(result.accessToken, result.user));
    expect(clear).toHaveBeenCalledOnce();
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(signIn.mock.invocationCallOrder[0]);
    expect(post).toHaveBeenCalledWith('/auth/login', {
      email: 'ceo@tnacademy.kr',
      password: 'taco1234!',
    });
    expect(get).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/schedule');
  });
});
