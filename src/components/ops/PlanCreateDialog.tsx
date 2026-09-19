/** @file-guide
 * 목적: PlanCreateDialog.tsx — PlanCreateButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §61 「+ 기획 올리기」 (C96 · N-46 ③).
 *
 * **단계를 고르지 않는다** — 올린 기획은 언제나 첫 칸이다. 화면이 단계를 정하면 전이표가 두 벌이 되고,
 * 단계를 옮기는 길은 §61 보드와 §65 결재다 (C90 「+ 신규 문의」와 같은 규약).
 * 기한은 **제안**이다 — 대표가 승인해야 §62 기한 표에 서고 최종 결재가 열린다 (C56).
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Select, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useCreatePlan, useMeta } from '@/api/queries';
import type { PlanCreate, PlanCreateResult } from '@/api/types';

export interface PlanCreateButtonProps {
  /** 단추가 서는지도 서버가 정한다 (D-R39) */
  can: boolean;
  onDone?: (result: PlanCreateResult) => void;
}

export function PlanCreateButton({ can, onDone }: PlanCreateButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const meta = useMeta(open);
  const write = useCreatePlan();
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [ask, setAsk] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(''); setGoal(''); setAsk(''); setOwnerId(''); setDueOn(''); setErr(null);
  }, [open]);

  const pending = write.isPending;
  const canSubmit = title.trim().length > 0 && !pending;

  const submit = () => {
    if (!canSubmit) return;
    const body: PlanCreate = {
      title: title.trim(),
      ...(goal.trim() ? { goal: goal.trim() } : {}),
      ...(ask.trim() ? { ask: ask.trim() } : {}),
      ...(ownerId ? { ownerId: Number(ownerId) } : {}),
      ...(dueOn ? { dueOn } : {}),
    };
    setErr(null);
    write.mutate(body, {
      onSuccess: (r) => { setOpen(false); onDone?.(r); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  if (!can) return null;
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>+ 기획 올리기</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="기획 올리기"
        width={560}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" onClick={submit} disabled={!canSubmit}>{pending ? '올리는 중…' : '올리기'}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor={`${id}-title`}>제목</Label>
            <Input id={`${id}-title`} value={title} maxLength={120} disabled={pending}
              onChange={(e) => setTitle(e.target.value)} placeholder="겨울 특강 개설" />
          </div>
          <div>
            <Label htmlFor={`${id}-goal`}>무엇을 이루려는가</Label>
            <Textarea id={`${id}-goal`} value={goal} maxLength={2000} disabled={pending}
              onChange={(e) => setGoal(e.target.value)} placeholder="목표를 한두 줄로" />
          </div>
          <div>
            <Label htmlFor={`${id}-ask`}>무엇이 필요한가</Label>
            <Textarea id={`${id}-ask`} value={ask} maxLength={2000} disabled={pending}
              onChange={(e) => setAsk(e.target.value)} placeholder="예산 · 사람 · 결정" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-owner`} hint="정하면 알림이 갑니다">담당</Label>
              <Select id={`${id}-owner`} value={ownerId} disabled={pending} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">나</option>
                {(meta.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-due`} hint="대표가 승인해야 섭니다">기한 제안</Label>
              <Input id={`${id}-due`} type="date" value={dueOn} disabled={pending} onChange={(e) => setDueOn(e.target.value)} />
            </div>
          </div>
          {err ? <Banner tone="danger">{err}</Banner> : null}
          <p className="text-[11px] text-fg-subtle">올리면 §61 첫 칸에 섭니다 — 검토로 옮기는 것은 보드에서 합니다.</p>
        </div>
      </Dialog>
    </>
  );
}
