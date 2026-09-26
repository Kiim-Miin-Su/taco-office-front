/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 비밀번호 찾기 화면 (N-101 · 대표 결정 2026-09-26) — 받는 곳을 묻지 않는지, 서버 문장(계정 여부를 말하지 않는 안내 · 거절)을
 * 그대로 적는지, 두 코드 + 새 비밀번호를 한 번에 보내고 로그인으로 돌려보내는지 본다. API 는 대역이다.
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PasswordResetCodeResult, PasswordResetInfo } from '@/api/types';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/client')>(),
  api: { get: h.get, post: h.post },
}));
vi.mock('@/store/useSession', () => {
  const state = { me: null };
  return { useSession: (select: (s: typeof state) => unknown) => select(state) };
});

import PasswordResetPage from './page';
import { ApiError } from '@/api/client';

const RULE = '비밀번호는 8자 이상 · 영문과 숫자를 함께 · 초기 비밀번호와 지금 비밀번호는 쓸 수 없습니다';
const SENT_EMAIL = '입력한 아이디에 확인된 이메일이 있으면 그 주소로 코드를 보냈습니다 — 10분 안에 입력해 주세요.';
const info: PasswordResetInfo = {
  passwordRule: RULE, codeTtlMinutes: 10, resendAfterSeconds: 60,
  channels: [
    { channel: 'email', label: '메일', ready: true, notReadyReason: null },
    { channel: 'sms', label: '문자', ready: true, notReadyReason: null },
  ],
};
const sent = (channel: 'email' | 'sms', extra: Partial<PasswordResetCodeResult> = {}): { data: PasswordResetCodeResult } => ({
  data: {
    channel, message: channel === 'email' ? SENT_EMAIL : '입력한 아이디에 확인된 휴대폰이 있으면 그 번호로 코드를 보냈습니다',
    expiresAt: '2026-09-26T03:10:00.000Z', resendAfterSeconds: 60, ...extra,
  },
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(data: PasswordResetInfo = info) {
  h.get.mockResolvedValue({ data });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PasswordResetPage /></QueryClientProvider>);
}
const type = (view: ReturnType<typeof render>, label: string, value: string) =>
  fireEvent.change(view.getByLabelText(label), { target: { value } });

describe('비밀번호 찾기 화면', () => {
  it('서버 규칙 문장 · 채널 이름을 그대로 보이고 받는 곳은 묻지 않는다 — 아이디를 적어야 코드 단추가 열린다', async () => {
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    expect(h.get).toHaveBeenCalledWith('/auth/password-reset');
    const email = view.getByRole('button', { name: '메일로 코드 받기' });
    const sms = view.getByRole('button', { name: '문자로 코드 받기' });
    expect(email.hasAttribute('disabled')).toBe(true);
    expect(sms.hasAttribute('disabled')).toBe(true);
    // 입력 칸은 아이디 · 두 코드 · 새 비밀번호 둘 — 받는 곳(주소 · 번호) 칸이 없다
    expect([...view.container.querySelectorAll('input')].map((i) => i.id))
      .toEqual(['pr-login', 'pr-email-code', 'pr-phone-code', 'pr-pw', 'pr-pw2']);
    type(view, '아이디', 'kim@tnacademy.kr');
    expect(email.hasAttribute('disabled')).toBe(false);
    expect(sms.hasAttribute('disabled')).toBe(false);
    expect(view.getByRole('link', { name: '로그인으로 돌아가기' }).getAttribute('href')).toBe('/login');
  });

  it('코드 받기는 아이디와 채널만 보내고 서버 안내 문장을 그대로 적는다 · 두 코드와 새 비밀번호로 바꾸면 로그인으로 돌려보낸다', async () => {
    h.post.mockImplementation(async (url: string, body: { channel?: string }) => {
      if (url === '/auth/password-reset/codes') return sent(body.channel as 'email' | 'sms');
      if (url === '/auth/password-reset/complete') return { data: undefined };
      throw new Error(url);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '아이디', 'Kim@tnacademy.kr');
    fireEvent.click(view.getByRole('button', { name: '메일로 코드 받기' }));
    await waitFor(() => expect(view.getByText(SENT_EMAIL)).toBeTruthy());
    expect(h.post).toHaveBeenCalledWith('/auth/password-reset/codes', { loginId: 'Kim@tnacademy.kr', channel: 'email' });
    expect(view.getByRole('button', { name: /다시 받기 \(\d+초\)/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(view.getByRole('button', { name: '문자로 코드 받기' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/auth/password-reset/codes', { loginId: 'Kim@tnacademy.kr', channel: 'sms' }));
    expect(view.queryByText(/개발용 코드/)).toBeNull();

    type(view, '이메일 인증 코드', '111111');
    type(view, '휴대폰 인증 코드', '222222');
    type(view, '새 비밀번호', 'Recovered-77');
    type(view, '새 비밀번호 확인', 'Recovered-77');
    fireEvent.click(view.getByRole('button', { name: '새 비밀번호로 바꾸기' }));
    await waitFor(() => expect(view.getByText(/비밀번호를 바꿨습니다/)).toBeTruthy());
    expect(h.post).toHaveBeenCalledWith('/auth/password-reset/complete', {
      loginId: 'Kim@tnacademy.kr', emailCode: '111111', phoneCode: '222222', password: 'Recovered-77',
    });
    expect(view.getByRole('link', { name: '로그인으로' }).getAttribute('href')).toBe('/login');
    // 바꾼 뒤에는 입력 칸이 남지 않는다
    expect(view.container.querySelectorAll('input')).toHaveLength(0);
  });

  it('서버 거절 문장을 누른 자리 옆에 그대로 보인다 — 코드 받기는 단추 아래 · 마치기는 마치기 위', async () => {
    h.post.mockImplementation(async (url: string) => {
      if (url === '/auth/password-reset/codes') throw new ApiError('SENDER_NOT_CONFIGURED', '문자 발송 설정이 없어 보내지 못합니다 — 관리자에게 알려 주세요', 503);
      throw new ApiError('RESET_CODE_INVALID', '아이디 또는 확인 코드가 맞지 않습니다 — 코드를 확인하거나 다시 받아 주세요', 409);
    });
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '아이디', 'kim@tnacademy.kr');
    const sms = view.getByRole('button', { name: '문자로 코드 받기' });
    fireEvent.click(sms);
    const alert = await view.findByRole('alert');
    expect(alert.textContent).toBe('문자 발송 설정이 없어 보내지 못합니다 — 관리자에게 알려 주세요');
    expect(sms.parentElement?.contains(alert)).toBe(true);

    type(view, '이메일 인증 코드', '111111');
    type(view, '휴대폰 인증 코드', '000000');
    type(view, '새 비밀번호', 'Recovered-77');
    type(view, '새 비밀번호 확인', 'Recovered-77');
    fireEvent.click(view.getByRole('button', { name: '새 비밀번호로 바꾸기' }));
    await waitFor(() => expect(view.getByText('아이디 또는 확인 코드가 맞지 않습니다 — 코드를 확인하거나 다시 받아 주세요')).toBeTruthy());
    expect(view.queryByText(/비밀번호를 바꿨습니다/)).toBeNull();
    expect(view.getByRole('button', { name: '새 비밀번호로 바꾸기' }).hasAttribute('disabled')).toBe(false);
  });

  it('새 비밀번호와 확인이 다르면 보내지 않는다', async () => {
    const view = mount();
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '새 비밀번호', 'Recovered-77');
    type(view, '새 비밀번호 확인', 'Recovered-78');
    fireEvent.click(view.getByRole('button', { name: '새 비밀번호로 바꾸기' }));
    expect(view.getByText('새 비밀번호와 확인이 다릅니다')).toBeTruthy();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('보낼 수 없는 채널은 서버 까닭으로 잠그고 · 응답에 개발용 코드가 있을 때만 보인다', async () => {
    h.post.mockResolvedValueOnce(sent('email', { devCode: '482913' }));
    const view = mount({
      ...info,
      channels: [info.channels[0], { channel: 'sms', label: '문자', ready: false, notReadyReason: '인증 코드 비밀 값(AUTH_CODE_SECRET)이 서버에 없어 코드를 보내지 못합니다' }],
    });
    await waitFor(() => expect(view.getByText(RULE)).toBeTruthy());
    type(view, '아이디', 'kim@tnacademy.kr');
    expect(view.getByRole('button', { name: '문자로 코드 받기' }).hasAttribute('disabled')).toBe(true);
    expect(view.getByText('인증 코드 비밀 값(AUTH_CODE_SECRET)이 서버에 없어 코드를 보내지 못합니다')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '메일로 코드 받기' }));
    await waitFor(() => expect(view.getByText('개발용 코드: 482913')).toBeTruthy());
  });
});
