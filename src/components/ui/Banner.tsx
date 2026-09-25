/** @file-guide
 * 목적: Banner.tsx — Banner (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Data/Banner — Figma `Data/Banner` (tone 4). 규칙을 화면에 적어 두는 띠.
 *
 * §86 알림 상자는 **굵은 색 제목 + 점 목록**이다(「✓ 겹치는 것이 없습니다」 · 「• 08-21 16:00 MAP Reading」).
 * `title`·`items` 를 안 넣으면 지금처럼 한 줄 글자 띠 그대로다.
 */
import type { ReactNode } from 'react';
import { cn } from './cn';
import type { Tone } from './Chip';

const LOOK: Record<Tone, string> = {
  neutral: 'bg-inset text-fg-2 border-line',
  info: 'bg-blue/5 text-fg-2 border-blue/25',
  success: 'bg-green/5 text-fg-2 border-green/25',
  warning: 'bg-amber/5 text-fg-2 border-amber/30',
  danger: 'bg-red/5 text-fg-2 border-red/30',
  purple: 'bg-violet/5 text-fg-2 border-violet/25',
};

/** 제목 글자색 — 띠 바탕이 톤 5% 라 칩 글자와 같은 토큰이면 대비가 선다(tokens.test.ts) */
const TITLE: Record<Tone, string> = {
  neutral: 'text-fg', info: 'text-blue', success: 'text-green',
  warning: 'text-amber', danger: 'text-red', purple: 'text-violet',
};

export function Banner({
  tone = 'info', title, items, children, className,
}: {
  tone?: Tone;
  /** 굵은 톤 색 제목 한 줄(아이콘 글자는 부르는 쪽이 적는다) */
  title?: ReactNode;
  /** 제목 아래 점 목록 */
  items?: ReadonlyArray<ReactNode>;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-[12px] font-medium leading-relaxed', LOOK[tone], className)}>
      {title ? <p className={cn('text-[13px] font-bold', TITLE[tone])}>{title}</p> : null}
      {items && items.length > 0 ? (
        <ul className={cn('list-disc pl-5', title ? 'mt-1' : '')}>
          {items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      ) : null}
      {children}
    </div>
  );
}
