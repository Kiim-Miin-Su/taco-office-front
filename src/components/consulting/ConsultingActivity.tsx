/** @file-guide
 * 목적: §31 컨설팅 진행 항목과 회차 5W1H 기록을 계약 모달 안에서 재사용한다.
 * 책임/재사용: 목록 응답의 서버 projection을 표시하고 항목 체크·회차 잡기·육하원칙 훅만 연결한다. 완료 회차나 진행률을 별도 저장하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useToggleConsultingItem, useWriteConsultingSession } from '@/api/queries';
import type { ConsSession, Consulting, ConsultingDetail } from '@/api/types';
import { Banner, Button, Chip, Label, Panel, Textarea } from '@/components/ui';
import { ConsultingProgress } from './ConsultingProgress';

const FIELDS = [['who', '누가'], ['what', '무엇을'], ['why', '왜'], ['how', '어떻게']] as const;
type Field = (typeof FIELDS)[number][0];

/** 회차 한 줄의 육하원칙 — 「기록」을 누르면 펼쳐지고 **바뀐 칸만** 보낸다 (C93 PATCH 규약 · C95) */
function SessionEditor({ consId, session, locked }: { consId: number; session: ConsSession; locked: boolean }) {
  const write = useWriteConsultingSession();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<Field, string>>({ who: session.who ?? '', what: session.what ?? '', why: session.why ?? '', how: session.how ?? '' });
  const diff = () => {
    const body: Partial<Record<Field, string | null>> = {};
    for (const [key] of FIELDS) {
      const next = draft[key].trim();
      if (next !== (session[key] ?? '')) body[key] = next || null;
    }
    return body;
  };
  const changed = Object.keys(diff()).length > 0;
  const save = () => {
    const body = diff();
    if (!Object.keys(body).length) return;
    write.mutate({ consId, sessId: session.id, body }, { onSuccess: () => setOpen(false) });
  };
  if (!open) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2">
        <dl className="grid min-w-0 grow grid-cols-1 gap-2 sm:grid-cols-2">
          {FIELDS.map(([key, label]) => (
            <div key={key}>
              <dt className="text-[10px] font-bold text-fg-subtle">{label}</dt>
              <dd className="text-[12px]">{session[key] ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {!locked ? <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)} aria-label={`${session.seq}회차 기록`}>기록</Button> : null}
      </div>
    );
  }
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={`${session.seq}회차 육하원칙`}>
      {FIELDS.map(([key, label]) => (
        <div key={key}>
          <Label htmlFor={`sess-${session.id}-${key}`}>{label}</Label>
          <Textarea id={`sess-${session.id}-${key}`} rows={2} value={draft[key]} maxLength={key === 'who' ? 200 : 2000}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
        </div>
      ))}
      {write.isError ? <Banner tone="danger" className="sm:col-span-2">{apiMessage(write.error)}</Banner> : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={write.isPending}>닫기</Button>
        <Button type="button" size="sm" onClick={save} disabled={!changed || write.isPending}>{write.isPending ? '저장 중…' : '저장'}</Button>
      </div>
    </div>
  );
}

export function ConsultingActivity({ item, detail, onAddSession }: { item: Consulting; detail?: ConsultingDetail; onAddSession?: () => void }) {
  const toggle = useToggleConsultingItem();
  const done = item.items.filter((row) => row.done).length;
  const locked = item.stage === 'done';
  return <div className="grid gap-3 lg:grid-cols-2">
    <Panel title={`진행 항목 — ${done}/${item.items.length}`} sub="진행 항목과 기록 회차는 서로 다른 서버 원장입니다.">
      {item.items.length === 0 ? <p className="text-[12px] text-fg-subtle">이 유형의 기본 진행 항목은 아직 확정되지 않았습니다.</p> : <>
        <ConsultingProgress value={done} max={item.items.length} label={`진행 항목 ${done}/${item.items.length}`} />
        <ul className="mt-3 divide-y divide-line">
          {item.items.map((row) => <li key={row.id} className="flex items-center gap-2 py-2">
            <button type="button" aria-pressed={row.done} disabled={toggle.isPending || locked}
              title={locked ? '종료된 컨설팅입니다' : row.done ? '완료 해제' : '완료 처리'}
              onClick={() => toggle.mutate({ consId: item.id, itemId: row.id, done: !row.done })}
              className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-[11px] font-bold ${row.done ? 'border-green bg-green text-white' : 'border-line text-transparent'}`}>✓</button>
            <span className={`min-w-0 grow text-[12px] ${row.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>{row.label}</span>
            {row.required ? <Chip tone="warning">필수</Chip> : null}
          </li>)}
        </ul>
      </>}
      {toggle.isError ? <Banner tone="danger" className="mt-2">{apiMessage(toggle.error)}</Banner> : null}
    </Panel>
    {/* 원본 §31 회차 바 — 「한 회차」(오늘 이하)는 서버가 센다. 앞으로 잡아 둔 날짜는 「앞으로」 칩으로 갈린다 (C95 · N-18 기록 ≠ 완료) */}
    <Panel
      title={`회차 기록 — ${item.sessionsLog.length}건`}
      sub={`회차 ${item.sessionsDone} / 약정 ${item.sessions ?? '—'}회 · 누가 · 무엇을 · 왜 · 어떻게`}
      right={detail?.capabilities.canAddSession && onAddSession
        ? <Button type="button" size="sm" variant="primary" onClick={onAddSession}>+ 회차 기록</Button>
        : null}
    >
      {item.sessions ? <ConsultingProgress value={item.sessionsDone} max={item.sessions} label={`회차 ${item.sessionsDone}/${item.sessions}`} /> : null}
      {item.sessionsLog.length === 0 ? <p className="mt-2 text-[12px] text-fg-subtle">아직 기록된 회차가 없습니다.</p> : <ol className="mt-2 divide-y divide-line">
        {item.sessionsLog.map((session) => <li key={session.id} className="py-3">
          <div className="flex items-center gap-2">
            <Chip tone="info">{session.seq}회차</Chip>
            <span className="text-[11px] text-fg-subtle">{session.onDate ?? '날짜 미정'}</span>
            {session.done === false ? <Chip tone="warning" size="compact">앞으로</Chip> : null}
            {session.serId ? <Chip tone="neutral" size="compact">시간표</Chip> : null}
          </div>
          <SessionEditor consId={item.id} session={session} locked={locked} />
        </li>)}
      </ol>}
    </Panel>
  </div>;
}
