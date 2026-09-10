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

const mocks = vi.hoisted(() => ({
  occurrences: vi.fn(), write: vi.fn(), meta: vi.fn(),
  drag: null as DndContextProps | null,
  context: null as ReturnType<typeof useDndContext> | null,
}));
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
vi.mock('@/store/useSession', () => ({ useCan: () => true }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/cal/SessionEditor', () => ({ SessionEditor: () => null }));
vi.mock('@/components/cal/TeacherSchedule', () => ({ TeacherSchedule: () => null }));
vi.mock('@/components/lesson/LessonDetail', () => ({ LessonDetail: () => null }));
vi.mock('@/api/queries', () => ({
  useOccurrences: mocks.occurrences,
  useScheduleWrite: () => ({ mutate: mocks.write }),
  useHorizon: () => ({ data: { from: '2026-01-01', to: '2026-12-31' } }),
  useMeta: mocks.meta,
}));

import SchedulePage from './page';

const meta: Meta = {
  kinds: [{ key: 'class', name: '수업', color: '#654321', cap: 4, grp: 'lesson', rep: true }],
  subs: [{ key: 'writing', name: 'Writing', color: '#123456' }], rooms: [], zaccs: [],
  students: [{ id: 1, name: '선택 학생', grade: 'G10' }, { id: 2, name: '다른 학생' }],
  staff: [{ id: 11, name: '선택 강사', role: 'teacher' }, { id: 22, name: '다른 강사', role: 'teacher' }],
};

const items: Occurrence[] = [1, 2].map((id) => ({
  serId: id, date: '2026-09-01', onDate: '2026-09-01', startMin: 600 + id * 60,
  endMin: 660 + id * 60, kindKey: 'class', title: id === 1 ? '선택된 수업' : '다른 수업',
  teacherId: id * 11, mode: 'offline', canceled: false, hasException: false, recurring: false,
  repState: 'plan', written: false, attendanceMode: 'unavailable', attendance: null,
  students: [{ id, name: id === 1 ? '선택 학생' : '다른 학생', droppedOnce: false }],
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
  mocks.occurrences.mockReturnValue({ data: { items }, isLoading: false, isError: false });
  mocks.meta.mockReturnValue({ data: meta });
});

describe('관리자 모든 보기의 과목색·하단 범례 공유', () => {
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
    fireEvent.click(view.getByRole('button', { name: '표 분할' }));
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
    fireEvent.click(view.getByRole('button', { name: '표 분할' }));
    expect(mocks.context!.draggableNodes.size).toBe(before.drag * 2);
    expect(mocks.context!.droppableContainers.size).toBe(before.drop * 2);
    expect(view.getAllByRole('button', { name: /선택된 수업/ })).toHaveLength(2);
  });
});
