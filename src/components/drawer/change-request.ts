/** @file-guide
 * 목적: change-request.ts — ChreqType, ChangeReqDraft, EMPTY_DRAFT, changeReqBody, changeReqReady (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ChangeReqCreate } from '@/api/types';
import { lessonTimeIssue, todayKst } from '@/lib/calendar';

export type ChreqType = ChangeReqCreate['reqType'];

export interface ChangeReqDraft {
  reqType: ChreqType;
  /**
   * §19 「어느 날」 — **고르는 날**이다(그날의 일정 목록을 여는 열쇠). 저장 계약이 아니다.
   * 보내는 날짜는 아래 `onDate`(규칙이 찍은 원래 날 = EXC 키)이고, 둘은 옮긴 회차에서 갈린다 —
   * 9/25 로 옮겨진 9/24 회차를 9/25 목록에서 고르면 보내는 값은 9/24 다 (g2 대조 19-2).
   */
  day: string;
  /** 「어느 일정」에서 고른 회차 — 사용자가 직접 치지 않는다(서버 `OccurrenceDto` 의 두 키 그대로) */
  serId: string;
  onDate: string;
  startMin: string;
  endMin: string;
  teacherId: string;
  resourceTarget: 'room' | 'zoom';
  roomId: string;
  zaccId: string;
  reason: string;
  applyAll: boolean;
}

export const EMPTY_DRAFT: ChangeReqDraft = {
  reqType: 'time_move', day: '', serId: '', onDate: '', startMin: '', endMin: '', teacherId: '',
  resourceTarget: 'room', roomId: '', zaccId: '', reason: '', applyAll: false,
};

/** 새 초안 — 「어느 날」은 **오늘(KST)** 로 열린다 (원문 §19 · g2 대조 19-8) */
export function newChangeReqDraft(day: string = todayKst()): ChangeReqDraft {
  return { ...EMPTY_DRAFT, day };
}

/**
 * 「어느 일정」 선택 값 — 회차를 가리키는 두 키(`serId`·`onDate`)를 한 문자열로 묶는다.
 * 목록에는 **그려지는 날**로 걸린 회차가 오지만 값은 **원래 날(EXC 키)** 이라 옮긴 회차도 제 회차를 가리킨다.
 */
export const occurrenceTargetValue = (serId: number | string, onDate: string): string => `${serId}|${onDate}`;

export function parseOccurrenceTarget(value: string): { serId: string; onDate: string } {
  const [serId = '', onDate = ''] = value.split('|');
  return { serId, onDate };
}

/** 생성된 oneOf 타입으로만 본문을 만든다. 종류와 무관한 필드는 이 경계를 넘지 않는다. */
export function changeReqBody(draft: ChangeReqDraft): ChangeReqCreate {
  const target = {
    serId: Number(draft.serId),
    onDate: draft.onDate,
    reason: draft.reason.trim(),
    applyAll: draft.applyAll || undefined,
  };
  if (draft.reqType === 'time_move') {
    return { ...target, reqType: draft.reqType, startMin: Number(draft.startMin), endMin: Number(draft.endMin) };
  }
  if (draft.reqType === 'teacher') {
    return { ...target, reqType: draft.reqType, teacherId: Number(draft.teacherId) };
  }
  if (draft.reqType === 'room') {
    return draft.resourceTarget === 'room'
      ? { ...target, reqType: draft.reqType, roomId: Number(draft.roomId) }
      : { ...target, reqType: draft.reqType, zaccId: Number(draft.zaccId) };
  }
  return { ...target, reqType: draft.reqType };
}

export function changeReqReady(draft: ChangeReqDraft): boolean {
  const positiveId = (value: string) => Number.isInteger(Number(value)) && Number(value) > 0;
  const reason = draft.reason.trim();
  if (!positiveId(draft.serId) || !draft.onDate || !reason || reason.length > 500) return false;
  if (draft.reqType === 'time_move') {
    if (!draft.startMin || !draft.endMin) return false;
    return lessonTimeIssue(Number(draft.startMin), Number(draft.endMin)) === null;
  }
  if (draft.reqType === 'teacher') return positiveId(draft.teacherId);
  if (draft.reqType === 'room') {
    return draft.resourceTarget === 'room' ? positiveId(draft.roomId) : positiveId(draft.zaccId);
  }
  return true;
}
