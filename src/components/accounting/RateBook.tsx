/** @file-guide
 * 목적: RateBook.tsx — RateBook, RateForm, StudentRateForm (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 단가표 — 원문 §54 「데이터 RATE, STURATE(학생별 예외)」의 **쓰는 자리** (C94-d · 테스트 시나리오 H-81 · C-38).
 *
 * 청구서·§54·명단 가격이 이미 읽는 두 표에 줄 하나를 더할 뿐이다 — 셈은 서버 `invoice-lines` 한 곳이고 화면은
 * 단가를 어디에도 곱하지 않는다(D-R22 · D-R37). 「살아 있는 줄」(`current`)도 서버가 오늘 기준으로 판정한다.
 * 지난 줄은 고치지도 지우지도 않는다 — 이미 낸 청구서가 그 값으로 서 있다(C63). 바꾸려면 **다른 날짜부터의 줄**을 둔다.
 * 종류·과목·학생 낱말은 `GET /meta` 의 코드표다(D-R18). 학생별 예외는 **사유가 없으면 보낼 수 없다**(H-81 — 서버 400 · 표 CHECK).
 */
'use client';
import { useId, useState, type ReactNode } from 'react';
import { Banner, Button, Chip, Dialog, Input, Label, Panel, Select, Table, type Column } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useMeta, useWriteRate, useWriteStudentRate } from '@/api/queries';
import type { Meta, RateBook as RateBookData, RateRow, StudentRateRow } from '@/api/types';
import { won } from '@/lib/money';
import { todayKst } from '@/lib/calendar';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 「+ 단가 등록」 — 종류 · 과목(선택) · 인원 · 회당 단가 · 언제부터 */
function RateForm({ open, onClose, meta }: { open: boolean; onClose: () => void; meta: Meta | undefined }) {
  const id = useId();
  const write = useWriteRate();
  const [kindKey, setKindKey] = useState('');
  const [subKey, setSubKey] = useState('');
  const [heads, setHeads] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [fromDate, setFromDate] = useState(todayKst());
  const [err, setErr] = useState<string | null>(null);
  const price = Number(unitPrice);
  const n = Number(heads);
  const ready = kindKey !== '' && Number.isInteger(n) && n >= 1 && Number.isInteger(price) && price > 0 && ISO.test(fromDate) && !write.isPending;
  const submit = () => {
    if (!ready) return;
    setErr(null);
    write.mutate(
      { kindKey, heads: n, unitPrice: price, fromDate, ...(subKey ? { subKey } : {}) },
      { onSuccess: () => { setUnitPrice(''); onClose(); }, onError: (e) => setErr(apiMessage(e)) },
    );
  };
  return (
    <Dialog
      open={open} onClose={onClose} title="단가 등록"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={write.isPending}>취소 (Esc)</Button>
          <Button type="button" onClick={submit} disabled={!ready}>{write.isPending ? '저장 중…' : '등록'}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${id}-kind`}>종류</Label>
            <Select id={`${id}-kind`} value={kindKey} onChange={(e) => setKindKey(e.target.value)} disabled={write.isPending}>
              <option value="">고르세요</option>
              {(meta?.kinds ?? []).map((k) => <option key={k.key} value={k.key}>{k.name}{k.extra ? ' · 추가 수업' : ''}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-sub`} hint="비우면 그 종류 전체">과목</Label>
            <Select id={`${id}-sub`} value={subKey} onChange={(e) => setSubKey(e.target.value)} disabled={write.isPending}>
              <option value="">전체</option>
              {(meta?.subs ?? []).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor={`${id}-heads`} hint="구간">인원</Label>
            <Input id={`${id}-heads`} type="number" min={1} max={100} inputMode="numeric" value={heads} onChange={(e) => setHeads(e.target.value)} disabled={write.isPending} />
          </div>
          <div>
            <Label htmlFor={`${id}-price`} hint="원">회당 단가</Label>
            <Input id={`${id}-price`} type="number" min={1} inputMode="numeric" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} disabled={write.isPending} />
          </div>
          <div>
            <Label htmlFor={`${id}-from`}>언제부터</Label>
            <Input id={`${id}-from`} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} disabled={write.isPending} />
          </div>
        </div>
        <p className="text-[11px] text-fg-subtle">
          그 날짜 이후 회차의 청구서·수업료 계산·명단 가격이 이 값을 읽습니다. 지난 줄은 남습니다 — 이미 낸 청구서가 그 값으로 서 있습니다.
          그룹은 인원마다 줄을 둡니다(인원이 늘면 1인 단가가 내려갑니다 · D-R10).
        </p>
        {err ? <Banner tone="danger">{err}</Banner> : null}
      </div>
    </Dialog>
  );
}

/** 「+ 예외 등록」 — 학생 · 종류(선택) · 회당 단가 · 언제부터 · **사유(필수)** */
function StudentRateForm({ open, onClose, meta }: { open: boolean; onClose: () => void; meta: Meta | undefined }) {
  const id = useId();
  const write = useWriteStudentRate();
  const [studentId, setStudentId] = useState('');
  const [kindKey, setKindKey] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [fromDate, setFromDate] = useState(todayKst());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const price = Number(unitPrice);
  const sid = Number(studentId);
  // 사유가 비면 단추가 서지 않는다 — 서버(400)·표(CHECK)가 어차피 막지만 왜 못 보내는지를 먼저 보인다 (H-81)
  const ready = sid > 0 && Number.isInteger(price) && price > 0 && ISO.test(fromDate) && reason.trim() !== '' && !write.isPending;
  const submit = () => {
    if (!ready) return;
    setErr(null);
    write.mutate(
      { studentId: sid, unitPrice: price, fromDate, reason: reason.trim(), ...(kindKey ? { kindKey } : {}) },
      { onSuccess: () => { setUnitPrice(''); setReason(''); onClose(); }, onError: (e) => setErr(apiMessage(e)) },
    );
  };
  return (
    <Dialog
      open={open} onClose={onClose} title="학생별 예외 등록"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={write.isPending}>취소 (Esc)</Button>
          <Button type="button" onClick={submit} disabled={!ready}>{write.isPending ? '저장 중…' : '등록'}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${id}-stu`}>학생</Label>
            <Select id={`${id}-stu`} value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={write.isPending}>
              <option value="">고르세요</option>
              {(meta?.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.grade ? ` · ${s.grade}` : ''}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-kind`} hint="비우면 모든 종류">종류</Label>
            <Select id={`${id}-kind`} value={kindKey} onChange={(e) => setKindKey(e.target.value)} disabled={write.isPending}>
              <option value="">전체</option>
              {(meta?.kinds ?? []).map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${id}-price`} hint="원">회당 단가</Label>
            <Input id={`${id}-price`} type="number" min={1} inputMode="numeric" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} disabled={write.isPending} />
          </div>
          <div>
            <Label htmlFor={`${id}-from`}>언제부터</Label>
            <Input id={`${id}-from`} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} disabled={write.isPending} />
          </div>
        </div>
        <div>
          <Label htmlFor={`${id}-reason`} hint="필수 · 200자">사유</Label>
          <Input id={`${id}-reason`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} disabled={write.isPending} placeholder="예: 형제 할인 · 장학" />
        </div>
        <p className="text-[11px] text-fg-subtle">
          이 학생의 이 종류만 이 값으로 청구됩니다 — 같은 수업의 다른 학생은 바뀌지 않습니다. 사유가 없으면 저장되지 않습니다.
        </p>
        {err ? <Banner tone="danger">{err}</Banner> : null}
      </div>
    </Dialog>
  );
}

const Current = ({ on }: { on: boolean }) => (on ? <Chip size="compact" tone="success">지금</Chip> : <span className="text-[11px] text-fg-subtle">지남·예정</span>);

export function RateBook({ data, loading }: { data: RateBookData | undefined; loading: boolean }) {
  // 코드표는 창을 열 때만 받는다 — 단가표를 보기만 하는 사람에게 /meta 를 더 부르지 않는다 (C50 의 교훈)
  const [dialog, setDialog] = useState<'rate' | 'student' | null>(null);
  const meta = useMeta(dialog !== null);

  const rateCols: Array<Column<RateRow>> = [
    { key: 'k', head: '종류', width: 140, cell: (r) => <span className="font-bold">{r.kindName}{r.kindExtra ? <Chip size="compact" tone="info" className="ml-1">추가</Chip> : null}</span> },
    { key: 's', head: '과목', width: 160, cell: (r) => r.subName ?? <span className="text-fg-subtle">전체</span> },
    { key: 'h', head: '인원', width: 70, align: 'right', cell: (r) => `${r.heads}인` },
    { key: 'u', head: '회당 단가', width: 120, align: 'right', cell: (r) => <b>{won(r.unitPrice)}</b> },
    { key: 'f', head: '언제부터', width: 110, cell: (r) => r.fromDate },
    { key: 'c', head: '', width: 90, cell: (r) => <Current on={r.current} /> },
  ];
  const stuCols: Array<Column<StudentRateRow>> = [
    { key: 'n', head: '학생', width: 120, cell: (r) => <span className="font-bold">{r.studentName}</span> },
    { key: 'k', head: '종류', width: 120, cell: (r) => r.kindName ?? <span className="text-fg-subtle">전체</span> },
    { key: 'u', head: '회당 단가', width: 120, align: 'right', cell: (r) => <b>{won(r.unitPrice)}</b> },
    { key: 'f', head: '언제부터', width: 110, cell: (r) => r.fromDate },
    { key: 'r', head: '사유', cell: (r) => r.reason ?? <span className="text-fg-subtle">— (옛 줄)</span> },
    { key: 'b', head: '누가', width: 110, cell: (r) => <span className="text-fg-subtle">{r.byName ?? '—'}{r.createdAt ? ` · ${r.createdAt.slice(5, 10)}` : ''}</span> },
    { key: 'c', head: '', width: 90, cell: (r) => <Current on={r.current} /> },
  ];

  const head = (title: string, sub: string, action: ReactNode) => (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[13px] font-bold text-fg">{title}</h2>
        <p className="mt-0.5 text-[11px] text-fg-subtle">{sub}</p>
      </div>
      {action}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        {head('기본 단가표', '종류 → 과목 → 인원 구간 · 「지금」이 오늘 적용되는 줄입니다. 청구서·수업료 계산·명단 가격이 이 표를 읽습니다.',
          <Button type="button" size="sm" variant="secondary" onClick={() => setDialog('rate')}>+ 단가 등록</Button>)}
        <Table columns={rateCols} rows={data?.rates ?? []} rowKey={(r) => r.id} empty={loading ? '불러오는 중…' : '단가가 없습니다'} />
      </Panel>
      <Panel>
        {head('학생별 예외', '그 학생의 그 종류만 이 값으로 — 사유가 남습니다 (H-81).',
          <Button type="button" size="sm" variant="secondary" onClick={() => setDialog('student')}>+ 예외 등록</Button>)}
        <Table columns={stuCols} rows={data?.studentRates ?? []} rowKey={(r) => r.id} empty={loading ? '불러오는 중…' : '예외가 없습니다'} />
      </Panel>
      <RateForm open={dialog === 'rate'} onClose={() => setDialog(null)} meta={meta.data} />
      <StudentRateForm open={dialog === 'student'} onClose={() => setDialog(null)} meta={meta.data} />
    </div>
  );
}
