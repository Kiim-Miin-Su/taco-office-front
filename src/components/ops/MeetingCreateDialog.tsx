/** @file-guide
 * 목적: MeetingCreateDialog.tsx — MeetingCreateButton (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §63 「+ 회의 잡기」 (C96 · N-46 ③).
 *
 * 화면이 보내는 것은 **종류 · 제목 · 날짜 · 시각 · 현장/온라인 · 자리 · 주관자 · 참석자**뿐이다.
 * 겹침은 **시간표가 막는다** — 회의는 `SER` 한 줄로 서고 `ser_occ` 의 EXCLUDE 가 강사·강의실·줌을 본다.
 * 그래서 이 창에는 「비었는지」를 미리 세는 코드가 없다(D-R37) — 409 문장을 그대로 띄운다(C93·C95 와 같은 모양).
 * 종류 낱말은 `GET /ops` 의 `mtTypes`(D-R18), 강의실·줌·사람은 `GET /meta` — 창을 열 때만 읽는다.
 */
'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { Banner, Button, ChipButton, Dialog, Input, Label, Segmented, Select } from '../ui';
import { apiMessage } from '@/api/client';
import { useCreateMeeting, useMeta } from '@/api/queries';
import type { CplWord, MeetingCreate, MeetingCreateResult } from '@/api/types';
import { parseHm } from '@/lib/calendar';

export interface MeetingCreateButtonProps {
  /** 회의 종류 다섯 — 낱말은 서버가 만든다 (D-R18) */
  mtTypes: CplWord[];
  /** 단추가 서는지도 서버가 정한다 (D-R39) */
  can: boolean;
  onDone?: (result: MeetingCreateResult) => void;
}

export function MeetingCreateButton({ mtTypes, can, onDone }: MeetingCreateButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const meta = useMeta(open);
  const write = useCreateMeeting();
  const [mtType, setMtType] = useState('');
  const [title, setTitle] = useState('');
  const [onDate, setOnDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [mode, setMode] = useState<'offline' | 'online'>('offline');
  const [placeId, setPlaceId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [attendeeIds, setAttendeeIds] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMtType(mtTypes[0]?.key ?? ''); setTitle(''); setOnDate(''); setStart(''); setEnd('');
    setMode('offline'); setPlaceId(''); setOwnerId(''); setAttendeeIds([]); setErr(null);
  }, [open, mtTypes]);

  // 현장 ↔ 온라인을 오가면 자리를 비운다 — 강의실 id 를 줌 계정 id 로 보내면 서버가 409 로 거절한다
  useEffect(() => { setPlaceId(''); }, [mode]);

  const staff = meta.data?.staff ?? [];
  const built = useMemo((): { body: MeetingCreate } | { issue: string } => {
    if (!mtType) return { issue: '회의 종류를 고르세요' };
    if (!onDate) return { issue: '날짜를 고르세요' };
    const startMin = parseHm(start);
    const endMin = parseHm(end);
    if (startMin === null || endMin === null) return { issue: '시각은 HH:MM 입니다' };
    if (endMin <= startMin) return { issue: '끝이 시작보다 뒤여야 합니다' };
    if (!placeId) return { issue: mode === 'offline' ? '강의실을 고르세요' : '줌 계정을 고르세요' };
    return {
      body: {
        mtType: mtType as MeetingCreate['mtType'],
        onDate, startMin, endMin, mode,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(mode === 'offline' ? { roomId: Number(placeId) } : { zaccId: Number(placeId) }),
        ...(ownerId ? { ownerId: Number(ownerId) } : {}),
        ...(attendeeIds.length ? { attendeeIds } : {}),
      },
    };
  }, [mtType, title, onDate, start, end, mode, placeId, ownerId, attendeeIds]);

  const pending = write.isPending;
  const canSubmit = 'body' in built && !pending;

  const submit = () => {
    if (!('body' in built) || pending) return;
    setErr(null);
    write.mutate(built.body, {
      onSuccess: (r) => { setOpen(false); onDone?.(r); },
      onError: (e) => setErr(apiMessage(e)),
    });
  };

  const toggle = (staffId: number) =>
    setAttendeeIds((ids) => (ids.includes(staffId) ? ids.filter((v) => v !== staffId) : [...ids, staffId]));

  if (!can) return null;
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>+ 회의 잡기</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="회의 잡기"
        width={600}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소 (Esc)</Button>
            <Button type="button" onClick={submit} disabled={!canSubmit}>{pending ? '잡는 중…' : '회의 잡기'}</Button>
          </>
        )}
      >
        <p className="mb-3 text-[12px] text-fg-subtle">
          잡으면 <b>시간표에 회차가 섭니다</b> — 그래서 같은 시각에 같은 강의실·줌 계정·주관자가 겹치면 거절됩니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>종류</Label>
            {/* 낱말은 서버의 다섯이다 — 화면은 고르기만 한다 (D-R18) */}
            <Segmented ariaLabel="회의 종류" value={mtType} disabled={pending} onChange={setMtType}
              options={mtTypes.map((t) => ({ value: t.key, label: t.label }))} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-title`} hint="없으면 종류 이름으로 부릅니다">제목</Label>
            <Input id={`${id}-title`} value={title} maxLength={120} disabled={pending}
              onChange={(e) => setTitle(e.target.value)} placeholder="주간 운영 회의" />
          </div>
          <div>
            <Label htmlFor={`${id}-date`}>날짜</Label>
            <Input id={`${id}-date`} type="date" value={onDate} disabled={pending} onChange={(e) => setOnDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`${id}-owner`} hint="시간표의 「강사」 자리입니다">주관자</Label>
            <Select id={`${id}-owner`} value={ownerId} disabled={pending} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">나</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-start`}>시작</Label>
            <Input id={`${id}-start`} value={start} disabled={pending} onChange={(e) => setStart(e.target.value)} placeholder="11:00" />
          </div>
          <div>
            <Label htmlFor={`${id}-end`}>끝</Label>
            <Input id={`${id}-end`} value={end} disabled={pending} onChange={(e) => setEnd(e.target.value)} placeholder="12:00" />
          </div>
          <div>
            <Label>방식</Label>
            <Segmented<'offline' | 'online'> ariaLabel="방식" value={mode} disabled={pending} onChange={setMode}
              options={[{ value: 'offline', label: '현장' }, { value: 'online', label: '온라인' }]} />
          </div>
          <div>
            <Label htmlFor={`${id}-place`}>{mode === 'offline' ? '강의실' : '줌 계정'}</Label>
            <Select id={`${id}-place`} value={placeId} disabled={pending} onChange={(e) => setPlaceId(e.target.value)}>
              <option value="">고르세요</option>
              {mode === 'offline'
                ? (meta.data?.rooms ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)
                : (meta.data?.zaccs ?? []).map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label hint="답하기 전에는 「응답 대기」입니다">참석자 {attendeeIds.length ? `· ${attendeeIds.length}명` : ''}</Label>
            <div className="flex flex-wrap gap-1.5">
              {staff.map((s) => (
                <ChipButton key={s.id} pressed={attendeeIds.includes(s.id)} disabled={pending}
                  onClick={() => toggle(s.id)}>{s.name}</ChipButton>
              ))}
            </div>
          </div>
        </div>
        {'issue' in built ? <p className="mt-2 text-[11px] text-fg-subtle">{built.issue}</p> : null}
        {err ? <Banner tone="danger" className="mt-3">{err}</Banner> : null}
      </Dialog>
    </>
  );
}
