/** @file-guide
 * 목적: teacher-surface.ts — useTeacherSurface (component)
 * 책임/재사용: 「강사로 로그인했는가」 한 판정. 강사 정책 띠 둘(LateReportPolicy · TeacherPolicyBar)이 같이 쓴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useSession } from '@/store/useSession';

/**
 * 강사 표면 — 로그인했고 관리 화면(canAdminPage)이 아닌 사용자 (대표 결정 2026-09-25 「강사로 로그인 시에만」).
 * 역할 낱말을 비교하지 않고 서버가 내려준 플래그만 본다 (D-R39). AppShell 의 data-ui 와 같은 판정이다.
 */
export function useTeacherSurface(): boolean {
  return useSession((s) => Boolean(s.me && !s.me.canAdminPage));
}
