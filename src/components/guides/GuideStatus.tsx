/** @file-guide
 * 목적: 안내의 사유·상태를 모든 안내 화면에서 같은 어휘와 색으로 표시한다.
 * 책임/재사용: 생성 Guide 타입을 표시 라벨에만 연결한다. pending·누락 같은 업무 판정은 서버 값을 그대로 받는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Guide } from '@/api/types';
import { hm } from '@/components/teacher/format';
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

export function GuideStateChip({ state, count }: { state: Guide['state']; count?: number }) {
  const view = STATE_VIEW[state];
  // count 는 §45 날짜 머리의 상태 합계 — 「발송 대기 1」 (서버 줄을 그대로 묶어 센 수)
  return <Chip tone={view.tone}>{count === undefined ? view.label : `${view.label} ${count}`}</Chip>;
}

/** 상태 칩을 놓는 차례 — 원장 흐름(작성 → 발송 대기 → 발송 → 확인) */
export const GUIDE_STATE_ORDER: ReadonlyArray<Guide['state']> = ['draft', 'ready', 'sent', 'read'];

/** 안내 줄의 「어느 수업」 칸 — 서버가 준 과목·종류·시각·강의실만 잇는다. 규칙 제목이 비어 있는 정규 수업도 이름이 선다 */
type GuideLessonFacts = {
  serTitle?: string | null; subName?: string | null; kindName?: string | null;
  startMin?: number | null; roomName?: string | null;
};

/**
 * 「수업명 미정」은 **정말 아무 사실도 없을 때만** 적는다 (g4 · 2026-09-25).
 * 정규 수업은 규칙 제목(`serTitle`)이 비어 있는 것이 보통이라, 전에는 거의 모든 줄이 「수업명 미정」이었다.
 * 과목 → 종류 순으로 이름을 고르고, 시각·강의실이 있으면 뒤에 붙인다. 판정·계산은 없다 — 서버 값을 잇기만 한다.
 */
export function guideLessonLabel(facts: GuideLessonFacts): string {
  const name = facts.serTitle ?? facts.subName ?? facts.kindName ?? null;
  const parts = [name, facts.startMin != null ? hm(facts.startMin) : null, facts.roomName ?? null].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length ? parts.join(' · ') : '수업명 미정';
}
