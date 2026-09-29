/** @file-guide
 * 목적: §07~§11 공용 도구줄의 필터 projection과 접근 가능한 입력 계약을 회귀 검증한다.
 * 책임/재사용: 실제 ScheduleToolbar/selector를 사용하며 화면 필터 규칙을 테스트에 다시 구현하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Meta, Occurrence } from '@/api/types';
import {
  activeFilterCount, filterScheduleOccurrences, INITIAL_SCHEDULE_FILTERS, ScheduleToolbar,
  type ScheduleFilters,
} from './ScheduleToolbar';

afterEach(cleanup);

const meta: Meta = {
  kinds: [{ key: 'class', name: '수업', color: '#123456', cap: 4, grp: 'lesson', rep: true, extra: false }],
  subs: [{ key: 'writing', name: 'Writing', color: '#654321' }],
  rooms: [{ id: 7, name: '강의실 7', branch: '본원' }], zaccs: [{ id: 5, label: 'TN Zoom 1' }], invTypes: [], cancelReasons: [], cancelTreats: [], lateReportTiers: [], teacherPolicies: [],
  genders: [{ key: 'female', label: '여' }, { key: 'male', label: '남' }],
  students: [{ id: 3, name: '학생 3', tag: null, label: '학생 3' }],
  staff: [
    { id: 11, name: '강사 11', role: 'teacher', canAdminPage: false, canGpaPack: false },
    { id: 12, name: '관리자 12', role: 'admin', canAdminPage: true, canGpaPack: true },
  ],
};

function occurrence(patch: Partial<Occurrence> = {}): Occurrence {
  return {
    serId: 1, date: '2026-09-14', onDate: '2026-09-14', startMin: 600, endMin: 660,
    kindKey: 'class', subKey: 'writing', teacherId: 11, roomId: 7, mode: 'offline',
    canceled: false, hasException: false, recurring: false, repState: 'plan', ended: false, written: false, extra: false,
    attendanceMode: 'unavailable', attendance: null,
    students: [{ id: 3, name: '학생 3', droppedOnce: false, paused: false, late: false }],
    ...patch,
  };
}

describe('filterScheduleOccurrences', () => {
  it('서버 회차를 방식·종류·과목·강사·학생·강의실 축으로만 교집합 투영한다', () => {
    const target = occurrence();
    const filters: ScheduleFilters = {
      ...INITIAL_SCHEDULE_FILTERS,
      mode: 'offline', kindKey: 'class', subKey: 'writing', teacherId: 11, studentId: 3, roomId: 7,
    };
    const misses = [
      occurrence({ serId: 2, mode: 'online' }),
      occurrence({ serId: 3, kindKey: 'meeting' }),
      occurrence({ serId: 4, subKey: 'math' }),
      occurrence({ serId: 5, teacherId: 99 }),
      occurrence({ serId: 6, students: [{ id: 4, name: '학생 4', droppedOnce: false, paused: false, late: false }] }),
      occurrence({ serId: 7, roomId: 8 }),
    ];

    expect(filterScheduleOccurrences([target, ...misses], filters)).toEqual([target]);
  });

  it('그날만 제외된 학생은 학생 필터 결과에 포함하지 않고 서버 사실은 변경하지 않는다', () => {
    const dropped = occurrence({ students: [{ id: 3, name: '학생 3', droppedOnce: true, paused: false, late: false }] });
    const filters = { ...INITIAL_SCHEDULE_FILTERS, studentId: 3 };

    expect(filterScheduleOccurrences([dropped], filters)).toEqual([]);
    expect(dropped.students[0].droppedOnce).toBe(true);
  });
});

it('공용 도구줄은 native 입력과 기존 버튼으로 모든 제어값을 상위 상태에 위임한다', () => {
  const onFiltersChange = vi.fn();
  const onPeriodChange = vi.fn();
  const onTargetChange = vi.fn();
  const onDateChange = vi.fn();
  const onStep = vi.fn();
  const onToday = vi.fn();
  const onRoomColumnsToggle = vi.fn();
  const onExport = vi.fn();
  const view = render(
    <ScheduleToolbar period="day" target="all" date="2026-09-14" filters={INITIAL_SCHEDULE_FILTERS} meta={meta}
      roomColumnsOn={false} roomColumnsAvailable
      onPeriodChange={onPeriodChange} onTargetChange={onTargetChange} onFiltersChange={onFiltersChange}
      onDateChange={onDateChange} onStep={onStep} onToday={onToday} onRoomColumnsToggle={onRoomColumnsToggle} onExport={onExport} />,
  );

  // 원문 §07 — 보기 축이 둘이다: [일간 · 주간 · 월간] + [전체 · 학생별 · 선생님별]
  fireEvent.click(within(view.getByRole('group', { name: '스케줄 기간' })).getByRole('button', { name: '주간' }));
  expect(onPeriodChange).toHaveBeenCalledWith('week');
  fireEvent.click(within(view.getByRole('group', { name: '스케줄 대상' })).getByRole('button', { name: '학생별' }));
  expect(onTargetChange).toHaveBeenCalledWith('student');

  // 원문 낱말 「구성원」 — 담당(강사 칸)으로 좁힌다
  const teacher = view.getByRole('combobox', { name: '구성원 필터' });
  expect(teacher.tagName).toBe('SELECT');
  expect(view.getByRole('option', { name: '관리자 12' })).toBeTruthy();
  fireEvent.change(view.getByRole('combobox', { name: '수업 종류 필터' }), { target: { value: 'class' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, kindKey: 'class' });
  fireEvent.change(view.getByRole('combobox', { name: '과목 필터' }), { target: { value: 'writing' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, subKey: 'writing' });
  fireEvent.change(teacher, { target: { value: '11' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, teacherId: 11 });
  fireEvent.change(view.getByRole('combobox', { name: '학생 필터' }), { target: { value: '3' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, studentId: 3 });
  fireEvent.change(view.getByRole('combobox', { name: '강의실 필터' }), { target: { value: '7' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, roomId: 7 });
  fireEvent.change(view.getByRole('combobox', { name: '줌 계정 필터' }), { target: { value: '5' } });
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, zaccId: 5 });

  fireEvent.click(view.getByRole('button', { name: '온라인' }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, mode: 'online' });
  // 밀도 기본은 원문 캡처의 「촘촘」이다
  expect(INITIAL_SCHEDULE_FILTERS.density).toBe('compact');
  fireEvent.click(view.getByRole('button', { name: '보통' }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, density: 'normal' });
  // [일정 · 리포트] — 블록 색이 말하는 것만 바꾼다
  fireEvent.click(view.getByRole('button', { name: '리포트' }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, display: 'report' });

  // 원문 §07 오른쪽 날짜 칸 — 임의 날짜로 바로 간다 · ‹ › 오늘
  fireEvent.change(view.getByLabelText('날짜'), { target: { value: '2026-10-02' } });
  expect(onDateChange).toHaveBeenCalledWith('2026-10-02');
  fireEvent.click(view.getByRole('button', { name: '이전 기간' }));
  fireEvent.click(view.getByRole('button', { name: '다음 기간' }));
  fireEvent.click(view.getByRole('button', { name: '오늘' }));
  expect(onStep.mock.calls).toEqual([[-1], [1]]);
  expect(onToday).toHaveBeenCalledOnce();

  // 원문 §07 「세로선 나누기」 = 강의실 열 켜기/끄기(N-80) — 표 나누기(분할)는 도구줄에 없다
  expect(view.queryByRole('button', { name: '세로로 나누기' })).toBeNull();
  const columns = view.getByRole('button', { name: '세로선 나누기' });
  expect(columns.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(columns);
  fireEvent.click(view.getByRole('button', { name: '현재 스케줄을 PNG로 저장' }));
  expect(onRoomColumnsToggle).toHaveBeenCalledOnce();
  expect(onExport).toHaveBeenCalledOnce();
});

describe('원문 §07 둘째 줄 — 세로선 나누기 · 빈 시간 찾기 · ≡ 회계 (W11)', () => {
  const base = {
    date: '2026-09-14', filters: INITIAL_SCHEDULE_FILTERS, meta,
    onPeriodChange: vi.fn(), onTargetChange: vi.fn(), onFiltersChange: vi.fn(), onDateChange: vi.fn(),
    onStep: vi.fn(), onToday: vi.fn(), onExport: vi.fn(), onRoomColumnsToggle: vi.fn(), onFreeToggle: vi.fn(),
  };

  it('강의실 열이 뜻을 갖지 않는 보기에서는 세로선 나누기를 누를 수 없고 까닭을 적는다', () => {
    const view = render(<ScheduleToolbar {...base} period="week" target="all" roomColumnsOn roomColumnsAvailable={false} />);
    const columns = view.getByRole('button', { name: '세로선 나누기' }) as HTMLButtonElement;
    expect(columns.disabled).toBe(true);
    // 켜 둔 값이 남아 있어도 누를 수 없는 보기에서는 눌린 모양으로 서지 않는다
    expect(columns.getAttribute('aria-pressed')).toBe('false');
    expect(columns.title).toContain('일간');
  });

  it('빈 시간 찾기는 강의실 열이 섰을 때만 — 아니면 까닭(세로선 나누기)을 적는다', () => {
    const view = render(<ScheduleToolbar {...base} period="day" target="all" freeOn freeAvailable={false} />);
    const free = view.getByRole('button', { name: '빈 시간 찾기' }) as HTMLButtonElement;
    expect(free.disabled).toBe(true);
    expect(free.getAttribute('aria-pressed')).toBe('false');
    expect(free.title).toContain('세로선 나누기');
  });

  it('「≡ 회계」는 부르는 쪽이 준 경로 권한일 때만 서고 기존 회계 탭으로 간다 (N-100)', () => {
    const hidden = render(<ScheduleToolbar {...base} period="day" target="all" />);
    expect(hidden.queryByRole('link', { name: '회계' })).toBeNull();
    hidden.unmount();
    const view = render(<ScheduleToolbar {...base} period="day" target="all" showAccounting />);
    expect(view.getByRole('link', { name: '회계' }).getAttribute('href')).toBe('/accounting');
  });
});

it('「전체」 필터 칩은 좁힌 축을 모두 풀되 밀도·블록 색은 그대로 둔다', () => {
  const onFiltersChange = vi.fn();
  const narrowed: ScheduleFilters = {
    ...INITIAL_SCHEDULE_FILTERS, mode: 'online', roomId: 7, zaccId: 5, density: 'wide', display: 'report',
  };
  expect(activeFilterCount(narrowed)).toBe(3);
  const view = render(
    <ScheduleToolbar period="week" target="all" date="2026-09-14" filters={narrowed} meta={meta}
      onPeriodChange={vi.fn()} onTargetChange={vi.fn()} onFiltersChange={onFiltersChange}
      onDateChange={vi.fn()} onStep={vi.fn()} onToday={vi.fn()} onExport={vi.fn()} />,
  );
  fireEvent.click(view.getByRole('button', { name: '필터 초기화' }));
  expect(onFiltersChange).toHaveBeenLastCalledWith({ ...INITIAL_SCHEDULE_FILTERS, density: 'wide', display: 'report' });
});

it('줌 계정 필터는 회차의 줌 계정으로만 좁힌다', () => {
  const online = occurrence({ serId: 8, mode: 'online', zaccId: 5 });
  const other = occurrence({ serId: 9, mode: 'online', zaccId: 6 });
  expect(filterScheduleOccurrences([online, other], { ...INITIAL_SCHEDULE_FILTERS, zaccId: 5 })).toEqual([online]);
});

it('N-137 — 학생 필터의 선택지는 서버가 붙인 꼬리 이름(label)을 그대로 적는다(같은 이름 둘을 가른다)', () => {
  const twins: Meta = {
    ...meta,
    students: [
      { id: 21, name: '김하윤', grade: 'G8', school: '채드윅', tag: 'G8 · 채드윅', label: '김하윤 · G8 · 채드윅' },
      { id: 22, name: '김하윤', grade: 'G8', school: '역삼중', tag: 'G8 · 역삼중', label: '김하윤 · G8 · 역삼중' },
    ],
  };
  const view = render(
    <ScheduleToolbar period="day" target="all" date="2026-09-14" filters={INITIAL_SCHEDULE_FILTERS} meta={twins}
      roomColumnsOn={false} roomColumnsAvailable
      onPeriodChange={vi.fn()} onTargetChange={vi.fn()} onFiltersChange={vi.fn()}
      onDateChange={vi.fn()} onStep={vi.fn()} onToday={vi.fn()} onRoomColumnsToggle={vi.fn()} onExport={vi.fn()} />,
  );
  const picker = within(view.getByRole('combobox', { name: '학생 필터' }));
  expect(picker.getAllByRole('option').map((o) => o.textContent)).toEqual(['학생 전체', '김하윤 · G8 · 채드윅', '김하윤 · G8 · 역삼중']);
});
