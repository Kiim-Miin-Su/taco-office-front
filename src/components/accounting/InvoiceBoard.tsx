/** @file-guide
 * 목적: InvoiceBoard.tsx — InvoiceBoardProps, InvoiceBoard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §52 회계 트래킹 보드 — 칸 넷.
 *
 * **여기서 아무것도 판정하지 않는다.** 어느 카드가 어느 칸에 드는지도, 건수도, 칸 합계도,
 * 「50% 냄」·「연체」·「D-21」도 전부 서버가 낸 값이다 (대표 결정 N-28 「단일 진실원과 자동 전이에
 * 유리하게」 · D-R37 · D-R39). 화면이 상태를 다시 읽어 칸을 고르면 그 순간 판정이 두 벌이 된다.
 *
 * **전이도 화면이 하지 않는다.** 컷의 카드에 「청구서 작성 →」 같은 다음 칸 단추가 있지만,
 * 실제로 카드를 옮기는 것은 **입금과 발송**이다 — 입금이 들어오면 서버가 상태를 옮기고
 * 카드는 저절로 다음 칸에 선다. 그래서 여기에는 **칸을 미는 단추를 두지 않았다.**
 * W11(N-28 ② 채택) — 다음 칸 단추는 §53 청구서 탭의 다섯 칸 판(`InvoiceStageBoard`)에 선다. 이미 있는 쓰기
 * (발행 · 전달 · 입금)만 부르고, §52 컷의 카드에는 「자세히 ›」뿐이다.
 */
'use client';
import type { InvBoard, InvBoardCard } from '@/api/types';
import { Banner, Board, Chip, type BoardColumn } from '@/components/ui';
import { won } from '@/lib/money';

export interface InvoiceBoardProps {
  data?: InvBoard;
  loading?: boolean;
  /** 카드의 「자세히 ›」 — 청구서 탭의 그 줄로 간다 (x5 · 52-03). 원문에 없는 청구서 상세 창은 만들지 않는다 */
  onOpenInvoice?: (invId: number) => void;
}

/** 칸마다의 빛깔 — 값이 아니라 토큰 이름이다 (D-R41). 원문 §52 윗선: 회색 · 파랑 · 초록 · **검정**(넷째는 `ink`) */
const TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral', sent: 'info', paid: 'success', record: 'neutral',
};
const INK = new Set(['record']);

/**
 * 카드 한 줄 — 원문 §52: 이름 + 학년 칩(+ 연체 칩) + 「자세히 ›」 (x5 · 52-02). 금액·종류·「50% 냄」은 칸 머리 합계와
 * 청구서 탭 줄이 말한다 — 한 줄로 줄여도 잃는 것이 없다(「자세히 ›」가 그 줄로 간다). 판정(연체)은 서버 값 그대로다.
 */
function Card({ c, onOpen }: { c: InvBoardCard; onOpen?: (invId: number) => void }) {
  return (
    <div className="flex items-center gap-1.5" title={`${c.invTypeLabel} · ${c.title}`}>
      <span className="text-[13px] font-bold text-fg">{c.studentName}</span>
      {/* 학년 칩 자리 — 동명이인이면 학교까지 붙은 서버 꼬리 (N-137) */}
      {c.studentTag ? <Chip size="compact" tone="neutral">{c.studentTag}</Chip> : null}
      {c.overdueDays > 0 ? <Chip size="compact" styleKind="solid" tone="danger">연체</Chip> : null}
      {onOpen ? (
        <button type="button" className="ml-auto shrink-0 text-[11px] font-bold text-fg-2 hover:underline"
          aria-label={`${c.studentName} 청구서 자세히`} onClick={() => onOpen(c.invId)}>
          자세히 ›
        </button>
      ) : null}
    </div>
  );
}

export function InvoiceBoard({ data, loading, onOpenInvoice }: InvoiceBoardProps) {
  const cols: Array<BoardColumn<InvBoardCard>> = (data?.columns ?? []).map((c) => ({
    key: c.key,
    label: c.label,
    sub: c.sub,
    // 칸 합계도 서버가 낸 값이다 — 화면이 카드를 더하지 않는다 (D-R37)
    note: won(c.amount),
    tone: TONE[c.key] ?? 'neutral',
    ink: INK.has(c.key),
    items: c.cards,
  }));

  return (
    <>
      {data && !data.canSeeAmounts ? (
        <Banner tone="neutral" className="mb-3">
          금액은 대표만 봅니다 — 받은 비율도 내려오지 않습니다. 비율과 받은 돈이 함께 있으면 청구액이 드러납니다.
        </Banner>
      ) : null}
      {cols.length === 0 ? (
        <p className="text-[12px] text-fg-subtle">{loading ? '불러오는 중…' : '아직 불러오지 않았습니다'}</p>
      ) : (
        /* 칸 머리 번호 ①②③④ — 원문 §52 는 왼쪽에서 오른쪽으로 옮겨 가는 순서를 번호로 적는다(52-01).
           공용 Board 의 번호 자리를 그대로 쓴다 — 번호는 칸의 자리이지 서버 값이 아니다.
           윗선·채운 번호 원·오른쪽 큰 건수(x5 · §52 윗선) — 넷째 칸은 검정(`ink`) */
        <Board numbered accent countStyle="big" columns={cols} renderCard={(c) => <Card c={c} onOpen={onOpenInvoice} />} itemKey={(c) => c.invId} empty="없습니다" />
      )}
    </>
  );
}
