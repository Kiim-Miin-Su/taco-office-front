/** @file-guide
 * 목적: 강사 홈·캘린더·직접 URL이 공유하는 회차별 업무 진입점
 * 책임/재사용: 회차 identity와 가능한 이동만 표시하고 실제 상세·리포트 상태는 기존 owner가 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import Link from 'next/link';
import type { Occurrence } from '@/api/types';
import { hhmm, label } from '@/lib/calendar';
import { Button, Chip, Dialog } from '@/components/ui';

const REPORT_OPENABLE = new Set(['none', 'draft', 'wait', 'ok', 'rej']);

export function TeacherLessonHub({ occ, kindName, subName, onReport, onLesson, onClose }: {
  occ: Occurrence;
  kindName?: string;
  subName?: string;
  onReport: () => void;
  onLesson: () => void;
  onClose: () => void;
}) {
  const canReport = !occ.canceled && occ.attendance?.countsForPay !== false && REPORT_OPENABLE.has(occ.repState);
  const students = occ.students.filter((student) => !student.droppedOnce).map((student) => student.name).join(' · ');
  const exactContractMissing = '회차를 정확히 여는 계약이 아직 없습니다. 전체 화면에서 확인해 주세요.';

  return (
    <Dialog open onClose={onClose} title="수업 허브" sub={`${label(occ.date)} · ${hhmm(occ.startMin)}–${hhmm(occ.endMin)}`} closeX width={620}>
      <div className="flex flex-col gap-4 pt-4">
        <div className="rounded-xl border border-line bg-inset p-4">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-[15px] text-fg">{subName ?? occ.title ?? kindName ?? '수업'}</b>
            <Chip>{kindName ?? '일정'}</Chip>
          </div>
          <p className="mt-1 text-[12px] text-fg-2">{students || '학생 미정'} · {occ.mode === 'online' ? '비대면' : '대면'}</p>
          {occ.date !== occ.onDate ? <p className="mt-1 text-[11px] text-fg-subtle">원래 회차일 {occ.onDate} · 실제 수업일 {occ.date}</p> : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="primary" className="min-h-11" aria-label="리포트 열기" disabled={!canReport}
            title={canReport ? '이 회차의 리포트를 엽니다' : '예정·취소·비대상 수업은 리포트를 열 수 없습니다'} onClick={onReport}>
            리포트
          </Button>
          <Button className="min-h-11" aria-label="수업 정보 열기" onClick={onLesson}>수업 정보</Button>
          <Button className="min-h-11" aria-label="수업 안내 열기" disabled title={exactContractMissing}>수업 안내</Button>
          <Button className="min-h-11" aria-label="학생 이력 열기" disabled title={exactContractMissing}>학생 이력</Button>
        </div>
        <p className="text-[11px] text-fg-subtle">수업 안내·학생 이력은 {exactContractMissing}</p>
        <Link href="/teacher/suggestions" aria-label="건의 사항 열기"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-3 text-[13px] font-bold text-fg hover:bg-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg">
          건의 사항
        </Link>
      </div>
    </Dialog>
  );
}
