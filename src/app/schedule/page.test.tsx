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

const mocks = vi.hoisted(() => ({
  occurrences: vi.fn(), write: vi.fn(), meta: vi.fn(), detail: vi.fn(),
  download: vi.fn(), conflicts: vi.fn(),
  permissions: { canAdminPage: true, canCrudAll: true } as Record<string, boolean>,
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
vi.mock('@/store/useSession', () => ({ useCan: (key: string) => mocks.permissions[key] ?? false }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children, drawerEntry }: {
  children: ReactNode; drawerEntry?: { pane: string; identity: string } | null;
}) => <div data-drawer-entry={drawerEntry ? `${drawerEntry.pane}:${drawerEntry.identity}` : undefined}>{children}</div> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/cal/SessionEditor', () => ({ SessionEditor: () => null }));
vi.mock('@/components/cal/TeacherSchedule', () => ({ TeacherSchedule: () => <div>오늘 수업</div> }));
vi.mock('@/components/lesson/LessonDetail', () => ({ LessonDetail: ({ occ }: { occ: Occurrence | null }) => {
  mocks.detail(occ); return null;
} }));
vi.mock('@/api/queries', () => ({
  useOccurrences: mocks.occurrences,
  useScheduleWrite: () => ({ mutate: mocks.write }),
  useHorizon: () => ({ data: { from: '2026-01-01', to: '2026-12-31' } }),
  useMeta: mocks.meta,
  useDrawer: () => ({ data: { approvals: { count: 0 }, notis: [] } }),
  fetchConflicts: mocks.conflicts,
}));
vi.mock('@/lib/png-export', () => ({ downloadElementPng: mocks.download }));

import SchedulePage from './page';

const meta: Meta = {
  kinds: [{ key: 'class', name: '수업', color: '#654321', cap: 4, grp: 'lesson', rep: true }],
  subs: [{ key: 'writing', name: 'Writing', color: '#123456' }], rooms: [], zaccs: [], invTypes: [],
  students: [{ id: 1, name: '선택 학생', grade: 'G10' }, { id: 2, name: '다른 학생' }],
  staff: [
    { id: 11, name: '선택 강사', role: 'teacher', canAdminPage: false, canGpaPack: false },
    { id: 22, name: '다른 강사', role: 'teacher', canAdminPage: false, canGpaPack: false },
  ],
};

const items: Occurrence[] = [1, 2].map((id) => ({
  serId: id, date: '2026-09-01', onDate: '2026-09-01', startMin: 600 + id * 60,
  endMin: 660 + id * 60, kindKey: 'class', title: id === 1 ? '선택된 수업' : '다른 수업',
  teacherId: id * 11, mode: 'offline', canceled: false, hasException: false, recurring: false,
  repState: 'plan', ended: false, written: false, attendanceMode: 'unavailable', attendance: null,
  students: [{ id, name: id === 1 ? '선택 학생' : '다른 학생', droppedOnce: false }],
}));

beforeEach(() => {
  nav.search = '';
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
  mocks.occurrences.mockReturnValue({ data: { items }, isLoading: false, isError: false });
  mocks.meta.mockReturnValue({ data: meta });
  mocks.download.mockResolvedValue(undefined);
  mocks.conflicts.mockResolvedValue([]);
  mocks.permissions.canAdminPage = true;
  mocks.permissions.canCrudAll = true;
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

    fireEvent.click(view.getByRole('button', { name: '전체' }));
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

describe('관리자 날짜 선택의 일간 진입과 pane 보존', () => {
  it.each(['주간', '월간'])('%s 날짜 클릭은 해당 날짜 일간으로 전환한다', (viewName) => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: viewName }));
    fireEvent.click(view.getByRole('button', { name: '2026-09-02 (수) 날짜 선택' }));

    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-02', to: '2026-09-02' });
    expect(view.getByText('시각')).toBeTruthy();
    expect(view.queryByRole('button', { name: '2026-09-02 (수) 날짜 선택' })).toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('분할된 오른쪽 월간의 날짜 선택이 왼쪽 날짜·보기를 변경하지 않는다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '월간' }));
    fireEvent.click(view.getByRole('button', { name: '세로로 나누기' }));
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
    expect(within(right).getByText('시각')).toBeTruthy();
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
    expect(view.queryByText('시각')).toBeNull();
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

  it('원본에 있으나 여는 화면이 없는 진입 넷은 빈칸이 아니라 이유를 단 비활성 단추다', () => {
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: '선생님별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 강사/ }));

    for (const label of ['가능 시간', '안내', '정산', '메모']) {
      const button = view.getByRole('button', { name: label });
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.getAttribute('title')).toBeTruthy();
    }
    // 학생별에는 원본에도 넷이 없다 — 모양을 맞추려고 같은 단추를 세우지 않는다
    fireEvent.click(view.getByRole('button', { name: '학생별' }));
    fireEvent.click(view.getByRole('button', { name: /^선택 학생/ }));
    expect(view.queryByRole('button', { name: '정산' })).toBeNull();
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
    mocks.conflicts.mockResolvedValue([
      { serId: 9, onDate: '2026-09-02', startMin: 900, endMin: 960, with: 'room', whoName: '현장 3호' },
    ]);
    const view = render(<SchedulePage />);
    finish(drop(items[0]));

    // 물어보는 자리는 **놓으려던 곳**이다 — 원래 자리가 아니다
    expect(mocks.conflicts).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-09-02', startMin: 915, roomId: 3, exceptSerId: 1,
    }));
    expect(view.getByText(/같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다/)).toBeTruthy();
    // 설명은 한 왕복 뒤에 붙는다 — 가짜 타이머를 쓰는 스위트라 microtask 만 흘려보낸다
    await act(async () => { await Promise.resolve(); });
    expect(view.getByText(/현장 3호 \(강의실\)/)).toBeTruthy();
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
    expect(mocks.conflicts).not.toHaveBeenCalled();
    expect(view.getByText('값이 허용 범위를 벗어났습니다')).toBeTruthy();
  });

  it('설명을 못 가져와도 원래 문구는 그대로 선다 — 실패가 실패를 덮지 않는다', async () => {
    mocks.write.mockImplementation((_cmd: unknown, opts: { onError?: (e: unknown) => void }) => opts.onError?.(conflictError));
    mocks.conflicts.mockRejectedValue(new Error('네트워크'));
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
    const view = render(<SchedulePage />);
    fireEvent.click(view.getByRole('button', { name: viewName }));
    const before = { drag: mocks.context!.draggableNodes.size, drop: mocks.context!.droppableContainers.size };
    fireEvent.click(view.getByRole('button', { name: '세로로 나누기' }));
    expect(mocks.context!.draggableNodes.size).toBe(before.drag * 2);
    expect(mocks.context!.droppableContainers.size).toBe(before.drop * 2);
    expect(view.getAllByRole('button', { name: /선택된 수업/ })).toHaveLength(2);
  });
});

describe('월간 상단 집계와 날짜 칸이 같은 것을 센다 (v2 §09 · N-19)', () => {
  const occurrence = (serId: number, date: string, extra: Partial<Occurrence> = {}): Occurrence => ({
    serId, date, onDate: date, startMin: 600, endMin: 690, kindKey: 'class', title: `수업 ${serId}`,
    mode: 'offline', canceled: false, hasException: false, recurring: false,
    repState: 'plan', ended: false, written: false, attendanceMode: 'unavailable', attendance: null, students: [], ...extra,
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
    const badge = within(head).queryByText(/건$/);
    return badge ? Number(badge.textContent!.replace('건', '')) : 0;
  };

  it('이 달 칸 건수 합 = 상단 「일정 N건」 — 흐린 앞뒤 달 칸은 그려지되 세지 않는다', () => {
    const view = openMonth();
    const grid = monthGrid('2026-09-01');
    const mine = grid.filter((d) => d.startsWith('2026-09'));
    const sum = mine.reduce((total, d) => total + cellCount(view, d), 0);

    expect(sum).toBe(month.length);
    expect(view.getByTitle(/이 달 1일~말일 기준/).textContent).toBe(`일정 ${sum}건`);
    // 머리에 적힌 수도 같아야 한다 — 같은 「9월」 옆에 두 수가 붙으면 그것이 원문의 어긋남이다
    expect(view.getByTitle(/아래 표의 「일정 N건」과 같은 수/).textContent!.trim()).toBe(`${sum}건`);

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
