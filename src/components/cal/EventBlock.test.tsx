/** @file-guide
 * 목적: EventBlock.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Occurrence } from '@/api/types';
import { EventBlock } from './EventBlock';
import { Legend } from './Legend';

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

  it('관리자 과목색은 리포트 상태가 바뀌어도 유지되고 온라인만 점선·사선으로 구분한다', () => {
    const view = render(<EventBlock occ={{ ...occurrence, repState: 'plan' }} color="#5677A5" />);
    const block = view.getByRole('button', { name: /AP Chemistry/ });
    expect(block.style.getPropertyValue('--event-color')).toBe('#5677A5');
    expect(block.className).toContain('subject');
    expect(block.classList.contains('border-solid')).toBe(true);
    expect(block.className).not.toContain('online');
    expect(block.classList.contains('bg-blue/10')).toBe(false);

    view.rerender(<EventBlock occ={{ ...occurrence, repState: 'rej', mode: 'online' }} color="#5677A5" />);
    expect(block.style.getPropertyValue('--event-color')).toBe('#5677A5');
    expect(block.classList.contains('border-dashed')).toBe(true);
    expect(block.className).toContain('online');
    expect(block.classList.contains('bg-violet/10')).toBe(false);
  });

  it('색 주입 뒤에도 학생명·취소·예외·선택·modifier와 resize 클릭 경계를 유지한다', () => {
    const onClick = vi.fn();
    const onSelect = vi.fn();
    const occ = { ...occurrence, canceled: true, hasException: true,
      students: [{ id: 1, name: '수강 학생', droppedOnce: false }] };
    const view = render(<EventBlock occ={occ} color="#5677A5" selected draggable resizable onClick={onClick} onSelect={onSelect} />);
    const block = view.getByRole('button', { name: /AP Chemistry/ });
    expect(view.getByText('수강 학생')).toBeTruthy();
    expect(view.getByText('예외 있음')).toBeTruthy();
    expect(block.className).toContain('line-through');
    expect(block.className).toContain('opacity-45');
    expect(block.className).toContain('ring-2');
    expect(block.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(block, { ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(occ, 'toggle');
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(block, { shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(occ, 'range');
    fireEvent.click(view.getByLabelText('길이 조절'));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.keyDown(block, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(occ, 'single');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('색을 주입하지 않은 기존 상태 표현의 예정 파랑을 유지한다', () => {
    const view = render(<EventBlock occ={{ ...occurrence, repState: 'plan' }} />);
    const block = view.getByRole('button', { name: /AP Chemistry/ });
    expect(block.classList.contains('bg-blue/10')).toBe(true);
    expect(block.style.getPropertyValue('--event-color')).toBe('');
  });

  it('범례는 활성 표의 과목/종류를 중복 없이 같은 색 resolver로 표시한다', () => {
    const colorOf = vi.fn((o: { subKey?: string | null }) => o.subKey ? '#5677A5' : '#736CAE');
    const meeting = { ...occurrence, serId: 2, subKey: null, title: '회의', kindKey: 'meeting' };
    const view = render(<Legend items={[occurrence, occurrence, meeting]} colorOf={colorOf}
      subName={() => 'AP Chemistry'} kindName={() => '회의'} />);
    expect(view.getAllByText('AP Chemistry')).toHaveLength(1);
    expect(view.getByText('AP Chemistry').style.getPropertyValue('--event-color')).toBe('#5677A5');
    expect(view.getByText('회의').style.getPropertyValue('--event-color')).toBe('#736CAE');
    expect(view.getByText('현장')).toBeTruthy();
    expect(view.getByText('온라인').className).toContain('online');
    expect(view.getByText('취소된 수업')).toBeTruthy();
    expect(view.queryByText('색 = 리포트를 썼는가')).toBeNull();
  });
});
