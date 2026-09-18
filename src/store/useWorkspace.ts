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

/**
 * 되돌릴 **직전 일정 쓰기** — 상단바 단추가 그것을 읽는다 (N-138 · C99).
 *
 * 원본 §16 컷의 상단바는 「오늘 전체 · ← 뒤로 · **⟲ 되돌리기**」이고, 되돌릴 것이 없으면
 * **흐리게** 그려져 있다. 그 단추는 셸에 있고 토큰을 만드는 것은 스케줄 화면이라
 * **둘 중 한쪽이 갖고 있으면 서로 다른 말을 한다** — 그래서 여기가 단일 소유자다.
 *
 * 서버에 저장하지 않는다(C87 의 결정) — 토큰은 HMAC 으로 서명된 스냅숏이고 10분·본인 것이라
 * 브라우저 메모리에만 둔다. 새로 고치면 사라진다.
 */
export interface WorkspaceUndo {
  token: string;
  /** 「무엇을」 되돌리는지 — 띠와 단추 `title` 이 같은 낱말을 쓴다 */
  label: string;
}

interface WorkspaceState {
  sidebarOpen: boolean;
  railOpen: boolean;
  undo: WorkspaceUndo | null;
  toggleSidebar: () => void;
  toggleRail: () => void;
  setUndo: (undo: WorkspaceUndo | null) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  sidebarOpen: false,
  railOpen: true,
  undo: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
  setUndo: (undo) => set({ undo }),
}));
