/** @file-guide
 * 목적: CancelLessonDialog.tsx — CancelLessonInput, CancelLessonDialog (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §12 「휴강」 창 — 사유 · 처리(이월/차감/보강 이관) · 메모 · 그날 전체 (C92-a · 테스트 시나리오 C-30~C-33).
 *
 * **낱말과 정책은 서버 것이다** (D-R18 · D-R39). 사유 목록·처리 목록·「차감은 학생 결석에만」은
 * `GET /meta` 의 `cancelReasons[].deductible` · `cancelTreats[].sub` 에서 오고, 이 창은 그 표를
 * 그리기만 한다. 차감 단추가 잠기는 것도 화면의 판단이 아니라 서버가 준 `deductible` 이다 —
 * 서버는 같은 판정을 한 번 더 하므로(400 `CANCEL_DEDUCT_FORBIDDEN`) 화면이 틀려도 틀린 저장은 없다.
 *
 * 모달은 공용 `Dialog`, 입력은 `Select`·`Textarea`·`Checkbox` 를 그대로 쓴다 — 새 모양을 만들지 않는다.
 * 수업 상세(§12)와 「그날 전체 휴강」이 같은 창을 쓴다.
 */
'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Banner, Button, Checkbox, Dialog, Label, Select, Textarea } from '../ui';
import type { Meta } from '@/api/types';

export type CancelReasonOption = Meta['cancelReasons'][number];
export type CancelTreatOption = Meta['cancelTreats'][number];

export interface CancelLessonInput {
  cancelKind: CancelReasonOption['key'];
  cancelTreat: CancelTreatOption['key'];
  memo?: string;
  /** 「그날 전체 휴강」을 켰다 — 부르는 쪽이 `POST /schedule/day-cancel` 로 보낸다 */
  wholeDay: boolean;
}

export interface CancelLessonDialogProps {
  open: boolean;
  /** 창 머리에 적는 날짜·수업 이름 */
  title: ReactNode;
  /** 코드표 — `useMeta().data?.cancelReasons` */
  reasons: CancelReasonOption[] | undefined;
  /** 코드표 — `useMeta().data?.cancelTreats` */
  treats: CancelTreatOption[] | undefined;
  /** 「그날 전체 휴강」 체크를 보여 줄지 — 관리자 화면(§12)만 */
  allowWholeDay?: boolean;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: CancelLessonInput) => void;
  onClose: () => void;
}

export function CancelLessonDialog({
  open, title, reasons, treats, allowWholeDay = false, pending = false, error, onSubmit, onClose,
}: CancelLessonDialogProps) {
  const id = useId();
  const [kind, setKind] = useState('');
  const [treat, setTreat] = useState('');
  const [memo, setMemo] = useState('');
  const [wholeDay, setWholeDay] = useState(false);

  // 열 때마다 비운다 — 지난 휴강의 사유가 다음 창에 남아 있으면 그대로 저장된다
  useEffect(() => {
    if (!open) return;
    setKind('');
    setTreat(treats?.[0]?.key ?? '');
    setMemo('');
    setWholeDay(false);
  }, [open, treats]);

  const reason = reasons?.find((r) => r.key === kind) ?? null;
  const deductible = reason?.deductible === true;
  const treatRows = treats ?? [];
  // 사유를 바꿔 차감이 막히면 처리를 기본(첫 줄 = 이월)으로 되돌린다 — 잠긴 값을 들고 저장하지 않게
  useEffect(() => {
    if (!deductible && treat === 'deduct') setTreat(treatRows[0]?.key ?? '');
  }, [deductible, treat, treatRows]);

  // 보내는 값은 코드표의 줄에서 다시 꺼낸다 — select 의 문자열을 그대로 믿지 않는다
  const chosenTreat = treatRows.find((t) => t.key === treat) ?? null;
  const ready = !!reason && !!chosenTreat && !pending;
  const submit = () => {
    if (!reason || !chosenTreat || pending) return;
    onSubmit({
      cancelKind: reason.key,
      cancelTreat: chosenTreat.key,
      memo: memo.trim() || undefined,
      wholeDay: allowWholeDay && wholeDay,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>취소 (Esc)</Button>
          <Button type="button" variant="danger" onClick={submit} disabled={!ready}>
            {pending ? '처리 중…' : wholeDay && allowWholeDay ? '그날 전체 휴강' : '휴강'}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor={`${id}-kind`}>사유</Label>
          <Select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value)} disabled={pending}>
            <option value="">사유를 고르세요…</option>
            {(reasons ?? []).map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </Select>
          {!reasons?.length ? <p className="mt-1 text-[11px] text-fg-subtle">코드표를 읽는 중입니다…</p> : null}
        </div>

        <fieldset>
          <legend className="mb-1 text-[11px] font-bold text-fg-subtle">처리</legend>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="처리">
            {treatRows.map((t) => {
              // 차감 잠금은 서버의 deductible 이다 — 화면이 사유 코드를 비교하지 않는다 (D-R39)
              const locked = t.key === 'deduct' && !deductible;
              const checked = treat === t.key;
              return (
                <label
                  key={t.key}
                  className={[
                    'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors',
                    checked ? 'border-blue bg-blue/5' : 'border-line',
                    locked ? 'cursor-not-allowed opacity-50' : 'hover:border-blue',
                  ].join(' ')}
                  title={locked ? '차감은 학생 결석에만 할 수 있습니다' : undefined}
                >
                  <input
                    type="radio"
                    name={`${id}-treat`}
                    value={t.key}
                    checked={checked}
                    disabled={locked || pending}
                    onChange={() => setTreat(t.key)}
                    className="mt-0.5 h-4 w-4 accent-blue"
                  />
                  <span className="flex flex-col">
                    <span className="text-[12.5px] font-bold text-fg">{t.label}</span>
                    {/* 부제도 서버의 낱말이다 — 「이번 달 청구에서 빼고 다음 달로 넘깁니다 (기본)」 */}
                    <span className="text-[11px] text-fg-subtle">{t.sub}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <Label htmlFor={`${id}-memo`} hint={`${memo.length} / 500`}>메모</Label>
          <Textarea
            id={`${id}-memo`}
            value={memo}
            maxLength={500}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="아침에 발열로 연락 …"
            disabled={pending}
            className="min-h-[72px]"
          />
        </div>

        {allowWholeDay ? (
          <Checkbox
            label={<span>그날 <b>모든 수업</b>을 같은 사유로 휴강 — 공휴일 · 학원 전체 휴원 (한 번에 처리되고, 하나라도 막히면 전부 되돌아갑니다)</span>}
            checked={wholeDay}
            disabled={pending}
            onChange={(e) => setWholeDay(e.target.checked)}
          />
        ) : null}

        {error ? <div role="alert"><Banner tone="danger">{error}</Banner></div> : null}
      </div>
    </Dialog>
  );
}
