/** @file-guide
 * 목적: ApprovalFlowDialog.tsx — 개발명세서 v2 §75 중앙 결재 흐름 모달
 * 책임/재사용: Drawer 단일 snapshot의 서버 projection을 읽기 전용으로 조립한다. 승인·반려 mutation을 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import Link from 'next/link';
import type { ApprovalFlow, ApprovalFlowItem } from '@/api/types';
import { Button, Chip, Dialog, Panel } from '@/components/ui';
import { ApprovalRowContent } from './ApprovalRowContent';

function FlowSection({ id, title, rows, count, onNavigate }: {
  id: 'back' | 'waiting' | 'mine';
  title: string;
  rows: ApprovalFlowItem[];
  onNavigate: () => void;
  count?: number;
}) {
  return (
    <section aria-labelledby={`approval-flow-${id}`}>
      <h3 id={`approval-flow-${id}`} className="mb-2 flex items-center gap-2 text-[12px] font-bold text-fg">
        {title}
        {count !== undefined ? <Chip tone={count > 0 ? 'info' : 'neutral'}>{count}</Chip> : null}
      </h3>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link
                href={row.go}
                onClick={onNavigate}
                aria-label={`${row.title} 원본 열기`}
                className={`block rounded-lg border p-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue ${
                  row.state === 'back'
                    ? 'border-red/25 bg-red/5 hover:border-red/50'
                    : 'border-line bg-card hover:border-blue hover:bg-blue/5'
                }`}
              >
                <ApprovalRowContent row={row} />
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
      width={640}
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <p className="text-[11px] text-fg-subtle">
        대표와 관리자 사이를 오가는 것을 한 곳에서 봅니다 · 지금 {flow.total}건 대기 · 되돌아온 것 {flow.backCount}건
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="결재 종류별 대기 건수">
        {flow.tiles.map((tile) => (
          <Panel key={tile.kind} className="!p-3">
            <p className="text-[11px] font-bold text-fg">{tile.kindLabel}</p>
            <p className="mt-0.5 text-[10px] text-fg-subtle">{tile.toLabel}</p>
            <strong className="mt-2 block text-[22px] leading-none text-fg">{tile.count}</strong>
          </Panel>
        ))}
      </div>

      <div className="mt-4 flex max-h-[55dvh] flex-col gap-5 overflow-y-auto pr-1">
        <FlowSection id="back" title="되돌아온 것" rows={flow.back} count={flow.backCount} onNavigate={onClose} />
        <FlowSection id="waiting" title="기다리는 것" rows={flow.waiting} count={flow.total} onNavigate={onClose} />
        <FlowSection id="mine" title="내가 올린 것" rows={flow.mine} onNavigate={onClose} />
      </div>
    </Dialog>
  );
}
