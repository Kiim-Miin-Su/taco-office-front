/** @file-guide
 * 목적: ReportWeekly.test.tsx — §47 주간 트래킹(N-54) 화면이 서버 묶음 · 플래그 · 막힌 이유 · 본문을 그대로 그리고 입력을 DTO 모양으로 보내는지 본다.
 * 책임/재사용: 훅과 보호자 발송 창은 대역이다 — 발송 판정 · 원장은 서버 시험(reports-weekly-db)이 본다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeeklyBundle, WeeklyBundleList } from '@/api/types';

const mocks = vi.hoisted(() => ({ weekly: vi.fn(), save: vi.fn(), mutate: vi.fn(), dialog: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useReportWeekly: mocks.weekly,
  useReportWeeklySummary: mocks.save,
}));
vi.mock('../guardians/GuardianSendDialog', () => ({ GuardianSendDialog: mocks.dialog }));

import { ReportWeekly } from './ReportWeekly';

const lesson = (over: Partial<WeeklyBundle['lessons'][number]> = {}): WeeklyBundle['lessons'][number] => ({
  repId: 11, serId: 21, onDate: '2026-08-04', date: '2026-08-04', startMin: 600, endMin: 660,
  subjectName: 'SAT Reading', teacherName: '김재훈', state: 'ok', stateLabel: '승인 완료', written: true, approved: true,
  body: { content: '수업', progress: '12쪽', homework: '13쪽' }, ...over,
});

const bundle = (over: Partial<WeeklyBundle> = {}): WeeklyBundle => ({
  studentId: 1, studentName: '고은설', grade: 'G9', wrepId: null, summary: null, legacy: false,
  lessons: [lesson()], lessonCount: 1, approvedCount: 1,
  canWriteSummary: true, summaryBlockedReason: null,
  canSend: false, sendBlockedReason: '총평을 먼저 써야 보낼 수 있습니다',
  plainText: null, subject: '고은설 학생 주간 리포트 · 08-03 ~ 08-09',
  sentAt: null, attemptCount: 0, lastAttemptAt: null, ...over,
});

const list = (bundles: WeeklyBundle[]): WeeklyBundleList => ({
  weekOf: '2026-08-03', weekTo: '2026-08-09', label: '08-03 ~ 08-09', total: bundles.length,
  remaining: bundles.filter((b) => b.sentAt === null).length, bundles,
});

describe('§47 주간 트래킹 — 서버 묶음 그대로 (N-54)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockReturnValue({ mutate: mocks.mutate, isPending: false, isError: false });
    mocks.dialog.mockReturnValue(null);
  });

  it('서버 수 · 막힌 이유를 그대로 적고 보낼 수 없으면 단추가 잠긴다', () => {
    mocks.weekly.mockReturnValue({ data: list([bundle()]), isLoading: false, isError: false });
    const view = render(<ReportWeekly />);
    expect(view.getByText('08-03 ~ 08-09 주간 묶음')).toBeTruthy();
    expect(view.getByText('학생 1명 · 1명 남음')).toBeTruthy();
    const card = view.getByRole('article', { name: '고은설 주간 묶음' });
    expect(within(card).getByText('승인 1 / 1')).toBeTruthy();
    expect(within(card).getByText('총평을 먼저 써야 보낼 수 있습니다')).toBeTruthy();
    expect((within(card).getByRole('button', { name: '보호자에게 보내기' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('총평은 DTO 모양 {studentId, weekOf, summary} 로 보낸다 — 고친 뒤에만 저장이 열린다', () => {
    mocks.weekly.mockReturnValue({ data: list([bundle()]), isLoading: false, isError: false });
    const view = render(<ReportWeekly />);
    const save = view.getByRole('button', { name: '총평 저장' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(view.getByLabelText(/총평/), { target: { value: '이번 주 잘했습니다' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(mocks.mutate).toHaveBeenCalledWith({ studentId: 1, weekOf: '2026-08-03', summary: '이번 주 잘했습니다' });
  });

  it('보낼 수 있으면 보호자 발송 창을 wrepId · 서버 본문 · 제목으로 연다', () => {
    const ready = bundle({
      wrepId: 7, summary: { text: '잘했습니다', byId: 2, byName: '김민수', at: '2026-08-09T10:00:00+09:00' },
      canSend: true, sendBlockedReason: null, plainText: '① 학생: 고은설\n\n총평\n잘했습니다',
    });
    mocks.weekly.mockReturnValue({ data: list([ready]), isLoading: false, isError: false });
    const view = render(<ReportWeekly />);
    fireEvent.click(view.getByRole('button', { name: '보호자에게 보내기' }));
    expect(mocks.dialog.mock.calls.at(-1)?.[0]).toMatchObject({
      open: true, wrepId: 7, defaultBody: '① 학생: 고은설\n\n총평\n잘했습니다',
      defaultSubject: '고은설 학생 주간 리포트 · 08-03 ~ 08-09', student: { id: 1, name: '고은설' },
    });
  });

  it('이미 나간 묶음은 총평이 읽기 전용이고 서버 문장을 적는다', () => {
    const sent = bundle({
      wrepId: 7, summary: { text: '보낸 총평', byId: 2, byName: '김민수', at: '2026-08-09T10:00:00+09:00' },
      canWriteSummary: false, summaryBlockedReason: '이미 보호자에게 보낸 묶음이라 총평을 고칠 수 없습니다',
      canSend: true, sendBlockedReason: null, plainText: '본문', sentAt: '2026-08-10T09:00:00+09:00', attemptCount: 1,
    });
    mocks.weekly.mockReturnValue({ data: list([sent]), isLoading: false, isError: false });
    const view = render(<ReportWeekly />);
    expect(view.queryByRole('button', { name: '총평 저장' })).toBeNull();
    expect(view.getByText('보낸 총평')).toBeTruthy();
    expect(view.getByText('이미 보호자에게 보낸 묶음이라 총평을 고칠 수 없습니다')).toBeTruthy();
    expect(view.getByText('보냄 · 08-10 09:00')).toBeTruthy();
  });

  it('주 이동은 서버가 준 월요일에서 7일씩 — 질의 키가 바뀐다', () => {
    mocks.weekly.mockReturnValue({ data: list([]), isLoading: false, isError: false });
    const view = render(<ReportWeekly />);
    expect(mocks.weekly).toHaveBeenLastCalledWith(undefined);
    fireEvent.click(view.getByRole('button', { name: '이전 주' }));
    expect(mocks.weekly).toHaveBeenLastCalledWith('2026-07-27');
    expect(view.getByText('이 주에 쓴 리포트가 있는 학생이 없습니다.')).toBeTruthy();
  });

  it('수업 줄을 누르면 그 리포트의 상세를 연다(원래 날짜 키 · 학생)', () => {
    mocks.weekly.mockReturnValue({ data: list([bundle()]), isLoading: false, isError: false });
    const open = vi.fn();
    const view = render(<ReportWeekly onOpenReport={open} />);
    fireEvent.click(view.container.querySelector('[data-weekly-lesson]')!);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ serId: 21, onDate: '2026-08-04' }), 1);
  });
});
