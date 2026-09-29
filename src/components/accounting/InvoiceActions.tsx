/** @file-guide
 * 목적: InvoiceActions.tsx — InvoiceActions (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §53 청구서 줄의 「전달」·「학부모 안내」·「취소」 (C94-a · 테스트 시나리오 H-76 · N-139).
 *
 * 단추가 서는지는 **서버가 준 `canDeliver`·`canVoid`·`notice`** 다 (D-R39) — 화면이 상태 낱말이나 역할을 다시 비교하지 않는다.
 * 「전달」이 만든 학부모 안내(`invoice.notice` · PNOTI 보낼 것)는 §43 회차 안내와 **같은 창**(`GuardianSendDialog` · pnotiId)으로
 * 보호자에게 보낸다 — 보낸 뒤에는 서버가 찍은 시각만 적고 단추를 다시 세우지 않는다(H-76 「학부모 안내가 생성된다」 · DQ3).
 * 취소는 사유가 필수이고 지우는 것이 아니라 void 로 접는다 — 창이 그 사실을 말한다.
 * 모달은 공용 `Dialog`, 입력은 `Textarea` 그대로다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Dialog, Label, Textarea } from '@/components/ui';
import { GuardianSendDialog } from '@/components/guardians/GuardianSendDialog';
import { apiMessage } from '@/api/client';
import { useInvoiceAction } from '@/api/queries';
import { kstDateTime } from '@/lib/calendar';
import type { Invoice } from '@/api/types';

export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const id = useId();
  const act = useInvoiceAction();
  const [dialog, setDialog] = useState<'void' | 'notice' | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (dialog === 'void') { setReason(''); setErr(null); } }, [dialog]);
  /* 취소가 막혀 있어도 **왜 막혔는지**는 말한다 (S5) — 단추를 통째로 숨기면 「이 줄만 왜 다르지」가 된다.
     서버가 준 문장 그대로다(마감 · 입금 붙음). 권한 자체가 없으면 이유도 없고 자리도 없다. */
  const voidBlocked = invoice.voidBlockedReason ?? null;
  const notice = invoice.notice;
  /* 취소된 줄은 **누가 보든** 사유를 적는다(N-139 「이력에 남는다」). 권한이 있으면 서버가 같은 줄에
     「이미 취소된 청구서입니다」를 막힌 이유로도 싣는데, 그 문장이 사유를 가리면 취소할 수 있는 사람만 사유를 못 본다
     (all160 실브라우저 QA 2026-09-29). 사유가 있는 줄에는 다시 누를 단추를 세우지 않는다. */
  if (invoice.voidReason) {
    return <span className="text-[11px] text-fg-subtle" title={invoice.voidReason}>취소 · {invoice.voidReason}</span>;
  }
  if (!invoice.canDeliver && !invoice.canVoid && !voidBlocked && !notice) return null;
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {notice && notice.sentAt === null ? (
        <Button size="sm" variant="ghost" disabled={act.isPending} title="전달하며 만든 학부모 안내를 보호자에게 보냅니다" onClick={() => setDialog('notice')}>
          학부모 안내
        </Button>
      ) : notice ? (
        <span className="text-[11px] text-fg-subtle" title={notice.body}>안내 보냄 {kstDateTime(notice.sentAt) ?? ''}</span>
      ) : null}
      {invoice.canDeliver ? (
        <Button size="sm" variant="ghost" disabled={act.isPending}
          title="학부모께 보냈다고 표시합니다"
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
      {notice && dialog === 'notice' ? (
        <GuardianSendDialog open student={{ id: invoice.studentId, name: invoice.studentName }} pnotiId={notice.id}
          defaultBody={notice.body} title={`학부모 안내 — ${invoice.studentName} · ${invoice.title}`} onClose={() => setDialog(null)} />
      ) : null}
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
