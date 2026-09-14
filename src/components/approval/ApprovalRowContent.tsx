/** @file-guide
 * 목적: ApprovalRowContent.tsx — §14 승인 대기함과 §75 결재 흐름이 공유하는 결재 한 줄의 읽기 표현
 * 책임/재사용: 생성 OpenAPI 행을 표시만 한다. 권한·집계·수신자·이동 경로를 화면에서 다시 판정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ApRow, ApprovalFlowItem } from '@/api/types';
import { Chip } from '@/components/ui';

/** §14 구형/부분 fixture에도 쓰는 표시 fallback. 서버 categoryLabel이 있으면 언제나 서버 값을 우선한다. */
const APPROVAL_KIND_FALLBACK: Readonly<Record<string, string>> = {
  rep: '리포트', rpt: '대표 보고', plan: '기획', req: '요청', chreq: '변경 요청', gpapack: '자료 요청',
};

export function approvalKindLabel(kind: string): string {
  return APPROVAL_KIND_FALLBACK[kind] ?? kind;
}

function isFlowItem(row: ApRow | ApprovalFlowItem): row is ApprovalFlowItem {
  return 'kindLabel' in row;
}

/** 링크·처리 단추는 부모가 소유하고, 이 컴포넌트는 같은 행 시각만 공유한다. */
export function ApprovalRowContent({ row }: { row: ApRow | ApprovalFlowItem }) {
  const flowItem = isFlowItem(row);
  const kindLabel = flowItem ? row.kindLabel : (row.categoryLabel ?? approvalKindLabel(row.kind));
  const senderRoute = flowItem
    ? [row.byName, row.toName].filter(Boolean).join(' → ')
    : row.byName;
  const meta = [senderRoute, row.sub].filter(Boolean).join(' · ') || '—';

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Chip tone={row.state === 'back' ? 'danger' : 'info'} styleKind="outline">
          {kindLabel}
        </Chip>
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-fg">{row.title}</span>
        <time dateTime={row.at} className="shrink-0 text-[11px] text-fg-subtle">
          {row.at.slice(5, 16).replace('T', ' ')}
        </time>
      </div>
      <p className="mt-1 text-[11px] text-fg-subtle">{meta}</p>
      {row.state === 'back' && row.why ? (
        <p className="mt-1.5 rounded bg-red/5 px-2 py-1 text-[11px] text-red">
          <span className="font-bold">반려 사유</span> · {row.why}
        </p>
      ) : null}
    </>
  );
}
