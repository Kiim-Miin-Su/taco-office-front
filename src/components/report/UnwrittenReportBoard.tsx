/** @file-guide
 * 목적: 개발명세서 §47의 강사 선택형 안 쓴 리포트 보드를 한 컴포넌트로 제공한다.
 * 책임/재사용: 서버 UnwrittenDto 한 스냅숏을 선택/표시만 한다. 상태·차감·독촉 대상 판정을 화면에서 다시 계산하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useState } from 'react';
import type { ReportRow, Unwritten, UnwrittenByTeacher } from '@/api/types';
import { hrefForScheduleOccurrence } from '@/lib/report-links';
import { Button, Chip, type Column, LinkButton, Panel, StatusBadge, Table } from '@/components/ui';

type ReminderMessage = { tone: 'success' | 'danger'; text: string } | null;

export interface UnwrittenReportBoardProps {
  data?: Unwritten;
  isLoading: boolean;
  isError: boolean;
  canRemind: boolean;
  reminderPending: boolean;
  reminderMessage: ReminderMessage;
  subjectName: (key?: string | null) => string;
  onRemind: (teacherId?: number) => void;
}

/** 서버가 내려준 경과 분을 사람용 낱말로만 바꾼다. 대상 여부와 차감은 계산하지 않는다. */
export function reportElapsedDays(minutes: number): string {
  const days = Math.max(0, Math.floor(minutes / (60 * 24)));
  return days === 0 ? '오늘' : `${days}일`;
}

/** `오늘 전`같은 어색한 표현을 피하되, 서버가 내려준 경과 분은 바꾸지 않는다. */
export function reportElapsedAgo(minutes: number): string {
  const elapsed = reportElapsedDays(minutes);
  return elapsed === '오늘' ? elapsed : `${elapsed} 전`;
}

function oldestLabel(data: Unwritten, teacher: UnwrittenByTeacher): string {
  const elapsed = data.items
    .filter((item) => item.teacherId === teacher.teacherId)
    .reduce((max, item) => Math.max(max, item.minutesSinceEnd), 0);
  return `가장 오래된 것 ${reportElapsedAgo(elapsed)}`;
}

export function UnwrittenReportBoard({
  data, isLoading, isError, canRemind, reminderPending, reminderMessage, subjectName, onRemind,
}: UnwrittenReportBoardProps) {
  const [pickedTeacherId, setPickedTeacherId] = useState<number | null>(null);
  const teachers = data?.byTeacher ?? [];
  const selectedTeacher = teachers.find((teacher) => teacher.teacherId === pickedTeacherId) ?? teachers[0] ?? null;
  const selectedItems = selectedTeacher
    ? (data?.items ?? []).filter((item) => item.teacherId === selectedTeacher.teacherId)
    : [];

  const columns: Array<Column<ReportRow>> = [
    { key: 'date', head: '날짜', width: 104, cell: (row) => <b>{row.date}</b> },
    { key: 'subject', head: '과목', width: 150, cell: (row) => subjectName(row.subKey) },
    { key: 'students', head: '학생', cell: (row) => row.students.map((student) => student.name).join(' · ') || '—' },
    { key: 'elapsed', head: '지난 날', width: 82, align: 'right', cell: (row) => reportElapsedAgo(row.minutesSinceEnd) },
    { key: 'state', head: '상태', width: 88, cell: (row) => <StatusBadge state={row.state} /> },
    {
      key: 'schedule', head: '일정', width: 78, align: 'right', cell: (row) => (
        <LinkButton size="sm" href={hrefForScheduleOccurrence(row)}>일정</LinkButton>
      ),
    },
  ];

  if (isLoading) return <div className="rounded-xl border border-line bg-card p-8 text-center text-[12px] text-fg-subtle">안 쓴 리포트를 불러오는 중…</div>;
  if (isError || !data) return <div role="alert" className="rounded-xl border border-red bg-card p-4 text-[12px] text-red">안 쓴 리포트를 불러오지 못했습니다.</div>;

  return (
    <section aria-label="안 쓴 리포트 강사별 추적" className="grid min-w-0 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Panel
        className="min-w-0 p-0"
        title={<span>강사 <b>{teachers.length}명</b> · <b>{data.total}건</b></span>}
        right={canRemind ? (
          <Button size="sm" variant="danger" disabled={teachers.length === 0 || reminderPending} onClick={() => onRemind()}>
            전부 독촉
          </Button>
        ) : null}
      >
        <div className="max-h-[660px] overflow-y-auto border-t border-line">
          {teachers.map((teacher) => {
            const selected = selectedTeacher?.teacherId === teacher.teacherId;
            return (
              <button
                key={teacher.teacherId}
                type="button"
                aria-pressed={selected}
                onClick={() => setPickedTeacherId(teacher.teacherId)}
                className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0 ${selected ? 'bg-header text-card' : 'bg-card text-fg hover:bg-inset'}`}
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px]">{teacher.teacherName}</b>
                  <span className={`mt-0.5 block text-[11px] ${selected ? 'text-card/75' : 'text-fg-subtle'}`}>
                    {oldestLabel(data, teacher)}
                  </span>
                </span>
                <Chip tone={teacher.count >= 3 ? 'danger' : 'warning'}>{teacher.count}</Chip>
                <span aria-hidden className="text-[14px]">›</span>
              </button>
            );
          })}
          {teachers.length === 0 ? <p className="px-4 py-10 text-center text-[12px] text-fg-subtle">조치할 리포트가 없습니다.</p> : null}
        </div>
      </Panel>

      <div className="min-w-0">
        <Panel
          className="min-w-0 p-0"
          title={selectedTeacher ? `${selectedTeacher.teacherName} · 강사` : '강사를 고르세요'}
          sub={selectedTeacher ? `안 쓴 것 ${selectedItems.length}건` : '왼쪽에서 강사를 고르면 조치할 수업을 봅니다.'}
          right={canRemind && selectedTeacher ? (
            <Button size="sm" variant="danger" disabled={reminderPending} onClick={() => onRemind(selectedTeacher.teacherId)}>
              독촉
            </Button>
          ) : null}
        >
          {reminderMessage ? (
            <div role={reminderMessage.tone === 'danger' ? 'alert' : 'status'} className={`border-b px-4 py-2 text-[12px] ${reminderMessage.tone === 'danger' ? 'border-red bg-red/5 text-red' : 'border-green bg-green/5 text-green'}`}>
              {reminderMessage.text}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <Table className="min-w-[720px] rounded-none border-0" columns={columns} rows={selectedItems} rowKey={(row) => row.id} empty="조치할 리포트가 없습니다" />
          </div>
        </Panel>
      </div>
    </section>
  );
}
