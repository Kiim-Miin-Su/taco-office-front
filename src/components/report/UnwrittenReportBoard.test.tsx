/** @file-guide
 * 목적: §47 공용 보드의 강사 선택·같은 snapshot 필터·독촉 대상·일정 identity를 검증한다.
 * 책임/재사용: 서버 판정은 fixture로 받으며 컴포넌트가 새 집계를 만들지 않는지 확인한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Unwritten } from '@/api/types';
import { reportElapsedAgo, reportElapsedDays, UnwrittenReportBoard } from './UnwrittenReportBoard';

const data: Unwritten = {
  total: 3,
  penaltyTotal: 0,
  byTeacher: [
    { teacherId: 7, teacherName: 'Sophia', roleLabel: '강사', title: '코디네이터', count: 2, oldestDate: '2026-08-01', over1h: 2, over4h: 1, penalty: 0 },
    { teacherId: 9, teacherName: 'KJ', roleLabel: '매니저', title: null, count: 1, oldestDate: '2026-09-01', over1h: 1, over4h: 0, penalty: 0 },
  ],
  items: [
    { id: 1, serId: 101, date: '2026-08-02', onDate: '2026-08-01', startMin: 600, endMin: 660, subKey: 'vocab', kindKey: 'class', teacherId: 7, teacherName: 'Sophia', state: 'none', written: false, students: [{ id: 1, name: '이담흔', deliver: true }], minutesSinceEnd: 2880, penalty: 0 },
    { id: 2, serId: 102, date: '2026-08-03', onDate: '2026-08-03', startMin: 600, endMin: 660, subKey: 'gpa', kindKey: 'class', teacherId: 7, teacherName: 'Sophia', state: 'rej', written: true, students: [{ id: 2, name: '민제인', deliver: true }], minutesSinceEnd: 1440, penalty: 0 },
    { id: 3, serId: 103, date: '2026-09-02', onDate: '2026-09-01', startMin: 600, endMin: 660, subKey: 'vocab', kindKey: 'class', teacherId: 9, teacherName: 'KJ', state: 'none', written: false, students: [], minutesSinceEnd: 120, penalty: 0 },
  ],
};

const renderBoard = (onRemind = vi.fn()) => render(
  <UnwrittenReportBoard
    data={data}
    isLoading={false}
    isError={false}
    canRemind
    reminderPending={false}
    reminderMessage={null}
    subjectName={(key) => ({ vocab: 'Vocabulary', gpa: 'GPA 관리' })[key ?? ''] ?? '—'}
    subjectColorOf={(key) => (key === 'vocab' ? 'rgb(111, 143, 82)' : null)}
    onRemind={onRemind}
  />,
);

describe('UnwrittenReportBoard', () => {
  it('한 DTO에서 선택 강사의 미작성과 반려를 함께 보여 준다', () => {
    const view = renderBoard();
    expect(view.getByText('안 쓴 것 2건')).toBeTruthy();
    expect(view.getByText('미작성')).toBeTruthy();
    expect(view.getByText('반려')).toBeTruthy();
    // §47 상태 칸 = 점 + 색 글자 · 미작성 빨강 · 반려 주황 (47-06)
    expect(view.getByText('반려').className).toContain('text-orange');
    expect(view.getByText('미작성').className).toContain('text-red');
    expect(view.getByText('반려').className).not.toContain('rounded-full');
    fireEvent.click(view.getByRole('button', { name: /KJ/ }));
    expect(view.getByText('안 쓴 것 1건')).toBeTruthy();
    expect(view.queryByText('이담흔')).toBeNull();
  });

  it('개별·전체 독촉은 선택 ID만 상위 mutation에 전달한다', () => {
    const onRemind = vi.fn();
    const view = renderBoard(onRemind);
    fireEvent.click(view.getByRole('button', { name: '독촉' }));
    fireEvent.click(view.getByRole('button', { name: '전부 독촉' }));
    expect(onRemind.mock.calls).toEqual([[7], []]);
  });

  it('일정 링크는 SER 원래 날짜와 실제 날짜를 모두 보존한다', () => {
    const view = renderBoard();
    expect(view.getAllByRole('link', { name: '일정' })[0].getAttribute('href'))
      .toBe('/schedule?serId=101&onDate=2026-08-01&date=2026-08-02');
  });

  it('고른 강사 줄은 밝은 바탕 + 왼쪽 막대, 건수는 채운 한 색 배지라 읽힌다 (§47)', () => {
    const view = renderBoard();
    const picked = view.getByRole('button', { name: /Sophia/ });
    const other = view.getByRole('button', { name: /KJ/ });
    expect(picked.getAttribute('aria-pressed')).toBe('true');
    // 짙은 바탕(bg-header) 위 붉은 글자 배지는 건수가 안 보였다
    expect(picked.className).not.toContain('bg-header');
    expect(picked.className).toContain('bg-inset');
    expect(picked.className).toContain('border-l-primary');
    expect(other.className).not.toContain('border-l-primary');
    // 건수 배지는 강사마다 한 색(붉은 바탕 흰 글자) — 건수에 따라 색이 갈리지 않는다
    for (const row of [picked, other]) {
      const badge = [...row.querySelectorAll('span')].find((span) => /^\d+$/.test(span.textContent ?? ''));
      expect(badge?.className).toContain('bg-red');
      expect(badge?.className).toContain('text-white');
    }
  });

  it('경과 분은 표시만 일수로 바꾸며 음수는 오늘로 제한한다', () => {
    expect(reportElapsedDays(2880)).toBe('2일');
    expect(reportElapsedDays(-10)).toBe('오늘');
    expect(reportElapsedAgo(2880)).toBe('2일 전');
    expect(reportElapsedAgo(-10)).toBe('오늘');
  });

  /**
   * g5 §47-03 · §47-04 · §47-05 · §47-07 · §47-08 — 날짜 「8월 2일 일요일」(연도 없이), 과목 앞 과목색 점 + 과목색 글자,
   * 지난 날 「2일」, 오른쪽 머리 「Sophia 강사 · 코디네이터 안 쓴 것 2건」(역할 낱말은 서버 roleLabel), 마지막 열 머리 비움.
   */
  it('날짜·과목색·지난 날·역할 낱말이 원문 모양이고 역할은 서버가 준 것을 쓴다 (§47)', () => {
    const view = renderBoard();
    expect(view.getByText('8월 2일 일요일')).toBeTruthy();
    const subject = view.getAllByText('Vocabulary')[0];
    expect((subject as HTMLElement).style.color)
      .toBe('color-mix(in srgb, rgb(111, 143, 82) 30%, var(--fg))');
    expect(subject.parentElement?.querySelector('[data-subject-dot]')).not.toBeNull();
    expect(view.getByText('2일')).toBeTruthy();
    expect(view.queryByText('2일 전')).toBeNull();
    expect(view.getByText('Sophia 강사 · 코디네이터')).toBeTruthy();
    expect(view.queryByRole('columnheader', { name: '일정' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: /KJ/ }));
    // 고정 문자열 「· 강사」가 아니다 — 매니저를 고르면 매니저
    expect(view.getByText('KJ 매니저')).toBeTruthy();
  });
});
