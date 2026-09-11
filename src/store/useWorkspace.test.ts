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

  it('기본값은 Figma Prototype State와 같다 — 좌측 접힘, 우측 rail 열림', () => {
    expect(useWorkspace.getState().sidebarOpen).toBe(false);
    expect(useWorkspace.getState().railOpen).toBe(true);
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
