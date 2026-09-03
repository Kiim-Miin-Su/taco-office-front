import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
vi.mock('@/api/client', () => ({
  api: { get, post },
  ApiError: class ApiError extends Error {},
}));
vi.mock('@/store/useSession', () => ({ useSession: () => signIn }));

import LoginPage from './page';

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
