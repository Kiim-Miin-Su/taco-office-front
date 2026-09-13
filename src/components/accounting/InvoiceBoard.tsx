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
 * (컷의 단추가 무엇을 하는지는 N-28 ③ 이 아직 열려 있다.)
 */
'use client';
import type { InvBoard, InvBoardCard } from '@/api/types';
import { Banner, Board, Chip, type BoardColumn } from '@/components/ui';
import { won } from '@/lib/money';

export interface InvoiceBoardProps {
  data?: InvBoard;
  loading?: boolean;
}

/** 칸마다의 빛깔 — 값이 아니라 토큰 이름이다 (D-R41) */
const TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral', sent: 'info', paid: 'success', record: 'warning',
};

function Card({ c }: { c: InvBoardCard }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="purple">{c.invTypeLabel}</Chip>
        <span className="text-[12.5px] font-bold text-fg">{c.studentName}</span>
        {c.grade ? <Chip tone="neutral">{c.grade}</Chip> : null}
      </div>
      <p className="truncate text-[11.5px] text-fg-2" title={c.title}>{c.title}</p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="text-[13px] font-bold text-fg">{won(c.amount)}</span>
        <span className="flex items-center gap-1.5">
          {/* 「50% 냄」 — 서버가 낸 비율이다. 금액을 못 보면 비율도 안 온다 */}
          {c.paidPercent !== null && c.paidPercent !== undefined ? (
            <span className="text-[11px] font-bold text-amber">{c.paidPercent}% 냄</span>
          ) : null}
          {c.overdueDays > 0
            ? <Chip tone="danger">연체</Chip>
            : <span className="text-[11px] text-fg-subtle">{c.whenLabel}</span>}
        </span>
      </div>
    </div>
  );
}

export function InvoiceBoard({ data, loading }: InvoiceBoardProps) {
  const cols: Array<BoardColumn<InvBoardCard>> = (data?.columns ?? []).map((c) => ({
    key: c.key,
    label: c.label,
    sub: c.sub,
    // 칸 합계도 서버가 낸 값이다 — 화면이 카드를 더하지 않는다 (D-R37)
    note: won(c.amount),
    tone: TONE[c.key] ?? 'neutral',
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
        <Board columns={cols} renderCard={(c) => <Card c={c} />} itemKey={(c) => c.invId} empty="없습니다" />
      )}
    </>
  );
}
