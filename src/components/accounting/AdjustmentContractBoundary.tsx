/** @file-guide
 * 목적: 최종 관리자 수정사항 p106·p112와 Figma A24의 청구 조정 신청·대표 승인·반려·취소·되돌리기 원장을 제공한다. (component)
 * 책임/재사용: 생성 DTO와 공용 Query mutation만 소비하며 청구액·환불 예정액·권한·전이는 서버 응답을 그대로 표시한다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-11BD01-INVOICE-ADJUSTMENT-APPROVAL-2026-10-09.md · docs/AGENT.md
 */
'use client';
import { useId, useMemo, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useCreateInvoiceAdjustment, useInvoiceAdjustments, useTransitionInvoiceAdjustment } from '@/api/queries';
import type { Invoice, InvoiceAdjustment, InvoiceAdjustmentCreate } from '@/api/types';
import { Banner, Button, Chip, Dialog, FieldError, Input, Label, Panel, QueryState, Select, Textarea } from '@/components/ui';
import { kstDateTime, todayKst } from '@/lib/calendar';
import { won } from '@/lib/money';
import { StudentRefundLedger } from './StudentRefundLedger';

type AdjustmentKind = '' | InvoiceAdjustmentCreate['kind'];
type AdjustmentAction = 'approve' | 'reject' | 'cancel' | 'undo';
type ActionTarget = { item: InvoiceAdjustment; action: AdjustmentAction };

const requestKey = () => globalThis.crypto.randomUUID();
const actionLabel: Record<AdjustmentAction, string> = {
  approve: '승인·반영', reject: '반려', cancel: '반영 취소', undo: '되돌리기',
};
const stateTone = (state: InvoiceAdjustment['state']): 'warning' | 'success' | 'danger' | 'neutral' => (
  state === 'pending' ? 'warning' : state === 'approved' ? 'success' : state === 'rejected' ? 'danger' : 'neutral'
);

export function AdjustmentContractBoundary({ invoices, onOpenInvoices, onOpenAccounts }: {
  invoices: readonly Invoice[];
  onOpenInvoices: () => void;
  onOpenAccounts: () => void;
}) {
  const id = useId();
  const today = todayKst();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [kind, setKind] = useState<AdjustmentKind>('');
  const [studentId, setStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState<ActionTarget | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [history, setHistory] = useState<InvoiceAdjustment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const query = useInvoiceAdjustments(month);
  const create = useCreateInvoiceAdjustment();
  const transition = useTransitionInvoiceAdjustment();
  const pending = create.isPending || transition.isPending;
  const amountNumber = Number(amount);
  const amountError = amount !== '' && (!Number.isInteger(amountNumber) || amountNumber <= 0);
  const formValid = Boolean(effectiveOn && kind && studentId && reason.trim().length >= 2 && amount && !amountError);
  const students = useMemo(() => {
    const byId = new Map<number, { id: number; label: string }>();
    for (const invoice of invoices) {
      if (invoice.state === 'void' || byId.has(invoice.studentId)) continue;
      const tag = invoice.studentTag ? ` · ${invoice.studentTag}` : '';
      byId.set(invoice.studentId, { id: invoice.studentId, label: `${invoice.studentName}${tag}` });
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  }, [invoices]);
  const clear = () => {
    setKind(''); setStudentId(''); setReason(''); setAmount(''); setError(null); setSuccess(null);
  };
  const openAction = (item: InvoiceAdjustment, next: AdjustmentAction) => {
    setAction({ item, action: next }); setActionReason(''); setError(null); setSuccess(null);
  };
  const refreshLedger = async () => {
    const refreshed = await query.refetch();
    if (!action || !refreshed.data) return;
    const current = refreshed.data.items.find((item) => item.id === action.item.id);
    if (current) setAction({ ...action, item: current });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1"><Chip tone="info">승인 원장 연결</Chip></div>
            <h2 className="text-[15px] font-bold text-fg">조정 — 환불 · 할인</h2>
            <p className="mt-1 text-[12px] text-fg-subtle">환불과 할인은 대표 승인 후 청구서에 반영됩니다</p>
          </div>
          <Button size="sm" variant="secondary" onClick={onOpenInvoices}>청구서 보기</Button>
        </header>

        <Banner tone="warning" className="mb-4">
          <b>승인 전 청구 금액은 바뀌지 않습니다.</b> 이미 납부한 금액이 승인 뒤 청구액보다 크면 차액을 환불 예정액으로 표시하며, 실제 송금 완료는 계좌 보호 계약에서 따로 기록합니다.
        </Banner>
        {error ? <Banner tone="danger" className="mb-3"><div className="flex flex-wrap items-center justify-between gap-2"><span>{error}</span><Button size="sm" variant="ghost" onClick={() => void refreshLedger()}>최신 원장 다시 불러오기</Button></div></Banner> : null}
        {success ? <Banner tone="success" className="mb-3">{success}</Banner> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="조정 등록 입력">
          <div><Label htmlFor={`${id}-on`}>적용 일자</Label><Input id={`${id}-on`} type="date" value={effectiveOn} onChange={(event) => { setEffectiveOn(event.target.value); setError(null); }} /></div>
          <div><Label htmlFor={`${id}-kind`}>구분</Label><Select id={`${id}-kind`} value={kind} onChange={(event) => { setKind(event.target.value as AdjustmentKind); setError(null); }}>
            <option value="">선택</option><option value="discount">할인</option><option value="refund">환불</option><option value="sibling_discount">형제 할인</option><option value="carry">이월</option>
          </Select></div>
          <div><Label htmlFor={`${id}-student`}>학생</Label><Select id={`${id}-student`} value={studentId} onChange={(event) => { setStudentId(event.target.value); setError(null); }}>
            <option value="">선택</option>{students.map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
          </Select></div>
          <div className="sm:col-span-2 lg:col-span-1"><Label htmlFor={`${id}-amount`} hint="원 단위">금액</Label><Input id={`${id}-amount`} type="number" min={1} step={1} inputMode="numeric" value={amount}
            error={amountError} aria-invalid={amountError} onChange={(event) => { setAmount(event.target.value); setError(null); }} /><FieldError>{amountError ? '1원 이상의 정수로 적어 주세요' : undefined}</FieldError></div>
          <div className="sm:col-span-2 lg:col-span-1"><Label htmlFor={`${id}-reason`} hint={`${reason.length} / 500`}>사유</Label><Textarea id={`${id}-reason`} rows={2} maxLength={500} value={reason}
            onChange={(event) => { setReason(event.target.value); setError(null); }} placeholder="조정 근거를 두 글자 이상 적어 주세요" /></div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-fg-subtle">같은 요청의 재전송은 한 건으로 수렴하며, 다른 처리 뒤의 오래된 요청은 최신 원장을 다시 읽습니다.</p>
          <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={clear}>입력 지우기</Button><Button size="sm" disabled={pending || !formValid || query.data?.canRequest !== true} onClick={() => {
            setError(null); setSuccess(null);
            create.mutate({ effectiveOn, kind: kind as InvoiceAdjustmentCreate['kind'], studentId: Number(studentId), reason: reason.trim(), amount: amountNumber, requestKey: requestKey() }, {
              onSuccess: ({ item, replayed }) => {
                setMonth(item.yearMonth);
                setSuccess(replayed ? '이미 접수된 같은 조정 요청을 확인했습니다.' : '대표 승인 대기로 접수했습니다. 청구 금액은 아직 바뀌지 않았습니다.');
                setKind(''); setStudentId(''); setReason(''); setAmount('');
              },
              onError: (cause) => setError(apiMessage(cause)),
            });
          }}>승인 요청</Button></div>
        </div>
      </Panel>

      <Panel title="조정 원장" sub="승인 대기 · 승인 · 반려 · 반영 취소 · 되돌리기를 같은 current/event 이력으로 확인합니다">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><Label htmlFor={`${id}-month`}>조회 달</Label><Input id={`${id}-month`} type="month" value={month} onChange={(event) => { setMonth(event.target.value); setError(null); setSuccess(null); }} /></div>
          {query.data ? <div className="grid grid-cols-3 gap-2 text-right text-[12px]">
            <div className="rounded-lg bg-inset px-3 py-2"><span className="block text-fg-subtle">승인 대기</span><b>{query.data.pendingCount}건</b></div>
            <div className="rounded-lg bg-inset px-3 py-2"><span className="block text-fg-subtle">반영 조정</span><b>{won(query.data.approvedAmount)}</b></div>
            <div className="rounded-lg bg-inset px-3 py-2"><span className="block text-fg-subtle">환불 예정</span><b className="text-orange">{won(query.data.refundDue)}</b></div>
          </div> : null}
        </div>
        <QueryState query={query} isEmpty={(data) => data.items.length === 0} empty="이 달의 청구 조정이 없습니다.">
          {(data) => <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[1240px] border-collapse text-[12px]">
            <thead className="bg-inset text-fg-subtle"><tr>
              <th className="border-b border-line px-3 py-2 text-left">학생·적용일</th><th className="border-b border-line px-3 py-2 text-left">구분·사유</th>
              <th className="border-b border-line px-3 py-2 text-right">조정액</th><th className="border-b border-line px-3 py-2 text-right">현재 청구액</th><th className="border-b border-line px-3 py-2 text-right">납부액</th><th className="border-b border-line px-3 py-2 text-right">환불 예정</th>
              <th className="border-b border-line px-3 py-2 text-left">신청</th><th className="border-b border-line px-3 py-2 text-left">상태</th><th className="border-b border-line px-3 py-2 text-right">작업</th>
            </tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.id} className="border-b border-line last:border-0">
              <td className="px-3 py-2"><b className="text-fg">{item.studentName}</b><span className="block text-fg-subtle">{item.studentTag ?? '태그 없음'} · {item.effectiveOn}</span></td>
              <td className="max-w-[260px] px-3 py-2"><b className="text-fg">{item.kindLabel}</b><span className="block truncate text-fg-subtle" title={item.reason}>{item.reason}</span></td>
              <td className="px-3 py-2 text-right font-bold text-red">-{won(item.amount)}</td><td className="px-3 py-2 text-right text-fg">{won(item.invoiceAmount)}</td>
              <td className="px-3 py-2 text-right text-fg">{won(item.paidAmount)}</td><td className="px-3 py-2 text-right font-bold text-orange">{item.refundDue ? won(item.refundDue) : '—'}</td>
              <td className="px-3 py-2 text-fg">{item.requestedBy}<span className="block text-fg-subtle">{kstDateTime(item.requestedAt) ?? '시각 미상'}</span></td>
              <td className="px-3 py-2"><Chip tone={stateTone(item.state)}>{item.stateLabel}</Chip><span className="ml-2 text-fg-subtle">v{item.version}</span></td>
              <td className="px-3 py-2"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setHistory(item)}>이력 {item.events.length}</Button>
                {item.canApprove ? <Button size="sm" disabled={pending} onClick={() => openAction(item, 'approve')}>승인</Button> : null}
                {item.canReject ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => openAction(item, 'reject')}>반려</Button> : null}
                {item.canCancel ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => openAction(item, 'cancel')}>반영 취소</Button> : null}
                {item.canUndo ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => openAction(item, 'undo')}>되돌리기</Button> : null}
              </div></td>
            </tr>)}</tbody>
          </table></div>}
        </QueryState>
      </Panel>

      <StudentRefundLedger month={month} onOpenAccounts={onOpenAccounts} />

      {action ? <Dialog open closeX onClose={() => setAction(null)} title={`청구 조정 ${actionLabel[action.action]}`}
        sub={`${action.item.studentName} · ${action.item.kindLabel} ${won(action.item.amount)} · v${action.item.version}`}
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAction(null)}>닫기</Button><Button disabled={transition.isPending || (action.action !== 'approve' && actionReason.trim().length < 2)} onClick={() => {
          const body = action.action === 'approve' ? { expectedVersion: action.item.version, requestKey: requestKey() } : { expectedVersion: action.item.version, reason: actionReason.trim(), requestKey: requestKey() };
          setError(null); setSuccess(null);
          transition.mutate({ adjustmentId: action.item.id, action: action.action, body }, {
            onSuccess: ({ item }) => { setSuccess(`${item.studentName} 조정을 ${actionLabel[action.action]} 처리했습니다.`); setAction(null); },
            onError: (cause) => setError(apiMessage(cause)),
          });
        }}>{actionLabel[action.action]}</Button></div>}>
        <p className="mb-3 text-[13px] text-fg-2">현재 원장 version을 다시 확인한 뒤 한 transaction에서 청구액·처리자·이력을 반영합니다.</p>
        {error ? <Banner tone="danger" className="mb-3"><div className="flex flex-wrap items-center justify-between gap-2"><span>{error}</span><Button size="sm" variant="ghost" onClick={() => void refreshLedger()}>최신 원장 다시 불러오기</Button></div></Banner> : null}
        {action.action !== 'approve' ? <><Label htmlFor={`${id}-action-reason`}>처리 사유</Label><Input id={`${id}-action-reason`} value={actionReason} maxLength={200} onChange={(event) => setActionReason(event.target.value)} placeholder="두 글자 이상" /></> : null}
      </Dialog> : null}

      {history ? <Dialog open closeX onClose={() => setHistory(null)} title="청구 조정 이력" sub={`${history.studentName} · ${history.kindLabel} ${won(history.amount)}`}
        footer={<div className="flex justify-end"><Button variant="ghost" onClick={() => setHistory(null)}>닫기</Button></div>}>
        <ol className="space-y-2">{history.events.map((event) => <li key={event.version} className="rounded-lg border border-line px-3 py-2 text-[12px] text-fg-2">
          <div className="flex items-center justify-between gap-2"><b className="text-fg">v{event.version} · {event.toState}</b><span>{kstDateTime(event.createdAt) ?? '시각 미상'}</span></div>
          <p className="mt-1">{event.actor} · {won(event.invoiceAmountBefore)} → {won(event.invoiceAmountAfter)}{event.reason ? ` · ${event.reason}` : ''}</p>
        </li>)}</ol>
      </Dialog> : null}
    </div>
  );
}
