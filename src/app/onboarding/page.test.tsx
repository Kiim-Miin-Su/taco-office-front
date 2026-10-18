/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 첫 설정 화면 (W8 · 대표 지시 2026-09-26) — 서버 낱말(규칙 · 채널 이름 · 못 보내는 까닭 · 거절 문장)을 그대로 쓰는지,
 * 코드 받기 → 채널마다 인증하기(2026-10-19) → 마치기(새 비밀번호만) → 새 세션까지 이어지는지, 다시 받기 초읽기와 개발용 코드 표시를 본다.
 * API 는 대역이다.
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
import { fallbackRouteFor } from '@/components/shell/navigation';
import { ApiError } from '@/api/client';

const RULE = '비밀번호는 8자 이상 · 영문과 숫자를 함께 · 초기 비밀번호와 지금 비밀번호는 쓸 수 없습니다';
/** 서버(onboardingIncomplete)가 주는 남은 인증 문장 — 화면은 이 문장을 그대로 쓴다 */
const LEFT = (what: string) => `${what} 인증을 먼저 마쳐 주세요 — 각 칸의 「인증하기」를 눌러 주세요`;
const info: OnboardingInfo = {
  required: true, loginId: '새강사_01', emailMasked: null, phoneMasked: null, passwordRule: RULE,
  codeTtlMinutes: 10, resendAfterSeconds: 60,
  channels: [
    { channel: 'email', label: '메일', ready: true, notReadyReason: null },
    { channel: 'sms', label: '문자', ready: true, notReadyReason: null },
  ],
  // 서버 목록 — 첫 줄이 국내(N-103)
  phoneCountries: [{ code: '82', label: '대한민국' }, { code: '1', label: '미국 · 캐나다' }],
  emailVerifiedMasked: null, phoneVerifiedMasked: null, completeBlockedReason: LEFT('이메일 · 휴대폰 번호'),
};
/** 이메일만 인증한 뒤의 안내 */
const emailDone: OnboardingInfo = {
  ...info, emailMasked: 'ki***@tnacademy.kr', emailVerifiedMasked: 'ki***@tnacademy.kr', completeBlockedReason: LEFT('휴대폰 번호'),
};
/** 두 채널을 다 인증한 뒤의 안내 — 이제 마치기가 열린다 */
const bothDone: OnboardingInfo = {
  ...emailDone, phoneMasked: '010-****-5678', phoneVerifiedMasked: '010-****-5678', completeBlockedReason: null,
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
    expect(view.getByText('처음 로그인하셨습니다 — 이메일 · 휴대폰 번호를 각각 인증하고 새 비밀번호를 정해야 쓸 수 있습니다')).toBeTruthy();
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

  it('코드를 받아 채널마다 인증하기를 누르고, 새 비밀번호만 보내 마치면 새 세션으로 바꾸고 캐시를 비운 뒤 일정으로 간다', async () => {
    const result: LoginResult = { accessToken: 'new-access', user };
    h.post.mockImplementation(async (url: string, body: { channel?: string }) => {
      if (url === '/auth/onboarding/codes') return sent(body.channel as 'email' | 'sms');
      if (url === '/auth/onboarding/verify') return { data: body.channel === 'email' ? emailDone : bothDone };
      if (url === '/auth/onboarding/complete') return { data: result };
      throw new Error(url);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    // 둘 다 인증하기 전에는 마치기가 잠기고 서버 까닭이 단추 위에 선다
    const submit = () => view.getByRole('button', { name: '설정 마치기' });
    expect(submit().hasAttribute('disabled')).toBe(true);
    expect(view.getByText(LEFT('이메일 · 휴대폰 번호'))).toBeTruthy();

    type(view, '이메일', 'Kim.New@tnacademy.kr');
    fireEvent.click(view.getByRole('button', { name: '메일로 코드 받기' }));
    await waitFor(() => expect(view.getByText(/ki\*\*\*@tnacademy\.kr/)).toBeTruthy());
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/codes', { channel: 'email', target: 'Kim.New@tnacademy.kr' });
    // 여섯 자리를 적기 전에는 인증하기가 잠긴다
    expect(view.getByRole('button', { name: '이메일 인증하기' }).hasAttribute('disabled')).toBe(true);
    type(view, '이메일 인증 코드', '111111');
    fireEvent.click(view.getByRole('button', { name: '이메일 인증하기' }));
    await waitFor(() => expect(view.getByText('이메일 인증 완료')).toBeTruthy());
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/verify', { channel: 'email', target: 'Kim.New@tnacademy.kr', code: '111111' });
    // 인증한 채널은 받는 곳 칸 대신 서버가 기억한 가린 모양을 보인다 — 남은 까닭도 서버 문장으로 바뀐다
    expect(view.queryByLabelText('이메일 인증 코드')).toBeNull();
    expect(view.getByText(LEFT('휴대폰 번호'))).toBeTruthy();
    expect(submit().hasAttribute('disabled')).toBe(true);

    type(view, '휴대폰', '010-1234-5678');
    fireEvent.click(view.getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect(view.getByText(/010-\*\*\*\*-5678/)).toBeTruthy());
    expect(view.queryByText(/개발용 코드/)).toBeNull();
    type(view, '휴대폰 인증 코드', '222222');
    fireEvent.click(view.getByRole('button', { name: '휴대폰 번호 인증하기' }));
    await waitFor(() => expect(view.getByText('휴대폰 인증 완료')).toBeTruthy());
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/verify', { channel: 'sms', target: '010-1234-5678', code: '222222' });
    expect(view.queryByText(/인증을 먼저 마쳐 주세요/)).toBeNull();

    type(view, '새 비밀번호', 'Brand-new-77');
    type(view, '새 비밀번호 확인', 'Brand-new-77');
    expect(submit().hasAttribute('disabled')).toBe(false);
    fireEvent.click(submit());

    await waitFor(() => expect(h.signIn).toHaveBeenCalledWith('new-access', user));
    // 마치기는 새 비밀번호만 보낸다 — 이메일 · 휴대폰은 인증하기가 이미 증명했다
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/complete', { password: 'Brand-new-77' });
    expect(h.clear).toHaveBeenCalledOnce();
    expect(h.clear.mock.invocationCallOrder[0]).toBeLessThan(h.signIn.mock.invocationCallOrder[0]);
    // 착지는 로그인과 같은 한 규칙(navigation.fallbackRouteFor)이다 — 화면이 역할 낱말로 갈래를 따로 두지 않는다
    expect(h.replace).toHaveBeenCalledWith(fallbackRouteFor(user));
  });

  it('세 가지 모두 필요 · 건너뛰기 없음 — 1·2·3 단계 상태가 진행을 따라 바뀐다 (AUTH-INIT-02 · D7)', async () => {
    h.post.mockImplementation(async (url: string, body: { channel?: string }) => {
      if (url === '/auth/onboarding/codes' && body.channel === 'sms') {
        throw new ApiError('SEND_FAILED', '문자로 코드를 보내지 못했습니다 — 잠시 뒤 다시 받아 주세요', 502);
      }
      if (url === '/auth/onboarding/codes') return sent('email');
      if (url === '/auth/onboarding/verify') return { data: emailDone };
      throw new Error(url);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    expect(view.getByText('세 가지를 모두 마쳐야 업무 화면이 열립니다 · 건너뛸 수 없습니다')).toBeTruthy();
    const steps = () => within(view.getByRole('list', { name: '필수 단계' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(steps()).toEqual(['1이메일 인증코드 받기 전', '2휴대폰 인증코드 받기 전', '3새 비밀번호입력 전']);
    // 건너뛰기 · 나중에 하기 단추는 없다
    expect(view.queryByRole('button', { name: /건너|나중/ })).toBeNull();

    type(view, '이메일', 'kim@tnacademy.kr');
    fireEvent.click(view.getByRole('button', { name: '메일로 코드 받기' }));
    await waitFor(() => expect(steps()[0]).toMatch(/^1이메일 인증코드 보냄 · \d+초$/));
    type(view, '이메일 인증 코드', '111111');
    expect(steps()[0]).toBe('1이메일 인증코드 적음');
    fireEvent.click(view.getByRole('button', { name: '이메일 인증하기' }));
    await waitFor(() => expect(steps()[0]).toBe('1이메일 인증인증 완료'));

    type(view, '휴대폰', '01012345678');
    fireEvent.click(view.getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect(steps()[1]).toBe('2휴대폰 인증발송 실패'));

    type(view, '새 비밀번호', 'short');
    expect(steps()[2]).toBe('3새 비밀번호입력됨');
    // 휴대폰 인증이 남아 있어 마치기는 열리지 않는다 — 건너뛸 수 없다
    expect(view.getByRole('button', { name: '설정 마치기' }).hasAttribute('disabled')).toBe(true);
    expect(h.post).not.toHaveBeenCalledWith('/auth/onboarding/complete', expect.anything());
  });

  it('두 채널을 마친 뒤 비밀번호 규칙 거절은 3단계를 「규칙 확인」으로 바꾸고 세션을 그대로 둔다', async () => {
    h.post.mockImplementation(async () => { throw new ApiError('PASSWORD_RULE', RULE, 400); });
    const view = mount(bothDone);
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    const steps = () => within(view.getByRole('list', { name: '필수 단계' })).getAllByRole('listitem').map((li) => li.textContent);
    // 서버가 기억한 인증 — 새로 고친 화면도 두 채널을 「인증 완료」로 연다
    expect(steps().slice(0, 2)).toEqual(['1이메일 인증인증 완료', '2휴대폰 인증인증 완료']);
    type(view, '새 비밀번호', 'short');
    type(view, '새 비밀번호 확인', 'short');
    fireEvent.click(view.getByRole('button', { name: '설정 마치기' }));
    await waitFor(() => expect(steps()[2]).toBe('3새 비밀번호규칙 확인'));
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/complete', { password: 'short' });
    // 거절이면 새 비밀번호는 저장되지 않았다 — 카드 아래 띠가 그렇게 말하고, 세션은 그대로다
    expect(view.getByText('설정을 마치지 못했습니다 — 새 비밀번호는 저장되지 않았습니다')).toBeTruthy();
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it('인증을 마친 채널은 「다른 주소로 다시 인증」으로 다시 열고 「그대로 두기」로 닫는다 — 서버 증거는 새로 인증할 때만 바뀐다', async () => {
    const view = mount(emailDone);
    await waitFor(() => expect(view.getByText('이메일 인증 완료')).toBeTruthy());
    expect(view.getByText('ki***@tnacademy.kr')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '다른 주소로 다시 인증' }));
    expect(view.getByLabelText('이메일 인증 코드')).toBeTruthy();
    expect(view.getByRole('button', { name: '이메일 인증하기' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '인증한 주소 그대로 두기 (ki***@tnacademy.kr)' }));
    expect(view.getByText('이메일 인증 완료')).toBeTruthy();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('코드 칸에서 Enter 는 그 채널의 인증하기다 — 설정 마치기로 보내지 않는다', async () => {
    h.post.mockImplementation(async (url: string) => {
      if (url === '/auth/onboarding/verify') return { data: emailDone };
      throw new Error(url);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '이메일', 'kim@tnacademy.kr');
    type(view, '이메일 인증 코드', '123456');
    fireEvent.keyDown(view.getByLabelText('이메일 인증 코드'), { key: 'Enter' });
    await waitFor(() => expect(view.getByText('이메일 인증 완료')).toBeTruthy());
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/verify', { channel: 'email', target: 'kim@tnacademy.kr', code: '123456' });
  });

  it('해외 번호는 국가번호를 골라 「+국가번호 번호」로 받고 인증한다 — 나라 이름은 서버 목록 그대로 · 기본은 첫 줄(국내) (N-103)', async () => {
    h.post.mockImplementation(async (url: string, body: { channel?: string }) => {
      if (url === '/auth/onboarding/codes') return sent(body.channel as 'email' | 'sms', body.channel === 'sms' ? { targetMasked: '+1 ****0123' } : {});
      if (url === '/auth/onboarding/verify') return { data: { ...info, phoneVerifiedMasked: '+1 ****0123', completeBlockedReason: LEFT('이메일') } };
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

    type(view, '휴대폰 인증 코드', '222222');
    fireEvent.click(view.getByRole('button', { name: '휴대폰 번호 인증하기' }));
    await waitFor(() => expect(view.getByText('휴대폰 인증 완료')).toBeTruthy());
    expect(h.post).toHaveBeenCalledWith('/auth/onboarding/verify', { channel: 'sms', target: '+1 (415) 555-0123', code: '222222' });
    expect(view.getByText('+1 ****0123')).toBeTruthy();
  });

  it('서버 거절 문장을 누른 자리 옆에 그대로 보이고 세션을 바꾸지 않는다', async () => {
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
    type(view, '휴대폰 인증 코드', '000000');
    const verifyButton = view.getByRole('button', { name: '휴대폰 번호 인증하기' });
    fireEvent.click(verifyButton);
    const alert = await view.findByText('휴대폰 코드가 맞지 않습니다 — 4번 더 시도할 수 있습니다');
    // 인증하기 단추 바로 아래 — 폼 맨 아래가 아니다
    expect(alert.getAttribute('role')).toBe('alert');
    expect(verifyButton.parentElement?.contains(alert)).toBe(true);
    expect(within(view.getByRole('list', { name: '필수 단계' })).getAllByRole('listitem')[1].textContent).toBe('2휴대폰 인증다시 확인');
    expect(h.signIn).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it('마치기 거절 띠는 role=alert 로 알리고, 보내는 동안 빠진 초점은 마치기 단추로 돌아온다 — 키보드 · 화면 낭독기 (S4)', async () => {
    let reject: (e: unknown) => void = () => undefined;
    h.post.mockImplementation((url: string) => {
      if (url === '/auth/onboarding/complete') return new Promise((_, r) => { reject = r; });
      return Promise.reject(new Error(url));
    });
    const view = mount(bothDone);
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '새 비밀번호', 'Brand-new-77');
    type(view, '새 비밀번호 확인', 'Brand-new-77');
    const submit = view.getByRole('button', { name: '설정 마치기' });
    submit.focus();
    fireEvent.click(submit);
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/auth/onboarding/complete', expect.anything()));
    // 실제 브라우저는 보내는 동안 disabled 가 된 단추의 초점을 body 로 버린다 — jsdom 은 버리지 않으므로 그 상태를 만든다
    (document.activeElement as HTMLElement | null)?.blur();
    reject(new ApiError('SAME_AS_CURRENT', '지금 비밀번호와 다른 새 비밀번호를 정해 주세요', 409));
    const alert = await view.findByRole('alert');
    expect(alert.textContent).toContain('설정을 마치지 못했습니다 — 새 비밀번호는 저장되지 않았습니다');
    expect(alert.textContent).toContain('지금 비밀번호와 다른 새 비밀번호를 정해 주세요');
    await waitFor(() => expect(document.activeElement).toBe(view.getByRole('button', { name: '설정 마치기' })));
  });

  it('마치기가 남은 인증으로 거절되면 안내를 다시 읽어 서버 값으로 단추 · 칩을 맞춘다', async () => {
    h.post.mockImplementation(async () => { throw new ApiError('CONTACT_NOT_VERIFIED', LEFT('휴대폰 번호'), 409); });
    const view = mount(bothDone);
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    h.get.mockResolvedValue({ data: emailDone });
    type(view, '새 비밀번호', 'Brand-new-77');
    type(view, '새 비밀번호 확인', 'Brand-new-77');
    fireEvent.click(view.getByRole('button', { name: '설정 마치기' }));
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.getByRole('button', { name: '설정 마치기' }).hasAttribute('disabled')).toBe(true));
    expect(view.getByRole('button', { name: '휴대폰 번호 인증하기' })).toBeTruthy();
  });

  it('코드 받기 거절은 누른 단추 바로 아래에 선다 — 휴대폰 화면에서 맨 아래 띠만 두면 보이지 않는다 (QA 0926 UX-1)', async () => {
    h.post.mockImplementation(async () => {
      throw new ApiError('CODE_TOO_SOON', '직전 코드 요청 뒤 60초가 지나야 다시 받을 수 있습니다 — 42초 뒤에 다시 받아 주세요', 429);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '이메일', 'kim@tnacademy.kr');
    const button = view.getByRole('button', { name: '메일로 코드 받기' });
    fireEvent.click(button);
    const alert = await view.findByRole('alert');
    expect(alert.textContent).toBe('직전 코드 요청 뒤 60초가 지나야 다시 받을 수 있습니다 — 42초 뒤에 다시 받아 주세요');
    // 단추와 같은 줄 묶음 안 — 폼 맨 아래(설정 마치기 옆)가 아니다
    expect(button.parentElement?.contains(alert)).toBe(true);
    // 다른 채널 줄로 옮겨 가면 앞 채널의 거절은 지운다
    type(view, '휴대폰', '01012345678');
    fireEvent.click(view.getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect(view.getAllByRole('alert')).toHaveLength(1));
    expect(view.getByRole('button', { name: '문자로 코드 받기' }).parentElement?.contains(view.getByRole('alert'))).toBe(true);
  });

  it('새 비밀번호와 확인이 다르면 보내지 않는다', async () => {
    const view = mount(bothDone);
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
    // 초읽기 동안은 aria-disabled 로 잠근다 — disabled 면 누른 단추의 초점이 body 로 빠진다(S4)
    expect(waiting.getAttribute('aria-disabled')).toBe('true');
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
