/** @file-guide
 * 목적: ApprovalRowContent.tsx — §14 승인 대기함과 §75 결재 흐름이 공유하는 결재 한 줄의 읽기 표현
 * 책임/재사용: 생성 OpenAPI 행을 표시만 한다. 권한·집계·수신자·이동 경로를 화면에서 다시 판정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { ChevronRight } from 'lucide-react';
import type { ApRow, ApprovalFlowItem } from '@/api/types';
import { Chip, cn, type ChipTone, type Tone } from '@/components/ui';

/** §14 구형/부분 fixture에도 쓰는 표시 fallback. 서버 categoryLabel이 있으면 언제나 서버 값을 우선한다. */
const APPROVAL_KIND_FALLBACK: Readonly<Record<string, string>> = {
  rep: '리포트', rpt: '대표 보고', plan: '기획', req: '요청', chreq: '변경 요청', gpapack: '자료 요청',
};

export function approvalKindLabel(kind: string): string {
  return APPROVAL_KIND_FALLBACK[kind] ?? kind;
}

/*
 * 분류·종류의 **색** — 원문 §14 칩·배지와 §75 줄·타일은 갈래마다 색이 다르다(g2 대조 14-8 · 75-2 · 75-3).
 * 코드값(서버 `category`·`kind`) → 결 대응은 여기 한 곳이고, 색 값은 토큰에서 온다(D-R41).
 * 원문 §14 칩 점 일곱 색(픽셀로 뽑았다): 스케줄 #2563EB 파랑 · 교재 #D97706 호박 · 시간대 #0891B2 **청록** ·
 * 시급 #DB2777 **분홍** · 건의·GPA #7C3AED 보라 · 빠진 것 #DC2626 빨강. 청록·분홍 토큰(wave 4)이 생겨
 * 겹치던 두 색(시간대=초록 · 시급=빨강)을 원문대로 갈랐다 — 이제 일곱이 모두 다르다(건의·GPA 는 원문도 같은 보라).
 * §14 의 「GPA 요청」(보라)과 §75 의 「자료 요청」(초록)은 원문 두 컷이 서로 다르게 칠한 그대로다.
 */
/** 결 — 공용 `Chip` 의 결에 원문 분홍을 더한 것. 분홍 배지는 `Chip` 에 결이 없어 채움만 덮는다(아래 `badgeTone`) */
export type ApprovalTone = ChipTone | 'pink';

const INBOX_CATEGORY_TONE: Readonly<Record<string, ApprovalTone>> = {
  schedule_change: 'info', book_change: 'warning', tz_change: 'teal', wage_change: 'pink',
  suggestion: 'purple', gpa_request: 'purple', missing: 'danger', other: 'neutral',
};
const FLOW_KIND_TONE: Readonly<Record<string, Tone>> = {
  rpt: 'neutral', plan: 'purple', req: 'warning', chreq: 'info', gpapack: 'success',
};

/** §14 분류 → 결. 모르는 분류는 회색 — 새 분류가 생긴 것을 감추지 않는다 */
export const approvalCategoryTone = (category?: string | null): ApprovalTone => INBOX_CATEGORY_TONE[category ?? ''] ?? 'neutral';
/** §75 종류 → 결 */
export const approvalFlowKindTone = (kind: string): Tone => FLOW_KIND_TONE[kind] ?? 'neutral';

/** 배지(`Chip` 채움)의 결 — 분홍은 `Chip` 에 없으므로 붉은 결 위에 분홍 채움을 덮는다(공용 `Chip` 은 이 청크 범위 밖) */
const badgeTone = (tone: ApprovalTone): { tone: ChipTone; className?: string } =>
  tone === 'pink' ? { tone: 'danger', className: '!bg-pink' } : { tone };

/** 결 → 점 · 세로 띠 · 글자 · 테두리+옅은 바탕. tailwind 가 빌드 때 찾도록 클래스 이름을 통째로 적는다 */
export const TONE_MARK: Readonly<Record<ApprovalTone, { dot: string; bar: string; text: string; frame: string }>> = {
  neutral: { dot: 'bg-fg-subtle', bar: 'border-l-fg-subtle', text: 'text-fg-2', frame: 'border-line bg-inset' },
  info: { dot: 'bg-blue', bar: 'border-l-blue', text: 'text-blue', frame: 'border-blue/50 bg-blue/5' },
  success: { dot: 'bg-green', bar: 'border-l-green', text: 'text-green', frame: 'border-green/50 bg-green/5' },
  warning: { dot: 'bg-amber', bar: 'border-l-amber', text: 'text-amber', frame: 'border-amber/50 bg-amber/5' },
  danger: { dot: 'bg-red', bar: 'border-l-red', text: 'text-red', frame: 'border-red/50 bg-red/5' },
  purple: { dot: 'bg-violet', bar: 'border-l-violet', text: 'text-violet', frame: 'border-violet/50 bg-violet/5' },
  teal: { dot: 'bg-teal', bar: 'border-l-teal', text: 'text-teal', frame: 'border-teal/50 bg-teal/5' },
  orange: { dot: 'bg-orange', bar: 'border-l-orange', text: 'text-orange', frame: 'border-orange/50 bg-orange/5' },
  pink: { dot: 'bg-pink', bar: 'border-l-pink', text: 'text-pink', frame: 'border-pink/50 bg-pink/5' },
};

function isFlowItem(row: ApRow | ApprovalFlowItem): row is ApprovalFlowItem {
  return 'kindLabel' in row;
}

/** 서버 KST 시각 문자열(`YYYY-MM-DD HH:MM…` 또는 ISO)을 원문 표기로 자른다 — 날짜를 다시 계산하지 않는다 */
const stamp = (at: string, withYear: boolean) => at.slice(withYear ? 0 : 5, 16).replace('T', ' ');

/**
 * 결재 한 줄 — **같은 필드, 두 모양** (g2 대조 14-3 · 75-2).
 *
 * - `inbox`(§14 승인 대기함) — **카드**: 색 채운 분류 배지 + 요청자 이름(굵게) + 무엇에 대한 요청인가 ·
 *   오른쪽 `YYYY-MM-DD HH:MM` / 아래 회색 상자에 「지금 → 바라는 것」 / 올린 사람의 사유 인용 줄(`reason`).
 *   원문 카드가 사람을 먼저 말한다.
 * - `flow`(§75 결재 흐름) — **한 줄**: 배지 + 굵은 제목 + 회색 부제 · 오른쪽에 「보낸 이 → 받는 이」 ·
 *   날짜 · ›. 줄 전체가 원본으로 가는 링크이므로(D-R27) 끝에 이동 표시를 둔다.
 *
 * 필드는 기존 `ApRow`·`ApprovalFlowItem` 그대로다 — 새 칸을 만들지 않는다. 회색 상자는 서버가 지은
 * `sub`(변경 요청은 「수업 · 날짜 · 바뀌는 것 · 범위」, 요청은 「지금 → 바라는 것」) → 없으면 `asked` 순이다.
 * 링크·처리 단추는 부모가 소유하고, 이 컴포넌트는 같은 행 시각만 공유한다.
 */
export function ApprovalRowContent({ row, variant }: {
  row: ApRow | ApprovalFlowItem;
  variant: 'inbox' | 'flow';
}) {
  const flowItem = isFlowItem(row);
  const kindLabel = flowItem ? row.kindLabel : (row.categoryLabel ?? approvalKindLabel(row.kind));
  const back = row.state === 'back';
  // 배지 색은 갈래의 색이다 — 되돌아온 것은 줄 바탕(§75 분홍)과 반려 사유 줄이 말한다
  const tone: ApprovalTone = flowItem ? approvalFlowKindTone(row.kind) : approvalCategoryTone(row.category);
  const look = badgeTone(tone);
  const badge = (
    <Chip tone={look.tone} styleKind="solid" className={cn('shrink-0', look.className)}>
      {kindLabel}
    </Chip>
  );
  const why = back && row.why ? (
    <p className="mt-1.5 rounded bg-red/5 px-2 py-1 text-[11px] text-red">
      <span className="font-bold">반려 사유</span> · {row.why}
    </p>
  ) : null;

  if (variant === 'flow') {
    const route = flowItem ? [row.byName, row.toName].filter(Boolean).join(' → ') : row.byName;
    return (
      <>
        <div className="flex items-center gap-2">
          {badge}
          <span className="min-w-0 truncate text-[12.5px] font-bold text-fg">{row.title}</span>
          {row.sub ? <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">{row.sub}</span> : <span className="flex-1" />}
          {route ? <span className="shrink-0 text-[11px] font-bold text-fg-2">{route}</span> : null}
          <time dateTime={row.at} className="shrink-0 text-[11px] text-fg-subtle">{stamp(row.at, false)}</time>
          <ChevronRight size={14} aria-hidden className="shrink-0 text-fg-subtle" />
        </div>
        {why}
      </>
    );
  }

  // 요청자를 모르는 줄(빠진 것 · 옛 기록)은 제목을 대신 굵게 적는다 — 빈 이름을 지어내지 않는다
  const who = row.byName ?? row.title;
  const box = row.sub ?? ('asked' in row ? row.asked : null) ?? null;
  return (
    <>
      <div className="flex items-center gap-2">
        {badge}
        <span className="shrink-0 text-[13px] font-bold text-fg">{who}</span>
        {row.byName ? <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">{row.title}</span> : <span className="flex-1" />}
        <time dateTime={row.at} className="shrink-0 text-[11px] text-fg-subtle">{stamp(row.at, true)}</time>
      </div>
      {box ? <p className="mt-2 rounded-md bg-inset px-2.5 py-1.5 text-[12px] font-bold text-fg">{box}</p> : null}
      {/* 올린 사람이 자기 말로 적은 사유 — 원문 §14 의 인용 줄(분류 색 세로 띠 · g2 14-4). 서버가 주지 않으면 서지 않는다 */}
      {'reason' in row && row.reason ? (
        <p className={cn('mt-2 border-l-2 pl-2 text-[12px] font-bold text-fg-2', TONE_MARK[tone].bar)}>{row.reason}</p>
      ) : null}
      {why}
    </>
  );
}
