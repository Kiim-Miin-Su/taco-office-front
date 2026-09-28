/** @file-guide
 * 목적: §31 컨설팅 진행 항목과 회차 5W1H 기록을 계약 모달 안에서 재사용한다.
 * 책임/재사용: 목록 응답의 서버 projection을 표시하고 항목 체크·회차 잡기·육하원칙 훅만 연결한다. 완료 회차나 진행률을 별도 저장하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §31 「진행 단계 — 항목 · 회차」 한 판 (1:1 대조 wave 3).
 *
 * - 머리: 큰 글자 「2 / 6회 진행한 회차」 + 보라 막대 + 「+ 회차 기록」 주버튼(31-01). 「한 회차」는 서버가 센다(날짜 오늘 이하 · N-18).
 * - 해야 할 항목: 「4 / 7 · 57%」 머리와 **4열 카드 격자**(끝낸 것은 초록 바탕 · 31-02 · 31-03). 카드 아래 한 줄은 처리 시각 · 처리자
 *   (`doneAt` · 31-04 — 「2026-07-22 14:00 · 김범준」), 안 끝낸 것은 「기한 없음」(기한 칸이 없다는 사실 그대로다).
 * - 회차: 머리 「1회차 · 26년 7월 14일 화요일 · 16:00–17:00 · 김범준 · 4호 · 기록됨」(31-07 — 시각·담당·강의실은 서버가 시간표 회차에서 읽는다,
 *   「기록됨」도 서버 판정 `recorded`) · 본문 무엇을 · 왜 · 어떻게 3열(31-09) · 「결과」 인용 상자와 「다음까지」 호박 줄(31-08) ·
 *   단추 「고치기」 · 「일정」(31-10 — 일정은 그날 시간표로 간다).
 * - 「항목 수정」(31-05 · N-18-a DQ5 대안 — 담당이 더하기 · 이름 바꾸기 · 빼기)과 항목 줄의 「파일」(31-06 · N-63 — 항목마다 6개) (W11).
 *   서는지는 서버 값(`capabilities.canEditItems` · 항목의 `canAddFile`)이다 — 화면이 단계 · 파일 수를 다시 세지 않는다.
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useToggleConsultingItem, useWriteConsultingSession } from '@/api/queries';
import type { ConsSession, Consulting, ConsultingDetail } from '@/api/types';
import { Banner, Button, Chip, Label, LinkButton, Textarea, cn } from '@/components/ui';
import { kstDateTime, longDateLabel } from '@/lib/calendar';
import { ConsultingItemFiles } from './ConsultingItemFiles';
import { ConsultingItemsEditor } from './ConsultingItemsEditor';
import { ConsultingProgress } from './ConsultingProgress';

const FIELDS = [
  ['who', '누가', 200], ['what', '무엇을', 2000], ['why', '왜', 2000], ['how', '어떻게', 2000],
  ['result', '결과', 2000], ['nextUntil', '다음까지', 120],
] as const;
type Field = (typeof FIELDS)[number][0];
/** 본문 3열 — 누가는 머리의 담당 이름이다(원본 §31 · 31-09) */
const BODY = [['what', '무엇을'], ['why', '왜'], ['how', '어떻게']] as const;

const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 회차 한 장 — 「고치기」를 누르면 펼쳐지고 **바뀐 칸만** 보낸다 (C93 PATCH 규약 · C95) */
function SessionCard({ consId, session, locked }: { consId: number; session: ConsSession; locked: boolean }) {
  const write = useWriteConsultingSession();
  const [open, setOpen] = useState(false);
  const initial = (): Record<Field, string> => ({
    who: session.who ?? '', what: session.what ?? '', why: session.why ?? '', how: session.how ?? '',
    result: session.result ?? '', nextUntil: session.nextUntil ?? '',
  });
  const [draft, setDraft] = useState<Record<Field, string>>(initial);
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
  const time = session.startMin != null && session.endMin != null ? `${hm(session.startMin)}–${hm(session.endMin)}` : null;

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-card">
      <header className="flex flex-wrap items-center gap-2 bg-inset px-3 py-2">
        <Chip tone="purple" styleKind="solid">{session.seq}회차</Chip>
        <b className="text-[13px] text-fg">{session.onDate ? longDateLabel(session.onDate) : '날짜 미정'}</b>
        {time ? <span className="text-[14px] text-fg">{time}</span> : null}
        {session.staffName ? <span className="text-[12px] text-fg-subtle">{session.staffName}</span> : null}
        {session.roomName ? <Chip size="compact">{session.roomName}</Chip> : null}
        {session.recorded ? <Chip tone="success" size="compact">기록됨</Chip> : null}
        {session.done === false ? <Chip tone="warning" size="compact">앞으로</Chip> : null}
        <span className="ml-auto flex gap-1.5">
          {!locked && !open ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => { setDraft(initial()); setOpen(true); }} aria-label={`${session.seq}회차 고치기`}>고치기</Button>
          ) : null}
          {/* 「일정」 — 그날 시간표로 간다. 시간표 회차가 없으면(날짜 미정 · 연결 없음) 서지 않는다 */}
          {session.serId && session.onDate ? (
            <LinkButton href={`/schedule?date=${session.onDate}`} size="sm" variant="secondary" aria-label={`${session.seq}회차 일정`}>일정</LinkButton>
          ) : null}
        </span>
      </header>
      {open ? (
        <div className="grid gap-2 p-3 sm:grid-cols-2" aria-label={`${session.seq}회차 육하원칙`}>
          {FIELDS.map(([key, label, max]) => (
            <div key={key}>
              <Label htmlFor={`sess-${session.id}-${key}`}>{label}</Label>
              <Textarea id={`sess-${session.id}-${key}`} rows={2} value={draft[key]} maxLength={max}
                onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, [key]: v })); }} />
            </div>
          ))}
          <p className="text-[11px] text-fg-subtle sm:col-span-2">「다음까지」를 적으면 담당자의 할 일로 올라가고 알림이 갑니다.</p>
          {write.isError ? <Banner tone="danger" className="sm:col-span-2">{apiMessage(write.error)}</Banner> : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={write.isPending}>닫기</Button>
            <Button type="button" size="sm" onClick={save} disabled={!changed || write.isPending}>{write.isPending ? '저장 중…' : '저장'}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 p-3">
          <dl className="grid grid-cols-1 overflow-hidden rounded-lg bg-inset sm:grid-cols-3 sm:divide-x sm:divide-line">
            {BODY.map(([key, label]) => (
              <div key={key} className="px-3 py-2">
                <dt className="text-[10px] font-bold text-fg-subtle">{label}</dt>
                <dd className="text-[12.5px] font-bold text-fg">{session[key] ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {session.result ? (
            <div>
              <p className="text-[10px] font-bold text-fg-subtle">결과</p>
              <blockquote className="mt-1 rounded-r-lg border-l-[3px] border-violet bg-inset px-3 py-2 text-[12.5px] font-bold text-fg">{session.result}</blockquote>
            </div>
          ) : null}
          {session.nextUntil ? (
            <div>
              <p className="text-[10px] font-bold text-fg-subtle">다음까지</p>
              <p className="mt-1 rounded-lg bg-amber/10 px-3 py-2 text-[12.5px] font-bold text-amber">{session.nextUntil}</p>
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}

export function ConsultingActivity({ item, detail, onAddSession }: { item: Consulting; detail?: ConsultingDetail; onAddSession?: () => void }) {
  const toggle = useToggleConsultingItem();
  const [editing, setEditing] = useState(false);
  const [filesOf, setFilesOf] = useState<number | null>(null);
  const done = item.items.filter((row) => row.done).length;
  const total = item.items.length;
  const locked = item.stage === 'done';
  /** 「항목 수정」 · 항목 파일 빼기 — 서버의 상세 단추(종료 전 건) */
  const canEditItems = detail?.capabilities.canEditItems === true;
  const filesItem = filesOf === null ? null : item.items.find((row) => row.id === filesOf) ?? null;
  return (
    <div className="space-y-4">
      {/* 원본 §31 머리 — 「2 / 6회 진행한 회차」와 막대 · 「+ 회차 기록」 (31-01). 「한 회차」는 서버의 sessionsDone */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="shrink-0 text-[22px] font-bold text-fg">
          {item.sessionsDone} / {item.sessions ?? '—'}회 <span className="text-[12px] font-normal text-fg-subtle">진행한 회차</span>
        </p>
        <div className="min-w-[120px] grow">
          <ConsultingProgress value={item.sessionsDone} max={item.sessions ?? 0} label={`회차 ${item.sessionsDone}/${item.sessions ?? 0}`} />
        </div>
        {detail?.capabilities.canAddSession && onAddSession
          ? <Button type="button" variant="primary" onClick={onAddSession}>+ 회차 기록</Button>
          : null}
        {/* 잠긴 까닭 — 서버 문장 그대로(쓰기의 409 와 같은 말 · S5). 수납 전 계약의 진행 탭이 「진행이 잠겨 있다」를 말한다 (I-89) */}
        {detail && !detail.capabilities.canAddSession && detail.capabilities.addSessionBlockedReason
          ? <span className="text-[12px] text-fg-subtle" role="status">{detail.capabilities.addSessionBlockedReason}</span>
          : null}
      </div>

      {/* 해야 할 항목 — 머리의 「4 / 7 · 57%」와 4열 카드 (31-02 · 31-03) */}
      <section className="rounded-xl border border-line bg-inset/60 p-3" aria-label="해야 할 항목">
        <div className="mb-2 flex items-center gap-3">
          <h3 className="shrink-0 text-[13px] font-bold text-fg">해야 할 항목 <span className="text-violet">{done} / {total}</span></h3>
          {total > 0 ? <>
            <div className="grow"><ConsultingProgress value={done} max={total} label={`해야 할 항목 ${done}/${total}`} /></div>
            <span className="text-[12px] font-bold text-violet">{Math.round((done / total) * 100)}%</span>
          </> : <div className="grow" />}
          {/* 원본 §31 머리 오른쪽 「항목 수정」 (31-05) */}
          {canEditItems ? <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>항목 수정</Button> : null}
        </div>
        {total === 0 ? (
          <p className="text-[12px] text-fg-subtle">
            {canEditItems ? '항목이 없습니다 — 「항목 수정」으로 더합니다.' : '이 유형의 기본 진행 항목은 아직 확정되지 않았습니다.'}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {item.items.map((row) => {
              const at = kstDateTime(row.doneAt) ?? row.doneOn;
              return (
                <li key={row.id} className={cn('flex items-start gap-2 rounded-lg border p-2.5', row.done ? 'border-green/30 bg-green/5' : 'border-line bg-card')}>
                  <button type="button" aria-pressed={row.done} aria-label={`${row.label} ${row.done ? '완료 해제' : '완료 처리'}`} disabled={toggle.isPending || locked}
                    title={locked ? '종료된 컨설팅입니다' : row.done ? '완료 해제' : '완료 처리'}
                    onClick={() => toggle.mutate({ consId: item.id, itemId: row.id, done: !row.done })}
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-[11px] font-bold ${row.done ? 'border-green bg-green text-white' : 'border-line text-transparent'}`}>✓</button>
                  <span className="min-w-0 grow">
                    <span className={`block text-[12.5px] font-bold ${row.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>{row.label}</span>
                    {/* 처리 시각 · 처리자 (31-04) — 서버의 doneAt · doneBy. 안 끝낸 항목은 「기한 없음」(기한 칸이 없다) */}
                    <span className="block text-[10.5px] text-fg-subtle">
                      {row.done ? [at, row.doneBy].filter(Boolean).join(' · ') : '기한 없음'}
                    </span>
                  </span>
                  {row.required ? <Chip tone="warning" size="compact">필수</Chip> : null}
                  {/* 원본 §31 항목 줄의 「파일」 (31-06 · N-63) — 올릴 수 있거나 올린 것이 있을 때 선다 */}
                  {row.canAddFile || row.files.length > 0 ? (
                    <Button type="button" size="sm" variant="secondary" className="shrink-0"
                      aria-label={`${row.label} 파일${row.files.length ? ` ${row.files.length}개` : ''}`}
                      onClick={() => setFilesOf(row.id)}>파일</Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {toggle.isError ? <Banner tone="danger" className="mt-2">{apiMessage(toggle.error)}</Banner> : null}
      </section>
      {editing ? <ConsultingItemsEditor open consId={item.id} items={item.items} onClose={() => setEditing(false)} /> : null}
      {filesItem ? (
        <ConsultingItemFiles open consId={item.id} item={filesItem} canRemove={canEditItems} onClose={() => setFilesOf(null)} />
      ) : null}

      {/* 회차 기록 — 원본 §31 「회차 기록」 머리 아래 회차 카드 */}
      <section aria-label="회차 기록">
        <h3 className="mb-2 border-b border-line pb-1.5 text-[12px] font-bold text-fg-subtle">회차 기록 {item.sessionsLog.length}건</h3>
        {item.sessionsLog.length === 0 ? <p className="text-[12px] text-fg-subtle">아직 기록된 회차가 없습니다.</p> : (
          <ol className="space-y-2">
            {item.sessionsLog.map((session) => <SessionCard key={session.id} consId={item.id} session={session} locked={locked} />)}
          </ol>
        )}
      </section>
    </div>
  );
}
