'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/api/client';
import { useSession } from '@/store/useSession';
import { Banner, Button, Input, Label } from '@/components/ui';
import type { Me } from '@/api/types';

/** 개발 시드 계정 — 역할별로 화면이 어떻게 갈리는지 바로 볼 수 있게 */
const DEMO = [
  { email: 'ceo@tnacademy.kr', label: '대표 · 김민선' },
  { email: 'admin@tnacademy.kr', label: '관리자 · 박관리' },
  { email: 'head@tnacademy.kr', label: '교수실장 · 이수현' },
  { email: 't01@tnacademy.kr', label: '강사 · 김서영' },
];

export default function LoginPage() {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState(DEMO[0].email);
  const [password, setPassword] = useState('taco1234!');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ accessToken: string }>('/auth/login', { email, password });
      // 토큰을 세션에 넣기 **전에** /auth/me 로 권한 플래그를 받는다.
      // 화면은 role 을 비교하지 않고 이 플래그만 읽는다 (D-R39).
      const me = await api.get<Me>('/auth/me', {
        headers: { Authorization: `Bearer ${r.data.accessToken}` },
      });
      signIn(r.data.accessToken, me.data);
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
        <h1 className="text-[20px] font-bold text-fg">TACO ERP</h1>
        <p className="mt-1 text-[12px] text-fg-subtle">티엔아카데미 학원 운영 백오피스</p>

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
          <p className="text-[11px] font-bold text-fg-subtle">개발 시드 계정 — 눌러서 채웁니다</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEMO.map((d) => (
              <Button
                key={d.email} size="sm" variant="ghost"
                onClick={() => { setEmail(d.email); setPassword('taco1234!'); }}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
