/** @file-guide
 * 목적: GuardianList.tsx — GuardianList, GuardianListDialog (component)
 * 책임/재사용: 학생 보호자 관리(추가·고치기·사용 중지·다시 쓰기)를 공용 ui와 queries 훅으로 그린다. 연락처 모양·대표 하나·채널 판정은 서버가 한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 학생의 보호자 — DQ3 대표 답변 (2026-09-25): 「복수 보호자 + 선택 발송, 메일과 SENS 만」.
 *
 * 한 학생에 여러 명을 두고, 그중 **대표 보호자**가 발송 창에서 미리 체크된다. 「삭제」는 **사용 중지**다 —
 * 발송 원장이 그 사람을 가리키므로 지우지 않고, 「다시 쓰기」로 되돌릴 수 있다.
 *
 * 화면이 판정하지 않는 것: 메일·휴대폰 모양(서버 DTO) · 연락처 최소 하나 · 받는 채널에 연락처가 있는가 ·
 * 대표는 학생당 하나(서버가 전 대표를 내린다). 거절 문장은 서버 말 그대로 띄운다.
 * 채널 이름(메일·문자)도 서버 `GET /guardians/channels` 가 준다 — 채널이 늘면 이 화면은 체크 칸만 늘어난다.
 */
'use client';

import { useId, useState } from 'react';
import { useGuardianChannels, useGuardians, useGuardianWrite } from '@/api/queries';
import { apiMessage } from '@/api/client';
import type { Guardian, GuardianChannel, GuardianCreate } from '@/api/types';
import { Banner, Button, Checkbox, Chip, Dialog, Input, Label, QueryState } from '../ui';

type ChannelKey = GuardianChannel['channel'];

interface Draft {
  name: string;
  relation: string;
  email: string;
  phone: string;
  receive: Record<ChannelKey, boolean>;
  isPrimary: boolean;
}

function draftOf(g: Guardian | null): Draft {
  return {
    name: g?.name ?? '',
    relation: g?.relation ?? '',
    email: g?.email ?? '',
    phone: g?.phoneDisplay ?? '',
    receive: { email: g ? g.receiveEmail : true, sms: g ? g.receiveSms : false },
    isPrimary: g?.isPrimary ?? false,
  };
}

/** 빈 칸은 null 로 보낸다 — 서버가 「없음」으로 읽는다(모양 검사는 서버가 한다) */
function bodyOf(d: Draft): GuardianCreate {
  return {
    name: d.name,
    relation: d.relation.trim() || null,
    email: d.email.trim() || null,
    phone: d.phone.trim() || null,
    // 받는 채널 ↔ 쓰기 DTO 칸 — 채널이 늘면 서버 DTO 칸과 함께 여기에 한 줄 (back notify/sender 의 채널 추가 자리 ④)
    receiveEmail: d.receive.email,
    receiveSms: d.receive.sms,
    isPrimary: d.isPrimary,
  };
}

function GuardianForm({ initial, channels, pending, error, onCancel, onSubmit }: {
  initial: Guardian | null;
  channels: GuardianChannel[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: GuardianCreate) => void;
}) {
  const id = useId();
  const [d, setD] = useState<Draft>(() => draftOf(initial));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  return (
    <form
      aria-label={initial ? `${initial.name} 고치기` : '보호자 추가'}
      className="rounded-lg border border-line bg-bg-2 p-3"
      onSubmit={(e) => { e.preventDefault(); if (!pending) onSubmit(bodyOf(d)); }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-name`}>이름</Label>
          <Input id={`${id}-name`} value={d.name} maxLength={40} required onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${id}-relation`}>관계</Label>
          <Input id={`${id}-relation`} value={d.relation} maxLength={20} placeholder="어머니 · 아버지 · 보호자"
            onChange={(e) => set('relation', e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${id}-email`}>이메일</Label>
          <Input id={`${id}-email`} type="email" value={d.email} maxLength={254} placeholder="name@example.com"
            onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${id}-phone`}>휴대폰</Label>
          <Input id={`${id}-phone`} inputMode="tel" value={d.phone} maxLength={20} placeholder="010-1234-5678"
            onChange={(e) => set('phone', e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className="text-[11px] font-bold text-fg-subtle">받는 채널</span>
        {channels.map((c) => (
          <Checkbox key={c.channel} label={`${c.label} 받기`} checked={d.receive[c.channel]}
            onChange={(e) => set('receive', { ...d.receive, [c.channel]: e.target.checked })} />
        ))}
        <Checkbox label="대표 보호자" checked={d.isPrimary} onChange={(e) => set('isPrimary', e.target.checked)} />
      </div>
      <p className="mt-2 text-[11px] text-fg-subtle">메일 주소나 휴대폰 번호 중 하나는 있어야 합니다. 대표로 고르면 전 대표는 내려갑니다.</p>
      {error ? <Banner tone="danger" className="mt-2"><p role="alert">{error}</p></Banner> : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>취소</Button>
        <Button type="submit" size="sm" variant="primary" disabled={pending || d.name.trim() === ''}>
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  );
}

function GuardianRow({ g, channels, busy, onEdit, onDeactivate, onReactivate }: {
  g: Guardian;
  channels: GuardianChannel[];
  busy: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const label = (c: ChannelKey) => channels.find((x) => x.channel === c)?.label ?? null;
  return (
    <li className={`rounded-lg border border-line px-3 py-2 ${g.active ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="text-[13px] text-fg">{g.name}</b>
        {g.relation ? <Chip>{g.relation}</Chip> : null}
        {g.isPrimary ? <Chip tone="info" styleKind="solid">대표</Chip> : null}
        {!g.active ? <Chip tone="neutral">사용 중지</Chip> : null}
        {g.active ? g.receives.map((c) => (label(c) ? <Chip key={c} tone="success">{label(c)}</Chip> : null)) : null}
        <span className="ml-auto flex gap-1">
          {g.active ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit}>고치기</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onDeactivate}>사용 중지</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onReactivate}>다시 쓰기</Button>
          )}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-fg-2">
        <span>{g.email ?? '메일 없음'}</span>
        <span>{g.phoneDisplay ?? '휴대폰 없음'}</span>
      </div>
    </li>
  );
}

/** 한 학생의 보호자 관리 — 목록 + 줄마다 고치기/사용 중지 + 「보호자 추가」 입력 */
export function GuardianList({ studentId }: { studentId: number }) {
  const list = useGuardians(studentId);
  const channelsQ = useGuardianChannels();
  const write = useGuardianWrite();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channels = channelsQ.data?.channels ?? [];
  const close = () => { setEditing(null); setError(null); };
  const fail = (e: unknown) => setError(apiMessage(e));

  return (
    <section aria-label="보호자">
      <QueryState query={list} isEmpty={() => false}>
        {(data) => (
          <>
            {data.guardians.length === 0 ? (
              <p className="mb-2 text-[12px] text-fg-subtle">등록한 보호자가 없습니다.</p>
            ) : (
              <ul className="mb-2 flex flex-col gap-1.5">
                {data.guardians.map((g) => (editing === g.id ? (
                  <li key={g.id}>
                    <GuardianForm initial={g} channels={channels} pending={write.isPending} error={error} onCancel={close}
                      onSubmit={(body) => write.mutate({ kind: 'patch', id: g.id, body }, { onSuccess: close, onError: fail })} />
                  </li>
                ) : (
                  <GuardianRow key={g.id} g={g} channels={channels} busy={write.isPending || editing !== null}
                    onEdit={() => { setError(null); setEditing(g.id); }}
                    onDeactivate={() => write.mutate({ kind: 'deactivate', id: g.id }, { onError: fail })}
                    onReactivate={() => write.mutate({ kind: 'patch', id: g.id, body: { active: true } }, { onError: fail })} />
                )))}
              </ul>
            )}
            {editing === 'new' ? (
              <GuardianForm initial={null} channels={channels} pending={write.isPending} error={error} onCancel={close}
                onSubmit={(body) => write.mutate({ kind: 'create', studentId, body }, { onSuccess: close, onError: fail })} />
            ) : (
              <Button size="sm" disabled={editing !== null || write.isPending}
                onClick={() => { setError(null); setEditing('new'); }}>+ 보호자 추가</Button>
            )}
            {error && editing === null ? <Banner tone="danger" className="mt-2"><p role="alert">{error}</p></Banner> : null}
          </>
        )}
      </QueryState>
    </section>
  );
}

/** §79 학생 카드의 「보호자」 — 관리 목록을 창으로 연다 */
export function GuardianListDialog({ open, student, onClose }: {
  open: boolean; student: { id: number; name: string }; onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`보호자 — ${student.name}`} width={640}
      footer={<Button variant="ghost" onClick={onClose}>닫기</Button>}>
      {open ? <GuardianList studentId={student.id} /> : null}
    </Dialog>
  );
}
