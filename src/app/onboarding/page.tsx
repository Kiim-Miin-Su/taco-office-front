/** @file-guide
 * 목적: page.tsx — OnboardingPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, apiMessage, ApiError } from '@/api/client';
import { clearSessionQueries } from '@/api/session-cache';
import { useOnboardingInfo } from '@/api/queries';
import { useSession } from '@/store/useSession';
import { Banner, Button, Input, Label, Logo, QueryState, cn } from '@/components/ui';
import { fallbackRouteFor } from '@/components/shell/navigation';
import { CodeRequestButton, useResendCountdown, type CodeChannel } from '@/components/account/CodeRequest';
import { PhoneInput, composePhone, type PhoneValue } from '@/components/account/PhoneInput';
import type { LoginResult, OnboardingCodeRequest, OnboardingCodeResult, OnboardingComplete, OnboardingInfo } from '@/api/types';

/**
 * 계정 첫 설정 (W8 · 대표 지시 2026-09-26) — 「첫 로그인 시 아이디 및 비밀번호 강제 변경 · phone · email 인증 필수
 * (변경 안 하면 홈 페이지 접속 불가, 자동 리다이렉션)」.
 * W10 — 아이디는 매니저가 만들 때 정하고(형식 자유) 여기서는 **바꾸지 않는다**. 첫 설정은 「휴대폰 · 이메일 확인 + 새 비밀번호」다
 * (대표 지시 2026-09-26 「초기 설정 시 주요 인증 및 비번 재설정」). 이메일은 연락 · 인증용이다.
 *
 * 로그인처럼 셸 없이 홀로 선다 — 첫 설정 전에는 다른 화면 · API 가 전부 닫혀 있어(RouteAccess · 서버 403) 메뉴를 그릴 까닭이 없다.
 * 강사도 쓰는 화면이라 휴대폰(393×852)부터 맞추고 넓은 화면에서는 가운데 카드로 둔다.
 * 규칙 문장 · 채널 이름 · 못 보내는 까닭 · 거절 문장 · 휴대폰 국가번호 목록(N-103)은 서버가 준다 — 화면이 규칙을 따로 적지 않는다.
 * 코드 받기 줄과 국가번호 칸은 비밀번호 찾기(N-101)와 같은 부품이다(components/account).
 */
type Channel = CodeChannel;

/*
 * AUTH-INIT-02(사용자 결정 2026-10-16) — 모든 역할이 세 가지(이메일 인증 · 휴대폰 인증 · 새 비밀번호)를 모두 마쳐야 업무 화면이 열린다.
 * 건너뛰기 · 나중에 하기는 없다. 1·2·3 단계 칩은 이 화면이 이미 아는 진행(코드 보냄 · 적음 · 입력)과 서버 거절 코드만 그린다(Figma 색인 D7).
 * 마치기 거절의 코드 오류는 어느 채널인지 응답에 없다 — 칩으로 짐작하지 않고 카드 아래 띠의 서버 문장(칸 이름을 말한다)에 맡긴다.
 */
const LIMIT_CODES: ReadonlySet<string> = new Set(['CODE_TOO_SOON', 'CODE_DAILY_LIMIT', 'CODE_LIMIT']);
const PASSWORD_CODES: ReadonlySet<string> = new Set(['PASSWORD_RULE', 'SAME_AS_CURRENT', 'PASSWORD_CONFIRM']);
type StepTone = 'idle' | 'active' | 'error';
const STEP_LOOK: Record<StepTone, string> = {
  idle: 'border-line bg-card text-fg-subtle',
  active: 'border-blue/40 bg-blue/5 text-fg-2',
  error: 'border-red/40 bg-red/5 text-red',
};
const STEP_MARK: Record<StepTone, string> = { idle: 'bg-fg-2', active: 'bg-blue', error: 'bg-red' };

function Step({ n, title, state }: { n: number; title: string; state: { text: string; tone: StepTone } }) {
  return (
    <li className={cn('flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border px-2 py-1.5', STEP_LOOK[state.tone])}>
      {/* 390 폭에서는 칩 하나가 100px 남짓이다 — 말줄임 대신 낱말 단위로 줄을 바꾼다(「이메일 …」로 잘리지 않게) */}
      <span className="flex items-start gap-1.5 text-[12px] font-bold leading-4 text-fg">
        <span className={cn('grid size-4 shrink-0 place-items-center rounded-full text-[12px] leading-none text-white', STEP_MARK[state.tone])}>{n}</span>
        <span className="min-w-0 break-keep">{title}</span>
      </span>
      <span className="break-keep text-[12px] font-medium leading-4">{state.text}</span>
    </li>
  );
}

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
  const [err, setErr] = useState<{ at: Channel | 'complete'; text: string; code?: string } | null>(null);
  const [busy, setBusy] = useState<Channel | 'complete' | 'logout' | null>(null);
  const countries = info.data?.phoneCountries ?? [];
  const phoneText = composePhone(phone, countries);
  // 마치기 거절 뒤 초점이 body 로 빠졌으면(보내는 동안 잠긴 단추에서 브라우저가 버린다) 마치기 단추로 돌린다 — 칸에 있던 초점은 그대로 둔다(S4)
  useEffect(() => {
    if (busy !== null || err?.at !== 'complete' || document.activeElement !== document.body) return;
    document.getElementById('ob-submit')?.focus();
  }, [busy, err]);

  async function sendCode(channel: Channel, target: string) {
    setBusy(channel);
    setErr(null);
    try {
      const body: OnboardingCodeRequest = { channel, target };
      const { data } = await api.post<OnboardingCodeResult>('/auth/onboarding/codes', body);
      setSent((prev) => ({ ...prev, [channel]: data }));
      resend.start(channel, data.resendAfterSeconds);
    } catch (e) {
      setErr({ at: channel, text: apiMessage(e), code: e instanceof ApiError ? e.code : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function complete(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    // 두 칸이 같은지는 화면이 먼저 본다 — 규칙(길이 · 영문+숫자 · 초기/지금 비밀번호 금지)은 서버가 판정한다
    if (password !== confirm) { setErr({ at: 'complete', text: '새 비밀번호와 확인이 다릅니다', code: 'PASSWORD_CONFIRM' }); return; }
    setBusy('complete');
    try {
      const body: OnboardingComplete = { email, password, phone: phoneText, emailCode, phoneCode };
      const { data } = await api.post<LoginResult>('/auth/onboarding/complete', body);
      // 로그인과 같은 순서 — 옛 세션의 캐시를 버리고 새 토큰 · 새 Me 로 연다(옛 토큰은 서버가 이미 끊었다)
      clearSessionQueries(queryClient);
      signIn(data.accessToken, data.user);
      // 착지는 로그인과 같은 한 규칙(navigation.fallbackRouteFor) — 역할 낱말로 갈래를 따로 두지 않는다
      router.replace(fallbackRouteFor(data.user));
    } catch (e2) {
      setErr({ at: 'complete', text: apiMessage(e2), code: e2 instanceof ApiError ? e2.code : undefined });
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

  /** 코드 단계 칩 — 거절(요청 한도 · 발송 실패 · 그 밖) → 코드 적음 → 코드 보냄(초읽기) → 받기 전 */
  function codeStep(channel: Channel): { text: string; tone: StepTone } {
    if (err?.at === channel) {
      const text = err.code && LIMIT_CODES.has(err.code) ? '요청 한도' : err.code === 'SEND_FAILED' ? '발송 실패' : '다시 확인';
      return { text, tone: 'error' };
    }
    if ((channel === 'email' ? emailCode : phoneCode).trim()) {
      return { text: '코드 적음', tone: 'active' };
    }
    if (sent[channel]) {
      const left = resend.left(channel);
      return { text: left > 0 ? `코드 보냄 · ${left}초` : '코드 보냄', tone: 'active' };
    }
    return { text: '코드 받기 전', tone: 'idle' };
  }
  const passwordStep: { text: string; tone: StepTone } = err?.at === 'complete' && err.code && PASSWORD_CODES.has(err.code)
    ? { text: '규칙 확인', tone: 'error' }
    : password ? { text: '입력됨', tone: 'active' } : { text: '입력 전', tone: 'idle' };

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
          처음 로그인하셨습니다 — 휴대폰·이메일을 확인하고 새 비밀번호를 정해야 쓸 수 있습니다
        </p>

        <div className="mt-3 rounded-xl border border-line bg-inset p-2.5">
          <p className="text-[12px] font-bold text-fg">세 가지를 모두 마쳐야 업무 화면이 열립니다 · 건너뛸 수 없습니다</p>
          <ol aria-label="필수 단계" className="mt-2 flex gap-1.5">
            <Step n={1} title="이메일 인증" state={codeStep('email')} />
            <Step n={2} title="휴대폰 인증" state={codeStep('sms')} />
            <Step n={3} title="새 비밀번호" state={passwordStep} />
          </ol>
        </div>

        <QueryState query={info}>
          {(data) => (
            <>
              <p className="mt-2 text-[12px] text-fg-subtle">아이디 {data.loginId} — 바뀌지 않습니다</p>
              {/* 비밀번호 관리자가 새 비밀번호를 이 아이디에 붙여 저장하게 — 보이지 않는 읽기 전용 칸 */}
              <input type="text" name="username" autoComplete="username" value={data.loginId} readOnly hidden />

              <div className="mt-5">
                <Label htmlFor="ob-email" hint={data.emailMasked ? `등록된 주소 ${data.emailMasked}` : undefined}>이메일</Label>
                <Input
                  id="ob-email" type="email" value={email} autoComplete="email" inputMode="email"
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
                <p className="mt-1 text-[12px] text-fg-subtle">{data.passwordRule}</p>
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

        {/* 마치기는 서버가 한 transaction 으로 저장한다 — 거절이면 아무것도 저장되지 않았다(D7 「저장 0」) */}
        {/* role=alert — 화면 낭독기가 거절을 바로 읽는다(띠 부품은 역할을 싣지 않는다) */}
        {err?.at === 'complete' ? (
          <div role="alert" className="mt-4">
            <Banner tone="danger" title="설정을 마치지 못했습니다 — 저장된 것은 없습니다">{err.text}</Banner>
          </div>
        ) : null}

        <Button id="ob-submit" type="submit" variant="primary" disabled={busy !== null || !info.data} className="mt-5 w-full">
          {busy === 'complete' ? '저장하는 중…' : '설정 마치기'}
        </Button>
        <Button variant="ghost" disabled={busy === 'logout'} className="mt-2 w-full" onClick={() => void logout()}>
          로그아웃
        </Button>
      </form>
    </div>
  );
}
