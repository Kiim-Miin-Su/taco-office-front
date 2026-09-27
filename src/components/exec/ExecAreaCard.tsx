/** @file-guide
 * 목적: ExecAreaCard.tsx — ExecAreaCard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §69~§71 대표 보고의 **영역 카드 한 장** — [점 · 이름 · 배지 · 「보기 ›」] + 한 줄 요약 + 타일 + 메모 칸.
 *
 * 한동안 이 카드가 두 패널로 쪼개져 있었다 — 「살펴볼 것」(이동 단추 여섯)과 「숫자만으로는 모를 것」(메모 여섯).
 * 원본은 **한 카드**다: 숫자를 보고 바로 아래에 그 숫자로는 모를 것을 적는다(69-7).
 *
 * **세는 일은 하나도 하지 않는다.** 배지 · 한 줄 요약 · 타일의 이름·값·부제·붉은 칸은 전부 서버가 준다
 * (`lib/exec-areas` · D-R18 · D-R37). 금액을 못 보는 사람에게는 서버가 값을 null 로 주고 문장에서도 뺀다(D-R39).
 * 펼칠 줄(「기한 지난 청구서 2건 펼치기 ▾」 · N-67 · K-111)도 서버가 머리 낱말과 줄을 준다 — 화면은 여닫고 이동만 한다.
 * **영역 담당 이름 (W11 · N-81)** — 원문 §69 메모 칸 위의 「Grace」·「김범준」. 영역마다 고정 한 명이고 대표가 정한다
 * (서버의 `canSetOwner` · 쓰기는 `PUT /exec/areas/:key/owner`). 처음엔 비어 있다 — 이름을 지어 넣지 않는다.
 */
import { useId, useState, type ReactNode } from 'react';
import type { ExecArea, StaffBrief } from '@/api/types';
import { Chip, Select, Textarea } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { MASKED, won } from '@/lib/money';

/**
 * 영역 색 — **표시 전용**이다(원본 §69 의 카드 테두리·점: 회계 초록 · 마케팅 분홍 · 운영 청록 · 컨설팅 보라 ·
 * 컴플레인 빨강 · 수업 갈색 · 69-11). 판정이 아니라 영역 key 에 붙는 빛깔이라 화면이 가진다.
 * 분홍·청록은 수업 종류 색(kind-consulting · kind-consult)을 그대로 쓴다 — §69 컷의 영역 점은 차분한 색(실측 #A56B80 · #5A8189)이라
 * 새 전용 토큰 `pink`·`teal`(§23·§55 의 선명한 계열)보다 이쪽이 컷에 가깝다(D-R44 · 2026-09-25 대조). 값은 tokens.css 한 곳이다 (D-R41).
 */
const AREA_COLOR: Record<string, { dot: string; border: string }> = {
  money: { dot: 'bg-green', border: 'border-green/60' },
  mkt: { dot: 'bg-kind-consulting', border: 'border-line' },
  ops: { dot: 'bg-kind-consult', border: 'border-kind-consult' },
  consulting: { dot: 'bg-violet', border: 'border-violet/60' },
  complaint: { dot: 'bg-red', border: 'border-red/60' },
  lesson: { dot: 'bg-primary', border: 'border-primary/60' },
};

type Tile = ExecArea['tiles'][number];

/**
 * 타일 값 — 서버가 지은 글(「없음」)이 있으면 그것, 금액(`unit` 「원」)이면 원화, 건수면 「N건」.
 * 원화 모양(「₩8,550,000」 · 음수 · 가림 낱말)은 `lib/money.won` 한 곳이 만든다 (N-92 — 전에는 이 파일에 제 함수가 있었다).
 */
function tileValue(t: Tile): string {
  if (t.display) return t.display;
  if (t.unit === '원') return won(t.value);
  return t.value === null ? MASKED : `${t.value}건`;
}

export function ExecAreaCard({
  area, memo, onMemoChange, memoDisabled, onGo, onOpenItem, owners, onOwnerChange, ownerBusy = false, className,
}: {
  area: ExecArea;
  memo: string;
  onMemoChange: (next: string) => void;
  memoDisabled: boolean;
  onGo: () => void;
  /** 펼친 줄 하나를 누르면 — 그 줄의 원본 화면(`go`)으로 이동만 한다 (D-R27) */
  onOpenItem: (go: string) => void;
  /** 담당으로 고를 사람 — 서버가 `canSetOwner` 로 연 사람에게만 쓰인다 */
  owners?: readonly StaffBrief[];
  /** 담당 바꾸기 — `null` 은 비우기 */
  onOwnerChange?: (staffId: number | null) => void;
  ownerBusy?: boolean;
  className?: string;
}): ReactNode {
  const color = AREA_COLOR[area.key] ?? { dot: 'bg-fg-subtle', border: 'border-line' };
  const headId = `exec-area-${area.key}`;
  const listId = useId();
  // 원본 컷은 닫힌 채다(「펼치기 ▾」) — 여닫음은 이 카드만의 화면 상태다
  const [open, setOpen] = useState(false);
  // 담당 고르기 칸 — 원본 컷에는 이름만 있다. 대표가 「바꾸기」를 눌렀을 때만 고르기 칸이 선다
  const [picking, setPicking] = useState(false);
  const pickable = area.canSetOwner && onOwnerChange !== undefined;
  return (
    <section aria-labelledby={headId} className={cn('flex flex-col overflow-hidden rounded-xl border bg-card', color.border, className)}>
      <header className="flex items-center gap-2 bg-inset px-3.5 py-2">
        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', color.dot)} />
        <h3 id={headId} className="text-[14px] font-bold text-fg">{area.label}</h3>
        {/*
         * 0 건은 원문처럼 **체크 하나**다. `✓` 는 글리프이지 낱말이 아니라 보조기기가 「마케팅 ✓」라고만
         * 읽는다 — 글자로도 한 번 적는다(K-110 과 같은 종류). 건수는 빨간 숫자다(69-11).
         */}
        {area.count > 0
          ? <Chip size="compact" tone="danger" styleKind="solid">{area.count}</Chip>
          : <span className="text-[13px] font-bold text-green"><span aria-hidden>✓</span><span className="sr-only">살펴볼 것 없음</span></span>}
        {/*
         * **K-110** — 원문 §69 는 카드 오른쪽 위에 「보기 ›」라 적는다. 이동만 한다(D-R27) — 대표 보고 안에서 처리하지 않는다.
         * 카드 전체를 단추로 두면 그 안에 메모 칸을 넣을 수 없어 「보기」만 단추다. 인쇄에서는 빠진다(C100 · P-160).
         */}
        <button
          type="button"
          data-print="chrome"
          onClick={onGo}
          aria-label={`${area.label} 보기`}
          className="ml-auto shrink-0 rounded-md bg-card/70 px-2 py-0.5 text-[11.5px] font-bold text-fg-2 hover:bg-card"
        >
          보기 <span aria-hidden>›</span>
        </button>
      </header>

      <div className="px-3.5 py-3">
        <p className="text-[13px] font-bold text-fg">{area.headline}</p>
        <ul className={cn('mt-2 grid gap-2', area.tiles.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')} aria-label={`${area.label} 숫자`}>
          {area.tiles.map((t) => (
            <li key={t.key} className={cn('rounded-lg border px-2.5 py-2', t.alert ? 'border-red/30 bg-red/5' : 'border-line bg-card')}>
              <div className="text-[11px] font-bold text-fg-2">{t.label}</div>
              <div className={cn('mt-0.5 text-[16px] font-bold leading-tight', t.alert ? 'text-red' : 'text-fg')}>{tileValue(t)}</div>
              {t.sub ? <div className="mt-0.5 truncate text-[11px] text-fg-subtle" title={t.sub}>{t.sub}</div> : null}
            </li>
          ))}
        </ul>
      </div>

      {/*
       * 원본 §69~§71 의 펼칠 줄 — 타일 아래 옅은 띠 「기한 지난 청구서 2건 펼치기 ▾」(N-67 · K-111).
       * 머리 낱말과 줄은 서버가 준다(배지와 같은 판정 · 여덟에서 끊음). 줄이 없으면 띠 자체가 없다(원본 §69 마케팅).
       */}
      {area.itemsLabel ? (
        <div className="border-t border-line bg-inset/60">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-1 px-3.5 py-2 text-left text-[12px] font-bold text-fg hover:bg-inset"
          >
            {area.itemsLabel} {open ? '접기' : '펼치기'} <span aria-hidden>{open ? '▴' : '▾'}</span>
          </button>
          {open ? (
            <ul id={listId} aria-label={area.itemsLabel} className="flex flex-col gap-1 px-3.5 pb-2.5">
              {area.items.map((it) => (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(it.go)}
                    className="flex w-full items-center gap-2 rounded-md border border-line bg-card px-2.5 py-1.5 text-left hover:border-primary/50"
                  >
                    <span className="min-w-0 grow truncate text-[12px] font-bold text-fg">{it.title}</span>
                    {it.sub ? <span className="shrink-0 text-[11px] text-fg-subtle">{it.sub}</span> : null}
                    <span aria-hidden className="shrink-0 text-fg-subtle">›</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto border-t border-line px-3.5 py-2.5">
        {/* 원본 §69 메모 칸 위의 담당 이름 (N-81) — 없으면 없다고 적는다. 고르기는 도구라 인쇄에서 빠진다 */}
        <div className="mb-1.5 flex min-h-5 flex-wrap items-center gap-2">
          {area.ownerName
            ? <b className="text-[12px] text-fg">{area.ownerName}</b>
            : <span className="text-[11.5px] text-fg-subtle">담당 없음</span>}
          {pickable && picking ? (
            <span className="w-40" data-print="chrome">
              <Select
                aria-label={`${area.label} 담당`}
                autoFocus
                disabled={ownerBusy}
                value={area.ownerId == null ? '' : String(area.ownerId)}
                onBlur={() => setPicking(false)}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setPicking(false);
                  onOwnerChange?.(v === '' ? null : Number(v));
                }}
              >
                <option value="">담당 없음</option>
                {/* 지금 담당이 고를 목록(활동 중인 사람)에 없어도 그 이름으로 선다 — 고르기 칸이 거짓말하지 않게 */}
                {area.ownerId != null && !(owners ?? []).some((s) => s.id === area.ownerId)
                  ? <option value={area.ownerId}>{area.ownerName ?? ''}</option> : null}
                {(owners ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </span>
          ) : pickable ? (
            <button
              type="button"
              data-print="chrome"
              disabled={ownerBusy}
              onClick={() => setPicking(true)}
              aria-label={`${area.label} 담당 바꾸기`}
              className="text-[11px] text-fg-subtle hover:text-fg hover:underline disabled:opacity-40"
            >
              바꾸기
            </button>
          ) : null}
        </div>
        <Textarea
          rows={1}
          style={{ minHeight: 44 }}
          aria-label={`${area.label} 메모`}
          placeholder="숫자만으로는 모를 것"
          /* 이미 올린 보고는 칸도 닫는다 (S5) — 단추만 닫으면 여섯 칸을 다 적고 나서야
             저장이 안 되는 것을 안다. 막는 이유는 도구 줄에 문장으로 서 있다. */
          disabled={memoDisabled}
          value={memo}
          // 값은 **먼저 꺼낸다** — 부모의 setState 업데이터는 나중에 돌고 그때 currentTarget 은 null 이다
          onChange={(e) => onMemoChange(e.currentTarget.value)}
        />
      </div>
    </section>
  );
}
