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
import { Banner, Button, Input, Label, Logo } from '@/components/ui';
import type { LoginBody, LoginResult } from '@/api/types';
import { ROLES, type RoleKey } from '@/lib/roles';

/**
 * 2026-09-23 사용자 지시: 확인한 다섯 로그인 아이디를 운영·개발 모두 표시한다.
 * 표시는 공용 역할 어휘를 재사용하고, 실제 권한은 서버의 LoginResult만 믿는다.
 * 직원 전체 목록을 요청하거나 추가 공개하지 않는다.
 */
const LOGIN_ACCOUNTS: ReadonlyArray<{ email: string; role: RoleKey }> = [
  { email: 'ceo@tnacademy.kr', role: 'ceo' },
  { email: 'admin@tnacademy.kr', role: 'admin' },
  { email: 'head@tnacademy.kr', role: 'manager' },
  { email: 'coord@tnacademy.kr', role: 'manager' },
  { email: 't02@tnacademy.kr', role: 'teacher' },
];

// S8의 비밀번호 제외는 유지한다. Next가 빌드 때 접는 조건이며 실제 번들 검사도 유지한다.
const DEV_PASSWORD = process.env.NODE_ENV === 'production' ? '' : 'taco1234!';

const ROLE_BY_KEY = new Map(ROLES.map((role) => [role.key, role]));

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signIn = useSession((s) => s.signIn);
  // 운영은 직접 선택/입력하도록 두 칸 모두 비워 둔다. 개발 자동 채움은 유지한다.
  const [email, setEmail] = useState(process.env.NODE_ENV === 'production' ? '' : LOGIN_ACCOUNTS[0].email);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body: LoginBody = { email, password };
      // LoginResultDto가 토큰과 권한 플래그를 원자적으로 돌려준다. 성공 직후 /auth/me를
      // 다시 부르면 같은 계약을 두 응답에서 조합하게 되고 로그인 왕복도 하나 늘어난다.
      const { data } = await api.post<LoginResult>('/auth/login', body);
      clearSessionQueries(queryClient);
      signIn(data.accessToken, data.user);
      router.replace('/schedule');
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
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email" type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.currentTarget.value)}
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

        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[11px] font-bold text-fg-subtle">로그인 아이디 — 눌러서 이메일을 채웁니다</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LOGIN_ACCOUNTS.map((d) => (
              <Button
                key={d.email} size="sm" variant="ghost"
                onClick={() => {
                  setEmail(d.email);
                  if (process.env.NODE_ENV !== 'production') setPassword(DEV_PASSWORD);
                }}
              >
                <span>{d.email}</span>
                <span className="ml-1 text-[10px] font-bold text-blue">
                  · {ROLE_BY_KEY.get(d.role)?.label}
                </span>
              </Button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
