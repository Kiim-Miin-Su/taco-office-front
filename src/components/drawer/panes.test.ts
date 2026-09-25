/** @file-guide
 * 목적: panes.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import {
  changeReqBody, changeReqReady, EMPTY_DRAFT, newChangeReqDraft, occurrenceTargetValue, parseOccurrenceTarget,
  type ChangeReqDraft,
} from './change-request';

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

describe('§19 어느 날 · 어느 일정 (g2 대조 19-2 · 19-8)', () => {
  it('새 초안의 「어느 날」은 받은 날(기본 오늘)이고, 「어느 날」은 보내는 본문에 실리지 않는다', () => {
    expect(newChangeReqDraft('2026-09-25').day).toBe('2026-09-25');
    expect(newChangeReqDraft('2026-09-25').serId).toBe('');
    const body = changeReqBody(draft({ day: '2026-09-25', onDate: '2026-09-24' }));
    expect(body).not.toHaveProperty('day');
    expect(body.onDate).toBe('2026-09-24');
  });

  it('「어느 일정」 값은 회차의 두 키를 그대로 오간다', () => {
    const value = occurrenceTargetValue(41, '2026-09-24');
    expect(parseOccurrenceTarget(value)).toEqual({ serId: '41', onDate: '2026-09-24' });
    expect(parseOccurrenceTarget('')).toEqual({ serId: '', onDate: '' });
  });
});
