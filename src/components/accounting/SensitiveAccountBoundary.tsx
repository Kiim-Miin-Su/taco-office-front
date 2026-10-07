/** @file-guide
 * 목적: 최종 관리자 수정사항 p110·p115와 Figma A27의 학생 환불·강사 지급 계좌를 생성 계약 전 Front 보안 경계로 제공한다. (component)
 * 책임/재사용: 기존 InvoiceDto·PayoutSheetRowDto의 대상 식별자와 공용 Field/Panel을 재사용하며 계좌 권한·암호화 저장·복호화·CRUD 성공을 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useId, useMemo, useState } from 'react';
import type { Invoice, PayoutSheetRow } from '@/api/types';
import { Banner, Button, Chip, FieldError, Input, Label, Panel, Segmented, Select } from '@/components/ui';

type AccountPurpose = 'teacher_payout' | 'student_refund';

const REQUIRED_CONTRACT = [
  '암호화 값 · 암호화 키 버전 · 마지막 4자리',
  '조회 · 저장 · 원문 확인 권한',
  '생성 · 수정 · 삭제 변경 이력',
  '실제 처리자 · 중복 제출 방지 · 감사',
  '지급·환불 원장 연결 · 마스킹 기록',
  '암호화 키 누락·복호화 실패 시 접근 차단',
] as const;

export function SensitiveAccountBoundary({ invoices, payoutRows, payoutLoading, onOpenInvoices, onOpenLedger }: {
  invoices: readonly Invoice[];
  payoutRows: readonly PayoutSheetRow[];
  payoutLoading: boolean;
  onOpenInvoices: () => void;
  onOpenLedger: () => void;
}) {
  const id = useId();
  const [purpose, setPurpose] = useState<AccountPurpose>('teacher_payout');
  const [targetId, setTargetId] = useState('');
  const [bank, setBank] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [holder, setHolder] = useState('');
  const [touched, setTouched] = useState({ bank: false, accountNo: false, holder: false });

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
  const teachers = useMemo(() => {
    const byId = new Map<number, { id: number; label: string }>();
    for (const row of payoutRows) if (!byId.has(row.staffId)) byId.set(row.staffId, { id: row.staffId, label: row.staffName });
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  }, [payoutRows]);
  const targets = purpose === 'student_refund' ? students : teachers;
  const targetLabel = purpose === 'student_refund' ? '대상 학생' : '대상 강사';
  const hasTarget = targetId !== '';
  const normalizedAccountNo = accountNo.replace(/[\s-]/g, '');
  const last4 = normalizedAccountNo.length >= 4 ? normalizedAccountNo.slice(-4) : null;

  const clearSecrets = () => {
    setBank('');
    setAccountNo('');
    setHolder('');
    setTouched({ bank: false, accountNo: false, holder: false });
  };
  const changePurpose = (next: AccountPurpose) => {
    setPurpose(next);
    setTargetId('');
    clearSecrets();
  };
  const changeTarget = (next: string) => {
    if (next !== targetId) clearSecrets();
    setTargetId(next);
  };
  const clear = () => {
    setTargetId('');
    clearSecrets();
  };
  const required = (key: keyof typeof touched, value: string) => touched[key] && value.trim() === '';

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1"><Chip tone="warning">저장 기능 준비 중</Chip></div>
            <h2 className="text-[15px] font-bold text-fg">계좌 — 학생 환불 · 강사 지급</h2>
            <p className="mt-1 text-[12px] text-fg-subtle">은행 · 계좌번호 · 예금주를 용도별 대상과 연결합니다</p>
          </div>
          <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={purpose === 'student_refund' ? onOpenInvoices : onOpenLedger}>
            {purpose === 'student_refund' ? '청구서 보기' : '지급 원장 보기'}
          </Button>
        </header>

        <Banner tone="warning" className="mb-4">
          <b>대표와 계좌 권한을 받은 회계 담당자만</b> 저장 계좌를 다룹니다. 전용 권한·암호화 저장·키 실패 처리가 준비될 때까지 저장과 원문 재조회는 잠급니다.
        </Banner>

        <div className="mb-4">
          <Label>용도</Label>
          <Segmented<AccountPurpose> className="max-sm:[&>button]:min-h-11" ariaLabel="계좌 용도" value={purpose} onChange={changePurpose}
            options={[{ value: 'teacher_payout', label: '강사 지급' }, { value: 'student_refund', label: '학생 환불' }]} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="계좌 등록 입력">
          <div>
            <Label htmlFor={`${id}-target`}>{targetLabel}</Label>
            <Select className="max-sm:h-11" id={`${id}-target`} aria-label={targetLabel} value={targetId} onChange={(event) => changeTarget(event.target.value)}>
              <option value="">선택</option>
              {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
            </Select>
            {purpose === 'teacher_payout' && payoutLoading ? <p className="mt-1 text-[12px] text-fg-subtle">강사 대상을 불러오는 중…</p> : null}
            {!payoutLoading && targets.length === 0 ? <p className="mt-1 text-[12px] text-fg-subtle">현재 조회 가능한 대상이 없습니다</p> : null}
          </div>
          <div>
            <Label htmlFor={`${id}-bank`}>은행</Label>
            <Input className="max-sm:h-11" id={`${id}-bank`} value={bank} disabled={!hasTarget} autoComplete="off"
              error={required('bank', bank)} aria-invalid={required('bank', bank)}
              onBlur={() => setTouched((value) => ({ ...value, bank: true }))}
              onChange={(event) => setBank(event.target.value)} placeholder="은행 이름" />
            <FieldError>{required('bank', bank) ? '은행을 적어 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-account`}>계좌번호</Label>
            <Input className="max-sm:h-11" id={`${id}-account`} type="password" inputMode="numeric" value={accountNo} disabled={!hasTarget}
              autoComplete="new-password" spellCheck={false} error={required('accountNo', accountNo)} aria-invalid={required('accountNo', accountNo)}
              onBlur={() => setTouched((value) => ({ ...value, accountNo: true }))}
              onChange={(event) => setAccountNo(event.target.value)} placeholder="화면에 원문을 다시 표시하지 않습니다" />
            <FieldError>{required('accountNo', accountNo) ? '계좌번호를 적어 주세요' : undefined}</FieldError>
            {last4 ? <p className="mt-1 text-[12px] font-bold text-fg-2">저장 후 표시 예시 · **** {last4}</p> : null}
          </div>
          <div>
            <Label htmlFor={`${id}-holder`}>예금주</Label>
            <Input className="max-sm:h-11" id={`${id}-holder`} value={holder} disabled={!hasTarget} autoComplete="off"
              error={required('holder', holder)} aria-invalid={required('holder', holder)}
              onBlur={() => setTouched((value) => ({ ...value, holder: true }))}
              onChange={(event) => setHolder(event.target.value)} placeholder="예금주 이름" />
            <FieldError>{required('holder', holder) ? '예금주를 적어 주세요' : undefined}</FieldError>
          </div>
        </div>

        <div className="sticky bottom-2 z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/95 p-2 shadow-sm backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <p className="text-[12px] text-fg-subtle">대상·용도를 바꾸면 민감 초안을 즉시 지웁니다. 새 값은 서버·검색·로그·내보내기에 전송되지 않습니다.</p>
          <div className="flex gap-2">
            <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={clear}>초안 지우기</Button>
            <Button className="max-sm:min-h-11" size="sm" disabled title="계좌 권한과 암호화 생성·수정·삭제 기능이 준비된 뒤 사용할 수 있습니다">암호화 저장 기능 준비 중</Button>
          </div>
        </div>
      </Panel>

      <Panel title="저장 계좌" sub="목록·상세·검색·파일·알림에는 마지막 4자리만 반환합니다">
        <p className="rounded-xl border border-line bg-inset px-3 py-8 text-center text-[12px] text-fg-subtle">
          전용 조회 기능이 준비되기 전에는 저장 계좌를 표시하지 않습니다
        </p>
        <p className="mt-3 text-[12px] text-fg-subtle">주민등록번호 수집·조회·출력은 업무 범위와 보존 정책이 결정되기 전까지 입력 경로를 만들지 않습니다.</p>
      </Panel>

      <Panel title="계좌 보안·변경 기준" sub="생성·수정·삭제·복호화는 같은 권한과 변경 이력·감사 규칙으로 처리합니다">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="계좌 계약 필요 필드">
          {REQUIRED_CONTRACT.map((field) => (
            <div key={field} className="rounded-lg border border-line bg-inset px-3 py-2 text-[12px] font-bold text-fg-2">{field}</div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-fg-subtle">기존 회계 금액 권한을 계좌 권한으로 간주하지 않습니다. 회계 담당자 범위·원문 확인 목적·보존 기간은 별도 정책으로 확정합니다.</p>
      </Panel>
    </div>
  );
}
