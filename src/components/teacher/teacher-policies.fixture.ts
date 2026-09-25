/** @file-guide
 * 목적: teacher-policies.fixture.ts — TEACHER_POLICIES_FIXTURE (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Meta } from '@/api/types';

/**
 * `GET /meta` 의 `teacherPolicies` **서버 응답 모양** — 시험용 한 벌 (2026-09-25).
 * 낱말의 정본은 back `lib/teacher-policy.ts` 이고, 숫자가 판정 상수와 같다는 증명은 back `teacher-policy.spec` 이 한다.
 * 여기서는 화면이 **받은 것을 그대로 그리는지**만 본다 — 그래서 줄은 짧은 표본으로 둔다.
 */
export const TEACHER_POLICIES_FIXTURE: Meta['teacherPolicies'] = [
  { screen: 'unavailable', title: '불가 시간 등록 규칙', lines: ['2주 단위 회차마다 등록합니다.', '날짜마다 7일 전에 마감됩니다.'] },
  { screen: 'guides', title: '수업 전에 확인할 것', lines: ['학생 카드를 보고 들어갑니다.', '학생에게는 참가 링크만 보냅니다.'] },
  { screen: 'history', title: '정산 규칙', lines: ['리포트를 쓴 수업만 정산에 들어갑니다.', '이 정산 내역은 본인만 볼 수 있습니다.'] },
  { screen: 'suggestions', title: '건의 규칙', lines: ['한 달에 3회까지 남길 수 있습니다.', '답변한 사람과 시각이 함께 남습니다.'] },
];
