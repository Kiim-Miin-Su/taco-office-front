/** @file-guide
 * 목적: page.tsx — LoginPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/api/client';
import { clearSessionQueries } from '@/api/session-cache';
import { useSession } from '@/store/useSession';
import { Banner, Button, Input, Label, LinkButton, Logo } from '@/components/ui';
import type { LoginBody, LoginResult } from '@/api/types';
import { PASSWORD_RESET_PATH, fallbackRouteFor } from '@/components/shell/navigation';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signIn = useSession((s) => s.signIn);
  // 2026-10-09 운영 전환: 시험 계정과 시드 비밀번호를 공개 번들에서 제거했다.
  // 다시 시험 로그인이 필요하면 client 상수로 복원하지 말고 만료되는 서버 발급 자격증명을 사용한다.
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      // 아이디는 형식이 자유이고 대소문자를 가리지 않는다 — 판정은 서버 한 곳이다 (W10)
      const body: LoginBody = { loginId, password };
      // LoginResultDto가 토큰과 권한 플래그를 원자적으로 돌려준다. 성공 직후 /auth/me를
      // 다시 부르면 같은 계약을 두 응답에서 조합하게 되고 로그인 왕복도 하나 늘어난다.
      const { data } = await api.post<LoginResult>('/auth/login', body);
      clearSessionQueries(queryClient);
      signIn(data.accessToken, data.user);
      // 첫 설정 전 계정은 첫 설정으로 — 보낼 곳은 경로 규칙 한 곳이 정한다 (W8)
      router.replace(fallbackRouteFor(data.user));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '로그인하지 못했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <form onSubmit={submit} className="w-full max-w-[380px] rounded-2xl border border-line bg-card p-6">
        <Logo size={34} />
        <p className="mt-2 text-[12px] text-fg-subtle">티엔아카데미 학원 운영 백오피스</p>

        {/* 폼 요소는 ui/Field 를 쓴다 — 손으로 그리면 포커스 링과 잠김 표시가 여기만 따로 논다 */}
        <div className="mt-5">
          <Label htmlFor="login-id">아이디</Label>
          <Input
            id="login-id" value={loginId} autoComplete="username" autoCapitalize="none" spellCheck={false}
            onChange={(e) => setLoginId(e.currentTarget.value)}
          />
        </div>

        <div className="mt-3">
          <Label htmlFor="pw">비밀번호</Label>
          <Input
            id="pw" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
        </div>

        {err ? <Banner tone="danger" className="mt-3">{err}</Banner> : null}

        <Button type="submit" variant="primary" disabled={busy} className="mt-4 w-full">
          {busy ? '들어가는 중…' : '들어가기'}
        </Button>
        {/* 비밀번호 찾기 (N-101 · 대표 결정 2026-09-26) — 등록된 이메일 · 휴대폰 코드를 둘 다 확인한다 */}
        <LinkButton href={PASSWORD_RESET_PATH} variant="ghost" size="sm" className="mt-2 w-full">비밀번호를 잊으셨나요?</LinkButton>

      </form>
    </div>
  );
}
