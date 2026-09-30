/** @file-guide
 * 목적: page.tsx — 학생 목록 route
 * 책임/재사용: 공통 인증·셸과 StudentDirectory를 조립한다. API/표시 규칙은 도메인 소유자에 둔다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { StudentDirectory } from '@/components/students/StudentDirectory';

export default function StudentsPage() {
  return <RequireAuth><AppShell><StudentDirectory /></AppShell></RequireAuth>;
}
