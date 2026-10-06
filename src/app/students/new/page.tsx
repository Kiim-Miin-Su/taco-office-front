/** @file-guide
 * 목적: page.tsx — 관리자 신규 학생 등록 15절 Front 초안 route를 공용 셸에 연결한다.
 * 책임/재사용: RequireAuth/AppShell/StudentRegistrationForm을 조립하며 API·검증·영속 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { StudentRegistrationForm } from '@/components/students/StudentRegistrationForm';

export default function StudentRegistrationPage() {
  return <RequireAuth><AppShell><StudentRegistrationForm /></AppShell></RequireAuth>;
}
