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
import { ROLES, type RoleKey } from '@/lib/roles';
import { PASSWORD_RESET_PATH, fallbackRouteFor } from '@/components/shell/navigation';

/**
 * 시험용 계정 칩 — 2026-09-26 대표 결정이 2026-09-23 「운영·개발 모두 표시」를 대신한다(W8).
 *   ① 시험할 때는 칩을 누르면 아이디와 비밀번호가 **둘 다** 채워진다(시험 계정의 아이디는 옛 계정처럼 이메일 모양이다).
 *   ② 운영에서는 칩을 **그리지 않는다** — 두 칸만 남는다.
 *   ③ 시험 기간에는 운영 사이트도 빌드 환경 값(Vercel `NEXT_PUBLIC_TEST_LOGIN=on`)으로 시험 모드를 켠다.
 *      켜 둔 동안 시험 비밀번호가 그 번들에 실린다 — **운영 전환 전에 반드시 끈다**(번들 검사가 끈 빌드에서 막는다).
 * 표시는 공용 역할 어휘를 재사용하고, 실제 권한은 서버의 LoginResult만 믿는다.
 * 직원 전체 목록을 요청하거나 추가 공개하지 않는다.
 */
const LOGIN_ACCOUNTS: ReadonlyArray<{ loginId: string; role: RoleKey }> = [
  { loginId: 'ceo@tnacademy.kr', role: 'ceo' },
  { loginId: 'admin@tnacademy.kr', role: 'admin' },
  { loginId: 'head@tnacademy.kr', role: 'manager' },
  { loginId: 'coord@tnacademy.kr', role: 'manager' },
  { loginId: 't02@tnacademy.kr', role: 'teacher' },
];

/** 시험 모드 — 개발 빌드는 늘, 운영 빌드는 빌드 환경 값으로만 켠다. Next 가 빌드 때 두 값을 접는다 */
const TEST_LOGIN = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_TEST_LOGIN === 'on';

/*
 * S8의 비밀번호 제외는 유지한다 — 시드 비밀번호 글자는 **개발 분기 안에만** 둔다(운영 빌드가 이 분기를 접어 버린다).
 * 운영 빌드의 시험 모드는 빌드 환경 값만 읽는다(코드에 기본값 없음). 시험 모드를 끈 운영 빌드는 그 값도 읽지 않는다.
 */
const TEST_PASSWORD = process.env.NODE_ENV !== 'production'
  ? 'taco1234!'
  : process.env.NEXT_PUBLIC_TEST_LOGIN === 'on' ? (process.env.NEXT_PUBLIC_TEST_LOGIN_PASSWORD ?? '') : '';

const ROLE_BY_KEY = new Map(ROLES.map((role) => [role.key, role]));

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signIn = useSession((s) => s.signIn);
  // 운영 빌드는 시험 모드여도 두 칸을 비워 두고 칩으로만 채운다. 개발 자동 채움은 유지한다.
  const [loginId, setLoginId] = useState(process.env.NODE_ENV === 'production' ? '' : LOGIN_ACCOUNTS[0].loginId);
  const [password, setPassword] = useState(process.env.NODE_ENV === 'production' ? '' : TEST_PASSWORD);
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

        {TEST_LOGIN ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[11px] font-bold text-fg-subtle">시험용 계정 — 누르면 아이디와 비밀번호를 채웁니다</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LOGIN_ACCOUNTS.map((d) => (
                <Button
                  key={d.loginId} size="sm" variant="ghost"
                  onClick={() => {
                    setLoginId(d.loginId);
                    // 빌드에 시험 비밀번호가 없으면 사람이 적어 둔 비밀번호를 지우지 않는다
                    if (TEST_PASSWORD) setPassword(TEST_PASSWORD);
                  }}
                >
                  <span>{d.loginId}</span>
                  <span className="ml-1 text-[10px] font-bold text-blue">
                    · {ROLE_BY_KEY.get(d.role)?.label}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
