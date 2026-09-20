/** @file-guide
 * 목적: InvoiceIssuer.tsx — InvoiceIssuer (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §53 「+ 새 청구서 발행」.
 *
 * **이 화면은 줄을 만들지 않는다.** 누구의 어느 달인지만 보낸다 —
 * 과목별 회차·단가·소계·합계는 전부 서버가 만든다. 원문 명세가 그렇게 적었다:
 * 「INV_LINE 의 횟수는 `occ()` 가 센다 · 프론트가 세면 예외(EXC)를 빠뜨린다」(D-R37).
 *
 * 그래서 여기 미리보기가 없다. 미리보기를 그리려면 화면이 회차를 세야 하고,
 * 그 순간 세는 자리가 둘이 된다. **낸 뒤에 줄이 보인다.**
 *
 * 거절도 전부 서버가 한다 — 그 달에 수업이 없거나(INV_NO_LESSONS), 단가표에 없는 과목이 있거나
 * (INV_NO_RATE), 같은 학생·달·종류가 이미 있으면(INV_DUPLICATE) 서버가 이유를 문장으로 준다.
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Chip, Input, Label, Panel, Select } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useIssueInvoice, useIssueInvoiceBatch, useMeta } from '@/api/queries';
import type { Invoice, InvoiceBatchResult, InvoiceIssue } from '@/api/types';
import { won } from '@/lib/money';

/* 낱말은 생성 타입에서 온다 — 화면에 코드표를 다시 적으면 서버와 갈린다 (D-R18) */
type InvType = InvoiceIssue['invType'];

/** 이번 달을 YYYY-MM 으로. 기본값일 뿐이고 판정에 쓰지 않는다 */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function InvoiceIssuer() {
  const [open, setOpen] = useState(false);
  // 학생 목록은 **폼을 열 때만** 읽는다 — 청구서를 안 내는 사람에게까지 코드표를 받아 올 이유가 없다
  const meta = useMeta(open);
  const issue = useIssueInvoice();
  const [studentId, setStudentId] = useState('');
  const [yearMonth, setYearMonth] = useState(thisMonth);
  const [invType, setInvType] = useState<InvType>('tuition');
  /* 납부 기한 — **미리 채우지 않는다**(대표 결정 2026-09-20 · S3). 원문 §53 은 기한이 있는 모습만 보여 주고
     어떻게 정하는지는 보여 주지 않는다 — 「발행일 + N일」을 화면이 지어내면 없는 업무 규칙이 생긴다(D-R44). */
  const [dueOn, setDueOn] = useState('');
  const [made, setMade] = useState<Invoice | null>(null);
  // 일괄 발행 (C94-a · H-75) — 달 하나만 보낸다. 누구에게 낼지·이월·단가는 서버가 정한다
  const batch = useIssueInvoiceBatch();
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMonth, setBatchMonth] = useState(thisMonth);
  const [batchResult, setBatchResult] = useState<InvoiceBatchResult | null>(null);
  const [batchDue, setBatchDue] = useState('');

  const ready = studentId !== '' && /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth) && dueOn !== '';
  const batchReady = /^\d{4}-(0[1-9]|1[0-2])$/.test(batchMonth) && batchDue !== '' && !batch.isPending;

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => { setBatchOpen((v) => !v); setBatchResult(null); }}>
          {batchOpen ? '일괄 발행 닫기' : '청구서 일괄 발행'}
        </Button>
        <Button onClick={() => { setOpen((v) => !v); setMade(null); }}>
          {open ? '닫기' : '+ 새 청구서 발행'}
        </Button>
      </div>

      {batchOpen ? (
        <Panel
          className="mb-4"
          title="청구서 일괄 발행"
          sub="그 달 수업이 있는 학생 전부에게 수업료 청구서를 냅니다 — 이월·단가 구간·휴강·휴원은 낱장 발행과 같은 계산입니다. 막힌 학생은 건너뛰고 이유를 보여 줍니다"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="ivb-ym">달</Label>
              <Input id="ivb-ym" type="month" value={batchMonth} onChange={(e) => setBatchMonth(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ivb-due">납부 기한</Label>
              <Input id="ivb-due" type="date" value={batchDue} onChange={(e) => setBatchDue(e.target.value)} />
            </div>
            <Button
              disabled={!batchReady}
              onClick={() => batch.mutate({ yearMonth: batchMonth, dueOn: batchDue }, { onSuccess: (r) => setBatchResult(r) })}
            >
              {batch.isPending ? '발행 중…' : `${Number(batchMonth.slice(5)) || ''}월 청구서 일괄 발행`}
            </Button>
          </div>
          {batch.isError ? <Banner tone="danger" className="mt-3">{apiMessage(batch.error)}</Banner> : null}
          {batchResult ? (
            <div className="mt-3 flex flex-col gap-2" aria-label="일괄 발행 결과">
              {/* 건수·합은 서버가 준 것이다 — 화면이 배열을 다시 세지 않는다 (D-R37) */}
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-bold text-fg">{batchResult.yearMonth} — 발행 {batchResult.issued.length}건</span>
                <span className="text-fg-subtle">· 대상 {batchResult.candidates}명 · 건너뜀 {batchResult.skipped.length}명</span>
                {batchResult.issuedAmount != null ? <span className="ml-auto font-bold">{won(batchResult.issuedAmount)}</span> : null}
              </div>
              {batchResult.skipped.length ? (
                <ul className="flex flex-col gap-1 rounded-lg border border-amber/30 bg-amber/5 p-2.5">
                  {batchResult.skipped.map((s) => (
                    <li key={s.studentId} className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="font-bold text-fg">{s.studentName}</span>
                      <Chip tone="warning" size="compact">{s.code}</Chip>
                      <span className="text-fg-2">{s.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Panel>
      ) : null}

      {open ? (
        <Panel
          className="mb-4"
          title="새 청구서 발행"
          sub="수업 횟수는 서버가 셉니다 — 휴강과 「그날만 빠진 학생」을 빼고 셉니다"
        >
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="iv-stu">학생</Label>
              <Select id="iv-stu" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">고르세요</option>
                {(meta.data?.students ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.grade ? ` · ${s.grade}` : ''}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="iv-ym">달</Label>
              <Input id="iv-ym" type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="iv-type">종류</Label>
              {/* 낱말도 목록도 서버가 준다 — 종류가 늘어도 이 자리는 그대로다 (D-R18) */}
              <Select id="iv-type" value={invType} onChange={(e) => setInvType(e.target.value as InvType)}>
                {(meta.data?.invTypes ?? []).map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="iv-due">납부 기한</Label>
              <Input id="iv-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-fg-subtle">
            기한을 고르면 그 날이 지난 뒤부터 「기한 지남」과 §69 회계 배지에 듭니다. 미리 채워 두지 않습니다 — 언제까지 받을지는 매번 정하는 일입니다.
          </p>

          {issue.isError ? <Banner tone="danger" className="mt-3">{apiMessage(issue.error)}</Banner> : null}

          <div className="mt-3 flex justify-end">
            <Button
              disabled={!ready || issue.isPending}
              onClick={() => issue.mutate(
                { studentId: Number(studentId), yearMonth, invType, dueOn },
                { onSuccess: (inv) => { setMade(inv); setOpen(false); } },
              )}
            >
              발행
            </Button>
          </div>
        </Panel>
      ) : null}

      {made ? (
        <Panel className="mb-4" title={`발행했습니다 — ${made.title}`} sub="서버가 센 줄입니다">
          <div className="flex flex-col gap-1.5">
            {made.lines.map((l, i) => (
              <div key={`${l.subKey ?? 'x'}-${i}`} className="flex items-center gap-2 text-[13px]">
                <span className="font-bold text-fg">{l.label}</span>
                <Chip size="compact">{l.count}회</Chip>
                <span className="text-fg-subtle">× {won(l.unitPrice)}</span>
                <span className="ml-auto font-bold">{won(l.amount)}</span>
              </div>
            ))}
            <div className="mt-1.5 flex items-center border-t border-line pt-2 text-[13px]">
              <span className="font-bold">합계</span>
              <span className="ml-auto text-[15px] font-bold">{won(made.amount)}</span>
            </div>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
