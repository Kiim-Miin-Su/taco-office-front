/** @file-guide
 * 목적: BO-11AD-01 PAY 증빙 원장의 미발행·발행, 개별/일괄 확인, 취소, 출력 상세를 제공한다. (component)
 * 책임/재사용: 생성 DTO와 Query mutation을 소비하며 외부 발급 성공이나 증빙 번호를 화면에서 합성하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import {
  useCancelPaymentEvidence, useIssuePaymentEvidence, useIssuePaymentEvidenceBatch, usePaymentEvidence,
} from '@/api/queries';
import type { PaymentEvidence } from '@/api/types';
import { Banner, Button, Chip, Dialog, Input, Label, Panel, QueryState } from '@/components/ui';
import { won } from '@/lib/money';
import { kstDateTime, todayKst } from '@/lib/calendar';

type Filter = 'unissued' | 'issued';
const requestKey = () => globalThis.crypto.randomUUID();

function EvidencePrint({ item, onClose }: { item: PaymentEvidence; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="입금 증빙" sub="발행 확인 시점의 보존 snapshot" closeX width={560}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>닫기</Button><Button onClick={() => window.print()}>출력</Button></div>}>
      <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
        <div><dt className="text-fg-subtle">입금일</dt><dd className="font-bold text-fg">{item.paidOn}</dd></div>
        <div><dt className="text-fg-subtle">학생</dt><dd className="font-bold text-fg">{item.studentName ?? '학생 미지정'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-fg-subtle">내용</dt><dd className="font-bold text-fg">{item.content}</dd></div>
        <div><dt className="text-fg-subtle">금액</dt><dd className="font-bold text-fg">{won(item.amount)}</dd></div>
        <div><dt className="text-fg-subtle">상태</dt><dd className="font-bold text-fg">{item.status === 'issued' ? '끊었음' : '아직 안 끊음'}</dd></div>
        <div><dt className="text-fg-subtle">발행 확인</dt><dd className="text-fg">{item.issuedAt ? `${kstDateTime(item.issuedAt) ?? '시각 미상'} · ${item.issuedBy ?? '담당자'}` : '—'}</dd></div>
        <div><dt className="text-fg-subtle">버전</dt><dd className="text-fg">v{item.version}</dd></div>
        {item.canceledAt ? <div className="sm:col-span-2"><dt className="text-fg-subtle">최근 취소</dt><dd className="text-fg">{kstDateTime(item.canceledAt) ?? '시각 미상'} · {item.canceledBy} · {item.cancelReason}</dd></div> : null}
      </dl>
      <Banner tone="info" className="mt-4">이 화면은 외부 발급 완료 사실을 보존한 내부 원장입니다. 국세청·PG 발급 번호를 대신하지 않습니다.</Banner>
    </Dialog>
  );
}

export function PaymentEvidenceLedger() {
  const [month, setMonth] = useState(todayKst().slice(0, 7));
  const [filter, setFilter] = useState<Filter>('unissued');
  const [opened, setOpened] = useState<PaymentEvidence | null>(null);
  const [canceling, setCanceling] = useState<PaymentEvidence | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const query = usePaymentEvidence(month);
  const issue = useIssuePaymentEvidence();
  const cancel = useCancelPaymentEvidence();
  const batch = useIssuePaymentEvidenceBatch();
  const pending = issue.isPending || cancel.isPending || batch.isPending;

  return (
    <Panel title="증빙 발행 원장" sub="입금 PAY별 외부 발행 완료를 확인하고 당시 출력 내용을 보존합니다">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label htmlFor="evidence-month">달</Label>
          <Input id="evidence-month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setError(null); }} />
        </div>
        <Button disabled={pending || !query.data?.unissuedCount} onClick={() => {
          setError(null);
          batch.mutate({ month, requestKey: requestKey() }, { onError: (cause) => setError(apiMessage(cause)) });
        }}>전부 끊음으로</Button>
      </div>

      <QueryState query={query} isEmpty={(data) => data.items.length === 0} empty="이 달에 증빙 대상 입금이 없습니다.">
        {(data) => {
          const rows = data.items.filter((item) => item.status === filter);
          return (
            <div className="space-y-3">
              {data.monthCloseBlockedCount > 0
                ? <Banner tone="warning">⚠ {data.monthCloseBlockedCount}건 남았습니다 · 월 마감 전에 끊어야 합니다.</Banner>
                : data.unissuedCount > 0
                  ? <Banner tone="info">정책 적용 전 입금 {data.unissuedCount}건은 월 마감을 막지 않습니다 · 실제 발행 여부를 확인해 주세요.</Banner>
                  : <Banner tone="success">이 달의 증빙 발행 확인이 모두 끝났습니다.</Banner>}
              <div className="flex flex-wrap gap-2" aria-label="증빙 상태">
                <Button variant={filter === 'unissued' ? 'primary' : 'ghost'} onClick={() => setFilter('unissued')}>아직 안 끊음 {data.unissuedCount}</Button>
                <Button variant={filter === 'issued' ? 'primary' : 'ghost'} onClick={() => setFilter('issued')}>끊었음 {data.issuedCount}</Button>
              </div>
              {error ? <Banner tone="danger">{error}</Banner> : null}
              {rows.length === 0 ? <p className="rounded-lg border border-dashed border-line p-5 text-center text-[13px] text-fg-subtle">이 상태의 입금이 없습니다.</p> : (
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full min-w-[760px] border-collapse text-[13px]">
                    <thead className="bg-inset text-fg-subtle"><tr>
                      <th className="border-b border-line px-3 py-2 text-left">날짜</th><th className="border-b border-line px-3 py-2 text-left">학생</th>
                      <th className="border-b border-line px-3 py-2 text-left">내용</th><th className="border-b border-line px-3 py-2 text-right">금액</th>
                      <th className="border-b border-line px-3 py-2 text-left">상태</th><th className="border-b border-line px-3 py-2 text-right">처리</th>
                    </tr></thead>
                    <tbody>{rows.map((item) => <tr key={item.payId} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-fg">{item.paidOn}</td><td className="px-3 py-2 font-medium text-fg">{item.studentName ?? '학생 미지정'}</td>
                      <td className="px-3 py-2 text-fg">{item.content}</td><td className="px-3 py-2 text-right font-bold text-fg">{won(item.amount)}</td>
                      <td className="px-3 py-2"><Chip tone={item.status === 'issued' ? 'success' : 'warning'}>{item.status === 'issued' ? '끊었음' : '아직 안 끊음'}</Chip></td>
                      <td className="px-3 py-2"><div className="flex justify-end gap-2">
                        {item.printRef ? <Button size="sm" variant="ghost" onClick={() => setOpened(item)}>열기</Button> : null}
                        {item.status === 'unissued' ? <Button size="sm" disabled={pending} onClick={() => {
                          setError(null);
                          issue.mutate({ payId: item.payId, body: { expectedVersion: item.version, requestKey: requestKey() } }, { onError: (cause) => setError(apiMessage(cause)) });
                        }}>끊음으로</Button> : <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setCanceling(item); setReason(''); }}>취소</Button>}
                      </div></td>
                    </tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        }}
      </QueryState>

      {opened ? <EvidencePrint item={opened} onClose={() => setOpened(null)} /> : null}
      {canceling ? <Dialog open onClose={() => setCanceling(null)} title="증빙 발행 취소" sub={`${canceling.studentName ?? '학생 미지정'} · ${won(canceling.amount)}`} closeX
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCanceling(null)}>닫기</Button><Button disabled={reason.trim().length < 2 || cancel.isPending} onClick={() => {
          setError(null);
          cancel.mutate({ payId: canceling.payId, body: { expectedVersion: canceling.version, requestKey: requestKey(), reason: reason.trim() } }, {
            onSuccess: () => setCanceling(null), onError: (cause) => setError(apiMessage(cause)),
          });
        }}>취소 확정</Button></div>}>
        <Label htmlFor="evidence-cancel-reason">취소 사유</Label>
        <Input id="evidence-cancel-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="두 글자 이상" />
      </Dialog> : null}
    </Panel>
  );
}
