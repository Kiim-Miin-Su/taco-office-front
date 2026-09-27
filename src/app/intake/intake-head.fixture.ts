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
  // W11 · N-87 — §24 중단 지점은 실패 당시 단계(원문 넷 · 키가 단계 코드) · 설명 한 줄은 원문 분류 카드 그대로
  stops: [
    { key: 'first', label: '1차 상담 중단', sub: '첫 통화 뒤 더 진행되지 않았습니다' },
    { key: 'wait2nd', label: '2차 안 옴', sub: '일정은 잡았는데 오지 않았습니다' },
    { key: 'second', label: '2차 상담 중단', sub: '진단까지 했는데 배치에서 멈췄습니다' },
    { key: 'hold', label: '보류 후 무산', sub: '결정을 기다리다 끝났습니다' },
  ],
  // C90 · N-44 — 유입 경로 여섯(어휘 · 0 이어도 선다) · 접촉 「어떻게」 일곱 · 임박 0 · 도달 기록 시작일
  sources: [
    { key: 'kakao', label: '카카오채널', count: 0 },
    { key: 'phone', label: '전화', count: 0 },
    { key: 'blog', label: '블로그', count: 0 },
    { key: 'instagram', label: '인스타그램', count: 0 },
    { key: 'referral', label: '소개', count: 0 },
    { key: 'walkin', label: '워크인', count: 0 },
  ],
  touchKinds: [
    { key: 'call', label: '전화' }, { key: 'kakao', label: '카카오톡' }, { key: 'sms', label: '문자' }, { key: 'visit', label: '방문' },
    { key: 'book', label: '상담 예약' }, { key: 'noshow', label: '예약 불참' }, { key: 'memo', label: '메모' },
  ],
  followUpSoon: 0,
  funnelSince: null,
  // wave 3 (24-05) — 실패 사유 분류 다섯(어휘 · 0 이어도 선다). 「분류 안 됨」은 그런 건이 있을 때만 서버가 붙인다
  failReasons: [
    { key: 'unreachable', label: '연락 두절', count: 0, names: [] },
    { key: 'other_academy', label: '타 학원 등록', count: 0, names: [] },
    { key: 'schedule', label: '일정 안 맞음', count: 0, names: [] },
    { key: 'cost', label: '비용', count: 0, names: [] },
    { key: 'timing', label: '시기 안 맞음', count: 0, names: [] },
  ],
};
