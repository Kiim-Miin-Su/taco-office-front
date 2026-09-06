import type { Consulting } from '@/api/types';
import type { Tone } from '@/components/ui';

export const CONSULTING_TYPES: Readonly<Record<string, string>> = {
  admissions: '입시',
  essay: '에세이',
  roadmap: '로드맵',
};

export const CONSULTING_STAGES = [
  { key: 'contract', label: '계약', tone: 'warning' },
  { key: 'running', label: '진행', tone: 'info' },
  { key: 'done', label: '종료', tone: 'success' },
] as const satisfies ReadonlyArray<{ key: Consulting['stage']; label: string; tone: Tone }>;

export const CONSULTING_STAGE_BY_KEY: Readonly<Record<string, { label: string; tone: Tone }>> =
  Object.fromEntries(CONSULTING_STAGES.map(({ key, label, tone }) => [key, { label, tone }]));

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
