/** @file-guide
 * 목적: PageHeader.tsx — PageHeader (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** 화면 머리 — Figma 스펙 카드의 제목·부제와 같은 자리. 61컷이 전부 같은 머리를 쓴다. */
import type { ReactNode } from 'react';

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[20px] font-bold text-fg">{title}</h1>
        {sub ? <p className="mt-1 text-[12px] text-fg-subtle">{sub}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}
