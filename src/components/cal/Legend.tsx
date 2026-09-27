/** @file-guide
 * 목적: Legend.tsx — Legend (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Cal/Legend Group — 범례를 화면 안에 둔다. 사용자 교육이 따로 필요 없게.
 * 관리자 v2 §07~11·§89: 과목색과 온라인 점선/사선을 설명한다.
 *
 * 원문 §07 바닥 「보는 법」 줄 — 색 · 현장/온라인 · 학생 결강/학원 취소/휴원 · 정원·여석(●●○) · [미작성] 리포트 · 「셀에 마우스를 올리면 …」 · [접기].
 * **격자가 실제로 그리는 것만** 적는다 — 원문의 「강사 불가」는 「가능 시간」을 켰을 때 격자가 빗금 띠를 깔 때만
 * 적는다(G37 · 관리자 읽기 `GET /schedule/unavailable`). [연강] 은 원문에 판정 규칙이 없어 그리지 않으니 적지 않는다.
 * [미작성] 은 블록 배지(`UNWRITTEN_BADGE`)를 그대로 그린다 — 블록이 두 보기(일정 · 리포트) 모두에서 다는 배지라 늘 적는다.
 * [일정 · 리포트] 가 「리포트」면 색 줄이 리포트 상태(`STATUS_LABEL`)로 바뀐다 — 블록과 같은 표를 읽는다.
 */
'use client';
import { useState } from 'react';
import type { Occurrence } from '@/api/types';
import type { CalendarColorOf } from '@/lib/tokens';
import { Button } from '../ui';
import { cn } from '../ui/cn';
import { STATUS_LABEL, STATUS_LOOK, UNWRITTEN_BADGE, eventColorStyle } from './EventBlock';
import styles from './EventBlock.module.css';

export function Legend({ items, colorOf, subName, kindName, display = 'schedule', unavOn = false }: {
  items: readonly Occurrence[];
  colorOf: CalendarColorOf;
  subName?: (occ: Occurrence) => string | undefined;
  kindName?: (occ: Occurrence) => string | undefined;
  /** 블록 색이 말하는 것 — 도구줄 [일정 · 리포트] */
  display?: 'schedule' | 'report';
  /** 「가능 시간」을 켜 격자가 강사 불가 띠를 깔고 있는가 — 그때만 「강사 불가」를 적는다 */
  unavOn?: boolean;
}) {
  // 원문 [접기] — 한 화면의 보기 설정이라 이 칸이 갖는다(서버·다른 화면과 나누지 않는다)
  const [folded, setFolded] = useState(false);
  // 현재 표에 있는 과목/종류만 설명한다. 새 색상 사전이나 상태를 만들지 않는다.
  const entries = new Map<string, Occurrence>();
  for (const occ of items) {
    const key = occ.subKey ? `sub:${occ.subKey}` : `kind:${occ.kindKey}`;
    if (!entries.has(key)) entries.set(key, occ);
  }
  return (
    <div role="group" aria-label="시간표 범례"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-card px-3 py-2.5">
      <span className="text-[11px] font-bold text-fg">보는 법</span>
      {folded ? null : (
        <>
          {display === 'report' ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-fg-subtle">색 = 리포트</span>
              {STATUS_LABEL.map(([key, label]) => (
                <span key={key} className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', STATUS_LOOK[key])}>{label}</span>
              ))}
            </div>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-fg-subtle">색 = 과목 · 과목 없으면 종류</span>
              {Array.from(entries, ([key, occ]) => (
                <span key={key} style={eventColorStyle(colorOf(occ))}
                  className={`overflow-hidden rounded border py-0.5 pl-2 pr-1.5 text-[10px] font-bold ${styles.subject}`}>
                  {(occ.subKey ? subName?.(occ) : kindName?.(occ)) ?? occ.title ?? kindName?.(occ) ?? '코드 정보 없음'}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-fg-subtle">테두리 = 어디서</span>
            <span className="rounded border border-solid border-fg-subtle px-1.5 py-0.5 text-[10px]">현장</span>
            <span className={`rounded border border-dashed border-fg-subtle px-1.5 py-0.5 text-[10px] ${styles.online}`}>온라인</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-fg-subtle">취소</span>
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] line-through opacity-45">취소된 수업</span>
            {/* 블록과 같은 모양 클래스 — 사유는 서버의 휴강 사유(cancelKind), 휴원은 명단의 paused 다 */}
            <span className={`rounded border border-line px-1.5 py-0.5 text-[10px] ${styles.cancelStudent}`}>학생 결강</span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${styles.cancelAcademy}`}>학원 취소</span>
            <span className={`rounded border border-line px-1.5 py-0.5 text-[10px] ${styles.paused}`}>휴원</span>
            {/* 격자의 불가 띠와 같은 클래스 — 「가능 시간」을 켰을 때만 격자가 그리므로 그때만 적는다 */}
            {unavOn ? <span data-legend-unav className={`rounded px-1.5 py-0.5 text-[10px] ${styles.unavBand}`}>강사 불가</span> : null}
          </div>
          {/* 블록 오른쪽 위 점 — 찬 점은 그날 명단, 빈 점은 남은 자리 (원문 「●●○ 정원 · 여석」) */}
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="flex items-center gap-[2px] rounded-full bg-fg/15 px-1 py-[3px] text-fg">
              <span className="size-[6px] rounded-full bg-current" />
              <span className="size-[6px] rounded-full bg-current" />
              <span className="size-[6px] rounded-full border border-current" />
            </span>
            <span className="text-[11px] font-bold text-fg-subtle">정원 · 여석</span>
          </div>
          {/* 원문 「[미작성] 리포트」 — 끝났는데 리포트가 없는 수업의 블록 배지와 같은 낱말·색 */}
          <div data-legend-unwritten className="flex items-center gap-1.5">
            <span className={cn('rounded-sm px-1 text-[10px] font-bold leading-[14px]', UNWRITTEN_BADGE.look)}>{UNWRITTEN_BADGE.label}</span>
            <span className="text-[11px] font-bold text-fg-subtle">리포트</span>
          </div>
          <span className="text-[11px] text-fg-subtle">
            블록에 마우스를 올리면 전체 정보 · 끌면 이동 · 누르면 수업 상세
          </span>
        </>
      )}
      <Button size="sm" variant="ghost" className="ml-auto" aria-expanded={!folded}
        onClick={() => setFolded((v) => !v)}>
        {folded ? '펼치기' : '접기'}
      </Button>
    </div>
  );
}
