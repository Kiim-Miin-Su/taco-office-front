/** @file-guide
 * 목적: 프로그램→과목 선택의 구형 호환·신형 필터·과거값 보존 회귀를 검증한다.
 * 책임/재사용: 실제 shared-options selector만 호출하며 화면에 규칙을 다시 구현하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import type { Meta } from '@/api/types';
import { hasSubjectProgramContract, subjectAvailableForProgram, subjectOptions, subjectProgramKey } from './shared-options';

const legacy = {
  subs: [
    { key: 'writing', name: 'Writing', color: '#111' },
    { key: 'diagnostic', name: 'Diagnostic', color: '#222' },
  ],
} as Pick<Meta, 'subs'>;

const linked = {
  subs: [
    { key: 'writing', name: 'Writing', color: '#111', kindKey: 'class' },
    { key: 'diagnostic', name: 'Diagnostic', color: '#222', kindKey: 'diag' },
    { key: 'old', name: 'Old subject', color: '#333' },
  ],
} as unknown as Pick<Meta, 'subs'>;

describe('프로그램별 과목 선택', () => {
  it('구형 Meta에는 새 계약을 지어내지 않고 모든 과목을 기존 순서로 둔다', () => {
    expect(hasSubjectProgramContract(legacy)).toBe(false);
    expect(subjectOptions(legacy, 'class')).toEqual([
      { key: 'writing', name: 'Writing', legacy: false },
      { key: 'diagnostic', name: 'Diagnostic', legacy: false },
    ]);
    expect(subjectAvailableForProgram(legacy, 'class', 'diagnostic')).toBe(true);
  });

  it('신형 Meta는 프로그램에 연결된 과목만 새 선택지로 허용한다', () => {
    expect(hasSubjectProgramContract(linked)).toBe(true);
    expect(subjectProgramKey(linked.subs[0]!)).toBe('class');
    expect(subjectOptions(linked, 'diag')).toEqual([
      { key: 'diagnostic', name: 'Diagnostic', legacy: false },
    ]);
    expect(subjectAvailableForProgram(linked, 'class', 'diagnostic')).toBe(false);
  });

  it('과거 저장값은 현재 옵션 한 개로 보존하되 새 프로그램에서는 유효하다고 판정하지 않는다', () => {
    expect(subjectOptions(linked, 'class', 'diagnostic')).toEqual([
      { key: 'diagnostic', name: 'Diagnostic', legacy: true },
      { key: 'writing', name: 'Writing', legacy: false },
    ]);
    expect(subjectOptions(linked, 'class', 'missing')[0]).toEqual({ key: 'missing', name: 'missing', legacy: true });
    expect(subjectAvailableForProgram(linked, 'class', 'old')).toBe(false);
  });

  it('프로그램 전체 필터에서는 연결 여부와 무관하게 모든 과목을 보인다', () => {
    expect(subjectOptions(linked, null).map((item) => item.key)).toEqual(['writing', 'diagnostic', 'old']);
  });
});
