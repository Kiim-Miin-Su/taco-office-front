import type {
  BoardMarkCount,
  BoardRow,
  BoardSummary,
  BoardTeacherRow,
  BoardWeek,
  CheckMark,
} from '@/api/types';
import { Button, Chip, type Column, Panel, StatCard, Table } from '@/components/ui';
import { label } from '@/lib/calendar';

const MARK_LABEL: Record<CheckMark['key'], string> = {
  book: '교재',
  guide: '안내',
  zoom: '줌',
  report: '리포트',
};

const EMPTY_MARKS: CheckMark[] = (Object.keys(MARK_LABEL) as CheckMark['key'][]).map((key) => ({
  key,
  done: false,
  na: true,
  note: '수업 없음',
}));

/** §34~§36이 공유하는 네 마크. 색·순서·접근성 문구의 단일 출처다. */
export function BoardMarks({
  marks,
  variant = 'chips',
}: {
  marks: CheckMark[];
  variant?: 'chips' | 'dots';
}) {
  if (variant === 'dots') {
    return (
      <div
        className="flex items-center justify-center gap-1"
        role="img"
        aria-label={marks
          .map(
            (mark) =>
              `${MARK_LABEL[mark.key]} ${mark.na ? '해당 없음' : mark.done ? '완료' : '미완료'}`,
          )
          .join(', ')}
      >
        {marks.map((mark) => (
          <span
            key={mark.key}
            title={`${MARK_LABEL[mark.key]} · ${mark.na ? '해당 없음' : mark.done ? '완료' : (mark.note ?? '미완료')}`}
            className={`h-2.5 w-2.5 rounded-full ${mark.na ? 'bg-line-2' : mark.done ? 'bg-green' : 'bg-red'}`}
            aria-hidden
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {marks.map((mark) => (
        <Chip
          key={mark.key}
          tone={mark.na ? 'neutral' : mark.done ? 'success' : 'danger'}
          styleKind={mark.na ? 'outline' : 'soft'}
          className={mark.na ? 'opacity-60' : undefined}
          title={mark.note ?? MARK_LABEL[mark.key]}
        >
          {MARK_LABEL[mark.key]}
        </Chip>
      ))}
    </div>
  );
}

function countOf(marks: BoardMarkCount[], key: CheckMark['key']): BoardMarkCount {
  return marks.find((mark) => mark.key === key) ?? { key, done: 0, total: 0, missing: 0 };
}

function ratio(mark: BoardMarkCount) {
  return mark.total ? `${mark.done}/${mark.total}` : '—';
}

export function DayBoard({
  rows,
  loading,
  onOpen,
}: {
  rows: BoardRow[];
  loading: boolean;
  onOpen: (row: BoardRow) => void;
}) {
  const columns: Array<Column<BoardRow>> = [
    { key: 'date', head: '날짜', width: 116, cell: (row) => label(row.date) },
    { key: 'time', head: '시각', width: 108, cell: (row) => `${row.startAt}–${row.endAt}` },
    {
      key: 'lesson',
      head: '수업',
      cell: (row) => (
        <div>
          <span className={row.canceled ? 'font-bold text-fg-subtle line-through' : 'font-bold'}>
            {row.subName ?? row.kindName ?? row.kindKey}
          </span>
          <span className="ml-2 text-fg-subtle">{row.studentNames.join(' · ') || '학생 없음'}</span>
        </div>
      ),
    },
    { key: 'teacher', head: '선생님', width: 100, cell: (row) => row.teacherName ?? '미배정' },
    {
      key: 'room',
      head: '장소',
      width: 100,
      cell: (row) =>
        row.mode === 'online' ? <Chip tone="info">온라인</Chip> : (row.roomName ?? '—'),
    },
    {
      key: 'marks',
      head: '교재 · 안내 · 줌 · 리포트',
      width: 240,
      cell: (row) => <BoardMarks marks={row.marks} />,
    },
    {
      key: 'state',
      head: '상태',
      width: 122,
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          {row.canceled ? (
            <Chip>취소</Chip>
          ) : row.missing > 0 ? (
            <Chip tone="danger">{row.missing}개 미완료</Chip>
          ) : (
            <Chip tone="success">완료</Chip>
          )}
          <Button size="sm" variant="ghost" onClick={() => onOpen(row)}>
            상세
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Panel title="수업별 확인" sub="마크에 마우스를 올리면 판정 근거를 볼 수 있습니다">
      <div className="overflow-x-auto">
        <Table
          className="min-w-[980px]"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.occId}
          empty={loading ? '불러오는 중…' : '수업이 없습니다'}
        />
      </div>
    </Panel>
  );
}

export function WeekBoard({
  rows,
  days,
  loading,
  onDay,
}: {
  rows: BoardTeacherRow[];
  days: string[];
  loading: boolean;
  onDay: (date: string, teacherId?: number | null) => void;
}) {
  const columns: Array<Column<BoardTeacherRow>> = [
    {
      key: 'teacher',
      head: '선생님',
      width: 130,
      cell: (row) => <span className="font-bold">{row.teacherName}</span>,
    },
    ...days.map<Column<BoardTeacherRow>>((date) => ({
      key: date,
      head: label(date),
      width: 108,
      align: 'center',
      cell: (row) => {
        const day = row.days.find((item) => item.date === date);
        return (
          <button
            type="button"
            disabled={!day}
            onClick={() => onDay(date, row.teacherId)}
            className="mx-auto flex min-h-10 min-w-20 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 disabled:cursor-default"
            aria-label={`${row.teacherName} ${label(date)} ${day ? `${day.lessons}개 수업, 미완료 ${day.missing}개` : '수업 없음'}`}
          >
            <BoardMarks marks={day?.marks ?? EMPTY_MARKS} variant="dots" />
            <span
              className={
                day?.missing ? 'text-[10px] font-bold text-red' : 'text-[10px] text-fg-subtle'
              }
            >
              {day ? `${day.lessons}개${day.missing ? ` · -${day.missing}` : ''}` : '—'}
            </span>
          </button>
        );
      },
    })),
    {
      key: 'missing',
      head: '미완료',
      width: 86,
      align: 'right',
      cell: (row) => <Chip tone={row.missing ? 'danger' : 'success'}>{row.missing}</Chip>,
    },
  ];

  return (
    <Panel title="강사별 주간 확인" sub="요일 칸을 누르면 해당 강사의 일간 상세로 이동합니다">
      <div className="overflow-x-auto">
        <Table
          className="min-w-[1040px]"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.teacherId ?? `none-${row.teacherName}`}
          empty={loading ? '불러오는 중…' : '수업이 없습니다'}
        />
      </div>
    </Panel>
  );
}

export function MonthBoard({
  summary,
  weeks,
  loading,
  onWeek,
}: {
  summary?: BoardSummary;
  weeks: BoardWeek[];
  loading: boolean;
  onWeek: (date: string) => void;
}) {
  const report = countOf(summary?.marks ?? [], 'report');
  const guide = countOf(summary?.marks ?? [], 'guide');
  const book = countOf(summary?.marks ?? [], 'book');
  const columns: Array<Column<BoardWeek>> = [
    {
      key: 'week',
      head: '주차',
      width: 120,
      cell: (week) => (
        <Button size="sm" variant="ghost" onClick={() => onWeek(week.from)}>
          {week.label}
        </Button>
      ),
    },
    { key: 'lessons', head: '수업', width: 80, align: 'right', cell: (week) => week.lessons },
    {
      key: 'report',
      head: '리포트',
      align: 'center',
      cell: (week) => ratio(countOf(week.marks, 'report')),
    },
    {
      key: 'guide',
      head: '안내',
      align: 'center',
      cell: (week) => ratio(countOf(week.marks, 'guide')),
    },
    {
      key: 'book',
      head: '교재',
      align: 'center',
      cell: (week) => ratio(countOf(week.marks, 'book')),
    },
    {
      key: 'zoom',
      head: '줌',
      align: 'center',
      cell: (week) => ratio(countOf(week.marks, 'zoom')),
    },
    {
      key: 'missing',
      head: '미완료',
      width: 90,
      align: 'right',
      cell: (week) => <Chip tone={week.missing ? 'danger' : 'success'}>{week.missing}</Chip>,
    },
  ];

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="수업" value={summary?.lessons ?? '—'} />
        <StatCard
          label="리포트 미작성"
          value={summary ? report.missing : '—'}
          tone={report.missing ? 'danger' : 'success'}
        />
        <StatCard
          label="안내 미발송"
          value={summary ? guide.missing : '—'}
          tone={guide.missing ? 'danger' : 'success'}
        />
        <StatCard
          label="교재 미배부"
          value={summary ? book.missing : '—'}
          tone={book.missing ? 'danger' : 'success'}
        />
        <StatCard label="완료율" value={summary ? `${summary.completionRate}%` : '—'} tone="info" />
      </div>
      <Panel title="주차별 확인" sub="완료/대상 수입니다. 주차를 누르면 주별 현황판으로 이동합니다">
        <div className="overflow-x-auto">
          <Table
            className="min-w-[720px]"
            columns={columns}
            rows={weeks}
            rowKey={(week) => week.from}
            empty={loading ? '불러오는 중…' : '수업이 없습니다'}
          />
        </div>
      </Panel>
    </>
  );
}
