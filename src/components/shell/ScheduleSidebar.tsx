/** @file-guide
 * 목적: ScheduleSidebar.tsx — ScheduleSidebar (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §07 좌측 사이드바 — 도구 다섯·KST 안내·프로그램/과목 수·표 나누기·«사이드 접기».
 * 프로그램/과목 수는 **보는 기간과 무관한 일정 원본(SER) 수**다(§07~§11 컷이 같은 수 · D-R44) —
 * 서버(`GET /schedule/series-counts`)가 묶음 합계까지 세고 이 파일은 그리기만 한다. 이름·색은 코드표(meta).
 * 원문 「과목 [관리] [전체]」 머리에는 수가 없어 과목 합계를 두지 않는다.
 * 「가능 시간」은 강사 불가 시간 겹쳐 보기를 켜고 끈다(G37 · 상태는 스케줄 화면이 갖는다).
 * 「자동 연계」는 원본에 있으나 무엇을 잇는지 원문에 없어(대표 결정 대기) 비활성으로 표기한다.
 * 「프로그램」·「과목」 머리의 [관리] 는 §18 프로그램 관리로, [전체] 는 도구줄의 종류·과목 거르기를 푼다(원문 §07 · g1 #18).
 * [관리] 는 그 화면에 들어갈 수 있을 때만 선다 — 판정은 부르는 쪽이 내비 규칙(`canAccessAppRoute`)으로 넘긴다(D-R39).
 */
'use client';
import { useMemo } from 'react';
import { CalendarClock, ChevronsLeft, History, Link2, Lock, Plus, UserPlus } from 'lucide-react';
import type { Meta, ScheduleSeriesCounts } from '@/api/types';
import { useWorkspace } from '@/store/useWorkspace';

function CountRow({ color, name, count }: { color: string; name: string; count: number }) {
  return (
    <li className="flex items-center gap-2 px-1 py-0.5 text-[12px]">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-fg">{name}</span>
      <span className="font-bold text-fg-subtle">{count}</span>
    </li>
  );
}

/** 머리 오른쪽 작은 단추 — 원문 §07 「프로그램 [관리] [전체]」 */
const HEAD_TOOL = 'rounded border border-line bg-card px-1.5 py-px text-[10px] font-bold text-fg-subtle hover:bg-inset';

export function ScheduleSidebar({
  meta, counts, canEdit, splitOn, onCreate, onHistory, onSplit, availabilityOn = false, onAvailability, onClearKind, onClearSub,
  canOpenPrograms = false,
}: {
  meta?: Meta;
  /** 서버가 센 일정 원본 수 — 없으면(읽는 중) 수를 지어내지 않는다 */
  counts?: ScheduleSeriesCounts;
  canEdit: boolean;
  splitOn: boolean;
  onCreate: () => void;
  onHistory: () => void;
  onSplit: () => void;
  /** 「가능 시간」 — 강사 불가 시간 겹쳐 보기가 켜져 있는가 · 켜고 끄는 콜백(없으면 단추를 잠근다) */
  availabilityOn?: boolean;
  onAvailability?: () => void;
  /** 「프로그램」·「과목」 머리의 [전체] — 도구줄 종류·과목 거르기를 푼다(없으면 단추를 두지 않는다) */
  onClearKind?: () => void;
  onClearSub?: () => void;
  /** §18 프로그램 관리에 들어갈 수 있는가 — 서버 플래그로 판정한 값(아니면 [관리] 를 그리지 않는다) */
  canOpenPrograms?: boolean;
}) {
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar);
  /* 코드 → 이름·색 찾기만 한다(수는 서버 값 그대로). 코드표에 없는 코드는 그리지 않는다 — 코드값을 화면에 적지 않는다 */
  const { kindOf, subOf } = useMemo(() => ({
    kindOf: new Map((meta?.kinds ?? []).map((k) => [k.key, k])),
    subOf: new Map((meta?.subs ?? []).map((s) => [s.key, s])),
  }), [meta]);

  return (
    <div className="flex h-full w-[190px] flex-col gap-3 overflow-y-auto p-3">
      {/* 위 단추 · KST 카드 · 아래 단추는 줄지 않는다 — 목록만 남는 높이 안에서 스크롤한다.
          목록이 줄어들며 내용이 밖으로 넘치면 아래 「표 나누기」·「사이드 접기」 위에 겹쳐 그려진다(QA 0926 B1 · 1440×900) */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <button type="button" onClick={onCreate} disabled={!canEdit}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary text-[12px] font-bold text-white disabled:opacity-40">
          <Plus size={14} aria-hidden />일정 추가
        </button>
        {/* 원문 톤: 자동 연계 보라 — 무엇을 잇는지 원문에 없어 잠가 둔다(대표 결정 대기) */}
        <button type="button" disabled title="자동 연계 — 무엇을 잇는지 아직 정해지지 않았습니다"
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-violet text-[12px] font-bold text-white opacity-40">
          <Link2 size={14} aria-hidden />자동 연계
        </button>
        {/* 원문 톤: 가능 시간 청록 — 누르면 강사 불가 시간을 표에 겹쳐 본다(G37) */}
        <button type="button" onClick={onAvailability} disabled={!onAvailability} aria-pressed={availabilityOn}
          title={availabilityOn ? '강사 불가 시간 겹쳐 보기를 끕니다' : '강사가 적어 둔 불가 시간을 표에 겹쳐 봅니다'}
          className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-[12px] font-bold disabled:opacity-40 ${
            availabilityOn ? 'bg-teal text-white ring-2 ring-teal/40' : 'border border-teal bg-card text-teal hover:bg-teal/10'}`}>
          <CalendarClock size={14} aria-hidden />가능 시간
        </button>
        <button type="button" onClick={onHistory}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card text-[12px] font-bold text-fg hover:bg-inset">
          <History size={14} aria-hidden />변경 이력
        </button>
        {/* 원문 톤: 신규 학생 등록 보라 */}
        <a href="/intake"
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-violet text-[12px] font-bold text-white hover:opacity-90">
          <UserPlus size={14} aria-hidden />신규 학생 등록
        </a>
      </div>

      {/* 원문 KST 카드 — 🔒 + 파란 안내 글 */}
      <div className="shrink-0 rounded-lg border border-blue/30 bg-blue/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-blue">
        <b className="flex items-center gap-1 text-fg"><Lock size={12} aria-hidden />서울 KST 고정</b>
        관리자 화면은 항상 한국 시간
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 원문 §07 「프로그램 [관리] [전체]」 — 관리는 §18 프로그램 관리, 전체는 종류 거르기 풀기 */}
        <div className="mb-1 flex items-center gap-1 px-1 text-[11px] font-bold text-fg">
          프로그램
          <span className="ml-auto" />
          {canOpenPrograms ? <a href="/programs" className={HEAD_TOOL}>관리</a> : null}
          {onClearKind ? <button type="button" onClick={onClearKind} className={HEAD_TOOL} aria-label="프로그램 거르기 풀기">전체</button> : null}
        </div>
        {!counts ? <p className="px-1 py-1 text-[11px] text-fg-subtle">일정 원본 수를 읽는 중…</p> : null}
        {(counts?.groups ?? []).map((group) => (
          <section key={group.grp} className="mb-2">
            <h3 className="flex items-center px-1 py-1 text-[11px] font-bold text-fg-subtle">
              {group.label}<span className="ml-auto">{group.count}</span>
            </h3>
            <ul>
              {group.kinds.map((k) => {
                const code = kindOf.get(k.key);
                return code ? <CountRow key={k.key} color={code.color} name={code.name} count={k.count} /> : null;
              })}
            </ul>
          </section>
        ))}
        {counts?.subs.length ? (
          <section className="mb-2">
            <h3 className="flex items-center gap-1 px-1 py-1 text-[11px] font-bold text-fg-subtle">
              과목<span className="ml-auto" />
              {canOpenPrograms ? <a href="/programs" className={HEAD_TOOL}>관리</a> : null}
              {onClearSub ? <button type="button" onClick={onClearSub} className={HEAD_TOOL} aria-label="과목 거르기 풀기">전체</button> : null}
            </h3>
            <ul>
              {counts.subs.map((c) => {
                const code = subOf.get(c.key);
                return code ? <CountRow key={c.key} color={code.color} name={code.name} count={c.count} /> : null;
              })}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-1.5">
        <button type="button" onClick={onSplit}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card text-[12px] font-bold text-fg hover:bg-inset">
          {splitOn ? '분할 해제' : '표 나누기'}
        </button>
        <button type="button" onClick={toggleSidebar} aria-label="사이드 접기"
          className="flex h-9 items-center justify-center gap-1 rounded-lg border border-line bg-card text-[12px] font-bold text-fg-subtle hover:bg-inset">
          <ChevronsLeft size={14} aria-hidden />사이드 접기
        </button>
      </div>
    </div>
  );
}
