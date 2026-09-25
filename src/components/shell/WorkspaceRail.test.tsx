/** @file-guide
 * 목적: WorkspaceRail.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRailPresent, WorkspaceRail } from './WorkspaceRail';

afterEach(cleanup);

describe('원본 §07 우측 rail — 기존 서랍 pane 바로가기', () => {
  it('여덟 항목을 원본 순서로 렌더하고 배지는 승인/알림에만 붙는다', () => {
    render(<WorkspaceRail approvals={10} unread={3} onOpen={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: '워크스페이스 바로가기' });
    // GPA 관리는 제 화면이 있어 링크다 — 나머지 일곱은 서랍을 여는 단추다
    const labels = [...nav.children]
      .filter((el) => el.getAttribute('role') !== 'separator')
      .map((el) => el.getAttribute('aria-label'));
    expect(labels).toEqual(['승인 대기함', '알림', 'GPA 관리', '변경 요청', '구성원', '줌 계정', '할 일', '프로그램']);
    expect(within(screen.getByRole('button', { name: '승인 대기함' })).getByText('10')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: '알림' })).getByText('3')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: '변경 요청' })).queryByText(/\d/)).toBeNull();
  });

  it('항목 클릭은 대응 pane 만 연다', () => {
    const onOpen = vi.fn();
    render(<WorkspaceRail approvals={0} unread={0} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: '승인 대기함' }));
    fireEvent.click(screen.getByRole('button', { name: '알림' }));
    fireEvent.click(screen.getByRole('button', { name: '할 일' }));
    fireEvent.click(screen.getByRole('button', { name: '프로그램' }));
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(['approvals', 'notis', 'todos', 'kinds']);
  });

  /*
   * 한동안 이 항목이 **꺼져 있었다**(「GPA 관리 — 준비 중」). 그런데 `/gpa` 는 이미 돌고 있었고
   * 수업 상세가 이미 그리로 링크한다 — **있는 기능이 없는 것처럼 보였다.**
   */
  it('GPA 관리는 서랍이 아니라 제 화면으로 가는 링크다 — 꺼 두지 않는다', () => {
    render(<WorkspaceRail approvals={0} unread={0} onOpen={vi.fn()} />);
    const gpa = screen.getByRole('link', { name: 'GPA 관리' });
    expect(gpa.getAttribute('href')).toBe('/gpa');
    expect(gpa.hasAttribute('disabled')).toBe(false);
    expect(gpa.getAttribute('title')).toBe('GPA 관리');
  });

  /* g2 대조 20-1 — 원문 레일의 「변경 요청」은 §20 「변경 요청 · 이력」 칸이다. 넣기(§19)는 그 칸의 창이다 */
  it('변경 요청은 넣기 폼이 아니라 §20 변경 요청 · 이력 칸을 연다', () => {
    const onOpen = vi.fn();
    render(<WorkspaceRail approvals={0} unread={0} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: '변경 요청' }));
    expect(onOpen).toHaveBeenCalledWith('chreqs');
  });

  /* g2 대조 C-2 — 지금 열린 칸이 어두운 채운 타일이다. 무엇이 열렸는지는 셸이 준 값 하나다 */
  it('지금 열린 칸만 채운 타일로 눌림 표시되고, 닫혀 있으면 아무것도 눌리지 않는다', () => {
    const view = render(<WorkspaceRail approvals={3} unread={0} onOpen={vi.fn()} activePane="notis" />);
    const notis = screen.getByRole('button', { name: '알림' });
    expect(notis.getAttribute('aria-pressed')).toBe('true');
    expect(notis.className).toContain('bg-header');
    expect(notis.className).toContain('text-white');
    const approvals = screen.getByRole('button', { name: '승인 대기함' });
    expect(approvals.getAttribute('aria-pressed')).toBe('false');
    expect(approvals.className).not.toContain('bg-header');
    // 배지는 활성 타일 위에서도 그대로다
    expect(within(approvals).getByText('3')).toBeTruthy();
    view.rerender(<WorkspaceRail approvals={3} unread={0} onOpen={vi.fn()} activePane={null} />);
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
  });

  it('배지 0은 렌더하지 않는다 — 없는 업무를 표시하지 않는다', () => {
    render(<WorkspaceRail approvals={0} unread={0} onOpen={vi.fn()} />);
    expect(within(screen.getByRole('button', { name: '승인 대기함' })).queryByText('0')).toBeNull();
  });

  /*
   * g2 대조 C-5 — 원문 레일의 아이콘은 GPA 관리=시계 · 변경 요청=되감기 시계 · 구성원=사람+ · 할 일=달력 체크이고,
   * **구분선이 둘**(승인 대기함 뒤 · 변경 요청 뒤) 있으며 라벨이 굵다.
   */
  it('아이콘·구분선·굵은 라벨이 원문 레일 그대로다', () => {
    render(<WorkspaceRail approvals={0} unread={0} onOpen={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: '워크스페이스 바로가기' });
    const order = [...nav.children].map((el) => (el.getAttribute('role') === 'separator' ? '|' : el.getAttribute('aria-label')));
    expect(order).toEqual(['승인 대기함', '|', '알림', 'GPA 관리', '변경 요청', '|', '구성원', '줌 계정', '할 일', '프로그램']);
    const iconOf = (el: HTMLElement) => el.querySelector('svg')?.getAttribute('class') ?? '';
    expect(iconOf(screen.getByRole('link', { name: 'GPA 관리' }))).toContain('lucide-clock');
    expect(iconOf(screen.getByRole('button', { name: '변경 요청' }))).toContain('lucide-history');
    expect(iconOf(screen.getByRole('button', { name: '구성원' }))).toContain('lucide-user-plus');
    expect(iconOf(screen.getByRole('button', { name: '할 일' }))).toContain('lucide-calendar-check');
    expect(within(screen.getByRole('button', { name: '알림' })).getByText('알림').className).toContain('font-bold');
  });

  /*
   * g2 대조 C-3 — 서랍 안의 칸 전환 줄은 **레일이 보일 때** 필요 없다(원문 서랍에 탭이 없다).
   * 레일이 떠 있는지는 레일 자신이 알린다 — 셸이 따로 기억하지 않는다.
   */
  it('레일이 떠 있는 동안만 useRailPresent 가 true 다', () => {
    const hook = renderHook(() => useRailPresent());
    expect(hook.result.current).toBe(false);
    const view = render(<WorkspaceRail approvals={0} unread={0} onOpen={vi.fn()} />);
    hook.rerender();
    expect(hook.result.current).toBe(true);
    view.unmount();
    hook.rerender();
    expect(hook.result.current).toBe(false);
  });
});
