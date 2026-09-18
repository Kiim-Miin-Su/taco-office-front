/** @file-guide
 * 목적: ExpenseForm.tsx — ExpenseCreateButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §56 「+ 지출 등록」 (C94-d · 테스트 시나리오 H-83 「직원이 등록하면 pending · 바로 확정되면 실패」).
 *
 * 화면이 보내는 것은 **사용일 · 분류 · 가맹점 · 용도 · 신청 금액 · 영수증 파일 id** 뿐이다 — 상태도 확정 금액도 보내지 않는다.
 * 서버가 언제나 `pending` 으로 넣고(A-1), 확정은 심사(`ExpenseReview`)에서만 한다. 분류 낱말은 서버가 준 `expenseCategories`
 * 다(D-R18). 영수증은 공용 `POST /files`(kind expense-receipt)로 먼저 올리고 그 id 를 준다 — 없이 올릴 수는 있지만
 * 승인은 안 된다(A-4)는 것을 창이 미리 말한다. 모달은 공용 `Dialog`, 입력은 `Input`·`Select` — 다른 창과 같은 모양이다.
 */
'use client';
import { useId, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Select } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useCreateExpense, useUploadFile } from '@/api/queries';
import type { Expense, ExpenseCategory, ExpenseCreate } from '@/api/types';
import { fileUploadBody } from '@/lib/file-upload';
import { todayKst } from '@/lib/calendar';

export interface ExpenseCreateButtonProps {
  categories: ExpenseCategory[];
  /** 등록이 끝난 뒤 — 부모가 목록을 다시 읽는다(훅이 회계 갈래를 버린다) */
  onDone?: (made: Expense) => void;
}

export function ExpenseCreateButton({ categories, onDone }: ExpenseCreateButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [spendOn, setSpendOn] = useState(todayKst());
  // 분류 코드값의 형은 생성 계약에서 온다 — 화면이 코드표를 다시 적지 않는다
  const [category, setCategory] = useState<ExpenseCreate['category'] | ''>('');
  const [merchant, setMerchant] = useState('');
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const create = useCreateExpense();
  const upload = useUploadFile();

  const openDialog = () => {
    setSpendOn(todayKst()); setCategory((categories[0]?.key as ExpenseCreate['category'] | undefined) ?? ''); setMerchant(''); setPurpose(''); setAmount(''); setReceipt(null); setErr(null);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const pending = create.isPending || upload.isPending;
  const won = Number(amount);
  const ready = /^\d{4}-\d{2}-\d{2}$/.test(spendOn) && category !== '' && amount !== '' && Number.isInteger(won) && won > 0 && !pending;

  const submit = async () => {
    if (!ready) return;
    setErr(null);
    try {
      // 영수증부터 — 파일이 먼저 있어야 지출이 그것을 가리킨다. 실패하면 지출도 만들지 않는다
      let receiptFileId: number | undefined;
      if (receipt) {
        const ref = await upload.mutateAsync(await fileUploadBody(receipt, 'expense-receipt'));
        receiptFileId = ref.id;
      }
      const made = await create.mutateAsync({
        spendOn, category, requestedAmount: won,
        ...(merchant.trim() ? { merchant: merchant.trim() } : {}),
        ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
        ...(receiptFileId ? { receiptFileId } : {}),
      });
      onDone?.(made);
      close();
    } catch (e) {
      setErr(apiMessage(e));
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={openDialog}>+ 지출 등록</Button>
      <Dialog
        open={open}
        onClose={close}
        title="지출 등록"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" onClick={() => void submit()} disabled={!ready}>{pending ? '올리는 중…' : '등록'}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-on`}>사용일</Label>
              <Input id={`${id}-on`} type="date" value={spendOn} onChange={(e) => setSpendOn(e.target.value)} disabled={pending} />
            </div>
            <div>
              <Label htmlFor={`${id}-cat`}>분류</Label>
              <Select id={`${id}-cat`} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCreate['category'])} disabled={pending}>
                {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-merchant`}>가맹점</Label>
              <Input id={`${id}-merchant`} value={merchant} maxLength={80} onChange={(e) => setMerchant(e.target.value)} disabled={pending} placeholder="예: 문구점" />
            </div>
            <div>
              <Label htmlFor={`${id}-amount`} hint="원">신청 금액</Label>
              <Input id={`${id}-amount`} type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
            </div>
          </div>
          <div>
            <Label htmlFor={`${id}-purpose`}>용도</Label>
            <Input id={`${id}-purpose`} value={purpose} maxLength={300} onChange={(e) => setPurpose(e.target.value)} disabled={pending} placeholder="예: 화이트보드 마커" />
          </div>
          <div>
            <Label htmlFor={`${id}-receipt`} hint="없으면 승인되지 않습니다 (A-4)">영수증</Label>
            <input
              id={`${id}-receipt`} type="file" accept="image/*,.pdf" disabled={pending}
              className="block w-full text-[12px] text-fg-2 file:mr-2 file:rounded-md file:border file:border-line file:bg-card file:px-2 file:py-1 file:text-[12px]"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            />
          </div>
          <p className="text-[11px] text-fg-subtle">
            올리면 <b>심사 대기</b>로 들어갑니다 — 확정 금액은 대표가 심사에서 넣고, 신청 금액은 그 칸의 안내일 뿐입니다 (A-1).
            본인이 올린 신청은 본인이 심사할 수 없습니다 (A-5).
          </p>
          {err ? <Banner tone="danger">{err}</Banner> : null}
        </div>
      </Dialog>
    </>
  );
}
