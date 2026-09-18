/** @file-guide
 * 목적: StudentPauseDialog.tsx — StudentPauseDialog, StudentResumeDialog (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §79 학생 카드의 「휴원」·「복귀」 창 (C92-c · 테스트 시나리오 C-36 · C-37).
 *
 * 휴원은 **회차를 지우는 일이 아니다** — 기간 하나를 적으면 시간표·수업료·명단이 그 기간의 회차를
 * 「그날만 빠짐」과 같은 것으로 읽는다. 복귀는 종료일을 복귀 전날로 당길 뿐이라 회차가 그대로 돌아온다.
 * 겹침(409 PAUSE_OVERLAP)·범위(400 BAD_RANGE)·빠지는 회차 수는 전부 서버 판정이다 — 이 창은 날짜 형식만 본다.
 *
 * 모달은 공용 `Dialog`, 입력은 `Input`·`Textarea` 그대로다 — `CancelLessonDialog` 와 같은 모양이다.
 */
'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Banner, Button, Dialog, Input, Label, Textarea } from '../ui';
import type { StudentPause, StudentPauseWrite, StudentResumeWrite } from '@/api/types';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 「휴원 9/1 ~ 9/30」 · 「휴원 9/1 ~」 — 카드 칩과 창 머리가 같은 낱말을 쓴다 */
export function pauseLabel(p: Pick<StudentPause, 'fromDate' | 'toDate'>): string {
  const md = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
  return `휴원 ${md(p.fromDate)} ~${p.toDate ? ` ${md(p.toDate)}` : ''}`;
}

export interface StudentPauseDialogProps {
  open: boolean;
  /** 창 머리 — 학생 이름 */
  title: ReactNode;
  /** 기본 시작일 — 보통 열어 둔 회차의 날짜 */
  defaultFrom?: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: StudentPauseWrite) => void;
  onClose: () => void;
}

export function StudentPauseDialog({ open, title, defaultFrom, pending = false, error, onSubmit, onClose }: StudentPauseDialogProps) {
  const id = useId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');

  // 열 때마다 비운다 — 지난 창의 기간이 남아 있으면 그대로 저장된다
  useEffect(() => {
    if (!open) return;
    setFrom(defaultFrom ?? '');
    setTo('');
    setReason('');
  }, [open, defaultFrom]);

  const issue = !ISO.test(from) ? '시작일을 고르세요'
    : to && !ISO.test(to) ? '종료일은 YYYY-MM-DD 입니다'
      : to && to < from ? '종료일이 시작일보다 앞입니다'
        : null;
  const ready = !issue && !pending;
  const submit = () => {
    if (!ready) return;
    onSubmit({ fromDate: from, toDate: to || undefined, reason: reason.trim() || undefined });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>취소 (Esc)</Button>
          <Button type="button" variant="danger" onClick={submit} disabled={!ready}>{pending ? '처리 중…' : '휴원'}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${id}-from`}>시작일</Label>
            <Input id={`${id}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={pending} />
          </div>
          <div>
            <Label htmlFor={`${id}-to`} hint="비우면 복귀 전까지">종료일</Label>
            <Input id={`${id}-to`} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} disabled={pending} />
          </div>
        </div>
        {issue && from ? <p className="text-[11px] text-red">{issue}</p> : null}
        <div>
          <Label htmlFor={`${id}-reason`} hint={`${reason.length} / 200`}>사유</Label>
          <Textarea id={`${id}-reason`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} disabled={pending} placeholder="예: 가족 여행 · 시험 준비" />
        </div>
        <p className="text-[11px] text-fg-subtle">
          기간 안의 회차는 학생 시간표와 수업료에서 빠지고, 수업 명단에는 「휴원」으로 남습니다. 회차는 지우지 않습니다 — 복귀하면 그대로 돌아옵니다.
        </p>
        {error ? <Banner tone="danger">{error}</Banner> : null}
      </div>
    </Dialog>
  );
}

export interface StudentResumeDialogProps {
  open: boolean;
  title: ReactNode;
  /** 지금 잡혀 있는 휴원 — 창 머리와 기본 복귀일의 근거 */
  pause: StudentPause | null;
  pending?: boolean;
  error?: string | null;
  onSubmit: (input: StudentResumeWrite) => void;
  onClose: () => void;
}

export function StudentResumeDialog({ open, title, pause, pending = false, error, onSubmit, onClose }: StudentResumeDialogProps) {
  const id = useId();
  const [on, setOn] = useState('');
  useEffect(() => {
    if (!open) return;
    setOn('');
  }, [open]);

  const issue = !ISO.test(on) ? '복귀일을 고르세요'
    : pause && on <= pause.fromDate ? '복귀일은 휴원 시작일 다음 날부터입니다'
      : null;
  const ready = !issue && !pending;
  const submit = () => {
    if (!ready) return;
    onSubmit({ resumeOn: on });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>취소 (Esc)</Button>
          <Button type="button" onClick={submit} disabled={!ready}>{pending ? '처리 중…' : '복귀'}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        {pause ? (
          <p className="text-[12px] text-fg-2">
            {pauseLabel(pause)}{pause.reason ? ` · ${pause.reason}` : ''}
          </p>
        ) : null}
        <div>
          <Label htmlFor={`${id}-on`}>복귀일</Label>
          <Input id={`${id}-on`} type="date" value={on} min={pause?.fromDate} onChange={(e) => setOn(e.target.value)} disabled={pending} />
        </div>
        {issue && on ? <p className="text-[11px] text-red">{issue}</p> : null}
        <p className="text-[11px] text-fg-subtle">복귀일부터 시간표·수업료가 재개됩니다. 휴원 기간은 이력으로 남습니다.</p>
        {error ? <Banner tone="danger">{error}</Banner> : null}
      </div>
    </Dialog>
  );
}
