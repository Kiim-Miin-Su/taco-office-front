/** @file-guide
 * 목적: §07~§11 스케줄 보기·표시 필터·밀도·PNG 진입을 한 도구줄로 통일한다.
 * 책임/재사용: 서버가 준 Occurrence/Meta 사실만 순수 selector로 투영한다. 조회·권한·업무 판정·다운로드 구현은 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { Clock, Columns3, Download, Menu, Plus } from 'lucide-react';
import type { Meta, Occurrence } from '@/api/types';
import type { PersonPeriod, View } from '@/lib/calendar';
import { Button, Input, LinkButton, Segmented, Select } from '@/components/ui';

export type ScheduleModeFilter = 'all' | Occurrence['mode'];
export type ScheduleDensity = 'normal' | 'compact' | 'wide';
/**
 * 원문 §07 도구줄의 [일정 · 리포트] — 블록의 **색이 무엇을 말하는가**만 바꾼다.
 * 「일정」은 과목색, 「리포트」는 리포트 상태색(미작성 · 승인 대기 · 반려 …). 상태는 서버의 `repState` 그대로다.
 */
export type ScheduleDisplay = 'schedule' | 'report';
/** 원문 §07 의 둘째 축 [전체 · 학생별 · 선생님별] — 첫째 축(기간)과 따로 고른다 */
export type ScheduleTarget = 'all' | 'student' | 'teacher';

/**
 * 도구줄의 제어값은 route reducer 한 곳에서 소유한다. null은 해당 축의 「전체」이며,
 * 화면별 local state나 서버 query parameter로 같은 값을 복제하지 않는다.
 */
export interface ScheduleFilters {
  mode: ScheduleModeFilter;
  kindKey: string | null;
  subKey: string | null;
  teacherId: number | null;
  studentId: number | null;
  roomId: number | null;
  /** 원문 §07 필터 칩 「줌 계정 ▾」 — 회차의 줌 계정(`occ.zaccId`)으로 좁힌다 */
  zaccId: number | null;
  density: ScheduleDensity;
  display: ScheduleDisplay;
}

export const INITIAL_SCHEDULE_FILTERS: ScheduleFilters = {
  mode: 'all',
  kindKey: null,
  subKey: null,
  teacherId: null,
  studentId: null,
  roomId: null,
  zaccId: null,
  // 원문 §07·§08 캡처의 밀도 기본 선택은 「촘촘」이다
  density: 'compact',
  display: 'schedule',
};

/** 좁히는 축(방식 · 종류 · 과목 · 구성원 · 학생 · 강의실 · 줌 계정) 중 켜진 수 — 대상 줄의 「전체 기준」 자리가 쓴다 */
export function activeFilterCount(filters: ScheduleFilters): number {
  return [
    filters.mode !== 'all', filters.kindKey, filters.subKey, filters.teacherId,
    filters.studentId, filters.roomId, filters.zaccId,
  ].filter((v) => v !== null && v !== false).length;
}

/** 서버가 판정한 회차 사실을 화면 축으로만 좁힌다. 상태·권한·반복 여부를 다시 계산하지 않는다. */
export function filterScheduleOccurrences(items: Occurrence[], filters: ScheduleFilters): Occurrence[] {
  return items.filter((occurrence) => (
    (filters.mode === 'all' || occurrence.mode === filters.mode)
    && (filters.kindKey === null || occurrence.kindKey === filters.kindKey)
    && (filters.subKey === null || occurrence.subKey === filters.subKey)
    && (filters.teacherId === null || occurrence.teacherId === filters.teacherId)
    && (filters.studentId === null || occurrence.students.some(
      (student) => student.id === filters.studentId && !student.droppedOnce,
    ))
    && (filters.roomId === null || occurrence.roomId === filters.roomId)
    && (filters.zaccId === null || occurrence.zaccId === filters.zaccId)
  ));
}

/** 표 머리 칩의 보기 이름 — 분할 표의 머리가 쓴다. 도구줄은 이것을 두 축으로 나눠 고른다 */
export const SCHEDULE_VIEWS: Array<{ value: View; label: string }> = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'student', label: '학생별' },
  { value: 'teacher', label: '선생님별' },
];

/**
 * 원문 §07 도구줄 첫째 축 — [일간 · 주간 · 월간 · 선택]. 「선택」(기간 직접 고르기)은 눌렀을 때의 표가
 * 원문 어느 컷에도 없어 만들지 않았다(D-R44) — 날짜로 바로 가는 것은 오른쪽 날짜 칸이 한다.
 */
export const SCHEDULE_PERIODS: Array<{ value: PersonPeriod; label: string }> = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
];

/** 원문 §07 도구줄 둘째 축 — [전체 · 학생별 · 선생님별] */
export const SCHEDULE_TARGETS: Array<{ value: ScheduleTarget; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'student', label: '학생별' },
  { value: 'teacher', label: '선생님별' },
];

const DISPLAYS: Array<{ value: ScheduleDisplay; label: string }> = [
  { value: 'schedule', label: '일정' },
  { value: 'report', label: '리포트' },
];

const MODES: Array<{ value: ScheduleModeFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'offline', label: '현장' },
  { value: 'online', label: '온라인' },
];

const DENSITIES: Array<{ value: ScheduleDensity; label: string }> = [
  { value: 'normal', label: '보통' },
  { value: 'compact', label: '촘촘' },
  { value: 'wide', label: '넓게' },
];

function optionalNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export interface ScheduleToolbarProps {
  /** 기간 축의 지금 값 — 개인표면 그 표의 기간(`personPeriod`)이다 (`lib/calendar.paneView`) */
  period: PersonPeriod;
  target: ScheduleTarget;
  filters: ScheduleFilters;
  meta?: Meta;
  /**
   * 원문 §07 「세로선 나누기」 — 일간 표를 **강의실 열로 나누는가**(N-80 채택). 표 나누기(분할)와 다른 동작이다 —
   * 분할은 사이드바 「표 나누기」 하나가 맡는다. 기본은 꺼짐(날짜 한 열 + lane · 원문 §07 캡처 모양).
   */
  roomColumnsOn?: boolean;
  /** 강의실 열이 뜻을 갖는 표(일간)에서만 누를 수 있다 — 다른 보기에서는 까닭을 `title` 로 적는다 */
  roomColumnsAvailable?: boolean;
  /**
   * 원문 §07 둘째 줄 「≡ 회계」(N-100) — 이미 있는 회계 탭으로 간다. 서는지는 부르는 쪽이
   * **경로 권한 판정**(`canAccessAppRoute('/accounting', me)`)으로 정한다 — 역할을 여기서 견주지 않는다 (D-R39).
   */
  showAccounting?: boolean;
  exporting?: boolean;
  /** 고른 표의 날짜 — 원문 §07 도구줄 오른쪽 「‹ 2026-08-21 (금) ▾ › 오늘」 */
  date: string;
  /** 표가 그리는 시간 축 「⏱ 09–22」 — 기본 09~22 에 실제 수업만큼 넓힌 값(N-43 · 접지 않는다) */
  axisLabel?: string;
  /** 빈 시간 찾기 켜짐 — 일간 표에서 강의실별 빈 칸을 칠한다. 다른 보기에서는 누를 수 없다 */
  freeOn?: boolean;
  freeAvailable?: boolean;
  onPeriodChange: (period: PersonPeriod) => void;
  onTargetChange: (target: ScheduleTarget) => void;
  onFiltersChange: (filters: ScheduleFilters) => void;
  onDateChange: (date: string) => void;
  onStep: (dir: -1 | 1) => void;
  onToday: () => void;
  onFreeToggle?: () => void;
  onRoomColumnsToggle?: () => void;
  onExport: () => void;
}

/** §07~§11이 공유하는 두 줄 도구줄. native select/button으로 키보드 조작 경로를 보존한다. */
export function ScheduleToolbar({
  period, target, filters, meta, roomColumnsOn = false, roomColumnsAvailable = false, showAccounting = false,
  exporting = false, date, axisLabel, freeOn = false, freeAvailable = false,
  onPeriodChange, onTargetChange, onFiltersChange, onDateChange, onStep, onToday, onFreeToggle, onRoomColumnsToggle, onExport,
}: ScheduleToolbarProps) {
  const change = <K extends keyof ScheduleFilters>(key: K, value: ScheduleFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };
  // 강사 배정 축은 서버 Meta의 staff 후보를 그대로 쓴다. 직급 문자열로 권한/배정 가능성을 재판정하지 않는다.
  const staff = meta?.staff ?? [];

  const filtered = activeFilterCount(filters) > 0;

  return (
    <section aria-label="스케줄 도구" className="mb-3 rounded-xl border border-line bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* 원문 §07 필터 칩 [전체 · 학생 · 구성원 · 강의실 · 줌 계정] — 「전체」는 좁힌 것을 모두 푼다 */}
        <Button size="sm" variant={filtered ? 'secondary' : 'dark'} aria-label="필터 초기화"
          onClick={() => onFiltersChange({
            ...INITIAL_SCHEDULE_FILTERS, density: filters.density, display: filters.display,
          })}>
          전체
        </Button>
        <Select aria-label="수업 종류 필터" value={filters.kindKey ?? ''}
          onChange={(event) => change('kindKey', event.target.value || null)}
          className="!h-8 !w-auto min-w-[96px] text-[12px]">
          <option value="">종류 전체</option>
          {(meta?.kinds ?? []).map((kind) => <option key={kind.key} value={kind.key}>{kind.name}</option>)}
        </Select>
        <Select aria-label="과목 필터" value={filters.subKey ?? ''}
          onChange={(event) => change('subKey', event.target.value || null)}
          className="!h-8 !w-auto min-w-[96px] text-[12px]">
          <option value="">과목 전체</option>
          {(meta?.subs ?? []).map((subject) => <option key={subject.key} value={subject.key}>{subject.name}</option>)}
        </Select>
        <Select aria-label="학생 필터" value={filters.studentId ?? ''}
          onChange={(event) => change('studentId', optionalNumber(event.target.value))}
          className="!h-8 !w-auto min-w-[96px] text-[12px]">
          <option value="">학생 전체</option>
          {(meta?.students ?? []).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
        </Select>
        {/* 원문 낱말 「구성원」 — 회차의 담당(강사 칸)으로 좁힌다 */}
        <Select aria-label="구성원 필터" value={filters.teacherId ?? ''}
          onChange={(event) => change('teacherId', optionalNumber(event.target.value))}
          className="!h-8 !w-auto min-w-[96px] text-[12px]">
          <option value="">구성원 전체</option>
          {staff.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </Select>
        <Select aria-label="강의실 필터" value={filters.roomId ?? ''}
          onChange={(event) => change('roomId', optionalNumber(event.target.value))}
          className="!h-8 !w-auto min-w-[96px] text-[12px]">
          <option value="">강의실 전체</option>
          {(meta?.rooms ?? []).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
        </Select>
        <Select aria-label="줌 계정 필터" value={filters.zaccId ?? ''}
          onChange={(event) => change('zaccId', optionalNumber(event.target.value))}
          className="!h-8 !w-auto min-w-[96px] text-[12px]">
          <option value="">줌 계정 전체</option>
          {(meta?.zaccs ?? []).map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
        </Select>

        <div className="h-6 w-px bg-line" aria-hidden />
        <Segmented ariaLabel="스케줄 기간" options={SCHEDULE_PERIODS} value={period} onChange={onPeriodChange} />
        <Segmented ariaLabel="스케줄 대상" options={SCHEDULE_TARGETS} value={target} onChange={onTargetChange} />

        {/* 원문 §07 「세로선 나누기」 = 강의실 열 켜기/끄기 (N-80 · g1 §07 #2·#14) — 표 나누기(분할)는 사이드바의 일이다 */}
        {onRoomColumnsToggle ? (
          <Button size="sm" variant={roomColumnsOn && roomColumnsAvailable ? 'dark' : 'secondary'}
            aria-pressed={roomColumnsOn && roomColumnsAvailable} disabled={!roomColumnsAvailable}
            title={roomColumnsAvailable
              ? (roomColumnsOn ? '강의실 열을 걷고 날짜 한 열로 봅니다' : '일간 표를 강의실 열로 나눕니다')
              : '일간 표에서 강의실 열로 나눕니다 — 일간을 고르세요'}
            onClick={onRoomColumnsToggle}>
            <Columns3 size={14} aria-hidden />세로선 나누기
          </Button>
        ) : null}
        <Segmented ariaLabel="블록 색" options={DISPLAYS} value={filters.display} onChange={(value) => change('display', value)} />
        <Segmented ariaLabel="수업 방식" options={MODES} value={filters.mode} onChange={(value) => change('mode', value)} />

        {/* 원문 §07 도구줄 오른쪽 날짜 — 임의 날짜로 바로 간다. 기간·대상은 그대로 두고 날짜만 옮긴다 */}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" aria-label="이전 기간" onClick={() => onStep(-1)}>‹</Button>
          <Input type="date" aria-label="날짜" value={date} required
            onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onDateChange(event.target.value); }}
            className="!h-8 !w-[150px] text-[12px]" />
          <Button size="sm" aria-label="다음 기간" onClick={() => onStep(1)}>›</Button>
          <Button size="sm" onClick={onToday}>오늘</Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <span className="text-[11px] font-bold text-fg-subtle">밀도</span>
        <Segmented ariaLabel="스케줄 밀도" options={DENSITIES} value={filters.density} onChange={(value) => change('density', value)} />
        {onFreeToggle ? (
          <Button size="sm" variant={freeOn && freeAvailable ? 'dark' : 'secondary'} aria-pressed={freeOn && freeAvailable}
            disabled={!freeAvailable}
            title={freeAvailable ? '일간 표에서 강의실마다 수업이 없는 30분 칸을 칠합니다'
              : '일간 표(전체 대상)를 「세로선 나누기」로 강의실 열로 나눈 뒤 강의실별로 칠합니다'}
            onClick={onFreeToggle}>
            <Plus size={14} aria-hidden />빈 시간 찾기
          </Button>
        ) : null}
        {/* 원문 §07 둘째 줄 「≡ 회계」 — 이미 있는 회계 탭으로 간다(N-100). 들어갈 수 있는 사람에게만 선다 */}
        {showAccounting ? (
          <LinkButton size="sm" href="/accounting" title="회계 탭으로 갑니다">
            <Menu size={14} aria-hidden />회계
          </LinkButton>
        ) : null}
        {axisLabel ? (
          <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[12px] font-bold text-fg-2"
            title="표의 시간 축 — 09~22 기본에 실제 수업이 있으면 그 정시까지 넓힙니다(접지 않습니다)">
            <Clock size={14} aria-hidden />{axisLabel}
          </span>
        ) : null}
        <Button size="sm" className="ml-auto" disabled={exporting} onClick={onExport}
          aria-label="현재 스케줄을 PNG로 저장">
          <Download size={14} aria-hidden />{exporting ? '저장 중…' : 'PNG'}
        </Button>
      </div>
    </section>
  );
}
