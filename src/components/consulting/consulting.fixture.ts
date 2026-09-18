/** @file-guide
 * 목적: consulting.fixture.ts — CONSULTING_STAGE_FIXTURE, consultingItem (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Consulting, ConsultingStage } from '@/api/types';

/**
 * §26 의 **서버 응답 모양** — 시험용 한 벌 (C86-e).
 *
 * 낱말이 서버로 간 뒤로는 이 셋이 비면 **보드에 칸이 하나도 안 선다.**
 * 네 시험이 각자 픽스처를 적으면 필드가 늘 때마다 네 곳을 고쳐야 한다.
 */
export const CONSULTING_STAGE_FIXTURE: ConsultingStage[] = [
  { key: 'contract', label: '계약', sub: '계약서 만들고 서명받기' },
  { key: 'running', label: '진행', sub: '회차별로 만나고 기록' },
  { key: 'done', label: '종료', sub: '마무리하고 안내' },
];

/** 한 건 — 「무엇이 오는가」를 말한다. 값은 각 시험이 덮어쓴다 */
export const consultingItem = (overrides: Partial<Consulting> = {}): Consulting => ({
  id: 1,
  consType: 'admissions',
  stage: 'contract',
  contractStep: 3,
  studentNames: ['김민준'],
  ownerName: '김범준',
  sessions: 5,
  endOn: null,
  createdAt: '2026-09-01',
  amount: null,
  share: 'all',
  canOpen: true,
  sessionsLog: [],
  sessionsDone: 0,
  items: [],
  stageLabel: '계약',
  typeLabel: '국제학교 지원',
  shareLabel: '전체 공개',
  contractStepLabel: '전달',
  requesterLabel: '어머니',
  ageDays: 60,
  paidAmount: null,
  ...overrides,
});
