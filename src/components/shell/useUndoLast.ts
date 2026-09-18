/** @file-guide
 * 목적: useUndoLast.ts — 직전 일정 쓰기를 되돌리는 단 하나의 자리 (N-138)
 * 책임/재사용: 공용 store 와 기존 useScheduleWrite 만 쓴다. 서버 판정을 화면에서 다시 하지 않는다.
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
import { useWorkspace } from '@/store/useWorkspace';
import { useScheduleWrite } from '@/api/queries';
import { apiMessage } from '@/api/client';

export interface UndoLast {
  canUndo: boolean;
  /** 「무엇을」 되돌리는지 — 없으면 null */
  label: string | null;
  pending: boolean;
  /**
   * @param done 성공/실패를 부르는 쪽이 이어 받는다 (스케줄 화면은 선택·클립보드·커서를 비운다).
   *   실패해도 토큰은 버린다 — 만료·stale 둘 다 **다시 눌러도 같은 답**이고, 남겨 두면
   *   단추가 살아 있는 채로 계속 실패한다.
   */
  undo: (done?: { onDone?: () => void; onFail?: (message: string) => void }) => void;
}

export function useUndoLast(): UndoLast {
  const undoState = useWorkspace((w) => w.undo);
  const setUndo = useWorkspace((w) => w.setUndo);
  const write = useScheduleWrite();
  return {
    canUndo: undoState !== null,
    label: undoState?.label ?? null,
    pending: write.isPending,
    undo: (done) => {
      if (!undoState) return;
      write.mutate(
        { kind: 'undo', body: { token: undoState.token } },
        {
          onError: (error) => { setUndo(null); done?.onFail?.(apiMessage(error)); },
          onSuccess: () => { setUndo(null); done?.onDone?.(); },
        },
      );
    },
  };
}
