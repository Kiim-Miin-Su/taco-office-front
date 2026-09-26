/** @file-guide
 * 목적: MemberCreateDialog.tsx — MemberCreateButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §17 「+ 구성원」 (C97 · 테스트 시나리오 D-41 「강사 계정 생성」 · D-R39 · W8 · W10).
 *
 * 화면이 보내는 것은 **이름 · 아이디 · 임시 비밀번호 · 이메일(선택) · 역할(강사·매니저) · 직함 · 시간대 · 휴대폰 · 입사일 · 기본 시급**이다.
 * **아이디와 임시 비밀번호는 매니저가 정한다**(W10 · 대표 지시 2026-09-26 「매니저가 아이디 비번 만들면 db 에 저장 → 초기 설정 시
 * 주요 인증 및 비번 재설정」) — 아이디는 형식 자유(띄어쓰기만 없음)이고 규칙 문장은 서버가 준다. 첫 로그인 때 본인이 바꾼다.
 * 만들어지면 창이 닫히지 않고 **넘겨줄 정보**(아이디는 서버 응답 · 비밀번호는 적은 값 — 응답에는 비밀번호가 없다)를 보인다.
 * 대표·관리자는 고를 수 없다 — 권한을 올리는 길을 화면에 두지 않는다(서버 DTO 도 같은 둘만 받는다).
 * 단추가 서는지는 서버의 `canAddMember` 가 정한다 — 이 파일은 role 을 보지 않는다.
 * 시간대 낱말은 서랍의 「시간대 그룹」(D-R18) 그대로이고, 시급을 적으면 입사일(지났으면 오늘)부터의 WAGE 한 줄이 같이 선다(소급 없음).
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Segmented, Select } from '../ui';
import { PhoneInput, composePhone, type PhoneValue } from '../account/PhoneInput';
import { apiMessage } from '@/api/client';
import { useCreateMember } from '@/api/queries';
import type { Member, PhoneCountry, StaffCreate, TzGroup } from '@/api/types';
import { ROLES } from '@/lib/roles';
import { todayKst } from '@/lib/calendar';
import { MemberHandoverBox, type MemberHandover } from './MemberRowActions';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** 서버 `STAFF_CREATE_ROLES` 와 같은 둘 — 이름은 `ROLES` 표에서 꺼낸다(비교가 아니라 표시 · D-R39). 「수정」 창도 같은 둘을 쓴다 */
export const STAFF_PICKABLE_ROLES: ReadonlyArray<StaffCreate['role']> = ['teacher', 'manager'];
const PICKABLE = STAFF_PICKABLE_ROLES;

export interface MemberCreateButtonProps {
  tzGroups: TzGroup[];
  /** 관리자 화면의 시간대 — 시간대 기본값 */
  tz: string;
  /**
   * 시급을 세울 수 있는가 — 서버의 `DrawerDto.canWage` 그대로다(S4 · D-R39).
   * 구성원을 만드는 것과 시급을 정하는 것은 **다른 권한**이라, 없으면 시급 칸만 사라지고 만들기는 그대로다.
   */
  canWage: boolean;
  /** 휴대폰 국가번호 목록 — 서버 `DrawerDto.phoneCountries`(N-103 · 첫 줄이 국내). 없으면 번호 칸만 선다 */
  phoneCountries?: PhoneCountry[];
  /** 아이디 · 임시 비밀번호 규칙 문장 — 서버 `DrawerDto.loginIdRule` · `tempPasswordRule`(W10 · D-R18) */
  loginIdRule?: string;
  tempPasswordRule?: string;
  onDone?: (row: Member) => void;
}

const NO_COUNTRIES: PhoneCountry[] = [];

export function MemberCreateButton({
  tzGroups, tz, canWage, phoneCountries = NO_COUNTRIES, loginIdRule, tempPasswordRule, onDone,
}: MemberCreateButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const write = useCreateMember();
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffCreate['role']>('teacher');
  const [title, setTitle] = useState('');
  const [memberTz, setMemberTz] = useState(tz);
  const [phone, setPhone] = useState<PhoneValue>({ country: '', local: '' });
  const [hiredOn, setHiredOn] = useState(todayKst());
  const [wageRate, setWageRate] = useState('');
  const [err, setErr] = useState<string | null>(null);
  /** 만든 뒤의 넘겨줄 정보 — 창을 닫으면 사라진다(다시 볼 수 없다 · 잊었으면 「비밀번호 초기화」) */
  const [made, setMade] = useState<(MemberHandover & { name: string }) | null>(null);

  // 열 때와 닫을 때 모두 비운다 — 적은 임시 비밀번호가 닫힌 창에 남지 않게
  useEffect(() => {
    setName(''); setLoginId(''); setPassword(''); setEmail(''); setRole('teacher'); setTitle(''); setMemberTz(tz);
    setPhone({ country: '', local: '' }); setHiredOn(todayKst()); setWageRate(''); setErr(null); setMade(null);
  }, [open, tz]);

  const pending = write.isPending;
  const phoneText = composePhone(phone, phoneCountries);
  const rate = wageRate.trim() === '' ? null : Number(wageRate);
  const rateOk = rate === null || (Number.isInteger(rate) && rate >= 1000);
  // 최종 판정은 서버다 — 아이디 규칙(띄어쓰기 · 길이 · 겹침) · 임시 비밀번호 규칙은 서버가 문장과 함께 막는다(W10)
  const canSubmit = name.trim().length > 0 && loginId.trim().length > 0 && password.length > 0 && ISO.test(hiredOn) && rateOk && !pending;

  const submit = () => {
    if (!canSubmit) return;
    const payload: StaffCreate = {
      name: name.trim(), loginId: loginId.trim(), password, role, hiredOn,
      // 이메일은 선택이다 — 비우면 보내지 않는다(첫 설정 때 본인이 적고 확인한다)
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(memberTz ? { tz: memberTz } : {}),
      // 국내는 적은 그대로 · 해외는 「+국가번호 번호」(N-103) — 모양 판정은 서버가 한다
      ...(phoneText ? { phone: phoneText } : {}),
      // 칸이 없으면 값도 없다 — 권한이 꺼진 뒤 남은 초안이 조용히 실려 403 이 되는 일을 막는다
      ...(canWage && rate !== null ? { wageRate: rate } : {}),
    };
    setErr(null);
    write.mutate(payload, {
      // 창을 닫지 않고 넘겨줄 정보를 보인다 — 만든 사람이 강사에게 전해 줘야 한다. 아이디는 서버가 저장한 모양 그대로
      onSuccess: (row) => { setMade({ name: row.name, loginId: row.loginId, password }); onDone?.(row); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>+ 구성원</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="구성원 추가"
        width={560}
        footer={made ? (
          <Button type="button" onClick={() => setOpen(false)}>닫기</Button>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" onClick={submit} disabled={!canSubmit}
              title={!canSubmit && !pending ? '이름 · 아이디 · 임시 비밀번호는 있어야 합니다' : undefined}>
              {pending ? '만드는 중…' : '만들기'}
            </Button>
          </>
        )}
      >
        {made ? (
          <div className="flex flex-col gap-3">
            <Banner tone="success">{made.name} 계정을 만들었습니다.</Banner>
            <MemberHandoverBox loginId={made.loginId} password={made.password} />
          </div>
        ) : (
        <div className="flex flex-col gap-3">
          <div>
            <Label>역할</Label>
            {/* 대표·관리자는 없다 — 이 창은 권한을 올리는 길이 아니다 */}
            <Segmented<StaffCreate['role']> ariaLabel="역할" value={role} disabled={pending} onChange={setRole}
              options={PICKABLE.map((key) => ({ value: key, label: ROLES.find((r) => r.key === key)?.label ?? key }))} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-name`}>이름</Label>
              <Input id={`${id}-name`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} disabled={pending} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor={`${id}-title`} hint="권한과 무관 (D-R39)">직함</Label>
              <Input id={`${id}-title`} value={title} maxLength={20} onChange={(e) => setTitle(e.target.value)} disabled={pending} placeholder="영어 · 코디네이터" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-login`}>아이디</Label>
              <Input id={`${id}-login`} value={loginId} maxLength={120} onChange={(e) => setLoginId(e.target.value)} disabled={pending}
                autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </div>
            <div>
              <Label htmlFor={`${id}-temp`}>임시 비밀번호</Label>
              {/* 넘겨줄 값이라 보이게 적는다 — 저장된 비밀번호 채우기는 끈다 */}
              <Input id={`${id}-temp`} value={password} maxLength={200} onChange={(e) => setPassword(e.target.value)} disabled={pending}
                autoComplete="off" autoCapitalize="none" spellCheck={false} className="font-mono" />
            </div>
          </div>
          {loginIdRule || tempPasswordRule ? (
            <div className="-mt-1 flex flex-col gap-0.5 text-[11px] text-fg-subtle">
              {loginIdRule ? <p>아이디: {loginIdRule}</p> : null}
              {tempPasswordRule ? <p>{tempPasswordRule}</p> : null}
            </div>
          ) : null}
          <div>
            <Label htmlFor={`${id}-email`} hint="첫 설정 때 본인이 확인합니다">이메일 (선택)</Label>
            <Input id={`${id}-email`} type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} disabled={pending} autoComplete="off" />
          </div>
          <div>
            <Label htmlFor={`${id}-phone`} hint="첫 설정 때 확인합니다 · 해외 번호는 국가번호를 고릅니다">휴대폰</Label>
            <PhoneInput id={`${id}-phone`} countries={phoneCountries} value={phone} onChange={setPhone} disabled={pending} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-tz`}>시간대</Label>
              {/* 낱말은 서랍의 시간대 그룹 그대로다 — 표에 없는 값은 서버가 409 로 막는다 */}
              <Select id={`${id}-tz`} value={memberTz} onChange={(e) => setMemberTz(e.target.value)} disabled={pending}>
                {tzGroups.map((g) => <option key={g.id} value={g.tz}>{g.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-hired`} hint="불가 시간 2주 회차의 기산점">입사일</Label>
              <Input id={`${id}-hired`} type="date" value={hiredOn} onChange={(e) => setHiredOn(e.target.value)} disabled={pending} />
            </div>
          </div>
          {/* 시급 칸은 시급을 다룰 수 있는 사람에게만 — 서버도 같은 질문을 한다(403 WAGE_SET_FORBIDDEN · S4) */}
          {canWage ? (
            <div>
              <Label htmlFor={`${id}-wage`} hint="원/시간 · 비우면 나중에 「시급 수정」으로 · 입사일이 지났으면 오늘부터 (소급 없음)">기본 시급 (선택)</Label>
              <Input id={`${id}-wage`} type="number" min={1000} step={1000} inputMode="numeric" value={wageRate} onChange={(e) => setWageRate(e.target.value)} disabled={pending} placeholder="40000" />
            </div>
          ) : null}
          {err ? <Banner tone="danger">{err}</Banner> : null}
          <p className="text-[11px] text-fg-subtle">만들면 넘겨줄 아이디와 임시 비밀번호를 한 번 보여 드립니다 — 창을 닫으면 비밀번호는 다시 볼 수 없습니다.</p>
        </div>
        )}
      </Dialog>
    </>
  );
}
