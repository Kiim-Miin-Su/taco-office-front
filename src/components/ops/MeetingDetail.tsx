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
 * **「안내 보내기」와 참석 응답 (W11 · N-32)** — 안내는 참석자(직원)에게 알림 한 건씩이고 본문(회의 이름 · 일시 ·
 * 강의실 또는 줌 계정 · 참가 링크 — 비밀번호 없음)은 서버가 사실로 조립한다. 알림 링크가 이 창으로 오고,
 * 참석자는 **본인 줄만** 여기서 「참석 · 불참」으로 답한다(대리 입력 없음 · 강사 참석자 포함).
 * 어느 단추가 서는지는 서버가 정한다(`canEdit` · `canSendNotice` · `canRespond` — D-R39). 막힌 이유 문장도 서버 것이다.
 *
 * **창 모양은 원문 §66 그대로 가운데 큰 창이다** (66-1) — 520px 서랍이 아니다(§65 기획 보고서와 같은 `WideDialog`).
 *
 * **w5 · 원문 §66 컷을 다시 대조했다** —
 *   · 머리는 회의 **종류**(「일반 회의」)와 날짜 칩(「8월 20일 목요일」), 부제는 「18:30–19:30 · 김범준, Allissa, KJ, Sophia · 6호」다(66-2).
 *     시각·자리는 서버가 §63 줄과 같은 조인으로 준다 — 옛 회의는 없어서 부제에서 빠진다(지어내지 않는다 · N-25).
 *     사람이 적은 회의 제목은 원문 컷에 없는 칸이라 부제 맨 앞에 둔다(잃지 않는다).
 *   · 바닥은 「일정 보기」 · 「안내 보내기」(왼쪽) · 「닫기」 · 「속기록 저장」(오른쪽)이다 — 1차 물결이 §65 컷(바닥 「닫기」 없음)을 따라
 *     여기서도 지웠는데 **§66 컷에는 있다**(D-R44 원문이 이긴다). 컷의 네 단추는 같은 높이다(W11 재대조).
 *   · 참석 줄은 이름 바로 뒤에 상태 칩이고 직함이 없다(66-6) · 「속기록 *」(66-4) · 「일정 보기」는 그 날로 간다(66-5).
 *   · ③ 할 일 줄은 체크박스다 — §65 과제·§64 할 일과 같은 쓰기(`PATCH /drawer/todos/:id`)다. 새 경로 0.
 */
'use client';
import { useEffect, useState } from 'react';
import { Banner, Button, Checkbox, Chip, Label, Input, LinkButton, Segmented, Select, Textarea } from '../ui';
import { WideDialog } from '../ui/WideDialog';
import { apiMessage } from '@/api/client';
import {
  useAssignMeetingTask, useDrawerWrite, useMeetingDetail, useRespondMeeting, useSendMeetingNotice, useWriteMinutes,
} from '@/api/queries';
import type { MeetingAttendee, MeetingTask, StaffBrief } from '@/api/types';
import { hhmm, monthDayLabel } from '@/lib/calendar';

type Tab = 'pre' | 'minutes' | 'tasks';

/** 칩 색만 화면이 고른다 — 낱말은 서버가 준 stateLabel 이다 (D-R18) */
const ATTEND_TONE: Record<string, 'warning' | 'success' | 'neutral'> = {
  waiting: 'warning', in: 'success', out: 'neutral',
};

/** 참석 한 줄 — 원문 §66 은 이름 바로 뒤에 채운 상태 칩이고 직함이 없다 (66-6) */
function AttendeeRow({ a }: { a: MeetingAttendee }) {
  return (
    <div className={`flex items-center gap-3 rounded border-l-2 bg-card px-3 py-1.5 ${
      a.state === 'in' ? 'border-green' : a.state === 'out' ? 'border-line-2' : 'border-amber'}`}
    >
      <span className="w-20 truncate text-[12.5px] font-bold text-fg" title={a.name}>{a.name}</span>
      <Chip size="compact" styleKind="solid" tone={ATTEND_TONE[a.state] ?? 'neutral'}>{a.stateLabel}</Chip>
    </div>
  );
}

/**
 * ③ 할 일 한 줄 — §65 과제·§64 할 일과 같은 체크박스·같은 이름(「… 완료」) (w5 · 1차 물결 남김 §66 ③).
 * 체크 칸이 열리는지는 서버의 `canToggle`(체크 쓰기와 같은 판정)이다 — 강사 참석자는 자기에게 온 것만 (W11 A' 후속)
 */
function TaskRow({ t, busy, onToggle }: { t: MeetingTask; busy: boolean; onToggle: (id: number, done: boolean) => void }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-2 ${
      t.done ? 'bg-green/5' : t.overdueDays > 0 ? 'bg-red/5' : 'bg-bg-2'}`}
    >
      <Checkbox checked={t.done} disabled={busy || !t.canToggle} aria-label={`${t.title} 완료`}
        onChange={(e) => onToggle(t.id, e.currentTarget.checked)} />
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
  const notice = useSendMeetingNotice();
  const respond = useRespondMeeting();
  // 보낸 알림 수 — 서버가 센 수를 그대로 알린다(화면이 참석자를 세지 않는다)
  const [noticeSent, setNoticeSent] = useState<number | null>(null);
  // ③ 할 일 체크 — 서랍·운영 할 일과 같은 쓰기. 누가 체크할 수 있는지는 서버(`patchTodo`)가 정한다
  const todoWrite = useDrawerWrite();
  const [todoError, setTodoError] = useState<string | null>(null);
  const d = q.data;
  const toggleTask = (id: number, done: boolean) => {
    setTodoError(null);
    todoWrite.mutate({ kind: 'todo', id, done }, { onError: (e) => setTodoError(apiMessage(e)) });
  };

  const [tab, setTab] = useState<Tab>('minutes');
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('');
  const [toId, setToId] = useState('');
  const [dueOn, setDueOn] = useState('');

  // 회의를 바꿔 열면 초안을 그 회의 것으로 갈아 끼운다 — 남의 속기록 위에 쓰지 않는다
  useEffect(() => { setDraft(d?.minutes ?? ''); }, [d?.id, d?.minutes]);
  useEffect(() => { setTab('minutes'); setTitle(''); setToId(''); setDueOn(''); setNoticeSent(null); }, [meetingId]);

  const insert = (word: string) => setDraft((v) => (v.endsWith('\n') || v === '' ? `${v}${word}\n` : `${v}\n${word}\n`));

  // 바닥 줄 — 원문 §66 그대로: 왼쪽 「일정 보기」 · 「안내 보내기」, 오른쪽 「닫기」 · 「속기록 저장」 (§65 와 달리 §66 컷에는 「닫기」가 있다)
  // 참석자로만 여는 사람(운영 권한 없음)에게는 쓰기 단추가 서지 않는다 — 서버의 canEdit (D-R39)
  const footer = d ? (
    <>
      <div className="mr-auto flex flex-wrap items-center gap-2">
        {/* 그 날의 시간표로 간다 (66-5) — 날짜가 없는 옛 회의는 시간표 첫 화면 */}
        <LinkButton href={d.onDate ? `/schedule?date=${d.onDate}` : '/schedule'} variant="secondary">일정 보기</LinkButton>
        {d.canEdit ? (
          <Button
            variant="primary"
            disabled={!d.canSendNotice || notice.isPending}
            title={d.noticeBlockedReason ?? '참석자에게 회의 이름 · 일시 · 장소를 알림으로 보냅니다'}
            onClick={() => {
              setNoticeSent(null);
              notice.mutate({ id: d.id }, { onSuccess: (r) => setNoticeSent(r.sent) });
            }}
          >
            {notice.isPending ? '보내는 중…' : '안내 보내기'}
          </Button>
        ) : null}
      </div>
      <Button variant="secondary" onClick={onClose}>닫기</Button>
      {d.canEdit ? (
        <Button
          variant="primary"
          disabled={save.isPending || draft.trim() === '' || draft === (d.minutes ?? '')}
          onClick={() => save.mutate({ id: d.id, minutes: draft })}
        >
          속기록 저장
        </Button>
      ) : null}
    </>
  ) : null;

  /* 부제 — 「18:30–19:30 · 김범준, Allissa, KJ, Sophia · 6호」 (66-2). 시각·자리는 서버 값, 이름은 참석 줄 그대로 */
  const sub = d ? [
    d.title,
    d.startMin != null && d.endMin != null ? `${hhmm(d.startMin)}–${hhmm(d.endMin)}` : null,
    d.attendees.length ? d.attendees.map((a) => a.name).join(', ') : null,
    d.placeLabel,
  ].filter(Boolean).join(' · ') : undefined;

  return (
    <WideDialog open={meetingId !== null} onClose={onClose} title={d?.mtTypeLabel ?? '회의'}
      head={d?.onDate ? <Chip size="compact" styleKind="solid" tone="warning">{monthDayLabel(d.onDate)}</Chip> : null}
      sub={sub || undefined}
      footer={footer}
    >
      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner> : null}
      {q.isError ? <Banner tone="danger">{apiMessage(q.error)}</Banner> : null}

      {d ? (
        <div className="flex flex-col gap-3">
          {noticeSent !== null ? (
            <Banner tone="success"><p role="status">참석자 {noticeSent}명에게 안내를 보냈습니다.</p></Banner>
          ) : null}
          {notice.isError ? <Banner tone="danger">{apiMessage(notice.error)}</Banner> : null}

          <section>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              {/* 「참석 N/M 확인」은 서버가 센다 — 화면이 칩을 세지 않는다 (D-R37) */}
              <h3 className="text-[12px] font-bold text-fg">{d.attendLabel}</h3>
              {/* 내 응답 — 참석자 본인만 · 자기 줄만 바뀐다(대리 입력 없음 · N-32). 답하지 않으면 「응답 대기」 그대로 */}
              {d.canRespond && d.myAttend ? (
                <div className="flex items-center gap-1.5" role="group" aria-label="내 참석 응답">
                  <span className="text-[11px] text-fg-subtle">내 응답</span>
                  <Button size="sm" variant={d.myAttend.state === 'in' ? 'success' : 'secondary'}
                    aria-pressed={d.myAttend.state === 'in'} disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: d.id, confirmed: true })}>참석</Button>
                  <Button size="sm" variant={d.myAttend.state === 'out' ? 'dark' : 'secondary'}
                    aria-pressed={d.myAttend.state === 'out'} disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: d.id, confirmed: false })}>불참</Button>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-line bg-bg-2 p-2">
              {d.attendees.map((a) => <AttendeeRow key={a.staffId} a={a} />)}
              {d.attendees.length === 0 ? <p className="text-[12px] text-fg-subtle">참석자가 없습니다</p> : null}
            </div>
            {respond.isError ? <Banner tone="danger" className="mt-2">{apiMessage(respond.error)}</Banner> : null}
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
                {/* 원문 「속기록 *」 — 비우고는 저장하지 않는다 (66-4) */}
                <Label htmlFor="mt-minutes">속기록 <span className="text-red">*</span></Label>
                {/* 안내 문구도 서버가 준 것이다 — 회의마다 머리말이 제각각이 되지 않게 */}
                <span className="text-[11px] text-fg-subtle">{d.minutesHint}</span>
              </div>
              {/* 참석자로만 여는 사람은 읽기만 한다 — 저장 경로는 운영 권한이 지킨다 */}
              <Textarea id="mt-minutes" aria-label="속기록" aria-required rows={10} maxLength={8000} value={draft}
                readOnly={!d.canEdit} onChange={(e) => setDraft(e.target.value)} />
              {d.canEdit ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {/* 원문 §66 머리말 단추는 흰 바탕 · 테두리다 (W11 재대조) */}
                  {d.minutesTemplates.map((w) => (
                    <Button key={w} size="sm" variant="secondary" onClick={() => insert(w)}>{w}</Button>
                  ))}
                </div>
              ) : null}
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
                  <ul className="flex flex-col gap-1">
                    {d.tasks.map((t) => <TaskRow key={t.id} t={t} busy={todoWrite.isPending} onToggle={toggleTask} />)}
                  </ul>
                </>
              )}
              {todoError ? <Banner tone="danger" className="mt-2">{todoError}</Banner> : null}

              {d.canEdit ? (
                <>
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
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </WideDialog>
  );
}
