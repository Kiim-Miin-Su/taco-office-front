/** @file-guide
 * 목적: 강사 홈·캘린더·직접 URL이 공유하는 회차별 업무 진입점
 * 책임/재사용: 회차 identity와 가능한 이동만 표시하고 실제 상세·리포트 상태는 기존 owner가 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useId } from 'react';
import Link from 'next/link';
import type { Occurrence, TeacherLessonHub as TeacherLessonHubData } from '@/api/types';
import { hhmm, label } from '@/lib/calendar';
import { Button, Chip, Dialog } from '@/components/ui';
import { teacherScheduleChangeMode } from './TeacherScheduleChange';

export function TeacherLessonHub({ occ, hub, loading, errorMessage, today, kindName, subName, focusScheduleChange = false,
  onReport, onLesson, onGuide, onHistory, onScheduleChange, onClose }: {
  occ: Occurrence;
  hub?: TeacherLessonHubData;
  loading: boolean;
  errorMessage?: string;
  today: string;
  kindName?: string;
  subName?: string;
  focusScheduleChange?: boolean;
  onReport: () => void;
  onLesson: () => void;
  onGuide: () => void;
  onHistory: () => void;
  onScheduleChange: () => void;
  onClose: () => void;
}) {
  const students = occ.students.filter((student) => !student.droppedOnce).map((student) => student.name).join(' · ');
  const capabilities = hub?.capabilities;
  const changeMode = teacherScheduleChangeMode(today, occ.date);
  const scheduleChangeId = useId();
  useEffect(() => {
    if (focusScheduleChange) document.getElementById(scheduleChangeId)?.focus({ preventScroll: true });
  }, [focusScheduleChange, scheduleChangeId]);

  return (
    <Dialog open onClose={onClose} title="수업 허브" sub={`${label(occ.date)} · ${hhmm(occ.startMin)}–${hhmm(occ.endMin)}`} closeX width={620}>
      <div className="flex flex-col gap-4 pt-4">
        <div className="rounded-xl border border-line bg-inset p-4">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-[15px] text-fg">{subName ?? occ.title ?? kindName ?? '수업'}</b>
            <Chip>{kindName ?? '일정'}</Chip>
          </div>
          <p className="mt-1 text-[12px] text-fg-2">{students || '학생 미정'} · {occ.mode === 'online' ? '비대면' : '대면'}</p>
          {occ.date !== occ.onDate ? <p className="mt-1 text-[12px] text-fg-subtle">원래 회차일 {occ.onDate} · 실제 수업일 {occ.date}</p> : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="primary" className="min-h-11" aria-label="리포트 열기" disabled={!capabilities?.report.enabled}
            title={capabilities?.report.enabled ? '이 회차의 리포트를 엽니다' : capabilities?.report.reason ?? '회차 권한을 확인하는 중입니다'} onClick={onReport}>
            리포트
          </Button>
          <Button className="min-h-11" aria-label="수업 정보 열기" onClick={onLesson}>수업 정보</Button>
          <Button className="min-h-11" aria-label="수업 안내 열기" disabled={!capabilities?.guide.enabled}
            title={capabilities?.guide.enabled ? '이 회차의 학생 안내를 엽니다' : capabilities?.guide.reason ?? '회차 권한을 확인하는 중입니다'} onClick={onGuide}>수업 안내</Button>
          <Button className="min-h-11" aria-label="학생 이력 열기" disabled={!capabilities?.history.enabled}
            title={capabilities?.history.enabled ? '이 회차 학생의 수업 이력을 엽니다' : capabilities?.history.reason ?? '회차 권한을 확인하는 중입니다'} onClick={onHistory}>학생 이력</Button>
        </div>
        {loading ? <p role="status" className="text-[12px] text-fg-subtle">회차 권한과 안내를 확인하는 중…</p> : null}
        {errorMessage ? <p role="alert" className="text-[12px] text-red">{errorMessage}</p> : null}
        <Button className="min-h-11" variant="primary"
          id={scheduleChangeId}
          disabled={!capabilities?.scheduleChange.enabled}
          title={capabilities?.scheduleChange.reason ?? undefined}
          aria-label={changeMode === 'request' ? '일정 변경 요청 열기' : '이 수업으로 건의 열기'}
          onClick={onScheduleChange}>
          {changeMode === 'request' ? '일정 변경 요청' : '이 수업으로 건의'}
        </Button>
        <Link href="/teacher/suggestions" aria-label="건의 사항 열기"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-3 text-[13px] font-bold text-fg hover:bg-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">
          건의 사항
        </Link>
      </div>
    </Dialog>
  );
}
