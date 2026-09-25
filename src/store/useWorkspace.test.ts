/** @file-guide
 * 목적: useWorkspace.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspace } from './useWorkspace';

describe('워크스페이스 접힘 상태 — 단일 소유자', () => {
  beforeEach(() => {
    useWorkspace.setState({ sidebarOpen: false, railOpen: true });
  });

  it('기본값은 좌측 사이드바 접힘 · 우측 rail 열림 — 사용자 지시 「사이드바는 기본 접힘」(AGENT §B)이 원문 컷의 펼친 모습보다 우선한다', () => {
    // beforeEach 가 덮은 값이 아니라 store 가 처음 만든 값을 본다
    expect(useWorkspace.getInitialState().sidebarOpen).toBe(false);
    expect(useWorkspace.getInitialState().railOpen).toBe(true);
    expect(useWorkspace.getInitialState().undoStack).toEqual([]);
  });

  it('toggleSidebar는 좌측만, toggleRail은 우측만 뒤집는다', () => {
    useWorkspace.getState().toggleSidebar();
    expect(useWorkspace.getState().sidebarOpen).toBe(true);
    expect(useWorkspace.getState().railOpen).toBe(true);
    useWorkspace.getState().toggleRail();
    expect(useWorkspace.getState().sidebarOpen).toBe(true);
    expect(useWorkspace.getState().railOpen).toBe(false);
  });

  it('두 번 토글하면 원래 상태로 복원된다 — 왕복에 잔여 상태가 없다', () => {
    useWorkspace.getState().toggleSidebar();
    useWorkspace.getState().toggleSidebar();
    useWorkspace.getState().toggleRail();
    useWorkspace.getState().toggleRail();
    expect(useWorkspace.getState().sidebarOpen).toBe(false);
    expect(useWorkspace.getState().railOpen).toBe(true);
  });
});
