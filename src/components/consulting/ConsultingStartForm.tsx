/** @file-guide
 * 목적: 개발명세서 §29의 컨설팅 시작 입력을 한 책임으로 제공한다.
 * 책임/재사용: 생성 DTO를 정확히 조립하고 공용 Meta·Field·Segmented·Button을 쓴다. 단계와 기본 항목은 서버가 만든다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useState, type FormEvent } from 'react';
import type { ConsultingCreate, Meta } from '@/api/types';
import type { components } from '@/api/schema';
import { apiMessage } from '@/api/client';
import { Banner, Button, Input, Label, Select, cn } from '@/components/ui';
import { CONSULTING_SHARES } from '@/lib/consulting';
import { todayKst } from '@/lib/calendar';
import { won } from '@/lib/money';

type ShareWord = components['schemas']['ConsultingShareWordDto'];
/** 서버 `ConsultingListDto.types · requesters` 한 줄 — 종류·요청자 낱말은 서버 표 한 벌이다(29-02 · D-R18) */
type Word = components['schemas']['ConsultingWordDto'];

type Requester = ConsultingCreate['requester'];
type Share = ConsultingCreate['share'];

/**
 * 공개 범위 고르개 — **「비공개」는 대표만 고를 수 있다**(§76 · S4).
 * 서버가 `canSetPrivate` 로 말하고 화면은 그 값으로 칸을 뺀다. 화면이 역할을 다시 보지 않는다(D-R39).
 */
function shareOptions(canSetPrivate: boolean, words?: readonly ShareWord[]): Array<{ value: Share; label: string; meaning: string | null }> {
  return (Object.entries(CONSULTING_SHARES) as Array<[Share, { label: string }]>)
    .filter(([value]) => value !== 'private' || canSetPrivate)
    // 이름·뜻은 서버 낱말이 있으면 그것(D-R18) — 없을 때만 예전 표의 이름
    .map(([value, item]) => {
      const w = words?.find((x) => x.key === value);
      return { value, label: w?.label ?? item.label, meaning: w?.meaning ?? null };
    });
}

/** 칩 단추 — 종류 칩과 같은 모양(원본 §29 「누가 요청」 · 「누가 볼 수 있나」). 고른 것의 채움 색만 자리마다 다르다 */
function ChoiceChip({ on, onClick, onClass, children }: { on: boolean; onClick: () => void; onClass: string; children: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn('rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors', on ? onClass : 'border-line bg-card text-fg hover:border-fg-subtle')}>
      {children}
    </button>
  );
}

function toggleId(values: number[], id: number): number[] {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

export function ConsultingStartForm({ meta, canSetPrivate, shareWords, typeWords = [], requesterWords = [], pending, error, onCancel, onSubmit }: {
  meta: Meta;
  /** 서버 `ConsultingListDto.types` — 「어떤 컨설팅」 칩 10(원본 차례 · 「편입 · 전학」 29-02) */
  typeWords?: readonly Word[];
  /** 서버 `ConsultingListDto.requesters` — 「누가 요청」 칩 둘 */
  requesterWords?: readonly Word[];
  /** 서버 `ConsultingListDto.canSetPrivate` — 「비공개」 칸이 서는가 (§76 대표 전용 · S4) */
  canSetPrivate: boolean;
  /** 서버 `ConsultingListDto.shares` — 공개 범위 이름과 뜻 한 줄(29-06) */
  shareWords?: readonly ShareWord[];
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
  // 시작일은 오늘(KST)로 채워 연다 — 원본 §29 의 「08/21/2026」이 컷의 오늘이다(29-05 · D-R44). 종료는 사람이 정한다(「꼭」)
  const [startOn, setStartOn] = useState(() => todayKst());
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
          {typeWords.map(({ key, label }) => ({ value: key as ConsultingCreate['consType'], label })).map(({ value, label }) => (
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
        {/* 원본 §29 「누가 요청」은 필수 표시 없는 칩 둘이다 — 고른 것은 강조 테두리 (29-03) */}
        <fieldset>
          <legend className="mb-1 text-[11px] font-bold text-fg-subtle">누가 요청</legend>
          <div className="flex flex-wrap gap-1.5">
            {requesterWords.map((r) => (
              <ChoiceChip key={r.key} on={requester === r.key} onClick={() => setRequester(r.key as Requester)} onClass="border-primary bg-primary/10 text-primary">{r.label}</ChoiceChip>
            ))}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="consulting-owner">담당 *</Label>
          <Select id="consulting-owner" value={ownerId} onChange={(event) => setOwnerId(Number(event.currentTarget.value))} required>
            <option value={0}>선택</option>
            {owners.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
          </Select>
        </div>
      </div>

      {/* 원본 §29 — 금액 · 회차 · 시작이 한 줄, 종료는 다음 줄이고 라벨 오른쪽에 빨간 「꼭」 (29-04) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div><Label htmlFor="consulting-amount">금액 *</Label><Input id="consulting-amount" inputMode="numeric" min={1} step={1} type="number" value={amount} onChange={(event) => setAmount(event.currentTarget.value)} required /></div>
        <div><Label htmlFor="consulting-sessions">회차 *</Label><Input id="consulting-sessions" inputMode="numeric" min={1} step={1} type="number" value={sessions} onChange={(event) => setSessions(event.currentTarget.value)} required /></div>
        <div><Label htmlFor="consulting-start">시작 *</Label><Input id="consulting-start" type="date" value={startOn} onChange={(event) => setStartOn(event.currentTarget.value)} required /></div>
        <div><Label htmlFor="consulting-end" hint={<b className="text-red">꼭</b>}>종료 *</Label><Input id="consulting-end" type="date" min={startOn || undefined} value={endOn} onChange={(event) => setEndOn(event.currentTarget.value)} required /></div>
      </div>

      <fieldset>
        <legend className="mb-2 text-[12px] font-bold text-fg">누가 볼 수 있나 *</legend>
        {/* 고른 칩은 초록 채움 · 아래에 그 뜻 한 줄(서버 낱말 · 29-06) */}
        <div className="flex flex-wrap gap-1.5">
          {shareOptions(canSetPrivate, shareWords).map((o) => (
            <ChoiceChip key={o.value} on={share === o.value} onClick={() => setShare(o.value)} onClass="border-green bg-green text-white">{o.label}</ChoiceChip>
          ))}
        </div>
        {shareOptions(canSetPrivate, shareWords).find((o) => o.value === share)?.meaning ? (
          <p className="mt-1.5 text-[11.5px] text-fg-2">{shareOptions(canSetPrivate, shareWords).find((o) => o.value === share)?.meaning}</p>
        ) : null}
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

      {/* 원본 §29 「시작하면」 초록 상자 세 줄 (29-07) — 금액은 입력한 값 그대로 */}
      <section aria-label="시작하면" className="rounded-lg border border-green/30 bg-green/5 p-3">
        <h3 className="mb-1.5 text-[12.5px] font-bold text-green">시작하면</h3>
        <ul className="list-disc space-y-1 pl-4 text-[12px] text-fg">
          <li>계약 단계로 들어갑니다 · 계약서 → 피드백 → 전달 → 서명 → 수납</li>
          <li>{Number(amount) > 0 ? `회계에 ${won(Number(amount))}으로 잡힙니다` : '금액을 넣으면 회계에 잡힙니다'}</li>
          <li>회차를 넣으면 스케줄에 컨설팅으로 들어갑니다</li>
        </ul>
      </section>
      {issue ? <Banner tone="danger">{issue}</Banner> : null}
      {error ? <Banner tone="danger">{apiMessage(error)}</Banner> : null}
      {/* 바닥 — 「취소」 왼쪽 · 「시작하기」 오른쪽 (29-08) */}
      <div className="flex justify-between gap-2 border-t border-line pt-4">
        <Button onClick={onCancel}>취소</Button>
        <Button data-dialog-autofocus variant="primary" type="submit" disabled={pending}>{pending ? '시작 중…' : '시작하기'}</Button>
      </div>
    </form>
  );
}
