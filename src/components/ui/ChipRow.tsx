/** @file-guide
 * 목적: ChipRow.tsx — ChipButton, ChipOption, ChipRow (ui)
 * 책임/재사용: props와 공용 시각 토큰으로 표현한다. 업무 권한·정산 판정, Axios 호출, 서버 캐시를 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * UI/ChipRow — **누르는 칩** 하나와 그 줄 (C96).
 *
 * 원문은 같은 모양을 네 군데서 쓴다 — §63 회의 종류 · §64 담당 · §67 컴플레인 갈래 · 회의 창의 참석자.
 * 네 곳이 각자 `<button>` 에 테두리 클래스를 적어 두면 **눌린 칩 모양이 네 벌**이 된다
 * (`Segmented` 를 만든 것과 같은 까닭이다 — 서랍에서 손으로 그렸다가 활성 알약이 두 벌이 됐다).
 *
 * **건수는 받아서 그린다.** 이 줄은 아무것도 세지 않는다 — 세는 일은 서버다(D-R37).
 * 0 건 칸도 지우지 않는다: 칩 줄은 **어휘**이지 데이터가 아니다(C66).
 */
import type { ReactNode } from 'react';
import { Chip, type Tone } from './Chip';
import { cn } from './cn';

export function ChipButton({
  pressed, disabled, onClick, children, tone = 'neutral', title, className,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: Tone;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn('rounded-full disabled:opacity-50', pressed ? 'ring-2 ring-primary ring-offset-1 ring-offset-bg' : '', className)}
    >
      <Chip tone={pressed ? 'info' : tone} styleKind={pressed ? 'solid' : 'outline'}>{children}</Chip>
    </button>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** 서버가 센 건수 — 없으면 안 적는다 (D-R37) */
  count?: number;
}

/**
 * 하나만 고르는 칩 줄. `value` 가 `''` 면 「전체」가 눌린 것이다.
 */
export function ChipRow<T extends string>({
  ariaLabel, options, value, onChange, allLabel = '전체', allCount, disabled = false, className,
}: {
  ariaLabel: string;
  options: ReadonlyArray<ChipOption<T>>;
  value: T | '';
  onChange: (next: T | '') => void;
  allLabel?: string;
  allCount?: number;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <ChipButton pressed={value === ''} disabled={disabled} onClick={() => onChange('')}>
        {allLabel}{allCount === undefined ? '' : ` ${allCount}`}
      </ChipButton>
      {options.map((o) => (
        <ChipButton key={o.value} pressed={value === o.value} disabled={disabled}
          onClick={() => onChange(value === o.value ? '' : o.value)}>
          {o.label}{o.count === undefined ? '' : ` ${o.count}`}
        </ChipButton>
      ))}
    </div>
  );
}
