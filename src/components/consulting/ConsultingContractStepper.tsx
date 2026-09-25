/** @file-guide
 * 목적: ConsultingContractStepper.tsx — ConsultingContractStepper (component) · §30 계약 5단계 스테퍼.
 * 책임/재사용: 서버가 준 단계 낱말(contractSteps)과 지금 단계만 그린다. 단계를 옮기거나 판정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §30 스테퍼 (30-07) — 원 다섯: **끝난 것은 ✓ 초록 · 지금 것은 갈색 번호 · 남은 것은 회색**, 그 아래 이름과 한 줄
 * (「초안을 올립니다 · 누구나 의견을 답니다 · 학부모께 보냅니다 · 스캔본을 받습니다 · 계약금을 받습니다」).
 * 예전에는 막대 다섯 칸과 「1. 계약서 준비」 같은 이름뿐이라 **지금 무엇을 할 차례인지**가 안 보였다.
 *
 * 낱말은 서버의 `contractSteps` 그대로다(D-R18) — 화면이 이름과 한 줄의 짝을 맞추지 않는다.
 * `complete` 는 계약을 지나간 건(진행 · 종료)이다 — 다섯 다 끝난 것으로 그린다.
 */
'use client';
import type { ConsultingDetail } from '@/api/types';
import { cn } from '@/components/ui';

export interface ConsultingContractStepperProps {
  steps: ConsultingDetail['contractSteps'];
  /** 지금 단계(1~5) — 모르면 0 */
  current: number;
  /** 계약을 지나간 건 — 다섯 다 ✓ */
  complete?: boolean;
}

export function ConsultingContractStepper({ steps, current, complete = false }: ConsultingContractStepperProps) {
  const shown = complete ? steps.length : Math.max(0, Math.min(steps.length, current));
  return (
    <ol
      aria-label={`계약 ${shown}/${steps.length}`}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${steps.length || 1}, minmax(0, 1fr))` }}
    >
      {steps.map((s) => {
        const state = complete || s.step < current ? 'done' : s.step === current ? 'now' : 'todo';
        return (
          <li key={s.step} aria-current={state === 'now' ? 'step' : undefined} className="flex min-w-0 flex-col items-center text-center">
            <span
              aria-hidden
              className={cn(
                'grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold',
                state === 'done' ? 'bg-green text-white' : state === 'now' ? 'bg-primary text-white' : 'bg-line-2 text-fg-subtle',
              )}
            >
              {state === 'done' ? '✓' : s.step}
            </span>
            <span className={cn('mt-1.5 text-[12.5px] font-bold', state === 'todo' ? 'text-fg-subtle' : 'text-fg')}>{s.label}</span>
            <span className="text-[10.5px] text-fg-subtle">{s.sub}</span>
          </li>
        );
      })}
    </ol>
  );
}
