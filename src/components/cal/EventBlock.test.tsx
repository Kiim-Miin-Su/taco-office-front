import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';
import { EventBlock } from './EventBlock';

const occurrence: Occurrence = {
  serId: 1,
  date: '2026-09-03',
  onDate: '2026-09-03',
  startMin: 960,
  endMin: 1020,
  kindKey: 'class',
  subKey: 'ap-chem',
  title: 'AP Chemistry',
  teacherId: 6,
  teacherName: '김서영',
  roomId: 1,
  roomName: '2층 A강의실',
  zaccId: null,
  mode: 'offline',
  canceled: false,
  hasException: false,
  recurring: true,
  repState: 'ok',
  written: true,
  attendanceMode: 'readonly',
  attendance: null,
  students: [],
};

describe('EventBlock', () => {
  it('드래그 권한이 없어도 읽기 전용 상세 버튼은 활성 상태로 열린다', () => {
    const onClick = vi.fn();
    const view = render(<EventBlock occ={occurrence} draggable={false} onClick={onClick} />);
    const button = view.getByRole('button', { name: /AP Chemistry/ });

    expect(button.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
