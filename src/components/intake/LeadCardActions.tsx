/** @file-guide
 * 목적: LeadCardActions.tsx — LeadCardActions, LeadCardFocus (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §23 카드 아래의 단계별 단추 줄 (23-14 · wave 6) — 원본 컷 「2차 진행 · 보류 · 등록 · 실패 · 연장 +2일 · 사후 관리 · 되살리기」.
 *
 * **서는 단추와 낱말은 서버가 준 `lead.cardActions` 그대로다** — 화면은 단계를 보고 단추를 고르지 않는다(D-R18 · D-R39).
 * 단계를 옮기는 단추의 도착지도 서버의 `to`(언제나 그 건의 `nextStages` 안)라 카드가 새 전이를 만들지 않는다.
 * 단추마다 **이미 있는 길**로 간다 — 입력 없이 끝나는 셋(연장 +2일 · 스케줄에 N건 만들기 · 단계 이동/되살리기)은 여기서 부르고,
 * 입력이 필요한 것(실패의 사유 — 중단 지점은 서버가 단계에서 판정 · N-87 · 2차/진단 일정 · 접촉 기록 · 되살릴 단계가 미분류)은 상세 서랍의 그 칸을 연다(`onOpen`) ·
 * 등록은 등록 확정 창(`onEnroll`). 단계 이동과 되살리기는 서랍과 같이 **두 번 눌러야** 한다(「한 번 더 누르면 …」).
 * 거절(409)은 서버 문장 그대로 단추 줄 아래에 선다. 카드 몸통 단추와 **형제**로 놓인다 — 단추 안에 단추를 두지 않는다(접근성).
 */
'use client';
import { useState } from 'react';
import { Banner, Button, type ButtonVariant } from '../ui';
import { apiMessage } from '@/api/client';
import { useExtendLeadHold, useMoveLeadStage, useResumeLead, useScheduleLeadAppts } from '@/api/queries';
import type { Lead, LeadStageMove } from '@/api/types';

type CardAction = NonNullable<Lead['cardActions']>[number];
/** 서랍의 어느 칸을 열지 — 입력이 필요한 단추만 쓴다 */
export type LeadCardFocus = 'appt' | 'fail' | 'touch' | 'detail' | 'resume';

/** 단추 모양만 화면이 정한다 — 원본 컷의 초록 채움(등록 · 되살리기)과 흰 바탕(나머지) · 뜻과 낱말은 서버 것 */
const LOOK: Partial<Record<string, ButtonVariant>> = { enroll: 'success', resume: 'success' };

export interface LeadCardActionsProps {
  lead: Lead;
  onOpen: (focus: LeadCardFocus) => void;
  onEnroll: () => void;
  onDone?: (message: string) => void;
}

export function LeadCardActions({ lead, onOpen, onEnroll, onDone }: LeadCardActionsProps) {
  const move = useMoveLeadStage();
  const resume = useResumeLead();
  const extend = useExtendLeadHold();
  const schedule = useScheduleLeadAppts();
  /** 한 번 누른 단추(단계 이동 · 되살리기) — 한 번 더 눌러야 부른다 */
  const [armed, setArmed] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const actions = lead.cardActions ?? [];
  if (!actions.length) return null;
  const busy = move.isPending || resume.isPending || extend.isPending || schedule.isPending;
  const fail = (e: unknown) => setErr(apiMessage(e));

  const run = (a: CardAction, id: string) => {
    setErr(null);
    if (a.key === 'enroll') { onEnroll(); return; }
    if (a.key === 'appt' || a.key === 'fail' || a.key === 'touch' || a.key === 'detail') { onOpen(a.key); return; }
    if (a.key === 'extend') {
      extend.mutate({ id: lead.id }, { onSuccess: (row) => onDone?.(`${row.name} 재확인 날짜를 ${row.recheckOn ?? ''}(으)로 늘렸습니다`), onError: fail });
      return;
    }
    if (a.key === 'schedule') {
      schedule.mutate({ id: lead.id }, { onSuccess: (r) => onDone?.(`${lead.name} — 시간표에 ${r.created}건 만들었습니다`), onError: fail });
      return;
    }
    // 되살릴 단계를 서버가 판정하지 못한 옛 건(미분류)은 서랍에서 단계를 고른다 — 화면이 짓지 않는다(N-25)
    if (a.key === 'resume' && !lead.revivalStage) { onOpen('resume'); return; }
    if (armed !== id) { setArmed(id); return; }
    setArmed(null);
    if (a.key === 'move' && a.to) {
      const to = a.to as LeadStageMove['to'];
      const where = lead.nextStages.find((s) => s.key === a.to)?.label ?? a.label;
      move.mutate({ id: lead.id, to }, { onSuccess: (row) => onDone?.(`${row.name} → ${where} — 도달 기록에 남겼습니다`), onError: fail });
    } else if (a.key === 'resume') {
      resume.mutate({ id: lead.id }, { onSuccess: (row) => onDone?.(`${row.name} 되살렸습니다`), onError: fail });
    }
  };

  return (
    <div role="group" aria-label={`${lead.name} 카드 단추`} className="mt-1.5 flex flex-wrap gap-1">
      {actions.map((a) => {
        const id = `${a.key}:${a.to ?? ''}`;
        const on = armed === id;
        return (
          <Button key={id} type="button" size="sm" disabled={busy} className="grow basis-0 whitespace-nowrap px-2"
            variant={on ? 'primary' : (LOOK[a.key] ?? 'secondary')} onClick={() => run(a, id)}>
            {on ? `한 번 더 누르면 ${a.label}` : a.label}
          </Button>
        );
      })}
      {err ? <Banner tone="danger" className="basis-full">{err}</Banner> : null}
    </div>
  );
}
