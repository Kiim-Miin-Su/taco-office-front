/** @file-guide
 * 목적: WorkspaceRail.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRail } from './WorkspaceRail';

afterEach(cleanup);

describe('원본 §07 우측 rail — 기존 서랍 pane 바로가기', () => {
  it('여덟 항목을 원본 순서로 렌더하고 배지는 승인/알림에만 붙는다', () => {
    render(<WorkspaceRail approvals={10} unread={3} onOpen={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: '워크스페이스 바로가기' });
    const labels = within(nav).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['승인 대기함', '알림', 'GPA 관리', '변경 요청', '구성원', '줌 계정', '할 일', '프로그램']);
    expect(within(screen.getByRole('button', { name: '승인 대기함' })).getByText('10')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: '알림' })).getByText('3')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: '변경 요청' })).queryByText(/\d/)).toBeNull();
  });

  it('항목 클릭은 대응 pane만 열고 GPA 관리는 대응 기능이 없어 비활성이다', () => {
    const onOpen = vi.fn();
    render(<WorkspaceRail approvals={0} unread={0} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: '승인 대기함' }));
    fireEvent.click(screen.getByRole('button', { name: '알림' }));
    fireEvent.click(screen.getByRole('button', { name: '할 일' }));
    fireEvent.click(screen.getByRole('button', { name: '프로그램' }));
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(['approvals', 'notis', 'todos', 'kinds']);
    const gpa = screen.getByRole('button', { name: 'GPA 관리' });
    expect(gpa.hasAttribute('disabled')).toBe(true);
    fireEvent.click(gpa);
    expect(onOpen).toHaveBeenCalledTimes(4);
  });

  it('배지 0은 렌더하지 않는다 — 없는 업무를 표시하지 않는다', () => {
    render(<WorkspaceRail approvals={0} unread={0} onOpen={vi.fn()} />);
    expect(within(screen.getByRole('button', { name: '승인 대기함' })).queryByText('0')).toBeNull();
  });
});
