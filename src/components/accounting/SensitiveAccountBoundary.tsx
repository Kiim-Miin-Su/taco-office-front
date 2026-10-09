/** @file-guide
 * 목적: 최종 관리자 수정사항 p95·p110·p115와 Figma A27의 학생 환불·강사 지급 보호 계좌 CRUD를 제공한다. (component)
 * 책임/재사용: 생성 DTO·Query mutation과 공용 Field/Dialog/Panel을 사용하며 일반 화면에는 서버가 준 마지막 4자리만 표시한다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-11D1-PROTECTED-ACCOUNT-2026-10-09.md · docs/contracts/FILE-GUIDE.md
 */
'use client';
import { useId, useMemo, useState } from 'react';
import { apiMessage } from '@/api/client';
import {
  useDeleteProtectedAccount, useProtectedAccounts, useRevealProtectedAccount, useWriteProtectedAccount,
} from '@/api/queries';
import type { ProtectedAccount, ProtectedAccountSecret } from '@/api/types';
import { Banner, Button, Chip, Dialog, FieldError, Input, Label, Panel, QueryState, Segmented, Select } from '@/components/ui';
import { kstDateTime } from '@/lib/calendar';

type AccountPurpose = 'teacher_payout' | 'student_refund';

const requestKey = () => globalThis.crypto.randomUUID();
const purposeLabel: Record<AccountPurpose, string> = { teacher_payout: '강사 지급', student_refund: '학생 환불' };
const actionLabel: Record<ProtectedAccount['events'][number]['action'], string> = {
  created: '등록', updated: '수정', deleted: '삭제', revealed: '원문 확인',
};

export function SensitiveAccountBoundary({ onOpenInvoices, onOpenLedger }: {
  onOpenInvoices: () => void;
  onOpenLedger: () => void;
}) {
  const id = useId();
  const query = useProtectedAccounts();
  const write = useWriteProtectedAccount();
  const remove = useDeleteProtectedAccount();
  const reveal = useRevealProtectedAccount();
  const [purpose, setPurpose] = useState<AccountPurpose>('teacher_payout');
  const [targetId, setTargetId] = useState('');
  const [bank, setBank] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [holder, setHolder] = useState('');
  const [touched, setTouched] = useState({ bank: false, accountNo: false, holder: false });
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProtectedAccount | null>(null);
  const [revealing, setRevealing] = useState<ProtectedAccount | null>(null);
  const [reason, setReason] = useState('');
  const [secret, setSecret] = useState<ProtectedAccountSecret | null>(null);

  const targets = useMemo(() => (query.data?.targets ?? []).filter((target) => target.purpose === purpose), [purpose, query.data]);
  const selected = query.data?.items.find((item) => item.purpose === purpose && String(item.targetId) === targetId) ?? null;
  const normalizedAccountNo = accountNo.replace(/[\s-]/g, '');
  const last4 = /^[0-9]{4,30}$/.test(normalizedAccountNo) ? normalizedAccountNo.slice(-4) : null;
  const hasTarget = targetId !== '';
  const bankError = touched.bank && bank.trim() === '';
  const accountError = touched.accountNo && !/^[0-9]{4,30}$/.test(normalizedAccountNo);
  const holderError = touched.holder && holder.trim() === '';
  const pending = write.isPending || remove.isPending || reveal.isPending;

  const clearSecrets = () => {
    setBank('');
    setAccountNo('');
    setHolder('');
    setTouched({ bank: false, accountNo: false, holder: false });
  };
  const clearForm = () => {
    setTargetId('');
    clearSecrets();
    setError(null);
  };
  const changePurpose = (next: AccountPurpose) => {
    setPurpose(next);
    clearForm();
  };
  const changeTarget = (next: string) => {
    if (next !== targetId) clearSecrets();
    setTargetId(next);
    setError(null);
  };
  const closeReveal = () => {
    setRevealing(null);
    setReason('');
    setSecret(null);
    setError(null);
    reveal.reset();
  };
  const selectItem = (item: ProtectedAccount) => {
    setPurpose(item.purpose);
    setTargetId(String(item.targetId));
    clearSecrets();
    setError(null);
  };
  const save = () => {
    setTouched({ bank: true, accountNo: true, holder: true });
    if (!hasTarget || bank.trim() === '' || holder.trim() === '' || !/^[0-9]{4,30}$/.test(normalizedAccountNo)) return;
    setError(null);
    write.mutate({
      purpose, targetId: Number(targetId), bank: bank.trim(), accountNumber: accountNo, holder: holder.trim(),
      expectedVersion: selected?.version ?? 0, requestKey: requestKey(),
    }, {
      onSuccess: clearSecrets,
      onError: (cause) => setError(apiMessage(cause)),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1"><Chip tone="success">암호화 저장 연결됨</Chip></div>
            <h2 className="text-[15px] font-bold text-fg">계좌 — 학생 환불 · 강사 지급</h2>
            <p className="mt-1 text-[12px] text-fg-subtle">용도별 한 계좌를 등록하고 변경 이력과 처리 당시 뒤 4자리를 보존합니다</p>
          </div>
          <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={purpose === 'student_refund' ? onOpenInvoices : onOpenLedger}>
            {purpose === 'student_refund' ? '청구서 보기' : '지급 원장 보기'}
          </Button>
        </header>

        <Banner tone="warning" className="mb-4">
          <b>대표와 계좌 권한을 받은 회계 담당자만</b> 다룹니다. 일반 조회에는 은행·예금주·계좌번호 원문이 없고, 원문 확인은 사유와 감사 이력을 남깁니다.
        </Banner>
        {query.isLoading ? <Banner tone="neutral" className="mb-4">계좌 대상과 저장 상태를 불러오는 중…</Banner> : null}
        {query.isError ? <Banner tone="danger" className="mb-4">{apiMessage(query.error)}</Banner> : null}
        {error ? <Banner tone="danger" className="mb-4">{error}</Banner> : null}

        <div className="mb-4">
          <Label>용도</Label>
          <Segmented<AccountPurpose> className="max-sm:[&>button]:min-h-11" ariaLabel="계좌 용도" value={purpose} onChange={changePurpose}
            options={[{ value: 'teacher_payout', label: '강사 지급' }, { value: 'student_refund', label: '학생 환불' }]} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="계좌 등록 입력">
          <div>
            <Label htmlFor={`${id}-target`}>{purpose === 'student_refund' ? '대상 학생' : '대상 강사'}</Label>
            <Select className="max-sm:h-11" id={`${id}-target`} aria-label={purpose === 'student_refund' ? '대상 학생' : '대상 강사'}
              value={targetId} disabled={!query.data?.canWrite || query.isLoading} onChange={(event) => changeTarget(event.target.value)}>
              <option value="">선택</option>
              {targets.map((target) => <option key={target.targetId} value={target.targetId}>
                {target.targetName}{target.targetTag ? ` · ${target.targetTag}` : ''}
              </option>)}
            </Select>
            {!query.isLoading && targets.length === 0 ? <p className="mt-1 text-[12px] text-fg-subtle">현재 등록 가능한 대상이 없습니다</p> : null}
            {selected ? <p className="mt-1 text-[12px] font-bold text-fg-2">
              현재 v{selected.version} · {selected.state === 'active' ? selected.maskedAccountNumber : '삭제됨'}
            </p> : null}
          </div>
          <div>
            <Label htmlFor={`${id}-bank`}>은행</Label>
            <Input className="max-sm:h-11" id={`${id}-bank`} value={bank} disabled={!hasTarget || !query.data?.canWrite || pending} autoComplete="off"
              error={bankError} aria-invalid={bankError} maxLength={80}
              onBlur={() => setTouched((value) => ({ ...value, bank: true }))}
              onChange={(event) => setBank(event.target.value)} placeholder="은행 이름" />
            <FieldError>{bankError ? '은행을 적어 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-account`}>계좌번호</Label>
            <Input className="max-sm:h-11" id={`${id}-account`} type="password" inputMode="numeric" value={accountNo}
              disabled={!hasTarget || !query.data?.canWrite || pending} autoComplete="new-password" spellCheck={false}
              error={accountError} aria-invalid={accountError} maxLength={60}
              onBlur={() => setTouched((value) => ({ ...value, accountNo: true }))}
              onChange={(event) => setAccountNo(event.target.value)} placeholder="숫자 4~30자리" />
            <FieldError>{accountError ? '숫자·공백·하이픈으로 4~30자리를 적어 주세요' : undefined}</FieldError>
            {last4 ? <p className="mt-1 text-[12px] font-bold text-fg-2">저장 후 표시 · **** {last4}</p> : null}
          </div>
          <div>
            <Label htmlFor={`${id}-holder`}>예금주</Label>
            <Input className="max-sm:h-11" id={`${id}-holder`} value={holder} disabled={!hasTarget || !query.data?.canWrite || pending}
              autoComplete="off" error={holderError} aria-invalid={holderError} maxLength={80}
              onBlur={() => setTouched((value) => ({ ...value, holder: true }))}
              onChange={(event) => setHolder(event.target.value)} placeholder="예금주 이름" />
            <FieldError>{holderError ? '예금주를 적어 주세요' : undefined}</FieldError>
          </div>
        </div>

        <div className="sticky bottom-2 z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/95 p-2 shadow-sm backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <p className="text-[12px] text-fg-subtle">대상·용도를 바꾸면 민감 초안을 즉시 지우며 저장 성공 뒤에도 입력 원문을 남기지 않습니다.</p>
          <div className="flex gap-2">
            <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={clearForm}>초안 지우기</Button>
            <Button className="max-sm:min-h-11" size="sm" disabled={pending || !query.data?.canWrite || !hasTarget}
              onClick={save}>{write.isPending ? '저장 중…' : selected?.state === 'active' ? '암호화 수정' : '암호화 저장'}</Button>
          </div>
        </div>
      </Panel>

      <Panel title="저장 계좌" sub="목록·검색·파일·알림에는 마지막 4자리만 반환합니다">
        <QueryState query={query} isEmpty={(data) => data.items.length === 0} empty="등록된 보호 계좌가 없습니다.">
          {(data) => <div className="grid gap-3 lg:grid-cols-2" aria-label="저장 계좌 목록">{data.items.map((item) => (
            <article key={item.id} className="rounded-xl border border-line bg-card p-3">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5"><Chip tone={item.state === 'active' ? 'success' : 'neutral'}>
                    {item.state === 'active' ? '사용 중' : '삭제됨'}
                  </Chip><Chip tone="info">{purposeLabel[item.purpose]}</Chip></div>
                  <h3 className="text-[14px] font-bold text-fg">{item.targetName}{item.targetTag ? ` · ${item.targetTag}` : ''}</h3>
                  <p className="mt-1 text-[13px] font-bold text-fg-2">{item.maskedAccountNumber ?? '저장 원문 삭제됨'}</p>
                  <p className="mt-1 text-[12px] text-fg-subtle">v{item.version} · {item.updatedBy} · {kstDateTime(item.updatedAt) ?? '시각 미상'}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {item.canUpdate ? <Button size="sm" variant="secondary" onClick={() => selectItem(item)}>
                    {item.state === 'active' ? '수정' : '재등록'}
                  </Button> : null}
                  {item.canReveal ? <Button size="sm" variant="ghost" onClick={() => { setRevealing(item); setReason(''); setSecret(null); setError(null); }}>원문 확인</Button> : null}
                  {item.canDelete ? <Button size="sm" variant="ghost" onClick={() => { setDeleting(item); setReason(''); setError(null); }}>삭제</Button> : null}
                </div>
              </header>
              <details className="mt-3 rounded-lg bg-inset px-3 py-2 text-[12px] text-fg-2">
                <summary className="cursor-pointer font-bold">변경 이력 {item.events.length}건</summary>
                <ol className="mt-2 space-y-1.5">{item.events.map((event, index) => <li key={`${event.createdAt}-${index}`}>
                  v{event.version} · {actionLabel[event.action]} · {event.actor} · {kstDateTime(event.createdAt) ?? '시각 미상'}{event.reason ? ` · ${event.reason}` : ''}
                </li>)}</ol>
              </details>
            </article>
          ))}</div>}
        </QueryState>
        <p className="mt-3 text-[12px] text-fg-subtle">주민등록번호 수집·조회·출력은 업무 범위와 보존 정책이 결정되지 않아 입력 경로를 만들지 않았습니다.</p>
      </Panel>

      {deleting ? <Dialog open onClose={() => { setDeleting(null); setReason(''); setError(null); }} title="보호 계좌 삭제"
        sub={`${deleting.targetName} · ${deleting.maskedAccountNumber ?? '삭제됨'}`} closeX
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { setDeleting(null); setReason(''); setError(null); }}>닫기</Button>
          <Button disabled={remove.isPending || reason.trim().length < 2} onClick={() => {
            setError(null);
            remove.mutate({ accountId: deleting.id, body: { expectedVersion: deleting.version, reason: reason.trim(), requestKey: requestKey() } }, {
              onSuccess: () => { setDeleting(null); setReason(''); if (targetId === String(deleting.targetId) && purpose === deleting.purpose) clearSecrets(); },
              onError: (cause) => setError(apiMessage(cause)),
            });
          }}>원문 삭제</Button></div>}>
        {error ? <Banner tone="danger" className="mb-3">{error}</Banner> : null}
        <Banner tone="warning" className="mb-3">삭제하면 암호화 원문과 마지막 4자리를 즉시 지웁니다. 변경 이력은 남습니다.</Banner>
        <Label htmlFor={`${id}-delete-reason`}>삭제 사유</Label>
        <Input id={`${id}-delete-reason`} value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="두 글자 이상" />
      </Dialog> : null}

      {revealing ? <Dialog open onClose={closeReveal} title="보호 계좌 원문 확인"
        sub={`${revealing.targetName} · ${revealing.maskedAccountNumber ?? '삭제됨'}`} closeX
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={closeReveal}>닫기</Button>
          {!secret ? <Button disabled={reveal.isPending || reason.trim().length < 2} onClick={() => {
            setError(null);
            reveal.mutate({ accountId: revealing.id, body: { expectedVersion: revealing.version, reason: reason.trim(), requestKey: requestKey() } }, {
              onSuccess: setSecret,
              onError: (cause) => setError(apiMessage(cause)),
            });
          }}>{reveal.isPending ? '확인 중…' : '사유를 남기고 확인'}</Button> : null}</div>}>
        {error ? <Banner tone="danger" className="mb-3">{error}</Banner> : null}
        {!secret ? <>
          <Banner tone="warning" className="mb-3">원문 확인은 별도 감사 이력으로 남습니다. 확인 목적을 구체적으로 적어 주세요.</Banner>
          <Label htmlFor={`${id}-reveal-reason`}>확인 사유</Label>
          <Input id={`${id}-reveal-reason`} value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="두 글자 이상" />
        </> : <div className="space-y-2 rounded-xl border border-line bg-inset p-3 text-[13px] text-fg-2" aria-label="계좌 원문">
          <p><b className="text-fg">은행</b> · {secret.bank}</p>
          <p><b className="text-fg">계좌번호</b> · <span className="font-bold">{secret.accountNumber}</span></p>
          <p><b className="text-fg">예금주</b> · {secret.holder}</p>
          <p className="text-[12px] text-fg-subtle">이 창을 닫으면 원문을 화면 상태에서 지웁니다.</p>
        </div>}
      </Dialog> : null}
    </div>
  );
}
