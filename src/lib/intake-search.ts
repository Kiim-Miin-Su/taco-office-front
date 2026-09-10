import type { Lead } from '@/api/types';

export const FAILURE_SEARCH_LABEL = '이름 · 학교 · 담당 · 사유로 찾기';

/** §24 FQ는 GET /ops의 네 필드에 대한 로컬 검색이다. DB 원문/캐시는 변경하지 않는다. */
export function filterLeadsByQuery(leads: readonly Lead[], query: string): readonly Lead[] {
  const needle = query.trim().normalize('NFC').toLowerCase();
  if (!needle) return leads;
  return leads.filter((lead) => [lead.name, lead.school, lead.ownerName, lead.reason]
    .some((value) => value?.normalize('NFC').toLowerCase().includes(needle)));
}
