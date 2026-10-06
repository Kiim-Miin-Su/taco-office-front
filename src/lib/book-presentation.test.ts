/** @file-guide
 * 목적: §39 Foundation/Practice/Master 의미색과 미확정 레벨 보존 경계를 회귀 검증한다.
 * 책임/재사용: 순수 선택기만 검증하며 카드 DOM과 서버 데이터 생성은 맡지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import { bookLevelPresentation, bookLevelUiLabel } from './book-presentation';

describe('교재 레벨 표시 — 개발명세서 §39', () => {
  it.each([
    ['Foundation', 'F', 'bg-red'],
    ['Practice', 'P', 'bg-amber'],
    ['Master', 'M', 'bg-green'],
  ])('%s는 원본 표식 %s와 의미색 %s를 쓴다', (label, marker, bandClass) => {
    expect(bookLevelPresentation(label)).toEqual({ label, marker, bandClass });
  });

  it.each(['AP', 'SAT', 'B2', 'M5', 'P'])('%s를 Foundation/Practice/Master로 추정하지 않는다', (label) => {
    expect(bookLevelPresentation(label)).toEqual({ label, marker: label, bandClass: 'bg-fg-2' });
  });

  it('빈 값만 대시로 표시한다', () => {
    expect(bookLevelPresentation('  ')).toEqual({ label: '—', marker: '—', bandClass: 'bg-fg-2' });
  });
});

describe('최신 수정사항의 교재 난이도 화면 표기', () => {
  it.each([
    ['foundation', '기초'],
    ['practice', '실전'],
    ['master', '심화'],
  ])('%s 저장 키를 %s로 표시한다', (key, label) => {
    expect(bookLevelUiLabel(key, '서버 표시')).toBe(label);
  });

  it('미확정 키는 서버 표시를 보존하고 빈 값만 미분류로 표시한다', () => {
    expect(bookLevelUiLabel('sat', 'SAT')).toBe('SAT');
    expect(bookLevelUiLabel(null, '  ')).toBe('미분류');
    expect(bookLevelUiLabel(null, null)).toBe('미분류');
  });
});
