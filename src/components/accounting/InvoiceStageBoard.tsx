/** @file-guide
 * 목적: InvoiceStageBoard.tsx — InvoiceStageBoardProps, InvoiceStageBoard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §53 청구서 탭의 **다섯 칸 판** — 대표 위임 채택 N-28 ②(W11 · D-R44 원문 컷 그대로).
 *
 * ① 「아직 안 씀」은 **아직 청구서가 없는 청구 대상**이다 — 서버가 일괄 발행 후보와 같은 함수로 세어 내린다(저장 안 함).
 *   청구서 번호가 없고, 금액은 발행과 같은 함수가 센 예상 금액이다. 발행하면 저절로 ② 로 옮는다.
 * ②~⑤ 는 §52 네 칸 판과 **같은 판정**(서버 `invBoardColumn`) — 어느 칸에 서는지 화면이 고르지 않는다 (D-R39).
 *
 * **다음 칸 단추는 이미 있는 쓰기에만 선다** — 칸마다 서버가 `next` · `nextLabel` 로 말한다.
 *   ① 「청구서 작성 →」 = 발행 창을 그 학생 · 달 · 종류로 연다. 기한은 사람이 고른다(미리 채우지 않는다 · S3).
 *   ② 「학부모 안내 →」 = 전달 쓰기. 누를 수 있는지는 그 청구서의 서버 `canDeliver` 다.
 *   ③ 「입금 완료 →」 = 들어온 돈 › 입금 기록을 그 청구서로 연다. 금액 · 입금일은 사람이 적는다.
 *   ④ · ⑤ 는 다음 쓰기가 없다. 건너뛰기 · 되돌리기는 없다(원문 규칙).
 * ① 카드의 「N일 지남」은 원문에 산식이 없어 짓지 않는다(N-28 ②).
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useInvoiceAction } from '@/api/queries';
import type { InvBoard, InvBoardCandidate, InvBoardCard, InvStageColumn, Invoice } from '@/api/types';
import { Banner, Board, Button, Chip, cn, type BoardColumn, type ChipTone } from '@/components/ui';
import { won } from '@/lib/money';
import { categoryChip } from './category-tone';

type StageItem =
  | { kind: 'candidate'; col: InvStageColumn; c: InvBoardCandidate }
  | { kind: 'card'; col: InvStageColumn; c: InvBoardCard };

/** 칸 빛깔 — 값이 아니라 토큰 이름이다 (D-R41). 원문 §53 윗선: 회색 · 파랑 · 청록 · 초록 · **검정**(다섯째는 `ink`) */
const TONE: Record<string, ChipTone> = { todo: 'neutral', draft: 'info', sent: 'teal', paid: 'success', record: 'neutral' };
const INK = new Set(['record']);
/** 카드 제목 띠 — 그 칸의 빛깔 그대로다(원문 §53) */
const BAR: Record<string, string> = { todo: 'bg-fg-subtle', draft: 'bg-blue', sent: 'bg-teal', paid: 'bg-green', record: 'bg-fg' };
const CARD = 'rounded-lg border border-line bg-card p-2.5';
/** 기한 지난 카드 — 원문 §53 의 분홍 바탕 + 붉은 테두리(§61 · §67 과 같은 모양 · x5 C-9). 판정은 서버 `overdueDays` 다 */
const OVERDUE_CARD = 'rounded-lg border border-red/60 bg-red/5 p-2.5';

export interface InvoiceStageBoardProps {
  data?: InvBoard;
  loading?: boolean;
  /** 청구서 목록(`GET /accounting`) — 「학부모 안내 →」가 서는지는 그 청구서의 서버 `canDeliver` 다 (D-R39) */
  invoices: Invoice[];
  /** ① 「청구서 작성 →」 — 발행 창을 이 청구 대상으로 연다 */
  onIssue: (candidate: InvBoardCandidate) => void;
  /** ③ 「입금 완료 →」 — 입금 기록을 이 청구서로 연다 */
  onPay: (invId: number) => void;
  /** 「열기」 — 아래 청구서 표의 그 줄로 간다. 원문에 없는 청구서 상세 창은 만들지 않는다(52-03 과 같은 길) */
  onOpen: (invId: number) => void;
}

export function InvoiceStageBoard({ data, loading, invoices, onIssue, onPay, onOpen }: InvoiceStageBoardProps) {
  const deliver = useInvoiceAction();
  // 전달이 막히면 그 카드 밑에 서버 문장을 둔다 — 화면이 까닭을 짓지 않는다
  const [failed, setFailed] = useState<{ invId: number; message: string } | null>(null);
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const stages = data?.stages ?? [];

  const cols: Array<BoardColumn<StageItem>> = stages.map((col) => ({
    key: col.key,
    label: col.label,
    sub: col.sub,
    // 칸 합계도 서버가 낸 값이다 — ① 은 낼 수 있는 대상의 예상 금액 합 (D-R37)
    note: <span className="block text-right">{won(col.amount)}</span>,
    tone: TONE[col.key] ?? 'neutral',
    ink: INK.has(col.key),
    items: col.key === 'todo'
      ? col.candidates.map((c): StageItem => ({ kind: 'candidate', col, c }))
      : col.cards.map((c): StageItem => ({ kind: 'card', col, c })),
  }));

  const nextButton = (item: StageItem) => {
    const { col } = item;
    if (!col.next || !col.nextLabel) return null;
    if (item.kind === 'candidate') {
      const c = item.c;
      return (
        <Button size="sm" variant="primary" disabled={!c.canIssue} title={c.issueBlockedReason ?? undefined}
          aria-label={`${c.studentName} ${c.title} ${col.nextLabel}`} onClick={() => onIssue(c)}>
          {col.nextLabel}
        </Button>
      );
    }
    const c = item.c;
    if (col.next === 'deliver') {
      // 전달할 수 있는 청구서에만 선다 — 이미 보낸 줄(unpaid)에는 서버가 false 를 준다
      if (!byId.get(c.invId)?.canDeliver) return null;
      return (
        <Button size="sm" variant="primary" disabled={deliver.isPending} aria-label={`${c.studentName} ${col.nextLabel}`}
          onClick={() => deliver.mutate({ kind: 'deliver', id: c.invId }, {
            onSuccess: () => setFailed(null),
            onError: (e) => setFailed({ invId: c.invId, message: apiMessage(e) }),
          })}>
          {col.nextLabel}
        </Button>
      );
    }
    if (col.next === 'pay') {
      return (
        <Button size="sm" variant="primary" aria-label={`${c.studentName} ${col.nextLabel}`} onClick={() => onPay(c.invId)}>
          {col.nextLabel}
        </Button>
      );
    }
    return null;
  };

  const renderCard = (item: StageItem) => {
    if (item.kind === 'candidate') {
      const c = item.c;
      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            {/* 아직 청구서가 없어 종류 칩 자리가 「—」다(원문 §53 ① 카드) — 종류는 아래 제목 띠가 말한다 */}
            <span aria-hidden className="text-[12px] font-bold text-fg-subtle">—</span>
            <span className="min-w-0 truncate text-[13px] font-bold text-fg">{c.studentName}</span>
            {c.grade ? <Chip size="compact" tone="neutral">{c.grade}</Chip> : null}
          </div>
          <div className={cn('truncate rounded px-2 py-0.5 text-[11px] font-bold text-white', BAR.todo)} title={c.title}>{c.title}</div>
          {c.canIssue ? (
            <b className="text-[15px] text-fg">{won(c.amount)}</b>
          ) : (
            // 못 내는 대상도 숨기지 않는다 — 발행 409 와 같은 문장이 까닭이다
            <p className="text-[11px] leading-snug text-red">{c.issueBlockedReason}</p>
          )}
          <div className="flex flex-wrap gap-1.5">{nextButton(item)}</div>
        </div>
      );
    }
    const c = item.c;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Chip size="compact" styleKind="solid" tone={categoryChip(c.invType)}>{c.invTypeLabel}</Chip>
          <span className="min-w-0 truncate text-[13px] font-bold text-fg">{c.studentName}</span>
          {/* 「D-21」·「11일 지남」 — 낱말도 서버가 만든다 (D-R18). 분납이면 못 채운 가장 이른 회차의 기한이다 */}
          <span className={cn('ml-auto shrink-0 text-[11px] font-bold', c.overdueDays > 0 ? 'text-red' : 'text-fg-2')}>{c.whenLabel}</span>
        </div>
        <div className={cn('truncate rounded px-2 py-0.5 text-[11px] font-bold text-white', BAR[item.col.key] ?? 'bg-fg-subtle')} title={c.title}>
          {c.title}
        </div>
        <div className="flex items-baseline gap-2">
          {/* null 은 권한이 없거나 컨설팅 비공개(N-94)로 가려진 카드다 — 낱말은 한 벌(「비공개」) · 칸 합계는 그대로 */}
          <b className="text-[15px] text-fg">{won(c.amount)}</b>
          {/* 「50% 냄」 — 비율도 서버 값이다. 금액을 못 보는 사람에게는 오지 않는다 */}
          {c.paidPercent != null ? <span className="text-[11px] font-bold text-green">{c.paidPercent}% 냄</span> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" aria-label={`${c.studentName} 청구서 열기`} onClick={() => onOpen(c.invId)}>열기</Button>
          {nextButton(item)}
        </div>
        {failed?.invId === c.invId ? <p className="text-[11px] text-red">{failed.message}</p> : null}
      </div>
    );
  };

  return (
    <>
      {data?.canSeeAmounts === false ? (
        <Banner tone="neutral" className="mb-3">
          금액은 대표만 봅니다 — 예상 금액과 받은 비율도 내려오지 않습니다.
        </Banner>
      ) : null}
      {cols.length === 0 ? (
        <p className="mb-4 text-[12px] text-fg-subtle">{loading ? '불러오는 중…' : '아직 불러오지 않았습니다'}</p>
      ) : (
        /* 칸 머리 번호 ①~⑤ · 윗선 · 오른쪽 큰 건수 — §52 판과 같은 공용 Board 모양이다. 다섯째 칸은 검정(`ink`) */
        <Board
          className="mb-4"
          numbered accent countStyle="big"
          columns={cols}
          renderCard={renderCard}
          cardClassName={(item) => (item.kind === 'card' && item.c.overdueDays > 0 ? OVERDUE_CARD : CARD)}
          itemKey={(item) => (item.kind === 'candidate' ? `todo-${item.c.studentId}-${item.c.invType}` : item.c.invId)}
          empty="없습니다"
        />
      )}
    </>
  );
}
