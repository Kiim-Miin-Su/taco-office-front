/** @file-guide
 * 목적: BO-11AD-03 확정 강사료의 실제 계좌이체·취소·재지급 원장을 최근 두 달 단위로 제공한다. (component)
 * 책임/재사용: 생성 DTO와 Query mutation만 소비하고 확정 급여를 다시 계산하거나 계좌 뒤 4자리를 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import {
  useCancelPayoutDisbursement, usePayPayoutDisbursement, usePayPayoutDisbursementBatch,
  usePayoutDisbursementLedger,
} from '@/api/queries';
import type { PayoutDisbursement, PayoutDisbursementMonth } from '@/api/types';
import { Banner, Button, Chip, Dialog, Input, Label, Panel, QueryState } from '@/components/ui';
import { kstDateTime, todayKst } from '@/lib/calendar';
import { won } from '@/lib/money';

const requestKey = () => globalThis.crypto.randomUUID();
const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;
const methodLabel = (method: PayoutDisbursement['method']) => method === 'bank_transfer' ? '계좌이체' : '—';

function Summary({ month }: { month: PayoutDisbursementMonth }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-lg bg-inset px-3 py-2"><span className="text-[12px] text-fg-subtle">지급 인원</span><b className="block text-[14px] text-fg">{month.paidCount}/{month.totalCount}명</b></div>
      <div className="rounded-lg bg-inset px-3 py-2"><span className="text-[12px] text-fg-subtle">전체 지급액</span><b className="block text-[14px] text-fg">{won(month.totalAmount)}</b></div>
      <div className="rounded-lg bg-inset px-3 py-2"><span className="text-[12px] text-fg-subtle">지급 완료</span><b className="block text-[14px] text-green">{won(month.paidAmount)}</b></div>
      <div className="rounded-lg bg-inset px-3 py-2"><span className="text-[12px] text-fg-subtle">미지급</span><b className="block text-[14px] text-orange">{won(month.unpaidAmount)}</b></div>
    </div>
  );
}

export function PayoutDisbursementLedger({ onOpenAccounts }: { onOpenAccounts: () => void }) {
  const [paidOn, setPaidOn] = useState(todayKst());
  const [paying, setPaying] = useState<PayoutDisbursement | null>(null);
  const [batching, setBatching] = useState<PayoutDisbursementMonth | null>(null);
  const [canceling, setCanceling] = useState<PayoutDisbursement | null>(null);
  const [history, setHistory] = useState<PayoutDisbursement | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const query = usePayoutDisbursementLedger();
  const pay = usePayPayoutDisbursement();
  const cancel = useCancelPayoutDisbursement();
  const batch = usePayPayoutDisbursementBatch();
  const pending = pay.isPending || cancel.isPending || batch.isPending;

  return (
    <Panel title="실제 지급 원장" sub="확정한 강사료와 실제 계좌이체를 분리해 최근 두 달의 처리자·지급일·취소 이력을 보존합니다">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label htmlFor="payout-paid-on">실제 지급일</Label>
          <Input id="payout-paid-on" type="date" value={paidOn} max={todayKst()} onChange={(event) => { setPaidOn(event.target.value); setError(null); }} />
        </div>
        <Chip tone="info">처리 수단 · 계좌이체</Chip>
      </div>
      <Banner tone="neutral" className="mb-3">
        금액과 시수는 「강사료 정산」에서 확정한 값을 그대로 읽습니다. 지급 계좌와 뒤 4자리는 계좌 보호 계약에서 연결하며 여기서 기존 값으로 추정하지 않습니다.
      </Banner>
      {error ? <Banner tone="danger" className="mb-3">{error}</Banner> : null}

      <QueryState query={query} isEmpty={(data) => data.months.length === 0} empty="확정된 강사료가 없습니다. 강사료 정산에서 먼저 지급 확정해 주세요.">
        {(data) => <div className="space-y-5">{data.months.map((month) => {
          const unpaid = month.totalCount - month.paidCount;
          const missingAccounts = month.items.filter((item) => item.status !== 'paid' && !item.accountReady).length;
          return (
            <section key={month.month} aria-label={`${monthLabel(month.month)} 지급 원장`} className="space-y-3 rounded-xl border border-line p-3">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="text-[15px] font-bold text-fg">{monthLabel(month.month)}</h3><p className="text-[12px] text-fg-subtle">{month.paidCount}/{month.totalCount}명 지급</p></div>
                <Button disabled={pending || unpaid === 0 || missingAccounts > 0 || !paidOn}
                  title={missingAccounts > 0 ? '미지급 강사의 보호 계좌를 먼저 등록해 주세요' : undefined}
                  onClick={() => { setBatching(month); setError(null); }}>
                  미지급 {unpaid}명 일괄 지급
                </Button>
              </header>
              <Summary month={month} />
              {missingAccounts > 0 ? <Banner tone="warning">
                미지급 강사 {missingAccounts}명의 지급 계좌가 없습니다. <Button size="sm" variant="ghost" onClick={onOpenAccounts}>계좌 등록</Button>
              </Banner> : null}
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[1220px] border-collapse text-[12px]">
                  <thead className="bg-inset text-fg-subtle"><tr>
                    <th className="border-b border-line px-3 py-2 text-left">강사</th><th className="border-b border-line px-3 py-2 text-right">시수</th>
                    <th className="border-b border-line px-3 py-2 text-right">총액</th><th className="border-b border-line px-3 py-2 text-right">차감</th>
                    <th className="border-b border-line px-3 py-2 text-right">원천징수 3.3%</th><th className="border-b border-line px-3 py-2 text-right">차인지급액</th>
                    <th className="border-b border-line px-3 py-2 text-left">지급 계좌</th><th className="border-b border-line px-3 py-2 text-left">지급일</th><th className="border-b border-line px-3 py-2 text-left">처리</th>
                    <th className="border-b border-line px-3 py-2 text-left">상태</th><th className="border-b border-line px-3 py-2 text-right">작업</th>
                  </tr></thead>
                  <tbody>{month.items.map((item) => <tr key={item.payoutId} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-bold text-fg">{item.staffName}</td><td className="px-3 py-2 text-right text-fg">{Number(item.hours).toFixed(1)}h</td>
                    <td className="px-3 py-2 text-right text-fg">{won(item.gross)}</td><td className="px-3 py-2 text-right text-red">{item.deduction ? won(-item.deduction) : '—'}</td>
                    <td className="px-3 py-2 text-right text-red">{item.withholding ? won(-item.withholding) : '—'}</td><td className="px-3 py-2 text-right font-bold text-fg">{won(item.net)}</td>
                    <td className="px-3 py-2 text-fg">{item.accountLast4 ? `**** ${item.accountLast4}` : <Button size="sm" variant="ghost" onClick={onOpenAccounts}>등록 필요</Button>}</td>
                    <td className="px-3 py-2 text-fg">{item.paidOn ?? '—'}</td><td className="px-3 py-2 text-fg">{item.paidBy ? `${item.paidBy} · ${methodLabel(item.method)}` : '—'}</td>
                    <td className="px-3 py-2"><Chip tone={item.status === 'paid' ? 'success' : item.canceledAt ? 'danger' : 'warning'}>
                      {item.status === 'paid' ? '지급 완료' : item.canceledAt ? '지급 취소' : '미지급'}
                    </Chip></td>
                    <td className="px-3 py-2"><div className="flex justify-end gap-1">
                      {item.events.length > 0 ? <Button size="sm" variant="ghost" onClick={() => setHistory(item)}>이력 {item.events.length}</Button> : null}
                      {item.canPay ? <Button size="sm" disabled={pending || !paidOn} onClick={() => { setPaying(item); setError(null); }}>지급</Button> : null}
                      {item.canCancel ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setCanceling(item); setReason(''); setError(null); }}>취소</Button> : null}
                    </div></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </section>
          );
        })}</div>}
      </QueryState>

      {paying ? <Dialog open onClose={() => setPaying(null)} title="실제 지급 확인" sub={`${paying.staffName} · ${won(paying.net)} · ${paidOn}`} closeX
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPaying(null)}>닫기</Button><Button disabled={pay.isPending || !paidOn} onClick={() => {
          setError(null);
          pay.mutate({ payoutId: paying.payoutId, body: { expectedVersion: paying.version, paidOn, method: 'bank_transfer', requestKey: requestKey() } }, {
            onSuccess: () => setPaying(null), onError: (cause) => setError(apiMessage(cause)),
          });
        }}>계좌이체 기록</Button></div>}>
        <p className="text-[13px] text-fg-2">확정한 시수와 금액은 바꾸지 않습니다. 활성 지급 계좌 **** {paying.accountLast4}와 실제 이체일·처리자를 별도 원장에 남깁니다.</p>
      </Dialog> : null}

      {batching ? <Dialog open onClose={() => setBatching(null)} title="미지급 일괄 지급" sub={`${monthLabel(batching.month)} · ${batching.totalCount - batching.paidCount}명 · ${paidOn}`} closeX
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setBatching(null)}>닫기</Button><Button disabled={batch.isPending || !paidOn} onClick={() => {
          setError(null);
          batch.mutate({ month: batching.month, paidOn, method: 'bank_transfer', requestKey: requestKey() }, {
            onSuccess: () => setBatching(null), onError: (cause) => setError(apiMessage(cause)),
          });
        }}>미지급 전원 기록</Button></div>}>
        <p className="text-[13px] text-fg-2">현재 미지급인 확정 정산만 계좌이체 완료로 기록합니다. 이미 지급한 강사는 건너뜁니다.</p>
      </Dialog> : null}

      {canceling ? <Dialog open onClose={() => setCanceling(null)} title="실제 지급 취소" sub={`${canceling.staffName} · ${won(canceling.net)}`} closeX
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCanceling(null)}>닫기</Button><Button disabled={cancel.isPending || reason.trim().length < 2} onClick={() => {
          setError(null);
          cancel.mutate({ payoutId: canceling.payoutId, body: { expectedVersion: canceling.version, reason: reason.trim(), requestKey: requestKey() } }, {
            onSuccess: () => setCanceling(null), onError: (cause) => setError(apiMessage(cause)),
          });
        }}>취소 확정</Button></div>}>
        <Label htmlFor="payout-cancel-reason">취소 사유</Label>
        <Input id="payout-cancel-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="두 글자 이상" />
      </Dialog> : null}

      {history ? <Dialog open onClose={() => setHistory(null)} title="지급 처리 이력" sub={`${history.staffName} · ${monthLabel(history.yearMonth)}`} closeX
        footer={<div className="flex justify-end"><Button variant="ghost" onClick={() => setHistory(null)}>닫기</Button></div>}>
        <ol className="space-y-2">{history.events.map((event) => <li key={event.version} className="rounded-lg border border-line px-3 py-2 text-[12px] text-fg-2">
          <div className="flex items-center justify-between gap-2"><b className="text-fg">v{event.version} · {event.action === 'paid' ? '지급 완료' : '지급 취소'}</b><span>{kstDateTime(event.createdAt) ?? '시각 미상'}</span></div>
          <p className="mt-1">{event.actor}{event.accountLast4 ? ` · **** ${event.accountLast4}` : ''}{event.paidOn ? ` · ${event.paidOn} · ${methodLabel(event.method)}` : ''}{event.reason ? ` · ${event.reason}` : ''}</p>
        </li>)}</ol>
      </Dialog> : null}
    </Panel>
  );
}
