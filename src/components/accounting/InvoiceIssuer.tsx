/** @file-guide
 * 목적: InvoiceIssuer.tsx — InvoiceIssuerPreset, InvoiceIssuer (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §53 「+ 새 청구서 발행」 · 「자동 생성 켜기」(= 일괄 발행 창 · N-28 ②).
 *
 * **이 화면은 줄을 세지 않는다.** 누구의 어느 달 · 어느 종류인지만 보낸다 —
 * 과목별 회차·단가·소계·합계는 전부 서버가 만든다. 원문 명세가 그렇게 적었다:
 * 「INV_LINE 의 횟수는 `occ()` 가 센다 · 프론트가 세면 예외(EXC)를 빠뜨린다」(D-R37).
 * 종류마다 원천이 다르다(N-75) — 수업료 · 진단고사 + 상담은 서버가 회차로 세고, 컨설팅비는 컨설팅 화면의
 * 「청구서로 전환」 한 길이라 여기서는 잠긴 채 서버 문장을 보이고, 응시료는 제품 안에 금액의 원천이 없어
 * **사람이 줄(내용 · 금액)을 적는다**(`/meta invTypes[].manualLines`).
 *
 * 평소에는 미리보기가 없다 — **낸 뒤에 줄이 보인다.** 분납(N-79)을 고를 때만 서버의 미리 세기
 * (`GET /accounting/invoices/draft` — 발행과 **같은 함수**)를 받아 청구액을 보인다. 회차 금액의 합이 청구액이어야
 * 하는데(서버가 검사), 청구액은 회차를 세어야 나오기 때문이다. 화면은 받은 값을 그릴 뿐 더하지 않는다.
 *
 * 거절도 전부 서버가 한다 — 그 달에 회차가 없거나(INV_NO_LESSONS), 단가표에 없는 과목이 있거나(INV_NO_RATE),
 * 같은 학생·달·종류가 이미 있거나(INV_DUPLICATE), 분납 합이 청구액과 다르면(INV_INSTALLMENT_SUM) 서버가 이유를 문장으로 준다.
 */
'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Banner, Button, Checkbox, Chip, Input, Label, Panel, Select } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useInvoiceDraft, useIssueInvoice, useIssueInvoiceBatch, useMeta, type InvoiceDraftParams } from '@/api/queries';
import type { Invoice, InvoiceBatchResult, InvoiceIssue } from '@/api/types';
import { won } from '@/lib/money';
import { categoryChip } from './category-tone';

/* 낱말은 생성 타입에서 온다 — 화면에 코드표를 다시 적으면 서버와 갈린다 (D-R18) */
type InvType = InvoiceIssue['invType'];

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** 금액 칸 — 원 단위 양의 정수(서버 DTO 와 같은 경계 1 ~ 10억). 판정은 서버가 다시 한다 */
const isWon = (v: string) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1_000_000_000;
/** 분납은 2~12회차 · 응시료 줄은 1~20줄 — 서버 DTO 의 경계 그대로 */
const PARTS_MIN = 2;
const PARTS_MAX = 12;
const LINES_MAX = 20;
const emptyParts = () => Array.from({ length: PARTS_MIN }, () => ({ dueOn: '', amount: '' }));
const emptyLines = () => [{ label: '', amount: '' }];

/** 이번 달을 YYYY-MM 으로. 기본값일 뿐이고 판정에 쓰지 않는다 */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** §53 ① 「청구서 작성 →」이 채우는 값 — `seq` 가 바뀔 때마다 다시 채운다(같은 카드를 두 번 눌러도) */
export interface InvoiceIssuerPreset {
  seq: number;
  studentId: number;
  yearMonth: string;
  invType: string;
}

export interface InvoiceIssuerProps {
  /**
   * 발행 칸이 열렸는가 — 페이지가 쥐면 탭 줄 오른쪽 「+ 청구서」(원문 §52~§57 공통 · x5 C-03)가 어느 탭에서든 연다.
   * 주지 않으면 지금처럼 이 부품이 스스로 쥔다.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 단추 줄 왼쪽 — 청구서 탭의 머리(원문 §53 「청구서 · 왼쪽에서 오른쪽으로 밀어 갑니다」) */
  heading?: ReactNode;
  /** §53 ① 카드의 「청구서 작성 →」 — 학생 · 달 · 종류를 채운다. 기한은 비운 채 둔다(S3) */
  preset?: InvoiceIssuerPreset | null;
}

export function InvoiceIssuer({ open: openProp, onOpenChange, heading, preset }: InvoiceIssuerProps = {}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (onOpenChange) onOpenChange(value);
    else setOpenState(value);
  };
  // 학생 목록은 **폼을 열 때만** 읽는다 — 청구서를 안 내는 사람에게까지 코드표를 받아 올 이유가 없다
  const meta = useMeta(open);
  const issue = useIssueInvoice();
  const [studentId, setStudentId] = useState('');
  const [yearMonth, setYearMonth] = useState(thisMonth);
  const [invType, setInvType] = useState<InvType>('tuition');
  /* 납부 기한 — **미리 채우지 않는다**(대표 결정 2026-09-20 · S3). 원문 §53 은 기한이 있는 모습만 보여 주고
     어떻게 정하는지는 보여 주지 않는다 — 「발행일 + N일」을 화면이 지어내면 없는 업무 규칙이 생긴다(D-R44). */
  const [dueOn, setDueOn] = useState('');
  /* 분납(N-79) — 회차마다 예정일 · 금액을 사람이 적는다. 나누는 규칙(균등 등)을 화면이 짓지 않는다 */
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState(emptyParts);
  /* 응시료 줄(N-75) — 원천이 없어 사람이 적는다 */
  const [manual, setManual] = useState(emptyLines);
  const [issueErr, setIssueErr] = useState<string | null>(null);
  const [made, setMade] = useState<Invoice | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  // 일괄 발행 (C94-a · H-75) — 달 하나만 보낸다. 누구에게 낼지·종류·이월·단가는 서버가 정한다
  const batch = useIssueInvoiceBatch();
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMonth, setBatchMonth] = useState(thisMonth);
  const [batchResult, setBatchResult] = useState<InvoiceBatchResult | null>(null);
  const [batchDue, setBatchDue] = useState('');

  /* §53 ① 「청구서 작성 →」 — 그 대상으로 채우고 창을 화면에 부른다. 기한 · 분납은 비운다(사람이 정한다) */
  useEffect(() => {
    if (!preset) return;
    setStudentId(String(preset.studentId));
    setYearMonth(preset.yearMonth);
    // 서버가 내린 청구 대상의 종류 코드다(수업료 · 진단고사 + 상담) — 화면이 목록을 다시 적지 않는다
    setInvType(preset.invType as InvType);
    setDueOn(''); setSplit(false); setParts(emptyParts()); setManual(emptyLines());
    setIssueErr(null); setMade(null);
    formRef.current?.scrollIntoView?.({ block: 'start' });
  }, [preset]);

  const types = meta.data?.invTypes ?? [];
  const picked = types.find((t) => t.key === invType);
  // 사람이 줄을 적는 종류인가 — 서버 `/meta` 가 말한다 (N-75 · D-R18)
  const manualType = picked?.manualLines === true;
  const blockedTypes = types.filter((t) => !t.issuable && t.issueBlockedReason);

  const draftParams: InvoiceDraftParams | null =
    split && !manualType && studentId !== '' && YM.test(yearMonth) && (invType === 'tuition' || invType === 'diag_intake')
      ? { studentId: Number(studentId), yearMonth, invType }
      : null;
  const draft = useInvoiceDraft(draftParams);

  const partsOk = parts.length >= PARTS_MIN && parts.length <= PARTS_MAX && parts.every((p) => ISO.test(p.dueOn) && isWon(p.amount));
  const linesOk = manual.length >= 1 && manual.length <= LINES_MAX
    && manual.every((l) => l.label.trim() !== '' && l.label.trim().length <= 80 && isWon(l.amount));
  const ready = studentId !== '' && YM.test(yearMonth) && (split ? partsOk : dueOn !== '') && (!manualType || linesOk);
  const batchReady = YM.test(batchMonth) && batchDue !== '' && !batch.isPending;

  const submit = () => {
    if (!ready || issue.isPending) return;
    const body: InvoiceIssue = {
      studentId: Number(studentId), yearMonth, invType,
      // 분납이면 기한 칸을 보내지 않는다 — 기한은 마지막 회차의 예정일이다(서버가 정한다)
      ...(split ? { installments: parts.map((p) => ({ dueOn: p.dueOn, amount: Number(p.amount) })) } : { dueOn }),
      ...(manualType ? { lines: manual.map((l) => ({ label: l.label.trim(), amount: Number(l.amount) })) } : {}),
    };
    setIssueErr(null);
    issue.mutate(body, {
      onSuccess: (inv) => { setMade(inv); setOpen(false); },
      onError: (e) => setIssueErr(apiMessage(e)),
    });
  };

  const setPart = (i: number, patch: Partial<{ dueOn: string; amount: string }>) =>
    setParts((rows) => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setLine = (i: number, patch: Partial<{ label: string; amount: string }>) =>
    setManual((rows) => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">{heading}</div>
        <div className="flex items-center gap-2">
          {/* 원문 §53 은 「+ 새 청구서 발행」을 **주단추**(채움)로 그린다 (53-03) */}
          <Button variant="primary" onClick={() => { setOpen((v) => !v); setMade(null); setIssueErr(null); }}>
            {open ? '닫기' : '+ 새 청구서 발행'}
          </Button>
          {/* 「자동 생성 켜기」 = 기존 일괄 발행 창이다(N-28 ② — 저장할 설정 표 · 예약 실행이 없다) */}
          <Button variant="secondary" onClick={() => { setBatchOpen((v) => !v); setBatchResult(null); }}>
            {batchOpen ? '일괄 발행 닫기' : '자동 생성 켜기'}
          </Button>
        </div>
      </div>

      {batchOpen ? (
        <Panel
          className="mb-4"
          title="청구서 일괄 발행"
          sub="그 달 회차가 있는 학생 전부에게 냅니다 — 수업료와 진단고사 · 상담은 따로 한 장씩입니다. 이월·단가 구간·휴강·휴원은 낱장 발행과 같은 계산이고, 막힌 학생은 건너뛰고 이유를 보여 줍니다. 저절로 도는 예약은 없습니다 — 누를 때 한 번 냅니다"
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
              {/* 건수·합은 서버가 준 것이다 — 화면이 배열을 다시 세지 않는다 (D-R37). 대상은 (학생 · 종류) 한 쌍이 한 건이다 */}
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-bold text-fg">{batchResult.yearMonth} — 발행 {batchResult.issued.length}건</span>
                <span className="text-fg-subtle">· 대상 {batchResult.candidates}건 · 건너뜀 {batchResult.skipped.length}건</span>
                {batchResult.issuedAmount != null ? <span className="ml-auto font-bold">{won(batchResult.issuedAmount)}</span> : null}
              </div>
              {batchResult.skipped.length ? (
                <ul className="flex flex-col gap-1 rounded-lg border border-amber/30 bg-amber/5 p-2.5">
                  {batchResult.skipped.map((s) => (
                    <li key={`${s.studentId}-${s.invType}`} className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="font-bold text-fg">{s.studentName}</span>
                      {/* 종류 이름은 서버의 것이다 — 코드값(INV_…)을 화면에 찍지 않는다 */}
                      <Chip tone={categoryChip(s.invType)} size="compact">{s.invTypeLabel}</Chip>
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
        <div ref={formRef}>
          <Panel
            className="mb-4"
            title="새 청구서 발행"
            sub={manualType
              ? '응시료는 제품 안에 금액의 원천이 없어 줄(내용 · 금액)을 적어서 냅니다'
              : '수업 횟수는 서버가 셉니다 — 휴강과 「그날만 빠진 학생」을 빼고 셉니다'}
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
                  {/* 낼 수 있는지도 서버가 말한다(`issuable`) — 잠긴 종류의 까닭은 아래 줄에 서버 문장 그대로 선다 (N-75) */}
                  {types.map((t) => (
                    <option key={t.key} value={t.key} disabled={!t.issuable} title={t.issueBlockedReason ?? undefined}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              {split ? null : (
                <div>
                  <Label htmlFor="iv-due">납부 기한</Label>
                  <Input id="iv-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
                </div>
              )}
            </div>
            {blockedTypes.length ? (
              <ul className="mt-2 flex flex-col gap-0.5 text-[11px] text-fg-subtle" aria-label="여기서 낼 수 없는 종류">
                {blockedTypes.map((t) => <li key={t.key}><b className="text-fg-2">{t.label}</b> — {t.issueBlockedReason}</li>)}
              </ul>
            ) : null}

            {manualType ? (
              <div role="group" aria-label="응시료 줄" className="mt-3 flex flex-col gap-2">
                {manual.map((l, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_170px_auto] items-end gap-2">
                    <div>
                      <Label htmlFor={`iv-line-${i}-label`} hint="80자">{`줄 ${i + 1} 내용`}</Label>
                      <Input id={`iv-line-${i}-label`} value={l.label} maxLength={80} placeholder="예: MAP 응시료"
                        onChange={(e) => setLine(i, { label: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor={`iv-line-${i}-amount`} hint="원">{`줄 ${i + 1} 금액`}</Label>
                      <Input id={`iv-line-${i}-amount`} type="number" min={1} inputMode="numeric" value={l.amount}
                        onChange={(e) => setLine(i, { amount: e.target.value })} />
                    </div>
                    <Button size="sm" variant="ghost" disabled={manual.length <= 1} aria-label={`줄 ${i + 1} 빼기`}
                      onClick={() => setManual((rows) => rows.filter((_, k) => k !== i))}>빼기</Button>
                  </div>
                ))}
                <div>
                  <Button size="sm" variant="secondary" disabled={manual.length >= LINES_MAX}
                    onClick={() => setManual((rows) => [...rows, { label: '', amount: '' }])}>+ 줄</Button>
                </div>
              </div>
            ) : null}

            <div className="mt-3">
              <Checkbox label="분납 — 회차마다 예정일과 금액을 적습니다" checked={split}
                onChange={(e) => { setSplit(e.target.checked); setIssueErr(null); }} />
            </div>

            {split ? (
              <div role="group" aria-label="분납 일정" className="mt-2 flex flex-col gap-2">
                {/* 청구액은 서버가 발행과 같은 함수로 센 값이다 — 화면이 줄을 더하지 않는다 */}
                {draftParams ? (
                  draft.isLoading ? (
                    <p className="text-[12px] text-fg-subtle">청구액을 세는 중…</p>
                  ) : draft.isError ? (
                    <Banner tone="danger">{apiMessage(draft.error)}</Banner>
                  ) : draft.data && !draft.data.canIssue ? (
                    <Banner tone="warning">{draft.data.issueBlockedReason}</Banner>
                  ) : draft.data ? (
                    <p className="text-[12.5px] text-fg-2">
                      청구액 <b className="text-fg">{won(draft.data.amount)}</b> — 회차 금액의 합이 이 값이어야 합니다
                    </p>
                  ) : null
                ) : null}
                {parts.map((p, i) => (
                  <div key={i} className="grid grid-cols-[170px_170px_auto] items-end gap-2">
                    <div>
                      <Label htmlFor={`iv-part-${i}-due`}>{`일정 ${i + 1} 예정일`}</Label>
                      <Input id={`iv-part-${i}-due`} type="date" value={p.dueOn} onChange={(e) => setPart(i, { dueOn: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor={`iv-part-${i}-amount`} hint="원">{`일정 ${i + 1} 금액`}</Label>
                      <Input id={`iv-part-${i}-amount`} type="number" min={1} inputMode="numeric" value={p.amount}
                        onChange={(e) => setPart(i, { amount: e.target.value })} />
                    </div>
                    <Button size="sm" variant="ghost" disabled={parts.length <= PARTS_MIN} aria-label={`일정 ${i + 1} 빼기`}
                      onClick={() => setParts((rows) => rows.filter((_, k) => k !== i))}>빼기</Button>
                  </div>
                ))}
                <div>
                  <Button size="sm" variant="secondary" disabled={parts.length >= PARTS_MAX}
                    onClick={() => setParts((rows) => [...rows, { dueOn: '', amount: '' }])}>+ 회차</Button>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  회차 번호는 예정일 순으로 매겨지고, 기한은 마지막 회차의 예정일입니다. 「기한 지남」은 들어온 돈이 못 채운 가장 이른 회차의 예정일로 셉니다.
                  합이 청구액과 다르면 서버가 돌려보냅니다.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-fg-subtle">
                기한을 고르면 그 날이 지난 뒤부터 「기한 지남」과 대표 보고의 회계 배지에 듭니다. 미리 채워 두지 않습니다 — 언제까지 받을지는 매번 정하는 일입니다.
              </p>
            )}

            {issueErr ? <Banner tone="danger" className="mt-3">{issueErr}</Banner> : null}

            <div className="mt-3 flex justify-end">
              <Button disabled={!ready || issue.isPending} onClick={submit}>
                발행
              </Button>
            </div>
          </Panel>
        </div>
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
            {/* 분납 일정 — 회차 번호 · 예정일 · 금액 모두 서버가 저장한 값이다 */}
            {made.installments.length ? (
              <div className="mt-1.5 flex flex-col gap-1 border-t border-line pt-2" aria-label="발행한 분납 일정">
                {made.installments.map((x) => (
                  <div key={x.seq} className="flex items-center gap-2 text-[12.5px]">
                    <Chip size="compact" tone="info">{x.seq}회차</Chip>
                    <span className="text-fg-2">{x.dueOn}</span>
                    <span className="ml-auto font-bold">{won(x.amount)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </>
  );
}
