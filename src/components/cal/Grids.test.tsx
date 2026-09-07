import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';
import { monthGrid } from '@/lib/calendar';
import { MonthGrid, WeekGrid } from './Grids';

afterEach(cleanup);

function occurrence(serId: number): Occurrence {
  return {
    serId, date: '2026-09-01', onDate: '2026-09-01', startMin: 540 + serId * 60,
    endMin: 600 + serId * 60, kindKey: 'class', title: `수업 ${serId}`, mode: 'offline',
    canceled: false, hasException: false, recurring: false, repState: 'plan', written: false,
    attendanceMode: 'unavailable', attendance: null, students: [],
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
    const items = [5, 2, 4, 1, 3].map(occurrence);
    const view = render(<MonthGrid date="2026-09-01" grid={monthGrid('2026-09-01')} items={items}
      onPickDate={onPickDate} onAdd={onAdd} onOpen={onOpen} />);
    const dateButton = view.getByRole('button', { name: '2026-09-01 (화) 날짜 선택' });
    const cell = within(dateButton.parentElement!.parentElement!);

    expect(cell.getByText('5건')).toBeTruthy();
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
    expect(within(dateButton.parentElement!).getByText('0건')).toBeTruthy();
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
});
