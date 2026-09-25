/** @file-guide
 * 목적: Board.tsx — BoardColumn, BoardProps, Board (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 단계 보드 — 상담(§23) · 컨설팅(§26) · 기획(§61) · 컴플레인(§67) · 회계(§52) 가 같은 모양이다.
 * 탭마다 보드를 새로 그리면 칸 너비와 카드 높이가 조금씩 달라진다.
 */
import type { ReactNode } from 'react';
import { cn } from './cn';
import { Chip, type ChipTone } from './Chip';

/** 칸 윗선(3px) — 원문 §23·§26 칸 머리의 단계색. 회색 칸(§23 등록 실패)은 흐린 글자색 줄이다 */
const ACCENT: Record<ChipTone, string> = {
  neutral: 'border-t-fg-subtle', info: 'border-t-blue', success: 'border-t-green', warning: 'border-t-amber',
  danger: 'border-t-red', purple: 'border-t-violet', teal: 'border-t-teal', orange: 'border-t-orange',
};
/** 칸 바탕을 톤으로 옅게 — 원문 §23 「등록」 칸의 초록 바탕 */
const FILL: Record<ChipTone, string> = {
  neutral: 'bg-inset', info: 'bg-blue/5', success: 'bg-green/5', warning: 'bg-amber/5',
  danger: 'bg-red/5', purple: 'bg-violet/5', teal: 'bg-teal/5', orange: 'bg-orange/5',
};
/** 이름 옆 건수 글자색(§23 「1차 상담 4」) */
const COUNT_TEXT: Record<ChipTone, string> = {
  neutral: 'text-fg-subtle', info: 'text-blue', success: 'text-green', warning: 'text-amber',
  danger: 'text-red', purple: 'text-violet', teal: 'text-teal', orange: 'text-orange',
};

export interface BoardColumn<T> {
  key: string;
  label: string;
  /** 칸 이름 아래 한 줄 — 컷의 칸마다 이 설명이 있다 (§52 「보냈습니다 · 입금을 기다립니다」) */
  sub?: string;
  /** 칸 머리 오른쪽에 이름표와 함께 서는 값 — §52 의 칸 합계 같은 것 */
  note?: ReactNode;
  tone?: ChipTone;
  /** 칸 바탕을 톤으로 옅게(§23 「등록」 초록) — 기본 끔 */
  fill?: boolean;
  /** 이 칸 앞에 세로 구분선(§23 「보류」|「등록」 — 깔때기 안과 결과를 가른다) — 기본 끔 */
  divideBefore?: boolean;
  /**
   * 칸 윗선·번호 원·큰 건수를 **글자색(검정)**으로 — 원문 §52 넷째 칸 「입금 기록」 (x5 · 52-01).
   * 칩 톤에는 검정이 없다(`neutral` 은 회색 — §52 첫 칸). 기본 끔 = `tone` 그대로.
   */
  ink?: boolean;
  items: T[];
}

export interface BoardProps<T> {
  columns: Array<BoardColumn<T>>;
  /**
   * 칸 이름 앞에 ①②③ 번호를 세운다 — 컷 §26·§61·§67 이 그렇다.
   * **§23 상담에는 없다**(설명 줄만 있다) — 그래서 언제나 붙이지 않고 부르는 쪽이 정한다.
   */
  numbered?: boolean;
  /**
   * 칸 머리 윗선 3px 을 칸 톤으로 긋고 번호 원을 칸 톤으로 채운다(§23 23-09 · §26 26-05 · C-9).
   * 기본 끔 — §52·§61·§67 은 지금 모양 그대로다.
   */
  accent?: boolean;
  /** 건수 모양 — `chip`(기본 · 오른쪽 칩) · `inline`(이름 바로 옆 톤 색 숫자 · §23) · `big`(오른쪽 큰 톤 색 숫자 · §26 · C-9) */
  countStyle?: 'chip' | 'inline' | 'big';
  renderCard: (item: T) => ReactNode;
  /**
   * 카드 한 장의 **겉모양**을 바꿀 클래스 — 원문 §61·§67 의 기한 지난 카드는 분홍 바탕 + 붉은 테두리다 (x5 · C-9).
   * 판정은 부르는 쪽(서버 값)이 한다 — 보드는 무엇이 「지난」 것인지 모른다. 기본 없음 = 지금 모양.
   */
  cardClassName?: (item: T) => string | undefined;
  itemKey: (item: T) => string | number;
  empty?: string;
  className?: string;
}

export function Board<T>({
  columns, renderCard, cardClassName, itemKey, numbered = false, accent = false, countStyle = 'chip', empty = '없습니다', className,
}: BoardProps<T>) {
  return (
    <div
      className={cn('grid gap-3', className)}
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
    >
      {columns.map((c, i) => (
        <section
          key={c.key}
          data-board-column={c.key}
          className={cn(
            'rounded-xl border border-line p-2.5',
            c.fill ? FILL[c.tone ?? 'neutral'] : 'bg-inset',
            accent ? cn('border-t-[3px]', c.ink ? 'border-t-fg' : ACCENT[c.tone ?? 'neutral']) : '',
            // 구분선은 칸 사이 틈(gap-3 = 12px)의 가운데에 선다 — 칸 너비를 먹지 않는다
            c.divideBefore ? "relative before:absolute before:-left-[7px] before:top-0 before:h-full before:w-0.5 before:rounded-full before:bg-line before:content-['']" : '',
          )}
        >
          <header className="mb-2 px-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {/* 번호는 **자리**를 말한다 — 컷의 ①②③ 은 왼쪽에서 오른쪽으로 올리는 순서다 */}
                {numbered ? (
                  c.ink && accent
                    ? <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-fg px-1.5 text-[10px] font-bold text-card">{i + 1}</span>
                    : <Chip size="compact" tone={c.tone ?? 'neutral'} styleKind={accent ? 'solid' : 'soft'}>{i + 1}</Chip>
                ) : null}
                <span className="truncate text-[12px] font-bold text-fg">{c.label}</span>
                {countStyle === 'inline' ? (
                  <span className={cn('shrink-0 text-[12px] font-bold', COUNT_TEXT[c.tone ?? 'neutral'])}>{c.items.length}</span>
                ) : null}
              </span>
              {/* 건수는 **서버가 센 값이 있으면 그것**을 쓴다 — 없을 때만 배열을 센다 (D-R37) */}
              {countStyle === 'chip' ? <Chip tone={c.tone ?? 'neutral'}>{c.items.length}</Chip> : null}
              {countStyle === 'big' ? (
                <span className={cn('shrink-0 text-[20px] font-bold leading-none', c.ink ? 'text-fg' : COUNT_TEXT[c.tone ?? 'neutral'])}>{c.items.length}</span>
              ) : null}
            </div>
            {c.sub ? <p className="mt-0.5 text-[10.5px] text-fg-subtle">{c.sub}</p> : null}
            {c.note ? <div className="mt-1 text-[13px] font-bold text-fg">{c.note}</div> : null}
          </header>
          <div className="flex flex-col gap-2">
            {c.items.length === 0 ? (
              <p className="px-1 py-4 text-center text-[11px] text-fg-subtle">{empty}</p>
            ) : (
              c.items.map((it) => (
                <article key={itemKey(it)} className={cardClassName?.(it) ?? 'rounded-lg border border-line bg-card p-2.5'}>
                  {renderCard(it)}
                </article>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
