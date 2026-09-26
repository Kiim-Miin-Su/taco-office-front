/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 첫 설정 화면 (W8 · 대표 지시 2026-09-26) — 서버 낱말(규칙 · 채널 이름 · 못 보내는 까닭 · 거절 문장)을 그대로 쓰는지,
 * 코드 받기 → 마치기 → 새 세션까지 이어지는지, 다시 받기 초읽기와 개발용 코드 표시를 본다. API 는 대역이다.
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoginResult, Me, OnboardingCodeResult, OnboardingInfo } from '@/api/types';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  replace: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace }) }));
vi.mock('@/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/client')>(),
  api: { get: h.get, post: h.post },
}));
vi.mock('@/api/session-cache', () => ({ clearSessionQueries: h.clear }));
vi.mock('@/store/useSession', () => {
  const state = { me: { id: 9, mustChangeCredentials: true }, signIn: h.signIn, signOut: h.signOut };
  return { useSession: (select: (s: typeof state) => unknown) => select(state) };
});

import OnboardingPage from './page';
import { ApiError } from '@/api/client';

const RULE = '비밀번호는 8자 이상 · 영문과 숫자를 함께 · 초기 비밀번호와 지금 비밀번호는 쓸 수 없습니다';
const info: OnboardingInfo = {
  required: true, loginId: '새강사_01', emailMasked: null, phoneMasked: null, passwordRule: RULE,
  codeTtlMinutes: 10, resendAfterSeconds: 60,
  channels: [
    { channel: 'email', label: '메일', ready: true, notReadyReason: null },
    { channel: 'sms', label: '문자', ready: true, notReadyReason: null },
  ],
  // 서버 목록 — 첫 줄이 국내(N-103)
  phoneCountries: [{ code: '82', label: '대한민국' }, { code: '1', label: '미국 · 캐나다' }],
};
const user: Me = {
  id: 9, name: '새강사', role: 'teacher', roleLabel: '강사', title: null, canAdminPage: false, canCrudAll: false,
  canSeeProfit: false, canCrudAttendance: false, canMoney: false, canWage: false, canApprove: false, canHide: false,
  canGpaPack: false, mustChangeCredentials: false,
};
const sent = (channel: 'email' | 'sms', extra: Partial<OnboardingCodeResult> = {}): { data: OnboardingCodeResult } => ({
  data: {
    channel, targetMasked: channel === 'email' ? 'ki***@tnacademy.kr' : '010-****-5678',
    expiresAt: '2026-09-26T03:10:00.000Z', resendAfterSeconds: 60, ...extra,
  },
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(data: OnboardingInfo = info) {
  h.get.mockResolvedValue({ data });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><OnboardingPage /></QueryClientProvider>);
}
const type = (view: ReturnType<typeof render>, label: string, value: string) =>
  fireEvent.change(view.getByLabelText(label), { target: { value } });

describe('첫 설정 화면', () => {
  it('왜 여기에 왔는지 · 서버 규칙 문장 · 서버 채널 이름을 그대로 보인다', async () => {
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    expect(h.get).toHaveBeenCalledWith('/auth/onboarding');
    expect(view.getByText('처음 로그인하셨습니다 — 휴대폰·이메일을 확인하고 새 비밀번호를 정해야 쓸 수 있습니다')).toBeTruthy();
    expect(view.getByRole('button', { name: '메일로 코드 받기' })).toBeTruthy();
    expect(view.getByRole('button', { name: '문자로 코드 받기' })).toBeTruthy();
    // 아이디는 매니저가 정한 그대로다(W10) — 여기서 바꾸지 않는다
    expect(view.getByText('아이디 새강사_01 — 바뀌지 않습니다')).toBeTruthy();
    // 이메일 칸은 연락 · 인증용이다 — 아이디 칸이 아니다(비밀번호 관리자는 숨은 아이디 칸을 쓴다)
    const email = view.getByLabelText('이메일') as HTMLInputElement;
    expect(email.getAttribute('autocomplete')).toBe('email');
    const hiddenId = view.container.querySelector('input[autocomplete="username"]') as HTMLInputElement;
    expect(hiddenId.value).toBe('새강사_01');
    expect(hiddenId.hidden).toBe(true);
  });

  it('등록된 이메일이 있으면 가린 모양을 알려 준다 (W10)', async () => {
    const view = mount({ ...info, emailMasked: 'ki***@tnacademy.kr' });
    await waitFor(() => expect(view.getByText('등록된 주소 ki***@tnacademy.kr')).toBeTruthy());
  });

  it('코드 두 개를 받고 마치면 새 세션으로 바꾸고 캐시를 비운 뒤 일정으로 간다', async () => {
    const result: LoginResult = { accessToken: 'new-access', user };
    h.post.mockImplementation(async (url: string, body: { channel?: string }) => {
      if (url === '/auth/onboarding/codes') return sent(body.channel as 'email' | 'sms');
      if (url === '/auth/onboarding/complete') return { data: result };
      throw new Error(url);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());

    type(view, '이메일', 'Kim.New@tnacademy.kr');
    fireEvent.click(view.getByRole('button', { name: '메일로 코드 받기' }));
    await waitFor(() => expect(view.getByText(/ki\*\*\*@tnacademy\.kr/)).toBeTruthy());
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/codes', { channel: 'email', target: 'Kim.New@tnacademy.kr' });

    type(view, '휴대폰', '010-1234-5678');
    fireEvent.click(view.getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect(view.getByText(/010-\*\*\*\*-5678/)).toBeTruthy());
    expect(view.queryByText(/개발용 코드/)).toBeNull();

    type(view, '이메일 인증 코드', '111111');
    type(view, '휴대폰 인증 코드', '222222');
    type(view, '새 비밀번호', 'Brand-new-77');
    type(view, '새 비밀번호 확인', 'Brand-new-77');
    fireEvent.click(view.getByRole('button', { name: '설정 마치기' }));

    await waitFor(() => expect(h.signIn).toHaveBeenCalledWith('new-access', user));
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/complete', {
      email: 'Kim.New@tnacademy.kr', password: 'Brand-new-77', phone: '010-1234-5678', emailCode: '111111', phoneCode: '222222',
    });
    expect(h.clear).toHaveBeenCalledOnce();
    expect(h.clear.mock.invocationCallOrder[0]).toBeLessThan(h.signIn.mock.invocationCallOrder[0]);
    expect(h.replace).toHaveBeenCalledWith('/schedule');
  });

  it('해외 번호는 국가번호를 골라 「+국가번호 번호」로 보낸다 — 나라 이름은 서버 목록 그대로 · 기본은 첫 줄(국내) (N-103)', async () => {
    const result: LoginResult = { accessToken: 'new-access', user };
    h.post.mockImplementation(async (url: string, body: { channel?: string }) => {
      if (url === '/auth/onboarding/codes') return sent(body.channel as 'email' | 'sms', body.channel === 'sms' ? { targetMasked: '+1 ****0123' } : {});
      if (url === '/auth/onboarding/complete') return { data: result };
      throw new Error(url);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    const country = view.getByRole('combobox', { name: '국가번호' }) as HTMLSelectElement;
    expect(country.value).toBe('82');
    expect([...country.options].map((o) => o.textContent)).toEqual(['+82 대한민국', '+1 미국 · 캐나다']);
    fireEvent.change(country, { target: { value: '1' } });
    type(view, '휴대폰', '(415) 555-0123');
    fireEvent.click(view.getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect(view.getByText(/\+1 \*\*\*\*0123/)).toBeTruthy());
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/codes', { channel: 'sms', target: '+1 (415) 555-0123' });

    type(view, '이메일', 'kim@tnacademy.kr');
    type(view, '이메일 인증 코드', '111111');
    type(view, '휴대폰 인증 코드', '222222');
    type(view, '새 비밀번호', 'Brand-new-77');
    type(view, '새 비밀번호 확인', 'Brand-new-77');
    fireEvent.click(view.getByRole('button', { name: '설정 마치기' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/auth/onboarding/complete', expect.objectContaining({ phone: '+1 (415) 555-0123' })));
  });

  it('서버 거절 문장을 그대로 보이고 세션을 바꾸지 않는다', async () => {
    h.post.mockImplementation(async (url: string) => {
      if (url === '/auth/onboarding/codes') throw new ApiError('EMAIL_TAKEN', '이미 다른 계정이 쓰는 이메일입니다 — 다른 주소를 적어 주세요', 409);
      throw new ApiError('CODE_MISMATCH', '휴대폰 코드가 맞지 않습니다 — 4번 더 시도할 수 있습니다', 409);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '이메일', 'taken@tnacademy.kr');
    fireEvent.click(view.getByRole('button', { name: '메일로 코드 받기' }));
    await waitFor(() => expect(view.getByText('이미 다른 계정이 쓰는 이메일입니다 — 다른 주소를 적어 주세요')).toBeTruthy());

    type(view, '휴대폰', '01012345678');
    type(view, '이메일 인증 코드', '111111');
    type(view, '휴대폰 인증 코드', '000000');
    type(view, '새 비밀번호', 'Brand-new-77');
    type(view, '새 비밀번호 확인', 'Brand-new-77');
    fireEvent.click(view.getByRole('button', { name: '설정 마치기' }));
    await waitFor(() => expect(view.getByText('휴대폰 코드가 맞지 않습니다 — 4번 더 시도할 수 있습니다')).toBeTruthy());
    expect(h.signIn).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: '설정 마치기' }).hasAttribute('disabled')).toBe(false);
  });

  it('코드 받기 거절은 누른 단추 바로 아래에 선다 — 휴대폰 화면에서 맨 아래 띠만 두면 보이지 않는다 (QA 0926 UX-1)', async () => {
    h.post.mockImplementation(async () => {
      throw new ApiError('CODE_TOO_SOON', '코드를 방금 보냈습니다 — 42초 뒤에 다시 받을 수 있습니다', 429);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '이메일', 'kim@tnacademy.kr');
    const button = view.getByRole('button', { name: '메일로 코드 받기' });
    fireEvent.click(button);
    const alert = await view.findByRole('alert');
    expect(alert.textContent).toBe('코드를 방금 보냈습니다 — 42초 뒤에 다시 받을 수 있습니다');
    // 단추와 같은 줄 묶음 안 — 폼 맨 아래(설정 마치기 옆)가 아니다
    expect(button.parentElement?.contains(alert)).toBe(true);
    // 다른 채널 줄로 옮겨 가면 앞 채널의 거절은 지운다
    type(view, '휴대폰', '01012345678');
    fireEvent.click(view.getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect(view.getAllByRole('alert')).toHaveLength(1));
    expect(view.getByRole('button', { name: '문자로 코드 받기' }).parentElement?.contains(view.getByRole('alert'))).toBe(true);
  });

  it('새 비밀번호와 확인이 다르면 보내지 않는다', async () => {
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '새 비밀번호', 'Brand-new-77');
    type(view, '새 비밀번호 확인', 'Brand-new-78');
    fireEvent.click(view.getByRole('button', { name: '설정 마치기' }));
    expect(view.getByText('새 비밀번호와 확인이 다릅니다')).toBeTruthy();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('응답에 개발용 코드가 있을 때만 「개발용 코드」를 보인다', async () => {
    h.post.mockResolvedValueOnce(sent('email', { devCode: '482913' }));
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '이메일', 'dev@tnacademy.kr');
    fireEvent.click(view.getByRole('button', { name: '메일로 코드 받기' }));
    await waitFor(() => expect(view.getByText('개발용 코드: 482913')).toBeTruthy());
  });

  it('다시 받기는 서버가 준 초만큼 잠기고 초읽기가 끝나면 풀린다', async () => {
    h.post.mockResolvedValueOnce(sent('email', { resendAfterSeconds: 2 }));
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '이메일', 'kim@tnacademy.kr');
    fireEvent.click(view.getByRole('button', { name: '메일로 코드 받기' }));
    const waiting = await view.findByRole('button', { name: /다시 받기 \(\d초\)/ });
    expect(waiting.hasAttribute('disabled')).toBe(true);
    await waitFor(() => {
      const again = view.getByRole('button', { name: '메일로 코드 받기' });
      expect(again.hasAttribute('disabled')).toBe(false);
    }, { timeout: 4_000 });
  });

  it('보낼 수 없는 채널은 단추를 잠그고 서버가 준 까닭을 붙인다', async () => {
    const view = mount({
      ...info,
      channels: [info.channels[0], { channel: 'sms', label: '문자', ready: false, notReadyReason: '문자 발송 설정이 없어 보내지 못합니다' }],
    });
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    expect(view.getByRole('button', { name: '문자로 코드 받기' }).hasAttribute('disabled')).toBe(true);
    expect(view.getByText('문자 발송 설정이 없어 보내지 못합니다')).toBeTruthy();
    // 받을 곳을 적기 전에는 잠겨 있고, 적으면 준비된 채널만 열린다
    expect(view.getByRole('button', { name: '메일로 코드 받기' }).hasAttribute('disabled')).toBe(true);
    type(view, '이메일', 'kim@tnacademy.kr');
    type(view, '휴대폰', '01012345678');
    expect(view.getByRole('button', { name: '메일로 코드 받기' }).hasAttribute('disabled')).toBe(false);
    expect(view.getByRole('button', { name: '문자로 코드 받기' }).hasAttribute('disabled')).toBe(true);
  });

  it('로그아웃은 쿠키를 지우고 세션과 캐시를 비운 뒤 로그인으로 간다', async () => {
    h.post.mockResolvedValueOnce({ data: undefined });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    fireEvent.click(within(view.container).getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/login'));
    expect(h.post).toHaveBeenCalledWith('/auth/logout');
    expect(h.signOut).toHaveBeenCalledOnce();
    expect(h.clear).toHaveBeenCalledOnce();
  });
});
