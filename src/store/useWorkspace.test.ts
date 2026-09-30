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
    useWorkspace.getState().clearDrawer();
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

describe('UX-15 변경 요청 전송 경계', () => {
  beforeEach(() => useWorkspace.getState().clearDrawer());

  it('진행 중인 같은 초안은 한 번만 시작하고 올바른 세대에서만 현재 초안에 결과를 적용한다', () => {
    const workspace = useWorkspace.getState();
    workspace.openDrawer('viewer-1', 'chreqs');
    workspace.beginChangeReq('viewer-1');
    const token = workspace.startChangeReqSubmission('viewer-1', 7);
    expect(token).not.toBeNull();
    expect(workspace.startChangeReqSubmission('viewer-1', 7)).toBeNull();
    expect(workspace.startChangeReqSubmission('viewer-2', 7)).toBeNull();
    expect(workspace.finishChangeReqSubmission('viewer-1', token!, 8, { kind: 'success' })).toBe(false);
    expect(useWorkspace.getState().drawer.submission).toBeNull();
    expect(useWorkspace.getState().drawer.feedback).toBeNull();
  });

  it('전송 뒤 초안 편집·취소·재열기는 이전 성공으로 닫히지 않되 pending은 settle까지 유지한다', () => {
    const workspace = useWorkspace.getState();
    workspace.openDrawer('viewer-1', 'chreqs');
    workspace.beginChangeReq('viewer-1');
    const token = workspace.startChangeReqSubmission('viewer-1', 7)!;
    const draft = useWorkspace.getState().drawer.draft!;
    workspace.setChangeReqDraft('viewer-1', { ...draft, reason: '전송 뒤 수정' });
    workspace.endChangeReq('viewer-1');
    workspace.beginChangeReq('viewer-1');
    expect(workspace.startChangeReqSubmission('viewer-1', 7)).toBeNull();
    expect(workspace.finishChangeReqSubmission('viewer-1', token, 7, { kind: 'success' })).toBe(false);
    expect(useWorkspace.getState().drawer.creating).toBe(true);
    expect(useWorkspace.getState().drawer.submission).toBeNull();
    expect(useWorkspace.getState().drawer.feedback).toEqual({ kind: 'success', token, priorDraft: true });
    expect(workspace.startChangeReqSubmission('viewer-1', 7)).toBeNull();
    workspace.acknowledgeChangeReqFeedback('viewer-1');
    expect(useWorkspace.getState().drawer.feedback).toBeNull();
    expect(workspace.startChangeReqSubmission('viewer-1', 7)).not.toBeNull();
  });

  it('계정 경계 초기화 뒤 토큰은 재사용되지 않고 이전 settle은 새 초안을 건드리지 않는다', () => {
    const workspace = useWorkspace.getState();
    workspace.openDrawer('viewer-1', 'chreqs');
    workspace.beginChangeReq('viewer-1');
    const oldToken = workspace.startChangeReqSubmission('viewer-1', 7)!;
    workspace.clearDrawer();
    workspace.openDrawer('viewer-1', 'chreqs');
    workspace.beginChangeReq('viewer-1');
    const newToken = workspace.startChangeReqSubmission('viewer-1', 8)!;
    expect(newToken).not.toBe(oldToken);
    expect(workspace.finishChangeReqSubmission('viewer-1', oldToken, 8, { kind: 'success' })).toBe(false);
    expect(useWorkspace.getState().drawer.submission?.token).toBe(newToken);
    expect(workspace.finishChangeReqSubmission('viewer-1', newToken, 8, { kind: 'success' })).toBe(true);
    expect(useWorkspace.getState().drawer.creating).toBe(false);
    expect(useWorkspace.getState().drawer.feedback).toEqual({ kind: 'success', token: newToken, priorDraft: false });
  });
});
