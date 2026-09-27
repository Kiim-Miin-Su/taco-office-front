/** @file-guide
 * 목적: ConsultingAccounting.tsx — ConsultingAccountingProps, ConsultingAccounting (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §28 컨설팅 회계 — 계약 금액 · 받은 돈 · 남은 돈.
 *
 * **이 화면은 뺄셈을 하지 않는다.** 줄의 「남음」도 머리 세 칸도 서버가 뺀 숫자를 그대로 그린다.
 * 여기서 `amount - paid` 를 다시 하면 금액이 가려진 줄에서 0 으로 세어 머리 칸과 갈린다 (D-R37).
 *
 * 원문 동작 둘 — 「납부 넣기」와 「청구서로 전환」. 전환은 **남은 돈으로** 낸다(서버 판정).
 * 눌러도 되는지도 서버가 `canInvoice` 로 말해 준다 — 화면이 단계를 다시 읽지 않는다 (D-R39).
 * 학생이 여럿인 컨설팅은 전환 창에서 **받는 학생을 사람이 고른다**(N-33 ② · 고르기 전에는 단추가 잠긴다). 한 명이면 고르개가 없다.
 * 「받음 · 남음」은 전환 청구서에 들어온 돈까지 센 서버 값이다(계약 → 진행 전이와 같은 조각).
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useAddConsPayment, useConsToInvoice } from '@/api/queries';
import type { ConsAccounting, ConsAccountRow } from '@/api/types';
import {
  Banner, Button, Chip, Column, Drawer, Input, Label, Panel, Select, StatCard, Table,
} from '@/components/ui';
import { CONSULTING_STAGE_BY_KEY } from '@/lib/consulting';
import { MASKED, won } from '@/lib/money';

/** 단계 글자색 — 점 색과 같은 토큰(계약 파랑 · 진행 보라 · 종료 초록) */
const STAGE_TEXT: Record<string, string> = { info: 'text-blue', purple: 'text-violet', success: 'text-green', neutral: 'text-fg-2' };

export interface ConsultingAccountingProps {
  data?: ConsAccounting;
  loading?: boolean;
}

/** 「07-12 ₩400,000」 — 표 한 칸에 드는 짧은 꼴(금액은 `lib/money`). 연도는 줄을 늘리기만 한다. */
const payBrief = (isoDate: string): string => isoDate.slice(5);

export function ConsultingAccounting({ data, loading }: ConsultingAccountingProps) {
  const [payFor, setPayFor] = useState<ConsAccountRow | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [memo, setMemo] = useState('');
  /** 「청구서로 전환」 — 받는 학생(학생이 여럿일 때만 고른다 · N-33 ②) */
  const [invStudent, setInvStudent] = useState('');

  const addPayment = useAddConsPayment();
  const toInvoice = useConsToInvoice();

  const rows = data?.items ?? [];
  const open = rows.find((r) => r.id === openId) ?? null;
  const pickStudent = open !== null && open.students.length > 1;
  const openRow = (id: number) => { setOpenId(id); setInvStudent(''); toInvoice.reset(); };

  const closePay = () => {
    setPayFor(null);
    setAmount(''); setPaidOn(''); setMemo('');
    addPayment.reset();
  };

  const submitPayment = () => {
    if (!payFor) return;
    addPayment.mutate(
      { consId: payFor.id, amount: Number(amount), paidOn, memo: memo.trim() || undefined },
      { onSuccess: closePay },
    );
  };

  const cols: Array<Column<ConsAccountRow>> = [
    { key: 's', head: '학생', cell: (r) => <span className="font-bold">{r.studentName || '—'}</span> },
    {
      key: 't', head: '종류', width: 130,
      // 종류 이름은 서버 낱말이다 (29-02 · D-R18)
      cell: (r) => <Chip tone="purple">{r.typeLabel}</Chip>,
    },
    {
      key: 'st', head: '단계', width: 80,
      // 낱말은 서버가 만든다 (D-R18) — 색만 토큰에서 고른다 (D-R41). 원본 §28 은 알약이 아니라 **점 + 색 글자**다 (28-03)
      cell: (r) => {
        const look = CONSULTING_STAGE_BY_KEY[r.stage];
        return (
          <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold ${STAGE_TEXT[look?.tone ?? 'neutral'] ?? 'text-fg-2'}`}>
            <span aria-hidden className={`h-2 w-2 rounded-sm ${look?.markerClass ?? 'bg-line-2'}`} />{r.stageLabel}
          </span>
        );
      },
    },
    {
      key: 'a', head: '계약', width: 110, align: 'right',
      cell: (r) => (r.amount === null || r.amount === undefined
        ? <span className="text-[11px] text-fg-subtle">{MASKED}</span>
        : won(r.amount)),
    },
    { key: 'p', head: '받음', width: 110, align: 'right', cell: (r) => won(r.paid) },
    {
      key: 'd', head: '남음', width: 110, align: 'right',
      // 원본 §28 「남음」은 빨강 글자다 (28-04)
      cell: (r) => <span className="font-bold text-red">{won(r.due)}</span>,
    },
    {
      key: 'h', head: '납부 기록', align: 'center',
      cell: (r) => (r.payments.length === 0
        ? <span className="text-fg-subtle">—</span>
        : (
          <span className="text-[12px]">
            {r.payments.slice(-2).map((p) => `${payBrief(p.paidOn)} ${won(p.amount)}`).join(' · ')}
            {r.payments.length > 2 ? <span className="text-fg-subtle"> 외 {r.payments.length - 2}건</span> : null}
          </span>
        )),
    },
    {
      key: 'x', head: '', width: 150, align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          {/* 서는지도 막힌 이유도 서버가 정한다 (S5 · D-R39) — 전에는 화면이 금액·종료만 보고
              계약 단계를 몰라 서명본 전에도 단추가 섰다(409 CONS_PAY_NOT_READY). */}
          <Button
            size="sm" variant="primary"
            disabled={!r.canAddPayment}
            title={r.payBlockedReason ?? undefined}
            onClick={(e) => { e.stopPropagation(); setPayFor(r); }}
          >
            납부 넣기
          </Button>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); openRow(r.id); }}>열기</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      {data && !data.canSeeAmounts ? (
        <Banner tone="neutral" className="mb-3">
          금액은 대표만 볼 수 있으며 서버가 빈 값으로 내려줍니다. 납부·전환도 금액 권한이 있어야 합니다.
        </Banner>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="계약 금액" value={won(data?.totalAmount)} />
        <StatCard label="받은 돈" value={won(data?.totalPaid)} tone="success" />
        <StatCard label="남은 돈" value={won(data?.totalDue)} tone="warning" />
      </div>

      {/* 원본 §28 은 타일 바로 아래 제목 없는 표다 (28-02) */}
      <Panel>
        <Table
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          empty={loading ? '불러오는 중…' : '컨설팅 건이 없습니다'}
        />
      </Panel>

      {/* ── 납부 넣기 — 원문 동작 ① ─────────────────────────────────── */}
      <Drawer
        open={payFor !== null}
        onClose={closePay}
        title={payFor ? `납부 넣기 — ${payFor.studentName || '학생 미지정'}` : ''}
        sub={payFor ? `계약 ${won(payFor.amount)} · 남음 ${won(payFor.due)}` : undefined}
        width={420}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={closePay}>취소</Button>
            <Button
              variant="primary"
              disabled={addPayment.isPending || !paidOn || !(Number(amount) >= 1)}
              onClick={submitPayment}
            >
              {addPayment.isPending ? '넣는 중…' : '넣기'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 p-4">
          <div>
            <Label htmlFor="cons-pay-amount">받은 금액</Label>
            <Input
              id="cons-pay-amount" type="number" min={1} inputMode="numeric"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder={payFor?.due ? String(payFor.due) : '0'}
            />
            <p className="mt-1 text-[11px] text-fg-subtle">남은 돈은 서버가 다시 계산합니다.</p>
          </div>
          <div>
            <Label htmlFor="cons-pay-on">받은 날</Label>
            <Input id="cons-pay-on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cons-pay-memo">메모</Label>
            <Input
              id="cons-pay-memo" maxLength={80} value={memo}
              onChange={(e) => setMemo(e.target.value)} placeholder="계약금 · 2회차 등"
            />
          </div>
          {addPayment.isError ? <Banner tone="danger">{apiMessage(addPayment.error)}</Banner> : null}
        </div>
      </Drawer>

      {/* ── 열기 — 납부 기록 전부와 「청구서로 전환」 ────────────────── */}
      <Drawer
        open={open !== null}
        onClose={() => { setOpenId(null); toInvoice.reset(); }}
        title={open ? `${open.studentName || '학생 미지정'} — ${open.typeLabel}` : ''}
        sub={open ? `${open.stageLabel} · 계약 ${won(open.amount)} · 받음 ${won(open.paid)} · 남음 ${won(open.due)}` : undefined}
        footer={
          open ? (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-[11px] text-fg-subtle">
                {open.invId !== null && open.invId !== undefined
                  ? `청구서 #${open.invId} 로 전환되었습니다`
                  : open.canInvoice
                    ? '남은 돈으로 청구서를 냅니다'
                    : '계약 5단계(수납)부터, 남은 돈이 있을 때 전환합니다'}
              </span>
              <Button
                variant="primary"
                disabled={!open.canInvoice || toInvoice.isPending || (pickStudent && !invStudent)}
                title={open.canInvoice && pickStudent && !invStudent ? '청구서를 받을 학생을 먼저 고르세요' : undefined}
                onClick={() => toInvoice.mutate({ consId: open.id, ...(pickStudent ? { studentId: Number(invStudent) } : {}) })}
              >
                {toInvoice.isPending ? '전환 중…' : '청구서로 전환'}
              </Button>
            </div>
          ) : null
        }
      >
        {open ? (
          <div className="p-4">
            {toInvoice.isError ? <Banner tone="danger" className="mb-3">{apiMessage(toInvoice.error)}</Banner> : null}
            {/* 학생이 여럿이면 청구서는 한 명 앞으로 나간다 — 사람이 고른다 (N-33 ② · 서버가 대신 고르지 않는다) */}
            {open.canInvoice && pickStudent ? (
              <div className="mb-4">
                <Label htmlFor="cons-inv-student">청구서를 받을 학생</Label>
                <Select id="cons-inv-student" value={invStudent} onChange={(e) => setInvStudent(e.target.value)}>
                  <option value="">고르세요</option>
                  {open.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
            ) : null}
            <h3 className="mb-2 text-[12px] font-bold text-fg-subtle">납부 기록</h3>
            {open.payments.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">아직 받은 돈이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-line">
                {open.payments.map((p) => (
                  <li key={p.id} className="flex items-baseline gap-3 py-2">
                    <span className="w-20 shrink-0 text-[12px] text-fg-subtle">{p.paidOn}</span>
                    <span className="w-28 shrink-0 text-right text-[13px] font-bold">{won(p.amount)}</span>
                    <span className="min-w-0 grow truncate text-[12px]">{p.memo ?? ''}</span>
                    <span className="shrink-0 text-[11px] text-fg-subtle">{p.byName ?? ''}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 border-t border-line pt-3 text-[11px] text-fg-subtle">
              청구서로 전환해도 이 기록은 그대로 남습니다 — 청구서와 이어 둘 뿐 옮기지 않습니다. 전환 뒤 입금은 그 청구서에 적고, 받은 돈에 함께 셉니다.
            </p>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
