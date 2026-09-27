/** @file-guide
 * 목적: BonusRules.tsx — BonusRules, BonusSummary (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 정리 · 기준 › 가산 규칙 (N-93 · W11 M2 · 원문 §56 「추가로 드리는 돈」 · 슬라이드 56 연동 「월 마감 시 정리·기준 탭에서 확정」).
 *
 * 칸 넷(모의수업 · 진단고사 「한 번에 얼마」 · Kinder 「시급에 더함」 · 그룹 「한 명당」)은 **서버가 준 차례와 낱말**이다(D-R18).
 * 금액은 **새 줄로만** 바꾼다 — 시급 · 단가표와 같은 모양이다. 지난 줄은 고치지도 지우지도 않고, 적용일은 오늘 이후만이다
 * (소급 없음 · 같은 칸 같은 날 한 줄은 서버 409). 0원 줄은 「그 날부터 멈춤」이다.
 * 셈은 서버 `lib/payout-sheet.lessonBonus` 한 함수가 시트 · 확정 · 강사 히스토리에 같이 더한다 — 화면은 금액을 곱하지 않는다(D-R37).
 * Kinder 는 수업을 가를 표시가 아직 없어 셈에 들지 않는다 — 까닭 문장도 서버 것이다(`note`).
 * D1(§4-12) 금액(`d1Amount`)은 **입력 칸을 미리 채울 값**일 뿐 데이터가 아니다 — 저장해야 셈에 든다.
 * 적을 수 있는지는 서버 `canWrite`(canWage)다 (D-R39).
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Chip, Dialog, Input, Label, Panel, Table, type Column } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useBonusBook, useWriteBonusRule } from '@/api/queries';
import type { PayoutBonusRule, PayoutBonusSlot } from '@/api/types';
import { won } from '@/lib/money';
import { useCan } from '@/store/useSession';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const slotKey = (s: Pick<PayoutBonusSlot, 'kind' | 'kindKey'>) => `${s.kind}:${s.kindKey ?? ''}`;
/** 규칙 줄의 칸 이름 — 「한 번에」는 수업 종류 이름이 앞에 선다(「모의수업 · 한 번에」) */
const ruleSlotName = (r: PayoutBonusRule) => (r.kindName ? `${r.kindName} · ${r.kindLabel}` : r.kindLabel);

/** 「새 줄」 — 칸은 고른 줄로 정해지고 금액 · 언제부터 · 사유만 적는다. 열 때마다 그 칸의 값에서 시작한다 */
function BonusRuleForm({ slot, today, onClose }: { slot: PayoutBonusSlot | null; today: string; onClose: () => void }) {
  const id = useId();
  const write = useWriteBonusRule();
  const [amount, setAmount] = useState('');
  const [fromDate, setFromDate] = useState(today);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // 늘 마운트돼 있는 창이라 닫아도 상태가 남는다 — 열 때마다 그 칸의 지금 금액(없으면 D1 값)에서 시작한다 (RateBook 과 같은 초기화 · C100)
  useEffect(() => {
    if (!slot) return;
    setAmount(String(slot.currentAmount ?? slot.d1Amount)); setFromDate(today); setReason(''); setErr(null);
  }, [slot, today]);
  const n = Number(amount);
  const ready = slot !== null && amount.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 1_000_000
    && ISO.test(fromDate) && !write.isPending;
  const submit = () => {
    if (!ready || !slot) return;
    setErr(null);
    write.mutate(
      {
        kind: slot.kind, amount: n, fromDate,
        ...(slot.kindKey ? { kindKey: slot.kindKey } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
      { onSuccess: onClose, onError: (e) => setErr(apiMessage(e)) },
    );
  };
  return (
    <Dialog
      open={slot !== null} onClose={onClose} title={slot ? `가산 규칙 — ${slot.label}` : '가산 규칙'}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={write.isPending}>취소 (Esc)</Button>
          <Button type="button" onClick={submit} disabled={!ready}>{write.isPending ? '저장 중…' : '새 줄 적기'}</Button>
        </>
      )}
    >
      {slot ? (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-fg-2">
            <b>{slot.label}</b> · {slot.hint}
            {slot.currentAmount !== null ? <> · 지금 {won(slot.currentAmount)}{slot.currentFrom ? ` (${slot.currentFrom}부터)` : ''}</> : ' · 지금 없음'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-amount`} hint={`원 · D1 값 ${won(slot.d1Amount)}`}>금액</Label>
              <Input id={`${id}-amount`} type="number" min={0} max={1_000_000} step={1000} inputMode="numeric"
                value={amount} onChange={(e) => setAmount(e.target.value)} disabled={write.isPending} />
            </div>
            <div>
              <Label htmlFor={`${id}-from`} hint="오늘 이후만">언제부터</Label>
              <Input id={`${id}-from`} type="date" min={today} value={fromDate} onChange={(e) => setFromDate(e.target.value)} disabled={write.isPending} />
            </div>
          </div>
          <div>
            <Label htmlFor={`${id}-reason`} hint="선택 · 200자">사유</Label>
            <Input id={`${id}-reason`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} disabled={write.isPending} />
          </div>
          <p className="text-[11px] text-fg-subtle">
            새 줄은 그 날짜의 수업부터 붙고 지난 줄은 그대로입니다 — 확정한 달은 바뀌지 않습니다. 0원은 그 날부터 가산을 멈춥니다.
          </p>
          {!slot.applied && slot.note ? <Banner tone="warning">{slot.note}</Banner> : null}
          {err ? <Banner tone="danger">{err}</Banner> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/** 정리 · 기준 › 가산 규칙 탭 */
export function BonusRules() {
  const q = useBonusBook();
  const d = q.data;
  const [slot, setSlot] = useState<PayoutBonusSlot | null>(null);

  const slotCols: Array<Column<PayoutBonusSlot>> = [
    {
      key: 'l', head: '칸', cell: (s) => (
        <span className="flex flex-col">
          <b className="text-fg">{s.label}</b>
          <span className="text-[11px] text-fg-subtle">{s.hint}</span>
        </span>
      ),
    },
    { key: 'c', head: '오늘', width: 120, align: 'right', cell: (s) => (s.currentAmount === null ? <span className="text-fg-subtle">없음</span> : <b>{won(s.currentAmount)}</b>) },
    { key: 'f', head: '언제부터', width: 110, cell: (s) => s.currentFrom ?? <span className="text-fg-subtle">—</span> },
    {
      key: 'n', head: '예약', width: 170,
      cell: (s) => (s.nextAmount === null ? <span className="text-fg-subtle">—</span> : <span>{s.nextFrom}부터 {won(s.nextAmount)}</span>),
    },
    { key: 'a', head: '셈', cell: (s) => (s.applied ? <Chip size="compact" tone="success">셈에 듦</Chip> : <span className="text-[11px] text-amber">{s.note}</span>) },
    {
      key: 'w', head: '', width: 90, align: 'right',
      cell: (s) => (d?.canWrite ? <Button type="button" size="sm" variant="secondary" onClick={() => setSlot(s)}>새 줄</Button> : null),
    },
  ];
  const ruleCols: Array<Column<PayoutBonusRule>> = [
    { key: 'k', head: '칸', width: 200, cell: (r) => <span className="font-bold">{ruleSlotName(r)}</span> },
    {
      key: 'a', head: '금액', width: 130, align: 'right',
      cell: (r) => (r.amount === 0 ? <span className="text-fg-subtle">{won(0)} · 멈춤</span> : <b>{won(r.amount)}</b>),
    },
    { key: 'f', head: '언제부터', width: 110, cell: (r) => r.fromDate },
    { key: 'r', head: '사유', cell: (r) => r.reason ?? <span className="text-fg-subtle">—</span> },
    { key: 'b', head: '누가', width: 150, cell: (r) => <span className="text-fg-subtle">{r.setByName ?? '—'} · {r.createdAt.slice(0, 16).replace('T', ' ')}</span> },
    { key: 'c', head: '', width: 70, cell: (r) => (r.current ? <Chip size="compact" tone="success">지금</Chip> : null) },
  ];

  return (
    <div className="flex flex-col gap-4">
      {q.isError ? <Banner tone="danger">{apiMessage(q.error)}</Banner> : null}
      <Panel title="가산 규칙" sub={d?.rule ?? '강사료에 더하는 돈 — 칸마다 새 줄로 바꿉니다'}>
        <Table columns={slotCols} rows={d?.slots ?? []} rowKey={slotKey} empty={q.isLoading ? '불러오는 중…' : '칸이 없습니다'} />
        {d && !d.canWrite ? <p className="mt-2 text-[11px] text-fg-subtle">가산 규칙을 적을 권한이 없습니다 — 보기만 합니다.</p> : null}
      </Panel>
      <Panel title="적은 줄" sub="적용일이 늦은 줄부터 · 지난 줄은 고치지 않습니다">
        <Table columns={ruleCols} rows={d?.rules ?? []} rowKey={(r) => r.id} empty={q.isLoading ? '불러오는 중…' : '적은 줄이 없습니다 — 가산 없이 시급만 셉니다'} />
      </Panel>
      <BonusRuleForm slot={slot} today={d?.today ?? ''} onClose={() => setSlot(null)} />
    </div>
  );
}

/**
 * 강사료 정산 왼쪽 합계 밑 「추가로 드리는 돈」 — 원문 §56 컷의 자리다. **오늘 걸린 값을 읽기만** 한다.
 * 고치는 곳은 결정대로 정리 · 기준 › 가산 규칙이다(N-93) — 두 곳에서 적게 하지 않는다.
 */
export function BonusSummary({ onEdit }: { onEdit?: () => void }) {
  // 규칙을 읽는 길은 서버 @Perm('canAdminPage','canWage') 이다 — 그 둘이 없는 금액 예외 사람에게는 부르지 않는다(403 을 만들지 않게)
  const canAdmin = useCan('canAdminPage');
  const canWage = useCan('canWage');
  const q = useBonusBook(canAdmin && canWage);
  const d = q.data;
  // 칸을 읽지 못하면(권한 · 연결) 자리를 세우지 않는다 — 없는 값을 「없음」으로 적지 않는다
  if (!d?.slots) return null;
  return (
    <section aria-label="추가로 드리는 돈" className="flex flex-col gap-1.5">
      <h3 className="border-b border-line pb-2 text-[13px] font-bold text-fg">추가로 드리는 돈</h3>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-card">
        {d.slots.map((s) => (
          <li key={slotKey(s)} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="flex min-w-0 flex-col">
              <b className="text-[12.5px] text-fg">{s.label}</b>
              <span className="text-[11px] text-fg-subtle">{s.hint}</span>
              {!s.applied && s.note ? <span className="text-[10.5px] text-amber">{s.note}</span> : null}
            </span>
            <b className="shrink-0 text-[13px] text-fg">{s.currentAmount === null ? '없음' : won(s.currentAmount)}</b>
          </li>
        ))}
      </ul>
      {onEdit ? (
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={onEdit}>정리 · 기준 › 가산 규칙에서 바꿉니다 ›</Button>
      ) : null}
    </section>
  );
}
