/** @file-guide
 * 목적: consulting.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import type { Consulting } from '@/api/types';
import { CONSULTING_STAGES, consultingStageView } from './consulting';

const rows = [
  { id: 1, stage: 'contract', canOpen: false },
  { id: 2, stage: 'running', canOpen: true },
  { id: 3, stage: 'contract', canOpen: true },
] as Consulting[];

describe('§26 단계 필터', () => {
  it('원본의 계약 파랑·진행 보라·종료 초록을 공용 매핑으로 사용한다', () => {
    expect(CONSULTING_STAGES.map(({ tone }) => tone)).toEqual(['info', 'purple', 'success']);
  });
  it.each(['all', 'contract', 'running', 'done'] as const)('%s 선택은 원본 순서/객체와 전체 건수를 보존한다', (stage) => {
    const before = structuredClone(rows);
    const result = consultingStageView(rows, stage);
    expect(result.counts).toEqual({ all: 3, contract: 2, running: 1, done: 0 });
    expect(result.items).toEqual(stage === 'all' ? rows : rows.filter((row) => row.stage === stage));
    expect(rows).toEqual(before);
    result.items.forEach((row) => expect(row).toBe(rows.find((source) => source.id === row.id)));
  });
  it('빈 응답의 모든 건수는 0이며 상태를 저장하지 않는다', () => {
    expect(consultingStageView([], 'running')).toEqual({ items: [], counts: { all: 0, contract: 0, running: 0, done: 0 } });
  });
});
