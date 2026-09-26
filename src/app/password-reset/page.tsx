/** @file-guide
 * 목적: page.tsx — PasswordResetPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useState, type FormEvent } from 'react';
import { api, apiMessage } from '@/api/client';
import { usePasswordResetInfo } from '@/api/queries';
import { Banner, Button, Input, Label, LinkButton, Logo, QueryState } from '@/components/ui';
import { CodeRequestButton, useResendCountdown, type CodeChannel } from '@/components/account/CodeRequest';
import type {
  PasswordResetCodeRequest, PasswordResetCodeResult, PasswordResetComplete, PasswordResetInfo,
} from '@/api/types';

/**
 * 비밀번호 찾기 (N-101 · 대표 결정 2026-09-26 「로그인 화면의 비밀번호 찾기 — 등록된 이메일과 휴대폰 코드를 **둘 다** 확인해야
 * 새 비밀번호를 정한다 · 옛 세션은 끊는다 · 모든 역할」).
 *
 * 로그인처럼 셸 없이 홀로 서는 로그인 전 화면이다. 아이디는 형식이 자유다(W10). 코드는 **그 아이디에 등록 · 확인된** 이메일과 휴대폰으로만 가고,
 * 화면은 받는 곳을 묻지 않는다. 서버는 계정이 있는지 알려 주지 않으므로(코드 받기는 늘 같은 문장) 화면도 서버 문장을 그대로 적는다.
 * 규칙 문장 · 채널 이름 · 못 보내는 까닭 · 거절 문장은 서버가 준다. 코드 받기 줄은 첫 설정과 같은 부품이다(components/account).
 * 마치면 로그인하지 않는다 — 새 비밀번호로 다시 로그인한다(첫 설정이 남은 계정은 그 뒤 첫 설정으로 간다).
 */
export default function PasswordResetPage() {
  const info = usePasswordResetInfo();
  const [loginId, setLoginId] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState<Partial<Record<CodeChannel, PasswordResetCodeResult>>>({});
  const resend = useResendCountdown();
  /** 거절 문장은 누른 자리 옆에 선다 — 코드 받기의 거절은 그 채널 단추 아래, 마치기의 거절은 마치기 단추 위(QA 0926 UX-1) */
  const [err, setErr] = useState<{ at: CodeChannel | 'complete'; text: string } | null>(null);
  const [busy, setBusy] = useState<CodeChannel | 'complete' | null>(null);
  const [done, setDone] = useState(false);

  async function sendCode(channel: CodeChannel) {
    setBusy(channel);
    setErr(null);
    try {
      const body: PasswordResetCodeRequest = { loginId, channel };
      const { data } = await api.post<PasswordResetCodeResult>('/auth/password-reset/codes', body);
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
      const body: PasswordResetComplete = { loginId, emailCode, phoneCode, password };
      await api.post('/auth/password-reset/complete', body);
      setDone(true);
    } catch (e2) {
      setErr({ at: 'complete', text: apiMessage(e2) });
    } finally {
      setBusy(null);
    }
  }

  /** 채널 하나의 「코드 받기」 줄 — 보낸 뒤에는 서버 문장(계정 여부를 말하지 않는다) · 개발용 코드 · 초읽기 */
  function codeRow(data: PasswordResetInfo, channel: CodeChannel) {
    const result = sent[channel];
    return (
      <CodeRequestButton
        spec={data.channels.find((c) => c.channel === channel)} left={resend.left(channel)} busy={busy === channel}
        disabled={busy !== null || !loginId.trim()} onSend={() => void sendCode(channel)}
        error={err?.at === channel ? err.text : null} note={result?.message} devCode={result?.devCode}
      />
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-bg px-4 py-6 sm:grid sm:place-items-center sm:p-6">
        <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-line bg-card p-5 sm:p-6">
          <Logo size={30} />
          <h1 className="mt-3 text-[17px] font-bold text-fg">비밀번호 찾기</h1>
          <Banner tone="success" className="mt-4">
            비밀번호를 바꿨습니다 — 다른 곳에 로그인돼 있던 세션은 끊겼습니다. 새 비밀번호로 로그인해 주세요.
          </Banner>
          <LinkButton href="/login" variant="primary" className="mt-5 w-full">로그인으로</LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-6 sm:grid sm:place-items-center sm:p-6">
      <form onSubmit={complete} className="mx-auto w-full max-w-[420px] rounded-2xl border border-line bg-card p-5 sm:p-6">
        <Logo size={30} />
        <h1 className="mt-3 text-[17px] font-bold text-fg">비밀번호 찾기</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          아이디에 등록된 이메일과 휴대폰으로 코드를 받아 둘 다 적으면 새 비밀번호를 정할 수 있습니다
        </p>

        <QueryState query={info}>
          {(data) => (
            <>
              <div className="mt-5">
                <Label htmlFor="pr-login">아이디</Label>
                <Input
                  id="pr-login" value={loginId} autoComplete="username" autoCapitalize="none" spellCheck={false}
                  onChange={(e) => setLoginId(e.currentTarget.value)}
                />
              </div>

              {/* 받는 곳은 묻지 않는다 — 코드는 그 아이디에 등록 · 확인된 곳으로만 간다(서버) */}
              <div className="mt-4">
                {codeRow(data, 'email')}
                <div className="mt-2">
                  <Label htmlFor="pr-email-code" hint="등록된 이메일로 옵니다">이메일 인증 코드</Label>
                  <Input
                    id="pr-email-code" value={emailCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    onChange={(e) => setEmailCode(e.currentTarget.value)}
                  />
                </div>
              </div>

              <div className="mt-4">
                {codeRow(data, 'sms')}
                <div className="mt-2">
                  <Label htmlFor="pr-phone-code" hint="등록된 휴대폰으로 옵니다">휴대폰 인증 코드</Label>
                  <Input
                    id="pr-phone-code" value={phoneCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    onChange={(e) => setPhoneCode(e.currentTarget.value)}
                  />
                </div>
              </div>

              <div className="mt-5">
                <Label htmlFor="pr-pw">새 비밀번호</Label>
                <Input
                  id="pr-pw" type="password" value={password} autoComplete="new-password"
                  onChange={(e) => setPassword(e.currentTarget.value)}
                />
                <p className="mt-1 text-[11px] text-fg-subtle">{data.passwordRule}</p>
              </div>
              <div className="mt-3">
                <Label htmlFor="pr-pw2">새 비밀번호 확인</Label>
                <Input
                  id="pr-pw2" type="password" value={confirm} autoComplete="new-password"
                  onChange={(e) => setConfirm(e.currentTarget.value)}
                />
              </div>
            </>
          )}
        </QueryState>

        {err?.at === 'complete' ? <Banner tone="danger" className="mt-4">{err.text}</Banner> : null}

        <Button type="submit" variant="primary" disabled={busy !== null || !info.data} className="mt-5 w-full">
          {busy === 'complete' ? '바꾸는 중…' : '새 비밀번호로 바꾸기'}
        </Button>
        <LinkButton href="/login" variant="ghost" className="mt-2 w-full">로그인으로 돌아가기</LinkButton>
      </form>
    </div>
  );
}
