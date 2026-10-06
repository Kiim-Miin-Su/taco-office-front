/** @file-guide
 * 목적: 승인 대기함에 표시할 로그인 사용자의 미완료 수신 TODO projection을 한 곳에서 만든다.
 * 책임/재사용: 서버가 준 DrawerTodo를 필터링할 뿐 권한·완료·알림 업무 규칙을 새로 판정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { DrawerTodo } from '@/api/types';

/** 관리자 수정사항 A07 — 받는 사람의 승인 대기함에는 그 사람의 미완료 할 일만 선다. */
export function receivedOpenTodos(todos: readonly DrawerTodo[], meId: number | null | undefined): DrawerTodo[] {
  if (meId == null) return [];
  return todos.filter((todo) => todo.toId === meId && !todo.done);
}
