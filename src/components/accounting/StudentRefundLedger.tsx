/** @file-guide
 * 목적: BOC-11D-02 승인 조정의 환불 증가분을 실제 지급·취소·재지급하고 source/account snapshot 이력을 표시한다. (component)
 * 책임/재사용: 생성 DTO와 공용 Query만 소비하며 환불액·권한·계좌 상태를 화면에서 다시 계산하지 않는다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-11D2-STUDENT-REFUND-DISBURSEMENT-2026-10-09.md · docs/AGENT.md
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useCancelStudentRefund, usePayStudentRefund, useStudentRefunds } from '@/api/queries';
import type { StudentRefund } from '@/api/types';
import { Banner, Button, Chip, Dialog, Input, Label, Panel, QueryState } from '@/components/ui';
import { kstDateTime, todayKst } from '@/lib/calendar';
import { won } from '@/lib/money';

const requestKey = () => globalThis.crypto.randomUUID();

export function StudentRefundLedger({ month, onOpenAccounts }: { month: string; onOpenAccounts: () => void }) {
  const [paidOn, setPaidOn] = useState(todayKst());
  const [paying, setPaying] = useState<StudentRefund | null>(null);
  const [canceling, setCanceling] = useState<StudentRefund | null>(null);
  const [history, setHistory] = useState<StudentRefund | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const query = useStudentRefunds(month);
  const pay = usePayStudentRefund();
  const cancel = useCancelStudentRefund();
  const pending = pay.isPending || cancel.isPending;

  return (
    <Panel title="학생 실제 환불 원장" sub="승인 조정이 새로 만든 환불 예정액과 실제 계좌이체를 분리해 보존합니다">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label htmlFor="student-refund-paid-on">실제 지급일</Label>
          <Input id="student-refund-paid-on" type="date" value={paidOn} max={todayKst()}
            onChange={(event) => { setPaidOn(event.target.value); setError(null); }} />
        </div>
        <Chip tone="info">처리 수단 · 계좌이체</Chip>
      </div>
      <Banner tone="neutral" className="mb-3">
        금액은 승인 전후 환불 예정액의 증가분을 서버가 계산합니다. 지급 완료 뒤 조정을 되돌리려면 이 원장에서 지급을 먼저 취소해야 합니다.
      </Banner>
      {error ? <Banner tone="danger" className="mb-3"><div className="flex flex-wrap items-center justify-between gap-2">
        <span>{error}</span><Button size="sm" variant="ghost" onClick={() => void query.refetch()}>최신 환불 원장 다시 불러오기</Button>
      </div></Banner> : null}

      <QueryState query={query} isEmpty={(data) => data.items.length === 0}
        empty="이 달에 실제 지급할 승인 환불 예정액이 없습니다.">
        {(data) => <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-inset px-3 py-2"><span className="text-[12px] text-fg-subtle">지급 대상</span><b className="block text-[14px] text-fg">{data.totalCount}건</b></div>
            <div className="rounded-lg bg-inset px-3 py-2"><span className="text-[12px] text-fg-subtle">환불 예정</span><b className="block text-[14px] text-fg">{won(data.totalAmount)}</b></div>
            <div className="rounded-lg bg-inset px-3 py-2"><span className="text-[12px] text-fg-subtle">지급 완료</span><b className="block text-[14px] text-green">{data.paidCount}건 · {won(data.paidAmount)}</b></div>
            <div className="rounded-lg bg-inset px-3 py-2"><span className="text-[12px] text-fg-subtle">미지급</span><b className="block text-[14px] text-orange">{won(data.unpaidAmount)}</b></div>
          </div>
          {data.items.some((item) => item.status !== 'paid' && !item.accountReady) ? <Banner tone="warning">
            지급 계좌가 없는 학생이 있습니다. <Button size="sm" variant="ghost" onClick={onOpenAccounts}>학생 환불 계좌 등록</Button>
          </Banner> : null}
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[1140px] border-collapse text-[12px]">
              <thead className="bg-inset text-fg-subtle"><tr>
                <th className="border-b border-line px-3 py-2 text-left">학생·적용일</th><th className="border-b border-line px-3 py-2 text-left">원천 조정</th>
                <th className="border-b border-line px-3 py-2 text-right">실제 환불액</th><th className="border-b border-line px-3 py-2 text-left">지급 계좌</th>
                <th className="border-b border-line px-3 py-2 text-left">지급일·처리자</th><th className="border-b border-line px-3 py-2 text-left">상태</th>
                <th className="border-b border-line px-3 py-2 text-right">작업</th>
              </tr></thead>
              <tbody>{data.items.map((item) => <tr key={item.adjustmentId} className="border-b border-line last:border-0">
                <td className="px-3 py-2"><b className="text-fg">{item.studentName}</b><span className="block text-fg-subtle">{item.studentTag ?? '태그 없음'} · {item.effectiveOn}</span></td>
                <td className="max-w-[280px] px-3 py-2"><b className="text-fg">{item.adjustmentKindLabel} · source v{item.sourceAdjustmentVersion}</b><span className="block truncate text-fg-subtle" title={item.adjustmentReason}>{item.adjustmentReason}</span></td>
                <td className="px-3 py-2 text-right font-bold text-orange">{won(item.amount)}</td>
                <td className="px-3 py-2 text-fg">{item.status === 'paid' && item.accountLast4
                  ? `**** ${item.accountLast4} · v${item.accountVersion}`
                  : item.activeAccountLast4 ? `**** ${item.activeAccountLast4} · 지급 가능`
                    : <Button size="sm" variant="ghost" onClick={onOpenAccounts}>등록 필요</Button>}</td>
                <td className="px-3 py-2 text-fg">{item.paidOn ?? '—'}<span className="block text-fg-subtle">{item.paidBy ?? '미처리'}</span></td>
                <td className="px-3 py-2"><Chip tone={item.status === 'paid' ? 'success' : item.status === 'canceled' ? 'danger' : 'warning'}>
                  {item.status === 'paid' ? '지급 완료' : item.status === 'canceled' ? '지급 취소' : '미지급'}
                </Chip><span className="ml-2 text-fg-subtle">v{item.version}</span></td>
                <td className="px-3 py-2"><div className="flex justify-end gap-1">
                  {item.events.length > 0 ? <Button size="sm" variant="ghost" onClick={() => setHistory(item)}>이력 {item.events.length}</Button> : null}
                  {item.canPay ? <Button size="sm" disabled={pending || !paidOn} onClick={() => { setPaying(item); setError(null); }}>지급</Button> : null}
                  {item.status !== 'paid' && !item.accountReady ? <Button size="sm" variant="ghost" onClick={onOpenAccounts}>계좌 등록</Button> : null}
                  {item.canCancel ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setCanceling(item); setReason(''); setError(null); }}>지급 취소</Button> : null}
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>}
      </QueryState>

      {paying ? <Dialog open closeX onClose={() => setPaying(null)} title="학생 실제 환불 확인"
        sub={`${paying.studentName} · ${won(paying.amount)} · ${paidOn}`}
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPaying(null)}>닫기</Button><Button disabled={pay.isPending || !paidOn} onClick={() => {
          setError(null);
          pay.mutate({ adjustmentId: paying.adjustmentId, body: { expectedVersion: paying.version, paidOn, method: 'bank_transfer', requestKey: requestKey() } }, {
            onSuccess: () => setPaying(null), onError: (cause) => setError(apiMessage(cause)),
          });
        }}>계좌이체 기록</Button></div>}>
        <p className="text-[13px] text-fg-2">원천 조정 v{paying.sourceAdjustmentVersion}의 환불 증가분과 활성 계좌 **** {paying.activeAccountLast4}를 지급 당시 기록으로 남깁니다.</p>
      </Dialog> : null}

      {canceling ? <Dialog open closeX onClose={() => setCanceling(null)} title="학생 환불 지급 취소"
        sub={`${canceling.studentName} · ${won(canceling.amount)}`}
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCanceling(null)}>닫기</Button><Button disabled={cancel.isPending || reason.trim().length < 2} onClick={() => {
          setError(null);
          cancel.mutate({ adjustmentId: canceling.adjustmentId, body: { expectedVersion: canceling.version, reason: reason.trim(), requestKey: requestKey() } }, {
            onSuccess: () => setCanceling(null), onError: (cause) => setError(apiMessage(cause)),
          });
        }}>취소 확정</Button></div>}>
        <Label htmlFor="student-refund-cancel-reason">취소 사유</Label>
        <Input id="student-refund-cancel-reason" value={reason} maxLength={200}
          onChange={(event) => setReason(event.target.value)} placeholder="두 글자 이상" />
      </Dialog> : null}

      {history ? <Dialog open closeX onClose={() => setHistory(null)} title="학생 환불 처리 이력"
        sub={`${history.studentName} · ${won(history.amount)}`}
        footer={<div className="flex justify-end"><Button variant="ghost" onClick={() => setHistory(null)}>닫기</Button></div>}>
        <ol className="space-y-2">{history.events.map((event) => <li key={event.version} className="rounded-lg border border-line px-3 py-2 text-[12px] text-fg-2">
          <div className="flex items-center justify-between gap-2"><b className="text-fg">v{event.version} · {event.action === 'paid' ? '지급 완료' : '지급 취소'}</b><span>{kstDateTime(event.createdAt) ?? '시각 미상'}</span></div>
          <p className="mt-1">{event.actor} · source v{event.sourceAdjustmentVersion} · {won(event.amount)}
            {event.accountLast4 ? ` · **** ${event.accountLast4}` : ''}{event.paidOn ? ` · ${event.paidOn}` : ''}{event.reason ? ` · ${event.reason}` : ''}</p>
        </li>)}</ol>
      </Dialog> : null}
    </Panel>
  );
}
