/** @file-guide
 * 목적: StudentBookChip.tsx — StudentBookChip (component)
 * 책임/재사용: 서버가 준 낱말(`GET /schedule/students/{id}/books`)만 그린다. 교재 판정·수는 서버(§79 「교재 N」·§12 준비와 같은 판정)가 갖는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원문 §10 개인 머리 「홍채원 [K] 교재 없음」 — 학년 칩 뒤의 흐린 글자.
 * 배부 완료 교재가 없을 때만 서버가 `label` 을 준다(있으면 null — 컷은 없는 경우만 적는다).
 * 개인 표가 둘(분할)이어도 칸마다 제 학생을 묻도록 작은 컴포넌트로 뗐다 — 렌더 함수 안에서 훅을 부를 수 없다.
 */
'use client';
import { useStudentBooks } from '@/api/queries';

export function StudentBookChip({ studentId }: { studentId: number }) {
  const label = useStudentBooks(studentId).data?.label;
  if (!label) return null;
  return <span data-student-books className="text-[12px] font-bold text-fg-subtle">{label}</span>;
}
