/** @file-guide
 * 목적: ScheduleSidebar.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Meta, Occurrence } from '@/api/types';
import { useWorkspace } from '@/store/useWorkspace';
import { ScheduleSidebar } from './ScheduleSidebar';

const meta = {
  kinds: [
    { key: 'class', name: '정규 수업', color: '#111111', cap: 8, grp: 'lesson', rep: true },
    { key: 'mock', name: '모의수업', color: '#222222', cap: 8, grp: 'lesson', rep: true },
    { key: 'meeting', name: '기획 회의', color: '#333333', cap: 8, grp: 'meeting', rep: false },
  ],
  subs: [
    { key: 'ap-chem', name: 'AP Chemistry', color: '#444444' },
    { key: 'writing', name: 'Writing', color: '#555555' },
  ],
} as unknown as Meta;

const items = [
  { kindKey: 'class', subKey: 'ap-chem' },
  { kindKey: 'class', subKey: null },
  { kindKey: 'meeting', subKey: null },
] as unknown as Occurrence[];

function sidebar(extra: Partial<Parameters<typeof ScheduleSidebar>[0]> = {}) {
  const props = {
    meta, items, canEdit: true, splitOn: false,
    onCreate: vi.fn(), onHistory: vi.fn(), onSplit: vi.fn(),
    ...extra,
  };
  render(<ScheduleSidebar {...props} />);
  return props;
}

beforeEach(() => {
  useWorkspace.setState({ sidebarOpen: true, railOpen: true });
});
afterEach(cleanup);

describe('원본 §07 좌측 사이드바 — 도구·집계·접기', () => {
  it('프로그램은 grp별 묶음과 합계, 과목은 있는 건수만 — 현재 조회 데이터를 그대로 센다', () => {
    sidebar();
    const lesson = screen.getByRole('heading', { name: /수업/ });
    expect(lesson.textContent).toBe('수업2');
    expect(screen.getByRole('heading', { name: /회의/ }).textContent).toBe('회의1');
    const classRow = screen.getByText('정규 수업').closest('li') as HTMLElement;
    expect(within(classRow).getByText('2')).toBeTruthy();
    const mockRow = screen.getByText('모의수업').closest('li') as HTMLElement;
    expect(within(mockRow).getByText('0')).toBeTruthy();
    expect(screen.getByText('AP Chemistry')).toBeTruthy();
    expect(screen.queryByText('Writing')).toBeNull();
  });

  it('일정 추가는 canCrudAll을 따르고, 자동 연계·가능 시간은 대응 기능이 없어 비활성이다', () => {
    const { onCreate } = sidebar({ canEdit: false });
    const create = screen.getByRole('button', { name: /일정 추가/ });
    expect(create.hasAttribute('disabled')).toBe(true);
    fireEvent.click(create);
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /자동 연계/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /가능 시간/ }).hasAttribute('disabled')).toBe(true);
  });

  it('변경 이력·표 나누기·신규 학생 등록은 기존 기능으로만 배선된다', () => {
    const { onHistory, onSplit } = sidebar();
    fireEvent.click(screen.getByRole('button', { name: /변경 이력/ }));
    expect(onHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '표 나누기' }));
    expect(onSplit).toHaveBeenCalledTimes(1);
    const intake = screen.getByRole('link', { name: /신규 학생 등록/ });
    expect(intake.getAttribute('href')).toBe('/intake');
  });

  it('분할 중에는 분할 해제로 읽히고, «사이드 접기는 전역 상태만 바꾼다', () => {
    sidebar({ splitOn: true });
    expect(screen.getByRole('button', { name: '분할 해제' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '사이드 접기' }));
    expect(useWorkspace.getState().sidebarOpen).toBe(false);
    expect(useWorkspace.getState().railOpen).toBe(true);
  });
});
