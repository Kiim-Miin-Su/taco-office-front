/** @file-guide
 * 목적: MemberCreateDialog.tsx — MemberCreateButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §17 「+ 구성원」 (C97 · 테스트 시나리오 D-41 「강사 계정 생성」 · D-R39).
 *
 * 화면이 보내는 것은 **이름 · 이메일 · 첫 비밀번호 · 역할(강사·매니저) · 직함 · 시간대 · 전화 · 입사일 · 기본 시급**이다.
 * 대표·관리자는 고를 수 없다 — 권한을 올리는 길을 화면에 두지 않는다(서버 DTO 도 같은 둘만 받는다).
 * 단추가 서는지는 서버의 `canAddMember` 가 정한다 — 이 파일은 role 을 보지 않는다.
 * 시간대 낱말은 서랍의 「시간대 그룹」(D-R18) 그대로이고, 시급을 적으면 입사일(지났으면 오늘)부터의 WAGE 한 줄이 같이 선다(소급 없음).
 * 비밀번호는 보내기만 한다 — 응답에 없고 화면도 다시 보이지 않는다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Segmented, Select } from '../ui';
import { apiMessage } from '@/api/client';
import { useCreateMember } from '@/api/queries';
import type { Member, StaffCreate, TzGroup } from '@/api/types';
import { ROLES } from '@/lib/roles';
import { todayKst } from '@/lib/calendar';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** 서버 `STAFF_CREATE_ROLES` 와 같은 둘 — 이름은 `ROLES` 표에서 꺼낸다(비교가 아니라 표시 · D-R39) */
const PICKABLE: ReadonlyArray<StaffCreate['role']> = ['teacher', 'manager'];

export interface MemberCreateButtonProps {
  tzGroups: TzGroup[];
  /** 관리자 화면의 시간대 — 시간대 기본값 */
  tz: string;
  onDone?: (row: Member) => void;
}

export function MemberCreateButton({ tzGroups, tz, onDone }: MemberCreateButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const write = useCreateMember();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffCreate['role']>('teacher');
  const [title, setTitle] = useState('');
  const [memberTz, setMemberTz] = useState(tz);
  const [phone, setPhone] = useState('');
  const [hiredOn, setHiredOn] = useState(todayKst());
  const [wageRate, setWageRate] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(''); setEmail(''); setPassword(''); setRole('teacher'); setTitle(''); setMemberTz(tz);
    setPhone(''); setHiredOn(todayKst()); setWageRate(''); setErr(null);
  }, [open, tz]);

  const pending = write.isPending;
  const rate = wageRate.trim() === '' ? null : Number(wageRate);
  const rateOk = rate === null || (Number.isInteger(rate) && rate >= 1000);
  // 8자 이상은 로그인 규칙과 같다 — 최종 판정은 서버 DTO 다
  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && password.length >= 8 && ISO.test(hiredOn) && rateOk && !pending;

  const submit = () => {
    if (!canSubmit) return;
    const payload: StaffCreate = {
      name: name.trim(), email: email.trim(), password, role, hiredOn,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(memberTz ? { tz: memberTz } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(rate !== null ? { wageRate: rate } : {}),
    };
    setErr(null);
    write.mutate(payload, {
      onSuccess: (row) => { setOpen(false); onDone?.(row); },
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
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" onClick={submit} disabled={!canSubmit}
              title={!canSubmit && !pending ? '이름 · 이메일 · 8자 이상의 비밀번호는 있어야 합니다' : undefined}>
              {pending ? '만드는 중…' : '만들기'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <div>
            <Label>역할</Label>
            {/* 대표·관리자는 없다 — 이 창은 권한을 올리는 길이 아니다 */}
            <Segmented<StaffCreate['role']> ariaLabel="역할" value={role} disabled={pending} onChange={setRole}
              options={PICKABLE.map((key) => ({ value: key, label: ROLES.find((r) => r.key === key)?.label ?? key }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-name`}>이름</Label>
              <Input id={`${id}-name`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} disabled={pending} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor={`${id}-title`} hint="권한과 무관 (D-R39)">직함</Label>
              <Input id={`${id}-title`} value={title} maxLength={20} onChange={(e) => setTitle(e.target.value)} disabled={pending} placeholder="영어 · 코디네이터" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-email`} hint="로그인 아이디 · 유일">이메일</Label>
              <Input id={`${id}-email`} type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} disabled={pending} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor={`${id}-pw`} hint="8자 이상 · 첫 로그인 뒤 본인이 바꿉니다">첫 비밀번호</Label>
              <Input id={`${id}-pw`} type="password" value={password} maxLength={72} onChange={(e) => setPassword(e.target.value)} disabled={pending} autoComplete="new-password" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor={`${id}-tz`}>시간대</Label>
              {/* 낱말은 서랍의 시간대 그룹 그대로다 — 표에 없는 값은 서버가 409 로 막는다 */}
              <Select id={`${id}-tz`} value={memberTz} onChange={(e) => setMemberTz(e.target.value)} disabled={pending}>
                {tzGroups.map((g) => <option key={g.id} value={g.tz}>{g.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-phone`}>전화</Label>
              <Input id={`${id}-phone`} value={phone} maxLength={20} inputMode="tel" onChange={(e) => setPhone(e.target.value)} disabled={pending} />
            </div>
            <div>
              <Label htmlFor={`${id}-hired`} hint="불가 시간 2주 회차의 기산점">입사일</Label>
              <Input id={`${id}-hired`} type="date" value={hiredOn} onChange={(e) => setHiredOn(e.target.value)} disabled={pending} />
            </div>
          </div>
          <div>
            <Label htmlFor={`${id}-wage`} hint="원/시간 · 비우면 나중에 「시급 수정」으로 · 입사일이 지났으면 오늘부터 (소급 없음)">기본 시급 (선택)</Label>
            <Input id={`${id}-wage`} type="number" min={1000} step={1000} inputMode="numeric" value={wageRate} onChange={(e) => setWageRate(e.target.value)} disabled={pending} placeholder="40000" />
          </div>
          {err ? <Banner tone="danger">{err}</Banner> : null}
          <p className="text-[11px] text-fg-subtle">만들면 바로 그 이메일과 비밀번호로 로그인됩니다. 비밀번호는 해시로만 남고 다시 볼 수 없습니다.</p>
        </div>
      </Dialog>
    </>
  );
}
