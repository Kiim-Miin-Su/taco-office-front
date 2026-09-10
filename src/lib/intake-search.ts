/** @file-guide
 * 목적: intake-search.ts — FAILURE_SEARCH_LABEL, filterLeadsByQuery (util)
 * 책임/재사용: 현재 lib 계층의 순수 계산/표시 방어를 우선 재사용한다. UI·네트워크·DB 부수효과와 서버 업무 권위를 섞지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Lead } from '@/api/types';

export const FAILURE_SEARCH_LABEL = '이름 · 학교 · 담당 · 사유로 찾기';

/** §24 FQ는 GET /ops의 네 필드에 대한 로컬 검색이다. DB 원문/캐시는 변경하지 않는다. */
export function filterLeadsByQuery(leads: readonly Lead[], query: string): readonly Lead[] {
  const needle = query.trim().normalize('NFC').toLowerCase();
  if (!needle) return leads;
  return leads.filter((lead) => [lead.name, lead.school, lead.ownerName, lead.reason]
    .some((value) => value?.normalize('NFC').toLowerCase().includes(needle)));
}
