/** @file-guide
 * 목적: ShellGuide.tsx — ShellGuide (component)
 * 책임/재사용: 관리자 머리줄 「보는 법」 창. 색은 GET /meta 코드표(종류·과목 색 · 서버 값)로 그리고, 테두리·취소·정원·리포트 상태 줄은 시간표 범례(cal/Legend)를 그대로 다시 쓴다 — 범례 낱말·모양을 두 벌 두지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원문 머리줄(§07~ 모든 컷)의 「ⓘ 보는 법」 — 눌렀을 때의 창은 원문에 없다. g1 대조 S2 의 방향
 * 「범례(§07 바닥 『보는 법』)와 같은 내용을 여는 단추」를 따른다(D-R44). 바닥 범례는 **지금 표에 있는** 과목만 보이므로
 * 여기서는 코드표 전체(종류 · 과목)의 색을 먼저 보이고, 나머지 줄은 범례 컴포넌트가 그린다.
 */
'use client';
import type { Meta } from '@/api/types';
import { useMeta } from '@/api/queries';
import { Button, Dialog } from '@/components/ui';
import { Legend } from '@/components/cal/Legend';
import { eventColorStyle } from '@/components/cal/EventBlock';
import styles from '@/components/cal/EventBlock.module.css';

function Swatches({ label, rows }: { label: string; rows: ReadonlyArray<{ key: string; name: string; color: string }> }) {
  if (!rows.length) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold text-fg-subtle">{label}</span>
      {rows.map((row) => (
        <span key={row.key} style={eventColorStyle(row.color)}
          className={`overflow-hidden rounded border py-0.5 pl-2 pr-1.5 text-[10px] font-bold ${styles.subject}`}>
          {row.name}
        </span>
      ))}
    </div>
  );
}

export function ShellGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const meta: Meta | undefined = useMeta(open).data;
  return (
    <Dialog open={open} onClose={onClose} title="보는 법" sub="시간표·현황판 블록의 색과 모양" width={640} closeX
      footer={<Button onClick={onClose}>닫기</Button>}>
      <div className="flex flex-col gap-3">
        <Swatches label="색 = 과목" rows={meta?.subs ?? []} />
        <Swatches label="과목이 없으면 종류" rows={meta?.kinds ?? []} />
        {/* 테두리(현장·온라인) · 취소(학생 결강·학원 취소·휴원) · 정원·여석 · 리포트 상태 — 시간표 바닥 범례와 같은 컴포넌트 */}
        <Legend items={[]} colorOf={() => ''} display="report" />
      </div>
    </Dialog>
  );
}
