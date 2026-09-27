/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { useDndContext, type DndContextProps, type DragEndEvent } from '@dnd-kit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Meta, Occurrence } from '@/api/types';
import { KO_DOW, dowOf, monthGrid } from '@/lib/calendar';
import { useWorkspace } from '@/store/useWorkspace';

const mocks = vi.hoisted(() => ({
  occurrences: vi.fn(), write: vi.fn(), meta: vi.fn(), detail: vi.fn(), drawerWrite: vi.fn(), drawer: vi.fn(),
  download: vi.fn(), conflicts: vi.fn(), draft: vi.fn(), holidays: vi.fn(), unav: vi.fn(),
  seriesCounts: vi.fn(), studentBooks: vi.fn(), conflictPreview: vi.fn(), teacherGuides: vi.fn(),
  permissions: { canAdminPage: true, canCrudAll: true } as Record<string, boolean>,
  /** 경로 권한 판정(canAccessAppRoute)이 읽는 사용자 — 기본은 없음(null) */
  me: null as Record<string, unknown> | null,
  drag: null as DndContextProps | null,
  context: null as ReturnType<typeof useDndContext> | null,
}));
const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return { ...actual, DndContext: (props: DndContextProps) => {
    mocks.drag = props;
    return <actual.DndContext {...props}><DndProbe />{props.children}</actual.DndContext>;
  } };
});
function DndProbe() {
  mocks.context = useDndContext();
  return null;
}
vi.mock('@/store/useSession', () => ({
  useCan: (key: string) => mocks.permissions[key] ?? false,
  // 사이드바 [관리] 판정(canAccessAppRoute)만 읽는다 — 셸은 목이라 사이드바가 그려지지 않는다
  useSession: (select: (s: { me: unknown }) => unknown) => select({ me: mocks.me }),
}));
// 셸은 목이지만 사이드 패널은 그린다 — 전체 표의 「가능 시간」 단추는 사이드바에만 있다(기본 접힘이면 그리지 않는다)
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children, drawerEntry, sidePanel }: {
  children: ReactNode; drawerEntry?: { pane: string; identity: string } | null;
  sidePanel?: (api: { openDrawer: () => void }) => ReactNode;
}) => (
  <div data-drawer-entry={drawerEntry ? `${drawerEntry.pane}:${drawerEntry.identity}` : undefined}>
    {sidePanel ? sidePanel({ openDrawer: () => undefined }) : null}
    {children}
  </div>
) }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/cal/SessionEditor', () => ({ SessionEditor: ({ draft }: { draft: unknown }) => {
  mocks.draft(draft); return null;
} }));
vi.mock('@/components/cal/TeacherSchedule', () => ({ TeacherSchedule: () => <div>오늘 수업</div> }));
vi.mock('@/components/lesson/LessonDetail', () => ({ LessonDetail: ({ occ }: { occ: Occurrence | null }) => {
  mocks.detail(occ); return null;
} }));
vi.mock('@/api/queries', () => ({
  useOccurrences: mocks.occurrences,
  useScheduleWrite: () => ({ mutate: mocks.write }),
  // 셸의 되돌리기 한 단추가 결재 되돌리기(§14 · N-84)도 탄다 — 이 파일은 스케줄 쓰기만 본다
  useApprovalUndo: () => ({ mutate: vi.fn(), isPending: false }),
  useHorizon: () => ({ data: { from: '2026-01-01', to: '2026-12-31' } }),
  useMeta: mocks.meta,
  useDrawer: mocks.drawer,
  // §11 To-Do 띠의 「+ 주기」 — 서랍과 같은 쓰기 훅이다
  useDrawerWrite: () => ({ mutate: mocks.drawerWrite, isPending: false }),
  fetchConflicts: mocks.conflicts,
  // 409 뒤 설명 — 누구와 + 그 시각 비어 있는 자원 한 줄(N-70)
  fetchConflictPreview: mocks.conflictPreview,
  // §11 「안내 N」 — 서버가 센 수 (N-100)
  useScheduleTeacherGuides: mocks.teacherGuides,
  // 공휴일 이름표 · 강사 불가 시간(관리자 읽기) — 서버 표에서 읽는다 (wave5 · §09 #2 · G37)
  useScheduleHolidays: mocks.holidays,
  useScheduleUnavailable: mocks.unav,
  // §07 사이드바 일정 원본 수 · §10 개인 머리 「교재 없음」 — 서버가 센다 (wave 6)
  useScheduleSeriesCounts: mocks.seriesCounts,
  useStudentBooks: mocks.studentBooks,
}));
vi.mock('@/lib/png-export', () => ({ downloadElementPng: mocks.download }));

import SchedulePage from './page';

const meta: Meta = {
  kinds: [{ key: 'class', name: '수업', color: '#654321', cap: 4, grp: 'lesson', rep: true, extra: false }],
  subs: [{ key: 'writing', name: 'Writing', color: '#123456' }], rooms: [], zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [], lateReportTiers: [], teacherPolicies: [],
  genders: [{ key: 'female', label: '여' }, { key: 'male', label: '남' }],
  students: [{ id: 1, name: '선택 학생', grade: 'G10', gender: 'female' }, { id: 2, name: '다른 학생' }],
  staff: [
    { id: 11, name: '선택 강사', role: 'teacher', canAdminPage: false, canGpaPack: false },
    { id: 22, name: '다른 강사', role: 'teacher', canAdminPage: false, canGpaPack: false },
  ],
};

const items: Occurrence[] = [1, 2].map((id) => ({
  serId: id, date: '2026-09-01', onDate: '2026-09-01', startMin: 600 + id * 60,
  endMin: 660 + id * 60, kindKey: 'class', title: id === 1 ? '선택된 수업' : '다른 수업',
  teacherId: id * 11, mode: 'offline', canceled: false, hasException: false, recurring: false,
  repState: 'plan', ended: false, written: false, extra: false, attendanceMode: 'unavailable', attendance: null,
  students: [{ id, name: id === 1 ? '선택 학생' : '다른 학생', droppedOnce: false, paused: false }],
}));

beforeEach(() => {
  nav.search = '';
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
  mocks.occurrences.mockReturnValue({ data: { items }, isLoading: false, isError: false });
  mocks.meta.mockReturnValue({ data: meta });
  mocks.download.mockResolvedValue(undefined);
  mocks.conflicts.mockResolvedValue([]);
  mocks.conflictPreview.mockResolvedValue({ conflicts: [], freeLine: null });
  mocks.me = null;
  mocks.teacherGuides.mockReturnValue({ data: undefined });
  mocks.holidays.mockReturnValue({ data: { items: [] } });
  mocks.unav.mockReturnValue({ data: { items: [] }, isLoading: false });
  mocks.seriesCounts.mockReturnValue({ data: undefined });
  mocks.studentBooks.mockReturnValue({ data: undefined });
  mocks.drawer.mockReturnValue({ data: { approvals: { count: 0 }, notis: [], todos: [] } });
  mocks.drawerWrite.mockReset();
  mocks.permissions.canAdminPage = true;
  mocks.permissions.canCrudAll = true;
  mocks.permissions.canMoney = false;
});

it('변경 요청 deep link는 기존 chreqs 서랍 진입을 식별한다', () => {
  nav.search = 'changeRequest=52';
  const view = render(<SchedulePage />);
  expect(view.container.querySelector('[data-drawer-entry]')?.getAttribute('data-drawer-entry'))
    .toBe('chreqs:change-request-52');
});

it('리포트 일정 deep link는 검증된 SER·원래 날짜가 실제 조회 행과 일치할 때만 상세를 연다', () => {
  nav.search = 'serId=1&onDate=2026-09-01&date=2026-09-01';
  render(<SchedulePage />);
  expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-01' });
  expect(mocks.detail).toHaveBeenLastCalledWith(items[0]);
});

it('잘못된 리포트 일정 identity는 상세을 열지 않는다', () => {
  nav.search = 'serId=01&onDate=2026-99-99&date=2026-09-01';
  render(<SchedulePage />);
  expect(mocks.detail).toHaveBeenLastCalledWith(null);
});

it('같은 schedule route에서 다른 리포트 deep link로 이동해도 실제 날짜 조회와 상세를 교체한다', () => {
  nav.search = 'serId=1&onDate=2026-09-01&date=2026-09-01';
  const view = render(<SchedulePage />);
  expect(mocks.detail).toHaveBeenLastCalledWith(items[0]);

  const next = { ...items[1], date: '2026-09-02', onDate: '2026-09-02' };
  nav.search = 'serId=2&onDate=2026-09-02&date=2026-09-02';
  mocks.occurrences.mockReturnValue({ data: { items: [next] }, isLoading: false, isError: false });
  view.rerender(<SchedulePage />);

  expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-02', to: '2026-09-02' });
  expect(mocks.detail).toHaveBeenLastCalledWith(next);
});

it('유효한 상세 뒤 존재하지 않는 identity로 이동하면 이전 상세를 즉시 닫는다', () => {
  nav.search = 'serId=1&onDate=2026-09-01&date=2026-09-01';
  const view = render(<SchedulePage />);
  expect(mocks.detail).toHaveBeenLastCalledWith(items[0]);

  nav.search = 'serId=999&onDate=2026-09-02&date=2026-09-02';
  mocks.occurrences.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false });
  view.rerender(<SchedulePage />);
  expect(mocks.detail).toHaveBeenLastCalledWith(null);
});

it('학생 카드 시간표 deep link는 추가 API 없이 해당 학생의 개인 주간표를 연다', () => {
  nav.search = 'studentId=1';
  const view = render(<SchedulePage />);

  expect(view.getAllByText('선택 학생').length).toBeGreaterThan(0);
  expect(view.getByRole('button', { name: /선택된 수업/ })).toBeTruthy();
  expect(view.queryByRole('button', { name: /다른 수업/ })).toBeNull();
  expect(mocks.occurrences.mock.calls.every(([params]) => (
    params.from === '2026-08-31' && params.to === '2026-09-06'
  ))).toBe(true);
});

describe('§07~§11 공용 도구줄', () => {
  it('표시 필터는 추가 GET 없이 현재 occurrence 응답만 좁히고 초기화하면 같은 행을 복원한다', () => {
    const online = { ...items[1], mode: 'online' as const };
    mocks.occurrences.mockReturnValue({ data: { items: [items[0], online] }, isLoading: false, isError: false });
    const view = render(<SchedulePage />);

    fireEvent.click(view.getByRole('button', { name: '온라인' }));
    expect(view.queryByRole('button', { name: /선택된 수업/ })).toBeNull();
    expect(view.getByRole('button', { name: /다른 수업/ })).toBeTruthy();
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-01' });

    // [전체 · 현장 · 온라인] 의 「전체」 — 대상 축에도 「전체」가 있어 무리 안에서 누른다
    fireEvent.click(within(view.getByRole('group', { name: '수업 방식' })).getByRole('button', { name: '전체' }));
    expect(view.getByRole('button', { name: /선택된 수업/ })).toBeTruthy();
    expect(view.getByRole('button', { name: /다른 수업/ })).toBeTruthy();
    expect(mocks.occurrences.mock.calls.every(([params]) => (
      params.from === '2026-09-01' && params.to === '2026-09-01'
    ))).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('select에서 누른 Ctrl/⌘ 단축키는 앱 클립보드로 가로채지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: /선택된 수업/ }), { ctrlKey: true });
    const select = view.getByRole('combobox', { name: '과목 필터' });
    select.focus();
    fireEvent.keyDown(select, { key: 'c', ctrlKey: true });

    expect(view.queryByText('1건 복사됨')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
    expect(view.getByText('1건 복사됨')).toBeTruthy();
  });

  it('관리 화면 권한이 없으면 관리자 도구줄·전체 occurrence 조회 없이 강사 오늘 목록만 렌더한다', () => {
    mocks.permissions.canAdminPage = false;
    const view = render(<SchedulePage />);

    expect(view.getByText('오늘 수업')).toBeTruthy();
    expect(view.queryByRole('region', { name: '스케줄 도구' })).toBeNull();
    expect(mocks.occurrences).not.toHaveBeenCalled();
  });

  it('PNG 버튼은 현재 표 DOM과 안정된 파일명을 공용 내보내기 함수에 전달한다', async () => {
    const view = render(<SchedulePage />);
    await act(async () => fireEvent.click(view.getByRole('button', { name: '현재 스케줄을 PNG로 저장' })));

    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.download.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
    expect(mocks.download.mock.calls[0][1]).toBe('2026-09-01-day-schedule.png');
  });
});

describe('관리자 모든 보기의 과목색·하단 범례 공유', () => {
  it('열린 상세는 최신 출결 판정을 따르고 목록에서 사라진 회차 snapshot을 복원하지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: /선택된 수업/ }));
    expect(mocks.detail).toHaveBeenLastCalledWith(items[0]);
    const latest = { ...items[0], canceled: true, attendanceMode: 'unavailable' };
    mocks.occurrences.mockReturnValue({ data: { items: [latest, items[1]] }, isLoading: false });
    view.rerender(<SchedulePage />);
    expect(mocks.detail).toHaveBeenLastCalledWith(latest);
    mocks.occurrences.mockReturnValue({ data: { items: [items[1]] }, isLoading: false });
    view.rerender(<SchedulePage />);
    expect(mocks.detail).toHaveBeenLastCalledWith(null);
  });
  it.each(['일간', '주간', '월간', '학생별', '선생님별'])('%s에서도 Meta 과목색을 블록과 범례에 동일하게 전달한다', (viewName) => {
    mocks.occurrences.mockReturnValue({ data: { items: [{ ...items[0], subKey: 'writing' }] }, isLoading: false });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: viewName }));
    if (viewName === '학생별') fireEvent.click(view.getByRole('button', { name: /^선택 학생/ }));
    if (viewName === '선생님별') fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));
    const block = view.getByRole('button', { name: /Writing/ });
    const legend = view.getByRole('group', { name: '시간표 범례' });
    expect(block.style.getPropertyValue('--event-color')).toBe('#123456');
    expect(within(legend).getByText('Writing').style.getPropertyValue('--event-color')).toBe('#123456');
    expect(block.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('Meta 로딩 때는 안전 토큰을 쓰고 응답/사용자색 갱신은 블록과 범례에 함께 반영한다', () => {
    mocks.occurrences.mockReturnValue({ data: { items: [{ ...items[0], subKey: 'writing' }] }, isLoading: false });
    mocks.meta.mockReturnValue({ isLoading: true });
    const view = render(<SchedulePage />);
    expect(view.getByRole('button', { name: /선택된 수업/ }).style.getPropertyValue('--event-color')).toBe('var(--sub-writing)');
    const legend = within(view.getByRole('group', { name: '시간표 범례' }));
    expect(legend.getByText('선택된 수업').style.getPropertyValue('--event-color')).toBe('var(--sub-writing)');

    mocks.meta.mockReturnValue({ data: meta });
    view.rerender(<SchedulePage />);
    expect(view.getByRole('button', { name: /Writing/ }).style.getPropertyValue('--event-color')).toBe('#123456');
    expect(legend.getByText('Writing').style.getPropertyValue('--event-color')).toBe('#123456');

    mocks.meta.mockReturnValue({ data: { ...meta, subs: [{ ...meta.subs[0], color: '#ABCDEF' }] } });
    view.rerender(<SchedulePage />);
    expect(view.getByRole('button', { name: /Writing/ }).style.getPropertyValue('--event-color')).toBe('#ABCDEF');
    expect(legend.getByText('Writing').style.getPropertyValue('--event-color')).toBe('#ABCDEF');
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-01' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

/**
 * 원문 §10·§11 본문 — 「일정 추가 시 학생(강사)이 자동으로 채워집니다」.
 * 새 일정 창은 초안을 받기만 한다. 누구를 넣을지는 **고른 개인표**가 정한다.
 */
describe('개인표에서 여는 새 일정 (§10·§11)', () => {
  it.each([
    ['학생별', /^선택 학생/, { studentIds: [1] }],
    ['선생님별', /^선택 강사/, { teacherId: 11 }],
  ])('%s 개인표의 빈 칸은 그 사람을 미리 넣은 초안을 연다', (viewName, personName, person) => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: viewName }));
    fireEvent.click(view.getByRole('button', { name: personName }));
    fireEvent.click(view.getByRole('button', { name: '2026-09-03 13:30 빈 시간 선택' }));

    expect(mocks.draft).toHaveBeenLastCalledWith({ date: '2026-09-03', startMin: 810, endMin: 870, roomId: null, ...person });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('개인표 빈 칸 드래그도 같은 사람을 넣는다 — 클릭과 드래그가 다른 초안을 만들지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));
    const rect = (top: number) => ({ top, height: 28, left: 0, right: 120, width: 120, bottom: top + 28 });
    const create = {
      active: { id: 'create-test', data: { current: { type: 'create', date: '2026-09-02', startMin: 600 } },
        rect: { current: { initial: rect(200), translated: rect(284) } } },
      over: { id: 'week-slot-test', disabled: false, rect: rect(284),
        data: { current: { type: 'weekSlot', date: '2026-09-02', slotMin: 630 } } },
      activatorEvent: new MouseEvent('pointerdown'), collisions: null, delta: { x: 0, y: 84 },
    } as unknown as DragEndEvent;
    act(() => mocks.drag!.onDragStart?.({ active: create.active, activatorEvent: create.activatorEvent }));
    act(() => mocks.drag!.onDragEnd?.(create));
    expect(mocks.draft).toHaveBeenLastCalledWith({ date: '2026-09-02', startMin: 600, endMin: 660, roomId: null, teacherId: 11 });
  });

  it('전체 보기의 빈 칸은 사람을 넣지 않는다 — 고른 사람이 없는 표에서 지어내지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '주간' }));
    fireEvent.click(view.getByRole('button', { name: '2026-09-03 13:30 빈 시간 선택' }));
    expect(mocks.draft).toHaveBeenLastCalledWith({ date: '2026-09-03', startMin: 810, endMin: 870, roomId: null });
  });
});

describe('화면에 내부 코드를 적지 않는다', () => {
  it('스케줄 머리에 개발 메모가 없고, 개인 도구줄의 설명에도 결정 번호가 없다', () => {
    const view = render(<SchedulePage />);
    expect(view.queryByText(/bounding range/)).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));
    const code = /D-R\d|N-\d{2}|§\d/;
    expect(code.test(view.container.textContent ?? '')).toBe(false);
    const titles = Array.from(view.container.querySelectorAll('[title]')).map((n) => n.getAttribute('title') ?? '');
    expect(titles.filter((t) => code.test(t))).toEqual([]);
  });
});

describe('관리자 날짜 선택의 일간 진입과 pane 보존', () => {
  it.each(['주간', '월간'])('%s 날짜 클릭은 해당 날짜 일간으로 전환한다', (viewName) => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: viewName }));
    fireEvent.click(view.getByRole('button', { name: '2026-09-02 (수) 날짜 선택' }));

    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-02', to: '2026-09-02' });
    // 일간 격자 — 원문 §07 시간 열 머리 「한국 시간」, 주간 격자는 없다
    expect(view.getByText('한국 시간')).toBeTruthy();
    expect(view.queryByRole('region', { name: '주간 시간표' })).toBeNull();
    expect(view.queryByRole('button', { name: '2026-09-02 (수) 날짜 선택' })).toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('분할된 오른쪽 월간의 날짜 선택이 왼쪽 날짜·보기를 변경하지 않는다', () => {
    // 표 나누기(분할)는 사이드바 하나가 맡는다 — 도구줄 「세로선 나누기」는 강의실 열이다 (N-80)
    useWorkspace.setState({ sidebarOpen: true });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '월간' }));
    fireEvent.click(view.getByRole('button', { name: '표 나누기' }));
    useWorkspace.setState({ sidebarOpen: false });
    const left = view.container.querySelector<HTMLElement>('[data-calendar-pane="0"]')!;
    const right = view.container.querySelector<HTMLElement>('[data-calendar-pane="1"]')!;
    fireEvent.pointerDown(right);
    fireEvent.click(within(right).getByRole('button', { name: '오른쪽 표 다음 기간' }));
    const leftBefore = left.innerHTML;
    fireEvent.click(within(right).getByRole('button', { name: '2026-10-05 (월) 날짜 선택' }));

    expect(left.innerHTML).toBe(leftBefore);
    expect(within(left).getByText('2026년 9월')).toBeTruthy();
    expect(within(left).getByRole('button', { name: '2026-09-01 (화) 날짜 선택' })).toBeTruthy();
    expect(within(right).getByText('10/5 (월)')).toBeTruthy();
    expect(within(right).getByText('한국 시간')).toBeTruthy();
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-10-05' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([
    ['학생별', /^선택 학생/],
    ['선생님별', /^선택 강사/],
  ])('%s 날짜 클릭은 선택된 사람과 개인표를 유지한다', (viewName, personName) => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: viewName }));
    fireEvent.click(view.getByRole('button', { name: personName }));
    fireEvent.click(view.getByRole('button', { name: '2026-09-02 (수) 날짜 선택' }));

    expect(view.getByRole('button', { name: /선택된 수업/ })).toBeTruthy();
    expect(view.queryByRole('button', { name: /다른 수업/ })).toBeNull();
    expect(view.getByRole('button', { name: '2026-09-02 (수) 날짜 선택' })).toBeTruthy();
    // 개인표는 일간으로 넘어가지 않고 주간 격자 그대로다
    expect(view.getByRole('region', { name: '주간 시간표' })).toBeTruthy();
    expect(view.queryByText('사람을 고르세요')).toBeNull();
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-09-06' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

/**
 * 키 리스너·`copySelection`·`pasteAtCursor`·`ClipboardBar` 가 컴포넌트 수준에서 한 번도
 * 시험되지 않은 자리였다 (CODEX §7.3 ①). 순수 함수만 시험돼 있으면 **배선이 끊겨도 초록**이다.
 */
describe('키보드 길 — 복사·잘라내기·붙여넣기·취소 (§5.2)', () => {
  /** 빈 칸에 접근 가능한 이름이 있는 표는 주간이다 — 붙일 자리를 그 이름으로 고른다 */
  const pickEmpty = (view: ReturnType<typeof render>, name: string) => {
    fireEvent.click(view.getByRole('button', { name: '주간' }));
    fireEvent.click(view.getByRole('button', { name }));
  };

  it('클립보드가 비어 있으면 Ctrl/⌘+V 는 먼저 복사하라고 말하고 쓰기를 보내지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true });
    expect(view.getByText(/먼저 일정을 선택하고/)).toBeTruthy();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('복사만 하고 붙일 칸을 고르지 않으면 빈 칸부터 고르라고 말한다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: /선택된 수업/ }), { ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
    expect(view.getByText('1건 복사됨')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true });
    expect(view.getByText('붙여넣을 빈 칸을 먼저 선택하세요.')).toBeTruthy();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('복사 → 빈 칸 → Ctrl/⌘+V 는 그 칸의 날짜·시각을 paste 계약에 싣는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: /선택된 수업/ }), { ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
    pickEmpty(view, '2026-09-03 13:30 빈 시간 선택');
    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true });

    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.write.mock.calls[0][0]).toMatchObject({
      kind: 'paste',
      body: {
        sources: [{ serId: 1, date: '2026-09-01', onDate: '2026-09-01' }],
        targetDate: '2026-09-03', targetStartMin: 810, cut: false, scope: 'this',
      },
    });
  });

  it('잘라내기는 낱말과 계약의 cut 만 바꾼다 — 누르는 순간 원본을 지우지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: /선택된 수업/ }), { ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'x', ctrlKey: true });
    expect(view.getByText('1건 잘라내기됨')).toBeTruthy();
    expect(mocks.write).not.toHaveBeenCalled();

    pickEmpty(view, '2026-09-03 13:30 빈 시간 선택');
    fireEvent.keyDown(document.body, { key: 'v', ctrlKey: true });
    expect(mocks.write.mock.calls[0][0]).toMatchObject({ kind: 'paste', body: { cut: true } });
  });

  it('Esc 는 한 단계씩 되돌린다 — 선택을 먼저 놓고, 그 다음에 클립보드를 비운다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: /선택된 수업/ }), { ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
    expect(view.getByText('1건 복사됨')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(view.getByText('1건 복사됨')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(view.queryByText('1건 복사됨')).toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('띠의 「Esc 취소」 단추도 같은 자리를 지운다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: /선택된 수업/ }), { ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
    fireEvent.click(view.getByRole('button', { name: 'Esc 취소' }));
    expect(view.queryByText('1건 복사됨')).toBeNull();
  });
});

describe('「가능 시간」 · 공휴일 (원문 §07·§11 UNAV · §09·§10 공휴일 · wave5)', () => {
  it('선생님별 표에서 「가능 시간」을 켜면 그때만 불가 시간을 읽고, 그 강사의 띠만 깔며 범례에 「강사 불가」가 선다', () => {
    mocks.unav.mockReturnValue({ data: { items: [
      { id: 1, teacherId: 11, teacherName: '선택 강사', date: '2026-09-02', startMin: 840, endMin: 960, reason: '병원' },
      { id: 2, teacherId: 22, teacherName: '다른 강사', date: '2026-09-02', startMin: 600, endMin: 660, reason: '출장' },
    ] }, isLoading: false });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));
    expect(mocks.unav).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-09-06' }, false);
    expect(view.container.querySelectorAll('[data-unav]').length).toBe(0);

    const toggle = view.getByRole('button', { name: '가능 시간' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(mocks.unav).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-09-06' }, true);
    const bands = Array.from(view.container.querySelectorAll('[data-unav]'));
    expect(bands.map((b) => b.getAttribute('title'))).toEqual(['강사 불가 · 선택 강사 14:00–16:00 · 병원']);
    expect(view.container.querySelector('[data-legend-unav]')).toBeTruthy();
  });

  it('전체 월간의 「이 기간 강사 불가 N건」은 그 달만 센다 — 격자 앞뒤 달 칸의 불가는 빼고 요약과 같은 기간 (QA 0926 B2)', () => {
    mocks.unav.mockReturnValue({ data: { items: [
      { id: 1, teacherId: 11, teacherName: '선택 강사', date: '2026-08-31', startMin: 840, endMin: 960, reason: '앞 달' },
      { id: 2, teacherId: 11, teacherName: '선택 강사', date: '2026-09-15', startMin: 840, endMin: 960, reason: '이 달' },
      { id: 3, teacherId: 22, teacherName: '다른 강사', date: '2026-10-04', startMin: 600, endMin: 660, reason: '뒤 달' },
    ] }, isLoading: false });
    useWorkspace.setState({ sidebarOpen: true });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '월간' }));
    fireEvent.click(view.getByRole('button', { name: '가능 시간' }));
    // 읽기는 격자 전체(앞뒤 달 칸 포함) — 세기만 그 달로 자른다
    expect(mocks.unav).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-10-04' }, true);
    const banner = view.container.querySelector('[data-unav-list]') as HTMLElement;
    expect(banner.textContent).toContain('이 기간 강사 불가 1건');
    expect(banner.textContent).toContain('이 달');
    expect(banner.textContent).not.toContain('앞 달');
    expect(banner.textContent).not.toContain('뒤 달');
    useWorkspace.setState({ sidebarOpen: false });
  });

  it('공휴일은 서버 표를 같은 범위로 읽어 월간 칸에 이름을 적는다', () => {
    mocks.holidays.mockReturnValue({ data: { items: [{ date: '2026-09-24', name: '추석 연휴' }, { date: '2026-09-25', name: '추석' }] } });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '월간' }));
    expect(mocks.holidays).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-10-04' });
    expect(Array.from(view.container.querySelectorAll('[data-holiday]')).map((n) => n.textContent)).toEqual(['추석 연휴', '추석']);
  });
});

describe('서버가 센 수만 그린다 (wave 6 · §07 #19 · §10 #5)', () => {
  it('사이드바 일정 원본 수는 사이드바를 펼쳤을 때만 읽는다 — 기본 접힘이면 부르지 않는다', () => {
    useWorkspace.setState({ sidebarOpen: false });
    const view = render(<SchedulePage />);
    expect(mocks.seriesCounts).toHaveBeenLastCalledWith(false);
    view.unmount();
    useWorkspace.setState({ sidebarOpen: true });
    render(<SchedulePage />);
    expect(mocks.seriesCounts).toHaveBeenLastCalledWith(true);
    useWorkspace.setState({ sidebarOpen: false });
  });

  it('학생별 개인 머리에 서버 낱말 「교재 없음」을 적고, 교재가 있으면(null) 아무것도 적지 않는다', () => {
    nav.search = 'studentId=1';
    mocks.studentBooks.mockReturnValue({ data: { studentId: 1, bookCount: 0, label: '교재 없음' } });
    const view = render(<SchedulePage />);
    expect(mocks.studentBooks).toHaveBeenLastCalledWith(1);
    const head = view.container.querySelector('[data-person-table]') as HTMLElement;
    expect(head.querySelector('[data-student-books]')?.textContent).toBe('교재 없음');
    view.unmount();

    mocks.studentBooks.mockReturnValue({ data: { studentId: 1, bookCount: 2, label: null } });
    const again = render(<SchedulePage />);
    expect(again.container.querySelector('[data-student-books]')).toBeNull();
  });

  it('선생님별 머리에는 교재 칩이 없다 — 학생 교재를 묻지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));
    expect(mocks.studentBooks).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-student-books]')).toBeNull();
  });
});

describe('선생님 목록 = 수업을 맡는 사람 (원문 §11 #7)', () => {
  it('관리 화면 권한이 있는 사람은 이 기간 맡은 수업이 있을 때만 목록에 선다 — 역할 낱말을 견주지 않고 서버 플래그로 가른다', () => {
    mocks.meta.mockReturnValue({ data: { ...meta, staff: [
      ...meta.staff,
      { id: 33, name: '수업 없는 원장', role: 'ceo', canAdminPage: true, canGpaPack: true },
      { id: 44, name: '수업하는 매니저', role: 'manager', canAdminPage: true, canGpaPack: false },
    ] } });
    mocks.occurrences.mockReturnValue({ data: { items: [...items, { ...items[1], serId: 3, teacherId: 44, title: '매니저 수업' }] }, isLoading: false, isError: false });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    expect(view.queryByRole('button', { name: /^수업 없는 원장/ })).toBeNull();
    expect(view.getByRole('button', { name: /^수업하는 매니저/ })).toBeTruthy();
    expect(view.getByRole('button', { name: /^선택 강사/ })).toBeTruthy();
    expect(view.getByRole('button', { name: /^다른 강사/ })).toBeTruthy();
    expect(view.getByText('선생님 3명')).toBeTruthy();
  });
});

describe('개인 표의 기간 축 (§10·§11)', () => {
  it('사람을 고르면 개인 도구줄이 서고, 기본은 주간이며 일간·월간으로 바꾸면 조회 범위가 따라간다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));

    const tools = view.getByRole('group', { name: /개인 표 기간/ });
    expect(within(tools).getByRole('button', { name: '주간' }).getAttribute('aria-pressed')).toBe('true');
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-09-06' });

    fireEvent.click(within(tools).getByRole('button', { name: '일간' }));
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-01' });

    fireEvent.click(within(tools).getByRole('button', { name: '월간' }));
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-10-04' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('진입 넷 — 「안내」·「정산」은 있는 화면으로 가고(정산은 금액 권한일 때만), 여는 화면이 원본에 없는 둘은 이유를 단 비활성 단추다', () => {
    mocks.permissions.canMoney = true;
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));

    // 「가능 시간」은 이제 강사 불가 시간 겹쳐 보기다(G37) — 「메모」만 여는 화면이 원본에 없어 잠겨 있다
    expect(view.getByRole('button', { name: '가능 시간' }).hasAttribute('disabled')).toBe(false);
    const memo = view.getByRole('button', { name: '메모' });
    expect(memo.hasAttribute('disabled')).toBe(true);
    expect(memo.getAttribute('title')).toBeTruthy();
    expect(view.getByRole('link', { name: '안내' }).getAttribute('href')).toBe('/guides');
    expect(view.getByRole('link', { name: '정산' }).getAttribute('href')).toBe('/accounting?tab=payout');
    // 학생별에는 원본에도 넷이 없다 — 모양을 맞추려고 같은 단추를 세우지 않는다
    fireEvent.click(view.getByRole('button', { name: '학생별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 학생/ }));
    expect(view.queryByRole('link', { name: '정산' })).toBeNull();
    cleanup();

    // 금액을 못 보면 「정산」 자체가 서지 않는다 (D-R39 · 서버 플래그)
    mocks.permissions.canMoney = false;
    const noMoney = render(<SchedulePage />);
    fireEvent.click(noMoney.getByRole('button', { name: '선생님별' }));
    fireEvent.click(noMoney.getByRole('button', { name: /^선택 강사/ }));
    expect(noMoney.queryByRole('link', { name: '정산' })).toBeNull();
    expect(noMoney.getByRole('link', { name: '안내' })).toBeTruthy();
  });

  it('개인 표의 기간을 바꿔도 고른 사람은 그대로다 — 축이 둘이라 서로를 지우지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '학생별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 학생/ }));
    const tools = view.getByRole('group', { name: /개인 표 기간/ });

    fireEvent.click(within(tools).getByRole('button', { name: '월간' }));
    expect(view.queryByText('사람을 고르세요')).toBeNull();
    expect(view.getByRole('button', { name: /선택된 수업/ })).toBeTruthy();
    expect(view.queryByRole('button', { name: /다른 수업/ })).toBeNull();
  });
});

/**
 * 겹침으로 막혔을 때 **누구와** 부딪혔는지까지 말한다 (§19 · D-R43).
 * 막는 것은 DB 이고 이 물음은 **막힌 뒤**에 한 번 간다 — 미리 물어서 저장을 건너뛰지 않는다.
 */
describe('겹침 설명 (§19 · D-R43)', () => {
  const rect = (top: number, height = 28) => ({ top, height, left: 0, right: 120, width: 120, bottom: top + height });
  const drop = (occ: Occurrence): DragEndEvent => ({
    activatorEvent: new MouseEvent('pointerdown'), collisions: null, delta: { x: 300, y: 0 },
    active: { id: 'move-test', data: { current: { type: 'move', occ } },
      rect: { current: { initial: rect(200, 56), translated: rect(214, 56) } } },
    over: { id: 'slot-test', disabled: false, rect: rect(200),
      data: { current: { type: 'slot', date: '2026-09-02', colAxis: 'room', colId: 3, slotMin: 900 } } },
  } as unknown as DragEndEvent);
  const finish = (event: DragEndEvent) => {
    act(() => mocks.drag!.onDragStart?.({ active: event.active, activatorEvent: new MouseEvent('pointerdown') }));
    act(() => mocks.drag!.onDragEnd?.(event));
  };
  const conflictError = {
    response: { status: 409, data: { code: 'RESOURCE_CONFLICT', message: '같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다' } },
  };

  it('409 면 놓으려던 그 자리를 다시 물어 상대 이름까지 붙인다', async () => {
    mocks.write.mockImplementation((_cmd: unknown, opts: { onError?: (e: unknown) => void }) => opts.onError?.(conflictError));
    mocks.conflictPreview.mockResolvedValue({
      conflicts: [{ serId: 9, onDate: '2026-09-02', startMin: 900, endMin: 960, with: 'room', whoName: '현장 3호' }],
      freeLine: null,
    });
    const view = render(<SchedulePage />);
    finish(drop(items[0]));

    // 물어보는 자리는 **놓으려던 곳**이다 — 원래 자리가 아니다
    expect(mocks.conflictPreview).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-09-02', startMin: 915, roomId: 3, exceptSerId: 1,
    }));
    expect(view.getByText(/같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다/)).toBeTruthy();
    // 설명은 한 왕복 뒤에 붙는다 — 가짜 타이머를 쓰는 스위트라 microtask 만 흘려보낸다
    await act(async () => { await Promise.resolve(); });
    expect(view.getByText(/\[강의실\] 현장 3호/)).toBeTruthy();
  });

  it('409 설명 뒤에 서버가 만든 「그 시각 비어 있는」 한 줄을 붙인다 — 누를 수 없고 미리 잡지 않는다 (N-70)', async () => {
    mocks.write.mockImplementation((_cmd: unknown, opts: { onError?: (e: unknown) => void }) => opts.onError?.(conflictError));
    mocks.conflictPreview.mockResolvedValue({
      conflicts: [{ serId: 9, onDate: '2026-09-02', startMin: 900, endMin: 960, with: 'room', whoName: '현장 3호' }],
      freeLine: '그 시각 비어 있는 강의실 — 1호 · 2호',
    });
    const view = render(<SchedulePage />);
    finish(drop(items[0]));
    await act(async () => { await Promise.resolve(); });
    const alert = view.getByRole('alert');
    expect(alert.textContent).toContain('[강의실] 현장 3호');
    expect(alert.textContent).toContain('그 시각 비어 있는 강의실 — 1호 · 2호');
    // 문장일 뿐이다 — 이름을 눌러 다시 저장하는 단추가 서지 않는다
    expect(within(alert).queryByRole('button')).toBeNull();
    expect(mocks.write).toHaveBeenCalledOnce();
  });

  it('저장은 됐지만 같은 학생이 같은 시각 다른 수업에도 있으면 막지 않고 알린다 (N-58)', () => {
    mocks.write.mockImplementation((_cmd: unknown, opts: { onSuccess?: (r: unknown) => void }) => opts.onSuccess?.({
      effScope: 'this', log: [], projected: 1, serIds: [1], unavailable: [],
      studentOverlaps: [{
        serId: 1, date: '2026-09-02', studentId: 1, studentName: '선택 학생', otherSerId: 2,
        otherTitle: '다른 수업', otherStartMin: 900, otherEndMin: 960,
      }],
    }));
    const view = render(<SchedulePage />);
    finish(drop(items[0]));

    expect(view.queryByRole('alert')).toBeNull();
    const warn = view.container.querySelector('[data-student-overlaps]') as HTMLElement;
    expect(warn.getAttribute('role')).toBe('status');
    expect(warn.textContent).toContain('선택 학생 · 9/2 (수) 15:00–16:00 다른 수업');
  });

  it('저장은 됐지만 강사가 불가로 적어 둔 시간이면 그 사실을 알린다 (§15·§16)', () => {
    mocks.write.mockImplementation((_cmd: unknown, opts: { onSuccess?: (r: unknown) => void }) => opts.onSuccess?.({
      effScope: 'this', log: [], projected: 1, serIds: [1],
      unavailable: [{ serId: 1, date: '2026-09-02', teacherId: 11, teacherName: '선택 강사', startMin: 540, endMin: 660, reason: '병원 예약' }],
    }));
    const view = render(<SchedulePage />);
    finish(drop(items[0]));

    // 막힌 것이 아니다 — 오류 자리가 아니라 알림 자리에 선다
    expect(view.queryByRole('alert')).toBeNull();
    const warn = view.getAllByRole('status').find((n) => n.textContent?.includes('못 한다고 적어 둔 시간'));
    expect(warn).toBeTruthy();
    expect(warn!.textContent).toContain('선택 강사 — 병원 예약');
  });

  it('겹침이 아니면 묻지 않는다 — 실패마다 한 번씩 더 도는 왕복을 만들지 않는다', () => {
    mocks.write.mockImplementation((_cmd: unknown, opts: { onError?: (e: unknown) => void }) => opts.onError?.({
      response: { status: 400, data: { code: 'BAD_RANGE', message: '값이 허용 범위를 벗어났습니다' } },
    }));
    const view = render(<SchedulePage />);
    finish(drop(items[0]));
    expect(mocks.conflictPreview).not.toHaveBeenCalled();
    expect(view.getByText('값이 허용 범위를 벗어났습니다')).toBeTruthy();
  });

  it('설명을 못 가져와도 원래 문구는 그대로 선다 — 실패가 실패를 덮지 않는다', async () => {
    mocks.write.mockImplementation((_cmd: unknown, opts: { onError?: (e: unknown) => void }) => opts.onError?.(conflictError));
    mocks.conflictPreview.mockRejectedValue(new Error('네트워크'));
    const view = render(<SchedulePage />);
    finish(drop(items[0]));
    await act(async () => { await Promise.resolve(); });
    expect(view.getByText('같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다')).toBeTruthy();
  });
});

describe('드롭 대상 시각과 자정 쓰기 경계', () => {
  const rect = (top: number, height = 28) => ({ top, height, left: 0, right: 120, width: 120, bottom: top + height });
  const drop = (occ: Occurrence, extra: Partial<DragEndEvent> = {}): DragEndEvent => ({
    activatorEvent: new MouseEvent('pointerdown'), collisions: null, delta: { x: 300, y: 0 },
    active: { id: 'move-test', data: { current: { type: 'move', occ } },
      rect: { current: { initial: rect(200, 56), translated: rect(214, 56) } } },
    over: { id: 'slot-test', disabled: false, rect: rect(200),
      data: { current: { type: 'slot', date: '2026-09-02', colAxis: 'room', colId: 3, slotMin: 900 } } },
    ...extra,
  });
  const finish = (event: DragEndEvent, copy = false) => {
    act(() => mocks.drag!.onDragStart?.({ active: event.active, activatorEvent: new MouseEvent('pointerdown', { ctrlKey: copy }) }));
    act(() => mocks.drag!.onDragEnd?.(event));
  };

  it('빈 주간 슬롯을 아래로 드래그하면 시작·끝을 보존한 새 일정 초안을 연다', () => {
    render(<SchedulePage />);
    const create = {
      active: {
        id: 'create-test', data: { current: { type: 'create', date: '2026-09-01', startMin: 600 } },
        rect: { current: { initial: rect(200), translated: rect(284) } },
      },
      over: { id: 'week-slot-test', disabled: false, rect: rect(284),
        data: { current: { type: 'weekSlot', date: '2026-09-01', slotMin: 690 } } },
      activatorEvent: new MouseEvent('pointerdown'), collisions: null, delta: { x: 0, y: 84 },
    } as unknown as DragEndEvent;
    act(() => mocks.drag!.onDragStart?.({ active: create.active, activatorEvent: create.activatorEvent }));
    act(() => mocks.drag!.onDragEnd?.(create));
    expect(mocks.draft).toHaveBeenLastCalledWith({ date: '2026-09-01', startMin: 600, endMin: 720, roomId: null });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('빈 슬롯 생성은 다른 날짜·열로 넘기면 저장 초안을 만들지 않는다', () => {
    const view = render(<SchedulePage />);
    const create = {
      active: {
        id: 'create-test', data: { current: {
          type: 'create', date: '2026-09-01', startMin: 600, colAxis: 'room', colId: 1,
        } }, rect: { current: { initial: rect(200), translated: rect(284) } },
      },
      over: { id: 'slot-test', disabled: false, rect: rect(284), data: { current: {
        type: 'slot', date: '2026-09-01', slotMin: 690, colAxis: 'room', colId: 2,
      } } }, activatorEvent: new MouseEvent('pointerdown'), collisions: null, delta: { x: 100, y: 84 },
    } as unknown as DragEndEvent;
    act(() => mocks.drag!.onDragStart?.({ active: create.active, activatorEvent: create.activatorEvent }));
    act(() => mocks.drag!.onDragEnd?.(create));
    expect(view.getByText('새 일정은 같은 날짜·같은 열 안에서 시간을 드래그해 주세요.')).toBeTruthy();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('출발11시+delta0이 아닌 대상15시 슬롯의15분 위치에 길이를 유지해 저장한다', () => {
    render(<SchedulePage />);
    finish(drop(items[0]));
    expect(mocks.write.mock.calls[0][0]).toEqual({ kind: 'patch', serId: 1,
      body: { date: '2026-09-02', startMin: 915, endMin: 975, roomId: 3, onDate: '2026-09-01', scope: 'this' } });
  });

  it('주간 슬롯 drop은 세로 시각을 저장하고 보이지 않는 강의실·강사 축은 바꾸지 않는다', () => {
    render(<SchedulePage />);
    const event = drop(items[0]);
    event.over!.data.current = { type: 'weekSlot', date: '2026-09-02', slotMin: 960 };
    finish(event);
    expect(mocks.write.mock.calls[0][0]).toEqual({ kind: 'patch', serId: 1,
      body: { date: '2026-09-02', startMin: 975, endMin: 1035, onDate: '2026-09-01', scope: 'this' } });
    expect(mocks.write.mock.calls[0][0].body).not.toHaveProperty('roomId');
    expect(mocks.write.mock.calls[0][0].body).not.toHaveProperty('teacherId');
  });

  it('성공한 마지막 이동은 서버 undo token 하나로 Ctrl/⌘+Z하고 토큰을 즉시 폐기한다', () => {
    const token = 'signed-schedule-undo-token-for-regression';
    mocks.write
      .mockImplementationOnce((_cmd: unknown, opts: { onSuccess?: (r: unknown) => void }) => opts.onSuccess?.({
        effScope: 'this', log: [], projected: 1, serIds: [1], unavailable: [], undoToken: token,
      }))
      .mockImplementationOnce((_cmd: unknown, opts: { onSuccess?: (r: unknown) => void }) => opts.onSuccess?.({
        effScope: 'this', log: [], projected: 1, serIds: [1], unavailable: [], undoToken: null,
      }));
    const view = render(<SchedulePage />);
    finish(drop(items[0]));

    expect(view.getByRole('button', { name: '되돌리기 · Ctrl/⌘+Z' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });

    expect(mocks.write).toHaveBeenNthCalledWith(2, { kind: 'undo', body: { token } }, expect.any(Object));
    expect(view.getByText('수업 이동을 되돌렸습니다.')).toBeTruthy();
    expect(view.queryByRole('button', { name: '되돌리기 · Ctrl/⌘+Z' })).toBeNull();
  });

  it('아직 저장하지 않은 반복 이동 모달의 Ctrl/⌘+Z는 서버 요청 없이 모달만 닫는다', () => {
    const view = render(<SchedulePage />);
    finish(drop({ ...items[0], recurring: true }));
    expect(view.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });

    expect(view.queryByRole('dialog')).toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([false, true])('자정 초과는 길이 단축이나 원시각 fallback 없이 거절한다 (copy=%s)', (copy) => {
    render(<SchedulePage />);
    const event = drop({ ...items[0], startMin: 1260, endMin: 1380 });
    event.over!.data.current!.slotMin = 1380;
    finish(event, copy);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('유효한 복사는 원래 시각이 아니라 대상 시각을 paste 계약에 보낸다', () => {
    render(<SchedulePage />);
    finish(drop(items[0]), true);
    expect(mocks.write.mock.calls[0][0]).toMatchObject({ kind: 'paste', body: {
      targetDate: '2026-09-02', targetStartMin: 915, roomId: 3, cut: false, scope: 'this',
    } });
  });

  it('다중 이동은 대상 시각 delta를 전체에 적용하고 하나라도 자정을 넘으면 전부 거절한다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: /선택된 수업/ }), { ctrlKey: true });
    fireEvent.click(view.getByRole('button', { name: /다른 수업/ }), { ctrlKey: true });
    finish(drop(items[0]));
    expect(mocks.write.mock.calls[0][0]).toMatchObject({ kind: 'moveMany', body: { items: [
      { date: '2026-09-02', startMin: 915, endMin: 975, roomId: 3 },
      { date: '2026-09-02', startMin: 975, endMin: 1035, roomId: 3 },
    ] } });
    mocks.write.mockClear();
    const late = drop(items[0]);
    late.over!.data.current!.slotMin = 1365; // anchor23~24는 유효해도 다음 선택은24~25
    finish(late);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('포인터가 격자 밖이면 overlay 면적이 겹쳐도 드롭 대상으로 되살리지 않는다', () => {
    render(<SchedulePage />);
    const event = drop(items[0]);
    const slot = { id: 'slot-test', key: 'slot-test', disabled: false,
      data: event.over!.data, node: { current: null }, rect: { current: rect(200) } };
    const args = { active: event.active, collisionRect: rect(200),
      droppableContainers: [slot], droppableRects: new Map([[slot.id, rect(200)]]),
      pointerCoordinates: { x: 200, y: 200 } };
    expect(mocks.drag!.collisionDetection!(args)).toEqual([]);
    expect(mocks.drag!.collisionDetection!({ ...args, pointerCoordinates: { x: 60, y: 210 } })[0].id).toBe(slot.id);
    expect(mocks.drag!.collisionDetection!({ ...args, pointerCoordinates: null })[0].id).toBe(slot.id);
  });

  it('다른 pane 위까지 뻗은 숨김 슬롯은 스크롤 viewport 밖이면 후보에서 뺀다', () => {
    const view = render(<SchedulePage />);
    const event = drop(items[0]);
    const hiddenViewport = document.createElement('div');
    hiddenViewport.style.overflowX = 'auto';
    hiddenViewport.getBoundingClientRect = () => new DOMRect(0, 0, 80, 400);
    const hiddenNode = document.createElement('div');
    hiddenViewport.append(hiddenNode);
    view.container.append(hiddenViewport);
    const visibleNode = document.createElement('div');
    view.container.append(visibleNode);
    const containers = [hiddenNode, visibleNode].map((node, i) => ({
      id: String(i), key: String(i), disabled: false, data: event.over!.data,
      node: { current: node }, rect: { current: rect(200) },
    }));
    expect(mocks.drag!.collisionDetection!({ active: event.active, collisionRect: rect(200),
      droppableContainers: containers, droppableRects: new Map(containers.map((c) => [c.id, rect(200)])),
      pointerCoordinates: { x: 100, y: 210 },
    }).map((hit) => hit.id)).toEqual(['1']);
  });

  it('좌표 없음·0높이·격자 밖 드롭은 쓰지 않는다', () => {
    render(<SchedulePage />);
    const missing = drop(items[0]);
    missing.active.rect.current.translated = null;
    finish(missing);
    const zeroHeight = drop(items[0]);
    zeroHeight.over!.rect = rect(200, 0);
    finish(zeroHeight);
    finish(drop(items[0], { over: null }));
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('날짜 칸은 시각과 자원을 바꾸지 않으며 같은 날이면 쓰지 않는다', () => {
    render(<SchedulePage />);
    const event = drop(items[0]);
    event.over!.data.current = { type: 'day', date: '2026-09-02' };
    finish(event);
    expect(mocks.write.mock.calls[0][0]).toMatchObject({ body: { date: '2026-09-02', scope: 'this', onDate: '2026-09-01' } });
    expect(mocks.write.mock.calls[0][0].body).not.toHaveProperty('startMin');
    expect(mocks.write.mock.calls[0][0].body).not.toHaveProperty('roomId');
    mocks.write.mockClear();
    event.over!.data.current = { type: 'day', date: items[0].date };
    finish(event);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(['일간', '월간'])('동일 날짜 %s split의 블록·드롭칸은 각 렌더 인스턴스에 따로 등록한다', (viewName) => {
    useWorkspace.setState({ sidebarOpen: true });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: viewName }));
    const before = { drag: mocks.context!.draggableNodes.size, drop: mocks.context!.droppableContainers.size };
    fireEvent.click(view.getByRole('button', { name: '표 나누기' }));
    useWorkspace.setState({ sidebarOpen: false });
    expect(mocks.context!.draggableNodes.size).toBe(before.drag * 2);
    expect(mocks.context!.droppableContainers.size).toBe(before.drop * 2);
    expect(view.getAllByRole('button', { name: /선택된 수업/ })).toHaveLength(2);
  });
});

describe('월간 상단 집계와 날짜 칸이 같은 것을 센다 (v2 §09 · N-19)', () => {
  const occurrence = (serId: number, date: string, extra: Partial<Occurrence> = {}): Occurrence => ({
    serId, date, onDate: date, startMin: 600, endMin: 690, kindKey: 'class', title: `수업 ${serId}`,
    mode: 'offline', canceled: false, hasException: false, recurring: false,
    repState: 'plan', ended: false, written: false, extra: false, attendanceMode: 'unavailable', attendance: null, students: [], ...extra,
  });

  // 9월 격자는 8/31 ~ 10/4 다. 앞뒤 달 칸은 **격자에는 있고 집계에는 없다**.
  const month = [
    ...[1, 2, 3, 4, 5].map((id) => occurrence(id, '2026-09-01')),
    occurrence(6, '2026-09-02', { mode: 'online', ended: true, repState: 'none' }),
  ];
  const neighbors = [occurrence(91, '2026-08-31'), occurrence(92, '2026-08-31'), occurrence(93, '2026-10-01')];

  const openMonth = () => {
    mocks.occurrences.mockReturnValue({ data: { items: [...month, ...neighbors] }, isLoading: false });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '월간' }));
    return view;
  };
  const cellCount = (view: ReturnType<typeof render>, date: string): number => {
    const head = view.getByRole('button', { name: `${date} (${KO_DOW[dowOf(date)]}) 날짜 선택` }).parentElement!;
    // 칸 머리 숫자는 원문 §09 처럼 숫자만 — 「N건」은 title 이다
    const badge = within(head).queryByTitle(/건$/);
    return badge ? Number(badge.textContent) : 0;
  };

  it('이 달 칸 건수 합 = 상단 「일정 N건」 — 흐린 앞뒤 달 칸은 그려지되 세지 않는다', () => {
    const view = openMonth();
    const grid = monthGrid('2026-09-01');
    const mine = grid.filter((d) => d.startsWith('2026-09'));
    const sum = mine.reduce((total, d) => total + cellCount(view, d), 0);

    expect(sum).toBe(month.length);
    // 대상 줄 한 곳이 「2026년 9월 · 일정 N건」을 말한다 — 날짜·건수를 두 번 적던 줄을 하나로 모았다(원문 §07 대상 줄)
    const target = within(view.getByRole('group', { name: '대상' }));
    expect(target.getByTitle(/이 달 1일~말일 기준/).textContent).toBe(`일정 ${sum}건`);
    expect(target.getByText('2026년 9월')).toBeTruthy();

    // 앞뒤 달 칸은 화면에 남아 있다 — 숨겨서 수를 맞춘 것이 아니다
    expect(cellCount(view, '2026-08-31')).toBe(2);
    expect(cellCount(view, '2026-10-01')).toBe(1);
    expect(grid.reduce((total, d) => total + cellCount(view, d), 0)).toBe(month.length + neighbors.length);
  });

  it('상단 갈래는 같은 투영에서 나온다 — 현장+온라인=건수, 미제출은 서버 판정 그대로', () => {
    const view = openMonth();
    expect(view.getByTitle(/현장 \+ 온라인/).textContent).toBe('현장 5 / 온라인 1');
    expect(view.getByTitle(/승인을 기다리는/).textContent).toBe('승인 대기 0');
    expect(view.getByTitle(/초안도 미제출/).textContent).toBe('리포트 미제출 1');
    // 바닥 칩도 같은 기간이다 — 앞뒤 달 3건이 섞이면 「6건인데 취소·휴강 …」 이 된다
    expect(view.getByText('취소·휴강 0')).toBeTruthy();
    expect(view.getByText('리포트 쓴 수업 0')).toBeTruthy();
  });

  it('「+N건 더」는 실제로 접힌 수다 — 건수−3 이 아니라 건수 − 보여 준 수다 (N-19)', () => {
    const view = openMonth();
    const cell = within(view.getByRole('button', { name: '2026-09-01 (화) 날짜 선택' }).parentElement!.parentElement!);
    const shown = cell.getAllByRole('button', { name: /수업 \d/ });
    expect(shown).toHaveLength(3);
    expect(cell.getByRole('button', { name: `+${month.filter((o) => o.date === '2026-09-01').length - shown.length}건 더` })).toBeTruthy();
  });
});

/**
 * 원문 §07 도구줄 · 대상 줄 — 보기 축 둘([일간·주간·월간] + [전체·학생별·선생님별]) · 날짜 칸 · [일정 · 리포트] ·
 * 「+ 빈 시간 찾기」 · 대상 줄 하나 · 블록 정원 점. 전부 이미 읽은 회차와 코드표로만 그린다(추가 GET 0).
 */
describe('§07 도구줄과 대상 줄 (wave 3)', () => {
  it('대상 줄은 하나다 — 「대상 · 전체 · 전체 기준」과 오른쪽 기간 요약, 단일 표에는 「● 단일 표」 머리가 없다', () => {
    const view = render(<SchedulePage />);
    const target = within(view.getByRole('group', { name: '대상' }));
    expect(target.getByText('전체')).toBeTruthy();
    expect(target.getByText('전체 기준')).toBeTruthy();
    expect(target.getByText('9/1 (화)')).toBeTruthy();
    expect(target.getByTitle(/이 기간 전부/).textContent).toBe('일정 2건');
    expect(view.queryByText(/단일 표/)).toBeNull();
    // 요약 줄은 한 곳에만 선다 — 날짜를 세 번 적던 자리
    expect(view.getAllByTitle(/현장 \+ 온라인/)).toHaveLength(1);

    fireEvent.click(view.getByRole('button', { name: '온라인' }));
    expect(target.getByText('필터 1개')).toBeTruthy();
  });

  it('기간 축과 대상 축은 따로 고른다 — 학생별을 고르면 대상 줄이 「학생별 · 이름」이 되고 요약은 전체 기준 그대로다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(within(view.getByRole('group', { name: '스케줄 대상' })).getByRole('button', { name: '학생별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 학생/ }));
    const target = within(view.getByRole('group', { name: '대상' }));
    expect(target.getByText('학생별 · 선택 학생')).toBeTruthy();
    // 원문 §10 — 사람을 골라도 대상 줄 요약은 전체 기준(「일정 54건 …」), 그 사람의 수는 개인 머리가 말한다
    expect(target.getByTitle(/이 기간 전부/).textContent).toBe('일정 2건');
    expect(within(view.getByRole('group', { name: '스케줄 기간' })).getByRole('button', { name: '주간' }).getAttribute('aria-pressed')).toBe('true');

    // 기간 축의 「월간」은 개인표의 기간을 바꾼다 — 대상(학생별)과 고른 사람은 그대로
    fireEvent.click(within(view.getByRole('group', { name: '스케줄 기간' })).getByRole('button', { name: '월간' }));
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-10-04' });
    expect(target.getByText('학생별 · 선택 학생')).toBeTruthy();

    // 대상 「전체」로 돌아오면 지금 기간(월간)의 전체 표다
    fireEvent.click(within(view.getByRole('group', { name: '스케줄 대상' })).getByRole('button', { name: '전체' }));
    expect(target.getByText('전체')).toBeTruthy();
    expect(view.getByText('2026년 9월', { selector: 'span' })).toBeTruthy();
  });

  it('도구줄 날짜 칸은 보기를 그대로 두고 그 날짜로 간다 — 주간이면 그 주, ‹ › 오늘도 같은 줄에 있다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '주간' }));
    fireEvent.change(view.getByLabelText('날짜'), { target: { value: '2026-09-10' } });
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-07', to: '2026-09-13' });
    expect(view.getByRole('region', { name: '주간 시간표' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '다음 기간' }));
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-14', to: '2026-09-20' });
    fireEvent.click(view.getByRole('button', { name: '오늘' }));
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-08-31', to: '2026-09-06' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('[일정 · 리포트] 의 「리포트」는 블록을 리포트 상태색으로 그리고 범례도 리포트 낱말로 바꾼다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '리포트' }));
    const block = view.getByRole('button', { name: /선택된 수업/ });
    expect(block.style.getPropertyValue('--event-color')).toBe('');
    expect(block.className).toContain('bg-blue/10');
    const legend = within(view.getByRole('group', { name: '시간표 범례' }));
    // 색 줄이 리포트 낱말이다 — 「미작성」은 색 줄 칩 하나와 블록 배지 「[미작성] 리포트」 한 줄(두 보기 모두)로 두 번 선다
    const colorRow = within(legend.getByText('색 = 리포트').parentElement!);
    expect(colorRow.getByText('미작성')).toBeTruthy();
    expect(legend.getAllByText('미작성')).toHaveLength(2);
  });

  it('블록 오른쪽 위 정원 점 — 코드표 정원(4) 중 그날 명단만큼 찬다', () => {
    const view = render(<SchedulePage />);
    const block = view.getByRole('button', { name: /선택된 수업/ });
    const dots = block.querySelector('[data-cap-dots]')!;
    expect(dots.querySelectorAll('.bg-current')).toHaveLength(1);
    expect(dots.querySelectorAll('.border-current')).toHaveLength(3);
    expect(block.getAttribute('title')).toContain('정원 1/4명');
  });

  it('「+ 빈 시간 찾기」는 일간 강의실 칸 중 수업이 걸치지 않은 칸만 칠하고, 다른 보기에서는 누를 수 없다', () => {
    mocks.meta.mockReturnValue({ data: { ...meta, rooms: [{ id: 1, name: '1호', branch: '본원' }] } });
    mocks.occurrences.mockReturnValue({ data: { items: [{ ...items[0], roomId: 1, roomName: '1호' }] }, isLoading: false, isError: false });
    const view = render(<SchedulePage />);
    const free = view.getByRole('button', { name: '빈 시간 찾기' });
    // 빈 칸은 강의실마다 센다 — 기본 일간(날짜 한 열)에서는 누를 수 없고, 「세로선 나누기」로 강의실 열을 켜면 선다 (N-80)
    expect((free as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByRole('button', { name: '세로선 나누기' }));
    expect((free as HTMLButtonElement).disabled).toBe(false);
    expect(view.container.querySelector('[data-free]')).toBeNull();
    fireEvent.click(free);
    expect(free.getAttribute('aria-pressed')).toBe('true');
    expect(view.getByRole('button', { name: '2026-09-01 09:00 강의실 1 빈 시간 선택' }).hasAttribute('data-free')).toBe(true);
    // 11:00~12:00 수업이 걸친 칸은 비지 않았다
    expect(view.getByRole('button', { name: '2026-09-01 11:30 강의실 1 빈 시간 선택' }).hasAttribute('data-free')).toBe(false);
    // 온라인 · 미지정 열은 강의실이 아니라 칠하지 않는다
    expect(view.getByRole('button', { name: '2026-09-01 09:00 강의실 미지정 빈 시간 선택' }).hasAttribute('data-free')).toBe(false);
    fireEvent.click(view.getByRole('button', { name: '주간' }));
    expect((view.getByRole('button', { name: '빈 시간 찾기' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

describe('§10·§11 개인표 목록 카드 · 개인 머리 · 합계 · To-Do 띠 (wave 3)', () => {
  it('학생 목록은 어두운 머리 「학생 N명 · 눌러서 바뀝니다」, 학년순이고 줄마다 학년 · 종류 칩 · 「N회 · N.Nh」', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '학생별' }));
    const list = within(view.getByRole('region', { name: '학생 목록' }));
    expect(list.getByText('학생 2명')).toBeTruthy();
    expect(list.getByText('눌러서 바뀝니다')).toBeTruthy();
    const rows = list.getAllByRole('button');
    // G10 이 있는 학생이 학년 모르는 학생보다 앞이다 (원문 §10 학년순)
    expect(rows[0].textContent).toContain('선택 학생');
    expect(rows[0].textContent).toContain('G10');
    expect(rows[0].textContent).toContain('수업 1');
    expect(rows[0].textContent).toContain('1회 · 1.0h');
  });

  it('개인 머리 — 이름 · 학년 칩 · 「수업 N · 시간 N.N」 · 크게 · PNG, 주간 격자는 어두운 머리와 바닥 「합계」 줄', async () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '학생별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 학생/ }));
    const table = view.container.querySelector<HTMLElement>('[data-person-table]')!;
    const text = (table.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('수업 1 · 시간 1.0');
    expect(within(table).getByRole('button', { name: '크게' })).toBeTruthy();
    expect(within(table).getByRole('row', { name: '합계' })).toBeTruthy();
    // 개인표 블록 세 줄 — 과목 / 시간대 / (학생별이면) 강사
    expect(within(table).getByRole('button', { name: /선택된 수업/ }).textContent).toContain('11:00 –12:00');
    await act(async () => fireEvent.click(within(table).getByRole('button', { name: '개인 표를 PNG로 저장' })));
    expect(mocks.download).toHaveBeenCalledWith(table, '2026-09-01-student-1-schedule.png');
  });

  it('선생님별 — 종류별 칩 「수업 1건 · 1.0h」, 미제출 리포트는 목록 줄에 빨간 「리포트 N」', () => {
    const late = { ...items[0], ended: true, repState: 'none' as const, written: false };
    mocks.occurrences.mockReturnValue({ data: { items: [late, items[1]] }, isLoading: false, isError: false });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    const row = view.getByRole('button', { name: /^선택 강사/ });
    expect(row.textContent).toContain('리포트 1');
    fireEvent.click(row);
    expect(view.getByText('수업 1건 · 1.0h')).toBeTruthy();
  });

  it('To-Do 띠는 서랍이 읽은 할 일 중 그 강사가 이 기간에 받은 것만 그리고, 「+ 주기」는 받는 사람을 그 강사로 채운 창을 연다', () => {
    mocks.drawer.mockReturnValue({ data: { approvals: { count: 0 }, notis: [], todos: [
      { id: 1, title: '교재 확인', toId: 11, dueOn: '2026-09-02', done: false, src: 'manual', srcLabel: '직접', overdueDays: 0 },
      { id: 2, title: '다른 강사 일', toId: 22, dueOn: '2026-09-02', done: false, src: 'manual', srcLabel: '직접', overdueDays: 0 },
      { id: 3, title: '다음 달 일', toId: 11, dueOn: '2026-10-20', done: false, src: 'manual', srcLabel: '직접', overdueDays: 0 },
    ] } });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));
    const strip = within(view.getByRole('group', { name: '받은 할 일' }));
    expect(strip.getByText('To-Do Tasks')).toBeTruthy();
    expect(strip.getByText('교재 확인 · 09-02')).toBeTruthy();
    expect(strip.queryByText(/다른 강사 일/)).toBeNull();
    expect(strip.queryByText(/다음 달 일/)).toBeNull();

    fireEvent.click(strip.getByRole('button', { name: '+ 주기' }));
    const dialog = within(view.getByRole('dialog', { name: '할 일 만들기' }));
    expect((dialog.getByLabelText('담당자') as HTMLSelectElement).value).toBe('11');
    fireEvent.change(dialog.getByLabelText('할 일'), { target: { value: '모의고사 채점' } });
    fireEvent.click(dialog.getByRole('button', { name: '만들기' }));
    expect(mocks.drawerWrite).toHaveBeenCalledWith(
      { kind: 'todoCreate', body: { title: '모의고사 채점', toId: 11, dueOn: '2026-09-01' } },
      expect.any(Object),
    );
  });

  it('받은 일이 없으면 「이 기간에 받은 일이 없습니다」라 적는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));
    expect(within(view.getByRole('group', { name: '받은 할 일' })).getByText('이 기간에 받은 일이 없습니다')).toBeTruthy();
  });
});

it('학생별로 들어오면 목록 첫 사람(학년순)이 골라진 채 표가 보인다 — 빈 「사람을 고르세요」 화면에서 멈추지 않는다 (원문 §10)', () => {
  const view = render(<SchedulePage />);
  fireEvent.click(view.getByRole('button', { name: '학생별' }));
  expect(view.queryByText('사람을 고르세요')).toBeNull();
  expect(within(view.getByRole('group', { name: '대상' })).getByText('학생별 · 선택 학생')).toBeTruthy();
  expect(view.getByRole('button', { name: /선택된 수업/ })).toBeTruthy();
  expect(view.queryByRole('button', { name: /다른 수업/ })).toBeNull();
});

/**
 * W11 — 일간 기본 모양(N-80) · lane 상한 셋 + 「+M」(N-74) · 「≡ 회계」(N-100) · 「안내 N」(N-100) · 아바타(N-83).
 * 전부 이미 읽은 회차 · 코드표 · 서버 플래그로만 그린다 — 화면이 세거나 역할을 견주지 않는다.
 */
describe('W11 스케줄 — 일간 lane · 세로선 나누기 · 회계 · 안내 N · 아바타', () => {
  const lesson = (serId: number, date: string, startMin = 600, endMin = 690): Occurrence => ({
    serId, date, onDate: date, startMin, endMin, kindKey: 'class', title: `겹친 수업 ${serId}`,
    teacherId: 11, mode: 'offline', canceled: false, hasException: false, recurring: false,
    repState: 'plan', ended: false, written: false, extra: false, attendanceMode: 'unavailable', attendance: null,
    students: [],
  });

  it('일간 기본은 날짜 한 열(원문 §07 캡처) — 「세로선 나누기」가 강의실 열을 켜고 끈다', () => {
    const view = render(<SchedulePage />);
    // 날짜 한 열 · 머리 두 줄 「26년 9월 1일 화요일 / 일정 2건」 · 누르는 단추가 아니다
    const day = view.getByRole('region', { name: '일간 시간표' });
    expect(within(day).getByText('26년 9월 1일 화요일')).toBeTruthy();
    expect(within(day).getByText('일정 2건')).toBeTruthy();
    expect(view.queryByRole('button', { name: '2026-09-01 (화) 날짜 선택' })).toBeNull();
    expect(view.queryByRole('button', { name: /강의실 미지정 빈 시간 선택/ })).toBeNull();

    const toggle = view.getByRole('button', { name: '세로선 나누기' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(view.queryByRole('region', { name: '일간 시간표' })).toBeNull();
    expect(view.getByRole('button', { name: '2026-09-01 09:00 강의실 미지정 빈 시간 선택' })).toBeTruthy();

    fireEvent.click(toggle);
    expect(view.getByRole('region', { name: '일간 시간표' })).toBeTruthy();
    // 강의실 열은 일간에서만 뜻이 있다 — 주간에서는 누를 수 없다(까닭은 title)
    fireEvent.click(view.getByRole('button', { name: '주간' }));
    expect((view.getByRole('button', { name: '세로선 나누기' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('주간 lane 은 셋까지 나란히, 넘치면 「+M」 — 누르면 그날 일간으로 간다 (N-74)', () => {
    const five = [1, 2, 3, 4, 5].map((id) => lesson(id, '2026-09-02'));
    mocks.occurrences.mockReturnValue({ data: { items: five }, isLoading: false, isError: false });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '주간' }));
    const week = view.getByRole('region', { name: '주간 시간표' });
    expect(week.querySelectorAll('[data-week-event]')).toHaveLength(3);
    const more = within(week).getByRole('button', { name: '2026-09-02 겹친 수업 2건 더 — 그날 일간으로' });
    expect(more.getAttribute('data-lane-more')).toBe('2');
    fireEvent.click(more);
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-02', to: '2026-09-02' });
    expect(view.getByRole('region', { name: '일간 시간표' })).toBeTruthy();
  });

  it('일간(날짜 한 열)의 「+M」은 그 묶음을 펼친다 — 같은 함수, 다른 행선지', () => {
    const five = [1, 2, 3, 4, 5].map((id) => lesson(id, '2026-09-01'));
    mocks.occurrences.mockReturnValue({ data: { items: five }, isLoading: false, isError: false });
    const view = render(<SchedulePage />);
    const day = view.getByRole('region', { name: '일간 시간표' });
    expect(day.querySelectorAll('[data-week-event]')).toHaveLength(3);
    expect(within(day).queryByRole('button', { name: /겹친 수업 5$/ })).toBeNull();
    fireEvent.click(within(day).getByRole('button', { name: '겹친 수업 5건 펼치기' }));
    // 펼친 목록에 다섯이 다 선다 — 감추지 않는다(lane 의 첫 셋은 그대로 있어 둘씩이다)
    expect(within(day).getAllByRole('button', { name: /겹친 수업 5$/ })).toHaveLength(1);
    expect(within(day).getAllByRole('button', { name: /겹친 수업 1$/ })).toHaveLength(2);
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-01' });
  });

  it('「≡ 회계」는 회계 경로에 들어갈 수 있을 때만 선다 — 역할이 아니라 경로 권한 판정 (N-100)', () => {
    const closed = render(<SchedulePage />);
    expect(closed.queryByRole('link', { name: '회계' })).toBeNull();
    closed.unmount();
    mocks.me = { id: 1, name: '대표', role: 'ceo', canAdminPage: true, canCrudAll: true, canMoney: true, mustChangeCredentials: false };
    const view = render(<SchedulePage />);
    const link = within(view.getByRole('region', { name: '스케줄 도구' })).getByRole('link', { name: '회계' });
    expect(link.getAttribute('href')).toBe('/accounting');
  });

  it('학생별 ↔ 선생님별로 축을 바꾸면 고른 사람을 놓고 새 축의 첫 사람이 골라진다 — 학생 번호가 강사 번호로 쓰이지 않는다 (W11 웹 크롤 · 404 /schedule/teachers/{학생 id}/guides)', () => {
    const view = render(<SchedulePage />);
    const target = () => within(view.getByRole('group', { name: '스케줄 대상' }));
    fireEvent.click(target().getByRole('button', { name: '학생별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 학생/ }));
    mocks.teacherGuides.mockClear();
    fireEvent.click(target().getByRole('button', { name: '선생님별' }));
    // 「안내 N」은 고른 **강사**의 수다 — 학생 1 이 강사 번호로 실려 나가면 서버는 404 다
    const asked = mocks.teacherGuides.mock.calls.map((c) => c[0]);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((id) => id === 11 || id === 22)).toBe(true);
    // 되돌아가도 강사 번호(11 · 22)가 학생 번호로 쓰이지 않는다 — 첫 학생이 다시 골라진다
    fireEvent.click(target().getByRole('button', { name: '학생별' }));
    const pressed = within(view.getByRole('region', { name: '학생 목록' })).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.textContent).toMatch(/선택 학생|다른 학생/);
  });

  it('§11 「안내 N」은 서버가 센 수 그대로 — 모르면 숫자를 짓지 않는다 (N-100)', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));
    expect(view.getByRole('link', { name: '안내' }).getAttribute('href')).toBe('/guides');
    expect(mocks.teacherGuides).toHaveBeenLastCalledWith(11);

    mocks.teacherGuides.mockReturnValue({ data: { teacherId: 11, unconfirmed: 2 } });
    view.rerender(<SchedulePage />);
    expect(view.getByRole('link', { name: '안내 2' }).getAttribute('href')).toBe('/guides');
  });

  it('§10 성별 아바타는 서버 낱말(여 · 남 · 비면 —), §11 역할 아바타는 이미 있는 역할 — 이름을 가리지 않는다 (N-83)', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '학생별' }));
    const students = view.getByRole('region', { name: '학생 목록' });
    expect(Array.from(students.querySelectorAll('[data-avatar="gender"]')).map((n) => n.textContent)).toEqual(['여', '—']);
    // 아바타는 읽기 이름에 끼지 않는다 — 줄의 이름은 여전히 학생 이름으로 시작한다
    expect(students.querySelector('[data-avatar]')!.getAttribute('aria-hidden')).toBe('true');
    expect(view.getByRole('button', { name: /^선택 학생/ })).toBeTruthy();

    fireEvent.click(within(view.getByRole('group', { name: '스케줄 대상' })).getByRole('button', { name: '선생님별' }));
    const teachers = view.getByRole('region', { name: '선생님 목록' });
    expect(teachers.querySelectorAll('[data-avatar="gender"]')).toHaveLength(0);
    expect(Array.from(teachers.querySelectorAll('[data-avatar="role"]')).map((n) => n.textContent)).toEqual(['강사', '강사']);
  });

  it('성별 아바타는 PNG 로 나가는 표에 싣지 않는다 — 찍는 순간 목록에 없다 (N-83)', async () => {
    let atCapture = -1;
    mocks.download.mockImplementation(async () => {
      atCapture = document.querySelectorAll('[data-avatar="gender"]').length;
    });
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '학생별' }));
    expect(view.container.querySelectorAll('[data-avatar="gender"]').length).toBe(2);
    await act(async () => fireEvent.click(view.getByRole('button', { name: '현재 스케줄을 PNG로 저장' })));
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(atCapture).toBe(0);
    // 다 찍고 나면 관리 화면에는 다시 선다
    expect(view.container.querySelectorAll('[data-avatar="gender"]').length).toBe(2);
  });
});
