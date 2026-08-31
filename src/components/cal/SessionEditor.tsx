/**
 * Overlay/Session Editor — 빈 칸에서 새 일정 (C-5 · CALENDAR §5).
 *
 * **새 일정은 범위를 묻지 않는다** — 만들어지는 것은 언제나 새 `SER` 하나다.
 * 겹침은 서버(DB EXCLUDE)가 거절하고, 여기는 그 답을 그대로 보여 준다 (D-R43).
 * 코드값(kind·sub·강사·강의실)은 전부 코드표(meta)에서 온다 — 화면이 지어내지 않는다 (D-R18).
 */
'use client';
import { useForm } from 'react-hook-form';
import { Button, ConflictGuard, Dialog, Input, Label, Select, Chip } from '../ui';
import { KO_DOW, buildRrule, parseHm } from '@/lib/calendar';
import { useScheduleWrite } from '@/api/queries';
import { apiMessage } from '@/api/client';
import { useState } from 'react';
import type { Meta } from '@/api/types';

export interface SessionDraft {
  date: string;
  startMin: number;
  roomId: number | null;
}

interface FormShape {
  kindKey: string;
  subKey: string;
  mode: 'offline' | 'online';
  start: string;
  end: string;
  teacherId: string;
  roomId: string;
  title: string;
  /** 비면 단발(ONCE) — 요일을 고르면 매주 반복 */
  days: number[];
  studentIds: number[];
}

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function SessionEditor({ draft, meta, onClose }: {
  draft: SessionDraft | null;
  meta?: Meta;
  onClose: () => void;
}) {
  const write = useScheduleWrite();
  const [err, setErr] = useState<string | null>(null);
  const f = useForm<FormShape>({
    // values 가 아직 없을 첫 렌더에도 배열 필드가 비어 있어야 한다 — undefined.includes 로 죽는 자리
    defaultValues: {
      kindKey: 'class', subKey: '', mode: 'offline', start: '10:00', end: '11:00',
      teacherId: '', roomId: '', title: '', days: [], studentIds: [],
    },
    values: draft
      ? {
          kindKey: 'class', subKey: '', mode: 'offline',
          start: hm(draft.startMin), end: hm(Math.min(24 * 60 - 1, draft.startMin + 60)),
          teacherId: '', roomId: draft.roomId === null ? '' : String(draft.roomId),
          title: '', days: [], studentIds: [],
        }
      : undefined,
  });
  if (!draft) return null;

  const days = f.watch('days') ?? [];
  const students = f.watch('studentIds') ?? [];
  const toggle = (name: 'days' | 'studentIds', v: number) => {
    const cur = f.getValues(name) as number[];
    f.setValue(name, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };

  const submit = f.handleSubmit((v) => {
    setErr(null);
    const startMin = parseHm(v.start);
    const endMin = parseHm(v.end);
    if (startMin === null || endMin === null) { setErr('시각은 HH:MM 으로 적어 주세요'); return; }
    if (endMin - startMin < 10 || endMin - startMin > 480) { setErr('길이는 10분에서 8시간 사이여야 합니다 (§5)'); return; }
    write.mutate(
      {
        kind: 'create',
        body: {
          kindKey: v.kindKey, subKey: v.subKey || null, mode: v.mode,
          fromDate: draft.date, toDate: v.days.length ? null : draft.date,
          rrule: buildRrule(v.days), startMin, endMin,
          teacherId: v.teacherId ? Number(v.teacherId) : null,
          roomId: v.roomId ? Number(v.roomId) : null,
          title: v.title || null,
          studentIds: v.studentIds,
        },
      },
      { onError: (e) => setErr(apiMessage(e)), onSuccess: onClose },
    );
  });

  return (
    <Dialog open onClose={onClose} title={`새 일정 — ${draft.date}`} width={520}>
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
            <Select id="se-teacher" {...f.register('teacherId')}>
              <option value="">미정</option>
              {(meta?.staff ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="se-room">강의실 · 형태</Label>
            <div className="flex gap-1">
              <Select id="se-room" {...f.register('roomId')} className="flex-1">
                <option value="">미지정</option>
                {(meta?.rooms ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
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

        {err ? <ConflictGuard result="blocking" message={err} /> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" disabled={write.isPending}>
            {write.isPending ? '만드는 중…' : '만들기'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
