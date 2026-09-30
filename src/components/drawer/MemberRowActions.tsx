/** @file-guide
 * 목적: MemberRowActions.tsx — MemberHandoverBox, MemberEditButton, MemberRowActions (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §17 사용자 표 CRUD — 줄마다의 「수정」·「비밀번호 초기화」·「사용 중지」/「다시 사용」·「삭제」 (W8 · 대표 지시 2026-09-26
 * 「강사는 대표·매니저·관리자가 아이디 및 비밀번호 생성하여 넘겨줄 수 있게 · 매니저 이상급부터 user table CRUD」).
 *
 * **어느 단추가 서는지는 서버 플래그만 본다**(member.canEdit · canChangeRole · canResetPassword · canToggleActive · canDelete) —
 * 이 파일은 role 을 보지 않는다 (D-R39). 대표·관리자 줄과 자기 줄의 막힘도 서버가 가르고, 서버가 다시 막는다.
 *
 * W10 — 아이디 · 임시 비밀번호는 **매니저가 적는다**(초기화도 같다 · 답변 2026-09-26). 넘겨줄 정보의 아이디는 서버 응답(그 줄)에서,
 * 비밀번호는 매니저가 적은 값을 **그 창이 열려 있는 동안만** 들고 있다 — 어느 응답에도 비밀번호가 없다. 규칙 문장은 서버가 준다.
 */
'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Segmented, Select } from '../ui';
import { PhoneInput, composePhone, samePhone, splitPhone, type PhoneValue } from '../account/PhoneInput';
import { apiMessage } from '@/api/client';
import { useDeleteMember, useResetMemberPassword, useSetMemberActive, useUpdateMember } from '@/api/queries';
import type { Member, PhoneCountry, StaffPatch, StaffPermsPatch, TzGroup } from '@/api/types';
import { ROLES } from '@/lib/roles';
import { STAFF_PICKABLE_ROLES } from './MemberCreateDialog';

/** 넘겨줄 정보 — 아이디는 서버 응답(그 줄), 비밀번호는 매니저가 적은 값(W10) */
export interface MemberHandover { loginId: string; password: string }

/**
 * 「넘겨줄 정보」 — 만들기와 비밀번호 초기화가 같은 상자를 쓴다.
 * 복사는 `navigator.clipboard` 가 없거나 막힌 브라우저(비보안 주소 · 권한 거절)에서도 창이 깨지지 않게 막아 둔다.
 */
export function MemberHandoverBox({ loginId, password }: MemberHandover) {
  const [note, setNote] = useState<string | null>(null);
  const copy = async () => {
    const clip = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clip || typeof clip.writeText !== 'function') {
      setNote('이 브라우저에서는 복사할 수 없습니다 — 위 값을 직접 옮겨 적어 주세요');
      return;
    }
    try {
      await clip.writeText(`아이디 ${loginId}\n임시 비밀번호 ${password}`);
      setNote('복사했습니다');
    } catch {
      setNote('복사하지 못했습니다 — 위 값을 직접 옮겨 적어 주세요');
    }
  };
  return (
    <section aria-label="넘겨줄 정보" className="rounded-xl border border-line bg-inset p-3">
      <p className="text-[12.5px] font-bold text-fg">넘겨줄 정보</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-fg-subtle">아이디</dt>
        <dd className="break-all font-mono text-fg">{loginId}</dd>
        <dt className="text-fg-subtle">임시 비밀번호</dt>
        <dd className="break-all font-mono text-fg">{password}</dd>
      </dl>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-2">
        첫 로그인 때 휴대폰·이메일을 확인하고 새 비밀번호로 바꿔야 합니다. 이 창을 닫으면 비밀번호는 다시 볼 수 없습니다.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => { void copy(); }}>복사</Button>
        {note ? <span role="status" className="text-[11.5px] text-fg-2">{note}</span> : null}
      </div>
    </section>
  );
}

type Draft = { name: string; loginId: string; email: string; phone: PhoneValue; title: string; tz: string; role: string; hiredOn: string };
/** 보낼 모양 — 휴대폰은 글 하나(국내는 적은 그대로 · 해외는 「+국가번호 번호」 · N-103) */
type Flat = Omit<Draft, 'phone'> & { phone: string };

/** 비교용 모양 — 앞뒤 공백 없이. 아이디는 적은 모양 그대로(대소문자만 바꾸는 것도 수정이다) · 이메일은 소문자(서버 저장 규칙과 같다) */
const tidy = (d: Draft, countries: readonly PhoneCountry[]): Flat => ({
  name: d.name.trim(), loginId: d.loginId.trim(), email: d.email.trim().toLowerCase(), phone: composePhone(d.phone, countries),
  title: d.title.trim(), tz: d.tz, role: d.role, hiredOn: d.hiredOn,
});
const sameField = (key: keyof Flat, left: string, right: string) => key === 'phone' ? samePhone(left, right) : left === right;

/**
 * 사람별 권한 예외 한 칸의 세 값 — 원문 PDF 의 자리 차이를 역할을 늘리지 않고 사람에게 적는다(N-68 · 「켬/끔/역할 따름」).
 * 저장값은 서버의 `boolean | null` 이고 여기서는 누르는 낱말로만 바꾼다.
 */
type PermChoice = 'role' | 'on' | 'off';
const permChoice = (v: boolean | null | undefined): PermChoice => (v === true ? 'on' : v === false ? 'off' : 'role');
const permValue = (c: PermChoice): boolean | null => (c === 'on' ? true : c === 'off' ? false : null);
const PERM_CHOICES: Array<{ value: PermChoice; label: string }> = [
  { value: 'role', label: '역할 따름' }, { value: 'on', label: '켬' }, { value: 'off', label: '끔' },
];

/**
 * 「수정」 — 바뀐 칸만 보낸다. 역할 칸은 서버의 `canChangeRole` 이 있을 때만(자기 줄은 없다).
 * 이메일 · 휴대폰을 바꾸거나 비우면 그 사람은 **다음 요청부터 첫 설정을 다시 한다**(N-104 · 대표 결정 2026-09-26) — 저장 전에 창이 먼저 말한다.
 * 아이디는 연락처가 아니라 첫 설정을 걸지 않는다(W10) — 다음 로그인부터 새 아이디로 들어온다는 것만 알린다.
 * 권한 예외 다섯 칸은 서버의 `canEditPerms`(대표 · 자기 줄 아님)가 있을 때만 선다(N-68) — 바뀐 칸만 `perms` 로 보내고,
 * 올릴 수 없는 권한(보는 이에게 없는 것)은 서버가 403 으로 막고 그 말을 그대로 띄운다.
 */
export function MemberEditButton({ member, tzGroups, tz, phoneCountries = NO_COUNTRIES, loginIdRule }: {
  member: Member; tzGroups: TzGroup[]; tz: string; phoneCountries?: readonly PhoneCountry[]; loginIdRule?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const write = useUpdateMember();
  const initial = useMemo<Draft>(() => ({
    name: member.name, loginId: member.loginId, email: member.email ?? '', phone: splitPhone(member.phone, phoneCountries),
    title: member.title ?? '', tz: member.tz ?? tz, role: member.role, hiredOn: member.hiredOn ?? '',
  }), [member, tz, phoneCountries]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [err, setErr] = useState<string | null>(null);
  /** 권한 예외 — 서버가 준 다섯 줄(`member.perms`)의 지금 값에서 연다 */
  const permRows = useMemo(() => (member.canEditPerms ? member.perms ?? [] : []), [member]);
  const initialPerms = useMemo<Record<string, PermChoice>>(
    () => Object.fromEntries(permRows.map((p) => [p.key, permChoice(p.override)])), [permRows],
  );
  const [perms, setPerms] = useState<Record<string, PermChoice>>(initialPerms);
  const [snapshot, setSnapshot] = useState(() => ({ id: member.id, draft: initial, perms: initialPerms }));
  // 재조회 값은 현재 서버 상태다. 열린 폼의 초안/비교 기준은 열기 이벤트에서만 바꾼다.
  const beginEdit = () => {
    setSnapshot({ id: member.id, draft: initial, perms: initialPerms });
    setDraft(initial); setPerms(initialPerms); setErr(null); setOpen(true);
  };

  const set = (key: Exclude<keyof Draft, 'phone'>) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  // 바뀐 칸만 — 같은 값을 다시 보내지 않는다(서버는 빈 수정을 409 로 막는다). 휴대폰은 모양(공백 · 하이픈)만 다른 것을 같게 본다
  const before = tidy(snapshot.draft, phoneCountries);
  const current = tidy(initial, phoneCountries);
  const after = tidy(draft, phoneCountries);
  const body: Record<string, string> = {};
  let conflict = member.id !== snapshot.id;
  const remoteChanged = conflict || (Object.keys(current) as Array<keyof Flat>).some(key => !sameField(key, current[key], before[key]))
    || permRows.some(p => initialPerms[p.key] !== (snapshot.perms[p.key] ?? 'role'));
  for (const key of Object.keys(after) as Array<keyof Flat>) {
    if (key === 'role' && !member.canChangeRole) continue;
    if (key === 'hiredOn' && after.hiredOn === '') continue;
    // 사용자 변경 칸만 보낸다. 원격도 같은 값으로 바뀌었다면 중복 저장하지 않는다.
    if (!sameField(key, after[key], before[key]) && !sameField(key, after[key], current[key])) {
      body[key] = after[key];
      if (!sameField(key, current[key], before[key])) conflict = true;
    }
  }
  // 권한 예외도 바뀐 칸만 — 「역할 따름」은 null 로 보낸다(예외를 지운다)
  const permsBody: StaffPermsPatch = {};
  for (const p of permRows) {
    const next = perms[p.key] ?? 'role';
    const previous = snapshot.perms[p.key] ?? 'role';
    if (next !== previous && next !== initialPerms[p.key]) {
      permsBody[p.key as keyof StaffPermsPatch] = permValue(next);
      if (initialPerms[p.key] !== previous) conflict = true;
    }
  }
  const permsChanged = Object.keys(permsBody).length > 0;
  // N-104 — 연락처(이메일 · 휴대폰)가 바뀌면 서버가 첫 설정을 다시 건다. 아이디는 연락처가 아니다(W10)
  const contactChanged = 'email' in body || 'phone' in body;
  const pending = write.isPending;
  const canSubmit = member.canEdit && !conflict && (Object.keys(body).length > 0 || permsChanged) && after.name.length > 0 && after.loginId.length > 0 && !pending;

  const submit = () => {
    if (!canSubmit) return;
    setErr(null);
    write.mutate({ id: member.id, body: { ...body, ...(permsChanged ? { perms: permsBody } : {}) } as StaffPatch }, {
      onSuccess: () => setOpen(false),
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={beginEdit}>수정</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${member.name} · 수정`}
        width={560}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" onClick={submit} disabled={!canSubmit}
              title={!canSubmit && !pending ? '바뀐 칸이 있어야 하고 이름 · 아이디는 비울 수 없습니다' : undefined}>
              {pending ? '저장 중…' : '저장'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          {remoteChanged ? <Banner tone="warning">
            {conflict
              ? '수정 중인 같은 항목이 다른 곳에서 변경되어 저장할 수 없습니다. 초안을 따로 보관한 뒤 창을 닫았다 다시 열어 최신 값을 확인해 주세요.'
              : '수정 창을 연 뒤 다른 변경 사항이 있습니다. 입력 중인 초안은 유지하며 직접 바꾼 항목만 저장합니다. 최신 값은 창을 닫았다 다시 열어 확인해 주세요.'}
          </Banner> : null}
          {member.canChangeRole ? (
            <div>
              <Label>역할</Label>
              {/* 대표·관리자는 없다 — 이 창은 권한을 올리는 길이 아니다(서버 DTO 도 같은 둘만 받는다) */}
              <Segmented<string> ariaLabel="역할" value={draft.role} disabled={pending} onChange={set('role')}
                options={STAFF_PICKABLE_ROLES.map((key) => ({ value: key, label: ROLES.find((r) => r.key === key)?.label ?? key }))} />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-name`}>이름</Label>
              <Input id={`${id}-name`} value={draft.name} maxLength={40} onChange={(e) => set('name')(e.target.value)} disabled={pending} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor={`${id}-title`} hint="권한과 무관 (D-R39)">직함</Label>
              <Input id={`${id}-title`} value={draft.title} maxLength={20} onChange={(e) => set('title')(e.target.value)} disabled={pending} />
            </div>
          </div>
          <div>
            <Label htmlFor={`${id}-login`}>아이디</Label>
            <Input id={`${id}-login`} value={draft.loginId} maxLength={120} onChange={(e) => set('loginId')(e.target.value)} disabled={pending}
              autoComplete="off" autoCapitalize="none" spellCheck={false} />
            {loginIdRule ? <p className="mt-1 text-[11px] text-fg-subtle">{loginIdRule}</p> : null}
          </div>
          <div>
            <Label htmlFor={`${id}-email`} hint="바꾸거나 비우면 첫 설정을 다시 합니다">이메일 (선택)</Label>
            <Input id={`${id}-email`} type="email" value={draft.email} maxLength={120} onChange={(e) => set('email')(e.target.value)} disabled={pending} autoComplete="off" />
          </div>
          <div>
            <Label htmlFor={`${id}-phone`} hint="바꾸면 첫 설정을 다시 합니다 · 비우면 지웁니다">휴대폰</Label>
            <PhoneInput id={`${id}-phone`} countries={phoneCountries} value={draft.phone}
              onChange={(phone) => setDraft((d) => ({ ...d, phone }))} disabled={pending} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-tz`}>시간대</Label>
              <Select id={`${id}-tz`} value={draft.tz} onChange={(e) => set('tz')(e.target.value)} disabled={pending}>
                {tzGroups.map((g) => <option key={g.id} value={g.tz}>{g.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-hired`}>입사일</Label>
              <Input id={`${id}-hired`} type="date" value={draft.hiredOn} onChange={(e) => set('hiredOn')(e.target.value)} disabled={pending} />
            </div>
          </div>
          {permRows.length > 0 ? (
            <fieldset className="rounded-xl border border-line p-3">
              <legend className="px-1 text-[12px] font-bold text-fg">사람별 권한 예외</legend>
              <p className="mb-2 text-[11.5px] leading-relaxed text-fg-subtle">
                역할이 정한 것과 다르게 할 때만 바꿉니다 — 「역할 따름」이면 역할대로입니다.
              </p>
              <ul className="flex flex-col gap-2">
                {permRows.map((p) => (
                  <li key={p.key} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] text-fg">
                      {p.label}
                      <span className="ml-1.5 text-[11px] text-fg-subtle">역할 기본 {p.roleDefault ? '켬' : '끔'}</span>
                    </span>
                    <Segmented<PermChoice> ariaLabel={p.label} value={perms[p.key] ?? 'role'} disabled={pending}
                      onChange={(next) => setPerms((cur) => ({ ...cur, [p.key]: next }))} options={PERM_CHOICES} />
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}
          {permsChanged ? (
            <Banner tone="info">권한 예외는 저장한 다음 요청부터 {member.name} 님에게 적용됩니다.</Banner>
          ) : null}
          {'loginId' in body ? (
            <Banner tone="info">아이디를 바꾸면 {member.name} 님은 다음 로그인부터 새 아이디로 들어옵니다 — 새 아이디를 알려 주세요.</Banner>
          ) : null}
          {contactChanged ? (
            <Banner tone="warning">
              이메일이나 휴대폰을 바꾸면 {member.name} 님은 저장한 다음 요청부터 첫 설정(휴대폰 · 이메일 확인 · 새 비밀번호)을 다시 해야 합니다.
            </Banner>
          ) : null}
          {err ? <Banner tone="danger">{err}</Banner> : null}
          <p className="text-[11px] text-fg-subtle">시급은 여기서 바꾸지 않습니다 — 「시급 수정」을 쓰세요.</p>
        </div>
      </Dialog>
    </>
  );
}

/**
 * 「비밀번호 초기화」 — 매니저가 임시 비밀번호를 적고(W10 · 답변 2026-09-26 「매니저가 직접 적기」) 창에서 한 번 더 누르면(두 단계)
 * 넘겨줄 정보를 보인다. 적은 비밀번호는 창이 닫히면 버린다.
 */
function MemberResetButton({ member, tempPasswordRule }: { member: Member; tempPasswordRule?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const write = useResetMemberPassword();
  const [password, setPassword] = useState('');
  const [handover, setHandover] = useState<MemberHandover | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setPassword(''); setHandover(null); setErr(null); }, [open]);
  const pending = write.isPending;
  // 규칙(길이 · 영문+숫자)은 서버가 판정한다 — 화면은 빈 칸만 막는다
  const canSubmit = password.length > 0 && !pending;
  const submit = () => {
    if (!canSubmit) return;
    setErr(null);
    write.mutate({ id: member.id, body: { password } }, {
      onSuccess: (row) => setHandover({ loginId: row.loginId, password }),
      onError: (e) => setErr(apiMessage(e)),
    });
  };
  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>비밀번호 초기화</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${member.name} · 비밀번호 초기화`}
        width={480}
        footer={handover ? (
          <Button type="button" onClick={() => setOpen(false)}>닫기</Button>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" variant="danger" onClick={submit} disabled={!canSubmit}
              title={!canSubmit && !pending ? '임시 비밀번호를 적어 주세요' : undefined}>{pending ? '초기화 중…' : '초기화'}</Button>
          </>
        )}
      >
        {handover ? <MemberHandoverBox {...handover} /> : (
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px] leading-relaxed text-fg-2">
              비밀번호를 <b className="text-fg">적은 임시 비밀번호</b>로 바꿉니다. 지금 로그인된 곳은 끊기고,
              다음 로그인 때 휴대폰·이메일을 확인하고 새 비밀번호로 바꿔야 합니다.
            </p>
            <div>
              <Label htmlFor={`${id}-temp`}>임시 비밀번호</Label>
              {/* 넘겨줄 값이라 보이게 적는다 — 저장된 비밀번호 채우기는 끈다 */}
              <Input id={`${id}-temp`} value={password} maxLength={200} onChange={(e) => setPassword(e.target.value)} disabled={pending}
                autoComplete="off" autoCapitalize="none" spellCheck={false} className="font-mono" />
              {tempPasswordRule ? <p className="mt-1 text-[11px] text-fg-subtle">{tempPasswordRule}</p> : null}
            </div>
            {err ? <Banner tone="danger">{err}</Banner> : null}
          </div>
        )}
      </Dialog>
    </>
  );
}

/** 「사용 중지」·「다시 사용」 — 확인 한 번. 사용 중지된 계정은 다음 요청부터 막힌다(기록은 그대로 남는다) */
function MemberActiveButton({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const write = useSetMemberActive();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) setErr(null); }, [open]);
  const next = !member.active;
  const word = next ? '다시 사용' : '사용 중지';
  const pending = write.isPending;
  const submit = () => {
    setErr(null);
    write.mutate({ id: member.id, active: next }, { onSuccess: () => setOpen(false), onError: (e) => setErr(apiMessage(e)) });
  };
  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>{word}</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${member.name} · ${word}`}
        width={440}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" variant={next ? 'primary' : 'danger'} onClick={submit} disabled={pending}>{pending ? '바꾸는 중…' : word}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-fg-2">
            {next
              ? '이 계정으로 다시 로그인할 수 있게 됩니다.'
              : '이 계정은 다음 요청부터 막히고 로그인도 할 수 없습니다. 수업·기록은 그대로 남습니다.'}
          </p>
          {err ? <Banner tone="danger">{err}</Banner> : null}
        </div>
      </Dialog>
    </>
  );
}

/** 「삭제」 — 기록이 하나도 없는 계정만 지워진다. 막히면 서버 문장(사용 중지 안내)을 그대로 보인다 */
function MemberDeleteButton({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const write = useDeleteMember();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) setErr(null); }, [open]);
  const pending = write.isPending;
  const submit = () => {
    setErr(null);
    write.mutate(member.id, { onSuccess: () => setOpen(false), onError: (e) => setErr(apiMessage(e)) });
  };
  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>삭제</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${member.name} · 삭제`}
        width={440}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" variant="danger" onClick={submit} disabled={pending}>{pending ? '지우는 중…' : '삭제'}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-fg-2">
            이 계정을 지웁니다. 기록(수업 · 시급 · 할 일 · 알림 …)이 하나도 없는 계정만 지워지고, 되돌릴 수 없습니다.
          </p>
          {err ? <Banner tone="danger">{err}</Banner> : null}
        </div>
      </Dialog>
    </>
  );
}

const NO_COUNTRIES: readonly PhoneCountry[] = [];

/** 줄 단추 묶음 — 좁은 화면에서는 줄 아래로 내려가 한 줄을 다 쓴다 */
export function MemberRowActions({ member, tzGroups, tz, phoneCountries = NO_COUNTRIES, loginIdRule, tempPasswordRule }: {
  member: Member; tzGroups: TzGroup[]; tz: string;
  /** 휴대폰 국가번호 목록 — 서버 `DrawerDto.phoneCountries`(N-103). 없으면 번호 칸만 선다 */
  phoneCountries?: readonly PhoneCountry[];
  /** 아이디 · 임시 비밀번호 규칙 문장 — 서버 `DrawerDto.loginIdRule` · `tempPasswordRule`(W10 · D-R18) */
  loginIdRule?: string;
  tempPasswordRule?: string;
}) {
  if (!member.canEdit && !member.canResetPassword && !member.canToggleActive && !member.canDelete) return null;
  return (
    <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto">
      {member.canEdit ? <MemberEditButton member={member} tzGroups={tzGroups} tz={tz} phoneCountries={phoneCountries} loginIdRule={loginIdRule} /> : null}
      {member.canResetPassword ? <MemberResetButton member={member} tempPasswordRule={tempPasswordRule} /> : null}
      {member.canToggleActive ? <MemberActiveButton member={member} /> : null}
      {member.canDelete ? <MemberDeleteButton member={member} /> : null}
    </div>
  );
}
