/** @file-guide
 * 목적: AttendanceControl.tsx — AttendanceControl (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 회차 출결 현재값 — Figma `M2_v3 · 출결 확정`의 선택 구조를 공용 UI로 옮긴다.
 * 권한·시각은 다시 계산하지 않고 서버 `attendanceMode`만 소비한다 (D-R35).
 *
 * **출결 취소와 휴강은 다르다**(N-48 채택) — 출결 「취소」는 강사료 축(시수·페이)만 정하고 학생 청구는 건드리지 않는다.
 * 청구에서 빼려면 휴강 창(사유 · 처리)을 따로 거친다. 그래서 「취소」를 고르면 그 한 줄과 휴강 창을 여는 단추를 둔다 —
 * 추정으로 회차를 접지 않는다(이 화면은 휴강을 쓰지 않는다).
 */
'use client';
import { useEffect, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useAttendanceWrite } from '@/api/queries';
import type {
  Attendance, AttendanceCancelReason, AttendanceResult, AttendanceWrite, Occurrence,
} from '@/api/types';
import { hhmm } from '@/lib/calendar';
import { Button, Checkbox, Chip, ConflictGuard, Dialog } from '../ui';

const CANCEL_REASONS: Array<{ value: AttendanceCancelReason; label: string }> = [
  { value: 'teacher_absent', label: '강사 결강' },
  { value: 'student_absent', label: '학생 결석' },
  { value: 'academy', label: '학원 사정' },
  { value: 'holiday', label: '공휴일' },
  { value: 'other', label: '기타' },
];

const REASON_LABEL = Object.fromEntries(
  CANCEL_REASONS.map((x) => [x.value, x.label]),
) as Record<AttendanceCancelReason, string>;

function confirmedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export function AttendanceControl({ occ, onOpenCancel }: {
  occ: Occurrence;
  /** 휴강 창을 연다 — 부르는 쪽이 휴강을 쓸 수 있을 때만 준다(없으면 안내 줄만 선다) */
  onOpenCancel?: () => void;
}) {
  const write = useAttendanceWrite();
  const [attendance, setAttendance] = useState<Attendance | null>(occ.attendance);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<AttendanceResult>(occ.attendance?.result ?? 'completed');
  const [reason, setReason] = useState<AttendanceCancelReason | ''>(occ.attendance?.reason ?? '');
  const [lateStudentIds, setLateStudentIds] = useState<number[]>(
    occ.attendance?.lateStudents.map((student) => student.studentId) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAttendance(occ.attendance);
    setResult(occ.attendance?.result ?? 'completed');
    setReason(occ.attendance?.reason ?? '');
    setLateStudentIds(occ.attendance?.lateStudents.map((student) => student.studentId) ?? []);
    setError(null);
    setOpen(false);
  }, [occ.serId, occ.onDate, occ.attendance]);

  const showDialog = () => {
    setResult(attendance?.result ?? 'completed');
    setReason(attendance?.reason ?? '');
    setLateStudentIds(attendance?.lateStudents.map((student) => student.studentId) ?? []);
    setError(null);
    setOpen(true);
  };

  const save = () => {
    if (result === 'canceled' && !reason) return;
    setError(null);
    const body: AttendanceWrite = result === 'completed'
      // 빈 배열도 보낸다. 정정 창에서 모두 해제한 것은 기존 지각 명단을 유지하라는 생략과 다르다.
      ? { result, lateStudentIds }
      : { result, reason: reason as AttendanceCancelReason };
    write.mutate(
      {
        action: 'save', serId: occ.serId, onDate: occ.onDate,
        body,
      },
      {
        onSuccess: (saved) => { setAttendance(saved.attendance); setOpen(false); },
        onError: (e) => setError(apiMessage(e)),
      },
    );
  };

  const clear = () => {
    setError(null);
    write.mutate(
      { action: 'clear', serId: occ.serId, onDate: occ.onDate },
      {
        onSuccess: () => { setAttendance(null); setOpen(false); },
        onError: (e) => setError(apiMessage(e)),
      },
    );
  };

  if (occ.attendanceMode === 'unavailable') {
    return (
      <section>
        <h3 className="mb-2 text-[12px] font-bold text-fg">출결</h3>
        <div className="rounded-lg border border-line bg-inset p-3 text-[11px] text-fg-subtle">
          {occ.canceled ? '휴강·취소된 일정에는 출결이 없습니다.' : '수업이 끝난 뒤 출결을 확정할 수 있습니다.'}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold text-fg">출결</h3>
        {attendance ? (
          <Chip tone={attendance.result === 'completed' ? 'success' : 'danger'}>
            {attendance.result === 'completed' ? '완료' : '취소'}
          </Chip>
        ) : <Chip tone="warning">미확정</Chip>}
      </div>

      <div className="rounded-lg border border-line p-3">
        {attendance ? (
          <>
            <p className="text-[12px] font-bold text-fg">
              {attendance.result === 'completed'
                ? '수업 완료로 확정되었습니다.'
                : `수업 취소 · ${REASON_LABEL[attendance.reason!]}`}
            </p>
            <p className="mt-1 text-[11px] text-fg-subtle">
              {attendance.confirmedByName} · {confirmedAt(attendance.confirmedAt)} 확정
            </p>
            <p className="mt-1 text-[11px] font-bold text-fg-2">
              {attendance.countsForPay ? '정산 기준 · 시수·페이에 포함' : '정산 기준 · 시수 0 · 페이 0'}
            </p>
            {attendance.result === 'completed' && attendance.lateStudents.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="지각 학생">
                <span className="mr-1 text-[11px] font-bold text-fg-subtle">지각</span>
                {attendance.lateStudents.map((student) => (
                  <Chip key={student.studentId} tone="warning" size="compact">{student.studentName}</Chip>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-[12px] text-fg-2">
            종료 시각이 지났지만 아직 확정되지 않았습니다.
          </p>
        )}

        {occ.attendanceMode === 'manage' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={showDialog} disabled={write.isPending}>
              {attendance ? '출결 정정' : '출결 확정'}
            </Button>
            {attendance ? (
              <Button size="sm" variant="ghost" onClick={clear} disabled={write.isPending}>초기화</Button>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-fg-subtle">출결 변경은 관리자 이상만 할 수 있습니다.</p>
        )}
        {error && !open ? <div className="mt-3"><ConflictGuard result="blocking" message={error} /></div> : null}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="출결 확정"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>닫기</Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={write.isPending || (result === 'canceled' && !reason)}
            >
              {write.isPending ? '저장 중…' : `${result === 'completed' ? '완료' : '취소'}로 확정`}
            </Button>
          </>
        )}
      >
        <p className="text-[11px] text-fg-subtle">
          {occ.date} · {hhmm(occ.startMin)}–{hhmm(occ.endMin)} · {occ.title ?? occ.kindKey}
        </p>
        {!attendance ? (
          <div className="mt-3 rounded-lg border border-amber/35 bg-amber/5 p-3 text-[11px] text-fg-2">
            종료 시각이 지났지만 아직 확정되지 않았습니다.
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button" aria-pressed={result === 'completed'}
            onClick={() => { setResult('completed'); setReason(''); }}
            className={`rounded-lg border p-3 text-left ${result === 'completed' ? 'border-blue bg-blue/5' : 'border-line'}`}
          >
            <span className="text-[12px] font-bold text-fg">완료</span>
            <span className="mt-1 block text-[11px] text-fg-subtle">시수·페이에 포함됩니다.</span>
          </button>
          <button
            type="button" aria-pressed={result === 'canceled'}
            onClick={() => setResult('canceled')}
            className={`rounded-lg border p-3 text-left ${result === 'canceled' ? 'border-red bg-red/5' : 'border-line'}`}
          >
            <span className="text-[12px] font-bold text-fg">취소</span>
            <span className="mt-1 block text-[11px] text-fg-subtle">시수 0 · 페이 0의 근거 사유를 남깁니다.</span>
          </button>
        </div>

        {result === 'completed' ? (
          <div className="mt-3 rounded-lg border border-line bg-inset p-3">
            <p className="text-[11px] font-bold text-fg">지각 학생</p>
            <p className="mt-0.5 text-[10px] text-fg-subtle">출석·청구·강사료 계산은 완료 상태 그대로 유지됩니다.</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {occ.students.map((student) => {
                const inactive = student.droppedOnce || student.paused;
                return (
                  <Checkbox
                    key={student.id}
                    label={`${student.name}${student.grade ? ` · ${student.grade}` : ''}${student.droppedOnce ? ' · 그날 빠짐' : student.paused ? ' · 휴원' : ''}`}
                    checked={lateStudentIds.includes(student.id)}
                    // 빠짐·휴원 학생을 새로 지각 처리하지 않되, 이미 기록된 값은 정정할 수 있어야 한다.
                    disabled={write.isPending || (inactive && !lateStudentIds.includes(student.id))}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setLateStudentIds((current) => checked
                        ? [...current, student.id]
                        : current.filter((id) => id !== student.id));
                    }}
                  />
                );
              })}
              {occ.students.length === 0 ? <span className="text-[11px] text-fg-subtle">표시할 학생이 없습니다.</span> : null}
            </div>
          </div>
        ) : null}

        {result === 'canceled' ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-inset p-2.5 text-[11px] text-fg-2"
            data-attendance-bill-note>
            <span className="min-w-0 flex-1">
              <b className="text-fg">청구는 휴강 창에서</b> — 출결 취소는 강사료만 정합니다. 학생 청구에서 빼려면 휴강 창에서 사유와 처리를 고릅니다.
            </span>
            {onOpenCancel ? (
              <Button size="sm" variant="secondary" onClick={() => { setOpen(false); onOpenCancel(); }}>
                휴강 창 열기
              </Button>
            ) : null}
          </div>
        ) : null}

        {result === 'canceled' ? (
          <div className="mt-3">
            <p className="mb-2 text-[11px] font-bold text-fg-subtle">취소 사유</p>
            <div className="flex flex-wrap gap-2">
              {CANCEL_REASONS.map((item) => (
                <Button
                  key={item.value}
                  size="sm"
                  variant={reason === item.value ? 'dark' : 'secondary'}
                  aria-pressed={reason === item.value}
                  onClick={() => setReason(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {error ? <div className="mt-3"><ConflictGuard result="blocking" message={error} /></div> : null}
        <p className="mt-4 text-[10px] text-fg-subtle">확정자·시각과 모든 정정 이력이 기록됩니다.</p>
      </Dialog>
    </section>
  );
}
