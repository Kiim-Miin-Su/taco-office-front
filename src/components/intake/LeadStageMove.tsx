/** @file-guide
 * 목적: LeadStageMove.tsx — LeadStageMove (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §23 카드의 「다음 단계 →」 (C90 · N-45 · 테스트 시나리오 A-02).
 *
 * 갈 수 있는 곳은 서버가 준 `lead.nextStages` 뿐이다 — 화면이 전이표를 들면 서버와 갈린다(D-R18 · D-R39).
 * 비어 있으면(등록 · 등록 실패) 단추가 아예 서지 않는다 — 끝난 결과는 등록 확정·되살리기가 각자의 길이다.
 * 2단 확정은 §24 실패 지정과 같은 모양(한 번 더 누르면). 거절(409)은 서버 문장 그대로.
 * 부모는 `key={`${lead.id}-${lead.stage}`}` 로 세운다 — 건이 바뀌면 선택과 확정 상태가 새로 시작한다.
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Label, Select } from '../ui';
import { apiMessage } from '@/api/client';
import { useMoveLeadStage } from '@/api/queries';
import type { Lead, LeadStageMove as LeadStageMoveBody } from '@/api/types';

export interface LeadStageMoveProps {
  lead: Lead;
  onDone?: (row: Lead) => void;
}

export function LeadStageMove({ lead, onDone }: LeadStageMoveProps) {
  const move = useMoveLeadStage();
  const [to, setTo] = useState<LeadStageMoveBody['to'] | ''>('');
  const [armed, setArmed] = useState(false);
  // 건이나 단계가 바뀌면 부모가 key 로 다시 세운다 — 옛 선택이 새 건에 남지 않는다

  if (!lead.nextStages.length) return null;
  const pending = move.isPending;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-inset px-3 py-2">
      <div className="w-52">
        <Label htmlFor={`lead-next-${lead.id}`} hint="갈 수 있는 곳만 섭니다 (서버 전이표)">다음 단계</Label>
        <Select id={`lead-next-${lead.id}`} value={to} disabled={pending} onChange={(e) => { setTo(e.target.value as LeadStageMoveBody['to'] | ''); setArmed(false); }}>
          <option value="">단계 선택</option>
          {lead.nextStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
      </div>
      <Button
        size="sm"
        variant={armed ? 'primary' : 'secondary'}
        disabled={pending || !to}
        title={!to ? '옮길 단계를 먼저 고릅니다' : undefined}
        onClick={() => {
          if (armed && to) {
            move.mutate({ id: lead.id, to }, {
              onSuccess: (row) => onDone?.(row),
              onSettled: () => setArmed(false),
            });
          } else setArmed(true);
        }}
      >
        {pending ? '옮기는 중…' : armed ? '한 번 더 누르면 이동' : '다음 단계 →'}
      </Button>
      <span className="text-[11px] text-fg-subtle">옮기면 도달 기록에 한 줄이 남습니다 — §71 퍼널이 그 기록으로 셉니다 (N-45).</span>
      {move.isError ? <Banner tone="danger" className="basis-full">{apiMessage(move.error)}</Banner> : null}
    </div>
  );
}
