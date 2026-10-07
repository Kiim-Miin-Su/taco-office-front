/** @file-guide
 * 목적: 최종 관리자 수정사항 p106·p112와 Figma A24의 환불·할인 조정 입력을 생성 계약 전 Front 경계로 제공한다. (component)
 * 책임/재사용: 기존 청구서 학생 projection과 공용 Field/Panel을 재사용하며 승인·금액 반영·이력은 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useId, useMemo, useState } from 'react';
import type { Invoice } from '@/api/types';
import { Banner, Button, Chip, FieldError, Input, Label, Panel, Select, Textarea } from '@/components/ui';

type AdjustmentKind = '' | 'discount' | 'refund' | 'sibling_discount' | 'carry';

const REQUIRED_CONTRACT = [
  '중복 제출 방지 · 동시 수정 확인',
  '대표 승인 · 반려 사유',
  '청구 반영 · 취소 · 되돌리기',
  '실제 처리자 · 변경 이력 · 알림',
] as const;

export function AdjustmentContractBoundary({ invoices, onOpenInvoices }: {
  invoices: readonly Invoice[];
  onOpenInvoices: () => void;
}) {
  const id = useId();
  const [effectiveOn, setEffectiveOn] = useState('');
  const [kind, setKind] = useState<AdjustmentKind>('');
  const [studentId, setStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const amountNumber = Number(amount);
  const amountError = amount !== '' && (!Number.isInteger(amountNumber) || amountNumber <= 0);
  const students = useMemo(() => {
    const byId = new Map<number, { id: number; label: string }>();
    for (const invoice of invoices) {
      if (!byId.has(invoice.studentId)) {
        const tag = invoice.studentTag ? ` · ${invoice.studentTag}` : '';
        byId.set(invoice.studentId, { id: invoice.studentId, label: `${invoice.studentName}${tag}` });
      }
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  }, [invoices]);
  const clear = () => {
    setEffectiveOn('');
    setKind('');
    setStudentId('');
    setReason('');
    setAmount('');
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1"><Chip tone="warning">저장 기능 준비 중</Chip></div>
            <h2 className="text-[15px] font-bold text-fg">조정 — 환불 · 할인</h2>
            <p className="mt-1 text-[12px] text-fg-subtle">환불과 할인은 대표 승인 후 반영됩니다</p>
          </div>
          <Button size="sm" variant="secondary" onClick={onOpenInvoices}>청구서 보기</Button>
        </header>

        <Banner tone="warning" className="mb-4">
          <b>승인 전 청구 금액은 바뀌지 않습니다.</b> 조정 요청·대표 승인·청구 반영을 한 번에 안전하게 처리할 수 있을 때까지 제출을 잠급니다.
        </Banner>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="조정 등록 입력">
          <div>
            <Label htmlFor={`${id}-on`}>적용 일자</Label>
            <Input id={`${id}-on`} type="date" value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} />
          </div>
          <div>
            <Label htmlFor={`${id}-kind`}>구분</Label>
            <Select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value as AdjustmentKind)}>
              <option value="">선택</option>
              <option value="discount">할인</option>
              <option value="refund">환불</option>
              <option value="sibling_discount">형제 할인</option>
              <option value="carry">이월</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-student`}>학생</Label>
            <Select id={`${id}-student`} value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">선택</option>
              {students.map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <Label htmlFor={`${id}-amount`} hint="원 단위">금액</Label>
            <Input id={`${id}-amount`} type="number" min={1} step={1} inputMode="numeric" value={amount}
              error={amountError} aria-invalid={amountError} onChange={(event) => setAmount(event.target.value)} />
            <FieldError>{amountError ? '1원 이상의 정수로 적어 주세요' : undefined}</FieldError>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <Label htmlFor={`${id}-reason`} hint={`${reason.length} / 500`}>사유</Label>
            <Textarea id={`${id}-reason`} rows={2} maxLength={500} value={reason}
              onChange={(event) => setReason(event.target.value)} placeholder="조정 근거를 적어 주세요" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-fg-subtle">초안은 이 화면에만 있으며 서버·청구서·대표 보고에는 기록되지 않습니다.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={clear}>입력 지우기</Button>
            <Button size="sm" disabled title="조정 생성과 대표 승인 기능이 준비된 뒤 사용할 수 있습니다">승인 요청 기능 준비 중</Button>
          </div>
        </div>
      </Panel>

      <Panel title="조정 원장" sub="승인 대기 · 승인 · 반려 · 반영 취소 · 되돌리기를 같은 변경 이력으로 확인합니다">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="조정 원장 필요 필드">
          {REQUIRED_CONTRACT.map((field) => (
            <div key={field} className="rounded-lg border border-line bg-inset px-3 py-2 text-[12px] font-bold text-fg-2">{field}</div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-fg-subtle">현재 중앙 결재에는 조정 종류가 없습니다. 기존 지출·시급 보정 승인으로 합치지 않습니다.</p>
      </Panel>
    </div>
  );
}
