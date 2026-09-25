/** @file-guide
 * 목적: Grids.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';
import { monthGrid } from '@/lib/calendar';
import { MonthGrid, WeekGrid } from './Grids';

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
    expect(onOpen).toHaveBeenCalledWith(items[0]);
  });

  it('블록의 세부 줄은 격자가 그린 높이로 정한다 — 45분은 강사 한 줄, 90분은 학생·장소까지', () => {
    const who = { teacherName: '김재훈', roomName: '6호', students: [{ id: 1, name: '강라율', droppedOnce: false, paused: false }] };
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

  it('주간 빈 칸은 날짜와 실제 30분 시각을 전달하고 cursor도 그 슬롯만 표시한다', () => {
    const onAddAt = vi.fn();
    const view = render(<WeekGrid date="2026-09-01" items={[]} cursor={{ date: '2026-09-03', startMin: 16 * 60 }}
      interactive onAddAt={onAddAt} />);
    const slot = view.getByRole('button', { name: '2026-09-03 16:00 빈 시간 선택' });

    expect(slot.classList.contains('ring-2')).toBe(true);
    fireEvent.click(slot);
    expect(onAddAt).toHaveBeenCalledOnce();
    expect(onAddAt).toHaveBeenCalledWith('2026-09-03', 16 * 60);
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
