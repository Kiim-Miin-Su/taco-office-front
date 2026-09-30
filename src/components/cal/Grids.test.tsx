/** @file-guide
 * 목적: Grids.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';
import { monthGrid } from '@/lib/calendar';
import { DayGrid, MonthGrid, WeekGrid } from './Grids';

afterEach(cleanup);

function occurrence(serId: number, patch: Partial<Occurrence> = {}): Occurrence {
  return {
    serId, date: '2026-09-01', onDate: '2026-09-01', startMin: 540 + serId * 60,
    endMin: 600 + serId * 60, kindKey: 'class', title: `수업 ${serId}`, mode: 'offline',
    canceled: false, hasException: false, recurring: false, repState: 'plan', ended: false, written: false, extra: false,
    attendanceMode: 'unavailable', attendance: null, students: [],
    ...patch,
  };
}

describe('관리자 달력 날짜 정확성', () => {
  it.each([
    ['2026-09-01', '화', 1],
    ['2026-08-01', '토', 5],
  ])('%s을 실제 요일 %s 열 아래 표시한다', (date, weekday, column) => {
    const view = render(<MonthGrid date={date} grid={monthGrid(date)} items={[]} onPickDate={vi.fn()} />);
    const headers = Array.from(view.container.firstElementChild!.firstElementChild!.children);
    expect(headers.map((header) => header.textContent)).toEqual(['월', '화', '수', '목', '금', '토', '일']);
    expect(headers[5].classList.contains('text-blue')).toBe(true);
    expect(headers[6].classList.contains('text-red')).toBe(true);
    expect(headers[0].classList.contains('text-red')).toBe(false);

    const dateButton = view.getByRole('button', { name: `${date} (${weekday}) 날짜 선택` });
    const cell = dateButton.parentElement!.parentElement!;
    expect(Array.from(cell.parentElement!.children).indexOf(cell) % 7).toBe(column);
    expect(headers[column].textContent).toBe(weekday);
  });

  it('월간 날짜와 더보기는 같은 날짜를 선택하고 전체 건수와 최대 3건을 유지한다', () => {
    const onPickDate = vi.fn();
    const onAdd = vi.fn();
    const onOpen = vi.fn();
    const items = [5, 2, 4, 1, 3].map((serId) => occurrence(serId));
    const view = render(<MonthGrid date="2026-09-01" grid={monthGrid('2026-09-01')} items={items}
      onPickDate={onPickDate} onAdd={onAdd} onOpen={onOpen} />);
    const dateButton = view.getByRole('button', { name: '2026-09-01 (화) 날짜 선택' });
    const cell = within(dateButton.parentElement!.parentElement!);

    // 원문 §09 칸 오른쪽 위는 숫자만(「8」) — 「5건」 낱말은 title 로 되찾는다
    expect(cell.getByTitle('5건').textContent).toBe('5');
    expect(cell.getAllByRole('button', { name: /수업 \d/ }).map((button) => button.textContent)).toEqual([
      '10:00수업 1', '11:00수업 2', '12:00수업 3',
    ]);
    expect(cell.queryByRole('button', { name: /수업 4/ })).toBeNull();
    fireEvent.click(dateButton);
    fireEvent.click(cell.getByRole('button', { name: '+2건 더' }));
    expect(onPickDate.mock.calls).toEqual([['2026-09-01'], ['2026-09-01']]);
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(cell.getByRole('button', { name: /수업 1/ }));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.doubleClick(cell.getByRole('button', { name: /수업 1/ }));
    expect(onOpen).toHaveBeenCalledWith(items[3]);
    expect(onPickDate).toHaveBeenCalledTimes(2);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('일정 없는 월간 날짜도 선택하며 새 일정 동작과 섞지 않는다', () => {
    const onPickDate = vi.fn();
    const onAdd = vi.fn();
    const view = render(<MonthGrid date="2026-09-01" grid={monthGrid('2026-09-01')} items={[]}
      onPickDate={onPickDate} onAdd={onAdd} />);
    const dateButton = view.getByRole('button', { name: '2026-09-03 (목) 날짜 선택' });
    // 원문 §09 의 빈 칸에는 수가 없다 — 「0건」을 적지 않는다
    expect(within(dateButton.parentElement!).queryByText('0건')).toBeNull();
    fireEvent.click(dateButton);
    expect(onPickDate).toHaveBeenCalledOnce();
    expect(onPickDate).toHaveBeenCalledWith('2026-09-03');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('주간 날짜 헤더는 연월일·요일을 알리고 정확한 날짜를 선택한다', () => {
    const onPickDate = vi.fn();
    const view = render(<WeekGrid date="2026-09-01" items={[]} onPickDate={onPickDate} />);
    fireEvent.click(view.getByRole('button', { name: '2026-09-02 (수) 날짜 선택' }));
    expect(onPickDate).toHaveBeenCalledOnce();
    expect(onPickDate).toHaveBeenCalledWith('2026-09-02');
  });

  it('읽기 전용 월간 날짜는 생성할 수 있다고 안내하거나 탭 순서에 넣지 않는다', () => {
    const view = render(<MonthGrid date="2026-09-01" grid={monthGrid('2026-09-01')} items={[]} />);
    const cell = view.getByRole('group', { name: '2026-09-03 날짜 칸' });
    expect(cell.hasAttribute('tabindex')).toBe(false);
    expect(cell.getAttribute('aria-label')).not.toContain('새 일정');
  });

  it('주간·학생별·선생님별 공용 격자는 한 시간축에 회차를 시간 비례로 놓는다', () => {
    const items = [
      occurrence(10, { startMin: 14 * 60, endMin: 15 * 60 }),
      occurrence(11, { startMin: 15 * 60, endMin: 15 * 60 + 30, date: '2026-09-02', onDate: '2026-09-02' }),
    ];
    const view = render(<WeekGrid date="2026-09-01" items={items} />);

    // N-43: 늦은 수업만 있어도 공통 09~22시 축을 접지 않고, HOUR_PX(56px)로 실제 위치를 정한다.
    expect(view.getByText('09:00')).toBeTruthy();
    expect(view.getByText('21:00')).toBeTruthy();
    const first = view.container.querySelector<HTMLElement>('[data-week-event="10|2026-09-01"]');
    const second = view.container.querySelector<HTMLElement>('[data-week-event="11|2026-09-02"]');
    expect(first?.style.top).toBe('281px');
    expect(first?.style.height).toBe('54px');
    expect(second?.style.top).toBe('337px');
    expect(second?.style.height).toBe('26px');
  });

  it('같은 날 겹친 회차를 접지 않고 평행 lane으로 모두 미리 보여 준다', () => {
    const onOpen = vi.fn();
    const items = [
      occurrence(20, { startMin: 14 * 60, endMin: 15 * 60 }),
      occurrence(21, { startMin: 14 * 60 + 30, endMin: 15 * 60 + 30 }),
    ];
    const view = render(<WeekGrid date="2026-09-01" items={items} onOpen={onOpen} />);
    const first = view.container.querySelector<HTMLElement>('[data-week-event="20|2026-09-01"]');
    const second = view.container.querySelector<HTMLElement>('[data-week-event="21|2026-09-01"]');

    expect(first?.style.left).toBe('calc(0% + 2px)');
    expect(second?.style.left).toBe('calc(50% + 1px)');
    expect(first?.style.width).toBe('calc(50% - 3px)');
    expect(second?.style.width).toBe('calc(50% - 3px)');
    expect(view.queryByRole('button', { name: '+1' })).toBeNull();
    // 시간 비례 격자는 블록 제목에 시각을 붙이지 않는다 — 축이 말한다 (원문 §08 · 시각은 title 에 남는다)
    const block = view.getByRole('button', { name: /^수업 20/ });
    expect(block.getAttribute('title')).toContain('14:00–15:00');
    fireEvent.click(block);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.doubleClick(block);
    expect(onOpen).toHaveBeenCalledWith(items[0]);
  });

  it('블록의 세부 줄은 격자가 그린 높이로 정한다 — 45분은 강사 한 줄, 90분은 학생·장소까지', () => {
    const who = { teacherName: '김재훈', roomName: '6호', students: [{ id: 1, name: '강라율', droppedOnce: false, paused: false, late: false }] };
    const items = [
      occurrence(30, { startMin: 14 * 60, endMin: 14 * 60 + 45, ...who }),
      occurrence(31, { startMin: 14 * 60, endMin: 15 * 60 + 30, date: '2026-09-02', onDate: '2026-09-02', ...who }),
    ];
    const view = render(<WeekGrid date="2026-09-01" items={items} />);
    const short = within(view.container.querySelector<HTMLElement>('[data-week-event="30|2026-09-01"]')!);
    const tall = within(view.container.querySelector<HTMLElement>('[data-week-event="31|2026-09-02"]')!);
    expect(short.getByText('김재훈')).toBeTruthy();
    expect(short.queryByText('강라율')).toBeNull();
    expect(tall.getByText('김재훈')).toBeTruthy();
    expect(tall.getByText('강라율')).toBeTruthy();
    expect(tall.getByText('현장 6호')).toBeTruthy();
  });

  it('주간 빈 칸은 클릭 선택과 더블클릭 생성의 날짜·시각을 분리한다', () => {
    const onAddAt = vi.fn();
    const onSelectAt = vi.fn();
    const view = render(<WeekGrid date="2026-09-01" items={[]} cursor={{ date: '2026-09-03', startMin: 16 * 60 }}
      interactive onAddAt={onAddAt} onSelectAt={onSelectAt} />);
    const slot = view.getByRole('button', { name: '2026-09-03 16:00 빈 시간 선택' });

    expect(slot.classList.contains('ring-2')).toBe(true);
    fireEvent.click(slot);
    expect(onSelectAt).toHaveBeenCalledWith('2026-09-03', 16 * 60);
    expect(onAddAt).not.toHaveBeenCalled();
    fireEvent.click(slot, { detail: 2 });
    expect(onAddAt).not.toHaveBeenCalled();
    fireEvent.doubleClick(slot);
    expect(onAddAt).toHaveBeenCalledOnce();
    expect(onAddAt).toHaveBeenCalledWith('2026-09-03', 16 * 60);
    fireEvent.keyDown(slot, { key: 'Enter' });
    expect(onAddAt).toHaveBeenCalledTimes(2);
  });

  it('일간 강의실 슬롯과 월간 빈 날짜도 클릭 선택·더블클릭 생성을 구분한다', () => {
    const onSelectAt = vi.fn();
    const onAddAt = vi.fn();
    const day = render(<DayGrid date="2026-09-01" items={[]} columns={[{ id: 3, name: '3호' }]}
      columnOf={() => 3} colAxis="room" interactive onSelectAt={onSelectAt} onAddAt={onAddAt} />);
    const slot = day.getByRole('button', { name: '2026-09-01 10:00 강의실 3 빈 시간 선택' });
    fireEvent.click(slot);
    expect(onSelectAt).toHaveBeenCalledWith('2026-09-01', 600, 3);
    expect(onAddAt).not.toHaveBeenCalled();
    fireEvent.doubleClick(slot);
    expect(onAddAt).toHaveBeenCalledOnce();
    fireEvent.keyDown(slot, { key: 'Enter' });
    expect(onAddAt).toHaveBeenCalledTimes(2);
    cleanup();

    const onSelectDate = vi.fn();
    const onAdd = vi.fn();
    const month = render(<MonthGrid date="2026-09-01" grid={monthGrid('2026-09-01')} items={[]}
      onSelectDate={onSelectDate} onAdd={onAdd} />);
    const cell = month.getByRole('group', { name: /2026-09-03 날짜 칸/ });
    fireEvent.click(cell);
    expect(onSelectDate).toHaveBeenCalledWith('2026-09-03');
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(cell, { detail: 2 });
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.doubleClick(cell);
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith('2026-09-03');
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledTimes(2);
  });
});

describe('주간 머리 모양 · 개인표 합계 줄 (원문 §08 · §10)', () => {
  it('전체 주간은 밝은 머리 「2일 · 1건」, 개인표(dark)는 어두운 머리다 · 시간 열 머리는 「한국 시간」', () => {
    const items = [occurrence(1)];
    const light = render(<WeekGrid date="2026-09-01" items={items} />);
    const head = light.getByRole('button', { name: '2026-09-01 (화) 날짜 선택' });
    expect(head.textContent).toBe('화1일 · 1건');
    expect(head.parentElement!.className).toContain('bg-inset');
    expect(light.getByText('한국 시간')).toBeTruthy();
    cleanup();
    const dark = render(<WeekGrid date="2026-09-01" items={items} dark />);
    expect(dark.getByRole('button', { name: '2026-09-01 (화) 날짜 선택' }).parentElement!.className).toContain('bg-fg');
  });

  it('개인표(dark) 시간 눈금은 원문 §10·§11 모양 — 큰 「12」 아래 작은 「13」(그 시간이 끝나는 시) · 전체 주간은 「12:00」 그대로', () => {
    const items = [occurrence(1)];
    const dark = render(<WeekGrid date="2026-09-01" items={items} dark />);
    const tick = dark.container.querySelector('[data-hour-tick="720"]') as HTMLElement;
    expect(tick.querySelector('[data-hour-start]')?.textContent).toBe('12');
    expect(tick.querySelector('[data-hour-end]')?.textContent).toBe('13');
    expect(dark.queryByText('12:00')).toBeNull();
    cleanup();
    const light = render(<WeekGrid date="2026-09-01" items={items} />);
    expect(light.getByText('12:00')).toBeTruthy();
    expect(light.container.querySelector('[data-hour-end]')).toBeNull();
  });

  it('합계 줄은 요일마다 「회 / 시간」을 기간 집계와 같은 함수로 세고, 취소는 빼며 없는 날은 「—」다', () => {
    const items = [occurrence(1), occurrence(2), { ...occurrence(3), canceled: true }];
    const view = render(<WeekGrid date="2026-09-01" items={items} totals />);
    const row = view.getByRole('row', { name: '합계' });
    expect(within(row).getByText('2회')).toBeTruthy();
    const tue = row.querySelector('[data-week-total="2026-09-01"]')!;
    expect(tue.textContent).toBe('22.0h');
    expect(row.querySelector('[data-week-total="2026-09-02"]')!.textContent).toBe('—');
    cleanup();
    const none = render(<WeekGrid date="2026-09-01" items={items} />);
    expect(none.queryByRole('row', { name: '합계' })).toBeNull();
  });
});

/* ── 원문 §09 공휴일 칩 · §10 요일 머리 · §07/§11 「가능 시간」 띠 (wave5 · G37) ─────────────── */

describe('공휴일 칩과 강사 불가 띠', () => {
  const holidaysOf = (date: string) => (date === '2026-08-17' ? ['광복절 대체'] : date === '2026-08-15' ? ['광복절'] : undefined);

  it('월간 칸은 날짜 옆에 서버가 준 공휴일 이름을 그대로 적는다', () => {
    const view = render(<MonthGrid date="2026-08-01" grid={monthGrid('2026-08-01')} items={[]} holidaysOf={holidaysOf} onPickDate={vi.fn()} />);
    const cell = view.getByRole('button', { name: '2026-08-17 (월) 날짜 선택' }).parentElement!;
    expect(within(cell).getByText('광복절 대체').getAttribute('data-holiday')).toBe('광복절 대체');
    expect(view.container.querySelectorAll('[data-holiday]').length).toBe(2);
  });

  it('주간 요일 머리 아래에 공휴일, 그날 열에는 강사 불가 띠 — 띠는 누르기를 막지 않는다', () => {
    const unavOf = (date: string) => (date === '2026-08-17'
      ? [{ startMin: 840, endMin: 960, label: '강사 불가 · 김재훈 14:00–16:00 · 병원' }] : undefined);
    const view = render(<WeekGrid date="2026-08-17" items={[]} holidaysOf={holidaysOf} unavOf={unavOf} dark />);
    const head = view.getByRole('button', { name: '2026-08-17 (월) 날짜 선택' });
    expect(within(head).getByText('광복절 대체')).toBeTruthy();
    const band = view.container.querySelector('[data-week-date="2026-08-17"] [data-unav]') as HTMLElement;
    expect(band.getAttribute('title')).toBe('강사 불가 · 김재훈 14:00–16:00 · 병원');
    expect((band.parentElement as HTMLElement).className).toContain('pointer-events-none');
    expect(view.container.querySelectorAll('[data-unav]').length).toBe(1);
  });

  it('일간 「빈 시간 찾기」는 가능 시간을 켰을 때 강사 불가 시각을 빈 칸으로 치지 않는다', () => {
    const common = { date: '2026-09-01', items: [], columns: [{ id: 1, name: '1호' }], columnOf: () => 1, colAxis: 'room' as const, showFree: true };
    const free = (c: HTMLElement) => c.querySelectorAll('[data-free]').length;
    const plain = render(<DayGrid {...common} />);
    const before = free(plain.container);
    cleanup();
    const withUnav = render(<DayGrid {...common} unavOf={() => [{ startMin: 600, endMin: 720, label: '강사 불가 · 김재훈' }]} />);
    // 10:00–12:00 두 시간 = 30분 칸 넷이 빈 시간에서 빠진다
    expect(free(withUnav.container)).toBe(before - 4);
    expect(withUnav.container.querySelectorAll('[data-unav]').length).toBe(1);
  });
});

/**
 * N-74 · N-80 — lane 은 셋까지 나란히, 넘치면 「+M」. 주간과 일간(날짜 한 열)이 같은 함수(`laneLayout`)를 쓰고
 * 「+M」의 행선지만 다르다: 주간은 그날 일간으로(원문 §08 「날짜 머리 → 그날 일간」), 일간은 그 묶음을 펼친다.
 */
describe('lane 상한 셋 + 「+M」 (N-74 · N-80)', () => {
  const crowd = (date: string, n: number) => Array.from({ length: n }, (_, i) => occurrence(i + 1, {
    date, onDate: date, startMin: 600, endMin: 690, title: `겹친 수업 ${i + 1}`,
  }));

  it('주간: 넷 이상 겹치면 셋만 나란히 두고 「+M」을 누르면 그날로 간다', () => {
    const onPickDate = vi.fn();
    const view = render(<WeekGrid date="2026-09-01" items={crowd('2026-09-02', 5)} onPickDate={onPickDate} />);
    const week = view.getByRole('region', { name: '주간 시간표' });
    expect(week.querySelectorAll('[data-week-event]')).toHaveLength(3);
    const more = within(week).getByRole('button', { name: '2026-09-02 겹친 수업 2건 더 — 그날 일간으로' });
    expect(more.textContent).toBe('+2');
    fireEvent.click(more);
    expect(onPickDate).toHaveBeenCalledWith('2026-09-02');
  });

  it('주간: 셋까지는 「+M」 없이 전부 나란히 선다', () => {
    const view = render(<WeekGrid date="2026-09-01" items={crowd('2026-09-02', 3)} onPickDate={vi.fn()} />);
    const week = view.getByRole('region', { name: '주간 시간표' });
    expect(week.querySelectorAll('[data-week-event]')).toHaveLength(3);
    expect(week.querySelector('[data-lane-more]')).toBeNull();
  });

  it('일간(날짜 한 열): 머리는 두 줄이고 누르는 단추가 아니다 — 「+M」은 그 묶음을 펼쳐 전부 보인다', () => {
    const onOpen = vi.fn();
    const view = render(<WeekGrid date="2026-09-02" days={['2026-09-02']} items={crowd('2026-09-02', 4)} onOpen={onOpen} />);
    const day = view.getByRole('region', { name: '일간 시간표' });
    expect(within(day).getByText('26년 9월 2일 수요일')).toBeTruthy();
    expect(within(day).getByText('일정 4건')).toBeTruthy();
    expect(within(day).queryByRole('button', { name: /날짜 선택/ })).toBeNull();
    expect(day.querySelectorAll('[data-week-event]')).toHaveLength(3);
    fireEvent.click(within(day).getByRole('button', { name: '겹친 수업 4건 펼치기' }));
    const hidden = within(day).getByRole('button', { name: /겹친 수업 4$/ });
    fireEvent.click(hidden);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.doubleClick(hidden);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ serId: 4 }));
  });

  it('일간 「+M」 펼침 안의 숨겨졌던 일정도 실제 draggable로 등록한다', () => {
    const view = render(<WeekGrid date="2026-09-02" days={['2026-09-02']} items={crowd('2026-09-02', 4)} interactive />);
    const day = view.getByRole('region', { name: '일간 시간표' });
    fireEvent.click(within(day).getByRole('button', { name: '겹친 수업 4건 펼치기' }));
    const hidden = within(day).getByRole('button', { name: /겹친 수업 4$/ });
    expect(hidden.getAttribute('aria-roledescription')).toBe('draggable');
  });
});
