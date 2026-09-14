/** @file-guide
 * 목적: 안내의 사유·상태를 모든 안내 화면에서 같은 어휘와 색으로 표시한다.
 * 책임/재사용: 생성 Guide 타입을 표시 라벨에만 연결한다. pending·누락 같은 업무 판정은 서버 값을 그대로 받는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Guide } from '@/api/types';
import { Chip, type Tone } from '@/components/ui/Chip';

const REASON_LABEL: Record<Guide['reason'], string> = {
  new: '첫 수업',
  teacher_change: '강사 교체',
};

const STATE_VIEW: Record<Guide['state'], { label: string; tone: Tone }> = {
  draft: { label: '작성 중', tone: 'danger' },
  ready: { label: '발송 대기', tone: 'warning' },
  sent: { label: '발송 완료', tone: 'info' },
  read: { label: '강사 확인', tone: 'success' },
};

export function GuideReasonChip({ reason }: { reason: Guide['reason'] }) {
  return <Chip tone={reason === 'teacher_change' ? 'purple' : 'info'}>{REASON_LABEL[reason]}</Chip>;
}

export function GuideStateChip({ state }: { state: Guide['state'] }) {
  const view = STATE_VIEW[state];
  return <Chip tone={view.tone}>{view.label}</Chip>;
}
