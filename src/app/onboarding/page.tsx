/** @file-guide
 * 목적: page.tsx — OnboardingPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, apiMessage } from '@/api/client';
import { clearSessionQueries } from '@/api/session-cache';
import { useOnboardingInfo } from '@/api/queries';
import { useSession } from '@/store/useSession';
import { Banner, Button, Input, Label, Logo, QueryState } from '@/components/ui';
import { CodeRequestButton, useResendCountdown, type CodeChannel } from '@/components/account/CodeRequest';
import { PhoneInput, composePhone, type PhoneValue } from '@/components/account/PhoneInput';
import type { LoginResult, OnboardingCodeRequest, OnboardingCodeResult, OnboardingComplete, OnboardingInfo } from '@/api/types';

/**
 * 계정 첫 설정 (W8 · 대표 지시 2026-09-26) — 「첫 로그인 시 아이디 및 비밀번호 강제 변경 · phone · email 인증 필수
 * (변경 안 하면 홈 페이지 접속 불가, 자동 리다이렉션)」.
 *
 * 로그인처럼 셸 없이 홀로 선다 — 첫 설정 전에는 다른 화면 · API 가 전부 닫혀 있어(RouteAccess · 서버 403) 메뉴를 그릴 까닭이 없다.
 * 강사도 쓰는 화면이라 휴대폰(393×852)부터 맞추고 넓은 화면에서는 가운데 카드로 둔다.
 * 규칙 문장 · 채널 이름 · 못 보내는 까닭 · 거절 문장 · 휴대폰 국가번호 목록(N-103)은 서버가 준다 — 화면이 규칙을 따로 적지 않는다.
 * 코드 받기 줄과 국가번호 칸은 비밀번호 찾기(N-101)와 같은 부품이다(components/account).
 */
type Channel = CodeChannel;

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signIn = useSession((s) => s.signIn);
  const signOut = useSession((s) => s.signOut);
  const info = useOnboardingInfo();

  const [email, setEmail] = useState('');
  /** 국가번호 + 번호 — 국가번호가 비어 있으면 서버 목록의 첫 줄(국내)이다 */
  const [phone, setPhone] = useState<PhoneValue>({ country: '', local: '' });
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState<Partial<Record<Channel, OnboardingCodeResult>>>({});
  /** 채널별 다시 받기 초읽기 — 서버가 준 resendAfterSeconds 로 센다 */
  const resend = useResendCountdown();
  /*
   * 거절 문장은 **누른 자리 옆**에 선다 — 코드 받기의 거절은 그 채널 단추 바로 아래, 마치기의 거절은 마치기 단추 위.
   * 폼 맨 아래 띠 하나만 두면 393px 휴대폰에서 「코드 받기」를 눌렀을 때 화면 밖이라 아무 일도 없던 것처럼 보인다(QA 0926 UX-1).
   */
  const [err, setErr] = useState<{ at: Channel | 'complete'; text: string } | null>(null);
  const [busy, setBusy] = useState<Channel | 'complete' | 'logout' | null>(null);
  const countries = info.data?.phoneCountries ?? [];
  const phoneText = composePhone(phone, countries);

  async function sendCode(channel: Channel, target: string) {
    setBusy(channel);
    setErr(null);
    try {
      const body: OnboardingCodeRequest = { channel, target };
      const { data } = await api.post<OnboardingCodeResult>('/auth/onboarding/codes', body);
      setSent((prev) => ({ ...prev, [channel]: data }));
      resend.start(channel, data.resendAfterSeconds);
    } catch (e) {
      setErr({ at: channel, text: apiMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function complete(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    // 두 칸이 같은지는 화면이 먼저 본다 — 규칙(길이 · 영문+숫자 · 초기/지금 비밀번호 금지)은 서버가 판정한다
    if (password !== confirm) { setErr({ at: 'complete', text: '새 비밀번호와 확인이 다릅니다' }); return; }
    setBusy('complete');
    try {
      const body: OnboardingComplete = { email, password, phone: phoneText, emailCode, phoneCode };
      const { data } = await api.post<LoginResult>('/auth/onboarding/complete', body);
      // 로그인과 같은 순서 — 옛 세션의 캐시를 버리고 새 토큰 · 새 Me 로 연다(옛 토큰은 서버가 이미 끊었다)
      clearSessionQueries(queryClient);
      signIn(data.accessToken, data.user);
      router.replace('/schedule');
    } catch (e2) {
      setErr({ at: 'complete', text: apiMessage(e2) });
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setBusy('logout');
    try { await api.post('/auth/logout'); } catch { /* 쿠키가 이미 없을 수 있다 */ }
    signOut();
    clearSessionQueries(queryClient);
    router.replace('/login');
  }

  /** 채널 하나의 「코드 받기」 줄 — 준비 안 됨은 서버 까닭, 보낸 뒤에는 가린 받는 곳 · 개발용 코드 · 초읽기(공용 부품) */
  function codeRow(data: OnboardingInfo, channel: Channel, target: string) {
    const result = sent[channel];
    return (
      <CodeRequestButton
        spec={data.channels.find((c) => c.channel === channel)} left={resend.left(channel)} busy={busy === channel}
        disabled={busy !== null || !target.trim()} onSend={() => void sendCode(channel, target)}
        error={err?.at === channel ? err.text : null}
        note={result ? `보낸 곳 ${result.targetMasked} · ${data.codeTtlMinutes}분 안에 적어 주세요` : null}
        devCode={result?.devCode}
      />
    );
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-6 sm:grid sm:place-items-center sm:p-6">
      <form onSubmit={complete} className="mx-auto w-full max-w-[420px] rounded-2xl border border-line bg-card p-5 sm:p-6">
        <Logo size={30} />
        <h1 className="mt-3 text-[17px] font-bold text-fg">첫 설정</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          처음 로그인하셨습니다 — 아이디(이메일)와 비밀번호를 바꾸고 휴대폰·이메일을 확인해야 쓸 수 있습니다
        </p>

        <QueryState query={info}>
          {(data) => (
            <>
              <p className="mt-2 text-[11px] text-fg-subtle">지금 아이디 {data.loginId}</p>

              <div className="mt-5">
                <Label htmlFor="ob-email" hint="받은 코드로 확인한 주소가 새 아이디가 됩니다">새 아이디(이메일)</Label>
                <Input
                  id="ob-email" type="email" value={email} autoComplete="username" inputMode="email"
                  onChange={(e) => setEmail(e.currentTarget.value)}
                />
                {codeRow(data, 'email', email)}
                <div className="mt-2">
                  <Label htmlFor="ob-email-code">이메일 인증 코드</Label>
                  <Input
                    id="ob-email-code" value={emailCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    onChange={(e) => setEmailCode(e.currentTarget.value)}
                  />
                </div>
              </div>

              <div className="mt-5">
                <Label htmlFor="ob-phone" hint={data.phoneMasked ? `등록된 번호 ${data.phoneMasked}` : undefined}>휴대폰</Label>
                {/* 해외 번호는 국가번호를 고른다(N-103) — 나라 목록은 서버가 준다 */}
                <PhoneInput id="ob-phone" countries={data.phoneCountries} value={phone} onChange={setPhone} />
                {codeRow(data, 'sms', phoneText)}
                <div className="mt-2">
                  <Label htmlFor="ob-phone-code">휴대폰 인증 코드</Label>
                  <Input
                    id="ob-phone-code" value={phoneCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    onChange={(e) => setPhoneCode(e.currentTarget.value)}
                  />
                </div>
              </div>

              <div className="mt-5">
                <Label htmlFor="ob-pw">새 비밀번호</Label>
                <Input
                  id="ob-pw" type="password" value={password} autoComplete="new-password"
                  onChange={(e) => setPassword(e.currentTarget.value)}
                />
                <p className="mt-1 text-[11px] text-fg-subtle">{data.passwordRule}</p>
              </div>
              <div className="mt-3">
                <Label htmlFor="ob-pw2">새 비밀번호 확인</Label>
                <Input
                  id="ob-pw2" type="password" value={confirm} autoComplete="new-password"
                  onChange={(e) => setConfirm(e.currentTarget.value)}
                />
              </div>
            </>
          )}
        </QueryState>

        {err?.at === 'complete' ? <Banner tone="danger" className="mt-4">{err.text}</Banner> : null}

        <Button type="submit" variant="primary" disabled={busy !== null || !info.data} className="mt-5 w-full">
          {busy === 'complete' ? '저장하는 중…' : '설정 마치기'}
        </Button>
        <Button variant="ghost" disabled={busy === 'logout'} className="mt-2 w-full" onClick={() => void logout()}>
          로그아웃
        </Button>
      </form>
    </div>
  );
}
