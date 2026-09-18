/** @file-guide
 * 목적: StudentWithdrawDialog.tsx — StudentWithdrawDialog, endedLabel (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §79 학생 카드의 「수강 종료」 창 (C94-c · 테스트 시나리오 H-80 · N-135 · N-136).
 *
 * 화면이 보내는 것은 **날짜 · 범위(이 수업만/모든 수업) · 사유**뿐이다. 잔여 회차·청구서 변화·환불액은
 * 서버가 **같은 트랜잭션을 돌리고 되돌린 미리보기**로 준다(D-R37) — 화면이 회차를 세거나 단가를 곱하면
 * 미리 본 값과 실제로 돌려주는 값이 갈린다. 창은 그 값을 그리고, 「되돌릴 수 없다」를 말한다.
 * 모달은 공용 `Dialog`, 입력은 `Input`·`Textarea` — `StudentPauseDialog` 와 같은 모양이다.
 */
'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Banner, Button, Chip, Dialog, Input, Label, Select, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useWithdrawStudent } from '@/api/queries';
import type { WithdrawResult } from '@/api/types';
import { won } from '@/lib/money';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const md = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;

/** 「종료 9/20」 · 「종료 예정 9/30」 — 카드 칩과 창이 같은 낱말을 쓴다 */
export function endedLabel(endedOn: string, ended: boolean): string {
  return `${ended ? '종료' : '종료 예정'} ${md(endedOn)}`;
}

export interface StudentWithdrawDialogProps {
  open: boolean;
  title: ReactNode;
  student: { id: number; name: string };
  /** 열어 둔 수업 — 「이 수업만」의 대상. 없으면(컴플레인에서 열 때 · C93 · J-99) 「이 학생의 모든 수업」만 */
  serId?: number | null;
  /** 기본 종료일 — 보통 열어 둔 회차의 날짜 */
  defaultEndedOn?: string;
  /** 기본 사유 — 컴플레인에서 열면 「컴플레인 #N · 내용」 (N-135 ① 의 cplId 칸 전까지는 사유 글로만 잇는다) */
  defaultReason?: string;
  onClose: () => void;
  /** 처리가 끝난 뒤 — 부모가 창을 닫고 갱신한다 */
  onDone?: (result: WithdrawResult) => void;
}

export function StudentWithdrawDialog({ open, title, student, serId, defaultEndedOn, defaultReason, onClose, onDone }: StudentWithdrawDialogProps) {
  const id = useId();
  const write = useWithdrawStudent();
  const [endedOn, setEndedOn] = useState('');
  const [scope, setScope] = useState<'this' | 'all'>('this');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<WithdrawResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 열 때마다 비운다 — 지난 창의 날짜·미리보기가 남아 있으면 그대로 처리된다
  useEffect(() => {
    if (!open) return;
    setEndedOn(defaultEndedOn ?? '');
    setScope(serId ? 'this' : 'all');
    setReason(defaultReason ?? '');
    setPreview(null);
    setErr(null);
  }, [open, defaultEndedOn, defaultReason, serId]);

  const body = () => ({ studentId: student.id, endedOn, serIds: scope === 'this' && serId ? [serId] : undefined, reason: reason.trim() || undefined });
  const dateOk = ISO.test(endedOn);

  // 날짜·범위가 정해질 때마다 서버에 미리 보인다 — 값은 서버 것이다
  useEffect(() => {
    if (!open || !dateOk) { setPreview(null); return; }
    let alive = true;
    setErr(null);
    write.mutate({ kind: 'preview', body: { studentId: student.id, endedOn, serIds: scope === 'this' && serId ? [serId] : undefined } }, {
      onSuccess: (r) => { if (alive) setPreview(r); },
      onError: (e) => { if (alive) { setPreview(null); setErr(apiMessage(e)); } },
    });
    return () => { alive = false; };
    // write 는 매 렌더 새 객체라 의존성에서 뺀다 — 날짜·범위·열림만 본다 (이 저장소는 exhaustive-deps 규칙을 켜지 않았다)
  }, [open, dateOk, endedOn, scope, student.id, serId]);

  const pending = write.isPending;
  const ready = dateOk && !!preview && !pending;
  const submit = () => {
    if (!ready) return;
    setErr(null);
    write.mutate({ kind: 'withdraw', body: body() }, {
      onSuccess: (r) => { onDone?.(r); onClose(); },
      onError: (e) => setErr(apiMessage(e)),
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
          <Button type="button" variant="danger" onClick={submit} disabled={!ready}>{pending ? '처리 중…' : '수강 종료'}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${id}-on`} hint="이 날까지 수업">마지막 수업일</Label>
            <Input id={`${id}-on`} type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} disabled={pending} />
          </div>
          <div>
            <Label htmlFor={`${id}-scope`}>범위</Label>
            <Select id={`${id}-scope`} value={scope} onChange={(e) => setScope(e.target.value as 'this' | 'all')} disabled={pending || !serId}>
              {serId ? <option value="this">이 수업만</option> : null}
              <option value="all">이 학생의 모든 수업</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor={`${id}-reason`} hint={`${reason.length} / 200`}>사유</Label>
          <Textarea id={`${id}-reason`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} disabled={pending} placeholder="예: 이사 · 학부모 요청" />
        </div>

        {/* 미리보기 — 서버가 같은 트랜잭션을 돌리고 되돌린 값. 화면이 세지 않는다 */}
        {preview ? (
          <section aria-label="종료 미리보기" className="rounded-lg border border-line bg-inset p-3 text-[12px]">
            <p className="mb-1.5 font-bold text-fg">
              {md(preview.endedOn)}까지 수업 · 남은 회차 <span className="text-red">{preview.remainingCount}회</span> 정리
            </p>
            <ul className="flex flex-col gap-1">
              {preview.series.map((s) => (
                <li key={s.serId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-fg-2">{s.title ?? s.subKey ?? s.kindKey}</span>
                  <Chip tone={s.remainingCount > 0 ? 'warning' : 'neutral'}>남은 {s.remainingCount}회</Chip>
                </li>
              ))}
            </ul>
            {preview.invoices.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                {preview.invoices.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-fg-2">{i.yearMonth} 청구서 · {i.removedCount}회 빠짐{i.voided ? ' · 취소로 접힘' : ''}</span>
                    <span className="font-bold text-fg">
                      {won(i.amountBefore)} → {won(i.amountAfter)}
                      {i.refund ? <span className="ml-2 text-red">환불 {won(i.refund)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 border-t border-line pt-2 text-fg-subtle">청구서에서 뺄 것이 없습니다 — 이 뒤의 회차는 아직 청구되지 않았습니다.</p>
            )}
            <p className="mt-2 text-[12.5px] font-bold text-fg">
              환불 합계 {preview.canSeeAmounts ? won(preview.refundTotal) : '가려짐'}
            </p>
          </section>
        ) : dateOk && !err ? (
          <p className="text-[11px] text-fg-subtle">잔여 회차와 환불액을 서버에 묻는 중…</p>
        ) : null}

        <p className="text-[11px] text-fg-subtle">
          그 날까지의 회차·청구는 그대로 남고(이력), 그 뒤 회차에서만 빠집니다. 그룹 수업이면 남은 학생의 단가가 그 뒤부터 다시 잡힙니다.
          환불은 받은 돈에서 돌려줄 만큼을 장부에 음수 줄로 남깁니다. <b>되돌릴 수 없습니다</b> — 다시 다니려면 새 수업으로 등록합니다.
        </p>
        {err ? <Banner tone="danger">{err}</Banner> : null}
      </div>
    </Dialog>
  );
}
