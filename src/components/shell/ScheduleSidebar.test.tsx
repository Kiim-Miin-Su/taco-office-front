/** @file-guide
 * 목적: ScheduleSidebar.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Meta, ScheduleSeriesCounts } from '@/api/types';
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

/**
 * 서버가 센 일정 원본 수(`GET /schedule/series-counts`) — 원문 §07 컷의 수를 그대로 쓴다.
 * 묶음 수(17·5)는 화면이 종류 줄을 더한 값이 아니라 서버 값이다(D-R37 · 화면은 세지 않는다).
 */
const counts: ScheduleSeriesCounts = {
  asOf: '2026-09-26',
  total: 22,
  groups: [
    { grp: 'lesson', label: '수업', count: 17, kinds: [{ key: 'class', count: 15 }, { key: 'mock', count: 2 }] },
    { grp: 'meeting', label: '회의', count: 5, kinds: [{ key: 'meeting', count: 5 }] },
  ],
  subs: [{ key: 'ap-chem', count: 3 }],
};

function sidebar(extra: Partial<Parameters<typeof ScheduleSidebar>[0]> = {}) {
  const props = {
    meta, counts, canEdit: true, splitOn: false,
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
  it('프로그램·과목 수는 서버가 센 일정 원본 수를 그대로 그린다 — 묶음 낱말·합계도 서버 값이다 (§07 #19 · D-R44)', () => {
    sidebar();
    // 묶음 머리 = 서버 label + 서버 count (화면이 종류 줄을 더하지 않는다)
    expect(screen.getByRole('heading', { name: /수업/ }).textContent).toBe('수업17');
    expect(screen.getByRole('heading', { name: /회의/ }).textContent).toBe('회의5');
    const classRow = screen.getByText('정규 수업').closest('li') as HTMLElement;
    expect(within(classRow).getByText('15')).toBeTruthy();
    const mockRow = screen.getByText('모의수업').closest('li') as HTMLElement;
    expect(within(mockRow).getByText('2')).toBeTruthy();
    // 과목은 서버가 준 줄만(1 이상) · 이름·색은 코드표(meta)
    const apChem = screen.getByText('AP Chemistry').closest('li') as HTMLElement;
    expect(within(apChem).getByText('3')).toBeTruthy();
    expect(screen.queryByText('Writing')).toBeNull();
    // 원문 §07 「과목 [관리] [전체]」 머리에는 수가 없다 — 화면이 과목 합계를 만들지 않는다
    expect(screen.getByRole('heading', { name: /과목/ }).textContent).not.toMatch(/\d/);
  });

  it('수를 아직 못 받았으면 지어내지 않고 기다린다고 적는다', () => {
    sidebar({ counts: undefined });
    expect(screen.queryByRole('heading', { name: /수업/ })).toBeNull();
    expect(screen.getByText('일정 원본 수를 읽는 중…')).toBeTruthy();
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

  it('가능 시간은 켜고 끄는 콜백을 받으면 살아나고, 켜진 상태를 aria-pressed 로 말한다 (G37)', () => {
    const onAvailability = vi.fn();
    sidebar({ onAvailability, availabilityOn: true });
    const btn = screen.getByRole('button', { name: /가능 시간/ });
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(onAvailability).toHaveBeenCalledTimes(1);
  });

  it('원문 §07 「프로그램 [관리] [전체]」·「과목 [관리] [전체]」 — 관리는 §18, 전체는 거르기를 푼다', () => {
    const onClearKind = vi.fn();
    const onClearSub = vi.fn();
    sidebar({ onClearKind, onClearSub, canOpenPrograms: true });
    const manage = screen.getAllByRole('link', { name: '관리' });
    expect(manage.map((a) => a.getAttribute('href'))).toEqual(['/programs', '/programs']);
    fireEvent.click(screen.getByRole('button', { name: '프로그램 거르기 풀기' }));
    fireEvent.click(screen.getByRole('button', { name: '과목 거르기 풀기' }));
    expect(onClearKind).toHaveBeenCalledTimes(1);
    expect(onClearSub).toHaveBeenCalledTimes(1);
  });

  it('[관리] 는 §18 에 들어갈 수 있는 사람에게만 선다 — 들어가지 못할 링크를 그리지 않는다(D-R39 · 서버 플래그로 판정)', () => {
    sidebar({ onClearKind: vi.fn(), onClearSub: vi.fn() });
    expect(screen.queryAllByRole('link', { name: '관리' })).toHaveLength(0);
    // 거르기 풀기는 누구나 쓰는 화면 동작이라 그대로 선다
    expect(screen.getByRole('button', { name: '프로그램 거르기 풀기' })).toBeTruthy();
  });

  it('분할 중에는 분할 해제로 읽히고, «사이드 접기는 전역 상태만 바꾼다', () => {
    sidebar({ splitOn: true });
    expect(screen.getByRole('button', { name: '분할 해제' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '사이드 접기' }));
    expect(useWorkspace.getState().sidebarOpen).toBe(false);
    expect(useWorkspace.getState().railOpen).toBe(true);
  });
});
