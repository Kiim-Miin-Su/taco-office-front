/** @file-guide
 * 목적: TeacherSchedule.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';
import { LATE_TIERS_FIXTURE } from '@/components/teacher/late-tiers.fixture';
import { TeacherSchedule } from './TeacherSchedule';
import SchedulePage from '@/app/schedule/page';

const mocks = vi.hoisted(() => ({
  occurrences: vi.fn(), meta: vi.fn(), unwritten: vi.fn(), drawer: vi.fn(),
  horizon: vi.fn(), scheduleWrite: vi.fn(), holidays: vi.fn(), shell: vi.fn(),
}));
vi.mock('@/api/queries', () => ({
  useOccurrences: mocks.occurrences, useMeta: mocks.meta, useUnwritten: mocks.unwritten, useDrawer: mocks.drawer,
  useHorizon: mocks.horizon, useScheduleWrite: mocks.scheduleWrite,
  // 공휴일 이름표(GET /schedule/holidays)·머리줄 서버 값(GET /teacher/shell) — 둘 다 서버 표에서 온다
  useScheduleHolidays: mocks.holidays, useTeacherShell: mocks.shell,
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/store/useSession', () => ({
  useCan: () => false,
  // 강사 표면 — 정책 띠(LateReportPolicy)가 세션 플래그만 본다
  useSession: <T,>(select: (state: { me: { canAdminPage: boolean } }) => T) => select({ me: { canAdminPage: false } }),
}));
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
    repState: 'plan', ended: false, written: false, extra: false, attendanceMode: 'unavailable', attendance: null,
    students: [{ id: 1, name: '담당 학생', grade: 'G9', droppedOnce: false, paused: false }], ...extra,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T00:00:00Z'));
  mocks.occurrences.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() });
  mocks.meta.mockReturnValue({ data: {
    kinds: [{ key: 'class', name: '수업', rep: true }, { key: 'meeting', name: '회의', rep: false }],
    subs: [{ key: 'writing', name: 'Writing' }], zaccs: [{ id: 1, label: 'TN 학원 1번방' }],
    lateReportTiers: LATE_TIERS_FIXTURE,
  } });
  mocks.unwritten.mockReturnValue({ data: { total: 2 }, isLoading: false, isError: false, refetch: vi.fn() });
  mocks.drawer.mockReturnValue({ data: { approvals: { mine: [] }, changeReqs: [] }, isLoading: false, isError: false });
  mocks.holidays.mockReturnValue({ data: { from: '2026-09-07', to: '2026-09-14', items: [] } });
  mocks.shell.mockReturnValue({ data: { timezone: 'Asia/Seoul', tzLabel: 'Seoul · UTC+9', wageRate: 45000, notis: [], unread: 0, notiWindowDays: 30 } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('강사 캘린더 — 덱 slide 11·12 대조 (wave 6)', () => {
  it('다가오는 수업은 날짜로 묶이고 묶음 머리에 「N일 뒤 · N건」과 공휴일 이름표가 선다', () => {
    mocks.occurrences.mockReturnValue({ data: { items: [
      occurrence(3, '2026-09-09', 720),
      occurrence(4, '2026-09-09', 900),
      occurrence(5, '2026-09-10', 600),
    ] }, isLoading: false, isError: false });
    mocks.holidays.mockReturnValue({ data: { from: '2026-09-07', to: '2026-09-14', items: [{ date: '2026-09-09', name: '추석' }] } });
    const view = render(<TeacherSchedule />);
    // 공휴일은 서버 표에서 — 조회 범위는 목록과 같은 오늘~7일 뒤
    expect(mocks.holidays).toHaveBeenCalledWith({ from: '2026-09-07', to: '2026-09-14' }, true);
    const upcoming = within(view.getByRole('region', { name: '다가오는 수업' }));
    const groups = upcoming.getAllByRole('group');
    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute('aria-label')).toContain('9월 9일');
    expect(within(groups[0]).getByText('2일 뒤')).toBeTruthy();
    expect(within(groups[0]).getByText('2건')).toBeTruthy();
    expect(within(groups[0]).getByText('추석')).toBeTruthy();
    expect(within(groups[0]).getAllByRole('button')).toHaveLength(2);
    expect(within(groups[1]).queryByText('추석')).toBeNull();
  });

  it('오늘이 공휴일이면 오늘 스케줄 머리에 이름표가 선다', () => {
    mocks.holidays.mockReturnValue({ data: { from: '2026-09-07', to: '2026-09-14', items: [{ date: '2026-09-07', name: '임시 공휴일' }] } });
    const view = render(<TeacherSchedule />);
    expect(within(view.getByRole('region', { name: '오늘 전체 스케줄' })).getByText('임시 공휴일')).toBeTruthy();
  });

  it('안 쓴 리포트가 있으면 덱의 빨간 띠 — 수는 서버 미작성 건수, 「빨간 수업 보러가기」는 리포트로 간다', () => {
    const view = render(<TeacherSchedule />);
    const alert = view.getByRole('link', { name: '빨간 수업 보러가기' });
    expect(alert.getAttribute('href')).toBe('/reports');
    expect(view.container.textContent).toContain('리포트를 안 쓴 수업이 2건 있습니다');
    mocks.unwritten.mockReturnValue({ data: { total: 0 }, isLoading: false, isError: false, refetch: vi.fn() });
    view.rerender(<TeacherSchedule />);
    expect(view.queryByRole('link', { name: '빨간 수업 보러가기' })).toBeNull();
  });

  it('오른쪽 「색이 뜻하는 것」은 줄 배지와 같은 낱말을 쓴다', () => {
    const view = render(<TeacherSchedule />);
    const legend = within(view.getByRole('complementary', { name: '내 수업 할 일' }));
    expect(legend.getByText('리포트 미작성')).toBeTruthy();
    expect(legend.getByText('수업 예정')).toBeTruthy();
    expect(legend.getByText('취소된 수업 · 리포트 대상 아님')).toBeTruthy();
  });

  it('hero 시각의 기준 낱말은 강사 본인 시간대(서버 tzLabel)다 — 서울을 글자로 박지 않는다', () => {
    mocks.shell.mockReturnValue({ data: { timezone: 'America/New_York', tzLabel: 'New York · UTC-4', wageRate: null, notis: [], unread: 0, notiWindowDays: 30 } });
    const view = render(<TeacherSchedule />);
    expect(view.container.textContent).toContain('New York · UTC-4 기준');
    expect(view.container.textContent).not.toContain('KST');
    // 2026-09-07T00:00Z 는 뉴욕 9/6 20:00
    expect(view.container.querySelector('[data-teacher-clock]')?.textContent).toContain('20:00');
  });
});

describe('강사 캘린더 기본 오늘 목록', () => {
  it('강사 정책(리포트 지각 차감)이 화면 최상단 — 제목보다 위에 선다 (대표 결정 2026-09-25)', () => {
    const view = render(<TeacherSchedule />);
    const note = view.getByRole('note', { name: '리포트 지각 제출 차감' });
    expect(note.textContent).toContain('1시간 지각 시5,000원 차감');
    // 띠 다음이 곧 본문(hero) — 화면 이름은 셸 머리줄 한 곳이라 본문에 같은 h1 이 없다 (wave 6)
    const hero = view.container.querySelector('[data-teacher-hero]');
    expect(hero).not.toBeNull();
    expect(note.compareDocumentPosition(hero as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('캘린더 route가 강사에게 관리자 격자·일정 쓰기 hook을 mount하지 않는다', () => {
    const view = render(<SchedulePage />);
    expect(view.queryByRole('heading', { level: 1 })).toBeNull();
    expect(view.getByRole('region', { name: '오늘 전체 스케줄' })).toBeTruthy();
    expect(mocks.horizon).not.toHaveBeenCalled();
    expect(mocks.scheduleWrite).not.toHaveBeenCalled();
    expect(mocks.drawer).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('input,select,textarea').length).toBe(0);
    expect(view.queryByText('관리자 승인 대기')).toBeNull();
    expect(view.queryByText('스케줄 변경 요청 중')).toBeNull();
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
    // hero 는 홈과 같은 부품·같은 표기(정각이면 정수) — 덱 「오늘 수업 3건 · 시수 5.5시간」
    expect(view.getByText('오늘 수업 2건 · 시수 2시간')).toBeTruthy();
    expect(view.queryByText('주간')).toBeNull();
    expect(view.queryByText('새 일정')).toBeNull();
  });

  it('현재 시각보다 먼저 끝난 오늘 수업도 예정 수업과 함께 숨기지 않는다', () => {
    vi.setSystemTime(new Date('2026-09-07T09:00:00Z')); // KST 18:00
    mocks.occurrences.mockReturnValue({ data: { items: [
      occurrence(1, '2026-09-07', 600, { endMin: 660, ended: true, repState: 'none' }),
      occurrence(2, '2026-09-07', 1140),
    ] }, isLoading: false, isError: false });

    const view = render(<TeacherSchedule />);
    const today = within(view.getByRole('region', { name: '오늘 전체 스케줄' }));
    expect(today.getByRole('button', { name: /10:00–11:00/ })).toBeTruthy();
    expect(today.getByRole('button', { name: /19:00–20:00/ })).toBeTruthy();
    expect(today.getAllByRole('button')).toHaveLength(2);
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
