import { describe, expect, it } from 'vitest';
import { changeReqBody, changeReqReady, EMPTY_DRAFT, type ChangeReqDraft } from './change-request';

const draft = (over: Partial<ChangeReqDraft> = {}): ChangeReqDraft => ({
  ...EMPTY_DRAFT,
  serId: '12',
  onDate: '2026-09-03',
  startMin: '600',
  endMin: '660',
  reason: '  변경 사유  ',
  ...over,
});

describe('변경 요청 폼 계약', () => {
  it('종류별 생성 타입에 필요한 필드만 보낸다', () => {
    expect(changeReqBody(draft())).toEqual({
      reqType: 'time_move', serId: 12, onDate: '2026-09-03',
      startMin: 600, endMin: 660, reason: '변경 사유', applyAll: undefined,
    });
    expect(changeReqBody(draft({ reqType: 'teacher', teacherId: '7', roomId: '3' }))).toEqual({
      reqType: 'teacher', serId: 12, onDate: '2026-09-03',
      teacherId: 7, reason: '변경 사유', applyAll: undefined,
    });
    expect(changeReqBody(draft({ reqType: 'room', resourceTarget: 'zoom', zaccId: '2', roomId: '3' }))).toEqual({
      reqType: 'room', serId: 12, onDate: '2026-09-03',
      zaccId: 2, reason: '변경 사유', applyAll: undefined,
    });
    expect(changeReqBody(draft({ reqType: 'cancel', applyAll: true }))).toEqual({
      reqType: 'cancel', serId: 12, onDate: '2026-09-03', reason: '변경 사유', applyAll: true,
    });
  });

  it('서버와 같은 필수값·시간 경계를 만족해야 제출할 수 있다', () => {
    expect(changeReqReady(draft())).toBe(true);
    expect(changeReqReady(draft({ serId: '0' }))).toBe(false);
    expect(changeReqReady(draft({ endMin: '605' }))).toBe(false);
    expect(changeReqReady(draft({ reqType: 'teacher', teacherId: '' }))).toBe(false);
    expect(changeReqReady(draft({ reqType: 'room', resourceTarget: 'room', roomId: '' }))).toBe(false);
    expect(changeReqReady(draft({ reqType: 'cancel', reason: ' '.repeat(501) }))).toBe(false);
    expect(changeReqReady(draft({ reqType: 'cancel', reason: ` ${'a'.repeat(500)} ` }))).toBe(true);
  });
});
