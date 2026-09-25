/** @file-guide
 * 목적: GuideStatus.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { expect, it } from 'vitest';
import { guideLessonLabel } from './GuideStatus';

it('규칙 제목이 없는 정규 수업도 과목·시각·강의실로 이름이 선다 — 「수업명 미정」은 사실이 하나도 없을 때만', () => {
  expect(guideLessonLabel({ serTitle: null, subName: 'SAT Reading', kindName: '수업', startMin: 1020, roomName: '2호' })).toBe(
    'SAT Reading · 17:00 · 2호',
  );
  // 과목이 없으면 종류 이름으로
  expect(guideLessonLabel({ serTitle: null, subName: null, kindName: '진단고사', startMin: null, roomName: null })).toBe('진단고사');
  // 규칙 제목이 있으면 그것이 먼저다
  expect(guideLessonLabel({ serTitle: '주간 운영 회의', subName: '기획 회의', startMin: 600 })).toBe('주간 운영 회의 · 10:00');
  expect(guideLessonLabel({})).toBe('수업명 미정');
});
