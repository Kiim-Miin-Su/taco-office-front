/** @file-guide
 * 목적: useWorkspace.ts — useWorkspace (auth)
 * 책임/재사용: 공용 인증/권한 경계만 소유한다. 토큰·쿠키 원문을 노출하지 않고 만료/익명/권한 회수 경계를 회귀로 검증한다.
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
