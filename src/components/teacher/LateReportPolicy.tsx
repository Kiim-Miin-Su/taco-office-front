/** @file-guide
 * 목적: LateReportPolicy.tsx — LateReportPolicy (component)
 * 책임/재사용: GET /meta 의 lateReportTiers(서버 판정 정본)와 세션 플래그만 읽는다. 금액 사본·차감 판정을 두지 않는다 (Figma Teacher/Late Report Policy).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Teacher/Late Report Policy — 리포트 지각 제출 차감 안내 띠 (D-R32).
 *
 * 대표 지시 2026-09-25: 「강사 리포트 1시간 지각 시 5,000원, 4시간 이후는 10,000원 차감으로 명시」 ·
 * 강사 정책은 화면 **최상단**에 둔다 · **강사로 로그인했을 때만** 보인다.
 *
 * 보이는 조건은 역할 비교가 아니라 서버 플래그다 — 관리 화면(canAdminPage)이 아닌 로그인 사용자 (D-R39).
 * 관리자가 같은 편집기로 검토할 때는 그리지 않는다. 구간·금액·낱말은 전부 서버(`/meta` lateReportTiers)에서 온다 —
 * 받기 전에는 숫자를 지어내지 않고 아무것도 그리지 않는다.
 */
'use client';
import { useMeta } from '@/api/queries';
import { cn } from '@/components/ui';
import { useTeacherSurface } from './teacher-surface';

/**
 * 모양은 Figma `Teacher/Late Report Policy`(= 디자인 시스템 `Data/Penalty Banner` 인스턴스) 그대로다 —
 * 돈이 걸린 규칙이라 다른 안내 띠보다 **위에, 더 큰 글씨로** 둔다 (A20). 금액은 표 숫자(tabular-nums)로 먼저 읽히게.
 * 칸 안 낱말은 반투명 흰색을 쓰지 않는다 — 옅은 칸(white/15) 위 85% 흰색은 대비 3.9:1 이라 작은 글씨 기준(4.5) 미달이다.
 */
export function LateReportPolicy({ className }: { className?: string }) {
  const teacherSurface = useTeacherSurface();
  // 코드표는 화면이 이미 받는 것 — 같은 세션 키라 한 번만 부른다. 관리 화면에서는 부르지도 않는다
  const meta = useMeta(teacherSurface);
  // 띠는 **깎이는 구간만** 적는다(금액 0 인 「1시간 안에 제출」은 부제로 말한다)
  const tiers = meta.data?.lateReportTiers ?? [];
  const cuts = tiers.filter((tier) => tier.amount > 0);
  const free = tiers.find((tier) => tier.amount === 0);
  if (!teacherSurface || cuts.length === 0) return null;
  return (
    <div
      role="note" aria-label="리포트 지각 제출 차감"
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-red px-5 py-3 text-white', className)}
    >
      <div className="min-w-0 grow basis-60">
        <div className="text-[16px] font-black leading-snug">리포트 지각 제출 시 강의료 차감</div>
        {free ? <div className="mt-0.5 text-[12px] font-medium text-white/85">{free.range} 제출은 {free.cut}</div> : null}
      </div>
      {cuts.map((tier) => (
        <div key={tier.fromMinutes} className="flex shrink-0 items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5">
          <span className="text-[11.5px] font-medium">{tier.when}</span>
          <span className="text-[17px] font-black tabular-nums tracking-tight">{tier.cut}</span>
        </div>
      ))}
    </div>
  );
}
