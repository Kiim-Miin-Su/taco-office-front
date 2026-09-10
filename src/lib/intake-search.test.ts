import { describe, expect, it } from 'vitest';
import type { Lead } from '@/api/types';
import { filterLeadsByQuery } from './intake-search';

const lead: Lead = {
  id: 1, name: '장서우', school: '언주중', ownerName: 'Grace', reason: '연락 두절 (2회)',
  stage: 'failed', stopAt: null, ageDays: 0, createdAt: '2026-09-10', studentId: null, ownerId: null,
};

describe('§24 FQ — 생성 Lead 계약을 소비하는 순수 selector', () => {
  it.each(['서우', '언주', 'grACE', '연락 두절', '(2회)', '  장서우  ', '장서우'.normalize('NFD')])('%s 검색', (query) => {
    expect(filterLeadsByQuery([lead], query)).toEqual([lead]);
  });
  it.each(['', ' ', '\t\n'])('빈 검색은 기존 참조와 순서를 유지한다', (query) => {
    const leads = [lead];
    expect(filterLeadsByQuery(leads, query)).toBe(leads);
  });
  it('nullable 필드를 안전하게 처리하고 빈 결과를 반환한다', () => {
    expect(filterLeadsByQuery([{ ...lead, school: null, ownerName: null, reason: null }], 'Grace')).toEqual([]);
  });
  it('정규식 문법을 실행하지 않고 리터럴로 검색한다', () => {
    expect(filterLeadsByQuery([lead], '.*')).toEqual([]);
  });
  it('필드 경계를 합쳐 가짜 일치를 만들지 않는다', () => {
    expect(filterLeadsByQuery([lead], '장서우언주중')).toEqual([]);
  });
  it('호출자가 정한 중단 필터 범위/순서를 유지하며 원문을 변경하지 않는다', () => {
    const second = Object.freeze({ ...lead, id: 2, ownerName: ' Grace ' });
    const leads = Object.freeze([second, Object.freeze(lead)]);
    expect(filterLeadsByQuery(leads, 'grace')).toEqual([second, lead]);
    expect(second.ownerName).toBe(' Grace ');
    expect(lead.name).toBe('장서우');
  });
});
