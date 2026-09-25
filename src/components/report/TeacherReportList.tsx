/** @file-guide
 * 목적: 강사의 개인 리포트 목록(덱 slide 18 날짜 묶음)과 관리 화면 승인 큐의 모바일 카드·웹 표를 같은 데이터에서 렌더한다.
 * 책임/재사용: 표시·선택만 소유하고 작성/상태/권한은 서버 DTO와 ReportDetailDrawer에 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReportRow } from '@/api/types';
import { KO_DOW, dowOf, hhmm } from '@/lib/calendar';
import { Button, type Column, StatusBadge, Table } from '@/components/ui';

/** 날짜 묶음 머리 — 덱 slide 18 「8월 25일 (화) 2건」 */
const dayHead = (iso: string): string => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일 (${KO_DOW[dowOf(iso)]})`;

/**
 * 강사 덱 slide 18 왼쪽 목록 — 날짜 묶음 아래 「10:00 · 한도윤 / Kinder Phonics A · 미작성」 줄.
 * 받은 차례를 그대로 쓰고 날짜가 바뀔 때만 머리를 세운다(차례는 부르는 쪽 · 서버가 정한다). 모바일·웹이 같은 한 목록이다.
 */
function GroupedReportList({ rows, subjectName, onOpen }: {
  rows: ReportRow[];
  subjectName: (key?: string | null) => string;
  onOpen: (row: ReportRow) => void;
}) {
  const groups: Array<{ date: string; rows: ReportRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.rows.push(row); else groups.push({ date: row.date, rows: [row] });
  }
  if (groups.length === 0) {
    return <p className="rounded-xl border border-line bg-card px-3 py-10 text-center text-[12px] text-fg-subtle">리포트가 없습니다</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card" aria-label="내 리포트 목록">
      {groups.map((group) => (
        <div key={group.date} role="group" aria-label={`${dayHead(group.date)} · ${group.rows.length}건`} className="border-t border-line first:border-t-0">
          <div className="flex items-center gap-2 bg-inset px-3 py-2 text-[12px] font-bold text-fg">
            <time dateTime={group.date}>{dayHead(group.date)}</time>
            <span className="font-medium text-fg-subtle">{group.rows.length}건</span>
          </div>
          <ul>
            {group.rows.map((row) => {
              const time = row.startMin === null ? '시간 미정' : hhmm(row.startMin);
              const students = row.students.map((student) => student.name).join(' · ') || '학생 없음';
              return (
                <li key={row.id} className="border-t border-line first:border-t-0">
                  <button type="button" onClick={() => onOpen(row)} aria-label={`${time} ${students} · ${subjectName(row.subKey)}`}
                    className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-inset focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg">
                    <span className="w-11 shrink-0 text-[12px] font-bold tabular-nums text-fg-2">{time}</span>
                    <span className="min-w-0 grow">
                      <b className="block truncate text-[13px] text-fg">{students}</b>
                      <span className="block truncate text-[11px] text-fg-subtle">{subjectName(row.subKey)}</span>
                    </span>
                    <StatusBadge state={row.state} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function TeacherReportList({ rows, subjectName, onOpen, grouped = false }: {
  rows: ReportRow[];
  subjectName: (key?: string | null) => string;
  onOpen: (row: ReportRow) => void;
  /** 강사 개인 목록 — 덱 slide 18 날짜 묶음. 기본(false)은 관리 화면 승인 큐가 쓰는 표·카드 그대로다 */
  grouped?: boolean;
}) {
  if (grouped) return <GroupedReportList rows={rows} subjectName={subjectName} onOpen={onOpen} />;
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
