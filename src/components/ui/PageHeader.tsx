/** @file-guide
 * 목적: PageHeader.tsx — PageHeader (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 화면 머리 — Figma 스펙 카드의 제목·부제와 같은 자리. 61컷이 전부 같은 머리를 쓴다.
 *
 * - `center` : 제목 **오른쪽 같은 줄**에 서는 것 — §26·§38·§43 의 탭 카드(26-01). 없으면 지금 모양 그대로다.
 * - `sub` : 글자 한 줄 또는 노드 — 뒤 낱말만 붉게 칠하는 두 색 부제(§82 「내부 자료 · 학부모 비공개」 · 82-3)를 받는다.
 */
import type { ReactNode } from 'react';

export function PageHeader({ title, sub, center, right }: { title: string; sub?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  const heading = (
    <div>
      <h1 className="text-[20px] font-bold text-fg">{title}</h1>
      {sub ? <p className="mt-1 text-[12px] text-fg-subtle">{sub}</p> : null}
    </div>
  );
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      {center ? (
        <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-2">
          {heading}
          <div data-page-header-center className="min-w-0">{center}</div>
        </div>
      ) : heading}
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}
