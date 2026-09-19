/** @file-guide
 * 목적: ops-head.fixture.ts — OPS_HEAD_FIXTURE (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Ops } from '@/api/types';

/**
 * 운영 탭 **머리의 서버 응답 모양** — 시험용 한 벌 (C96 · `intake-head.fixture` 와 같은 자리).
 *
 * 기간 낱말도 칩 줄의 건수도 **서버가 만든다**(D-R18 · D-R37). 그래서 이 머리가 비면
 * 화면에 기간 띠도 칩도 안 선다 — 없는 화면을 시험하게 된다. 서버가 언제나 보내는 모양을
 * 여기 한 벌 두고 운영·상담 시험 다섯이 함께 쓴다.
 *
 * 수는 0 이고 단추는 서지 않는다. **이 한 벌은 「무엇이 오는가」를 말하고
 * 「몇 건인가 · 누가 만들 수 있는가」는 각 시험이 덮어쓴다.**
 */
export const OPS_HEAD_FIXTURE: Pick<
  Ops,
  'range' | 'areaCounts' | 'mtTypeCounts' | 'todoOwnerCounts' | 'mtTypes' | 'canCreateMeeting' | 'canCreatePlan'
> = {
  range: { from: null, to: null, label: '전체' },
  areaCounts: [],
  mtTypeCounts: [],
  todoOwnerCounts: [],
  mtTypes: [],
  canCreateMeeting: false,
  canCreatePlan: false,
};
