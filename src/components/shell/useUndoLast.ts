/** @file-guide
 * 목적: useUndoLast.ts — 일정 쓰기 · §14 결재를 한 단계·여러 단계 되돌리는 단 하나의 자리 (N-138 · g1 S5 · N-84)
 * 책임/재사용: 공용 store 와 기존 useScheduleWrite · useApprovalUndo 만 쓴다. 서버 판정을 화면에서 다시 하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * **되돌리기를 실제로 하는 자리는 여기 하나다.**
 *
 * 부르는 곳이 셋이다 — 상단바 단추(원본 §16) · 스케줄 성공 띠의 단추 · Ctrl/⌘+Z.
 * 셋이 각자 `mutate` 하면 성공 뒤 정리 순서가 갈리고, 하나를 고칠 때 나머지가 조용히 낡는다.
 *
 * 토큰은 `useWorkspace` 가 갖는다(셸 상태다 · 그 파일의 주석 참조). 여기서는 **읽고 쓰기만** 한다.
 * 되돌릴 수 있는지도 store 한 곳이 답한다 — 화면이 「마지막 작업이 삭제였나」를 다시 따지지 않는다.
 */
import { liveUndoSteps, useWorkspace, type WorkspaceUndo } from '@/store/useWorkspace';
import { useApprovalUndo, useScheduleWrite } from '@/api/queries';
import { apiMessage } from '@/api/client';

type UndoDone = { onDone?: () => void; onFail?: (message: string) => void };

export interface UndoLast {
  canUndo: boolean;
  /** 「무엇을」 되돌리는지 — 가장 최근 단계 · 없으면 null */
  label: string | null;
  /** 되돌릴 수 있는 단계 — **가장 최근이 앞** (원문 셸 「⟲ 되돌리기 ▾」 목록 · g1 S5) */
  steps: WorkspaceUndo[];
  pending: boolean;
  /**
   * 가장 최근 한 단계.
   * @param done 성공/실패를 부르는 쪽이 이어 받는다 (스케줄 화면은 선택·클립보드·커서를 비운다).
   *   실패해도 토큰은 버린다 — 만료·stale 둘 다 **다시 눌러도 같은 답**이고, 남겨 두면
   *   단추가 살아 있는 채로 계속 실패한다.
   */
  undo: (done?: UndoDone) => void;
  /**
   * 최근 `count` 단계를 **뒤에서부터 차례로** — 하나가 막히면 거기서 멈추고 그 단계만 버린다.
   * 서버가 단계마다 「발급 직후와 지금이 같은가」를 다시 보므로 화면은 순서만 지킨다.
   */
  undoTo: (count: number, done?: UndoDone) => void;
}

export function useUndoLast(): UndoLast {
  const stack = useWorkspace((w) => w.undoStack);
  const dropUndo = useWorkspace((w) => w.dropUndo);
  const write = useScheduleWrite();
  // §14 결재 되돌리기(N-84) — 원문 셸의 「⟲ 되돌리기」는 한 단추라 같은 목록 · 같은 차례로 탄다. 갈래만 토큰의 `kind` 로 가른다
  const approval = useApprovalUndo();
  const steps = liveUndoSteps(stack).reverse();

  // 한 단계씩 — 앞 단계가 성공해야 다음 단계를 보낸다 (동시에 보내면 서로의 stale 판정을 흔든다)
  const run = (queue: WorkspaceUndo[], done?: UndoDone) => {
    const [head, ...rest] = queue;
    if (!head) { done?.onDone?.(); return; }
    const settle = {
      onError: (error: unknown) => { dropUndo(head.token); done?.onFail?.(apiMessage(error)); },
      onSuccess: () => { dropUndo(head.token); run(rest, done); },
    };
    if (head.kind === 'approval') approval.mutate({ token: head.token }, settle);
    else write.mutate({ kind: 'undo', body: { token: head.token } }, settle);
  };

  return {
    canUndo: steps.length > 0,
    label: steps[0]?.label ?? null,
    steps,
    pending: write.isPending || approval.isPending,
    undo: (done) => { if (steps.length) run(steps.slice(0, 1), done); },
    undoTo: (count, done) => { if (steps.length) run(steps.slice(0, Math.max(1, count)), done); },
  };
}
