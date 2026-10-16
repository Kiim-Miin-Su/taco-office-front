/** @file-guide
 * 목적: MyPageDialog.tsx — MyPageDialog, MyPageHead (component)
 * 책임/재사용: 본인 마이 페이지 대화상자(AUTH-SELF-01) — 기존 ui/Overlay Dialog 틀에 머리 · (강사) 시간대 · 기본 시급 · 계정 절을 조립한다. 열림은 셸이 URL(`?mypage=1` · my-page-url)로 소유하고, 서버 값은 Query(프로필 · 강사 홈 · 머리줄)에서만 읽는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 PPTX p5 · p98 · p103 · p136 「마이 페이지」 = 대화상자: 머리(아바타 · 이름 · 직함/역할 · 입사일 · TN Academy) →
 * 시간대(적용 중 · 현재 시각 · [변경 요청]) → 기본 시급(적용 중 · 적용일 · Kinder · 진단/모의 건당 · [변경 신청] · 월 1회) → 계정 → [닫기].
 * 관리자 · 매니저 · 대표는 같은 대화상자의 머리 + 계정이다(10/16 사용자 결정 · Figma 색인 D2).
 * 어느 절을 세울지는 역할 낱말이 아니라 서버 플래그(canAdminPage → useTeacherSurface)로만 고른다 (D-R39).
 * 역할 낱말은 직함이 있으면 직함(관리자 PPTX p131 「직함 그대로」), 없으면 역할 이름 — 둘 다 서버 값이다.
 */
'use client';
import { useEffect, useRef, useState } from 'react';
import { useCreateSettingRequest, useProfile, useTeacherHome } from '@/api/queries';
import type { Profile, TeacherSettings } from '@/api/types';
import { Button, Chip, Dialog, QueryState } from '@/components/ui';
import { useTeacherClock } from '@/components/teacher/TeacherTodayHero';
import { useTeacherSurface } from '@/components/teacher/teacher-surface';
import { won } from '@/lib/money';
import { AccountSection, type MyPageEdit } from './AccountSection';
import { SettingRequestForm, type SettingAsk } from './TeacherSettingRequest';

const SUB = {
  teacher: '시간대와 시급은 관리자 승인 후 바뀝니다.',
  staff: '이름과 연락처를 확인하고 바꿉니다 · 연락처는 새 수신처 인증 뒤에 바뀝니다',
} as const;
const SCOPE = {
  teacher: '담당 학생과 배정된 수업만 조회됩니다',
  staff: '업무 화면과 권한은 역할 권한 표를 따릅니다 — 여기서는 바꿀 수 없습니다',
} as const;

/** 머리 — 아바타(이름 뒤 두 글자 · 메뉴 사용자 칸과 같은 모양) · 이름 · 직함/역할 · 입사일 · 학원 이름 */
export function MyPageHead({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-3 border-b border-line pb-4">
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-inset text-[15px] font-bold text-primary">
        {profile.name.slice(-2)}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[18px] font-bold text-fg">{profile.name}</span>
          <span className="text-[13px] text-fg-subtle">{profile.title || profile.roleLabel}</span>
        </p>
        {/* 입사일이 없는 옛 계정은 낱말을 지어내지 않는다 */}
        <p className="mt-0.5 text-[12px] font-medium text-fg-2">{profile.hiredOn ? `입사일 ${profile.hiredOn} · TN Academy` : 'TN Academy'}</p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2 text-[12px] text-fg-subtle">
      {children}<Chip size="compact" tone="success" styleKind="outline">적용 중</Chip>
    </p>
  );
}

/** 시간대 — 서버 낱말(머리줄과 같은 「Seoul · UTC+9」) · IANA 이름 · 본인 시간대의 지금 시각 */
function TimezoneSection({ s, editing, onEdit, ask }: {
  s: TeacherSettings; editing: MyPageEdit | null; onEdit: (edit: MyPageEdit | null) => void; ask: SettingAsk;
}) {
  const { time, tzLabel } = useTeacherClock();
  return (
    <section aria-label="시간대" className="border-b border-line py-4">
      <SectionLabel>시간대</SectionLabel>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[20px] font-bold leading-7 text-fg">{tzLabel ?? s.timezone}</p>
          <p className="mt-0.5 text-[12px] font-medium text-fg-2">{time ? `${s.timezone} · 현재 ${time}` : s.timezone}</p>
        </div>
        <Button
          size="sm" className="shrink-0" disabled={!s.canAskTz || editing !== null || ask.isPending} data-mypage-edit="tz"
          title={s.canAskTz ? undefined : '올린 요청이 처리 중입니다'} onClick={() => onEdit('tz')}
        >
          변경 요청
        </Button>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
        해외에서 수업하시는 경우 현지 시간 기준으로 모든 화면이 표시됩니다. 전 세계 {s.timezones.length}개 시간대 중에서 고를 수 있고, 관리자 승인이 있어야 바뀝니다.
      </p>
      {!s.canAskTz ? <p className="mt-1 text-[12px] font-bold text-fg-2">올린 요청이 처리 중입니다</p> : null}
      {editing === 'tz' ? <SettingRequestForm s={s} kind="tz" ask={ask} onClose={() => { onEdit(null); ask.reset(); }} /> : null}
    </section>
  );
}

/** 진단 · 모의 건당 — 같으면 한 번(PPTX p98 「진단·모의 ₩15,000/건」), 다르면 따로, 서버가 못 주면 적지 않는다 */
function perSession(s: TeacherSettings): string | null {
  const diag = s.diagPerSession ?? null;
  const mock = s.mockPerSession ?? null;
  if (diag !== null && diag === mock) {
    return `진단·모의 ${won(diag)}/건`;
  }
  const parts = [diag !== null ? `진단 ${won(diag)}/건` : null, mock !== null ? `모의 ${won(mock)}/건` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** 기본 시급 — 본인만 보는 값. 적용일 · Kinder 시급 · 진단/모의 건당은 서버 파생값(S1 TeacherSettings) 그대로 */
function WageSection({ s, editing, onEdit, ask }: {
  s: TeacherSettings; editing: MyPageEdit | null; onEdit: (edit: MyPageEdit | null) => void; ask: SettingAsk;
}) {
  const detail = [
    s.wageFrom ? `${s.wageFrom} 적용` : null,
    s.kinderHourlyRate !== null && s.kinderHourlyRate !== undefined ? `Kinder ${won(s.kinderHourlyRate)}` : null,
    perSession(s),
  ].filter(Boolean).join(' · ');
  return (
    <section aria-label="기본 시급" className="border-b border-line py-4">
      <SectionLabel>기본 시급</SectionLabel>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[20px] font-bold leading-7 text-fg">
            {s.wageRate === null || s.wageRate === undefined ? '—' : `${won(s.wageRate)}/시간`}
          </p>
          {detail ? <p className="mt-0.5 text-[12px] font-medium text-fg-2">{detail}</p> : null}
        </div>
        <Button
          size="sm" className="shrink-0" disabled={!s.canAskWage || editing !== null || ask.isPending} data-mypage-edit="wage"
          title={s.canAskWage ? undefined : `${s.wageAskableOn}부터 다시 신청할 수 있습니다`} onClick={() => onEdit('wage')}
        >
          변경 신청
        </Button>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">시급 변경 신청은 한 달에 한 번입니다. 이 내역은 본인만 볼 수 있습니다.</p>
      {!s.canAskWage && s.wageAskableOn ? (
        <p className="mt-1 text-[12px] font-bold text-fg-2">{s.wageAskableOn}부터 다시 신청할 수 있습니다</p>
      ) : null}
      {editing === 'wage' ? <SettingRequestForm s={s} kind="wage" ask={ask} onClose={() => { onEdit(null); ask.reset(); }} /> : null}
    </section>
  );
}

/** 열려 있는 동안만 선다 — 닫으면 편집 초안 · 결과 문장이 함께 사라진다(다시 열면 처음부터) */
function MyPageBody({ teacher }: { teacher: boolean }) {
  const profile = useProfile();
  const home = useTeacherHome(teacher);
  const ask = useCreateSettingRequest();
  const [editing, setEditing] = useState<MyPageEdit | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** 방금 닫은 패널 — 그 패널을 연 단추(data-mypage-edit)로 초점을 돌려준다(닫힌 패널 안에 있던 초점이 body 로 빠지지 않게) */
  const refocus = useRef<MyPageEdit | null>(null);
  const edit = (next: MyPageEdit | null) => {
    if (next === null && editing !== null) {
      refocus.current = editing;
    }
    setEditing(next);
  };
  useEffect(() => {
    // 연락처 저장 뒤에는 세션이 바뀌어 프로필을 다시 읽는다 — 단추가 다시 설 때까지 그리기마다 한 번씩 찾는다
    const key = refocus.current;
    if (!key || editing !== null) {
      return;
    }
    const opener = rootRef.current?.querySelector<HTMLButtonElement>(`[data-mypage-edit="${key}"]`);
    if (opener) {
      refocus.current = null;
      // 요청을 올려 단추가 잠겼으면(처리 중 · 한 달에 한 번) 대화상자 판에 둔다 — Tab 이 대화상자 안에서 다시 시작한다
      (opener.disabled ? rootRef.current?.closest<HTMLElement>('[role="dialog"]') : opener)?.focus();
    }
  });
  return (
    <div ref={rootRef}>
      <QueryState query={profile} isEmpty={() => false}>
        {(p) => (
          <div className="flex flex-col pb-1">
            <MyPageHead profile={p} />
            {teacher ? (
              <div className="pt-1">
                <QueryState query={home} isEmpty={() => false}>
                  {(d) => (
                    <>
                      <TimezoneSection s={d.settings} editing={editing} onEdit={edit} ask={ask} />
                      <WageSection s={d.settings} editing={editing} onEdit={edit} ask={ask} />
                    </>
                  )}
                </QueryState>
              </div>
            ) : null}
            <AccountSection
              profile={p} scope={teacher ? SCOPE.teacher : SCOPE.staff}
              editing={editing} onEdit={edit} notice={notice} onNotice={setNotice}
            />
          </div>
        )}
      </QueryState>
    </div>
  );
}

/**
 * 폭 520 · 머리/바닥 고정 · 본문만 구른다 · 바닥 [닫기] 가득 폭 (D1 · D8 — 390 폭에서는 양옆 24 를 뺀 342).
 * Esc · 바탕 누르기도 닫는다. 연 단추로 초점을 돌려주는 일은 공용 Dialog(useDialogA11y)가 한다.
 */
export function MyPageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const teacher = useTeacherSurface();
  return (
    <Dialog
      open={open} onClose={onClose} title="마이 페이지" sub={teacher ? SUB.teacher : SUB.staff} width={520}
      footer={<Button className="w-full" onClick={onClose}>닫기</Button>}
    >
      {open ? <MyPageBody teacher={teacher} /> : null}
    </Dialog>
  );
}
