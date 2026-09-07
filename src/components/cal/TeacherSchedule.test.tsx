import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';
import { TeacherSchedule } from './TeacherSchedule';
import SchedulePage from '@/app/schedule/page';

const mocks = vi.hoisted(() => ({
  occurrences: vi.fn(), meta: vi.fn(), unwritten: vi.fn(), drawer: vi.fn(),
  horizon: vi.fn(), scheduleWrite: vi.fn(),
}));
vi.mock('@/api/queries', () => ({
  useOccurrences: mocks.occurrences, useMeta: mocks.meta, useUnwritten: mocks.unwritten, useDrawer: mocks.drawer,
  useHorizon: mocks.horizon, useScheduleWrite: mocks.scheduleWrite,
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/store/useSession', () => ({ useCan: () => false }));
vi.mock('@/components/report/ReportDetailDrawer', () => ({
  ReportDetailDrawer: ({ selection, onClose }: { selection: { serId: number; onDate: string } | null; onClose: () => void }) =>
    selection ? <div role="dialog" aria-label="리포트 상세">{selection.serId}|{selection.onDate}<textarea aria-label="리포트 초안" /><button onClick={onClose}>닫기</button></div> : null,
}));
vi.mock('@/components/lesson/LessonDetail', () => ({
  LessonDetail: ({ occ }: { occ: Occurrence | null }) => occ ? <div role="dialog" aria-label="수업 상세">{occ.serId}</div> : null,
}));

function occurrence(serId: number, date: string, startMin: number, extra: Partial<Occurrence> = {}): Occurrence {
  return {
    serId, date, onDate: date, startMin, endMin: startMin + 60, kindKey: 'class', subKey: 'writing',
    mode: 'offline', roomName: '2층 강의실', canceled: false, hasException: false, recurring: true,
    repState: 'plan', written: false, attendanceMode: 'unavailable', attendance: null,
    students: [{ id: 1, name: '담당 학생', grade: 'G9', droppedOnce: false }], ...extra,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T00:00:00Z'));
  mocks.occurrences.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() });
  mocks.meta.mockReturnValue({ data: {
    kinds: [{ key: 'class', name: '수업', rep: true }, { key: 'meeting', name: '회의', rep: false }],
    subs: [{ key: 'writing', name: 'Writing' }], zaccs: [{ id: 1, label: 'TN 학원 1번방' }],
  } });
  mocks.unwritten.mockReturnValue({ data: { total: 2 }, isLoading: false, isError: false, refetch: vi.fn() });
  mocks.drawer.mockReturnValue({ data: { approvals: { mine: [] }, changeReqs: [] }, isLoading: false, isError: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('강사 캘린더 기본 오늘 목록', () => {
  it('캘린더 route가 강사에게 관리자 격자·일정 쓰기 hook을 mount하지 않는다', () => {
    const view = render(<SchedulePage />);
    expect(view.getByRole('heading', { name: '캘린더', level: 1 })).toBeTruthy();
    expect(view.getByRole('region', { name: '오늘 전체 스케줄' })).toBeTruthy();
    expect(mocks.horizon).not.toHaveBeenCalled();
    expect(mocks.scheduleWrite).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('input,select,textarea').length).toBe(0);
  });

  it('오늘과 앞으로 7일을 한 범위로 읽고 시간순 목록·학생·장소·상태를 표시한다', () => {
    mocks.occurrences.mockReturnValue({ data: { items: [
      occurrence(2, '2026-09-07', 900, { mode: 'online', zaccId: 1 }),
      occurrence(1, '2026-09-07', 600, { repState: 'none' }),
      occurrence(3, '2026-09-09', 720),
    ] }, isLoading: false, isError: false });
    const view = render(<TeacherSchedule />);
    expect(mocks.occurrences).toHaveBeenCalledWith({ from: '2026-09-07', to: '2026-09-14' });
    const today = within(view.getByRole('region', { name: '오늘 전체 스케줄' }));
    const rows = today.getAllByRole('button');
    expect(rows[0].textContent).toContain('10:00');
    expect(rows[1].textContent).toContain('15:00');
    expect(today.getByText('TN 학원 1번방')).toBeTruthy();
    expect(today.getByText('2층 강의실')).toBeTruthy();
    expect(today.getByText('수업 예정')).toBeTruthy();
    expect(today.getByText('리포트 미작성')).toBeTruthy();
    expect(view.getByText('오늘 수업 2건 · 시수 2.0시간')).toBeTruthy();
    expect(view.queryByText('주간')).toBeNull();
    expect(view.queryByText('새 일정')).toBeNull();
  });

  it('리포트 대상 행은 원래 날짜 키로 공용 상세를 열고 취소·비대상은 수업 상세를 연다', () => {
    mocks.occurrences.mockReturnValue({ data: { items: [
      occurrence(1, '2026-09-07', 600, { onDate: '2026-09-01' }),
      occurrence(2, '2026-09-07', 720, { canceled: true }),
      occurrence(3, '2026-09-07', 780, { kindKey: 'meeting', repState: 'na' }),
    ] }, isLoading: false, isError: false });
    const view = render(<TeacherSchedule />);
    const rows = within(view.getByRole('region', { name: '오늘 전체 스케줄' })).getAllByRole('button');
    fireEvent.click(rows[0]);
    expect(view.getByRole('dialog', { name: '리포트 상세' }).textContent).toContain('1|2026-09-01');
    fireEvent.click(view.getByRole('button', { name: '닫기' }));
    fireEvent.click(rows[1]);
    expect(view.getByRole('dialog', { name: '수업 상세' }).textContent).toBe('2');
    fireEvent.click(rows[2]);
    expect(view.getByRole('dialog', { name: '수업 상세' }).textContent).toBe('3');
  });

  it('로딩·오류를 수업 0건으로 표시하지 않고 정상 빈 상태를 구별한다', () => {
    mocks.occurrences.mockReturnValue({ isLoading: true, isError: false });
    const view = render(<TeacherSchedule />);
    expect(view.getByRole('status').textContent).toContain('불러오는 중');
    expect(view.queryByText(/오늘 수업 0건/)).toBeNull();
    mocks.occurrences.mockReturnValue({ isLoading: false, isError: true, refetch: vi.fn() });
    view.rerender(<TeacherSchedule />);
    expect(view.getByRole('alert').textContent).toContain('불러오지 못했습니다');
    expect(view.queryByText('오늘 수업이 없습니다.')).toBeNull();
    mocks.occurrences.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false });
    view.rerender(<TeacherSchedule />);
    expect(view.getByText('오늘 수업이 없습니다.')).toBeTruthy();
    expect(view.getByText('앞으로 7일 동안 예정된 수업이 없습니다.')).toBeTruthy();
  });

  it('KST 자정이 지나면 오늘과 요청 범위를 갱신한다', () => {
    vi.setSystemTime(new Date('2026-09-07T14:59:59Z'));
    render(<TeacherSchedule />);
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-07', to: '2026-09-14' });
    act(() => vi.advanceTimersByTime(1000));
    expect(mocks.occurrences).toHaveBeenLastCalledWith({ from: '2026-09-08', to: '2026-09-15' });
  });

  it('처음과 초마다 중복 요청하지 않고 분 경계에서 서버 상태를 다시 읽으며 해제한다', () => {
    const refetch = vi.fn();
    const refetchUnwritten = vi.fn();
    mocks.occurrences.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, refetch });
    mocks.unwritten.mockReturnValue({ data: { total: 2 }, refetch: refetchUnwritten });
    const view = render(<TeacherSchedule />);
    expect(refetch).not.toHaveBeenCalled();
    expect(refetchUnwritten).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(59_999));
    expect(refetch).not.toHaveBeenCalled();
    expect(refetchUnwritten).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(refetch).toHaveBeenCalledOnce();
    expect(refetchUnwritten).toHaveBeenCalledOnce();
    view.unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(refetch).toHaveBeenCalledOnce();
    expect(refetchUnwritten).toHaveBeenCalledOnce();
  });

  it('23:59에 작성하던 리포트는 자정에 오늘 목록이 비어도 선택과 초안을 유지한다', () => {
    vi.setSystemTime(new Date('2026-09-07T14:59:59Z'));
    const refetch = vi.fn();
    const refetchUnwritten = vi.fn();
    mocks.unwritten.mockReturnValue({ data: { total: 2 }, refetch: refetchUnwritten });
    mocks.occurrences.mockImplementation(({ from }: { from: string }) => ({
      data: { items: from === '2026-09-07' ? [occurrence(1, from, 600, { repState: 'none', onDate: '2026-09-01' })] : [] },
      isLoading: false, isError: false, refetch,
    }));
    const view = render(<TeacherSchedule />);
    fireEvent.click(within(view.getByRole('region', { name: '오늘 전체 스케줄' })).getByRole('button'));
    const draft = view.getByRole('textbox', { name: '리포트 초안' }) as HTMLTextAreaElement;
    fireEvent.change(draft, { target: { value: '자정에도 작성 중인 내용' } });
    act(() => vi.advanceTimersByTime(1000));
    expect(view.getByText('오늘 수업이 없습니다.')).toBeTruthy();
    expect(view.getByRole('dialog', { name: '리포트 상세' }).textContent).toContain('1|2026-09-01');
    expect(view.getByRole('textbox', { name: '리포트 초안' })).toBe(draft);
    expect(draft.value).toBe('자정에도 작성 중인 내용');
    expect(refetch).not.toHaveBeenCalled();
    expect(refetchUnwritten).toHaveBeenCalledOnce();
  });

  it('탭 복귀에 회차와 공유 미작성 건수를 갱신하고 unmount 후에는 요청하지 않는다', () => {
    const refetch = vi.fn();
    const refetchUnwritten = vi.fn();
    mocks.occurrences.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, refetch });
    mocks.unwritten.mockReturnValue({ data: { total: 2 }, refetch: refetchUnwritten });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const view = render(<TeacherSchedule />);
    fireEvent(document, new Event('visibilitychange'));
    expect(refetch).toHaveBeenCalledOnce();
    expect(refetchUnwritten).toHaveBeenCalledOnce();
    view.unmount();
    fireEvent(document, new Event('visibilitychange'));
    expect(refetch).toHaveBeenCalledOnce();
    expect(refetchUnwritten).toHaveBeenCalledOnce();
  });
});
