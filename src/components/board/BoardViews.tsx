/** @file-guide
 * 목적: BoardViews.tsx — BoardMarks, BoardLessonCard, DayBoard, WeekBoard, MonthBoard (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원문 §34 일별(시간순 카드 3열) · §35 주별(요일 7칸) · §36 월별(달력)이 한 벌의 카드·마크를 쓴다.
 *
 * **세지 않는다** — 칸 머리·달력 칸의 수(수업 · N 남음 · 과목 점)는 서버 `days[]` 그대로이고,
 * 카드의 다 됨/덜 됨은 서버 `missing`·`canceled` 를 읽기만 한다 (D-R37 · N-19).
 * 화면이 하는 일은 서버가 준 줄을 **날짜 칸에 놓는 것**뿐이다.
 */
import type { Board, BoardRow, CheckMark } from '@/api/types';
import { Chip, Panel, cn } from '@/components/ui';
import { KO_DOW, addDays, dowOf } from '@/lib/calendar';

/** 서버 `BoardDto.days[]` 한 칸 — §35 요일 머리 · §36 달력 칸 */
export type BoardDay = Board['days'][number];

/** 과목 키 → 색 (공용 subjectColor 를 부르는 쪽이 넘긴다 — 색 판정을 이 파일에 두지 않는다) */
export type SubjectColorOf = (subKey: string | null | undefined) => string | null;

const MARK_LABEL: Record<CheckMark['key'], string> = {
  book: '교재',
  guide: '안내',
  zoom: '줌',
  report: '리포트',
};

type MarkState = 'done' | 'missing' | 'na';
const markState = (mark: CheckMark): MarkState => (mark.na ? 'na' : mark.done ? 'done' : 'missing');

/** 원문 §34 범례 — 기호와 상태 낱말 한 벌 (`!` 안 됨 · `✓` 완료 · `–` 해당 없음) */
const MARK_SYMBOL: Record<MarkState, string> = { done: '✓', missing: '!', na: '–' };
const MARK_WORD: Record<MarkState, string> = { done: '완료', missing: '안 됨', na: '해당 없음' };

/**
 * §34~§36 이 공유하는 네 마크 — **기호 + 낱말**(g4 §34-2). 색으로만 상태를 말하지 않는다.
 * `chips` 는 카드 아래 마크 줄, `symbols` 는 주별 작은 카드의 기호 넷(이름은 aria-label 에).
 */
export function BoardMarks({
  marks,
  variant = 'chips',
}: {
  marks: CheckMark[];
  variant?: 'chips' | 'symbols';
}) {
  if (variant === 'symbols') {
    return (
      <div
        className="flex items-center gap-1"
        role="img"
        aria-label={marks.map((mark) => `${MARK_LABEL[mark.key]} ${MARK_WORD[markState(mark)]}`).join(', ')}
      >
        {marks.map((mark) => {
          const state = markState(mark);
          return (
            <span
              key={mark.key}
              aria-hidden
              title={`${MARK_LABEL[mark.key]} · ${state === 'missing' ? (mark.note ?? MARK_WORD[state]) : MARK_WORD[state]}`}
              className={cn(
                'inline-flex h-4 w-4 items-center justify-center rounded-[4px] text-[10px] font-bold leading-none',
                state === 'missing' ? 'bg-red text-white' : state === 'done' ? 'bg-green/10 text-green' : 'border border-line text-fg-2',
              )}
            >
              {MARK_SYMBOL[state]}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {marks.map((mark) => {
        const state = markState(mark);
        return (
          <span
            key={mark.key}
            data-mark={state}
            role="img"
            aria-label={`${MARK_LABEL[mark.key]} ${MARK_WORD[state]}`}
            title={mark.note ?? `${MARK_LABEL[mark.key]} ${MARK_WORD[state]}`}
            className={cn(
              'inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-bold',
              state === 'missing' ? 'bg-red/10 text-red' : state === 'done' ? 'bg-green/10 text-green' : 'border border-line text-fg-2',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'inline-flex h-3.5 min-w-3.5 items-center justify-center text-[10px] leading-none',
                // 원문 「!」는 붉은 사각 — 기호 자리만 채운다
                state === 'missing' ? 'rounded-[3px] bg-red px-0.5 text-white' : '',
              )}
            >
              {MARK_SYMBOL[state]}
            </span>
            {MARK_LABEL[mark.key]}
          </span>
        );
      })}
    </div>
  );
}

type CardState = 'canceled' | 'done' | 'todo';
/** 서버 canceled · missing 을 읽기만 한다 — 다시 판정하지 않는다 */
const cardState = (row: BoardRow): CardState => (row.canceled ? 'canceled' : row.missing > 0 ? 'todo' : 'done');

const lessonName = (row: BoardRow): string => row.subName ?? row.kindName ?? '수업';

/** 장소 배지 — 온라인은 줌 계정 이름까지(원문 「온라인 Study」 · g4 §34-10), 현장은 강의실 */
function RoomBadge({ row }: { row: BoardRow }) {
  if (row.mode === 'online') {
    return <Chip tone="info">{row.zaccLabel ? `온라인 ${row.zaccLabel}` : '온라인'}</Chip>;
  }
  return row.roomName ? <Chip styleKind="outline">{row.roomName}</Chip> : null;
}

/**
 * 수업 카드 한 장 — §34 일별(기본)과 §35 주별(`compact`)이 같은 카드를 쓴다.
 * 다 된 수업은 흰 바탕 + 과목색 왼쪽 띠, 덜 된 수업은 분홍 바탕, 휴강은 흐린 바탕에 줄 긋기 (원문 §34).
 */
export function BoardLessonCard({
  row,
  compact = false,
  colorOf,
  onOpen,
}: {
  row: BoardRow;
  compact?: boolean;
  colorOf: SubjectColorOf;
  onOpen: (row: BoardRow) => void;
}) {
  const state = cardState(row);
  const color = colorOf(row.subKey) ?? 'var(--line)';
  const name = lessonName(row);
  const who = [row.teacherName ?? '미배정', ...row.studentNames].join(' · ');
  const stateWord = state === 'canceled' ? '휴강' : state === 'todo' ? `${row.missing}개 안 됨` : '다 됨';
  const look = cn(
    'w-full rounded-xl border text-left transition hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
    state === 'todo' ? 'border-red/30 bg-red/10' : state === 'canceled' ? 'border-line bg-inset' : 'border-line bg-card',
  );
  // 과목색 띠는 다 된 카드에만 — 덜 된 카드는 분홍 바탕이 먼저 말한다
  const stripe = state === 'done' ? { borderLeftColor: color, borderLeftWidth: 4 } : undefined;

  if (compact) {
    return (
      <button
        type="button"
        data-state={state}
        aria-label={`${row.startAt} ${name} · ${row.teacherName ?? '미배정'} · ${stateWord} — 수업 상세`}
        onClick={() => onOpen(row)}
        className={cn(look, 'px-2 py-1.5')}
        style={stripe}
      >
        <div className={cn('flex items-baseline gap-1 text-[11px]', state === 'canceled' ? 'text-fg-subtle line-through' : '')}>
          <b>{row.startAt}</b>
          <b className="truncate" title={name}>{name}</b>
        </div>
        <div className="truncate text-[11px] text-fg-subtle" title={who}>
          {row.teacherName ?? '미배정'} · {row.studentNames.length}명
        </div>
        <div className="mt-1">
          <BoardMarks marks={row.marks} variant="symbols" />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-state={state}
      aria-label={`${row.startAt}–${row.endAt} ${name} · ${stateWord} — 수업 상세`}
      onClick={() => onOpen(row)}
      className={cn(look, 'flex gap-3 p-3')}
      style={stripe}
    >
      <div className="w-12 shrink-0 text-[12px] leading-tight">
        <b className="block text-[14px] text-fg">{row.startAt}</b>
        <span className="text-fg-subtle">{row.endAt}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <b className={cn('truncate text-[13px]', state === 'canceled' ? 'text-fg-subtle line-through' : 'text-fg')} title={name}>
            {name}
          </b>
          <RoomBadge row={row} />
        </div>
        <div className="mt-0.5 truncate text-[12px] text-fg-subtle" title={who}>{who}</div>
        <div className="mt-2">
          {state === 'canceled' ? <Chip>휴강</Chip> : <BoardMarks marks={row.marks} />}
        </div>
      </div>
    </button>
  );
}

/** §34 일별 — 「시간순 카드」 3열 격자 (g4 §34-1). 서버가 시각 순으로 준 줄을 그대로 놓는다 */
export function DayBoard({
  rows,
  loading,
  onOpen,
  colorOf,
}: {
  rows: BoardRow[];
  loading: boolean;
  onOpen: (row: BoardRow) => void;
  colorOf: SubjectColorOf;
}) {
  return (
    <Panel title="시간순 수업" sub="카드를 누르면 수업 상세가 열립니다 · 마크에 마우스를 올리면 판정 근거가 보입니다">
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-fg-subtle">{loading ? '불러오는 중…' : '수업이 없습니다'}</p>
      ) : (
        <div data-testid="board-day-grid" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <BoardLessonCard key={row.occId} row={row} colorOf={colorOf} onOpen={onOpen} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/** 요일 머리의 남은 수 — 서버 days[] 그대로. 수업이 있고 남은 것이 없으면 「다 됨」 */
function dayRemainingWord(stat: BoardDay | undefined): string | null {
  if (!stat || stat.lessons === 0) return null;
  return stat.remaining > 0 ? `${stat.remaining} 남음` : '다 됨';
}

/** §35 주별 — 요일 7칸 열 (g4 §35-1 · §35-2 · §35-3). 카드를 누르면 §34 와 같은 수업 상세 */
export function WeekBoard({
  rows,
  days,
  dayStats,
  today,
  loading,
  onOpen,
  colorOf,
}: {
  rows: BoardRow[];
  days: string[];
  dayStats: readonly BoardDay[];
  today: string;
  loading: boolean;
  onOpen: (row: BoardRow) => void;
  colorOf: SubjectColorOf;
}) {
  const statOf = new Map(dayStats.map((stat) => [stat.date, stat]));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[1050px] grid-cols-7 gap-2">
        {days.map((date) => {
          const stat = statOf.get(date);
          const remaining = dayRemainingWord(stat);
          const head = `${KO_DOW[dowOf(date)]} ${+date.slice(8, 10)}${remaining ? ` · ${remaining}` : ''}`;
          const lessons = rows.filter((row) => row.date === date);
          const isToday = date === today;
          return (
            <section
              key={date}
              aria-label={head}
              data-today={isToday ? 'true' : undefined}
              className={cn('flex min-h-40 flex-col gap-1.5 rounded-xl border bg-card p-2', isToday ? 'border-2 border-primary' : 'border-line')}
            >
              <h3 className={cn('text-[12px] font-bold', stat && stat.remaining > 0 ? 'text-red' : 'text-fg')}>{head}</h3>
              {lessons.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-fg-subtle">{loading ? '불러오는 중…' : '없음'}</p>
              ) : (
                lessons.map((row) => <BoardLessonCard key={row.occId} row={row} compact colorOf={colorOf} onOpen={onOpen} />)
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** 원문 §36 달력은 **일요일 시작**이다 — 그 달을 덮는 일~토 주들 */
function sundayMonthGrid(anchor: string): string[] {
  const first = `${anchor.slice(0, 7)}-01`;
  const lastDay = new Date(Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7), 0)).getUTCDate();
  const last = `${anchor.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
  const start = addDays(first, -dowOf(first));
  const end = addDays(last, 6 - dowOf(last));
  const out: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) out.push(date);
  return out;
}

/**
 * §36 월별 — 달력 (g4 §36-1 · §36-2 · §36-3). 칸 = 날짜 + 건수 + 「N 남음」 + 과목색 점,
 * 오늘 칸 테두리, 수업 있는 평일 칸 분홍. 날짜를 누르면 그날 일별로 간다.
 * `highlight` 가 있으면(머리 칸으로 거른 상태) 그 날짜만 또렷하게 둔다 — 거르는 근거는 부르는 쪽이 서버 marks 로 정한다.
 */
export function MonthBoard({
  anchor,
  dayStats,
  today,
  loading,
  onDay,
  colorOf,
  highlight = null,
}: {
  anchor: string;
  dayStats: readonly BoardDay[];
  today: string;
  loading: boolean;
  onDay: (date: string) => void;
  colorOf: SubjectColorOf;
  highlight?: ReadonlySet<string> | null;
}) {
  const grid = sundayMonthGrid(anchor);
  const month = anchor.slice(0, 7);
  const statOf = new Map(dayStats.map((stat) => [stat.date, stat]));
  /* 빈 달 — 일별 「수업이 없습니다」 · 주별 「없음」처럼 월별도 말한다(P-156 「데이터가 하나도 없을 때」 · all160 실브라우저 QA).
     건수는 서버 days[] 그대로 읽는다 — 이웃 달 칸의 수업은 이 달이 아니다 */
  const emptyMonth = !loading && !dayStats.some((stat) => stat.date.startsWith(month) && stat.lessons > 0);
  return (
    <>
    {emptyMonth ? <p role="status" className="mb-2 text-[12px] text-fg-subtle">이 달 수업이 아직 없습니다</p> : null}
    <div role="grid" aria-label={`${+anchor.slice(0, 4)}년 ${+anchor.slice(5, 7)}월 달력`} aria-busy={loading || undefined}
      className="overflow-hidden rounded-xl border border-line bg-card">
      <div role="row" className="grid grid-cols-7 bg-header">
        {KO_DOW.map((word) => (
          <div key={word} role="columnheader" className="px-2 py-1.5 text-[11px] font-bold text-card">{word}</div>
        ))}
      </div>
      {Array.from({ length: grid.length / 7 }, (_, week) => (
        <div key={week} role="row" className="grid grid-cols-7">
          {grid.slice(week * 7, week * 7 + 7).map((date) => {
            const stat = statOf.get(date);
            const outside = date.slice(0, 7) !== month;
            const dow = dowOf(date);
            const busy = !outside && Boolean(stat && stat.lessons > 0) && dow !== 0 && dow !== 6;
            const dim = highlight !== null && !highlight.has(date);
            const isToday = date === today;
            return (
              <div
                key={date}
                role="gridcell"
                data-date={date}
                data-today={isToday ? 'true' : undefined}
                data-busy={busy ? 'true' : undefined}
                className={cn(
                  'min-h-20 border-r border-t border-line last:border-r-0',
                  busy ? 'bg-red/10' : 'bg-card',
                  isToday ? 'outline outline-2 -outline-offset-2 outline-primary' : '',
                  dim ? 'opacity-40' : '',
                )}
              >
                <button
                  type="button"
                  disabled={outside}
                  onClick={() => onDay(date)}
                  aria-label={`${+date.slice(5, 7)}월 ${+date.slice(8, 10)}일${stat ? ` 수업 ${stat.lessons}` : ''}${
                    !outside && stat && stat.remaining > 0 ? ` · ${stat.remaining} 남음` : ''} — 일별로`}
                  className="flex h-full w-full flex-col items-start gap-1 p-1.5 text-left disabled:cursor-default"
                >
                  <span className="flex w-full items-baseline justify-between gap-1">
                    <span className={cn('text-[12px] font-bold', outside ? 'text-fg-subtle' : dow === 0 ? 'text-red' : 'text-fg')}>
                      {+date.slice(8, 10)}
                    </span>
                    {!outside && stat && stat.lessons > 0 ? (
                      <span className="text-[10px] font-bold text-red">{stat.lessons}</span>
                    ) : null}
                  </span>
                  {!outside && stat && stat.remaining > 0 ? (
                    // 393px 에서 한 칸은 약 51px — 줄바꿈 없는 「12 남음」 칩이 옆 칸을 덮는다. 좁은 화면은 수만,
                    // 「남음」은 sm 부터. 온전한 말은 title 과 칸 이름(aria-label)에 남는다 (teacher 393px 점검)
                    <Chip size="compact" tone="danger" styleKind="solid" title={`${stat.remaining} 남음`}>
                      {stat.remaining}
                      <span className="hidden sm:inline"> 남음</span>
                    </Chip>
                  ) : null}
                  {!outside && stat && stat.subKeys.length > 0 ? (
                    <span className="flex flex-wrap gap-0.5" aria-hidden>
                      {stat.subKeys.map((key) => (
                        <span
                          key={key}
                          data-subject-dot
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: colorOf(key) ?? 'var(--fg-subtle)' }}
                        />
                      ))}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
    </>
  );
}
