/** @file-guide
 * 목적: useWorkspace.ts — useWorkspace (store)
 * 책임/재사용: 워크스페이스 셸의 양쪽 접힘 상태 한 곳만 소유한다. 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 양쪽 사이드바 접힘의 **단일 소유자** (사용자 재우선순위 U1 · 2026-09-11).
 * 기본값은 Figma Prototype State / Workspace 와 같다 — 좌측은 접힘, 우측 rail 은 열림.
 * 화면 상태가 아니라 셸 상태이므로 페이지 useReducer 가 아닌 전역 store 에 둔다 (결정 §4-5 관례).
 */
import { create } from 'zustand';

interface WorkspaceState {
  sidebarOpen: boolean;
  railOpen: boolean;
  toggleSidebar: () => void;
  toggleRail: () => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  sidebarOpen: false,
  railOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
}));
