/** @file-guide
 * 목적: LeadApptSection.tsx — LeadApptSection, leadApptLine (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 상담 상세 서랍의 「2차 · 진단 일정」 + 「스케줄에 N건 만들기」 (23-15).
 *
 * 원본 §23 2차 대기 카드의 「진단 08-24 10:00 · 본원 [미생성]」「2차 08-26 14:30 · 본원 [미생성]」이 이 줄이다.
 * 종류 낱말은 서버(`intakeHead.apptKinds` · 줄의 `kindLabel`), 장소 한 마디(`placeLabel`)와 「미생성」 판정(`scheduled`)도 서버 것이다.
 * 「스케줄에 N건 만들기」는 시간표 회차를 서버가 만든다 — 겹치면 서버 문장(409)을 그대로 보인다. 담당의 불가 시간은 막지 않고 알린다.
 * 시간표에 만든 줄은 여기서 고치지도 지우지도 않는다(시간표가 정본 · 서버도 409 로 막는다). 끝난 건은 읽기만 한다. 부모는 `key={lead.id}` 로 세운다.
 * 「지우기」는 두 번 눌러야 지운다(상담 단계 이동과 같은 `armed` 모양) — 한 번 눌러 잘못 지우는 일이 없게.
 */
'use client';
import { useId, useState } from 'react';
import { Banner, Button, Chip, Input, Label, Select } from '../ui';
import { apiMessage } from '@/api/client';
import { useDeleteLeadAppt, useMeta, useSaveLeadAppt, useScheduleLeadAppts } from '@/api/queries';
import type { Lead, LeadAppt } from '@/api/types';
import { hhmm, parseHm } from '@/lib/calendar';

/** 카드 한 줄 — 「08-24 10:00 · 3층 컨설팅룸」 (원본 §23 모양 · 월-일) */
export const leadApptLine = (a: LeadAppt) => `${a.onDate.slice(5)} ${hhmm(a.startMin)} · ${a.placeLabel}`;

interface Draft { kind: string; onDate: string; start: string; end: string; mode: 'offline' | 'online'; roomId: string }

export interface LeadApptSectionProps {
  lead: Lead;
  /** 종류 낱말 — 서버의 `intakeHead.apptKinds` */
  kinds: ReadonlyArray<{ key: string; label: string }>;
  /** 깔때기 안(서버의 퍼널 단계)인가 — 아니면 읽기만 */
  editable: boolean;
  onDone?: (message: string) => void;
}

export function LeadApptSection({ lead, kinds, editable, onDone }: LeadApptSectionProps) {
  const id = useId();
  const appts = lead.appts ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string[]>([]);
  const meta = useMeta(draft !== null);
  const save = useSaveLeadAppt();
  const remove = useDeleteLeadAppt();
  /** 지우기를 한 번 누른 줄의 종류 — 한 번 더 눌러야 지운다 */
  const [armed, setArmed] = useState<string | null>(null);
  const schedule = useScheduleLeadAppts();
  const unscheduled = appts.filter((a) => !a.scheduled).length;
  const labelOf = (k: string) => kinds.find((x) => x.key === k)?.label ?? appts.find((a) => a.kind === k)?.kindLabel ?? k;

  const edit = (kind: string) => {
    const cur = appts.find((a) => a.kind === kind);
    setErr(null);
    setDraft(cur
      ? { kind, onDate: cur.onDate, start: hhmm(cur.startMin), end: hhmm(cur.endMin), mode: cur.mode === 'online' ? 'online' : 'offline', roomId: cur.roomId ? String(cur.roomId) : '' }
      : { kind, onDate: '', start: '', end: '', mode: 'offline', roomId: '' });
  };
  const s = draft ? parseHm(draft.start) : null;
  const e = draft ? parseHm(draft.end) : null;
  const issue = !draft ? null
    : !/^\d{4}-\d{2}-\d{2}$/.test(draft.onDate) ? '날짜를 고르세요'
    : s === null || e === null || s >= 1440 ? '시각은 HH:MM 입니다'
    : e <= s ? '끝나는 시각이 시작보다 뒤여야 합니다' : null;
  const submit = () => {
    if (!draft || issue || s === null || e === null) return;
    setErr(null);
    save.mutate({
      id: lead.id, kind: draft.kind as LeadAppt['kind'], onDate: draft.onDate, startMin: s, endMin: e, mode: draft.mode,
      roomId: draft.mode === 'offline' && draft.roomId ? Number(draft.roomId) : null,
    }, {
      onSuccess: () => { setDraft(null); onDone?.(`${labelOf(draft.kind)} 일정을 적었습니다 — 시간표에는 아직 없습니다`); },
      onError: (x) => setErr(apiMessage(x)),
    });
  };
  const drop = (kind: string) => {
    if (armed !== kind) { setErr(null); setArmed(kind); return; }
    remove.mutate({ id: lead.id, kind: kind as LeadAppt['kind'] }, {
      onSuccess: () => onDone?.(`${labelOf(kind)} 일정을 지웠습니다`),
      onError: (x) => setErr(apiMessage(x)),
      onSettled: () => setArmed(null),
    });
  };
  const makeSchedule = () => {
    setErr(null); setWarn([]);
    schedule.mutate({ id: lead.id }, {
      onSuccess: (r) => {
        setWarn(r.unavailable.map((u) => `${u.date} ${hhmm(u.startMin)}–${hhmm(u.endMin)} · ${u.teacherName} 불가 시간 — ${u.reason}`));
        onDone?.(`시간표에 ${r.created}건 만들었습니다`);
      },
      onError: (x) => setErr(apiMessage(x)),
    });
  };

  return (
    <section aria-label="2차 · 진단 일정" className="rounded-lg border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-[12px] font-bold text-fg">2차 · 진단 일정</span>
        {editable && unscheduled > 0 ? (
          <Button type="button" size="sm" variant="secondary" disabled={schedule.isPending} onClick={makeSchedule}>
            {schedule.isPending ? '만드는 중…' : `스케줄에 ${unscheduled}건 만들기`}
          </Button>
        ) : null}
      </div>
      <ul className="divide-y divide-line">
        {kinds.map((k) => {
          const a = appts.find((x) => x.kind === k.key);
          return (
            <li key={k.key} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[12px]">
              <span className="w-8 shrink-0 font-bold text-fg-subtle">{k.label}</span>
              <span className="min-w-0 grow text-fg">{a ? leadApptLine(a) : '없음'}</span>
              {a && !a.scheduled ? <Chip tone="danger" styleKind="solid" size="compact">미생성</Chip> : null}
              {a?.scheduled ? <Chip tone="success" size="compact">시간표</Chip> : null}
              {editable && !a?.scheduled && draft === null && armed !== k.key ? (
                <Button type="button" size="sm" variant="ghost" aria-label={`${k.label} 일정 ${a ? '고치기' : '잡기'}`} onClick={() => edit(k.key)}>{a ? '고치기' : '잡기'}</Button>
              ) : null}
              {editable && a && !a.scheduled && draft === null ? (
                <Button type="button" size="sm" variant={armed === k.key ? 'danger' : 'ghost'} disabled={remove.isPending}
                  aria-label={armed === k.key ? `${k.label} 일정 지우기 확인` : `${k.label} 일정 지우기`} onClick={() => drop(k.key)}>
                  {remove.isPending && armed === k.key ? '지우는 중…' : armed === k.key ? '한 번 더 누르면 지움' : '지우기'}
                </Button>
              ) : null}
              {armed === k.key && !remove.isPending ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setArmed(null)}>두기</Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {draft ? (
        <div className="flex flex-col gap-2 border-t border-line bg-inset px-3 py-2">
          <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2">
            <div>
              <Label htmlFor={`${id}-d`}>{labelOf(draft.kind)} 날짜</Label>
              <Input id={`${id}-d`} type="date" value={draft.onDate} disabled={save.isPending} onChange={(x) => setDraft({ ...draft, onDate: x.target.value })} />
            </div>
            <div>
              <Label htmlFor={`${id}-s`}>시작</Label>
              <Input id={`${id}-s`} value={draft.start} placeholder="14:30" disabled={save.isPending} onChange={(x) => setDraft({ ...draft, start: x.target.value })} />
            </div>
            <div>
              <Label htmlFor={`${id}-e`}>끝</Label>
              <Input id={`${id}-e`} value={draft.end} placeholder="15:30" disabled={save.isPending} onChange={(x) => setDraft({ ...draft, end: x.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${id}-m`}>방식</Label>
              <Select id={`${id}-m`} value={draft.mode} disabled={save.isPending} onChange={(x) => setDraft({ ...draft, mode: x.target.value === 'online' ? 'online' : 'offline', roomId: '' })}>
                <option value="offline">현장</option>
                <option value="online">온라인</option>
              </Select>
            </div>
            {draft.mode === 'offline' ? (
              <div>
                <Label htmlFor={`${id}-r`} hint="비우면 장소 미정">강의실</Label>
                <Select id={`${id}-r`} value={draft.roomId} disabled={save.isPending} onChange={(x) => setDraft({ ...draft, roomId: x.target.value })}>
                  <option value="">—</option>
                  {(meta.data?.rooms ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </div>
            ) : null}
          </div>
          {issue ? <p className="text-[11.5px] text-amber">{issue}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={submit} disabled={save.isPending || issue !== null}>{save.isPending ? '적는 중…' : '저장'}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={() => { setDraft(null); setErr(null); }}>취소</Button>
          </div>
        </div>
      ) : null}
      {err ? <Banner tone="danger" className="m-2">{err}</Banner> : null}
      {warn.length ? <Banner tone="warning" className="m-2">{warn.join(' · ')}</Banner> : null}
    </section>
  );
}
