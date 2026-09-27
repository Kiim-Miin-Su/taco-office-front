/** @file-guide
 * 목적: 개발명세서 §47의 강사 선택형 안 쓴 리포트 보드를 한 컴포넌트로 제공한다.
 * 책임/재사용: 서버 UnwrittenDto 한 스냅숏을 선택/표시만 한다. 상태·차감·독촉 대상 판정을 화면에서 다시 계산하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useState } from 'react';
import type { ReportRow, Unwritten, UnwrittenByTeacher } from '@/api/types';
import { monthDayLabel } from '@/lib/calendar';
import { hrefForScheduleOccurrence } from '@/lib/report-links';
import { readableAccentColor } from '@/lib/tokens';
import { Button, Chip, cn, type Column, LinkButton, Panel, StatusBadge, Table } from '@/components/ui';

type ReminderMessage = { tone: 'success' | 'danger'; text: string } | null;

export interface UnwrittenReportBoardProps {
  data?: Unwritten;
  isLoading: boolean;
  isError: boolean;
  canRemind: boolean;
  reminderPending: boolean;
  reminderMessage: ReminderMessage;
  subjectName: (key?: string | null) => string;
  /** 과목색 — 공용 subjectColor 를 부르는 쪽이 넘긴다. 없으면 글자색은 기본 */
  subjectColorOf?: (key?: string | null) => string | null;
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
  data, isLoading, isError, canRemind, reminderPending, reminderMessage, subjectName, subjectColorOf, onRemind,
}: UnwrittenReportBoardProps) {
  const [pickedTeacherId, setPickedTeacherId] = useState<number | null>(null);
  const teachers = data?.byTeacher ?? [];
  const selectedTeacher = teachers.find((teacher) => teacher.teacherId === pickedTeacherId) ?? teachers[0] ?? null;
  const selectedItems = selectedTeacher
    ? (data?.items ?? []).filter((item) => item.teacherId === selectedTeacher.teacherId)
    : [];

  /* 원문 §47 표 — 날짜(연도 없이) · 과목(과목색 점 + 과목색 글자) · 학생 · 지난 날(「2일」) · 상태 · 링크(머리 비움) (g5 47-03~05·08) */
  const columns: Array<Column<ReportRow>> = [
    // 「8월 19일 수요일」 — 연도 없이 (같은 달의 최근 수업만 서기 때문이다)
    { key: 'date', head: '날짜', width: 130, cell: (row) => <b>{monthDayLabel(row.date)}</b> },
    {
      key: 'subject', head: '과목', width: 160, cell: (row) => {
        const color = subjectColorOf?.(row.subKey) ?? null;
        return (
          <span className="inline-flex items-center gap-1.5">
            <span data-subject-dot aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: color ?? 'var(--fg-subtle)' }} />
            <b style={color ? { color: readableAccentColor(color) } : undefined}>{subjectName(row.subKey)}</b>
          </span>
        );
      },
    },
    { key: 'students', head: '학생', cell: (row) => row.students.map((student) => student.name).join(' · ') || '—' },
    { key: 'elapsed', head: '지난 날', width: 82, align: 'right', cell: (row) => reportElapsedDays(row.minutesSinceEnd) },
    // 상태 칸은 알약이 아니라 점 + 색 글자 · 반려 주황(g5 47-06)
    { key: 'state', head: '상태', width: 88, cell: (row) => <StatusBadge state={row.state} dot /> },
    {
      key: 'schedule', head: '', width: 78, align: 'right', cell: (row) => (
        <LinkButton size="sm" href={hrefForScheduleOccurrence(row)}>일정</LinkButton>
      ),
    },
  ];

  if (isLoading) return <div className="rounded-xl border border-line bg-card p-8 text-center text-[12px] text-fg-subtle">안 쓴 리포트를 불러오는 중…</div>;
  if (isError || !data) return <div role="alert" className="rounded-xl border border-red bg-card p-4 text-[12px] text-red">안 쓴 리포트를 불러오지 못했습니다.</div>;

  return (
    <section aria-label="안 쓴 리포트 강사별 추적" className="grid min-w-0 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* 왼쪽 머리는 짙은 띠 「강사 N명 · N건」 + 밝은 「전부 독촉」 (원문 §47 · g5 47-08) */}
      <Panel className="min-w-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 bg-header px-4 py-3 text-card">
          <h2 className="text-[13px] font-bold">강사 <b>{teachers.length}명</b> · <b>{data.total}건</b></h2>
          {canRemind ? (
            <Button size="sm" variant="secondary" disabled={teachers.length === 0 || reminderPending} onClick={() => onRemind()}>
              전부 독촉
            </Button>
          ) : null}
        </div>
        <div className="max-h-[660px] overflow-y-auto border-t border-line">
          {teachers.map((teacher) => {
            const selected = selectedTeacher?.teacherId === teacher.teacherId;
            /*
             * 원본 §47 — 고른 줄은 밝은 바탕 + 왼쪽 갈색 막대, 건수는 붉은 바탕 흰 글자 한 색.
             * 짙은 바탕(bg-header) 위에 옅은 붉은 배지를 두면 건수가 안 읽혔다(대비 미달).
             * 선택 모양은 §27 학생별·§44 안내 학생별과 같은 줄 모양을 쓴다.
             */
            return (
              <button
                key={teacher.teacherId}
                type="button"
                aria-pressed={selected}
                onClick={() => setPickedTeacherId(teacher.teacherId)}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-l-[3px] border-b-line px-4 py-3 text-left text-fg transition-colors last:border-b-0',
                  selected ? 'border-l-primary bg-inset' : 'border-l-transparent bg-card hover:bg-inset',
                )}
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px]">{teacher.teacherName}</b>
                  <span className="mt-0.5 block text-[11px] text-fg-subtle">
                    {oldestLabel(data, teacher)}
                  </span>
                </span>
                <Chip tone="danger" styleKind="solid">{teacher.count}</Chip>
                <span aria-hidden className="text-[14px]">›</span>
              </button>
            );
          })}
          {teachers.length === 0 ? <p className="px-4 py-10 text-center text-[12px] text-fg-subtle">조치할 리포트가 없습니다.</p> : null}
        </div>
      </Panel>

      <div className="min-w-0">
        {/* 오른쪽 머리 한 줄 — 「Sophia 강사 · 코디네이터 안 쓴 것 18건」. 역할 낱말·직함은 서버 것 (g5 47-07) */}
        <Panel
          className="min-w-0 p-0"
          title={selectedTeacher ? (
            <span className="inline-flex flex-wrap items-baseline gap-2">
              <span>{[`${selectedTeacher.teacherName} ${selectedTeacher.roleLabel}`, selectedTeacher.title].filter(Boolean).join(' · ')}</span>
              <b className="text-red">{`안 쓴 것 ${selectedItems.length}건`}</b>
            </span>
          ) : '강사를 고르세요'}
          sub={selectedTeacher ? undefined : '왼쪽에서 강사를 고르면 조치할 수업을 봅니다.'}
          right={canRemind && selectedTeacher ? (
            <Button size="sm" variant="dark" disabled={reminderPending} onClick={() => onRemind(selectedTeacher.teacherId)}>
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
