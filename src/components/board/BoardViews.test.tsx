/** @file-guide
 * 목적: BoardViews.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardRow, CheckMark } from '@/api/types';
import { BoardMarks, DayBoard, MonthBoard, WeekBoard, type BoardDay } from './BoardViews';

const marks: CheckMark[] = [
  { key: 'book', done: true, na: false },
  { key: 'guide', done: false, na: false, note: '1건 덜 됨' },
  { key: 'zoom', done: false, na: true },
  { key: 'report', done: true, na: false },
];
const allDone: CheckMark[] = [
  { key: 'book', done: true, na: false },
  { key: 'guide', done: false, na: true },
  { key: 'zoom', done: false, na: true },
  { key: 'report', done: true, na: false },
];

const row = (occId: number, over: Partial<BoardRow> = {}): BoardRow => ({
  occId, serId: occId, date: '2026-09-14', onDate: '2026-09-14', startAt: '08:00', endAt: '09:00',
  teacherId: 3, teacherName: 'Sophia', roomName: '5호', zaccLabel: null, mode: 'offline', kindKey: 'class', kindName: '수업',
  subKey: 'vocab', subName: 'Vocabulary', studentNames: ['이유찬'], canceled: false,
  marks: allDone, missing: 0, ...over,
});
const colorOf = (subKey: string | null | undefined) => (subKey === 'vocab' ? 'rgb(111, 143, 82)' : null);

describe('BoardViews', () => {
  /**
   * 원문 §34 마크 = **기호 + 낱말** — `!` 안 됨(붉은 사각) · `✓` 완료 · `–` 해당 없음.
   * 색으로만 상태를 말하면 색을 못 가리는 사람에게는 넷이 같은 칩이다 (g4 §34-2).
   */
  it('마크는 기호와 낱말을 함께 보인다 — ✓ 완료 · ! 안 됨 · – 해당 없음', () => {
    const view = render(<BoardMarks marks={marks} />);
    const chip = (word: string) => view.getByText(word).closest('[data-mark]') as HTMLElement;
    expect(chip('교재').textContent).toBe('✓교재');
    expect(chip('안내').textContent).toBe('!안내');
    expect(chip('줌').textContent).toBe('–줌');
    expect(chip('안내').getAttribute('data-mark')).toBe('missing');
    // 기호만으로도 읽힌다 — 상태 낱말이 이름에 들어 있다
    expect(chip('안내').getAttribute('aria-label')).toBe('안내 안 됨');
    expect(chip('줌').getAttribute('aria-label')).toBe('줌 해당 없음');
  });

  it('해당 없음은 비활성 컨트롤이 아닌 정보이므로 공용 중립 글자색을 흐리지 않는다', () => {
    const view = render(<BoardMarks marks={marks} />);
    const badge = view.getByText('줌').closest('[data-mark]') as HTMLElement;
    expect(badge.className).not.toMatch(/(?:^|\s)(?:\S+:)?opacity-/);
    expect(badge.style.opacity).toBe('');
  });

  /**
   * §34-1 — 「시간순 카드」 3열 격자. 카드 = 시작(굵게)·끝 시각 · 과목 · 강사 · 학생들 · 장소 배지 · 마크 줄.
   * 다 된 수업은 흰 바탕 + 과목색 왼쪽 띠, 덜 된 수업은 분홍 바탕. 카드를 누르면 수업 상세.
   */
  it('일별은 표가 아니라 카드 격자이고, 다 된 카드는 과목색 띠 · 덜 된 카드는 분홍 바탕이다', () => {
    const onOpen = vi.fn();
    const rows = [
      row(1),
      row(2, { startAt: '10:00', endAt: '11:30', marks, missing: 1, subName: 'Writing', subKey: 'writing' }),
      row(3, { mode: 'online', roomName: null, zaccLabel: 'Study', studentNames: ['고은설', '이하린'] }),
    ];
    const view = render(<DayBoard rows={rows} loading={false} onOpen={onOpen} colorOf={colorOf} />);
    expect(view.queryByRole('table')).toBeNull();
    const cards = view.getAllByRole('button', { name: /수업 상세/ });
    expect(cards).toHaveLength(3);
    expect(cards[0].getAttribute('data-state')).toBe('done');
    expect(cards[0].style.borderLeftColor).toBe('rgb(111, 143, 82)');
    expect(cards[1].getAttribute('data-state')).toBe('todo');
    expect(cards[1].className).toContain('bg-red/10');
    // 시작은 굵게, 끝은 아래 — 과목 · 강사 · 학생
    expect(within(cards[1]).getByText('10:00').tagName).toBe('B');
    expect(within(cards[1]).getByText('11:30')).toBeTruthy();
    expect(within(cards[2]).getByText('Sophia · 고은설 · 이하린')).toBeTruthy();
    // 온라인은 줌 계정 이름까지 — 「온라인 Study」 (§34-10)
    expect(within(cards[2]).getByText('온라인 Study')).toBeTruthy();
    expect(within(cards[0]).getByText('5호')).toBeTruthy();
    fireEvent.click(cards[1]);
    expect(onOpen).toHaveBeenCalledWith(rows[1]);
    // 3열 격자
    expect(view.getByTestId('board-day-grid').className).toContain('xl:grid-cols-3');
  });

  /**
   * §35-1 · §35-2 · §35-3 — 요일 7칸 열. 머리 「월 14 · 1 남음」(서버 days[]), 칸마다 작은 카드
   * 「08:00 Vocabulary / Sophia · 1명 / 기호 마크」, 오늘 열 테두리, 빈 날 「없음」. 카드를 누르면 수업 상세.
   */
  it('주별은 요일 7칸이고 머리 수는 서버 days[] 그대로 · 카드를 누르면 수업 상세를 연다', () => {
    const onOpen = vi.fn();
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
    const stats: BoardDay[] = [
      { date: '2026-09-14', lessons: 17, remaining: 6, canceled: 0, subKeys: ['vocab'] },
      { date: '2026-09-15', lessons: 1, remaining: 0, canceled: 0, subKeys: ['vocab'] },
    ];
    const rows = [row(1), row(2, { date: '2026-09-15', marks, missing: 1 })];
    const view = render(
      <WeekBoard rows={rows} days={days} dayStats={stats} today="2026-09-15" loading={false} onOpen={onOpen} colorOf={colorOf} />,
    );
    const cols = view.getAllByRole('region');
    expect(cols).toHaveLength(7);
    expect(within(cols[0]).getByText('월 14 · 6 남음')).toBeTruthy();
    expect(within(cols[1]).getByText('화 15 · 다 됨')).toBeTruthy();
    expect(cols[1].getAttribute('data-today')).toBe('true');
    expect(within(cols[2]).getByText('없음')).toBeTruthy();
    const card = within(cols[1]).getByRole('button', { name: /수업 상세/ });
    expect(within(card).getByText('Sophia · 1명')).toBeTruthy();
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith(rows[1]);
  });

  /**
   * §36-1 · §36-2 · §36-3 — 달력(일~토, 어두운 요일 머리). 칸 = 날짜 + 건수 + 「N 남음」 + 과목색 점,
   * 오늘 칸 테두리, 수업 있는 평일 칸 분홍. 날짜를 누르면 그날 일별로.
   */
  it('월별은 일요일 시작 달력이고 칸 수는 서버 days[] 그대로 · 날짜를 누르면 그날로 간다', () => {
    const onDay = vi.fn();
    const stats: BoardDay[] = [
      { date: '2026-09-14', lessons: 5, remaining: 2, canceled: 0, subKeys: ['vocab', 'writing'] },
      { date: '2026-09-15', lessons: 3, remaining: 0, canceled: 0, subKeys: ['vocab'] },
    ];
    const view = render(
      <MonthBoard anchor="2026-09-10" dayStats={stats} today="2026-09-15" loading={false} onDay={onDay} colorOf={colorOf} />,
    );
    const heads = view.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(heads).toEqual(['일', '월', '화', '수', '목', '금', '토']);
    // 2026-09-01 은 화요일 — 일요일 시작 격자의 첫 칸은 8월 30일
    const cells = view.getAllByRole('gridcell');
    expect(cells[0].getAttribute('data-date')).toBe('2026-08-30');
    const mon = cells.find((cell) => cell.getAttribute('data-date') === '2026-09-14')!;
    expect(within(mon).getByText('5')).toBeTruthy();
    // 393px 에서 한 칸은 약 51px — 「12 남음」 칩이 옆 칸을 덮지 않게 좁은 화면에서는 수만 남기고
    // 「남음」 낱말은 sm 부터 보인다. 온전한 말은 title 과 칸 이름(aria-label)에 그대로 있다
    const remain = within(mon).getByTitle('2 남음');
    expect(remain.textContent).toBe('2 남음');
    expect(within(remain).getByText('남음', { exact: false }).className).toContain('hidden sm:inline');
    expect(within(mon).getByRole('button').getAttribute('aria-label')).toBe('9월 14일 수업 5 · 2 남음 — 일별로');
    expect(mon.querySelectorAll('[data-subject-dot]')).toHaveLength(2);
    expect(mon.getAttribute('data-busy')).toBe('true');
    const today = cells.find((cell) => cell.getAttribute('data-date') === '2026-09-15')!;
    expect(today.getAttribute('data-today')).toBe('true');
    expect(within(today).queryByText(/남음/)).toBeNull();
    fireEvent.click(within(mon).getByRole('button'));
    expect(onDay).toHaveBeenCalledWith('2026-09-14');
  });
});
