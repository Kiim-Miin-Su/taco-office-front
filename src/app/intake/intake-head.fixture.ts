/** @file-guide
 * 목적: intake-head.fixture.ts — INTAKE_HEAD_FIXTURE (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { IntakeHead } from '@/api/types';

/**
 * §23 머리의 **서버 응답 모양** — 시험용 한 벌 (C86-b).
 *
 * 화면이 낱말을 갖지 않게 된 뒤로는 이 머리가 비면 **보드에 칸이 하나도 안 선다.**
 * 그래서 빈 `intakeHead` 로 시험하면 실제로는 없는 화면을 시험하게 된다 — 서버가
 * 언제나 보내는 모양을 여기 한 벌 두고 네 시험이 함께 쓴다.
 *
 * 수는 0 이다. **이 한 벌은 「무엇이 오는가」를 말하고 「몇 건인가」는 각 시험이 말한다.**
 */
export const INTAKE_HEAD_FIXTURE: IntakeHead = {
  funnel: [
    { key: 'first', sub: '2차 일정 + 진단고사 잡기', label: '1차 상담', count: 0, funnel: true },
    { key: 'wait2nd', sub: '예정일에 2차 상담 진행', label: '2차 대기', count: 0, funnel: true },
    { key: 'second', sub: '보류 · 등록 · 등록 실패 중 선택', label: '2차 상담', count: 0, funnel: true },
    { key: 'hold', sub: 'D+2에 수락 여부 확인', label: '보류', count: 0, funnel: true },
    { key: 'enrolled', sub: '해피콜 → 월간 상담', label: '등록', count: 0, funnel: false },
    { key: 'failed', sub: '사유 기록', label: '등록 실패', count: 0, funnel: false },
  ],
  enrollRate: 0,
  owners: [],
  alerts: [],
  stops: [
    { key: 'before_book', label: '상담 예약 전 이탈' },
    { key: 'before_first', label: '1차 상담 전 이탈' },
    { key: 'after_first', label: '1차 후 미진행' },
    { key: 'after_second', label: '2차 후 미등록' },
  ],
};
