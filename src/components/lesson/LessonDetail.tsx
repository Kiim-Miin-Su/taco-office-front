/**
 * §12 수업 상세 — 준비 8단계.
 *
 * 일정 확정 → 강사 → 강의실/줌 → 교재 → 안내 → 줌 안내 → 리포트 → 피드백
 *
 * **모달·버튼·범위 선택을 새로 만들지 않는다.** 서랍은 `Drawer`, 버튼은 `Button`,
 * 반복 범위는 `RecurrenceScope`, 겹침 안내는 `ConflictGuard` 를 그대로 쓴다 —
 * 같은 모양을 두 번 만들면 한쪽만 고쳐진다 (`AGENT.md §6.0`).
 *
 * 이 화면이 저장할 때 부르는 것은 `useScheduleWrite` 하나다. 3범위 판정은 서버가 한다.
 */
'use client';
import { useState } from 'react';
import { Button, Chip, ConflictGuard, Drawer, RecurrenceScope, Select } from '../ui';
import { hhmm } from '@/lib/calendar';
import { useScheduleWrite } from '@/api/queries';
import { apiMessage } from '@/api/client';
import { useCan } from '@/store/useSession';
import type { Occurrence, RosterPatch, Scope } from '@/api/types';

/** 준비 8단계 — 명세서 §12. 순서가 곧 화면의 순서다. */
const STEPS = [
  { key: 'fixed', label: '일정 확정' },
  { key: 'teacher', label: '강사' },
  { key: 'place', label: '강의실 · 줌' },
  { key: 'book', label: '교재' },
  { key: 'guide', label: '안내' },
  { key: 'zoom', label: '줌 안내' },
  { key: 'report', label: '리포트' },
  { key: 'feedback', label: '피드백' },
] as const;

/** 무엇이 됐는지는 회차가 이미 들고 있다 — 화면이 다시 판정하지 않는다 (D-R4) */
function doneOf(o: Occurrence): Record<string, boolean | null> {
  return {
    fixed: true,
    teacher: o.teacherId !== null,
    place: o.mode === 'online' ? o.zaccId !== null : o.roomId !== null,
    book: null,      // 현황판이 clChk() 로 판정한다 — 여기서는 모른다고 적는다
    guide: null,
    zoom: o.mode === 'online' ? null : null,
    report: o.written,
    feedback: null,
  };
}

export interface LessonDetailProps {
  occ: Occurrence | null;
  /** 종류 이름 — 코드표에서 온다. `class` 같은 코드값을 화면에 찍지 않는다 (D-R18) */
  kindName?: string;
  subName?: string;
  /** 반복 수업이면 범위를 묻는다. 단발이면 묻지 않는다 (D-R16) */
  recurring?: boolean;
  /** 명단에 넣을 수 있는 전체 학생 — 코드표(meta)에서 온다 */
  allStudents?: Array<{ id: number; name: string; grade?: string | null }>;
  onClose: () => void;
}

export function LessonDetail({ occ, kindName, subName, recurring = true, allStudents, onClose }: LessonDetailProps) {
  const write = useScheduleWrite();
  const canEdit = useCan('canCrudAll');
  const [ask, setAsk] = useState<null | { mode: 'edit' | 'delete'; run: (s: Scope) => void }>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState('');

  if (!occ) return null;
  const done = doneOf(occ);

  /**
   * 수강 학생은 3범위가 아니라 **2범위**다 — 다이얼로그 없이 줄 버튼으로 바로 간다
   * (§5A.7 「확인창을 쓰지 않는다」 · D-R21). 판정과 명단 계산은 서버가 한다.
   */
  const roster = (op: RosterPatch['op'], studentId: number) => {
    setErr(null);
    write.mutate(
      { kind: 'roster', serId: occ.serId, body: { op, onDate: occ.onDate, studentId } },
      { onError: (e) => setErr(apiMessage(e)) },
    );
  };
  const enrolled = new Set(occ.students.map((st) => st.id));
  const addable = (allStudents ?? []).filter((st) => !enrolled.has(st.id));

  /** 반복이면 범위를 먼저 묻고, 단발이면 바로 'this' 로 보낸다 */
  const withScope = (mode: 'edit' | 'delete', run: (s: Scope) => void) => {
    setErr(null);
    if (!recurring) { run('this'); return; }
    setAsk({ mode, run });
  };

  const cancel = () =>
    withScope('delete', (scope) => {
      write.mutate(
        { kind: 'delete', serId: occ.serId, body: { scope, onDate: occ.onDate } },
        { onError: (e) => setErr(apiMessage(e)), onSuccess: onClose },
      );
      setAsk(null);
    });

  return (
    <>
      <Drawer
        open={!!occ}
        onClose={onClose}
        title={`${occ.title || subName || kindName || occ.kindKey} · ${occ.date}`}
        sub={kindName && kindName !== occ.title ? kindName : undefined}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="info">{hhmm(occ.startMin)}–{hhmm(occ.endMin)}</Chip>
            {occ.mode === 'online' ? <Chip tone="purple">온라인</Chip> : <Chip>{occ.roomName ?? '강의실 미정'}</Chip>}
            <Chip>{occ.teacherName ?? '강사 미정'}</Chip>
            {occ.canceled ? <Chip tone="danger">취소</Chip> : null}
            {occ.hasException ? <Chip tone="warning">이 회차만 다름</Chip> : null}
          </div>

          <section>
            <h3 className="mb-2 text-[12px] font-bold text-fg">준비 8단계</h3>
            <ol className="flex flex-col gap-1">
              {STEPS.map((s, i) => {
                const v = done[s.key];
                return (
                  <li key={s.key} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                    <span className="w-4 text-[11px] text-fg-subtle">{i + 1}</span>
                    <span className="flex-1 text-[12px] text-fg">{s.label}</span>
                    {v === null
                      ? <span className="text-[11px] text-fg-subtle">현황판에서 판정</span>
                      : <Chip tone={v ? 'success' : 'danger'}>{v ? '됨' : '안 됨'}</Chip>}
                  </li>
                );
              })}
            </ol>
          </section>

          <section>
            <h3 className="mb-2 text-[12px] font-bold text-fg">
              수강 학생 {occ.students.filter((s) => !s.droppedOnce).length}명
              {occ.students.some((s) => s.droppedOnce)
                ? <span className="ml-1 text-fg-subtle">· 그날 빠짐 {occ.students.filter((s) => s.droppedOnce).length}</span>
                : null}
            </h3>
            <div className="flex flex-col gap-1">
              {/* 그날만 빠진 학생은 지우지 않고 회색으로 남긴다 (D-R21) */}
              {occ.students.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                  <Chip tone={s.droppedOnce ? 'neutral' : 'info'}>
                    {s.droppedOnce ? <s>{s.name}</s> : s.name}
                  </Chip>
                  {s.droppedOnce ? <span className="text-[11px] text-fg-subtle">그날 빠짐</span> : null}
                  {canEdit ? (
                    <span className="ml-auto flex gap-1">
                      {s.droppedOnce ? (
                        <Button size="sm" variant="ghost" disabled={write.isPending}
                          onClick={() => roster('undoOnce', s.id)}>되돌리기</Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={write.isPending}
                          title="이 회차에서만 뺍니다 — 다음 주는 그대로 (D-R21)"
                          onClick={() => roster('dropOnce', s.id)}>이 회차만 빼기</Button>
                      )}
                      <Button size="sm" variant="danger" disabled={write.isPending}
                        title="모든 회차에서 뺍니다"
                        onClick={() => roster('dropAll', s.id)}>아주 빼기</Button>
                    </span>
                  ) : null}
                </div>
              ))}
              {occ.students.length === 0 ? <span className="text-[12px] text-fg-subtle">명단이 없습니다</span> : null}

              {canEdit && addable.length ? (
                <div className="mt-1 flex items-center gap-2">
                  <Select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1">
                    <option value="">학생 넣기…</option>
                    {addable.map((st) => (
                      <option key={st.id} value={st.id}>{st.name}{st.grade ? ` · ${st.grade}` : ''}</option>
                    ))}
                  </Select>
                  <Button size="sm" disabled={!pick || write.isPending}
                    onClick={() => { roster('add', Number(pick)); setPick(''); }}>
                    넣기
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          {err ? <ConflictGuard result="blocking" message={err} /> : null}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button variant="danger" onClick={cancel} disabled={write.isPending}>
              {write.isPending ? '처리 중…' : '휴강 · 취소'}
            </Button>
          </div>
        </div>
      </Drawer>

      <RecurrenceScope
        open={!!ask}
        mode={ask?.mode ?? 'edit'}
        onPick={(s) => ask?.run(s)}
        onClose={() => setAsk(null)}
      />
    </>
  );
}

