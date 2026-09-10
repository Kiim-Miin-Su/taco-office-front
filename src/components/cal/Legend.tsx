/** @file-guide
 * 목적: Legend.tsx — Legend (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Cal/Legend Group — 범례를 화면 안에 둔다. 사용자 교육이 따로 필요 없게.
 * 관리자 v2 §07~11·§89: 과목색과 온라인 점선/사선을 설명한다.
 */
import type { Occurrence } from '@/api/types';
import type { CalendarColorOf } from '@/lib/tokens';
import { eventColorStyle } from './EventBlock';
import styles from './EventBlock.module.css';

export function Legend({ items, colorOf, subName, kindName }: {
  items: readonly Occurrence[];
  colorOf: CalendarColorOf;
  subName?: (occ: Occurrence) => string | undefined;
  kindName?: (occ: Occurrence) => string | undefined;
}) {
  // 현재 표에 있는 과목/종류만 설명한다. 새 색상 사전이나 상태를 만들지 않는다.
  const entries = new Map<string, Occurrence>();
  for (const occ of items) {
    const key = occ.subKey ? `sub:${occ.subKey}` : `kind:${occ.kindKey}`;
    if (!entries.has(key)) entries.set(key, occ);
  }
  return (
    <div role="group" aria-label="시간표 범례"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-card px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-fg-subtle">색 = 과목 · 과목 없으면 종류</span>
        {Array.from(entries, ([key, occ]) => (
          <span key={key} style={eventColorStyle(colorOf(occ))}
            className={`overflow-hidden rounded border py-0.5 pl-2 pr-1.5 text-[10px] font-bold ${styles.subject}`}>
            {(occ.subKey ? subName?.(occ) : kindName?.(occ)) ?? occ.title ?? kindName?.(occ) ?? '코드 정보 없음'}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-fg-subtle">테두리 = 어디서</span>
        <span className="rounded border border-solid border-fg-subtle px-1.5 py-0.5 text-[10px]">현장</span>
        <span className={`rounded border border-dashed border-fg-subtle px-1.5 py-0.5 text-[10px] ${styles.online}`}>온라인</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-fg-subtle">취소</span>
        <span className="rounded border border-line px-1.5 py-0.5 text-[10px] line-through opacity-45">취소된 수업</span>
      </div>
    </div>
  );
}
