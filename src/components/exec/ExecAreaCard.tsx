/** @file-guide
 * 목적: ExecAreaCard.tsx — ExecAreaCard, execWon (component)
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
 * 펼칠 줄(「기한 지난 청구서 2건 펼치기 ▾」)은 없다 — 결정 대기다. 영역 담당 이름도 없다 — 적을 칸이 저장소에 없다.
 */
import type { ReactNode } from 'react';
import type { ExecArea } from '@/api/types';
import { Chip, Textarea } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { MASKED, won } from '@/lib/money';

/**
 * 원화 — 원본 §69 의 「₩8,550,000」 모양. 음수는 「₩-7,674,692」(원본 §71).
 * 숫자 모양은 `lib/money.won` 한 곳이 만들고 여기서는 앞말만 붙인다. null 은 0 이 아니다 — 「가려짐」이다.
 */
export function execWon(n: number | null | undefined): string {
  if (n === null || n === undefined) return MASKED;
  return n < 0 ? `₩-${won(-n, { unit: false })}` : `₩${won(n, { unit: false })}`;
}

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

/** 타일 값 — 서버가 지은 글(「없음」)이 있으면 그것, 금액이면 원화, 건수면 「N건」 */
function tileValue(t: Tile): string {
  if (t.display) return t.display;
  if (t.unit === '원') return execWon(t.value);
  return t.value === null ? MASKED : `${t.value}건`;
}

export function ExecAreaCard({ area, memo, onMemoChange, memoDisabled, onGo, className }: {
  area: ExecArea;
  memo: string;
  onMemoChange: (next: string) => void;
  memoDisabled: boolean;
  onGo: () => void;
  className?: string;
}): ReactNode {
  const color = AREA_COLOR[area.key] ?? { dot: 'bg-fg-subtle', border: 'border-line' };
  const headId = `exec-area-${area.key}`;
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

      <div className="mt-auto border-t border-line px-3.5 py-2.5">
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
