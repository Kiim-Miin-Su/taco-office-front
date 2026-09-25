/** @file-guide
 * 목적: TeacherPolicyBar.tsx — TeacherPolicyBar (component)
 * 책임/재사용: GET /meta 의 teacherPolicies(서버 lib/teacher-policy)만 그린다. 규칙 낱말·숫자 사본을 두지 않는다 (Figma Teacher/Policy Bar).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Teacher/Policy Bar — 강사 화면 최상단 정책 띠 (대표 결정 2026-09-25 「강사 화면 7개 전부의 최상단」).
 *
 * 불가 시간 · 수업 안내 · 수업 히스토리 · 건의 사항 넷이 쓴다. 홈 · 캘린더 · 리포트는 돈이 걸린
 * 지각 차감 띠(LateReportPolicy)가 그 자리를 맡는다 — 같은 자리에 띠 둘을 쌓지 않는다.
 * 강사로 로그인했을 때만 서고, 서버 낱말을 받기 전에는 아무것도 그리지 않는다(규칙을 지어내지 않는다).
 */
'use client';
import { useMeta } from '@/api/queries';
import type { Meta } from '@/api/types';
import { cn } from '@/components/ui';
import { useTeacherSurface } from './teacher-surface';

export type TeacherPolicyScreen = Meta['teacherPolicies'][number]['screen'];

export function TeacherPolicyBar({ screen, className }: { screen: TeacherPolicyScreen; className?: string }) {
  const teacherSurface = useTeacherSurface();
  const meta = useMeta(teacherSurface);
  const policy = meta.data?.teacherPolicies?.find((item) => item.screen === screen);
  if (!teacherSurface || !policy) return null;
  return (
    <div
      role="note" aria-label={policy.title}
      className={cn('rounded-xl border border-line border-l-4 border-l-primary bg-card px-5 py-3', className)}
    >
      <div className="text-[13px] font-bold text-fg">{policy.title}</div>
      <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-[12.5px] leading-relaxed text-fg-2">
        {policy.lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}
