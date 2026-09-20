/** @file-guide
 * 목적: 개발명세서 §29의 컨설팅 시작 입력을 한 책임으로 제공한다.
 * 책임/재사용: 생성 DTO를 정확히 조립하고 공용 Meta·Field·Segmented·Button을 쓴다. 단계와 기본 항목은 서버가 만든다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useState, type FormEvent } from 'react';
import type { ConsultingCreate, Meta } from '@/api/types';
import { apiMessage } from '@/api/client';
import { Banner, Button, Input, Label, Segmented, Select } from '@/components/ui';
import { CONSULTING_SHARES, CONSULTING_TYPES } from '@/lib/consulting';

type Requester = ConsultingCreate['requester'];
type Share = ConsultingCreate['share'];

const REQUESTERS: Array<{ value: Requester; label: string }> = [
  { value: 'mother', label: '어머니' },
  { value: 'father', label: '아버지' },
];

/**
 * 공개 범위 고르개 — **「비공개」는 대표만 고를 수 있다**(§76 · S4).
 * 서버가 `canSetPrivate` 로 말하고 화면은 그 값으로 칸을 뺀다. 화면이 역할을 다시 보지 않는다(D-R39).
 */
function shareOptions(canSetPrivate: boolean): Array<{ value: Share; label: string }> {
  return (Object.entries(CONSULTING_SHARES) as Array<[Share, { label: string }]>)
    .filter(([value]) => value !== 'private' || canSetPrivate)
    .map(([value, item]) => ({ value, label: item.label }));
}

function toggleId(values: number[], id: number): number[] {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

export function ConsultingStartForm({ meta, canSetPrivate, pending, error, onCancel, onSubmit }: {
  meta: Meta;
  /** 서버 `ConsultingListDto.canSetPrivate` — 「비공개」 칸이 서는가 (§76 대표 전용 · S4) */
  canSetPrivate: boolean;
  pending: boolean;
  error?: unknown;
  onCancel: () => void;
  onSubmit: (body: ConsultingCreate) => void;
}) {
  const owners = meta.staff.filter((staff) => staff.canAdminPage);
  const [consType, setConsType] = useState<ConsultingCreate['consType']>('admissions');
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [requester, setRequester] = useState<Requester>('mother');
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? 0);
  const [amount, setAmount] = useState('');
  const [sessions, setSessions] = useState('');
  const [startOn, setStartOn] = useState('');
  const [endOn, setEndOn] = useState('');
  const [share, setShare] = useState<Share>('all');
  const [pickedStaffIds, setPickedStaffIds] = useState<number[]>([]);
  const [issue, setIssue] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    const parsedSessions = Number(sessions);
    const nextIssue = studentIds.length === 0
      ? '학생을 한 명 이상 선택해 주세요.'
      : ownerId <= 0
        ? '담당자를 선택해 주세요.'
        : !Number.isInteger(parsedAmount) || parsedAmount <= 0
          ? '금액은 1원 이상의 정수로 입력해 주세요.'
          : !Number.isInteger(parsedSessions) || parsedSessions <= 0
            ? '회차는 1회 이상의 정수로 입력해 주세요.'
            : !startOn || !endOn || startOn > endOn
              ? '시작일과 종료일을 올바른 순서로 입력해 주세요.'
              : share === 'picked' && pickedStaffIds.length === 0
                ? '지정 공개 대상을 한 명 이상 선택해 주세요.'
                : null;
    setIssue(nextIssue);
    if (nextIssue) return;
    onSubmit({
      consType,
      studentIds,
      requester,
      ownerId,
      amount: parsedAmount,
      sessions: parsedSessions,
      startOn,
      endOn,
      share,
      ...(share === 'picked' ? { pickedStaffIds } : {}),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-[12px] font-bold text-fg">어떤 컨설팅 *</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(CONSULTING_TYPES) as Array<[ConsultingCreate['consType'], string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={consType === value}
              onClick={() => setConsType(value)}
              className={`rounded-lg border px-3 py-2 text-[12px] font-bold transition-colors ${consType === value ? 'border-blue bg-blue text-white' : 'border-line bg-card text-fg hover:border-blue'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <fieldset>
          <legend className="mb-1 flex w-full justify-between text-[11px] font-bold text-fg-subtle">
            <span>학생 *</span><span>{studentIds.length}명 · 여러 명 가능</span>
          </legend>
          <div className="max-h-44 overflow-y-auto rounded-lg border border-line p-2">
            <div className="flex flex-wrap gap-1.5">
              {meta.students.map((student) => {
                const selected = studentIds.includes(student.id);
                return (
                  <button
                    key={student.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setStudentIds((current) => toggleId(current, student.id))}
                    className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-bold ${selected ? 'border-fg bg-fg text-white' : 'border-line bg-card text-fg'}`}
                  >
                    {student.name}
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>
        <div>
          <Label>누가 요청 *</Label>
          <Segmented className="w-full" options={REQUESTERS} value={requester} onChange={setRequester} />
        </div>
        <div>
          <Label htmlFor="consulting-owner">담당 *</Label>
          <Select id="consulting-owner" value={ownerId} onChange={(event) => setOwnerId(Number(event.currentTarget.value))} required>
            <option value={0}>선택</option>
            {owners.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label htmlFor="consulting-amount">금액 *</Label><Input id="consulting-amount" inputMode="numeric" min={1} step={1} type="number" value={amount} onChange={(event) => setAmount(event.currentTarget.value)} required /></div>
        <div><Label htmlFor="consulting-sessions">회차 *</Label><Input id="consulting-sessions" inputMode="numeric" min={1} step={1} type="number" value={sessions} onChange={(event) => setSessions(event.currentTarget.value)} required /></div>
        <div><Label htmlFor="consulting-start">시작 *</Label><Input id="consulting-start" type="date" value={startOn} onChange={(event) => setStartOn(event.currentTarget.value)} required /></div>
        <div><Label htmlFor="consulting-end">종료 *</Label><Input id="consulting-end" type="date" min={startOn || undefined} value={endOn} onChange={(event) => setEndOn(event.currentTarget.value)} required /></div>
      </div>

      <fieldset>
        <legend className="mb-2 text-[12px] font-bold text-fg">누가 볼 수 있나 *</legend>
        <Segmented className="max-w-full flex-wrap" options={shareOptions(canSetPrivate)} value={share} onChange={setShare} />
        {share === 'picked' ? (
          <div className="mt-3 flex flex-wrap gap-1.5 rounded-lg border border-line p-2">
            {owners.map((staff) => {
              const selected = pickedStaffIds.includes(staff.id);
              return <button key={staff.id} type="button" aria-pressed={selected} onClick={() => setPickedStaffIds((current) => toggleId(current, staff.id))}
                className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-bold ${selected ? 'border-blue bg-blue text-white' : 'border-line bg-card text-fg'}`}>{staff.name}</button>;
            })}
          </div>
        ) : null}
      </fieldset>

      <Banner tone="neutral">
        시작하면 계약서 → 피드백 → 전달 → 서명 → 수납 순으로 진행합니다. 유형별 기본 항목과 현재 단계는 서버가 정합니다.
      </Banner>
      {issue ? <Banner tone="danger">{issue}</Banner> : null}
      {error ? <Banner tone="danger">{apiMessage(error)}</Banner> : null}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button onClick={onCancel}>취소</Button>
        <Button data-dialog-autofocus variant="primary" type="submit" disabled={pending}>{pending ? '시작 중…' : '시작하기'}</Button>
      </div>
    </form>
  );
}
