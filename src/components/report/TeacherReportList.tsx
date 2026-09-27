/** @file-guide
 * 목적: 강사의 개인 리포트 목록(덱 slide 18 날짜 묶음 · 머리 띠 · 고른 줄)과 관리 화면 승인 큐의 모바일 카드·웹 표를 같은 데이터에서 렌더한다.
 * 책임/재사용: 표시·선택만 소유하고 작성/상태/권한은 서버 DTO와 ReportDetailDrawer에 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReportRow } from '@/api/types';
import { dayHeadLabel, hhmm } from '@/lib/calendar';
import { Banner, Button, type Column, StatusBadge, Table, cn } from '@/components/ui';

/** 덱 slide 18 목록 머리 띠 — 「아직 안 쓴 리포트」는 빨강, 「작성한 리포트」는 어두운 띠 */
const HEAD_TONE = { danger: 'bg-red', dark: 'bg-fg', info: 'bg-blue' } as const;

/** 목록 머리(덱 slide 18) — 없으면 머리 없이 날짜 묶음만 선다(지금 모양) */
export interface ReportListHead {
  title: string;
  tone: keyof typeof HEAD_TONE;
  /** 머리 오른쪽 수 — 서버 합계(없으면 받은 줄 수) */
  count?: number;
}

/**
 * 강사 덱 slide 18 왼쪽 목록 — 날짜 묶음 아래 「10:00 · 한도윤 / Kinder Phonics A · 미작성」 줄.
 * 받은 차례를 그대로 쓰고 날짜가 바뀔 때만 머리를 세운다(차례는 부르는 쪽 · 서버가 정한다). 모바일·웹이 같은 한 목록이다.
 * 머리(`head`)를 주면 덱처럼 색 띠 + 수를 얹고, 고른 줄(`selected`)은 파란 왼쪽 막대로 표시한다(작성 칸이 옆에 열린 줄).
 */
function GroupedReportList({ rows, subjectName, onOpen, head, selected, status }: {
  rows: ReportRow[];
  subjectName: (key?: string | null) => string;
  onOpen: (row: ReportRow) => void;
  head?: ReportListHead;
  selected?: Pick<ReportRow, 'serId' | 'onDate'> | null;
  status?: 'loading' | 'error' | null;
}) {
  const groups: Array<{ date: string; rows: ReportRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.rows.push(row); else groups.push({ date: row.date, rows: [row] });
  }
  const body = status === 'loading' ? <Banner tone="neutral" className="m-3">리포트를 불러오는 중…</Banner>
    : status === 'error' ? <Banner tone="danger" className="m-3">리포트를 불러오지 못했습니다.</Banner>
      : groups.length === 0 ? null
        : groups.map((group) => (
          <div key={group.date} role="group" aria-label={`${dayHeadLabel(group.date)} · ${group.rows.length}건`} className="border-t border-line first:border-t-0">
            <div className="flex items-center gap-2 bg-inset px-3 py-2 text-[12px] font-bold text-fg">
              <time dateTime={group.date}>{dayHeadLabel(group.date)}</time>
              <span className="font-medium text-fg-subtle">{group.rows.length}건</span>
            </div>
            <ul>
              {group.rows.map((row) => {
                const time = row.startMin === null ? '시간 미정' : hhmm(row.startMin);
                const students = row.students.map((student) => student.name).join(' · ') || '학생 없음';
                const current = selected?.serId === row.serId && selected.onDate === row.onDate;
                return (
                  <li key={row.id} className="border-t border-line first:border-t-0">
                    <button type="button" onClick={() => onOpen(row)} aria-label={`${time} ${students} · ${subjectName(row.subKey)}`}
                      aria-current={current ? 'true' : undefined}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-inset focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg',
                        current && 'bg-primary/5 shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/5',
                      )}>
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
        ));
  if (!head && body === null) {
    return <p className="rounded-xl border border-line bg-card px-3 py-10 text-center text-[12px] text-fg-subtle">리포트가 없습니다</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card" role={head ? 'region' : undefined} aria-label={head?.title ?? '내 리포트 목록'}>
      {head ? (
        <div className={cn('flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-bold text-white', HEAD_TONE[head.tone])}>
          <span>{head.title}</span>
          <span className="rounded-full bg-white/20 px-2 text-[11px] tabular-nums">{head.count ?? rows.length}</span>
        </div>
      ) : null}
      {body ?? <p className="px-3 py-8 text-center text-[12px] text-fg-subtle">리포트가 없습니다</p>}
    </div>
  );
}

export function TeacherReportList({ rows, subjectName, onOpen, grouped = false, head, selected, status }: {
  rows: ReportRow[];
  subjectName: (key?: string | null) => string;
  onOpen: (row: ReportRow) => void;
  /** 강사 개인 목록 — 덱 slide 18 날짜 묶음. 기본(false)은 관리 화면 승인 큐가 쓰는 표·카드 그대로다 */
  grouped?: boolean;
  /** grouped 전용 — 덱 slide 18 목록 머리 · 고른 줄 · 불러오기 상태 */
  head?: ReportListHead;
  selected?: Pick<ReportRow, 'serId' | 'onDate'> | null;
  status?: 'loading' | 'error' | null;
}) {
  if (grouped) {
    return <GroupedReportList rows={rows} subjectName={subjectName} onOpen={onOpen} head={head} selected={selected} status={status} />;
  }
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
