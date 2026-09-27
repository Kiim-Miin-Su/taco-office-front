/** @file-guide
 * 목적: 계약 작업 전 컨설팅 학생·요청자·담당·금액·회차·기간을 수정한다.
 * 책임/재사용: ConsultingPatch 계약만 조립한다. 종류/공개 범위/계약 단계 전이는 각 기존 소유자에 둔다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useMeta, useUpdateConsultingCore } from '@/api/queries';
import type { ConsultingDetail, ConsultingPatch } from '@/api/types';
import { Banner, Button, Input, Label, Select } from '@/components/ui';

const requesterLabel = (value: ConsultingPatch['requester']) => value === 'mother' ? '어머니' : '아버지';
const toggleId = (values: number[], id: number) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id];

export function ConsultingCoreEditor({ detail, onDone }: { detail: ConsultingDetail; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const meta = useMeta(open);
  const patch = useUpdateConsultingCore();
  const [studentIds, setStudentIds] = useState(detail.studentIds);
  const [requester, setRequester] = useState<NonNullable<ConsultingPatch['requester']>>(detail.requester ?? 'mother');
  const [ownerId, setOwnerId] = useState(detail.ownerId == null ? '' : String(detail.ownerId));
  const [amount, setAmount] = useState(String(detail.amount ?? ''));
  const [sessions, setSessions] = useState(String(detail.sessions ?? ''));
  const [startOn, setStartOn] = useState(detail.startOn ?? '');
  const [endOn, setEndOn] = useState(detail.endOn ?? '');
  const [issue, setIssue] = useState<string | null>(null);

  useEffect(() => {
    setStudentIds(detail.studentIds); setRequester(detail.requester ?? 'mother');
    setOwnerId(detail.ownerId == null ? '' : String(detail.ownerId)); setAmount(String(detail.amount ?? ''));
    setSessions(String(detail.sessions ?? '')); setStartOn(detail.startOn ?? ''); setEndOn(detail.endOn ?? '');
  }, [detail.id, detail.studentIds, detail.requester, detail.ownerId, detail.amount, detail.sessions, detail.startOn, detail.endOn]);

  const save = () => {
    const parsedAmount = Number(amount); const parsedSessions = Number(sessions); const parsedOwner = Number(ownerId);
    const nextIssue = studentIds.length === 0 ? '학생을 한 명 이상 선택해 주세요.'
      : !Number.isInteger(parsedOwner) || parsedOwner <= 0 ? '담당자를 선택해 주세요.'
        : !Number.isInteger(parsedAmount) || parsedAmount <= 0 ? '금액은 1원 이상의 정수로 입력해 주세요.'
          : !Number.isInteger(parsedSessions) || parsedSessions <= 0 ? '회차는 1회 이상의 정수로 입력해 주세요.'
            : !startOn || !endOn || startOn > endOn ? '시작일과 종료일을 올바른 순서로 입력해 주세요.' : null;
    setIssue(nextIssue); if (nextIssue) return;
    const body: ConsultingPatch = {};
    if (studentIds.length !== detail.studentIds.length || studentIds.some((id) => !detail.studentIds.includes(id))) body.studentIds = studentIds;
    if (requester !== detail.requester) body.requester = requester;
    if (parsedOwner !== detail.ownerId) body.ownerId = parsedOwner;
    if (parsedAmount !== detail.amount) body.amount = parsedAmount;
    if (parsedSessions !== detail.sessions) body.sessions = parsedSessions;
    if (startOn !== detail.startOn) body.startOn = startOn;
    if (endOn !== detail.endOn) body.endOn = endOn;
    if (Object.keys(body).length === 0) { setOpen(false); return; }
    patch.mutate({ consId: detail.id, ...body }, {
      onSuccess: () => { setOpen(false); onDone?.(); },
    });
  };
  if (!detail.capabilities.canEdit) return null;
  return (
    <section className="mb-4 rounded-lg border border-line bg-card p-3" aria-label="계약 핵심정보">
      <div className="flex items-center justify-between gap-2"><b className="text-[12.5px]">계약 핵심정보</b><Button size="sm" onClick={() => setOpen((value) => !value)}>{open ? '취소' : '고치기'}</Button></div>
      {open ? <div className="mt-3 space-y-3">
        <fieldset><legend className="mb-1 text-[11px] font-bold text-fg-subtle">학생 *</legend><div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line p-2">
          {(meta.data?.students ?? []).map((student) => { const selected = studentIds.includes(student.id); return <button key={student.id} type="button" aria-pressed={selected} onClick={() => setStudentIds((values) => toggleId(values, student.id))} className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-bold ${selected ? 'border-fg bg-fg text-white' : 'border-line bg-card text-fg'}`}>{student.name}</button>; })}
        </div></fieldset>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div><Label htmlFor="consulting-core-requester">요청자</Label><Select id="consulting-core-requester" value={requester} onChange={(e) => setRequester(e.target.value as typeof requester)}>{(['mother', 'father'] as const).map((value) => <option key={value} value={value}>{requesterLabel(value)}</option>)}</Select></div>
          <div><Label htmlFor="consulting-core-owner">담당</Label><Select id="consulting-core-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">선택</option>{(meta.data?.staff ?? []).filter((item) => item.canAdminPage).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
          <div><Label htmlFor="consulting-core-amount">금액</Label><Input id="consulting-core-amount" type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label htmlFor="consulting-core-sessions">약정 회차</Label><Input id="consulting-core-sessions" type="number" min={1} step={1} value={sessions} onChange={(e) => setSessions(e.target.value)} /></div>
          <div><Label htmlFor="consulting-core-start">시작</Label><Input id="consulting-core-start" type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} /></div>
          <div><Label htmlFor="consulting-core-end">종료</Label><Input id="consulting-core-end" type="date" min={startOn || undefined} value={endOn} onChange={(e) => setEndOn(e.target.value)} /></div>
        </div>
        <Button size="sm" variant="primary" disabled={patch.isPending} onClick={save}>{patch.isPending ? '저장 중…' : '저장'}</Button>
        {issue ? <Banner tone="danger">{issue}</Banner> : null}{patch.isError ? <Banner tone="danger">{apiMessage(patch.error)}</Banner> : null}
      </div> : <p className="mt-1 text-[11.5px] text-fg-subtle">계약서 작업을 시작하기 전까지만 학생·요청자·담당·금액·회차·기간을 바꿀 수 있습니다.</p>}
    </section>
  );
}
