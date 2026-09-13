/** @file-guide
 * 목적: TabCards.tsx — TabCardOption, TabCardsProps, TabCards (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * UI/Tab Cards — 제목 아래 **한 줄이 더 있는** 탭. 원문 §26~§29 컨설팅 탭 머리의 그 상자들이다.
 *
 * 밑줄 `Tabs` 와 다른 물건이다. 밑줄 탭은 「보기」를 바꾸고, 이 상자 탭은 보기를 바꾸면서
 * **그 보기의 한 줄 요약을 같이 보여 준다** — 「회계 · ₩1,300,000 남음」처럼.
 * 그 한 줄을 여기서 만들지 않는다. 서버가 센 숫자를 `sub` 로 받아 그리기만 한다 (D-R37).
 *
 * 색은 토큰에서만 온다 (D-R41) — 고른 탭은 `header`, 뱃지는 `primary`.
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface TabCardOption<T extends string> {
  value: T;
  label: string;
  /** 제목 아래 한 줄 — 서버가 센 요약. 없으면 자리도 비워 둔다. */
  sub?: ReactNode;
  /** 오른쪽 위 동그라미 — 0 이면 달지 않는다(0 을 굳이 보여 줄 이유가 없다). */
  badge?: number;
}

export interface TabCardsProps<T extends string> {
  options: ReadonlyArray<TabCardOption<T>>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /** 탭 묶음의 이름 — 화면에는 안 보이고 보조기기만 읽는다. */
  label?: string;
}

export function TabCards<T extends string>({ options, value, onChange, className, label }: TabCardsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <div key={o.value} className="relative">
            <button
              type="button" role="tab" aria-selected={on}
              onClick={() => onChange(o.value)}
              className={cn(
                'min-w-[104px] rounded-md border px-4 py-2 text-left transition-colors',
                on
                  ? 'border-header bg-header text-card'
                  : 'border-line bg-card text-fg hover:border-fg-subtle',
              )}
            >
              <div className="text-[13px] font-bold leading-tight">{o.label}</div>
              <div className={cn('mt-0.5 text-[11px] leading-tight', on ? 'text-card/70' : 'text-fg-subtle')}>
                {o.sub ?? ' '}
              </div>
            </button>
            {o.badge ? (
              <span
                aria-hidden
                className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-card"
              >
                {o.badge}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
