/** @file-guide
 * 목적: ApprovalFlowDialog.tsx — 개발명세서 v2 §75 중앙 결재 흐름 모달
 * 책임/재사용: Drawer 단일 snapshot의 서버 projection을 읽기 전용으로 조립한다. 승인·반려 mutation을 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import Link from 'next/link';
import type { ApprovalFlow, ApprovalFlowItem } from '@/api/types';
import { Button, cn, Dialog } from '@/components/ui';
import { ApprovalRowContent, approvalFlowKindTone, TONE_MARK } from './ApprovalRowContent';

/**
 * 절 하나 — 원문 §75 의 머리는 「되돌아온 것(붉게) 1건 · 고쳐서 다시 올려주세요」 · 「기다리는 것 4건」이다(g2 대조 75-4).
 * 건수는 서버가 센 값을 받는다 — 화면이 줄을 다시 세지 않는다(내가 올린 것은 줄 수가 곧 그 절의 전부다).
 */
function FlowSection({ id, title, rows, count, hint, danger = false, onNavigate }: {
  id: 'back' | 'waiting' | 'mine';
  title: string;
  rows: ApprovalFlowItem[];
  count: number;
  /** 건수 뒤에 붙는 한 줄 — 건수가 있을 때만 */
  hint?: string;
  danger?: boolean;
  onNavigate: () => void;
}) {
  return (
    <section aria-labelledby={`approval-flow-${id}`}>
      <h3 id={`approval-flow-${id}`} className="mb-2 flex items-baseline gap-2 text-[13px] font-bold">
        <span className={danger ? 'text-red' : 'text-fg'}>{title}</span>
        <span className="text-[11.5px] text-fg-subtle">{count}건{count > 0 && hint ? ` · ${hint}` : ''}</span>
      </h3>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link
                href={row.go}
                onClick={onNavigate}
                aria-label={`${row.title} 원본 열기`}
                className={cn(
                  // 원문 줄은 왼쪽에 **종류 색 세로 띠**가 있고, 되돌아온 줄은 분홍 바탕이다 (g2 75-2)
                  'block rounded-lg border border-l-4 p-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
                  TONE_MARK[approvalFlowKindTone(row.kind)].bar,
                  row.state === 'back'
                    ? 'border-red/25 bg-red/5 hover:border-red/50'
                    : 'border-line bg-card hover:border-blue hover:bg-blue/5',
                )}
              >
                <ApprovalRowContent row={row} variant="flow" />
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-lg bg-inset px-3 py-4 text-center text-[11px] text-fg-subtle">없습니다</p>}
    </section>
  );
}

export function ApprovalFlowDialog({ open, flow, onClose }: {
  open: boolean;
  flow: ApprovalFlow;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="결재 흐름"
      // 원문 §75 머리 — 제목 + 부제 + 오른쪽 × (공용 Dialog 머리)
      sub={`대표와 관리자 사이를 오가는 것을 한 곳에서 봅니다 · 지금 ${flow.total}건 대기 · 되돌아온 것 ${flow.backCount}건`}
      closeX
      width={640}
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      {/*
        타일 — 원문은 **큰 숫자(종류 색) → 종류 이름 → 받는 이** 차례이고, 건수가 있는 타일만 종류 색 테두리·옅은 바탕이다(g2 75-3).
        수는 서버가 센 tile.count 그대로다.
      */}
      {/* 갈래 여섯 — 지출(H-83 · N-64 번복)이 여섯째다. 칸 수는 서버 tiles 길이를 따른다 */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="결재 종류별 대기 건수">
        {flow.tiles.map((tile) => {
          const mark = TONE_MARK[approvalFlowKindTone(tile.kind)];
          const live = tile.count > 0;
          return (
            <div key={tile.kind} className={cn('rounded-xl border p-3', live ? mark.frame : 'border-line bg-inset')}>
              <strong className={cn('block text-[22px] leading-none', live ? mark.text : 'text-fg-subtle')}>{tile.count}</strong>
              <p className="mt-2 text-[11.5px] font-bold text-fg">{tile.kindLabel}</p>
              <p className="mt-0.5 text-[10px] text-fg-subtle">{tile.toLabel}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex max-h-[55dvh] flex-col gap-5 overflow-y-auto pr-1">
        <FlowSection id="back" title="되돌아온 것" rows={flow.back} count={flow.backCount} hint="고쳐서 다시 올려주세요"
          danger onNavigate={onClose} />
        <FlowSection id="waiting" title="기다리는 것" rows={flow.waiting} count={flow.total} onNavigate={onClose} />
        {/* 원문 §75 에는 「내가 올린 것」 절이 없다 — 올린 것이 있을 때만 세운다(g2 75-5 · 비어 있으면 없음이 유리) */}
        {flow.mine.length > 0 ? (
          <FlowSection id="mine" title="내가 올린 것" rows={flow.mine} count={flow.mine.length} onNavigate={onClose} />
        ) : null}
      </div>
    </Dialog>
  );
}
