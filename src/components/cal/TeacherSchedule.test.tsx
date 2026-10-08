/** @file-guide
 * 목적: TeacherSchedule.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';
import { ApiError } from '@/api/client';
import { LATE_TIERS_FIXTURE } from '@/components/teacher/late-tiers.fixture';
import { TeacherSchedule } from './TeacherSchedule';
import SchedulePage from '@/app/schedule/page';

const mocks = vi.hoisted(() => ({
  occurrences: vi.fn(), meta: vi.fn(), unwritten: vi.fn(), drawer: vi.fn(),
  horizon: vi.fn(), scheduleWrite: vi.fn(), holidays: vi.fn(), shell: vi.fn(), lessonHub: vi.fn(),
}));
const nav = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/api/queries', () => ({
  useOccurrences: mocks.occurrences, useMeta: mocks.meta, useUnwritten: mocks.unwritten, useDrawer: mocks.drawer,
  useHorizon: mocks.horizon, useScheduleWrite: mocks.scheduleWrite,
  // 공휴일 이름표(GET /schedule/holidays)·머리줄 서버 값(GET /teacher/shell) — 둘 다 서버 표에서 온다
  useScheduleHolidays: mocks.holidays, useTeacherShell: mocks.shell,
  useTeacherLessonHub: mocks.lessonHub,
  useCreateSettingRequest: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
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
    students: [{ id: 1, name: '담당 학생', grade: 'G9', droppedOnce: false, paused: false, late: false }], ...extra,
  };
}

function hubResult(serId = 1, onDate = '2026-09-07', date = '2026-09-07', reportEnabled = true) {
  const student = { studentId: 1, name: '담당 학생', grade: 'G9', school: '검증중', targetExam: null,
    guidance: '꼼꼼하게', lang: 'ko', weekCount: 1,
    lessons: [{ serId, onDate, date, startMin: 600, durMin: 60, subKey: 'writing', title: '선택 수업' }],
    books: [{ issueId: 3, code: 'WR-01', title: 'Writing Basic', subKey: 'writing', level: 'G9', seTe: 'SE', state: 'ok', stateLabel: '사용 중', issuedOn: date, returnedOn: null, reissuedFrom: null, reissuedTo: null }],
    diag: { onDate: date, levelSummary: '중급', strengths: '구성', weaknesses: '문법', curriculum: '문법 보강', byName: '관리자' },
    notes: [{ id: 4, body: '이전 진도를 먼저 확인', authorName: '관리자', createdAt: `${date}T09:00:00+09:00` }] };
  return { data: {
    lesson: { serId, onDate, date, startMin: 600, durMin: 60, kindKey: 'class', subKey: 'writing', mode: 'offline',
      title: '선택 수업', roomName: '2층 강의실', roomBranch: '강남', zaccLabel: null, students: '담당 학생', canceled: false, cancelKindLabel: null, repState: reportEnabled ? 'none' : 'plan' },
    guideStudents: [student],
    history: [
      { serId, onDate, date, startMin: 600, durMin: 60, kindKey: 'class', subKey: 'writing', mode: 'offline', title: '선택 수업', studentItems: [{ id: 1, name: '담당 학생' }], repState: 'none', canceled: false },
      { serId: 8, onDate: '2026-08-20', date: '2026-08-20', startMin: 720, durMin: 60, kindKey: 'class', subKey: 'writing', mode: 'offline', title: '지난 수업', studentItems: [{ id: 1, name: '담당 학생' }], repState: 'ok', canceled: false },
    ],
    capabilities: {
      report: { enabled: reportEnabled, reason: reportEnabled ? null : '수업 종료 후 리포트를 열 수 있습니다.' },
      guide: { enabled: true, reason: null }, history: { enabled: true, reason: null }, scheduleChange: { enabled: true, reason: null },
    },
  }, isLoading: false, isError: false, error: null };
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
  mocks.lessonHub.mockImplementation((serId: number | null, onDate: string | null, date: string | null, enabled: boolean) => (
    enabled && serId && onDate && date ? hubResult(serId, onDate, date) : { data: undefined, isLoading: false, isError: false, error: null }
  ));
  nav.search = '';
  nav.replace.mockClear();
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

describe('BOC-05b 강사 오늘·주간·월간 캘린더', () => {
  it('view와 anchor를 allowlist해 주간의 월요일~일요일만 읽고 같은 범위의 공휴일을 표시한다', () => {
    nav.search = 'view=week&anchor=2026-09-09';
    mocks.occurrences.mockReturnValue({ data: { items: [occurrence(3, '2026-09-09', 720)] }, isLoading: false, isError: false, refetch: vi.fn() });
    mocks.holidays.mockReturnValue({ data: { from: '2026-09-07', to: '2026-09-13', items: [{ date: '2026-09-09', name: '추석' }] } });

    const view = render(<TeacherSchedule />);

    expect(mocks.occurrences).toHaveBeenCalledWith({ from: '2026-09-07', to: '2026-09-13' });
    expect(mocks.holidays).toHaveBeenCalledWith({ from: '2026-09-07', to: '2026-09-13' }, true);
    const week = within(view.getByRole('region', { name: '주간 캘린더' }));
    expect(week.getByText('추석')).toBeTruthy();
    expect(week.getByRole('button', { name: /9\/9.*Writing/ })).toBeTruthy();
    expect(view.getByRole('button', { name: '주간' }).getAttribute('aria-pressed')).toBe('true');
    expect(view.queryByText('새 일정')).toBeNull();
  });

  it('월간은 달을 덮는 격자 범위를 읽고 하루 3건 뒤 나머지를 명시적으로 펼친다', () => {
    nav.search = 'view=month&anchor=2026-09-15';
    mocks.occurrences.mockReturnValue({ data: { items: [
      occurrence(1, '2026-09-09', 600), occurrence(2, '2026-09-09', 660),
      occurrence(3, '2026-09-09', 720), occurrence(4, '2026-09-09', 780),
    ] }, isLoading: false, isError: false, refetch: vi.fn() });

    const view = render(<TeacherSchedule />);

    expect(mocks.occurrences).toHaveBeenCalledWith({ from: '2026-08-31', to: '2026-10-04' });
    const day = view.container.querySelector('[data-month-date="2026-09-09"]') as HTMLElement;
    expect(day).not.toBeNull();
    expect(within(day).getAllByRole('button', { name: /9\/9.*Writing/ })).toHaveLength(3);
    fireEvent.click(within(day).getByRole('button', { name: '+1건 더' }));
    expect(within(day).getAllByRole('button', { name: /9\/9.*Writing/ })).toHaveLength(4);
  });

  it('보기·기간·날짜 이동은 URL 한 상태로 보존한다', () => {
    const view = render(<TeacherSchedule />);
    fireEvent.click(view.getByRole('button', { name: '주간' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/schedule?view=week&anchor=2026-09-07');

    nav.search = 'view=week&anchor=2026-09-09';
    view.rerender(<TeacherSchedule />);
    fireEvent.click(view.getByRole('button', { name: '다음 기간' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/schedule?view=week&anchor=2026-09-16');
    fireEvent.click(view.getByRole('button', { name: '9월 10일 (목) 오늘 보기' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/schedule?view=day&anchor=2026-09-10');
  });

  it('주·월 회차도 05a exact 허브를 열고 닫으면 원래 보기와 anchor로 복귀한다', () => {
    nav.search = 'view=week&anchor=2026-09-09';
    mocks.occurrences.mockReturnValue({ data: { items: [occurrence(7, '2026-09-09', 720, { onDate: '2026-09-01', repState: 'none' })] }, isLoading: false, isError: false, refetch: vi.fn() });
    const view = render(<TeacherSchedule />);

    fireEvent.click(view.getByRole('button', { name: /9\/9.*Writing/ }));
    expect(nav.replace).toHaveBeenLastCalledWith('/schedule?view=week&anchor=2026-09-09&serId=7&onDate=2026-09-01&date=2026-09-09&source=calendar');
    expect(view.getByRole('dialog', { name: '수업 허브' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '창 닫기' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/schedule?view=week&anchor=2026-09-09');
  });

  it('잘못된 view와 anchor는 KST 오늘 보기 범위로만 떨어지고 잘못된 날짜를 조회하지 않는다', () => {
    nav.search = 'view=agenda&anchor=2026-02-30';
    const view = render(<TeacherSchedule />);
    expect(mocks.occurrences).toHaveBeenCalledWith({ from: '2026-09-07', to: '2026-09-14' });
    expect(view.getByRole('button', { name: '오늘' }).getAttribute('aria-pressed')).toBe('true');
    expect(view.container.textContent).not.toContain('2026-02-30');
  });
});

describe('BOC-06b 강사 일정 변경·근접 건의 Front 계약 대기', () => {
  function exactLesson(date: string) {
    nav.search = `serId=7&onDate=${date}&date=${date}&source=calendar`;
    mocks.occurrences.mockImplementation(({ from }: { from: string }) => ({
      data: { items: from === date ? [occurrence(7, date, 600, { repState: 'none' })] : [] },
      isLoading: false, isError: false, refetch: vi.fn(),
    }));
  }

  it('정확히 10일째와 11일째 회차는 승인 요청 초안을 열고 서버 계약 전 제출·일정 이동을 잠근다', () => {
    for (const date of ['2026-09-17', '2026-09-18']) {
      exactLesson(date);
      const view = render(<TeacherSchedule />);

      fireEvent.click(view.getByRole('button', { name: '일정 변경 요청 열기' }));
      const dialog = within(view.getByRole('dialog', { name: '일정 변경 요청' }));
      expect(dialog.getByText(/관리자 승인 후 반영/)).toBeTruthy();
      expect(dialog.getByText(/승인 전에는 원래 일정/)).toBeTruthy();
      expect((dialog.getByLabelText('변경 날짜') as HTMLInputElement).value).toBe(date);
      expect((dialog.getByLabelText('새 시작') as HTMLInputElement).value).toBe('10:00');
      expect(dialog.getByRole('button', { name: '변경 요청 기능 준비 중' })).toHaveProperty('disabled', true);
      expect(mocks.scheduleWrite).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('9일 이내와 지난 회차는 exact identity가 붙은 건의 초안을 열고 일반 건의 writer로 우회하지 않는다', () => {
    for (const date of ['2026-09-16', '2026-09-06']) {
      exactLesson(date);
      const view = render(<TeacherSchedule />);

      fireEvent.click(view.getByRole('button', { name: '이 수업으로 건의 열기' }));
      const dialog = within(view.getByRole('dialog', { name: '수업 건의 초안' }));
      expect(dialog.getByText(/회차 #/).textContent).toContain(`회차 #7 · 원래 회차일 ${date}`);
      expect(dialog.getByRole('button', { name: '건의 기능 준비 중' })).toHaveProperty('disabled', true);
      expect(dialog.getByRole('link', { name: '건의 사항 전체 보기' }).getAttribute('href')).toBe('/teacher/suggestions');
      expect(mocks.scheduleWrite).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('요청 초안은 허브로 돌아갔다가 다시 열어도 보존하고 source 회차의 날짜·시각은 바꾸지 않는다', () => {
    exactLesson('2026-09-17');
    const view = render(<TeacherSchedule />);

    fireEvent.click(view.getByRole('button', { name: '일정 변경 요청 열기' }));
    let dialog = within(view.getByRole('dialog', { name: '일정 변경 요청' }));
    fireEvent.change(dialog.getByLabelText('변경 날짜'), { target: { value: '2026-09-19' } });
    fireEvent.change(dialog.getByLabelText('변경 사유'), { target: { value: '학생 일정과 협의한 변경 요청입니다.' } });
    fireEvent.click(dialog.getByRole('button', { name: '이 수업으로 돌아가기' }));
    expect(view.getByRole('dialog', { name: '수업 허브' })).toBeTruthy();
    expect(document.activeElement).toBe(view.getByRole('button', { name: '일정 변경 요청 열기' }));

    fireEvent.click(view.getByRole('button', { name: '일정 변경 요청 열기' }));
    dialog = within(view.getByRole('dialog', { name: '일정 변경 요청' }));
    expect((dialog.getByLabelText('변경 날짜') as HTMLInputElement).value).toBe('2026-09-19');
    expect((dialog.getByLabelText('변경 사유') as HTMLTextAreaElement).value).toBe('학생 일정과 협의한 변경 요청입니다.');
    expect(dialog.getByText(/현재 일정 · 2026-09-17 · 10:00–11:00/)).toBeTruthy();
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
    expect(view.getByRole('button', { name: '주간' }).getAttribute('aria-pressed')).toBe('false');
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

  it('모든 행은 같은 수업 허브를 열고 리포트·수업 상세 owner를 그 안에서 선택한다', () => {
    mocks.occurrences.mockReturnValue({ data: { items: [
      occurrence(1, '2026-09-07', 600, { onDate: '2026-09-01', repState: 'none' }),
      occurrence(2, '2026-09-07', 720, { canceled: true }),
      occurrence(3, '2026-09-07', 780, { kindKey: 'meeting', repState: 'na' }),
    ] }, isLoading: false, isError: false });
    mocks.lessonHub.mockImplementation((serId: number | null, onDate: string | null, date: string | null, enabled: boolean) => (
      enabled && serId && onDate && date ? hubResult(serId, onDate, date, serId === 1) : { data: undefined, isLoading: false, isError: false, error: null }
    ));
    const view = render(<TeacherSchedule />);
    const rows = within(view.getByRole('region', { name: '오늘 전체 스케줄' })).getAllByRole('button');
    fireEvent.click(rows[0]);
    expect(nav.replace).toHaveBeenCalledWith('/schedule?view=day&anchor=2026-09-07&serId=1&onDate=2026-09-01&date=2026-09-07&source=calendar');
    expect(view.getByRole('dialog', { name: '수업 허브' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '리포트 열기' }));
    expect(view.getByRole('dialog', { name: '리포트 상세' }).textContent).toContain('1|2026-09-01');
    fireEvent.click(view.getByRole('button', { name: '닫기' }));
    fireEvent.click(rows[1]);
    expect(view.getByRole('button', { name: '리포트 열기' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(view.getByRole('button', { name: '수업 정보 열기' }));
    expect(view.getByRole('dialog', { name: '수업 상세' }).textContent).toBe('2');
    fireEvent.click(rows[2]);
    expect(view.getByRole('button', { name: '리포트 열기' }).hasAttribute('disabled')).toBe(true);
  });

  it('직접 URL은 실제 날짜로 이동 회차를 읽고 serId+onDate+date가 정확히 같은 수업만 연다', () => {
    nav.search = 'serId=7&onDate=2026-09-01&date=2026-09-19';
    mocks.occurrences.mockImplementation(({ from }: { from: string }) => ({
      data: { items: from === '2026-09-19' ? [occurrence(7, '2026-09-19', 600, { onDate: '2026-09-01', repState: 'none' })] : [] },
      isLoading: false, isError: false, refetch: vi.fn(),
    }));
    const view = render(<TeacherSchedule />);
    expect(mocks.occurrences).toHaveBeenCalledWith({ from: '2026-09-19', to: '2026-09-19' }, true);
    expect(view.getByRole('dialog', { name: '수업 허브' }).textContent).toContain('9/19');
    fireEvent.click(view.getByRole('button', { name: '리포트 열기' }));
    expect(view.getByRole('dialog', { name: '리포트 상세' }).textContent).toContain('7|2026-09-01');
  });

  it('이동된 회차의 stale 직접 URL은 exact 서버 409 문구를 표시하고 다른 수업을 열지 않는다', () => {
    nav.search = 'serId=7&onDate=2026-09-01&date=2026-09-07';
    mocks.occurrences.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() });
    mocks.lessonHub.mockReturnValue({ data: undefined, isLoading: false, isError: true,
      error: new ApiError('TEACHER_LESSON_MOVED', '수업일이 변경되었습니다. 최신 일정에서 다시 열어 주세요.', 409, { actualDate: '2026-09-19' }) });
    const view = render(<TeacherSchedule />);
    expect(view.getByRole('alert').textContent).toContain('수업일이 변경되었습니다');
    expect(view.queryByRole('dialog', { name: '수업 허브' })).toBeNull();
  });

  it('잘못된 identity와 없는 회차는 다른 수업으로 대체하지 않고 복구 경로를 표시한다', () => {
    nav.search = 'serId=abc&onDate=2026-09-07&date=2026-09-07';
    const view = render(<TeacherSchedule />);
    expect(view.getByRole('alert').textContent).toContain('수업 주소가 올바르지 않습니다');
    expect(view.queryByRole('dialog', { name: '수업 허브' })).toBeNull();

    nav.search = 'serId=999&onDate=2026-09-07&date=2026-09-07';
    view.rerender(<TeacherSchedule />);
    expect(view.getByRole('alert').textContent).toContain('해당 수업을 찾을 수 없습니다');
    expect(view.queryByRole('dialog', { name: '수업 허브' })).toBeNull();
  });

  it('허브는 exact 안내·히스토리를 열고 이력의 다른 회차로 이동한다', () => {
    nav.search = 'serId=1&onDate=2026-09-07&date=2026-09-07&source=home';
    mocks.occurrences.mockReturnValue({ data: { items: [occurrence(1, '2026-09-07', 600)] }, isLoading: false, isError: false, refetch: vi.fn() });
    const view = render(<TeacherSchedule />);
    fireEvent.click(view.getByRole('button', { name: '수업 안내 열기' }));
    const guide = within(view.getByRole('dialog', { name: '수업 안내' }));
    expect(guide.getByText('꼼꼼하게')).toBeTruthy();
    expect(guide.getByText(/강남 · 2층 강의실/)).toBeTruthy();
    expect(guide.getByText('Writing Basic')).toBeTruthy();
    fireEvent.click(guide.getByRole('button', { name: '창 닫기' }));
    fireEvent.click(view.getByRole('button', { name: '학생 이력 열기' }));
    const history = within(view.getByRole('dialog', { name: '학생 수업 이력' }));
    expect(history.getByRole('combobox', { name: '학생 필터' })).toBeTruthy();
    expect(history.getByRole('region', { name: '2026-08 수업 이력' })).toBeTruthy();
    fireEvent.click(history.getByRole('button', { name: /8\/20.*Writing/ }));
    expect(nav.replace).toHaveBeenCalledWith('/schedule?view=day&anchor=2026-08-20&serId=8&onDate=2026-08-20&date=2026-08-20&source=calendar');
    expect(view.getByRole('link', { name: '건의 사항 열기' }).getAttribute('href')).toBe('/teacher/suggestions');
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
    expect(mocks.occurrences).toHaveBeenCalledWith({ from: '2026-09-07', to: '2026-09-14' });
    act(() => vi.advanceTimersByTime(1000));
    expect(mocks.occurrences).toHaveBeenCalledWith({ from: '2026-09-08', to: '2026-09-15' });
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
    fireEvent.click(view.getByRole('button', { name: '리포트 열기' }));
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
