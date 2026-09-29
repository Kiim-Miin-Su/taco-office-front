/** @file-guide
 * 목적: ManualPaymentForm.tsx — ManualPaymentButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §55 「+ 결제 등록」 — **청구서 없이 들어온 돈**(교재비 · 조정 등)을 매니저가 직접 적는다.
 *
 * A-D1(2026-08-25 확정)이 「청구서를 만들어 보내는 것 + 매니저가 직접 입력 둘 다」를 정했다. 청구서가 있는 입금은
 * 「입금 기록」에서 그 청구서에 붙이고(누계·완납 전이는 서버), 여기는 붙일 청구서가 없는 돈만 받는다.
 * 화면이 보내는 것은 **학생 · 금액 · 입금일 · 수단 · 사유**뿐이다 — 분류(「기타」)와 누가 넣었는지는 서버가 정한다(N-37 ③).
 * 금액은 비워서 연다 — 미리 채우면 확인하지 않고 그대로 저장한다(ACCOUNTING §0). 모달은 공용 `Dialog`, 입력은 `Input`·`Select`.
 */
'use client';
import { useId, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Select } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useCreateManualPayment, useMeta } from '@/api/queries';
import { todayKst } from '@/lib/calendar';
import { useRequestKey } from '@/lib/request-key';
import { METHOD_LABEL, type PayMethod } from './PaymentRecorder';

export function ManualPaymentButton() {
  const id = useId();
  const [open, setOpen] = useState(false);
  // 학생 목록은 창을 열 때만 읽는다 — 회계 화면에 들어올 때마다 받지 않는다(C50 이 고친 자리)
  const meta = useMeta(open);
  const [studentId, setStudentId] = useState('');
  const [paidOn, setPaidOn] = useState(todayKst());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('transfer');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const create = useCreateManualPayment();
  // 안건 N-132 — 실패 뒤 같은 내용으로 다시 누르면 같은 키(서버가 앞선 줄로 수렴) · 고치면 새 키 · 성공하면 다음은 새 입금
  const requestKey = useRequestKey();

  const openDialog = () => {
    setStudentId(''); setPaidOn(todayKst()); setAmount(''); setMethod('transfer'); setReason(''); setErr(null);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const won = Number(amount);
  const ready = studentId !== '' && /^\d{4}-\d{2}-\d{2}$/.test(paidOn) && amount !== ''
    && Number.isInteger(won) && won > 0 && reason.trim() !== '' && !create.isPending;

  const submit = async () => {
    if (!ready) return;
    setErr(null);
    try {
      const body = { studentId: Number(studentId), amount: won, paidOn, method, reason: reason.trim() };
      await create.mutateAsync({ ...body, requestKey: requestKey.keyFor(body) });
      requestKey.reset();
      close();
    } catch (e) {
      setErr(apiMessage(e));
    }
  };

  return (
    <>
      <Button type="button" size="sm" onClick={openDialog}>+ 결제 등록</Button>
      <Dialog
        open={open}
        onClose={close}
        title="결제 등록"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={create.isPending}>취소 (Esc)</Button>
            <Button type="button" onClick={() => void submit()} disabled={!ready}>{create.isPending ? '적는 중…' : '등록'}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-fg-subtle">
            청구서가 없는 돈(교재비 · 조정 등)만 여기서 적습니다. 청구서가 있는 입금은 「입금 기록」에서 그 청구서에 붙입니다.
          </p>
          <div>
            <Label htmlFor={`${id}-stu`}>학생</Label>
            <Select id={`${id}-stu`} value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={create.isPending}>
              <option value="">학생을 고르세요</option>
              {(meta.data?.students ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-on`}>입금일</Label>
              <Input id={`${id}-on`} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} disabled={create.isPending} />
            </div>
            <div>
              <Label htmlFor={`${id}-amount`} hint="원">금액</Label>
              <Input id={`${id}-amount`} type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={create.isPending} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-method`}>수단</Label>
              <Select id={`${id}-method`} value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} disabled={create.isPending}>
                {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-reason`}>무엇에 대한 돈인가</Label>
              <Input id={`${id}-reason`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} disabled={create.isPending} placeholder="예: 교재비" />
            </div>
          </div>
          <p className="text-[11px] text-fg-subtle">적으면 「들어온 돈」의 <b>기타</b> 분류로 들어갑니다 — 넣은 사람이 함께 남습니다.</p>
          {err ? <Banner tone="danger">{err}</Banner> : null}
        </div>
      </Dialog>
    </>
  );
}
