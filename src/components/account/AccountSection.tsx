/** @file-guide
 * 목적: AccountSection.tsx — MyPageEdit, AccountSection (component)
 * 책임/재사용: 마이 페이지 「계정」 절(AUTH-SELF-01) — 이름·영어 이름 / 아이디 / 휴대폰 / 이메일 행과 한 번에 하나만 여는 편집 패널. 코드 받기 줄 · 국가번호 칸은 첫 설정과 같은 부품(CodeRequest · PhoneInput)을 쓰고, 규칙 · 거절 문장은 서버 것을 그대로 쓴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Figma 색인 D4~D6(9555:134122) · Auth/MyPage Account(9541:128317).
 * - 이름 · 영어 이름: PATCH /auth/profile(바뀐 칸만 · 영어 이름 빈 칸 = 비움). 셸 이름은 서버 Me 를 다시 읽어 바꾼다.
 * - 휴대폰 · 이메일: 새 수신처 → 코드 받기(POST /auth/profile/contact-codes) → 코드 · 지금 비밀번호 →
 *   인증하고 저장(POST /auth/profile/contact-change). 응답은 **새 세션**이다 — 옛 토큰은 서버가 끊었으므로 첫 설정 · 로그인과 같은
 *   순서(캐시 비우기 → 새 토큰 · 새 Me)로 이어 간다. 성공 전에는 지금 값이 그대로다(서버가 한 transaction 으로 저장한다).
 * - 거절 문장은 **누른 자리 옆**: 코드 받기 거절은 그 단추 아래, 코드 거절은 코드 칸 아래, 비밀번호 거절은 비밀번호 칸 아래,
 *   나머지는 [인증하고 저장] 아래 (QA 0926 UX-1 · D6). 어느 칸인지는 서버 오류 코드로만 고른다(문장을 읽어 판정하지 않는다).
 */
'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiMessage, ApiError } from '@/api/client';
import { useUpdateProfile } from '@/api/queries';
import { clearSessionQueries, revalidateSession } from '@/api/session-cache';
import type {
  LoginResult, OnboardingCodeResult, Profile, ProfileContactChange, ProfileContactCodeRequest, ProfileUpdate,
} from '@/api/types';
import { useSession } from '@/store/useSession';
import { Button, Chip, Input, Label } from '@/components/ui';
import { CodeRequestButton, useResendCountdown, type CodeChannel } from './CodeRequest';
import { PhoneInput, composePhone, type PhoneValue } from './PhoneInput';

/** 대화상자 안에서 한 번에 하나만 여는 편집 — 시간대 · 시급 요청 칸도 같은 자리를 나눠 쓴다 */
export type MyPageEdit = 'tz' | 'wage' | 'name' | CodeChannel;

type Resend = ReturnType<typeof useResendCountdown>;

/** 코드 자체가 틀렸거나 쓸 수 없는 거절 — 코드 칸 아래에 선다 (서버 auth-code.verifyCode 의 코드들) */
const CODE_REJECTS: ReadonlySet<string> = new Set(['CODE_NOT_REQUESTED', 'CODE_EXPIRED', 'CODE_LOCKED', 'CODE_MISMATCH']);

function Row({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-3 last:border-b-0">
      <span className="w-14 shrink-0 text-[12px] text-fg-subtle">{label}</span>
      <div className="min-w-0 flex-1 text-[13px]">{children}</div>
      {action}
    </div>
  );
}

function Verified({ ok }: { ok: boolean }) {
  return <Chip size="compact" tone={ok ? 'success' : 'warning'} styleKind="outline" className="mt-1">{ok ? '인증됨' : '인증 전'}</Chip>;
}

function PanelFrame({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // 패널을 연 단추는 패널로 바뀌어 사라진다 — 초점을 첫 입력 칸으로 옮겨 키보드 · 화면 낭독기 위치가 body 로 빠지지 않게 한다(S4)
  useEffect(() => { ref.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus(); }, []);
  return (
    <div ref={ref} role="group" aria-labelledby={titleId} className="flex flex-col gap-3 border-b border-line bg-inset px-3 py-3 last:border-b-0">
      <h4 id={titleId} className="text-[13px] font-bold text-fg">{title}</h4>
      {children}
    </div>
  );
}

/** 이름 · 영어 이름 — 바뀐 칸만 보낸다. 빈 이름은 보내기 전에 칸 아래에서 알린다(서버도 같은 문장으로 거절한다) */
function NamePanel({ profile, onCancel, onSaved }: { profile: Profile; onCancel: () => void; onSaved: () => void }) {
  const id = useId();
  const save = useUpdateProfile();
  const [name, setName] = useState(profile.name);
  const [english, setEnglish] = useState(profile.englishName ?? '');
  const [blank, setBlank] = useState(false);

  const submit = () => {
    const nextName = name.trim();
    if (!nextName) {
      setBlank(true);
      return;
    }
    setBlank(false);
    const nextEnglish = english.trim() || null;
    const body: ProfileUpdate = {
      ...(nextName !== profile.name ? { name: nextName } : {}),
      ...(nextEnglish !== (profile.englishName ?? null) ? { englishName: nextEnglish } : {}),
    };
    if (Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    save.mutate(body, { onSuccess: onSaved });
  };

  return (
    <PanelFrame title="이름 · 영어 이름 바꾸기">
      <div>
        <Label htmlFor={`${id}-name`}>이름</Label>
        <Input
          id={`${id}-name`} value={name} autoComplete="name" error={blank} aria-invalid={blank || undefined}
          aria-describedby={blank ? `${id}-name-error` : `${id}-name-hint`}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        {blank
          ? <p id={`${id}-name-error`} className="mt-1 text-[12px] font-bold text-red">이름을 적어 주세요</p>
          : <p id={`${id}-name-hint`} className="mt-1 text-[12px] text-fg-subtle">1~40자 · 앞뒤 공백은 지우고 저장합니다</p>}
      </div>
      <div>
        <Label htmlFor={`${id}-english`} hint="선택">영어 이름</Label>
        <Input
          id={`${id}-english`} value={english} autoComplete="off" aria-describedby={`${id}-english-hint`}
          onChange={(e) => setEnglish(e.currentTarget.value)}
        />
        <p id={`${id}-english-hint`} className="mt-1 text-[12px] text-fg-subtle">비워 두고 저장하면 지웁니다</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="flex gap-2">
          <Button size="sm" disabled={save.isPending} onClick={onCancel}>취소</Button>
          <Button size="sm" variant="primary" disabled={save.isPending} onClick={submit}>{save.isPending ? '저장하는 중…' : '저장'}</Button>
        </span>
        {save.isError ? <p role="alert" className="text-[12px] font-bold text-red">{apiMessage(save.error)}</p> : null}
      </div>
    </PanelFrame>
  );
}

type ContactError = { at: 'send' | 'code' | 'password' | 'save'; text: string };

/** 휴대폰 · 이메일 — 새 수신처 인증 뒤에만 바뀐다. 받는 곳을 바꾸면 보낸 코드는 쓸 수 없다(서버도 받는 곳에 묶어 확인한다) */
function ContactPanel({ channel, profile, resend, onCancel, onSaved }: {
  channel: CodeChannel;
  profile: Profile;
  resend: Resend;
  onCancel: () => void;
  onSaved: (notice: string) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const signIn = useSession((s) => s.signIn);
  const codes = profile.contactCodes;
  const sms = channel === 'sms';
  const [phone, setPhone] = useState<PhoneValue>({ country: '', local: '' });
  const [email, setEmail] = useState('');
  const target = sms ? composePhone(phone, codes.phoneCountries) : email;
  const [sent, setSent] = useState<{ target: string; result: OnboardingCodeResult } | null>(null);
  const active = sent && sent.target === target ? sent.result : null;
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'send' | 'save' | null>(null);
  const [err, setErr] = useState<ContactError | null>(null);
  const current = sms ? profile.phone : profile.email;
  const verified = sms ? profile.phoneVerified : profile.emailVerified;
  const noun = sms ? '번호' : '주소';

  async function sendCode() {
    setBusy('send');
    setErr(null);
    try {
      const body: ProfileContactCodeRequest = { channel, target };
      const { data } = await api.post<OnboardingCodeResult>('/auth/profile/contact-codes', body);
      setSent({ target, result: data });
      resend.start(channel, data.resendAfterSeconds);
    } catch (e) {
      setErr({ at: 'send', text: apiMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setErr(null);
    try {
      const body: ProfileContactChange = { channel, target, code, currentPassword: password };
      const { data } = await api.post<LoginResult>('/auth/profile/contact-change', body);
      // 첫 설정 · 로그인과 같은 순서 — 옛 세션의 캐시를 버리고 새 토큰 · 새 Me 로 연다(옛 토큰은 서버가 이미 끊었다)
      clearSessionQueries(queryClient);
      signIn(data.accessToken, data.user);
      onSaved(sms ? '휴대폰 번호를 바꿨습니다 — 다른 기기의 로그인은 끊겼습니다' : '이메일을 바꿨습니다 — 다른 기기의 로그인은 끊겼습니다');
    } catch (e) {
      const at = e instanceof ApiError && CODE_REJECTS.has(e.code) ? 'code'
        : e instanceof ApiError && e.code === 'CURRENT_PASSWORD_MISMATCH' ? 'password' : 'save';
      setErr({ at, text: apiMessage(e) });
      setBusy(null);
    }
  }

  const codeError = err?.at === 'code' ? err.text : null;
  const passwordError = err?.at === 'password' ? err.text : null;
  // 저장 거절 뒤 초점은 거절된 칸으로 — 보내는 동안 잠긴 단추에서 브라우저가 초점을 body 로 버린다(S4). 코드 받기 거절은 그 단추가 초점을 지킨다
  useEffect(() => {
    if (busy !== null || !err || err.at === 'send') return;
    document.getElementById(err.at === 'save' ? `${id}-save` : `${id}-${err.at}`)?.focus();
  }, [busy, err, id]);
  return (
    <PanelFrame title={sms ? '휴대폰 번호 바꾸기' : '이메일 바꾸기'}>
      <p className="break-all text-[12px] text-fg-2">
        {current
          ? `지금 ${noun} ${current} · ${verified ? '인증됨' : '인증 전'} — 새 ${noun} 인증을 마치기 전까지 그대로입니다`
          : `지금 등록된 ${noun}가 없습니다 — 새 ${noun} 인증을 마치면 저장됩니다`}
      </p>
      <div>
        <Label htmlFor={`${id}-target`}>{sms ? '새 번호' : '새 이메일'}</Label>
        {sms
          ? <PhoneInput id={`${id}-target`} countries={codes.phoneCountries} value={phone} onChange={setPhone} disabled={busy !== null} />
          : (
            <Input
              id={`${id}-target`} type="email" inputMode="email" autoComplete="email" value={email} disabled={busy !== null}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          )}
        <CodeRequestButton
          spec={codes.channels.find((c) => c.channel === channel)} left={resend.left(channel)} busy={busy === 'send'}
          disabled={busy !== null || !target.trim()} onSend={() => void sendCode()}
          error={err?.at === 'send' ? err.text : null}
          note={active ? `보낸 곳 ${active.targetMasked} · ${codes.codeTtlMinutes}분 안에 적어 주세요` : null}
          devCode={active?.devCode}
        />
      </div>
      <div>
        <Label htmlFor={`${id}-code`}>인증 코드</Label>
        <Input
          id={`${id}-code`} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          placeholder={active ? '6자리 숫자' : '코드를 받은 뒤 적습니다'} disabled={!active || busy !== null}
          error={Boolean(codeError)} aria-invalid={codeError ? true : undefined} aria-describedby={codeError ? `${id}-code-error` : undefined}
          onChange={(e) => setCode(e.currentTarget.value)}
        />
        {codeError ? <p id={`${id}-code-error`} className="mt-1 text-[12px] font-bold text-red">{codeError}</p> : null}
      </div>
      <div>
        <Label htmlFor={`${id}-password`}>지금 비밀번호</Label>
        <Input
          id={`${id}-password`} type="password" value={password} autoComplete="current-password"
          placeholder="본인 확인용" disabled={!active || busy !== null}
          error={Boolean(passwordError)} aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? `${id}-password-error` : `${id}-password-hint`}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        {passwordError
          ? <p id={`${id}-password-error`} className="mt-1 text-[12px] font-bold text-red">{passwordError}</p>
          : <p id={`${id}-password-hint`} className="mt-1 text-[12px] text-fg-subtle">본인 확인용 · 저장하면 다른 기기의 로그인은 끊깁니다</p>}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="flex gap-2">
          <Button size="sm" disabled={busy === 'save'} onClick={onCancel}>취소</Button>
          <Button
            id={`${id}-save`} size="sm" variant="primary" disabled={!active || !code.trim() || !password || busy !== null}
            onClick={() => void save()}
          >
            {busy === 'save' ? '저장하는 중…' : '인증하고 저장'}
          </Button>
        </span>
        {err?.at === 'save' ? <p role="alert" className="text-[12px] font-bold text-red">{err.text}</p> : null}
      </div>
    </PanelFrame>
  );
}

export function AccountSection({ profile, scope, editing, onEdit, notice, onNotice }: {
  profile: Profile;
  /** 조회 범위 한 줄 — 강사 표면 / 관리 화면에 따라 부르는 쪽이 고른다(서버 플래그 canAdminPage) */
  scope: string;
  editing: MyPageEdit | null;
  onEdit: (edit: MyPageEdit | null) => void;
  /** 방금 저장한 결과 문장 — 세션이 바뀌어 이 절이 다시 서도 남도록 부르는 쪽이 들고 있다 */
  notice: string | null;
  onNotice: (notice: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const headingId = useId();
  // 채널별 다시 받기 초읽기 — 패널을 닫았다 열어도 이어진다(서버도 채널마다 60초를 센다)
  const resend = useResendCountdown();
  const role = profile.title || profile.roleLabel;
  const locked = editing !== null;
  const open = (edit: MyPageEdit) => { onNotice(null); onEdit(edit); };
  const done = (text: string | null) => { onEdit(null); onNotice(text); };

  return (
    <section aria-labelledby={headingId} className="pt-4">
      <p id={headingId} className="text-[12px] text-fg-subtle">계정</p>
      <p className="mt-1 text-[16px] font-bold text-fg">{profile.name} · {role}</p>
      <p className="mt-0.5 text-[12px] font-medium text-fg-2">{scope}</p>
      {notice ? <p role="status" className="mt-2 rounded-md bg-green/10 px-3 py-2 text-[12px] font-bold text-green">{notice}</p> : null}
      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        {editing === 'name'
          ? <NamePanel profile={profile} onCancel={() => done(null)} onSaved={() => {
            done('이름을 저장했습니다');
            void revalidateSession(queryClient).catch(() => undefined);
          }} />
          : (
            <Row label="이름" action={<Button size="sm" aria-label="이름 수정" data-mypage-edit="name" disabled={locked} onClick={() => open('name')}>수정</Button>}>
              <p className="truncate font-bold text-fg">{profile.name}</p>
              <p className="mt-0.5 truncate text-[12px] text-fg-subtle">{profile.englishName ? `영어 이름 · ${profile.englishName}` : '영어 이름 없음'}</p>
            </Row>
          )}
        <Row label="아이디">
          <p className="break-all font-bold text-fg">{profile.loginId}</p>
          <p className="mt-0.5 text-[12px] text-fg-subtle">아이디는 바뀌지 않습니다</p>
        </Row>
        {editing === 'sms'
          ? <ContactPanel channel="sms" profile={profile} resend={resend} onCancel={() => done(null)} onSaved={done} />
          : (
            <Row label="휴대폰" action={<Button size="sm" aria-label="휴대폰 변경" data-mypage-edit="sms" disabled={locked} onClick={() => open('sms')}>변경</Button>}>
              <p className="break-all font-bold text-fg">{profile.phone ?? '등록된 번호 없음'}</p>
              {profile.phone ? <Verified ok={profile.phoneVerified} /> : null}
            </Row>
          )}
        {editing === 'email'
          ? <ContactPanel channel="email" profile={profile} resend={resend} onCancel={() => done(null)} onSaved={done} />
          : (
            <Row label="이메일" action={<Button size="sm" aria-label="이메일 변경" data-mypage-edit="email" disabled={locked} onClick={() => open('email')}>변경</Button>}>
              <p className="break-all font-bold text-fg">{profile.email ?? '등록된 주소 없음'}</p>
              {profile.email ? <Verified ok={profile.emailVerified} /> : null}
            </Row>
          )}
      </div>
    </section>
  );
}
