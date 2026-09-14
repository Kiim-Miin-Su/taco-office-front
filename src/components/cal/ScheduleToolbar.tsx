/** @file-guide
 * 목적: §07~§11 스케줄 보기·표시 필터·밀도·PNG 진입을 한 도구줄로 통일한다.
 * 책임/재사용: 서버가 준 Occurrence/Meta 사실만 순수 selector로 투영한다. 조회·권한·업무 판정·다운로드 구현은 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { Download, SplitSquareHorizontal } from 'lucide-react';
import type { Meta, Occurrence } from '@/api/types';
import type { View } from '@/lib/calendar';
import { Button, Segmented, Select } from '@/components/ui';

export type ScheduleModeFilter = 'all' | Occurrence['mode'];
export type ScheduleDensity = 'normal' | 'compact' | 'wide';

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
  density: ScheduleDensity;
}

export const INITIAL_SCHEDULE_FILTERS: ScheduleFilters = {
  mode: 'all',
  kindKey: null,
  subKey: null,
  teacherId: null,
  studentId: null,
  roomId: null,
  density: 'normal',
};

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
  ));
}

export const SCHEDULE_VIEWS: Array<{ value: View; label: string }> = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'student', label: '학생별' },
  { value: 'teacher', label: '선생님별' },
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
  view: View;
  filters: ScheduleFilters;
  meta?: Meta;
  splitOn: boolean;
  exporting?: boolean;
  onViewChange: (view: View) => void;
  onFiltersChange: (filters: ScheduleFilters) => void;
  onSplit: () => void;
  onExport: () => void;
}

/** §07~§11이 공유하는 두 줄 도구줄. native select/button으로 키보드 조작 경로를 보존한다. */
export function ScheduleToolbar({
  view, filters, meta, splitOn, exporting = false, onViewChange, onFiltersChange, onSplit, onExport,
}: ScheduleToolbarProps) {
  const change = <K extends keyof ScheduleFilters>(key: K, value: ScheduleFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };
  // 강사 배정 축은 서버 Meta의 staff 후보를 그대로 쓴다. 직급 문자열로 권한/배정 가능성을 재판정하지 않는다.
  const staff = meta?.staff ?? [];

  return (
    <section aria-label="스케줄 도구" className="mb-3 rounded-xl border border-line bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sr-only">보기</span>
        <Segmented ariaLabel="스케줄 보기" options={SCHEDULE_VIEWS} value={view} onChange={onViewChange} />

        <div className="h-6 w-px bg-line" aria-hidden />
        <Select aria-label="수업 종류 필터" value={filters.kindKey ?? ''}
          onChange={(event) => change('kindKey', event.target.value || null)}
          className="!h-8 !w-auto min-w-[104px] text-[12px]">
          <option value="">종류 전체</option>
          {(meta?.kinds ?? []).map((kind) => <option key={kind.key} value={kind.key}>{kind.name}</option>)}
        </Select>
        <Select aria-label="과목 필터" value={filters.subKey ?? ''}
          onChange={(event) => change('subKey', event.target.value || null)}
          className="!h-8 !w-auto min-w-[104px] text-[12px]">
          <option value="">과목 전체</option>
          {(meta?.subs ?? []).map((subject) => <option key={subject.key} value={subject.key}>{subject.name}</option>)}
        </Select>
        <Select aria-label="강사 필터" value={filters.teacherId ?? ''}
          onChange={(event) => change('teacherId', optionalNumber(event.target.value))}
          className="!h-8 !w-auto min-w-[104px] text-[12px]">
          <option value="">강사 전체</option>
          {staff.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </Select>
        <Select aria-label="학생 필터" value={filters.studentId ?? ''}
          onChange={(event) => change('studentId', optionalNumber(event.target.value))}
          className="!h-8 !w-auto min-w-[104px] text-[12px]">
          <option value="">학생 전체</option>
          {(meta?.students ?? []).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
        </Select>
        <Select aria-label="강의실 필터" value={filters.roomId ?? ''}
          onChange={(event) => change('roomId', optionalNumber(event.target.value))}
          className="!h-8 !w-auto min-w-[104px] text-[12px]">
          <option value="">강의실 전체</option>
          {(meta?.rooms ?? []).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
        </Select>

        <Button size="sm" variant={splitOn ? 'dark' : 'secondary'} onClick={onSplit}>
          <SplitSquareHorizontal size={14} aria-hidden />{splitOn ? '분할 해제' : '세로로 나누기'}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <span className="text-[11px] font-bold text-fg-subtle">표시</span>
        <Segmented ariaLabel="수업 방식" options={MODES} value={filters.mode} onChange={(value) => change('mode', value)} />
        <span className="ml-1 text-[11px] font-bold text-fg-subtle">밀도</span>
        <Segmented ariaLabel="스케줄 밀도" options={DENSITIES} value={filters.density} onChange={(value) => change('density', value)} />
        <Button size="sm" className="ml-auto" disabled={exporting} onClick={onExport}
          aria-label="현재 스케줄을 PNG로 저장">
          <Download size={14} aria-hidden />{exporting ? '저장 중…' : 'PNG'}
        </Button>
      </div>
    </section>
  );
}
