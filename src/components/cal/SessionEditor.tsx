/** @file-guide
 * 목적: SessionEditor.tsx — SessionDraft, SessionEdit, SessionEditor (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * Overlay/Session Editor — 빈 칸에서 새 일정 (C-5 · CALENDAR §5) · 수업 상세의 「일정 수정」(원문 §12).
 *
 * **새 일정은 범위를 묻지 않는다** — 만들어지는 것은 언제나 새 `SER` 하나다.
 * **일정 수정은 반복이면 저장 직전 한 번 범위를 묻는다** — 드래그 이동과 같은 `RecurrenceScope` 다 (D-R16).
 * 겹침은 서버(DB EXCLUDE)가 거절하고, 여기는 그 답을 그대로 보여 준다 (D-R43).
 * 코드값(kind·sub·강사·강의실)은 전부 코드표(meta)에서 온다 — 화면이 지어내지 않는다 (D-R18).
 */
'use client';
import { useForm } from 'react-hook-form';
import { Banner, Button, Chip, ConflictGuard, Dialog, Input, Label, RecurrenceScope, Select } from '../ui';
import { KO_DOW, buildRrule, conflictLines, lessonTimeIssue, parseHm } from '@/lib/calendar';
import { fetchConflicts, useScheduleWrite } from '@/api/queries';
import { apiMessage, isConflict } from '@/api/client';
import { useState } from 'react';
import type { Meta, Occurrence, OccurrencePatch, Scope, WriteResult } from '@/api/types';

export interface SessionDraft {
  date: string;
  startMin: number;
  /** 빈 칸 드래그가 고른 끝. 클릭 진입은 호출자가 기본 1시간을 넣는다. */
  endMin: number;
  roomId: number | null;
  /**
   * 개인표에서 열면 **그 사람이 미리 들어간다** — 원문 §10·§11 본문
   * 「일정 추가 시 학생(강사)이 자동으로 채워집니다」. 누구를 넣을지는 부르는 쪽(고른 개인표)이 정한다.
   */
  studentIds?: number[];
  teacherId?: number | null;
}

/**
 * 「일정 수정」 대상 — 캐시의 최신 회차와 창 제목에 쓸 이름.
 * 이름은 수업 상세 머리와 같은 것을 받는다 — 두 곳이 각자 지으면 같은 수업이 두 이름이 된다.
 */
export interface SessionEdit {
  occ: Occurrence;
  name: string;
}

interface FormShape {
  kindKey: string;
  subKey: string;
  mode: 'offline' | 'online';
  /** 편집에서만 쓴다 — 다른 날로 옮길 때 (OccurrencePatchDto.date) */
  date: string;
  start: string;
  end: string;
  teacherId: string;
  roomId: string;
  title: string;
  /** 비면 단발(ONCE) — 요일을 고르면 매주 반복 */
  days: number[];
  studentIds: number[];
}

/** PATCH 본문에서 범위·원래 날짜를 뺀 것 — 무엇을 바꾸는지는 창이, 어디까지는 사람이 정한다 */
type EditPatch = Omit<OccurrencePatch, 'scope' | 'onDate'>;

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const idOrNull = (v: string): number | null => (v ? Number(v) : null);

/**
 * 편집 폼 → PATCH 에 실을 것 — **바뀐 칸만** 싣는다 (`movePatch` 와 같은 규약).
 * 안 바뀐 칸까지 실으면 「향후·모두」에서 이 회차에만 있던 예외가 규칙값으로 덮인다.
 * 강사·강의실의 빈 값은 「미정」이라는 뜻이라 null 을 그대로 싣는다 (계약이 허용한다).
 */
function editPatch(occ: Occurrence, v: { date: string; startMin: number; endMin: number; teacherId: number | null; roomId: number | null }): EditPatch {
  const out: EditPatch = {};
  if (v.date !== occ.date) out.date = v.date;
  // 시각은 짝이다 — 한쪽만 보내면 서버가 나머지를 규칙값으로 읽어 길이가 바뀐다
  if (v.startMin !== occ.startMin || v.endMin !== occ.endMin) {
    out.startMin = v.startMin;
    out.endMin = v.endMin;
  }
  if (v.teacherId !== (occ.teacherId ?? null)) out.teacherId = v.teacherId;
  if (v.roomId !== (occ.roomId ?? null)) out.roomId = v.roomId;
  return out;
}

export function SessionEditor({ draft, edit, meta, onClose, onCreated, onSaved }: {
  draft?: SessionDraft | null;
  /** 주면 편집 모드다 — 수업 상세의 「일정 수정」 (원문 §12) */
  edit?: SessionEdit | null;
  meta?: Meta;
  onClose: () => void;
  onCreated?: (result: WriteResult) => void;
  /** 편집이 저장됐다 — 되돌리기 토큰이 든 결과를 부르는 쪽에 넘긴다 (N-138) */
  onSaved?: (result: WriteResult) => void;
}) {
  const write = useScheduleWrite();
  const [err, setErr] = useState<string | null>(null);
  /**
   * 겹침(409)일 때만 `ConflictGuard` 로 보인다 — 그 창은 「강행할 수 없습니다 · 시간이나 자원을 바꿔 주세요」를
   * 붙이므로, 날짜 누락·바뀐 것 없음·없는 회차 같은 오류에 붙으면 틀린 안내가 된다.
   */
  const [conflict, setConflict] = useState(false);
  /** 반복 수업 편집이 범위를 기다리는 중 — 고르기 전에는 아무것도 보내지 않는다 */
  const [askScope, setAskScope] = useState<EditPatch | null>(null);
  const occ = edit?.occ ?? null;
  const f = useForm<FormShape>({
    // values 가 아직 없을 첫 렌더에도 배열 필드가 비어 있어야 한다 — undefined.includes 로 죽는 자리
    defaultValues: {
      kindKey: 'class', subKey: '', mode: 'offline', date: '', start: '10:00', end: '11:00',
      teacherId: '', roomId: '', title: '', days: [], studentIds: [],
    },
    values: occ
      ? {
          kindKey: occ.kindKey, subKey: occ.subKey ?? '', mode: occ.mode, date: occ.date,
          start: hm(occ.startMin), end: hm(occ.endMin),
          teacherId: occ.teacherId == null ? '' : String(occ.teacherId),
          roomId: occ.roomId == null ? '' : String(occ.roomId),
          title: occ.title ?? '', days: [], studentIds: [],
        }
      : draft
        ? {
            kindKey: 'class', subKey: '', mode: 'offline', date: draft.date,
            start: hm(draft.startMin), end: hm(draft.endMin),
            teacherId: draft.teacherId == null ? '' : String(draft.teacherId),
            roomId: draft.roomId === null ? '' : String(draft.roomId),
            title: '', days: [], studentIds: draft.studentIds ?? [],
          }
        : undefined,
  });
  if (!occ && !draft) return null;

  const days = f.watch('days') ?? [];
  const students = f.watch('studentIds') ?? [];
  const toggle = (name: 'days' | 'studentIds', v: number) => {
    const cur = f.getValues(name) as number[];
    f.setValue(name, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };

  /**
   * 막혔으면 **누구와** 부딪혔는지까지 말한다 (원문 B-17·B-18 · D-R43).
   *
   * 여기 신호는 409 하나였고 그 문구는 「같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다」라
   * **상대를 말하지 않는다.** 계산은 C84-b 가 서버에 세워 뒀고 옮기기·붙여넣기는 이미 쓰고
   * 있었다 — 만들기·고치기가 같은 길을 쓴다.
   *
   * 묻는 때는 **막힌 뒤 한 번**이다. 미리 물어서 비었다고 저장을 건너뛰면 그 사이에 남이
   * 그 자리를 잡는다 — 막는 것은 DB 이고 이것은 설명이다.
   */
  const explainConflict = (e: unknown, probe: Parameters<typeof fetchConflicts>[0]) => {
    const base = apiMessage(e);
    setErr(base);
    setConflict(isConflict(e));
    if (!isConflict(e)) return;
    void fetchConflicts(probe)
      .then((rows) => {
        if (!rows.length) return;
        setErr(`${base} — ${conflictLines(rows).slice(0, 3).join(' · ')}`);
      })
      // 설명을 못 가져와도 원래 문구는 이미 서 있다 — 실패가 실패를 덮지 않는다
      .catch(() => undefined);
  };

  /** 편집 저장 — 쓰기 길은 드래그 이동과 같은 `useScheduleWrite` 의 patch 하나다 */
  const sendEdit = (target: Occurrence, body: EditPatch, scope: Scope) => {
    write.mutate(
      { kind: 'patch', serId: target.serId, body: { ...body, scope, onDate: target.onDate } },
      {
        // 놓으려던 자리 그대로 다시 묻는다 — 자기 회차는 겹침에서 뺀다
        onError: (e) => explainConflict(e, {
          date: body.date ?? target.date,
          startMin: body.startMin ?? target.startMin,
          endMin: body.endMin ?? target.endMin,
          teacherId: body.teacherId === undefined ? target.teacherId : body.teacherId,
          roomId: body.roomId === undefined ? target.roomId : body.roomId,
          exceptSerId: target.serId,
        }),
        onSuccess: (result) => { onSaved?.(result); onClose(); },
      },
    );
  };

  const submit = f.handleSubmit((v) => {
    setErr(null);
    setConflict(false);
    const startMin = parseHm(v.start);
    const endMin = parseHm(v.end);
    if (startMin === null || endMin === null) { setErr('시각은 HH:MM 으로 적어 주세요'); return; }
    const timeIssue = lessonTimeIssue(startMin, endMin);
    if (timeIssue) { setErr(timeIssue); return; }

    if (occ) {
      if (!v.date) { setErr('날짜를 골라 주세요'); return; }
      const body = editPatch(occ, {
        date: v.date, startMin, endMin, teacherId: idOrNull(v.teacherId), roomId: idOrNull(v.roomId),
      });
      if (!Object.keys(body).length) { setErr('바뀐 것이 없습니다'); return; }
      // 범위를 물을지는 서버 판정(`recurring`)이 정한다 — 단발에서 범위 창이 뜨면 버그다 (§5A.0)
      if (occ.recurring) setAskScope(body);
      else sendEdit(occ, body, 'this');
      return;
    }

    if (!draft) return;
    write.mutate(
      {
        kind: 'create',
        body: {
          kindKey: v.kindKey, subKey: v.subKey || null, mode: v.mode,
          fromDate: draft.date, toDate: v.days.length ? null : draft.date,
          rrule: buildRrule(v.days), startMin, endMin,
          teacherId: idOrNull(v.teacherId),
          roomId: idOrNull(v.roomId),
          title: v.title || null,
          studentIds: v.studentIds,
        },
      },
      {
        onError: (e) => explainConflict(e, {
          date: draft.date, startMin, endMin, teacherId: idOrNull(v.teacherId), roomId: idOrNull(v.roomId),
        }),
        onSuccess: (result) => { onCreated?.(result); onClose(); },
      },
    );
  });

  /**
   * 편집이면 **지금 값**이 목록에 없어도 고를 수 있게 둔다 — 그만둔 강사·닫은 강의실처럼 코드표에 없는
   * 값이 맡은 회차가 있다. 옵션이 없으면 select 가 빈 값을 읽어 시간만 고쳐도 「미정」으로 바꿔 보낸다.
   */
  const staff = [
    ...(occ?.teacherId != null && !(meta?.staff ?? []).some((t) => t.id === occ.teacherId)
      ? [{ id: occ.teacherId, name: occ.teacherName ?? `강사 ${occ.teacherId}` }] : []),
    ...(meta?.staff ?? []),
  ];
  const rooms = [
    ...(occ?.roomId != null && !(meta?.rooms ?? []).some((r) => r.id === occ.roomId)
      ? [{ id: occ.roomId, name: occ.roomName ?? `강의실 ${occ.roomId}` }] : []),
    ...(meta?.rooms ?? []),
  ];
  const teacherSelect = (
    <Select id="se-teacher" {...f.register('teacherId')}>
      <option value="">미정</option>
      {staff.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </Select>
  );
  const roomOptions = (
    <>
      <option value="">미지정</option>
      {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </>
  );
  const errorBox = !err ? null : conflict
    ? <ConflictGuard result="blocking" message={err} />
    : <div role="alert"><Banner tone="danger">{err}</Banner></div>;
  const footer = (label: string, busy: string) => (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onClose}>취소</Button>
      <Button type="submit" variant="primary" disabled={write.isPending}>
        {write.isPending ? busy : label}
      </Button>
    </div>
  );

  if (occ) {
    const kind = (meta?.kinds ?? []).find((k) => k.key === occ.kindKey)?.name;
    return (
      <>
        <Dialog open onClose={onClose} title={`일정 수정 — ${edit!.name} · ${occ.date}`} width={520}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            {/* 계약(OccurrencePatchDto)이 받는 칸만 고친다 — 종류·과목·반복 요일은 여기서 바꾸지 않는다 */}
            <div className="flex flex-wrap items-center gap-1.5">
              {kind ? <Chip>{kind}</Chip> : null}
              <Chip tone={occ.mode === 'online' ? 'purple' : 'neutral'}>{occ.mode === 'online' ? '온라인' : '현장'}</Chip>
              {occ.recurring ? <Chip tone="info">반복 수업 — 저장할 때 범위를 묻습니다</Chip> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label htmlFor="se-date">날짜</Label>
                <Input id="se-date" type="date" {...f.register('date')} />
              </div>
              <div>
                <Label htmlFor="se-start">시작</Label>
                <Input id="se-start" {...f.register('start')} placeholder="16:00" />
              </div>
              <div>
                <Label htmlFor="se-end">끝</Label>
                <Input id="se-end" {...f.register('end')} placeholder="17:30" />
              </div>
              <div>
                <Label htmlFor="se-teacher">강사</Label>
                {teacherSelect}
              </div>
              <div>
                <Label htmlFor="se-room">강의실</Label>
                <Select id="se-room" {...f.register('roomId')}>{roomOptions}</Select>
              </div>
            </div>
            <p className="text-[11px] text-fg-subtle">수강 학생은 수업 상세의 명단에서 넣고 뺍니다.</p>

            {errorBox}
            {footer('저장', '저장하는 중…')}
          </form>
        </Dialog>
        {/* 창이 먼저 그려지고 범위 창이 그 위에 선다 — 겹친 창의 Escape 는 맨 위 하나만 닫는다 */}
        <RecurrenceScope
          open={!!askScope}
          mode="edit"
          onPick={(scope) => {
            const body = askScope;
            setAskScope(null);
            if (body) sendEdit(occ, body, scope);
          }}
          onClose={() => setAskScope(null)}
        />
      </>
    );
  }

  return (
    <Dialog open onClose={onClose} title={`새 일정 — ${draft!.date}`} width={520}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="se-kind">종류</Label>
            <Select id="se-kind" {...f.register('kindKey')}>
              {(meta?.kinds ?? []).map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="se-sub">과목</Label>
            <Select id="se-sub" {...f.register('subKey')}>
              <option value="">—</option>
              {(meta?.subs ?? []).map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="se-start">시작</Label>
            <Input id="se-start" {...f.register('start')} placeholder="16:00" />
          </div>
          <div>
            <Label htmlFor="se-end">끝</Label>
            <Input id="se-end" {...f.register('end')} placeholder="17:30" />
          </div>
          <div>
            <Label htmlFor="se-teacher">강사</Label>
            {teacherSelect}
          </div>
          <div>
            <Label htmlFor="se-room">강의실 · 형태</Label>
            <div className="flex gap-1">
              <Select id="se-room" {...f.register('roomId')} className="flex-1">{roomOptions}</Select>
              {/* 테두리 채널(대면 실선/줌 점선)의 원천 — 강의실과 독립 축이다 (§2.3 · A26) */}
              <button type="button"
                onClick={() => f.setValue('mode', f.getValues('mode') === 'offline' ? 'online' : 'offline')}
                className="rounded-lg border border-line px-2 text-[12px] font-bold text-fg-subtle hover:border-blue">
                {f.watch('mode') === 'offline' ? '대면' : '줌'}
              </button>
            </div>
          </div>
        </div>

        <div>
          <Label>반복 — 요일을 고르면 매주, 안 고르면 이날 한 번</Label>
          <div className="mt-1 flex gap-1">
            {KO_DOW.map((d, i) => (
              <button key={d} type="button" onClick={() => toggle('days', i)}
                className={`h-8 w-8 rounded-lg border text-[12px] font-bold transition-colors ${
                  days.includes(i) ? 'border-blue bg-blue text-white' : 'border-line text-fg-subtle hover:border-blue'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>수강 학생 {students.length ? `· ${students.length}명` : ''}</Label>
          <div className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {(meta?.students ?? []).map((st) => (
              <button key={st.id} type="button" onClick={() => toggle('studentIds', st.id)}>
                <Chip tone={students.includes(st.id) ? 'info' : 'neutral'}>{st.name}</Chip>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="se-title">제목 (선택)</Label>
          <Input id="se-title" {...f.register('title')} placeholder="비우면 과목·종류 이름으로 보입니다" />
        </div>

        {errorBox}
        {footer('만들기', '만드는 중…')}
      </form>
    </Dialog>
  );
}
