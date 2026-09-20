/** @file-guide
 * 목적: ExpenseReview.tsx — ExpenseReview (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §56 나간 돈 — 부대비용 · 법인카드 (A-D3 증액 금지 · A-D5 간이 5분류 · C36-b).
 *
 * 대표 지시(2026-08-25): *"법인 카드 사용 승인 또한 직원이 올린 금액이 placeholder로 뜨게 하면 됨."*
 * 그래서 승인 칸은 **비어 있고**(A-1) 신청 금액은 회색 안내일 뿐이다. 증액은 아예 없다 — 재신청이다(A-D3).
 *
 * 분류 이름은 서버가 내려보낸 `categoryLabel` 을 쓴다. 화면에 코드표를 복사해 두지 않는다 (D-R18).
 * 영수증·자기 승인·사유 판정도 전부 서버 — 화면은 왜 막혔는지 서버 문구로 말한다.
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useReviewExpense } from '@/api/queries';
import type { Expense, ExpenseCategory, ExpenseTotal, Me } from '@/api/types';
import { Banner, Button, Chip, Input, Label, Panel } from '@/components/ui';
import { won } from '@/lib/money';
import { ExpenseCreateButton } from './ExpenseForm';

const STATE: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: '대기', tone: 'warning' },
  approved: { label: '승인', tone: 'success' },
  rejected: { label: '반려', tone: 'danger' },
};

/**
 * §56 나간 돈 — 심사와 분류별 합계.
 *
 * 분류별 합계는 **서버가 준 것을 그대로 보여 준다** (C43-b · 대표 지시 「전부 단일 진실원」).
 * 전에는 여기서 지출 줄을 직접 더했는데, 머리의 「남은 돈」과 같은 돈을 두 곳에서 세는 일이었다.
 */
export function ExpenseReview({ expenses, totals, categories = [], me }: { expenses: Expense[]; totals: ExpenseTotal[]; categories?: ExpenseCategory[]; me: Me | null }) {
  const pending = expenses.filter((e) => e.state === 'pending');
  const settled = expenses.filter((e) => e.state !== 'pending');
  const [pickedId, setPickedId] = useState<number | null>(null);
  const picked = pending.find((e) => e.id === pickedId) ?? null;
  const review = useReviewExpense();
  const [form, setForm] = useState({ amount: '', reason: '' });
  const [armed, setArmed] = useState<'approve' | 'reject' | null>(null);

  const amount = Number(form.amount);
  const mine = picked !== null && me !== null && picked.requesterId === me.id;
  const overRequest =
    picked?.requestedAmount != null && form.amount !== '' && Number.isInteger(amount) && amount > picked.requestedAmount;
  const differs = picked?.requestedAmount != null && form.amount !== '' && amount !== picked.requestedAmount;
  const canApprove =
    picked !== null && !mine && picked.hasReceipt && form.amount !== '' && Number.isInteger(amount) && amount >= 0
    && !overRequest && !(differs && !form.reason.trim()) && !review.isPending;
  const canReject = picked !== null && !mine && form.reason.trim() !== '' && !review.isPending;

  const send = (decision: 'approve' | 'reject') => {
    if (!picked) return;
    review.mutate(
      {
        id: picked.id,
        body: {
          decision,
          ...(decision === 'approve' ? { amount } : {}),
          ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
        },
      },
      { onSettled: () => { setArmed(null); setForm({ amount: '', reason: '' }); setPickedId(null); } },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title="분류별 지출" sub="확정된 것만 셉니다 — 결재 중인 신청은 아직 나간 돈이 아닙니다 (A-D5 간이 5분류 + 임대료)">
        {totals.length === 0 ? (
          <p className="px-1 py-4 text-center text-[13px] text-fg-subtle">확정된 지출이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {totals.map((t) => (
              <span key={t.category} className="rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px]">
                <span className="text-fg-subtle">{t.categoryLabel}</span> <b className="ml-1 text-fg">{won(t.sum)}</b>
              </span>
            ))}
          </div>
        )}
      </Panel>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Panel className="lg:w-[360px] lg:shrink-0" title={`법인카드 · 대기 ${pending.length}건`} sub="누르면 오른쪽에서 심사합니다">
          {/* 「+ 지출 등록」 (C94-d · H-83) — 올리면 언제나 대기다. 분류 낱말은 서버가 준 것 */}
          {categories.length > 0 ? (
            <div className="mb-2 flex justify-end"><ExpenseCreateButton categories={categories} /></div>
          ) : null}
          {pending.length === 0 ? (
            <p className="px-1 py-5 text-center text-[13px] text-fg-subtle">심사할 신청이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pending.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    aria-pressed={picked?.id === e.id}
                    onClick={() => { setPickedId(e.id); setArmed(null); setForm({ amount: '', reason: '' }); }}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      picked?.id === e.id ? 'border-primary bg-primary/5' : 'border-line bg-card hover:border-primary/50'
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px] font-bold text-fg">
                        {e.merchant ?? '—'} <span className="ml-1 font-normal text-fg-subtle">{e.categoryLabel}</span>
                      </span>
                      <span className="shrink-0 text-[12px] font-bold text-fg">{won(e.requestedAmount)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
                      <span className="min-w-0 grow truncate">{e.spendOn} · {e.requesterName ?? '—'}</span>
                      {e.hasReceipt ? null : <Chip size="compact" tone="danger">영수증 없음</Chip>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="min-w-0 grow" title={picked ? `심사 · ${picked.merchant ?? '—'}` : '심사'} sub="신청 금액은 안내일 뿐입니다 — 확정 금액은 직접 넣습니다 (A-1). 증액은 없습니다 (A-D3)">
          {!picked ? (
            <p className="px-1 py-8 text-center text-[13px] text-fg-subtle">왼쪽에서 신청을 골라 주세요.</p>
          ) : (
            <>
              <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-line bg-inset px-3 py-2.5 text-[12.5px] sm:grid-cols-4">
                <span><dt className="text-[11px] text-fg-subtle">사용일</dt><dd className="font-bold text-fg">{picked.spendOn}</dd></span>
                <span><dt className="text-[11px] text-fg-subtle">분류</dt><dd className="font-bold text-fg">{picked.categoryLabel}</dd></span>
                <span>
                  <dt className="text-[11px] text-fg-subtle">신청자</dt>
                  <dd className="font-bold text-fg">
                    {picked.requesterName ?? '—'}
                    {/* 대신 올린 건이면 누가 올렸는지도 적는다 — 그 사람도 심사하지 못한다 (S2) */}
                    {picked.filedById != null && picked.filedById !== picked.requesterId
                      ? <span className="ml-1 text-[11px] font-normal text-fg-subtle">· {picked.filedByName ?? '—'} 대신 올림</span>
                      : null}
                  </dd>
                </span>
                <span><dt className="text-[11px] text-fg-subtle">신청 금액</dt><dd className="font-bold text-fg">{won(picked.requestedAmount)}</dd></span>
              </dl>
              {picked.purpose ? <p className="mb-3 text-[12.5px] text-fg">{picked.purpose}</p> : null}

              {mine ? (
                <Banner tone="warning" className="mb-3">
                  본인이 올린 신청입니다 — 금액을 제안하는 사람과 확정하는 사람은 다릅니다. 다른 심사자가 처리해야 합니다 (A-5).
                </Banner>
              ) : null}
              {picked.hasReceipt ? null : (
                <Banner tone="warning" className="mb-3">영수증이 없습니다 — 승인할 수 없고 반려만 가능합니다 (A-4).</Banner>
              )}

              <div className="flex flex-wrap items-end gap-2.5">
                <span className="w-[190px]">
                  <Label htmlFor="exp-amount" hint="신청 금액">확정 금액</Label>
                  <Input
                    id="exp-amount"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form.amount}
                    placeholder={picked.requestedAmount === null ? '' : String(picked.requestedAmount)}
                    onChange={(e) => { setForm({ ...form, amount: e.target.value }); setArmed(null); }}
                    error={overRequest}
                  />
                </span>
                <span className="min-w-[200px] grow">
                  <Label htmlFor="exp-reason" hint={differs ? '필수' : '반려 시 필수'}>사유</Label>
                  <Input
                    id="exp-reason"
                    value={form.reason}
                    onChange={(e) => { setForm({ ...form, reason: e.target.value }); setArmed(null); }}
                    placeholder="감액·반려 사유"
                  />
                </span>
                <Button
                  variant={armed === 'approve' ? 'primary' : 'secondary'}
                  disabled={!canApprove}
                  onClick={() => (armed === 'approve' ? send('approve') : setArmed('approve'))}
                >
                  {armed === 'approve' ? '한 번 더 누르면 승인' : '승인'}
                </Button>
                <Button
                  variant={armed === 'reject' ? 'primary' : 'secondary'}
                  disabled={!canReject}
                  onClick={() => (armed === 'reject' ? send('reject') : setArmed('reject'))}
                >
                  {armed === 'reject' ? '한 번 더 누르면 반려' : '반려'}
                </Button>
              </div>

              {overRequest ? (
                <Banner tone="danger" className="mt-2">
                  신청 금액 {won(picked.requestedAmount)}보다 크게 승인할 수 없습니다 — 증액은 재신청으로 처리합니다 (A-D3).
                </Banner>
              ) : differs && !form.reason.trim() ? (
                <Banner tone="warning" className="mt-2">신청 금액과 다릅니다 — 사유를 적어야 승인됩니다 (A-3).</Banner>
              ) : null}
              {review.isError ? <Banner tone="danger" className="mt-2">{apiMessage(review.error)}</Banner> : null}
            </>
          )}
        </Panel>
      </div>

      <Panel title={`심사 끝난 건 · ${settled.length}건`} sub="승인된 것만 분류별 합계와 대표 보고에 들어갑니다">
        {settled.length === 0 ? (
          <p className="px-1 py-4 text-center text-[13px] text-fg-subtle">아직 없습니다.</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {settled.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2">
                <span className="w-24 shrink-0 text-[12px] font-bold text-fg">{e.spendOn}</span>
                <span className="w-24 shrink-0 text-[11.5px] text-fg-subtle">{e.categoryLabel}</span>
                <span className="min-w-0 grow truncate text-[12.5px] text-fg">{e.merchant ?? '—'} <span className="text-fg-subtle">{e.purpose ?? ''}</span></span>
                <span className="w-28 shrink-0 text-right text-[12.5px] font-bold text-fg">{won(e.amount)}</span>
                <Chip size="compact" tone={STATE[e.state]?.tone ?? 'warning'}>{STATE[e.state]?.label ?? e.state}</Chip>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
