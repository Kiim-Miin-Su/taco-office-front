/** @file-guide
 * 목적: WageChangeDialog.tsx — WageChangeButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §17 「시급 수정」 (C97 · 테스트 시나리오 D-48 「시급 변경」 · I-8 「과거 정산 불변」 · §14 승인 경로 C41 과 같은 규칙).
 *
 * 창 하나에 **이력**(적용일 내림차순 · 「지금」 줄은 서버가 가른다)과 **새 줄** 입력(시급 · 언제부터 · 사유)이 같이 있다.
 * 소급 없음 · 같은 날 한 줄은 서버가 409 로 낸다(`WAGE_RETROACTIVE` · `WAGE_SAME_DAY`) — 화면은 그 문장을 그대로 보인다.
 * 단추가 서는지는 서버의 `member.wageable`(활성 강사 · canWage)이 정한다 — 이 파일은 role 을 보지 않는다.
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Chip, Dialog, Input, Label, QueryState, Table, type Column } from '../ui';
import { apiMessage } from '@/api/client';
import { useChangeWage, useWageHistory } from '@/api/queries';
import type { Member, WageRow, WageWrite } from '@/api/types';
import { won } from '@/lib/money';
import { todayKst } from '@/lib/calendar';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface WageChangeButtonProps {
  member: Pick<Member, 'id' | 'name' | 'wageRate' | 'wageFrom'>;
  onDone?: (row: WageRow) => void;
}

export function WageChangeButton({ member, onDone }: WageChangeButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const history = useWageHistory(member.id, open);
  const write = useChangeWage();
  const [rate, setRate] = useState('');
  const [fromDate, setFromDate] = useState(todayKst());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRate(''); setFromDate(todayKst()); setReason(''); setErr(null);
  }, [open]);

  const pending = write.isPending;
  const n = Number(rate);
  const canSubmit = rate.trim() !== '' && Number.isInteger(n) && n >= 1000 && ISO.test(fromDate) && !pending;

  const submit = () => {
    if (!canSubmit) return;
    const payload: WageWrite = { staffId: member.id, rate: n, fromDate, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    setErr(null);
    write.mutate(payload, {
      onSuccess: (row) => { setOpen(false); onDone?.(row); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  const cols: Array<Column<WageRow>> = [
    { key: 'from', head: '언제부터', cell: (r) => <span className="tabular-nums">{r.fromDate}</span> },
    { key: 'rate', head: '시급', align: 'right', cell: (r) => <span className="font-bold tabular-nums">{won(r.rate)}</span> },
    // 「지금」은 서버가 가른 줄이다 — 화면이 날짜를 비교해 다시 고르지 않는다 (D-R37)
    { key: 'now', head: '', width: 56, cell: (r) => (r.current ? <Chip size="compact" tone="success">지금</Chip> : null) },
    { key: 'reason', head: '사유', cell: (r) => <span className="text-fg-2">{r.reason ?? ''}</span> },
    { key: 'by', head: '적은 사람', cell: (r) => <span className="text-fg-subtle">{r.approvedByName ?? ''}</span> },
  ];

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>시급 수정</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${member.name} · 시급`}
        width={600}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>닫기 (Esc)</Button>
            <Button type="button" onClick={submit} disabled={!canSubmit}
              title={!canSubmit && !pending ? '시급(1,000원 이상)과 날짜는 있어야 합니다' : undefined}>
              {pending ? '적는 중…' : '새 줄 적기'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <Banner tone="info">
            지금 시급 <b>{won(member.wageRate)}</b>{member.wageFrom ? <> · {member.wageFrom} 부터</> : null}.
            새 줄은 <b>그 날짜의 수업부터</b> 붙고 지난 정산은 그때 시급 그대로입니다(소급 없음 · 같은 날 한 줄).
          </Banner>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor={`${id}-rate`} hint="원/시간">새 시급</Label>
              <Input id={`${id}-rate`} type="number" min={1000} step={1000} inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} disabled={pending} placeholder="45000" />
            </div>
            <div>
              <Label htmlFor={`${id}-from`} hint="오늘 이후만 · 미래는 예약">언제부터</Label>
              <Input id={`${id}-from`} type="date" min={todayKst()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} disabled={pending} />
            </div>
            <div>
              <Label htmlFor={`${id}-reason`}>사유 (선택)</Label>
              <Input id={`${id}-reason`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} disabled={pending} placeholder="연봉 협상" />
            </div>
          </div>
          {err ? <Banner tone="danger">{err}</Banner> : null}
          <QueryState query={history}>
            {(h) => (
              <Table columns={cols} rows={h.rows} rowKey={(r) => r.id} empty="시급 줄이 아직 없습니다 — 위에서 첫 줄을 적으세요" />
            )}
          </QueryState>
        </div>
      </Dialog>
    </>
  );
}
