import type { ChangeReqCreate } from '@/api/types';
import { lessonTimeIssue } from '@/lib/calendar';

export type ChreqType = ChangeReqCreate['reqType'];

export interface ChangeReqDraft {
  reqType: ChreqType;
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
  reqType: 'time_move', serId: '', onDate: '', startMin: '', endMin: '', teacherId: '',
  resourceTarget: 'room', roomId: '', zaccId: '', reason: '', applyAll: false,
};

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
