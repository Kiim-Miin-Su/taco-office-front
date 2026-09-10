/** @file-guide
 * 목적: consulting.ts — CONSULTING_TYPES, CONSULTING_STAGES, ConsultingStageFilterValue, ConsultingStageCounts, consultingStageView 등 (util)
 * 책임/재사용: 현재 lib 계층의 순수 계산/표시 방어를 우선 재사용한다. UI·네트워크·DB 부수효과와 서버 업무 권위를 섞지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Consulting } from '@/api/types';
import type { Tone } from '@/components/ui';

export const CONSULTING_TYPES: Readonly<Record<string, string>> = {
  admissions: '입시',
  essay: '에세이',
  roadmap: '로드맵',
};

export const CONSULTING_STAGES = [
  { key: 'contract', label: '계약', tone: 'info', markerClass: 'bg-blue' },
  { key: 'running', label: '진행', tone: 'purple', markerClass: 'bg-violet' },
  { key: 'done', label: '종료', tone: 'success', markerClass: 'bg-green' },
] as const satisfies ReadonlyArray<{ key: Consulting['stage']; label: string; tone: Tone; markerClass: string }>;

export type ConsultingStageFilterValue = 'all' | Consulting['stage'];
export type ConsultingStageCounts = Record<ConsultingStageFilterValue, number>;

/** 권한으로 투영된 목록만 사용한다. 선택은 UI 상태이며 원본 목록/건수를 변경하지 않는다. */
export function consultingStageView(items: Consulting[], selected: ConsultingStageFilterValue) {
  const counts: ConsultingStageCounts = { all: items.length, contract: 0, running: 0, done: 0 };
  for (const item of items) counts[item.stage] += 1;
  return { counts, items: selected === 'all' ? items : items.filter((item) => item.stage === selected) };
}

export const CONSULTING_STAGE_BY_KEY: Readonly<Record<string, { label: string; tone: Tone; markerClass: string }>> =
  Object.fromEntries(CONSULTING_STAGES.map(({ key, label, tone, markerClass }) => [key, { label, tone, markerClass }]));

export const CONSULTING_SHARES: Readonly<Record<string, { label: string; tone: Tone }>> = {
  all: { label: '전체 공개', tone: 'neutral' },
  money_only: { label: '수납만 공개', tone: 'info' },
  picked: { label: '지정 공개', tone: 'warning' },
  private: { label: '전체 비공개', tone: 'danger' },
};

/** 계약서 → 피드백 → 학부모 전달 → 서명본 → 수납. */
export const CONSULTING_CONTRACT_STEPS = ['계약서', '피드백', '학부모 전달', '서명본', '수납'] as const;

export function consultingTypeLabel(value: string): string {
  return CONSULTING_TYPES[value] ?? value;
}

/** DB 방어가 적용되기 전에도 비정상 단계가 UI 너비를 깨지 않게 표시 경계에서 제한한다. */
export function consultingContractStep(value: number | null | undefined): number {
  if (!Number.isInteger(value)) return 0;
  return Math.max(0, Math.min(CONSULTING_CONTRACT_STEPS.length, value ?? 0));
}
