/** @file-guide
 * 목적: 최종 관리자 수정사항 p108·p115와 Figma A26의 시간당 기준 단가·Kinder·학생 예외를 생성 계약 전 Front 경계로 제공한다. (component)
 * 책임/재사용: 기존 RATE/STURATE reader는 회당 이력으로만 보존하고, 시간당 정책·효력기간·수정/삭제·계산 성공을 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useId, useState } from 'react';
import { useMeta } from '@/api/queries';
import type { RateBook as RateBookData, RateRow, StudentRateRow } from '@/api/types';
import { Banner, Button, Chip, FieldError, Input, Label, Panel, Segmented, Select, Table, type Column } from '@/components/ui';
import { todayKst } from '@/lib/calendar';
import { won } from '@/lib/money';

type DraftMode = 'base' | 'group' | 'student';
type BaseTarget = 'general' | 'kinder';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function ContractActions() {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      <Button className="max-sm:min-h-11" size="sm" variant="secondary" disabled title="기존 회당 이력은 이 화면에서 바꿀 수 없습니다">수정 준비 중</Button>
      <Button className="max-sm:min-h-11" size="sm" variant="danger" disabled title="기존 회당 이력은 이 화면에서 지울 수 없습니다">삭제 준비 중</Button>
    </span>
  );
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
  const [touched, setTouched] = useState({ price: false, capacity: false, student: false, reason: false, until: false });
  const meta = useMeta(mode === 'student');

  const priceNumber = Number(hourlyPrice);
  const priceError = touched.price && (!Number.isInteger(priceNumber) || priceNumber <= 0);
  const capacityNumber = Number(capacity);
  const capacityError = mode === 'group' && touched.capacity && (!Number.isInteger(capacityNumber) || capacityNumber < 2);
  const studentError = mode === 'student' && touched.student && studentId === '';
  const reasonError = mode === 'student' && touched.reason && reason.trim() === '';
  const untilError = touched.until && untilDate !== '' && (!ISO.test(untilDate) || untilDate < fromDate);

  const resetDraft = (nextMode = mode) => {
    setBaseTarget('general');
    setStudentId('');
    setKindKey('');
    setHourlyPrice('');
    setCapacity('');
    setFromDate(todayKst());
    setUntilDate('');
    setReason('');
    setTouched({ price: false, capacity: false, student: false, reason: false, until: false });
    setMode(nextMode);
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

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1"><Chip tone="warning">시간당 저장 준비 중</Chip></div>
            <h2 className="text-[15px] font-bold text-fg">기준 단가 — 시간당 · Kinder · 학생 예외</h2>
            <p className="mt-1 text-[12px] text-fg-subtle">청구·명단 가격을 같은 시간당 정책과 효력기간으로 관리합니다</p>
          </div>
        </header>

        <Banner tone="warning" className="mb-4">
          아래 기존 단가는 <b>회당 금액</b>입니다. 시간당 금액으로 자동 환산되지 않으며, 시간당 기준 단가는 저장 기능이 연결된 뒤부터 적용할 수 있습니다.
        </Banner>

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
              <Input className="max-sm:h-11" id={`${id}-capacity`} type="number" min={2} step={1} inputMode="numeric" value={capacity}
                error={capacityError} aria-invalid={capacityError}
                onBlur={() => setTouched((value) => ({ ...value, capacity: true }))}
                onChange={(event) => setCapacity(event.target.value)} placeholder="예: 4" />
              <FieldError>{capacityError ? '2명 이상의 정수를 적어 주세요' : undefined}</FieldError>
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
            <Input className="max-sm:h-11" id={`${id}-price`} type="number" min={1} step={1000} inputMode="numeric" value={hourlyPrice}
              error={priceError} aria-invalid={priceError}
              onBlur={() => setTouched((value) => ({ ...value, price: true }))}
              onChange={(event) => setHourlyPrice(event.target.value)} placeholder="예: 60000" />
            <FieldError>{priceError ? '1원 이상의 정수로 적어 주세요' : undefined}</FieldError>
          </div>

          <div>
            <Label htmlFor={`${id}-from`}>언제부터</Label>
            <Input className="max-sm:h-11" id={`${id}-from`} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
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
            <Input className="max-sm:h-11" id={`${id}-reason`} value={reason} error={reasonError} aria-invalid={reasonError}
              onBlur={() => setTouched((value) => ({ ...value, reason: true }))}
              onChange={(event) => setReason(event.target.value)} placeholder={mode === 'student' ? '예: 형제 할인' : '변경 사유'} />
            <FieldError>{reasonError ? '학생 예외 사유를 적어 주세요' : undefined}</FieldError>
          </div>
        </div>

        {mode === 'group' ? <p className="mt-3 rounded-lg border border-line bg-inset px-3 py-2 text-[12px] font-bold text-fg-2">총액/시간 · 서버 재계산 후 표시</p> : null}
        {mode === 'student' ? <p className="mt-3 rounded-lg border border-line bg-inset px-3 py-2 text-[12px] font-bold text-fg-2">기준 대비 % · 서버 재계산 후 표시</p> : null}

        <div className="sticky bottom-2 z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/95 p-2 shadow-sm backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <p className="text-[12px] text-fg-subtle">저장한 단가는 적용 기간에 맞춰 청구와 수업료에 반영되며, 이미 확정된 청구와 급여는 바뀌지 않습니다.</p>
          <div className="flex gap-2">
            <Button className="max-sm:min-h-11" size="sm" variant="secondary" onClick={() => resetDraft()}>초안 지우기</Button>
            <Button className="max-sm:min-h-11" size="sm" disabled title="시간당 단가 저장 기능을 준비하고 있습니다">
              {mode === 'student' ? '학생 예외 저장 준비 중' : '시간당 단가 저장 준비 중'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="시간당 기준 단가" sub="일반·Kinder·그룹과 학생 예외를 같은 적용 기준으로 읽습니다">
        <p className="rounded-xl border border-line bg-inset px-3 py-8 text-center text-[12px] text-fg-subtle">
          저장된 시간당 단가가 없습니다
        </p>
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

    </div>
  );
}
