/** @file-guide
 * 목적: InvoiceActions.tsx — InvoiceActions (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §53 청구서 줄의 「전달」·「취소」 (C94-a · 테스트 시나리오 H-76 · N-139).
 *
 * 단추가 서는지는 **서버가 준 `canDeliver`·`canVoid`** 다 (D-R39) — 화면이 상태 낱말이나 역할을 다시 비교하지 않는다.
 * 취소는 사유가 필수이고 지우는 것이 아니라 void 로 접는다 — 창이 그 사실을 말한다.
 * 모달은 공용 `Dialog`, 입력은 `Textarea` 그대로다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Dialog, Label, Textarea } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useInvoiceAction } from '@/api/queries';
import type { Invoice } from '@/api/types';

export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const id = useId();
  const act = useInvoiceAction();
  const [dialog, setDialog] = useState<'void' | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (dialog === 'void') { setReason(''); setErr(null); } }, [dialog]);
  /* 취소가 막혀 있어도 **왜 막혔는지**는 말한다 (S5) — 단추를 통째로 숨기면 「이 줄만 왜 다르지」가 된다.
     서버가 준 문장 그대로다(마감 · 입금 붙음). 권한 자체가 없으면 이유도 없고 자리도 없다. */
  const voidBlocked = invoice.voidBlockedReason ?? null;
  if (!invoice.canDeliver && !invoice.canVoid && !voidBlocked) {
    return invoice.voidReason ? <span className="text-[11px] text-fg-subtle" title={invoice.voidReason}>취소 · {invoice.voidReason}</span> : null;
  }
  return (
    <span className="flex justify-end gap-1">
      {invoice.canDeliver ? (
        <Button size="sm" variant="ghost" disabled={act.isPending}
          title="학부모께 보냈다고 표시합니다 — §53 ③"
          onClick={() => act.mutate({ kind: 'deliver', id: invoice.id }, { onError: (e) => setErr(apiMessage(e)) })}>
          전달
        </Button>
      ) : null}
      {invoice.canVoid ? (
        <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => setDialog('void')}>취소</Button>
      ) : voidBlocked ? (
        <Button size="sm" variant="ghost" disabled title={voidBlocked}>취소</Button>
      ) : null}
      {err && dialog === null ? <span className="text-[11px] text-red">{err}</span> : null}
      <Dialog
        open={dialog === 'void'}
        onClose={() => setDialog(null)}
        title={`청구서 취소 — ${invoice.studentName} · ${invoice.title}`}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={act.isPending}>취소 (Esc)</Button>
            <Button type="button" variant="danger" disabled={act.isPending || !reason.trim()}
              onClick={() => act.mutate(
                { kind: 'void', id: invoice.id, body: { reason: reason.trim() } },
                { onSuccess: () => setDialog(null), onError: (e) => setErr(apiMessage(e)) },
              )}>
              {act.isPending ? '처리 중…' : '청구서 취소'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-fg-2">지우지 않고 「취소」로 접습니다 — 줄과 발행일, 사유가 남고 미수 집계에서 빠집니다. 다시 내려면 새로 발행하세요.</p>
          <div>
            <Label htmlFor={`${id}-reason`} hint={`${reason.length} / 200`}>취소 사유</Label>
            <Textarea id={`${id}-reason`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} disabled={act.isPending} placeholder="예: 단가를 잘못 넣어 다시 낸다" />
          </div>
          {err ? <Banner tone="danger">{err}</Banner> : null}
        </div>
      </Dialog>
    </span>
  );
}
