/** @file-guide
 * 목적: page.tsx — 학생 상세 route의 안전한 ID 경계
 * 책임/재사용: 공통 인증·셸과 StudentDetail을 조립한다. 잘못된 URL은 API에 보내지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { StudentDetail } from '@/components/students/StudentDetail';

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const studentId = /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
  return <RequireAuth><AppShell><StudentDetail key={id} studentId={studentId} /></AppShell></RequireAuth>;
}
