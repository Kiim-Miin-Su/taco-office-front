/**
 * Data/Status Badge — Figma `Data/Status Badge` (6 변형).
 *
 * **리포트 상태 하나에 배지 하나.** 화면마다 상태를 색으로 다시 매기지 않는다 —
 * 그렇게 하면 §07 캘린더와 §47 독촉 목록이 같은 회차를 다른 색으로 그린다.
 */
import { Chip, type Tone } from './Chip';
import type { RepState } from '@/api/types';

const LABEL: Record<string, string> = {
  na: '해당 없음', plan: '예정', none: '안 씀', draft: '작성 중',
  wait: '승인 대기', ok: '승인', rej: '반려',
};
const TONE: Record<string, Tone> = {
  na: 'neutral', plan: 'neutral', none: 'danger', draft: 'warning',
  wait: 'info', ok: 'success', rej: 'purple',
};

export function StatusBadge({ state }: { state: RepState | string }) {
  return <Chip tone={TONE[state] ?? 'neutral'}>{LABEL[state] ?? state}</Chip>;
}
