/** @file-guide
 * 목적: late-tiers.fixture.ts — LATE_TIERS_FIXTURE (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Meta } from '@/api/types';

/**
 * `GET /meta` 의 `lateReportTiers` **서버 응답 모양** — 시험용 한 벌 (2026-09-25).
 * 값은 back `lib/rules.LATE_REPORT_TIERS` 를 그대로 옮긴 것이고, 같다는 증명은 back `drawer.spec`(보안 0925 · 코드표)이 한다.
 * 리포트 화면 · 작성 양식 · 수업 히스토리 시험이 이 한 벌을 함께 쓴다.
 */
export const LATE_TIERS_FIXTURE: Meta['lateReportTiers'] = [
  { fromMinutes: 0, amount: 0, range: '수업 종료 후 1시간 미만', when: '1시간 안에 제출', cut: '차감 없음', tone: 'ok' },
  { fromMinutes: 60, amount: 5000, range: '1시간 이상 ~ 4시간 미만', when: '1시간 지각 시', cut: '5,000원 차감', tone: 'warn' },
  { fromMinutes: 240, amount: 10000, range: '4시간 이상', when: '4시간 이후', cut: '10,000원 차감', tone: 'bad' },
];
