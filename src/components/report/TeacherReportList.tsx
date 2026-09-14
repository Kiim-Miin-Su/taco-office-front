/** @file-guide
 * 목적: 강사의 개인 리포트 목록을 모바일 카드와 웹 표로 같은 데이터에서 렌더한다.
 * 책임/재사용: 표시·선택만 소유하고 작성/상태/권한은 서버 DTO와 ReportDetailDrawer에 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReportRow } from '@/api/types';
import { hhmm } from '@/lib/calendar';
import { Button, type Column, StatusBadge, Table } from '@/components/ui';

export function TeacherReportList({ rows, subjectName, onOpen }: {
  rows: ReportRow[];
  subjectName: (key?: string | null) => string;
  onOpen: (row: ReportRow) => void;
}) {
  const columns: Array<Column<ReportRow>> = [
    { key: 'date', head: '수업일', width: 110, cell: (row) => <b>{row.date}</b> },
    { key: 'time', head: '시각', width: 84, cell: (row) => row.startMin === null ? '시간 미정' : hhmm(row.startMin) },
    { key: 'subject', head: '과목', width: 150, cell: (row) => subjectName(row.subKey) },
    { key: 'students', head: '학생', cell: (row) => row.students.map((student) => student.name).join(' · ') || '—' },
    { key: 'state', head: '상태', width: 90, cell: (row) => <StatusBadge state={row.state} /> },
    {
      key: 'open', head: '열기', width: 78, align: 'right', cell: (row) => (
        <Button
          size="sm"
          aria-label={`${subjectName(row.subKey)} 리포트 상세 열기`}
          onClick={(event) => { event.stopPropagation(); onOpen(row); }}
        >
          상세
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="grid gap-2 sm:hidden" aria-label="내 리포트 모바일 목록">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpen(row)}
            className="min-h-11 rounded-xl border border-line bg-card p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            <span className="flex items-start justify-between gap-3">
              <span>
                <b className="block text-[13px] text-fg">{subjectName(row.subKey)}</b>
                <span className="mt-0.5 block text-[11px] text-fg-subtle">
                  {row.date} · {row.startMin === null ? '시간 미정' : hhmm(row.startMin)}
                </span>
              </span>
              <StatusBadge state={row.state} />
            </span>
            <span className="mt-2 block text-[12px] text-fg">
              {row.students.map((student) => student.name).join(' · ') || '학생 없음'}
            </span>
          </button>
        ))}
        {rows.length === 0 ? <p className="rounded-xl border border-line bg-card px-3 py-10 text-center text-[12px] text-fg-subtle">리포트가 없습니다</p> : null}
      </div>
      <div className="hidden sm:block">
        <Table columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={onOpen} empty="리포트가 없습니다" />
      </div>
    </>
  );
}
