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
import { Chip, type Tone } from './Chip';

export interface BoardColumn<T> {
  key: string;
  label: string;
  /** 칸 이름 아래 한 줄 — 컷의 칸마다 이 설명이 있다 (§52 「보냈습니다 · 입금을 기다립니다」) */
  sub?: string;
  /** 칸 머리 오른쪽에 이름표와 함께 서는 값 — §52 의 칸 합계 같은 것 */
  note?: ReactNode;
  tone?: Tone;
  items: T[];
}

export interface BoardProps<T> {
  columns: Array<BoardColumn<T>>;
  renderCard: (item: T) => ReactNode;
  itemKey: (item: T) => string | number;
  empty?: string;
  className?: string;
}

export function Board<T>({ columns, renderCard, itemKey, empty = '없습니다', className }: BoardProps<T>) {
  return (
    <div
      className={cn('grid gap-3', className)}
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
    >
      {columns.map((c) => (
        <section key={c.key} className="rounded-xl border border-line bg-inset p-2.5">
          <header className="mb-2 px-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-fg">{c.label}</span>
              {/* 건수는 **서버가 센 값이 있으면 그것**을 쓴다 — 없을 때만 배열을 센다 (D-R37) */}
              <Chip tone={c.tone ?? 'neutral'}>{c.items.length}</Chip>
            </div>
            {c.sub ? <p className="mt-0.5 text-[10.5px] text-fg-subtle">{c.sub}</p> : null}
            {c.note ? <div className="mt-1 text-[13px] font-bold text-fg">{c.note}</div> : null}
          </header>
          <div className="flex flex-col gap-2">
            {c.items.length === 0 ? (
              <p className="px-1 py-4 text-center text-[11px] text-fg-subtle">{empty}</p>
            ) : (
              c.items.map((it) => (
                <article key={itemKey(it)} className="rounded-lg border border-line bg-card p-2.5">
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
