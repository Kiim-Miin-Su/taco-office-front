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
    role: 'ceo', roleLabel: '대표',
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
  /**
   * S8 — 시드 계정은 **개발 빌드에만** 남는다.
   *
   * 여기서 볼 수 있는 것은 **개발·시험 쪽뿐이다**(vitest 는 `NODE_ENV='test'` 로 돈다).
   * 운영 번들에서 문자열이 실제로 사라졌는지는 **소스로는 알 수 없고 빌드를 봐야** 알기 때문에
   * 그쪽은 `docs/script/bundle-secret-check.mjs` 가 `npm run build` 뒤에 본다
   * (release 게이트의 「front 번들 비밀 검사」). 둘 중 하나만 있으면 반쪽이다 —
   * 이 시험만 있으면 운영에 실려도 초록이고, 검사만 있으면 개발에서 사라져도 초록이다.
   */
  it('⭐ 개발 빌드에서는 시드 칩과 미리 채운 두 칸이 그대로다 — 운영은 번들 검사가 본다', () => {
    const view = render(<LoginPage />);
    expect((view.getByLabelText('이메일') as HTMLInputElement).value).toBe('ceo@tnacademy.kr');
    expect((view.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('taco1234!');
    expect(view.getByText('개발 시드 계정 — 눌러서 채웁니다')).toBeTruthy();
    // 조건은 빌드 때 접히는 형태여야 한다 — 런타임 변수로 빼면 문자열이 번들에 남는다
    expect(process.env.NODE_ENV).not.toBe('production');
  });

  it('5개 이메일 바로 채우기는 공용 역할 이름을 보이고 실제 권한은 서버가 반환한 사용자를 그대로 저장한다', async () => {
    const serverResult: LoginResult = {
      ...result,
      user: { ...result.user, id: 4, name: '강민지', role: 'manager', roleLabel: '매니저', title: '매니저',
        canSeeProfit: false, canMoney: false, canHide: false },
    };
    post.mockResolvedValueOnce({ data: serverResult });
    const view = render(<LoginPage />);
    for (const [email, role] of [
      ['ceo@tnacademy.kr', '대표'], ['admin@tnacademy.kr', '관리자'],
      ['head@tnacademy.kr', '매니저'], ['coord@tnacademy.kr', '매니저'],
      ['t02@tnacademy.kr', '강사'],
    ]) {
      expect(view.getByRole('button', { name: `${email} · ${role}` })).toBeTruthy();
    }
    expect(view.queryByText(/이다현|김민선|김민수|김범준|강민지|김재훈/)).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'coord@tnacademy.kr · 매니저' }));
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: '들어가기' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith(serverResult.accessToken, serverResult.user));
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'coord@tnacademy.kr', password: 'taco1234!' });
  });

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
