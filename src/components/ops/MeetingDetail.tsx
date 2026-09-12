/** @file-guide
 * 목적: MeetingDetail.tsx — MeetingDetail (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §66 회의 상세 — 참석 확인 → ① 사전 자료 → ② 속기록 → ③ 할 일.
 *
 * 「참석 N/M 확인」도, 속기록 머리말 넷도, 회의 종류 이름도 **서버가 준 것**을 그립니다
 * (D-R18 · D-R37). 참석은 **세 값**이라 「응답 대기」와 「불참」을 같은 칩으로 접지 않습니다.
 *
 * 원문의 「안내 보내기」와 참석 응답 단추는 만들지 않았습니다 — 무엇이 누구에게 가는지
 * 원문이 말하지 않습니다 (N-32).
 */
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banner, Button, Chip, Drawer, Label, Input, Segmented, Select, Textarea } from '../ui';
import { apiMessage } from '@/api/client';
import { useAssignMeetingTask, useMeetingDetail, useWriteMinutes } from '@/api/queries';
import type { MeetingAttendee, MeetingTask, StaffBrief } from '@/api/types';

type Tab = 'pre' | 'minutes' | 'tasks';

/** 칩 색만 화면이 고른다 — 낱말은 서버가 준 stateLabel 이다 (D-R18) */
const ATTEND_TONE: Record<string, 'warning' | 'success' | 'neutral'> = {
  waiting: 'warning', in: 'success', out: 'neutral',
};

function AttendeeRow({ a }: { a: MeetingAttendee }) {
  return (
    <div className={`flex items-center gap-2 border-l-2 px-3 py-1.5 ${
      a.state === 'in' ? 'border-green bg-green/5'
        : a.state === 'out' ? 'border-line-2 bg-bg-2' : 'border-amber bg-amber/10'}`}
    >
      <span className="text-[12.5px] font-bold text-fg">{a.name}</span>
      {a.title ? <span className="text-[11px] text-fg-subtle">{a.title}</span> : null}
      <Chip className="ml-auto" tone={ATTEND_TONE[a.state] ?? 'neutral'}>{a.stateLabel}</Chip>
    </div>
  );
}

function TaskRow({ t }: { t: MeetingTask }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-2 ${
      t.done ? 'bg-green/5' : t.overdueDays > 0 ? 'bg-red/5' : 'bg-bg-2'}`}
    >
      <span className={t.done ? 'text-green' : 'text-line-2'}>{t.done ? '☑' : '☐'}</span>
      <span className={`flex-1 text-[12.5px] ${t.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>{t.title}</span>
      <span className="text-[11px] text-fg-subtle">{t.toName ?? '미배정'}</span>
      {t.dueOn ? (
        <span className={`text-[11px] ${t.overdueDays > 0 ? 'font-bold text-red' : 'text-fg-subtle'}`}>
          {t.dueOn.slice(5)}{t.overdueDays > 0 ? ` · ${t.overdueDays}일 지남` : ''}
        </span>
      ) : null}
    </li>
  );
}

export function MeetingDetail({
  meetingId, staff, onClose,
}: { meetingId: number | null; staff?: StaffBrief[]; onClose: () => void }) {
  const q = useMeetingDetail(meetingId);
  const save = useWriteMinutes();
  const assign = useAssignMeetingTask();
  const d = q.data;

  const [tab, setTab] = useState<Tab>('minutes');
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('');
  const [toId, setToId] = useState('');
  const [dueOn, setDueOn] = useState('');

  // 회의를 바꿔 열면 초안을 그 회의 것으로 갈아 끼운다 — 남의 속기록 위에 쓰지 않는다
  useEffect(() => { setDraft(d?.minutes ?? ''); }, [d?.id, d?.minutes]);
  useEffect(() => { setTab('minutes'); setTitle(''); setToId(''); setDueOn(''); }, [meetingId]);

  const insert = (word: string) => setDraft((v) => (v.endsWith('\n') || v === '' ? `${v}${word}\n` : `${v}\n${word}\n`));

  return (
    <Drawer open={meetingId !== null} onClose={onClose} title={d?.title ?? '회의'}
      sub={d ? `${d.mtTypeLabel}${d.onDate ? ` · ${d.onDate}` : ''}` : undefined}
    >
      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner> : null}
      {q.isError ? <Banner tone="danger">{apiMessage(q.error)}</Banner> : null}

      {d ? (
        <div className="flex flex-col gap-3">
          <section>
            {/* 「참석 N/M 확인」은 서버가 센다 — 화면이 칩을 세지 않는다 (D-R37) */}
            <h3 className="mb-1.5 text-[12px] font-bold text-fg">{d.attendLabel}</h3>
            <div className="flex flex-col gap-1">
              {d.attendees.map((a) => <AttendeeRow key={a.staffId} a={a} />)}
              {d.attendees.length === 0 ? <p className="text-[12px] text-fg-subtle">참석자가 없습니다</p> : null}
            </div>
          </section>

          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'pre', label: `① 사전 자료 ${d.preFiles.length}` },
              { value: 'minutes', label: `② 속기록 ${d.minutes ? 1 : 0}` },
              { value: 'tasks', label: `③ 할 일 ${d.tasks.length}` },
            ]}
          />

          {tab === 'pre' ? (
            d.preFiles.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">사전 자료가 없습니다</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {d.preFiles.map((f) => (
                  <li key={f} className="rounded-lg border border-line px-2.5 py-2 text-[12px] text-fg-2">{f}</li>
                ))}
              </ul>
            )
          ) : null}

          {tab === 'minutes' ? (
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <Label htmlFor="mt-minutes">속기록</Label>
                {/* 안내 문구도 서버가 준 것이다 — 회의마다 머리말이 제각각이 되지 않게 */}
                <span className="text-[11px] text-fg-subtle">{d.minutesHint}</span>
              </div>
              <Textarea id="mt-minutes" rows={10} maxLength={8000} value={draft}
                onChange={(e) => setDraft(e.target.value)} />
              <div className="mt-2 flex flex-wrap gap-1">
                {d.minutesTemplates.map((w) => (
                  <Button key={w} size="sm" variant="ghost" onClick={() => insert(w)}>{w}</Button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-fg-subtle">
                {d.minutesAt
                  ? `마지막 저장 ${d.minutesAt.slice(0, 16).replace('T', ' ')} · ${d.minutesByName ?? '—'}`
                  : '아직 저장한 적이 없습니다'}
              </p>
              {save.isError ? <Banner tone="danger" className="mt-2">{apiMessage(save.error)}</Banner> : null}
            </div>
          ) : null}

          {tab === 'tasks' ? (
            <div>
              {d.tasks.length === 0 ? (
                <p className="text-[12px] text-fg-subtle">배정한 할 일이 없습니다</p>
              ) : (
                <>
                  <p className="mb-1.5 text-[11px] text-fg-subtle">끝낸 것 {d.taskDone}/{d.tasks.length}</p>
                  <ul className="flex flex-col gap-1">{d.tasks.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
                </>
              )}

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-48 grow">
                  <Label htmlFor="mt-task">할 일</Label>
                  <Input id="mt-task" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="w-40">
                  <Label htmlFor="mt-to">담당</Label>
                  <Select id="mt-to" value={toId} onChange={(e) => setToId(e.target.value)}>
                    <option value="">고르기</option>
                    {(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </div>
                <div className="w-40">
                  <Label htmlFor="mt-due" hint="비우면 기한 없음">기한</Label>
                  <Input id="mt-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
                </div>
                <Button
                  disabled={assign.isPending || title.trim() === '' || !toId}
                  onClick={() => assign.mutate(
                    { id: d.id, title: title.trim(), toId: Number(toId), ...(dueOn ? { dueOn } : {}) },
                    { onSuccess: () => { setTitle(''); setToId(''); setDueOn(''); } },
                  )}
                >
                  배정
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-fg-subtle">배정하면 담당자의 할 일 목록에 들어가고 알림이 갑니다.</p>
              {assign.isError ? <Banner tone="danger" className="mt-2">{apiMessage(assign.error)}</Banner> : null}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <Link href="/schedule" className="mr-auto">
              <Button size="sm" variant="secondary">일정 보기</Button>
            </Link>
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button
              disabled={save.isPending || draft.trim() === '' || draft === (d.minutes ?? '')}
              onClick={() => save.mutate({ id: d.id, minutes: draft })}
            >
              속기록 저장
            </Button>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
