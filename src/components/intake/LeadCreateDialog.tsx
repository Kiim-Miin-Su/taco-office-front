/** @file-guide
 * 목적: LeadCreateDialog.tsx — LeadCreateButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §23 「+ 신규 문의」 (C90 · 테스트 시나리오 A-01 「카카오채널 신규 문의」 · N-45 · N-44).
 *
 * 화면이 보내는 것은 **이름 · 학년 · 학교 · 학부모 관계 · 연락처 · 원하는 것 · 유입 경로 · 담당 · 첫 접촉 한 줄**뿐이고 단계는 보내지 않는다 — 유입은 언제나 「1차 상담」 칸이다(서버).
 * 학년은 원본 §23 카드의 학년 칩(G8 …)이다 — 적은 그대로 저장하고 표기를 바꾸지 않는다(23-10 · `lead.grade`).
 * 유입 경로 낱말은 `GET /ops` 의 `intakeHead.sources`(D-R18), 담당은 `GET /meta` — 창을 열 때만 읽는다(`useMeta(open)`).
 * 학부모 관계 · 연락처 · 원하는 것은 **LEAD 칸**이다(A-01 · v4.57) — 연락처 모양 판정 · 보이는 모양은 서버(`LEAD_PARENT_PHONE` 문장 그대로).
 * 「소개」면 누구 소개인지 같은 나머지는 **접촉 원장의 첫 줄**이 된다(N-44).
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Dialog, Input, Label, Segmented, Select, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useCreateLead, useMeta } from '@/api/queries';
import type { IntakeSource, Lead, LeadCreate } from '@/api/types';

export interface LeadCreateButtonProps {
  sources: IntakeSource[];
  onDone?: (row: Lead) => void;
}

export function LeadCreateButton({ sources, onDone }: LeadCreateButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const meta = useMeta(open);
  const write = useCreateLead();
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [source, setSource] = useState<LeadCreate['source'] | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');
  const [parentRelation, setParentRelation] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [want, setWant] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(''); setSchool(''); setGrade(''); setSource(''); setOwnerId(''); setNote(''); setParentRelation(''); setParentPhone(''); setWant(''); setErr(null);
  }, [open]);

  // 「경로 없음」은 옛 건의 칩이지 고를 수 있는 값이 아니다 — 새 문의는 여섯 중 하나다
  const pickable = sources.filter((s) => s.key !== 'none');
  const pending = write.isPending;
  const canSubmit = name.trim().length > 0 && !!source && !pending;

  const submit = () => {
    if (!canSubmit || !source) return;
    const payload: LeadCreate = {
      name: name.trim(), source,
      ...(school.trim() ? { school: school.trim() } : {}),
      ...(grade.trim() ? { grade: grade.trim() } : {}),
      ...(ownerId ? { ownerId: Number(ownerId) } : {}),
      ...(parentRelation.trim() ? { parentRelation: parentRelation.trim() } : {}),
      ...(parentPhone.trim() ? { parentPhone: parentPhone.trim() } : {}),
      ...(want.trim() ? { want: want.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    setErr(null);
    write.mutate(payload, {
      onSuccess: (row) => { setOpen(false); onDone?.(row); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  return (
    <>
      {/* 원본 §23 머리의 갈색 주버튼 (23-02) */}
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>+ 신규 문의</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="신규 문의"
        width={560}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" onClick={submit} disabled={!canSubmit} title={!canSubmit && !pending ? '이름과 유입 경로는 있어야 합니다' : undefined}>{pending ? '접수 중…' : '접수'}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_96px_1fr] gap-2">
            <div>
              <Label htmlFor={`${id}-name`}>이름</Label>
              <Input id={`${id}-name`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} disabled={pending} placeholder="학생 이름" />
            </div>
            <div>
              <Label htmlFor={`${id}-grade`}>학년</Label>
              <Input id={`${id}-grade`} value={grade} maxLength={10} onChange={(e) => setGrade(e.target.value)} disabled={pending} placeholder="G8" />
            </div>
            <div>
              <Label htmlFor={`${id}-school`} hint="동명이인은 등록 때 학년·학교로 가른다">학교</Label>
              <Input id={`${id}-school`} value={school} maxLength={60} onChange={(e) => setSchool(e.target.value)} disabled={pending} />
            </div>
          </div>
          {/* 학부모 · 연락처 (A-01 ③) — 등록 확정 때 그 학생의 보호자로 이어진다(서버) */}
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <div>
              <Label htmlFor={`${id}-prel`}>학부모</Label>
              <Input id={`${id}-prel`} value={parentRelation} maxLength={20} onChange={(e) => setParentRelation(e.target.value)} disabled={pending} placeholder="어머니" />
            </div>
            <div>
              <Label htmlFor={`${id}-pphone`} hint="등록하면 보호자로 이어집니다">연락처</Label>
              <Input id={`${id}-pphone`} type="tel" inputMode="tel" autoComplete="off" value={parentPhone} maxLength={20} onChange={(e) => setParentPhone(e.target.value)} disabled={pending} placeholder="010-1234-5678" />
            </div>
          </div>
          <div>
            <Label htmlFor={`${id}-want`}>원하는 것</Label>
            <Input id={`${id}-want`} value={want} maxLength={120} onChange={(e) => setWant(e.target.value)} disabled={pending} placeholder="MAP Reading 점수 올리기" />
          </div>
          <div>
            <Label>유입 경로</Label>
            {/* 낱말은 서버의 여섯이다 — 화면은 고르기만 한다 (D-R18) */}
            <Segmented<LeadCreate['source'] | ''> ariaLabel="유입 경로" value={source} disabled={pending} onChange={setSource}
              options={pickable.map((s) => ({ value: s.key as LeadCreate['source'], label: s.label }))} />
          </div>
          <div>
            <Label htmlFor={`${id}-owner`} hint="비우면 미배정">담당</Label>
            <Select id={`${id}-owner`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={pending}>
              <option value="">아직 없음</option>
              {(meta.data?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-note`} hint="소개면 누구 소개인지 등 — 접촉 원장의 첫 줄이 됩니다">첫 접촉 한 줄 (선택)</Label>
            <Textarea id={`${id}-note`} value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} placeholder="카카오채널로 여름 특강 문의" />
          </div>
          {err ? <Banner tone="danger">{err}</Banner> : null}
          {/* 근거: 원본 §23 「유입 즉시 1차 카드 생성」 · N-45 — 절·결정 번호는 주석에만 둔다 (23-20) */}
          <p className="text-[11px] text-fg-subtle">접수하면 「1차 상담」 칸에 카드가 서고 단계 기록이 시작됩니다.</p>
        </div>
      </Dialog>
    </>
  );
}
