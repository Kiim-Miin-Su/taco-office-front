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
 * 개발 시드 이메일 바로 채우기 — 표시는 공용 역할 어휘, 실제 권한은 DB 의 `LoginResult` 만 믿는다.
 *
 * **운영 빌드에는 남지 않는다** (S8 · 전수 검수 §8). 이 화면은 로그인하기 **전**에 보이는
 * 유일한 화면이라 **누구나 열 수 있고**, 여기 적힌 것은 관리자 계정 다섯의 **이메일과
 * 비밀번호 한 줄**이다. 시드 비밀번호가 운영 DB 에서 통하지 않는다는 것과, 그것이 공개
 * 번들에 실려 있다는 것은 **다른 이야기다** — 이메일 다섯은 그대로 참이고 역할까지 적혀 있다.
 *
 * **조건을 여기 직접 적는 것이 이 수정의 전부다.** 화면에서 숨기기만 하면(`isDev &&` 같은
 * 런타임 조건) 그림은 사라져도 **문자열은 번들에 그대로 실려 나간다** — 실제로 그랬다
 * (`.next/static/.../login/page-*.js` 에 `taco1234!` 두 번 · 시드 이메일 다섯).
 * `process.env.NODE_ENV` 는 Next 가 **빌드할 때 상수로 바꾸므로** 삼항의 죽은 가지가
 * 통째로 사라진다. 그래서 조건을 변수로 빼지 않는다 — 변수로 빼면 접는 일이 압축기의
 * 재량이 되고, 설정이 바뀌면 **조용히 다시 실린다.**
 *
 * 개발·시험 빌드에서는 그대로다(회귀가 그 쪽을 본다). 운영에서는 두 칸이 **빈 채로** 열린다.
 */
const DEV_SEED: { accounts: ReadonlyArray<{ email: string; role: RoleKey }>; password: string } =
  process.env.NODE_ENV === 'production'
    ? { accounts: [], password: '' }
    : {
      accounts: [
        { email: 'ceo@tnacademy.kr', role: 'ceo' },
        { email: 'admin@tnacademy.kr', role: 'admin' },
        { email: 'head@tnacademy.kr', role: 'manager' },
        { email: 'coord@tnacademy.kr', role: 'manager' },
        { email: 't02@tnacademy.kr', role: 'teacher' },
      ],
      password: 'taco1234!',
    };

const ROLE_BY_KEY = new Map(ROLES.map((role) => [role.key, role]));

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signIn = useSession((s) => s.signIn);
  // 운영 빌드에서는 시드가 비어 있어 두 칸 모두 빈 채로 열린다
  const [email, setEmail] = useState(DEV_SEED.accounts[0]?.email ?? '');
  const [password, setPassword] = useState(DEV_SEED.password);
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

        {DEV_SEED.accounts.length > 0 ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[11px] font-bold text-fg-subtle">개발 시드 계정 — 눌러서 채웁니다</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEV_SEED.accounts.map((d) => (
                <Button
                  key={d.email} size="sm" variant="ghost"
                  onClick={() => { setEmail(d.email); setPassword(DEV_SEED.password); }}
                  title={ROLE_BY_KEY.get(d.role)?.desc}
                >
                  <span>{d.email}</span>
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
