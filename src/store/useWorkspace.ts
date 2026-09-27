/** @file-guide
 * 목적: useWorkspace.ts — useWorkspace (auth)
 * 책임/재사용: 공용 인증/권한 경계만 소유한다. 토큰·쿠키 원문을 노출하지 않고 만료/익명/권한 회수 경계를 회귀로 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 양쪽 사이드바 접힘의 **단일 소유자** (사용자 재우선순위 U1 · 2026-09-11).
 * 기본값은 좌측 사이드바 **접힘** · 우측 rail 열림이다. 원문 §07~§11 컷은 좌측을 펼친 채 그리지만
 * 사용자 지시 「사이드바는 접기/펼치기 가능·기본 접힘」(AGENT §B · 2026-09-08/11)이 원문보다 우선한다 —
 * D-R44 는 결정이 비어 있을 때의 규칙이라 명시 지시를 넘지 않는다(wave 5 에서 한 번 펼침으로 바뀌었다가 되돌렸다).
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
  /**
   * 서버가 정한 그 토큰의 만료(`WriteResult.undoExpiresAt`) — 지난 단계는 목록에서 뺀다.
   * 10분이라는 수를 화면이 따로 들지 않으려고 서버 값을 그대로 쓴다. 없으면 서버가 답할 때까지 둔다.
   */
  expiresAt?: string | null;
  /**
   * 어느 되돌리기인가 — 없으면 일정 쓰기(`POST /schedule/undo`), `approval` 이면 §14 결재 되돌리기
   * (`POST /drawer/approvals/undo` · N-84). 원문 셸의 「⟲ 되돌리기」는 **한 단추**라 두 갈래가 같은 목록에 선다.
   */
  kind?: 'approval';
}

/**
 * 원문 셸 「⟲ 되돌리기 ▾」는 **여러 단계**다(g1 S5). 뒤가 가장 최근이고, 되돌리기는 뒤에서부터 한 칸씩이다.
 * 토큰 하나가 규칙 스냅숏이라 무겁다 — 메모리 상한으로 최근 10단계만 둔다(원문에 수가 없다 · 만료 10분이 실제 한도).
 */
export const UNDO_STACK_MAX = 10;

/** 서버 만료가 지나지 않은 단계만 — 만료가 없으면 서버가 답하게 둔다 */
export const liveUndoSteps = (stack: WorkspaceUndo[], now = Date.now()): WorkspaceUndo[] =>
  stack.filter((step) => !step.expiresAt || Date.parse(step.expiresAt) > now);

interface WorkspaceState {
  sidebarOpen: boolean;
  railOpen: boolean;
  /** 되돌릴 수 있는 일정 쓰기 — 뒤가 가장 최근 */
  undoStack: WorkspaceUndo[];
  toggleSidebar: () => void;
  toggleRail: () => void;
  /** 성공한 쓰기의 토큰을 맨 뒤에 쌓는다 — 지난 단계는 이때 버린다 */
  pushUndo: (step: WorkspaceUndo) => void;
  /** 쓴(성공·실패) 토큰을 버린다 — 같은 토큰은 다시 눌러도 같은 답이라 남기지 않는다 */
  dropUndo: (token: string) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  sidebarOpen: false,
  railOpen: true,
  undoStack: [],
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
  pushUndo: (step) => set((s) => ({ undoStack: [...liveUndoSteps(s.undoStack), step].slice(-UNDO_STACK_MAX) })),
  dropUndo: (token) => set((s) => ({ undoStack: s.undoStack.filter((step) => step.token !== token) })),
}));
