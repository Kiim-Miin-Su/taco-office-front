/** @file-guide
 * 목적: 최종 관리자 수정사항 p108·p115와 Figma A26의 시간당 기준 단가·Kinder·학생 예외를 생성 계약으로 관리한다. (component)
 * 책임/재사용: 기존 RATE/STURATE는 회당 이력으로 보존하고 신규 정책의 생성·교체·종료는 공용 Query와 서버 projection만 사용한다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-11E-HOURLY-RATE-POLICY-2026-10-09.md · docs/AGENT.md
 */
'use client';
import { useId, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useCreateHourlyRate, useMeta, useReplaceHourlyRate, useRetireHourlyRate } from '@/api/queries';
import type { HourlyRatePolicy, RateBook as RateBookData, RateRow, StudentRateRow } from '@/api/types';
import { Banner, Button, Chip, Dialog, FieldError, Input, Label, Panel, Segmented, Select, Table, type Column } from '@/components/ui';
import { addDays, kstDateTime, todayKst } from '@/lib/calendar';
import { won } from '@/lib/money';

type DraftMode = 'base' | 'group' | 'student';
type BaseTarget = 'general' | 'kinder';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const requestKey = () => globalThis.crypto.randomUUID();
const stateLabel: Record<HourlyRatePolicy['state'], string> = {
  scheduled: '예약', current: '현재', ended: '종료', voided: '취소',
};
const actionLabel: Record<HourlyRatePolicy['events'][number]['action'], string> = {
  created: '생성', superseded: '교체', retired: '종료',
};

function targetLabel(rate: HourlyRatePolicy): string {
  if (rate.scope === 'general') return '일반 수업';
  if (rate.scope === 'kinder') return 'Kinder 1대1';
  if (rate.scope === 'group') return `그룹 ${rate.capacity}명`;
  return `${rate.studentName ?? `학생 #${rate.studentId}`}${rate.kindName ? ` · ${rate.kindName}` : ' · 전체 종류'}`;
}

function ContractActions() {
  return (
    <Chip tone="neutral">읽기 전용</Chip>
  );
}

function HourlyRateCards({ rates, pending, onEdit, onRetire, onHistory }: {
  rates: readonly HourlyRatePolicy[];
  pending: boolean;
  onEdit: (rate: HourlyRatePolicy) => void;
  onRetire: (rate: HourlyRatePolicy) => void;
  onHistory: (rate: HourlyRatePolicy) => void;
}) {
  if (rates.length === 0) {
    return <p className="rounded-xl border border-line bg-inset px-3 py-8 text-center text-[12px] text-fg-subtle">저장된 시간당 단가가 없습니다</p>;
  }
  return <div className="flex flex-col gap-2 lg:hidden" aria-label="시간당 기준 단가 카드">{rates.map((rate) => (
    <article key={rate.id} className="rounded-xl border border-line bg-card p-3">
      <header className="flex items-start justify-between gap-2"><b className="text-[13px] text-fg">{targetLabel(rate)}</b>
        <Chip tone={rate.state === 'current' ? 'success' : rate.state === 'scheduled' ? 'info' : 'neutral'}>{stateLabel[rate.state]}</Chip></header>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div><dt className="text-fg-subtle">1인 시간당</dt><dd className="font-bold text-fg">{won(rate.hourlyAmount)}</dd></div>
        <div><dt className="text-fg-subtle">서버 계산</dt><dd className="font-bold text-fg">{rate.totalHourlyAmount !== null
          ? `총 ${won(rate.totalHourlyAmount)}` : rate.basisPercent !== null ? `기준 대비 ${rate.basisPercent}%` : '—'}</dd></div>
        <div className="col-span-2"><dt className="text-fg-subtle">적용 기간</dt><dd className="text-fg-2">{rate.effectiveFrom} ~ {rate.effectiveTo ?? '계속'}</dd></div>
        <div className="col-span-2"><dt className="text-fg-subtle">사유</dt><dd className="text-fg-2">{rate.reason ?? '—'} · v{rate.version}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => onHistory(rate)}>이력 {rate.events.length}</Button>
        {rate.canEdit ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => onEdit(rate)}>교체</Button> : null}
        {rate.canRetire ? <Button size="sm" variant="danger" disabled={pending} onClick={() => onRetire(rate)}>종료</Button> : null}
      </div>
    </article>
  ))}</div>;
}

function LegacyRateCards({ rates }: { rates: readonly RateRow[] }) {
  if (rates.length === 0) return <p className="rounded-xl border border-line bg-inset px-3 py-8 text-center text-[12px] text-fg-subtle">기존 회당 단가 이력이 없습니다</p>;
  return (
    <div className="flex flex-col gap-2 lg:hidden" aria-label="기존 회당 단가 카드">
      {rates.map((rate) => (
        <article key={rate.id} className="rounded-xl border border-line bg-card p-3">
          <header className="flex items-start justify-between gap-2">
            <b className="text-[13px] text-fg">{rate.kindName}{rate.subName ? ` · ${rate.subName}` : ''}</b>
            {rate.current ? <Chip tone="success">현재</Chip> : <Chip tone="neutral">과거</Chip>}
          </header>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <div><dt className="text-fg-subtle">인원 구간</dt><dd className="font-bold text-fg">{rate.heads}명</dd></div>
            <div><dt className="text-fg-subtle">회당 단가</dt><dd className="font-bold text-fg">{won(rate.unitPrice)}</dd></div>
            <div className="col-span-2"><dt className="text-fg-subtle">적용 시작</dt><dd className="text-fg-2">{rate.fromDate}</dd></div>
          </dl>
          <div className="mt-3"><ContractActions /></div>
        </article>
      ))}
    </div>
  );
}

function LegacyStudentCards({ rates }: { rates: readonly StudentRateRow[] }) {
  if (rates.length === 0) return <p className="rounded-xl border border-line bg-inset px-3 py-8 text-center text-[12px] text-fg-subtle">기존 학생별 회당 예외가 없습니다</p>;
  return (
    <div className="flex flex-col gap-2 lg:hidden" aria-label="기존 학생별 회당 예외 카드">
      {rates.map((rate) => (
        <article key={rate.id} className="rounded-xl border border-line bg-card p-3">
          <header className="flex items-start justify-between gap-2">
            <b className="text-[13px] text-fg">{rate.studentName}</b>
            {rate.current ? <Chip tone="success">현재</Chip> : <Chip tone="neutral">과거</Chip>}
          </header>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <div><dt className="text-fg-subtle">종류</dt><dd className="font-bold text-fg">{rate.kindName ?? '전체'}</dd></div>
            <div><dt className="text-fg-subtle">회당 단가</dt><dd className="font-bold text-fg">{won(rate.unitPrice)}</dd></div>
            <div><dt className="text-fg-subtle">적용 시작</dt><dd className="text-fg-2">{rate.fromDate}</dd></div>
            <div><dt className="text-fg-subtle">사유</dt><dd className="text-fg-2">{rate.reason ?? '이전 데이터 · 사유 없음'}</dd></div>
          </dl>
          <div className="mt-3"><ContractActions /></div>
        </article>
      ))}
    </div>
  );
}

export function RateBook({ data, loading }: { data: RateBookData | undefined; loading: boolean }) {
  const id = useId();
  const [mode, setMode] = useState<DraftMode>('base');
  const [baseTarget, setBaseTarget] = useState<BaseTarget>('general');
  const [studentId, setStudentId] = useState('');
  const [kindKey, setKindKey] = useState('');
  const [hourlyPrice, setHourlyPrice] = useState('');
  const [capacity, setCapacity] = useState('');
  const [fromDate, setFromDate] = useState(todayKst());
  const [untilDate, setUntilDate] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState({ price: false, capacity: false, student: false, reason: false, from: false, until: false });
  const [editing, setEditing] = useState<{
    item: HourlyRatePolicy; hourlyAmount: string; effectiveFrom: string; effectiveTo: string; reason: string;
  } | null>(null);
  const [retiring, setRetiring] = useState<HourlyRatePolicy | null>(null);
  const [retireReason, setRetireReason] = useState('');
  const [history, setHistory] = useState<HourlyRatePolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = useMeta(mode === 'student');
  const create = useCreateHourlyRate();
  const replace = useReplaceHourlyRate();
  const retire = useRetireHourlyRate();
  const pending = create.isPending || replace.isPending || retire.isPending;

  const priceNumber = Number(hourlyPrice);
  const priceInvalid = hourlyPrice.trim() === '' || !Number.isInteger(priceNumber) || priceNumber <= 0 || priceNumber > 100_000_000;
  const priceError = touched.price && priceInvalid;
  const capacityNumber = Number(capacity);
  const capacityInvalid = mode === 'group' && (capacity.trim() === '' || !Number.isInteger(capacityNumber) || capacityNumber < 2 || capacityNumber > 100);
  const capacityError = touched.capacity && capacityInvalid;
  const studentError = mode === 'student' && touched.student && studentId === '';
  const reasonInvalid = reason.length > 200 || (mode === 'student' && reason.trim() === '');
  const reasonError = touched.reason && reasonInvalid;
  const untilError = touched.until && untilDate !== '' && (!ISO.test(untilDate) || untilDate < fromDate);
  const fromInvalid = !ISO.test(fromDate) || fromDate < todayKst();
  const ready = !priceInvalid && !capacityInvalid && (mode !== 'student' || studentId !== '')
    && !reasonInvalid && !fromInvalid && (untilDate === '' || (ISO.test(untilDate) && untilDate >= fromDate)) && !pending;

  const resetDraft = (nextMode = mode) => {
    setBaseTarget('general');
    setStudentId('');
    setKindKey('');
    setHourlyPrice('');
    setCapacity('');
    setFromDate(todayKst());
    setUntilDate('');
    setReason('');
    setTouched({ price: false, capacity: false, student: false, reason: false, from: false, until: false });
    setMode(nextMode);
    setError(null);
  };

  const submit = () => {
    setTouched({ price: true, capacity: true, student: true, reason: true, from: true, until: true });
    if (!ready) return;
    setError(null);
    create.mutate({
      scope: mode === 'base' ? baseTarget : mode,
      ...(mode === 'student' ? { studentId: Number(studentId), ...(kindKey ? { kindKey } : {}) } : {}),
      ...(mode === 'group' ? { capacity: capacityNumber } : {}),
      hourlyAmount: priceNumber,
      effectiveFrom: fromDate,
      ...(untilDate ? { effectiveTo: untilDate } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      requestKey: requestKey(),
    }, {
      onSuccess: () => resetDraft(),
      onError: (cause) => setError(apiMessage(cause)),
    });
  };

  const openEdit = (item: HourlyRatePolicy) => {
    const tomorrow = addDays(todayKst(), 1);
    setEditing({
      item,
      hourlyAmount: String(item.hourlyAmount),
      effectiveFrom: item.state === 'scheduled' && item.effectiveFrom > todayKst() ? item.effectiveFrom : tomorrow,
      effectiveTo: '',
      reason: '',
    });
    setError(null);
  };

  const rateColumns: Array<Column<RateRow>> = [
    { key: 'kind', head: '종류 · 과목', width: 180, cell: (rate) => <b>{rate.kindName}{rate.subName ? ` · ${rate.subName}` : ''}</b> },
    { key: 'heads', head: '인원 구간', width: 90, align: 'center', cell: (rate) => `${rate.heads}명` },
    { key: 'price', head: '회당 단가', width: 120, align: 'right', cell: (rate) => <b>{won(rate.unitPrice)}</b> },
    { key: 'from', head: '적용 시작', width: 110, cell: (rate) => rate.fromDate },
    { key: 'state', head: '상태', width: 70, cell: (rate) => rate.current ? <Chip tone="success">현재</Chip> : <Chip tone="neutral">과거</Chip> },
    { key: 'actions', head: '', width: 245, align: 'right', cell: () => <ContractActions /> },
  ];
  const studentColumns: Array<Column<StudentRateRow>> = [
    { key: 'student', head: '학생', width: 120, cell: (rate) => <b>{rate.studentName}</b> },
    { key: 'kind', head: '종류', width: 100, cell: (rate) => rate.kindName ?? '전체' },
    { key: 'price', head: '회당 단가', width: 110, align: 'right', cell: (rate) => <b>{won(rate.unitPrice)}</b> },
    { key: 'from', head: '적용 시작', width: 110, cell: (rate) => rate.fromDate },
    { key: 'reason', head: '사유 · 작성자', width: 180, cell: (rate) => `${rate.reason ?? '이전 데이터 · 사유 없음'}${rate.byName ? ` · ${rate.byName}` : ''}` },
    { key: 'state', head: '상태', width: 70, cell: (rate) => rate.current ? <Chip tone="success">현재</Chip> : <Chip tone="neutral">과거</Chip> },
    { key: 'actions', head: '', width: 245, align: 'right', cell: () => <ContractActions /> },
  ];
  const hourlyColumns: Array<Column<HourlyRatePolicy>> = [
    { key: 'target', head: '적용 대상', width: 190, cell: (rate) => <span><b>{targetLabel(rate)}</b>{rate.studentTag ? <small className="block text-fg-subtle">{rate.studentTag}{rate.studentKinderMarked ? ' · Kinder 표시' : ''}</small> : null}</span> },
    { key: 'price', head: '1인 시간당', width: 120, align: 'right', cell: (rate) => <b>{won(rate.hourlyAmount)}</b> },
    { key: 'server', head: '서버 계산', width: 145, align: 'right', cell: (rate) => rate.totalHourlyAmount !== null
      ? <span>총 {won(rate.totalHourlyAmount)}</span>
      : rate.basisPercent !== null ? <span>{won(rate.basisHourlyAmount ?? 0)} 대비 {rate.basisPercent}%</span> : <span className="text-fg-subtle">—</span> },
    { key: 'period', head: '적용 기간', width: 190, cell: (rate) => `${rate.effectiveFrom} ~ ${rate.effectiveTo ?? '계속'}` },
    { key: 'reason', head: '사유 · 변경자', width: 210, cell: (rate) => <span>{rate.reason ?? '—'}<small className="block text-fg-subtle">{rate.updatedBy} · v{rate.version}</small></span> },
    { key: 'state', head: '상태', width: 75, cell: (rate) => <Chip tone={rate.state === 'current' ? 'success' : rate.state === 'scheduled' ? 'info' : 'neutral'}>{stateLabel[rate.state]}</Chip> },
    { key: 'actions', head: '', width: 210, align: 'right', cell: (rate) => <span className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setHistory(rate)}>이력 {rate.events.length}</Button>
      {rate.canEdit ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => openEdit(rate)}>교체</Button> : null}
      {rate.canRetire ? <Button size="sm" variant="danger" disabled={pending} onClick={() => { setRetiring(rate); setRetireReason(''); setError(null); }}>종료</Button> : null}
    </span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1"><Chip tone="success">시간당 정책 연결됨</Chip></div>
            <h2 className="text-[15px] font-bold text-fg">기준 단가 — 시간당 · Kinder · 학생 예외</h2>
            <p className="mt-1 text-[12px] text-fg-subtle">청구·명단 가격을 같은 시간당 정책과 효력기간으로 관리합니다</p>
          </div>
        </header>

        <Banner tone="neutral" className="mb-4">
          아래 기존 단가는 <b>회당 금액</b>으로 읽기 전용 보존됩니다. 새 시간당 정책은 실제 수업일과 실제 수업 시간에 적용되며 확정 청구·급여를 다시 계산하지 않습니다.
        </Banner>
        {error ? <Banner tone="danger" className="mb-4">{error}</Banner> : null}

        <div className="mb-4 grid gap-2 sm:grid-cols-3" aria-label="Kinder와 그룹 단가 원칙">
          <div className="rounded-xl border border-line bg-inset p-3"><div className="text-[12px] text-fg-subtle">Kinder 정원</div><b className="mt-1 block text-[13px] text-fg">Kinder 학생은 1명만</b></div>
          <div className="rounded-xl border border-line bg-inset p-3"><div className="text-[12px] text-fg-subtle">Kinder 강사 급여</div><b className="mt-1 block text-[13px] text-fg">강사 급여 · 기본 시급 +10,000원/시간</b></div>
          <div className="rounded-xl border border-line bg-inset p-3"><div className="text-[12px] text-fg-subtle">Kinder 그룹 가산</div><b className="mt-1 block text-[13px] text-fg">그룹 가산 · 0원</b></div>
        </div>

        <div className="mb-4">
          <Label>입력 종류</Label>
          <Segmented<DraftMode>
            className="max-sm:[&>button]:min-h-11"
            ariaLabel="기준 단가 입력 종류"
            value={mode}
            onChange={(next) => resetDraft(next)}
            options={[
              { value: 'base', label: '일반 · Kinder' },
              { value: 'group', label: '그룹' },
              { value: 'student', label: '학생 예외' },
            ]}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="기준 단가 입력">
          {mode === 'base' ? (
            <div>
              <Label htmlFor={`${id}-base-target`}>수업 구분</Label>
              <Select className="max-sm:h-11" id={`${id}-base-target`} value={baseTarget} onChange={(event) => setBaseTarget(event.target.value as BaseTarget)}>
                <option value="general">일반 수업</option>
                <option value="kinder">Kinder 1대1</option>
              </Select>
            </div>
          ) : mode === 'group' ? (
            <div>
              <Label htmlFor={`${id}-capacity`} hint="2명 이상">정원</Label>
              <Input className="max-sm:h-11" id={`${id}-capacity`} type="number" min={2} max={100} step={1} inputMode="numeric" value={capacity}
                error={capacityError} aria-invalid={capacityError}
                onBlur={() => setTouched((value) => ({ ...value, capacity: true }))}
                onChange={(event) => setCapacity(event.target.value)} placeholder="예: 4" />
              <FieldError>{capacityError ? '2~100명의 정수를 적어 주세요' : undefined}</FieldError>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor={`${id}-student`}>대상 학생</Label>
                <Select className="max-sm:h-11" id={`${id}-student`} value={studentId} error={studentError} aria-invalid={studentError}
                  onBlur={() => setTouched((value) => ({ ...value, student: true }))}
                  onChange={(event) => setStudentId(event.target.value)}>
                  <option value="">선택</option>
                  {(meta.data?.students ?? []).map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
                </Select>
                <FieldError>{studentError ? '학생을 골라 주세요' : undefined}</FieldError>
              </div>
              <div>
                <Label htmlFor={`${id}-kind`}>적용 종류</Label>
                <Select className="max-sm:h-11" id={`${id}-kind`} value={kindKey} onChange={(event) => setKindKey(event.target.value)}>
                  <option value="">전체</option>
                  {(meta.data?.kinds ?? []).map((kind) => <option key={kind.key} value={kind.key}>{kind.name}</option>)}
                </Select>
              </div>
            </>
          )}

          <div>
            <Label htmlFor={`${id}-price`} hint="원/시간">{mode === 'student' ? '개별 시간당 단가' : mode === 'group' ? '1인 시간당 단가' : '시간당 단가'}</Label>
            <Input className="max-sm:h-11" id={`${id}-price`} type="number" min={1} max={100000000} step={1000} inputMode="numeric" value={hourlyPrice}
              error={priceError} aria-invalid={priceError}
              onBlur={() => setTouched((value) => ({ ...value, price: true }))}
              onChange={(event) => setHourlyPrice(event.target.value)} placeholder="예: 60000" />
            <FieldError>{priceError ? '1~100,000,000원의 정수로 적어 주세요' : undefined}</FieldError>
          </div>

          <div>
            <Label htmlFor={`${id}-from`}>언제부터</Label>
            <Input className="max-sm:h-11" id={`${id}-from`} type="date" min={todayKst()} value={fromDate}
              error={touched.from && fromInvalid} aria-invalid={touched.from && fromInvalid}
              onBlur={() => setTouched((value) => ({ ...value, from: true }))}
              onChange={(event) => setFromDate(event.target.value)} />
            <FieldError>{touched.from && fromInvalid ? '오늘 이후 날짜로 적어 주세요' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-until`} hint="선택">언제까지</Label>
            <Input className="max-sm:h-11" id={`${id}-until`} type="date" value={untilDate} error={untilError} aria-invalid={untilError}
              onBlur={() => setTouched((value) => ({ ...value, until: true }))}
              onChange={(event) => setUntilDate(event.target.value)} />
            <FieldError>{untilError ? '시작일과 같거나 뒤인 날짜로 적어 주세요' : undefined}</FieldError>
          </div>
          <div className="sm:col-span-2 xl:col-span-4">
            <Label htmlFor={`${id}-reason`} hint={mode === 'student' ? '필수' : '변경 시 기록'}>사유</Label>
            <Input className="max-sm:h-11" id={`${id}-reason`} value={reason} maxLength={200} error={reasonError} aria-invalid={reasonError}
              onBlur={() => setTouched((value) => ({ ...value, reason: true }))}
              onChange={(event) => setReason(event.target.value)} placeholder={mode === 'student' ? '예: 형제 할인' : '변경 사유'} />
            <FieldError>{reasonError ? (reason.length > 200 ? '사유는 200자 이하여야 합니다' : '학생 예외 사유를 적어 주세요') : undefined}</FieldError>
          </div>
        </div>

        {mode === 'group' ? <p className="mt-3 rounded-lg border border-line bg-inset px-3 py-2 text-[12px] font-bold text-fg-2">총액/시간 · 서버 재계산 후 표시</p> : null}
        {mode === 'student' ? <p className="mt-3 rounded-lg border border-line bg-inset px-3 py-2 text-[12px] font-bold text-fg-2">기준 대비 % · 서버 재계산 후 표시</p> : null}

        <div className="sticky bottom-2 z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/95 p-2 shadow-sm backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <p className="text-[12px] text-fg-subtle">저장한 단가는 적용 기간에 맞춰 청구와 수업료에 반영되며, 이미 확정된 청구와 급여는 바뀌지 않습니다.</p>
          <div className="flex gap-2">
            <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={() => resetDraft()}>초안 지우기</Button>
            <Button className="max-sm:min-h-11" size="sm" disabled={!ready} onClick={submit}>
              {create.isPending ? '저장 중…' : mode === 'student' ? '학생 예외 저장' : '시간당 단가 저장'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="시간당 기준 단가" sub="일반·Kinder·그룹과 학생 예외를 같은 적용 기준으로 읽습니다">
        <div className="hidden lg:block" aria-label="시간당 기준 단가 표">
          <Table columns={hourlyColumns} rows={data?.hourlyRates ?? []} rowKey={(rate) => rate.id}
            empty={loading ? '불러오는 중…' : '저장된 시간당 단가가 없습니다'} />
        </div>
        <HourlyRateCards rates={data?.hourlyRates ?? []} pending={pending} onEdit={openEdit}
          onRetire={(rate) => { setRetiring(rate); setRetireReason(''); setError(null); }} onHistory={setHistory} />
      </Panel>

      <Panel title="기존 회당 단가 이력" sub="현재 RATE/STURATE는 시간당 단가로 환산하지 않고 기존 의미 그대로 보존합니다">
        <h3 className="mb-2 text-[13px] font-bold text-fg">기본 RATE</h3>
        <div className="hidden lg:block" aria-label="기존 회당 단가 표">
          <Table columns={rateColumns} rows={data?.rates ?? []} rowKey={(rate) => rate.id} empty={loading ? '불러오는 중…' : '기존 회당 단가 이력이 없습니다'} />
        </div>
        <LegacyRateCards rates={data?.rates ?? []} />

        <h3 className="mb-2 mt-5 text-[13px] font-bold text-fg">학생별 STURATE</h3>
        <div className="hidden lg:block" aria-label="기존 학생별 회당 예외 표">
          <Table columns={studentColumns} rows={data?.studentRates ?? []} rowKey={(rate) => rate.id} empty={loading ? '불러오는 중…' : '기존 학생별 회당 예외가 없습니다'} />
        </div>
        <LegacyStudentCards rates={data?.studentRates ?? []} />
      </Panel>

      {editing ? <Dialog open closeX onClose={() => setEditing(null)} title="시간당 단가 교체"
        sub={`${targetLabel(editing.item)} · 현재 v${editing.item.version}`}
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" disabled={replace.isPending} onClick={() => setEditing(null)}>닫기</Button>
          <Button disabled={replace.isPending || !Number.isInteger(Number(editing.hourlyAmount)) || Number(editing.hourlyAmount) < 1
            || Number(editing.hourlyAmount) > 100_000_000 || !ISO.test(editing.effectiveFrom) || editing.effectiveFrom <= todayKst()
            || (editing.effectiveTo !== '' && editing.effectiveTo < editing.effectiveFrom) || editing.reason.trim().length < 2}
            onClick={() => {
              setError(null);
              replace.mutate({ policyId: editing.item.id, body: {
                expectedVersion: editing.item.version,
                hourlyAmount: Number(editing.hourlyAmount), effectiveFrom: editing.effectiveFrom,
                ...(editing.effectiveTo ? { effectiveTo: editing.effectiveTo } : {}),
                reason: editing.reason.trim(), requestKey: requestKey(),
              } }, { onSuccess: () => setEditing(null), onError: (cause) => setError(apiMessage(cause)) });
            }}>{replace.isPending ? '교체 중…' : '미래 단가로 교체'}</Button></div>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor={`${id}-edit-price`} hint="원/시간">새 시간당 단가</Label>
            <Input id={`${id}-edit-price`} type="number" min={1} max={100000000} value={editing.hourlyAmount}
              onChange={(event) => setEditing({ ...editing, hourlyAmount: event.target.value })} /></div>
          <div><Label htmlFor={`${id}-edit-from`} hint="내일 이후">교체 적용일</Label>
            <Input id={`${id}-edit-from`} type="date" min={addDays(todayKst(), 1)} value={editing.effectiveFrom}
              onChange={(event) => setEditing({ ...editing, effectiveFrom: event.target.value })} /></div>
          <div><Label htmlFor={`${id}-edit-to`} hint="선택">새 정책 종료일</Label>
            <Input id={`${id}-edit-to`} type="date" min={editing.effectiveFrom} value={editing.effectiveTo}
              onChange={(event) => setEditing({ ...editing, effectiveTo: event.target.value })} /></div>
          <div><Label htmlFor={`${id}-edit-reason`} hint="필수 · 200자">교체 사유</Label>
            <Input id={`${id}-edit-reason`} maxLength={200} value={editing.reason}
              onChange={(event) => setEditing({ ...editing, reason: event.target.value })} /></div>
        </div>
        <p className="mt-3 text-[12px] text-fg-subtle">대상과 정원은 유지됩니다. 기존 줄은 덮지 않고 교체 직전까지의 기간과 이력을 보존합니다.</p>
      </Dialog> : null}

      {retiring ? <Dialog open closeX onClose={() => setRetiring(null)} title="시간당 단가 종료"
        sub={`${targetLabel(retiring)} · v${retiring.version}`}
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" disabled={retire.isPending} onClick={() => setRetiring(null)}>닫기</Button>
          <Button variant="danger" disabled={retire.isPending || retireReason.trim().length < 2} onClick={() => {
            setError(null);
            retire.mutate({ policyId: retiring.id, body: {
              expectedVersion: retiring.version, reason: retireReason.trim(), requestKey: requestKey(),
            } }, { onSuccess: () => setRetiring(null), onError: (cause) => setError(apiMessage(cause)) });
          }}>{retire.isPending ? '종료 중…' : retiring.state === 'scheduled' ? '예약 취소' : '오늘까지 적용 후 종료'}</Button></div>}>
        <Label htmlFor={`${id}-retire-reason`} hint="필수 · 200자">종료 사유</Label>
        <Input id={`${id}-retire-reason`} maxLength={200} value={retireReason}
          onChange={(event) => setRetireReason(event.target.value)} placeholder="두 글자 이상" />
      </Dialog> : null}

      {history ? <Dialog open closeX onClose={() => setHistory(null)} title="시간당 단가 이력"
        sub={`${targetLabel(history)} · 현재 v${history.version}`}
        footer={<div className="flex justify-end"><Button variant="ghost" onClick={() => setHistory(null)}>닫기</Button></div>}>
        <ol className="space-y-2">{history.events.map((event) => <li key={`${event.version}-${event.action}`}
          className="rounded-lg border border-line px-3 py-2 text-[12px] text-fg-2">
          <div className="flex items-center justify-between gap-2"><b className="text-fg">v{event.version} · {actionLabel[event.action]}</b>
            <span>{kstDateTime(event.createdAt) ?? '시각 미상'}</span></div>
          <p className="mt-1">{event.actor} · {won(event.hourlyAmount)}/시간 · {event.effectiveFrom} ~ {event.effectiveTo ?? '계속'}
            {event.reason ? ` · ${event.reason}` : ''}</p>
        </li>)}</ol>
      </Dialog> : null}

    </div>
  );
}
