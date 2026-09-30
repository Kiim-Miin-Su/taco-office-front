/** @file-guide
 * 목적: ScheduleHistory의 cursor 넘김과 실제 회차 deep link 회귀
 * 책임/재사용: 서버가 준 page/go를 화면이 그대로 소비하며 URL이나 다음 cursor를 다시 계산하지 않는지 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ScheduleHistory } from './ScheduleHistory';

const mocks = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock('@/api/queries', () => ({ useScheduleHistory: mocks.history }));
vi.mock('next/link', () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => (
  <a href={href} className={className} data-next-link>{children}</a>
) }));

const row = (id: number, go: string | null) => ({
  id, at: '2026-09-28T14:20:00+09:00', actorName: '관리자', summary: `이력 ${id}`, from: '앞', to: '뒤', go,
});

describe('최근 변경 이력', () => {
  beforeEach(() => {
    mocks.history.mockImplementation((_enabled: boolean, beforeId?: number) => ({
      data: beforeId === 10
        ? { rows: [row(9, null)], nextBeforeId: 5 }
        : beforeId === 5
          ? { rows: [row(4, null)], nextBeforeId: null }
        : { rows: [row(20, '/schedule?date=2026-09-28&serId=3&onDate=2026-09-28')], nextBeforeId: 10 },
      isLoading: false, isError: false, isFetching: false,
    }));
  });

  it('서버 deep link를 그대로 열고 cursor로 이전 이력과 최신 이력을 오간다', () => {
    const view = render(<ScheduleHistory enabled />);
    expect(view.getByRole('link', { name: '회차 열기 ›' }).getAttribute('href'))
      .toBe('/schedule?date=2026-09-28&serId=3&onDate=2026-09-28');
    expect(view.getByRole('link', { name: '회차 열기 ›' }).hasAttribute('data-next-link')).toBe(true);

    fireEvent.click(view.getByRole('button', { name: '이전 이력' }));
    expect(mocks.history).toHaveBeenLastCalledWith(true, 10);
    expect(view.getByText('이력 9')).toBeTruthy();
    expect(view.queryByRole('link', { name: '회차 열기 ›' })).toBeNull();

    fireEvent.click(view.getByRole('button', { name: '이전 이력' }));
    expect(mocks.history).toHaveBeenLastCalledWith(true, 5);
    expect(view.getByText('이력 4')).toBeTruthy();

    // 「최신」은 한 쪽만 뒤로 가는 뜻이 아니라 첫 페이지로 바로 돌아간다.
    fireEvent.click(view.getByRole('button', { name: '최신 이력' }));
    expect(mocks.history).toHaveBeenLastCalledWith(true, undefined);
    expect(view.getByText('이력 20')).toBeTruthy();
  });

  it('다시 읽는 동안 캐시된 옛 1쪽을 최신 이력처럼 노출하지 않는다', () => {
    mocks.history.mockReturnValue({
      data: { rows: [row(20, '/schedule?date=2026-09-28&serId=3&onDate=2026-09-28')], nextBeforeId: 10 },
      isLoading: false, isError: false, isFetching: true,
    });
    const view = render(<ScheduleHistory enabled />);
    expect(view.getByText('읽는 중…')).toBeTruthy();
    expect(view.queryByText('이력 20')).toBeNull();
    expect(view.queryByRole('link', { name: '회차 열기 ›' })).toBeNull();
    expect(view.queryByText('1쪽')).toBeNull();
  });
});
