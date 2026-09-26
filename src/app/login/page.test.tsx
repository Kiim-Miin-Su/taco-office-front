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

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

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

const ACCOUNTS = [
  ['ceo@tnacademy.kr', '대표'], ['admin@tnacademy.kr', '관리자'],
  ['head@tnacademy.kr', '매니저'], ['coord@tnacademy.kr', '매니저'],
  ['t02@tnacademy.kr', '강사'],
] as const;

/** 빌드 환경을 바꾼 새 모듈 — Next 는 NODE_ENV · NEXT_PUBLIC_* 를 빌드 때 접는다(여기서는 모듈을 새로 읽어 흉내 낸다) */
async function pageBuiltWith(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return (await import('./page')).default;
}

describe('LoginPage — 생성 로그인 계약', () => {
  // W8 · 대표 결정 2026-09-26 — 운영에서는 칩을 숨기고 두 칸만 남긴다(09-23 「운영에도 표시」를 대신한다)
  it('운영 빌드(시험 모드 꺼짐)는 계정 칩을 그리지 않고 두 칸을 비워 둔다', async () => {
    const ProductionLoginPage = await pageBuiltWith({ NODE_ENV: 'production', NEXT_PUBLIC_TEST_LOGIN: '' });
    const view = render(<ProductionLoginPage />);
    expect((view.getByLabelText('아이디') as HTMLInputElement).value).toBe('');
    expect((view.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('');
    for (const [loginId] of ACCOUNTS) expect(view.queryByText(loginId)).toBeNull();
    expect(view.queryByText(/시험용 계정/)).toBeNull();
    expect(view.container.querySelectorAll('input, select, textarea')).toHaveLength(2);
    expect(view.getAllByRole('button').map((b) => b.textContent)).toEqual(['들어가기']);
  });

  it('운영 빌드라도 시험 모드(NEXT_PUBLIC_TEST_LOGIN=on)면 칩이 아이디와 비밀번호를 함께 채운다 — 비밀번호는 빌드 환경 값만', async () => {
    const TestModePage = await pageBuiltWith({
      NODE_ENV: 'production', NEXT_PUBLIC_TEST_LOGIN: 'on', NEXT_PUBLIC_TEST_LOGIN_PASSWORD: 'qa-build-pass-1',
    });
    const onRender = vi.fn();
    const view = render(<Profiler id="login-test-mode" onRender={onRender}><TestModePage /></Profiler>);
    const idInput = view.getByLabelText('아이디') as HTMLInputElement;
    const passwordInput = view.getByLabelText('비밀번호') as HTMLInputElement;
    expect(idInput.value).toBe('');
    expect(passwordInput.value).toBe('');
    for (const [loginId, role] of ACCOUNTS) {
      onRender.mockClear();
      fireEvent.click(view.getByRole('button', { name: `${loginId} · ${role}` }));
      expect(idInput.value).toBe(loginId);
      expect(passwordInput.value).toBe('qa-build-pass-1');
      // 두 칸을 한 번에 — 폼 update 1회
      expect(onRender).toHaveBeenCalledOnce();
      expect(onRender.mock.calls[0][1]).toBe('update');
    }
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('시험 모드인데 빌드에 비밀번호가 없으면 칩은 아이디만 채우고 적어 둔 비밀번호를 지우지 않는다(코드에 기본값이 없다)', async () => {
    const NoPasswordPage = await pageBuiltWith({ NODE_ENV: 'production', NEXT_PUBLIC_TEST_LOGIN: 'on', NEXT_PUBLIC_TEST_LOGIN_PASSWORD: '' });
    const view = render(<NoPasswordPage />);
    const passwordInput = view.getByLabelText('비밀번호') as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: 'typed-by-user' } });
    fireEvent.click(view.getByRole('button', { name: 'coord@tnacademy.kr · 매니저' }));
    expect((view.getByLabelText('아이디') as HTMLInputElement).value).toBe('coord@tnacademy.kr');
    expect(passwordInput.value).toBe('typed-by-user');
  });

  // 운영 시드 비밀번호의 실제 번들 부재는 build 뒤 bundle-secret-check가 별도로 검사한다.
  it('개발 빌드에서는 기존 두 칸 자동 채움을 유지하고 칩이 아이디와 비밀번호를 함께 채운다', () => {
    const view = render(<LoginPage />);
    const idInput = view.getByLabelText('아이디') as HTMLInputElement;
    const passwordInput = view.getByLabelText('비밀번호') as HTMLInputElement;
    expect(idInput.value).toBe('ceo@tnacademy.kr');
    expect(passwordInput.value).toBe('taco1234!');
    expect(view.getByText('시험용 계정 — 누르면 아이디와 비밀번호를 채웁니다')).toBeTruthy();
    fireEvent.change(passwordInput, { target: { value: '' } });
    fireEvent.click(view.getByRole('button', { name: 't02@tnacademy.kr · 강사' }));
    expect(idInput.value).toBe('t02@tnacademy.kr');
    expect(passwordInput.value).toBe('taco1234!');
    // 조건은 빌드 때 접히는 형태여야 한다 — 런타임 변수로 빼면 문자열이 번들에 남는다
    expect(process.env.NODE_ENV).not.toBe('production');
  });

  it('5개 아이디 바로 채우기는 공용 역할 이름을 보이고 실제 권한은 서버가 반환한 사용자를 그대로 저장한다', async () => {
    const serverResult: LoginResult = {
      ...result,
      user: { ...result.user, id: 4, name: '강민지', role: 'manager', roleLabel: '매니저', title: '매니저',
        canSeeProfit: false, canMoney: false, canHide: false },
    };
    post.mockResolvedValueOnce({ data: serverResult });
    const view = render(<LoginPage />);
    for (const [loginId, role] of ACCOUNTS) {
      expect(view.getByRole('button', { name: `${loginId} · ${role}` })).toBeTruthy();
    }
    expect(view.queryByText(/이다현|김민선|김민수|김범준|강민지|김재훈/)).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'coord@tnacademy.kr · 매니저' }));
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: '들어가기' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith(serverResult.accessToken, serverResult.user));
    expect(post).toHaveBeenCalledWith('/auth/login', { loginId: 'coord@tnacademy.kr', password: 'taco1234!' });
  });

  it('입력은 2개를 유지하고 아이디 한 타는 폼 update 1회·요청 0회다', () => {
    const onRender = vi.fn();
    const view = render(<Profiler id="login" onRender={onRender}><LoginPage /></Profiler>);
    expect(view.container.querySelectorAll('input, select, textarea')).toHaveLength(2);
    onRender.mockClear();

    fireEvent.change(view.getByLabelText('아이디'), { target: { value: 'qa@tnacademy.kr' } });

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
      loginId: 'ceo@tnacademy.kr',
      password: 'taco1234!',
    });
    expect(get).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/schedule');
  });

  // W10 (대표 지시 2026-09-26 「아이디 형식은 자유」) — 화면은 모양을 가르지 않고 적은 글을 그대로 보낸다(판정은 서버)
  it('아이디 칸은 이메일 칸이 아니다 — 한글 · 기호 아이디를 그대로 보내고 브라우저 이메일 검사를 걸지 않는다', async () => {
    post.mockResolvedValueOnce({ data: result });
    const view = render(<LoginPage />);
    const idInput = view.getByLabelText('아이디') as HTMLInputElement;
    expect(idInput.type).toBe('text');
    expect(idInput.getAttribute('autocomplete')).toBe('username');
    fireEvent.change(idInput, { target: { value: '김선생.Kim#1' } });
    fireEvent.click(view.getByRole('button', { name: '들어가기' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/login', { loginId: '김선생.Kim#1', password: 'taco1234!' }));
  });

  // N-101 (대표 결정 2026-09-26) — 운영 빌드에도 늘 선다(시험 모드와 무관)
  it('「비밀번호를 잊으셨나요?」는 비밀번호 찾기로 가는 링크다 — 운영 빌드에도 서고 단추가 아니다', async () => {
    const ProductionLoginPage = await pageBuiltWith({ NODE_ENV: 'production', NEXT_PUBLIC_TEST_LOGIN: '' });
    const view = render(<ProductionLoginPage />);
    expect(view.getByRole('link', { name: '비밀번호를 잊으셨나요?' }).getAttribute('href')).toBe('/password-reset');
    expect(post).not.toHaveBeenCalled();
  });

  it('첫 설정이 필요한 계정은 로그인 뒤 일정이 아니라 첫 설정으로 간다', async () => {
    post.mockResolvedValueOnce({ data: { ...result, user: { ...result.user, mustChangeCredentials: true } } });
    const view = render(<LoginPage />);
    fireEvent.click(view.getByRole('button', { name: '들어가기' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
    expect(replace).not.toHaveBeenCalledWith('/schedule');
  });
});
