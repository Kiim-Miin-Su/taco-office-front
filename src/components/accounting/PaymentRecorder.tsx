/** @file-guide
 * 목적: PaymentRecorder.tsx — PaymentRecorder (component)
 * 책임/재사용: 회계 도메인 표현과 입력만 소유한다. 금액 표기는 lib/money, 판정·누계는 서버 응답을 그대로 쓴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §53 ⑤ 입금 기록 · §55 들어온 돈 — **분납은 줄을 늘린다** (A-D2 채택 · C36-a).
 *
 * 잔액은 `placeholder` 로만 보여 준다 (ACCOUNTING §0 · §2) — `value` 에 미리 채우면
 * 사람이 **확인하지 않고 그대로 저장**한다. 「아직 아무도 확인하지 않았다」와 「확인해서 이 금액이다」가
 * 구분되지 않으면 대사(reconciliation) 자체가 성립하지 않는다.
 *
 * 누계·상태 전이·초과 거절은 **서버가 한다.** 화면은 더하지 않고, 거절 문구를 그대로 그린다.
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useCreatePayment, useDeletePayment } from '@/api/queries';
import type { Invoice, Payment, PaymentCreate } from '@/api/types';
import { Banner, Button, Chip, Input, Label, Panel, Select } from '@/components/ui';
import { won } from '@/lib/money';

/** 받을 돈 — 발행됐고 아직 다 안 들어온 청구서만 고를 수 있다 (§53 ②③⑤ 단계) */
const OPEN_STATES = new Set(['sent', 'unpaid', 'partial']);

/** 수단은 생성 타입이 정본이다 — 화면에서 문자열을 새로 만들지 않는다 */
type PayMethod = NonNullable<PaymentCreate['method']>;
const METHOD_LABEL: Record<PayMethod, string> = { transfer: '계좌', cash: '현금' };

export function PaymentRecorder({ invoices, payments }: { invoices: Invoice[]; payments: Payment[] }) {
  const open = invoices.filter((i) => OPEN_STATES.has(i.state));
  const [pickedId, setPickedId] = useState<number | null>(null);
  const picked = invoices.find((i) => i.id === pickedId) ?? null;
  const lines = picked ? payments.filter((p) => p.invId === picked.id) : [];

  const create = useCreatePayment();
  const remove = useDeletePayment();
  const [form, setForm] = useState<{ amount: string; paidOn: string; method: PayMethod; reason: string }>({
    amount: '', paidOn: '', method: 'transfer', reason: '',
  });
  const [armedId, setArmedId] = useState<number | null>(null);

  const amount = Number(form.amount);
  const canSubmit =
    picked !== null && form.paidOn !== '' && Number.isInteger(amount) && amount > 0 && !create.isPending;

  const submit = () => {
    if (!picked || !canSubmit) return;
    create.mutate(
      {
        invId: picked.id,
        amount,
        paidOn: form.paidOn,
        ...(form.method ? { method: form.method } : {}),
        ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
      },
      { onSuccess: () => setForm({ amount: '', paidOn: '', method: form.method, reason: '' }) },
    );
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Panel
        className="lg:w-[340px] lg:shrink-0"
        title={`받을 돈 · ${open.length}건`}
        sub="발행된 청구서만 입금을 붙일 수 있습니다"
      >
        {open.length === 0 ? (
          <p className="px-1 py-5 text-center text-[13px] text-fg-subtle">다 받았습니다 — 열린 청구서가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {open.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => { setPickedId(i.id); setArmedId(null); }}
                  aria-pressed={picked?.id === i.id}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    picked?.id === i.id ? 'border-primary bg-primary/5' : 'border-line bg-card hover:border-primary/50'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-bold text-fg">
                      {i.studentName} <span className="font-normal text-fg-subtle">{i.grade ?? ''}</span>
                      <span className="ml-1 font-normal text-fg-subtle">{i.yearMonth}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-bold text-fg">{won(i.amount)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
                    <span className="min-w-0 grow truncate">{i.title}</span>
                    {i.state === 'partial' ? <Chip size="compact" tone="warning">일부 {won(i.paidAmount)}</Chip> : null}
                    {i.overdueDays > 0 ? <Chip size="compact" tone="danger">연체 {i.overdueDays}일</Chip> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        className="min-w-0 grow"
        title={picked ? `입금 기록 · ${picked.studentName}` : '입금 기록'}
        sub="한 청구서에 여러 줄로 나눠 받습니다 — 누계와 상태는 서버가 셉니다. 남은 금액은 회색 안내로만 보입니다 (A-D2)"
      >
        {!picked ? (
          <p className="px-1 py-8 text-center text-[13px] text-fg-subtle">왼쪽에서 청구서를 골라 주세요.</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg border border-line bg-inset px-3 py-2.5 text-center">
              <span>
                <span className="block text-[11px] text-fg-subtle">청구</span>
                <b className="text-[13.5px] text-fg">{won(picked.amount)}</b>
              </span>
              <span>
                <span className="block text-[11px] text-fg-subtle">누계</span>
                <b className="text-[13.5px] text-fg">{won(picked.paidAmount)}</b>
              </span>
              <span>
                <span className="block text-[11px] text-fg-subtle">남은 금액</span>
                <b className={`text-[13.5px] ${picked.remaining === 0 ? 'text-fg-subtle' : 'text-red'}`}>
                  {won(picked.remaining)}
                </b>
              </span>
            </div>

            {lines.length === 0 ? (
              <p className="mb-3 px-1 py-3 text-center text-[12.5px] text-fg-subtle">아직 들어온 줄이 없습니다.</p>
            ) : (
              <ol className="mb-3 flex flex-col gap-1.5">
                {lines.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2">
                    <span className="w-24 shrink-0 text-[12px] font-bold text-fg">{p.paidOn ?? '미확인'}</span>
                    <span className="w-24 shrink-0 text-right text-[12.5px] font-bold text-fg">{won(p.amount, { empty: '미확인' })}</span>
                    <span className="w-12 shrink-0 text-[11.5px] text-fg-subtle">{p.method ? (METHOD_LABEL[p.method as PayMethod] ?? p.method) : '—'}</span>
                    <span className="min-w-0 grow truncate text-[11.5px] text-fg-subtle">{p.reason ?? ''}</span>
                    {picked.state === 'paid' ? null : (
                      <Button
                        size="sm"
                        variant={armedId === p.id ? 'primary' : 'secondary'}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (armedId === p.id) remove.mutate(p.id, { onSettled: () => setArmedId(null) });
                          else setArmedId(p.id);
                        }}
                      >
                        {armedId === p.id ? '한 번 더 누르면 삭제' : '삭제'}
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {picked.state === 'paid' ? (
              <Banner tone="success">완납됐습니다 — 줄을 더하거나 지울 수 없습니다. 정정·환불은 별도 승인으로 처리하세요.</Banner>
            ) : (
              <div className="flex flex-wrap items-end gap-2.5">
                <span className="w-[190px]">
                  <Label htmlFor="pay-amount" hint="남은 금액">이번에 들어온 금액</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={form.amount}
                    placeholder={picked.remaining === null ? '' : String(picked.remaining)}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </span>
                <span className="w-[150px]">
                  <Label htmlFor="pay-date">입금일</Label>
                  <Input id="pay-date" type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} />
                </span>
                <span className="w-[110px]">
                  <Label htmlFor="pay-method">수단</Label>
                  <Select id="pay-method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PayMethod })}>
                    <option value="transfer">계좌</option>
                    <option value="cash">현금</option>
                  </Select>
                </span>
                <span className="min-w-[180px] grow">
                  <Label htmlFor="pay-reason" hint="선택">사유 · 회차 메모</Label>
                  <Input id="pay-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="2회차 분납" />
                </span>
                <Button variant="primary" disabled={!canSubmit} onClick={submit}>
                  {create.isPending ? '기록 중…' : '입금 기록'}
                </Button>
              </div>
            )}

            {create.isError ? <Banner tone="danger" className="mt-2">{apiMessage(create.error)}</Banner> : null}
            {remove.isError ? <Banner tone="danger" className="mt-2">{apiMessage(remove.error)}</Banner> : null}
          </>
        )}
      </Panel>
    </div>
  );
}
