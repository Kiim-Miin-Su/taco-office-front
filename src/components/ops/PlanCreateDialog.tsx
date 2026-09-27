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
 *
 * **공개 범위**(W11 · N-72) — 원문 두 값(전체 공개 · 지정 공개)만 고른다. 낱말은 운영 응답의 `planShares` 이고(D-R18)
 * 기본은 첫 값(전체 공개)이다 — 서버도 안 보내면 그것으로 둔다. 지정 공개일 때만 볼 사람을 보낸다(아니면 서버가 409).
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Checkbox, Dialog, Input, Label, Segmented, Select, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useCreatePlan, useMeta } from '@/api/queries';
import type { PlanCreate, PlanCreateResult, PlanShareWord } from '@/api/types';

export interface PlanCreateButtonProps {
  /** 단추가 서는지도 서버가 정한다 (D-R39) */
  can: boolean;
  /** 공개 범위 두 값의 낱말 — 운영 응답의 `planShares` (N-72 · D-R18). 없으면 고르는 칸이 서지 않고 서버 기본값(전체 공개)이다 */
  shareWords?: readonly PlanShareWord[];
  onDone?: (result: PlanCreateResult) => void;
}

export function PlanCreateButton({ can, shareWords = [], onDone }: PlanCreateButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const meta = useMeta(open);
  const write = useCreatePlan();
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [ask, setAsk] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [share, setShare] = useState<PlanShareWord['key'] | ''>('');
  const [picks, setPicks] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(''); setGoal(''); setAsk(''); setOwnerId(''); setDueOn(''); setShare(''); setPicks([]); setErr(null);
  }, [open]);
  // 고르지 않았으면 첫 값(전체 공개)이다 — 서버 기본값과 같다
  const shareValue = share || shareWords[0]?.key || '';

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
      ...(shareValue ? { share: shareValue } : {}),
      ...(shareValue === 'picked' ? { pickIds: picks } : {}),
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
      {/* 원문 §61 속 갈래 줄 오른쪽 끝의 갈색 주 단추 (x5 · C-7) */}
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>+ 기획 올리기</Button>
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
          {shareWords.length ? (
            <div>
              <Label>공개 범위</Label>
              <Segmented ariaLabel="공개 범위" value={shareValue} disabled={pending}
                options={shareWords.map((w) => ({ value: w.key, label: w.label }))} onChange={setShare} />
              {shareValue === 'picked' ? (
                <fieldset className="mt-2">
                  <legend className="text-[11px] text-fg-subtle">볼 사람 — 담당과 결재권자는 늘 봅니다</legend>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {(meta.data?.staff ?? []).map((s) => (
                      <label key={s.id} className="flex items-center gap-1 text-[12px]">
                        <Checkbox checked={picks.includes(s.id)} disabled={pending} aria-label={`${s.name} 지정`}
                          onChange={(e) => {
                            const on = e.currentTarget.checked;
                            setPicks((prev) => (on ? [...prev, s.id] : prev.filter((v) => v !== s.id)));
                          }} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </div>
          ) : null}
          {err ? <Banner tone="danger">{err}</Banner> : null}
          {/* S6 전에는 「보드에서 옮깁니다」라 적었는데 **옮기는 길이 아예 없었다** — 없는 단추를 가리키고 있었다 */}
          <p className="text-[11px] text-fg-subtle">올리면 기획 보드의 첫 칸에 섭니다 — 적어서 대표께 올리는 것은 보고서에서 합니다.</p>
        </div>
      </Dialog>
    </>
  );
}
