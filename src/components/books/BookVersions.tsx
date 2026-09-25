/** @file-guide
 * 목적: BookVersions.tsx — BookVersionBadge, BookVersionAdder, BookHistory (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §39 판 배지 · §40 이력.
 *
 * **「더 나중 판이 있다」를 화면이 판정하지 않는다.** 서버가 `hasNewer` 한 칸으로 말한다 —
 * 화면이 `edition !== latestEdition` 을 다시 적으면 카드 배지와 머리 띠가 갈린다 (D-R39).
 * 원본 §39 가 그 둘을 같은 화면에 나란히 두고 있어 갈리면 바로 보인다.
 *
 * §40 이력에는 **쓰는 자리가 없다.** 배부·업로드·교체·안내가 남긴 것을 읽기만 한다.
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Chip, Input, Label, Panel, Segmented, cn } from '@/components/ui';
import { SearchField } from '@/components/ui/SearchField';
import { apiMessage } from '@/api/client';
import { useAddBookVersion, useBookHistory, useUseBookVersion } from '@/api/queries';
import type { Book, BookHistoryQuery } from '@/api/types';
import { longDateLabel, todayKst } from '@/lib/calendar';
import { fileSelectionIssue, fileUploadBody } from '@/lib/file-upload';

type BookHistoryAction = NonNullable<BookHistoryQuery['action']>;
const BOOK_HISTORY_ACTIONS = [
  'book_issue',
  'book_upload',
  'book_swap',
  'book_drop',
  'guide_write',
  'guide_send',
  'guide_ack',
  'teacher_req',
  'teacher_swap',
] as const satisfies readonly BookHistoryAction[];

function isBookHistoryAction(value: string): value is BookHistoryAction {
  return BOOK_HISTORY_ACTIONS.some((action) => action === value);
}

/**
 * 원문 §40 — 행동 칩·줄 라벨의 **기호**와 줄 왼쪽 띠의 **갈래 색**(초록 배부 · 보라 요청 · 주황 교체 · 파랑 안내).
 * 낱말(actionLabel)은 서버가 주고 여기는 모양만 정한다 (D-R18). 모르는 행동은 기호 없이 파랑 띠.
 */
type HistoryGroup = 'book' | 'request' | 'swap' | 'guide';
const ACTION_LOOK: Record<string, { symbol: string; group: HistoryGroup }> = {
  book_issue: { symbol: '＋', group: 'book' },
  book_upload: { symbol: '↑', group: 'book' },
  book_drop: { symbol: '－', group: 'book' },
  book_swap: { symbol: '⇄', group: 'swap' },
  teacher_req: { symbol: '✉', group: 'request' },
  teacher_swap: { symbol: '⇄', group: 'swap' },
  guide_write: { symbol: '✎', group: 'guide' },
  guide_send: { symbol: '→', group: 'guide' },
  guide_ack: { symbol: '✓', group: 'guide' },
};
const GROUP_STRIPE: Record<HistoryGroup, string> = {
  book: 'border-green', request: 'border-violet', swap: 'border-amber', guide: 'border-blue',
};
const GROUP_TEXT: Record<HistoryGroup, string> = {
  book: 'text-green', request: 'text-violet', swap: 'text-amber', guide: 'text-blue',
};
const actionLook = (key: string) => ACTION_LOOK[key] ?? { symbol: '', group: 'guide' as const };
const withSymbol = (key: string, label: string) => {
  const symbol = actionLook(key).symbol;
  return symbol ? `${symbol} ${label}` : label;
};

/** 활동 추이 막대 한 칸의 최대 높이(px) — 칸(h-24 · 96px)에서 날짜 글자 자리를 뺀 것 */
const TREND_BAR_MAX = 72;

/** 판 배지 — ⇧ 는 「더 나중 판이 있다」는 서버 판정 하나만 본다 */
export function BookVersionBadge({ book }: { book: Book }) {
  const use = useUseBookVersion();
  if (!book.edition) return <span className="text-[11px] text-fg-subtle">판 없음</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Chip size="compact" tone={book.hasNewer ? 'warning' : 'neutral'}>
        {book.edition}
      </Chip>
      {book.hasNewer && book.latestVersId ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={use.isPending}
          title={`${book.latestEdition ?? ''} 로 바꿉니다`}
          onClick={() => use.mutate(book.latestVersId as number)}
        >
          ⇧ {book.latestEdition}
        </Button>
      ) : null}
    </span>
  );
}

/** §39 「+ 판 올리기」 */
export function BookVersionAdder({ book, maxBytes, onClose }: { book: Book; maxBytes: number; onClose: () => void }) {
  const add = useAddBookVersion();
  const [edition, setEdition] = useState('');
  const [seFile, setSeFile] = useState<File | null>(null);
  const [teFile, setTeFile] = useState<File | null>(null);
  const fileIssue = fileSelectionIssue([seFile, teFile], maxBytes);
  // 「언제부터 쓰는가」가 없으면 올린 판이 곧바로 지금 판이 되어 ⇧ 가 뜰 일이 없다 —
  // 그러면 원본 §39 의 「판 버튼을 눌러 바꿉니다」 갈래가 화면에서 닿지 않는다
  const [fromDate, setFromDate] = useState('');

  return (
    <Panel
      className="mb-4"
      title={`새 판 올리기 — ${book.title}`}
      sub="「언제부터」를 비우면 오늘부터 씁니다. 올린 판은 이력에 남습니다"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="v-ed">판 이름</Label>
          <Input id="v-ed" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="v2026.08" />
        </div>
        <div>
          <Label htmlFor="v-from">언제부터</Label>
          <Input id="v-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="v-se">학생용 SE 파일</Label>
          <Input id="v-se" type="file" onChange={(event) => setSeFile(event.currentTarget.files?.[0] ?? null)} />
        </div>
        <div>
          <Label htmlFor="v-te">교사용 TE 파일</Label>
          <Input id="v-te" type="file" onChange={(event) => setTeFile(event.currentTarget.files?.[0] ?? null)} />
        </div>
      </div>
      {fileIssue ? (
        <Banner tone="danger" className="mt-3">
          {fileIssue}
        </Banner>
      ) : null}
      {add.isError ? (
        <Banner tone="danger" className="mt-3">
          {apiMessage(add.error)}
        </Banner>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button
          disabled={add.isPending || edition.trim() === '' || fileIssue !== null}
          onClick={() =>
            void (async () => {
              try {
                await add.mutateAsync({
                  libId: book.id,
                  edition: edition.trim(),
                  ...(seFile ? { seFile: await fileUploadBody(seFile, 'lib-se') } : {}),
                  ...(teFile ? { teFile: await fileUploadBody(teFile, 'lib-te') } : {}),
                  ...(fromDate ? { fromDate } : {}),
                });
                onClose();
              } catch {
                /* mutation 상태의 공용 오류 문구를 표시한다 */
              }
            })()
          }
        >
          올리기
        </Button>
      </div>
    </Panel>
  );
}

/** §40 이력 — 읽기만 한다 */
export function BookHistory() {
  const [span, setSpan] = useState<'day' | 'week' | 'month' | 'all'>('month');
  const [anchor, setAnchor] = useState(todayKst());
  const [chip, setChip] = useState<BookHistoryAction | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [closedDays, setClosedDays] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const q = useBookHistory({
    span,
    anchor,
    ...(chip ? { action: chip } : {}),
    ...(studentId ? { studentId } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  });
  const rows = q.data?.items ?? [];
  const groups = [
    ...new Map(rows.map((r) => [r.at.slice(0, 10), rows.filter((x) => x.at.slice(0, 10) === r.at.slice(0, 10))])).entries(),
  ];
  const move = (n: number) => {
    const d = new Date(`${anchor}T00:00:00Z`);
    if (span === 'month') d.setUTCMonth(d.getUTCMonth() + n);
    else d.setUTCDate(d.getUTCDate() + n * (span === 'week' ? 7 : 1));
    setAnchor(d.toISOString().slice(0, 10));
  };
  /*
   * 활동 추이 — **가장 최근 14일**을 오래된 날 → 최근 순으로 그린다 (원본 §40 · P0).
   * 서버 byDay 는 이력 줄 순서(최신 먼저)라 끝에서 자르면 오늘이 빠지고 순서가 뒤집혔다.
   * 받은 순서에 기대지 않도록 날짜 키로 줄 세운 뒤 뒤 14일을 쓴다. 제목 일수도 이 배열 길이다.
   */
  const trend = [...(q.data?.byDay ?? [])].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(-14);
  // 막대 높이는 그린 14일 중 가장 많은 날에 맞춘다 — 건수 × 고정 px 는 7건부터 칸을 뚫고 나갔다 (§40)
  const trendMax = Math.max(1, ...trend.map((day) => day.count));
  const periodLabel = span === 'month' ? `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월` : anchor;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* 원문 §40 기간 토글은 알약 — 공용 Segmented (g4 §40-5) */}
        <Segmented
          ariaLabel="기간"
          options={[
            { value: 'day', label: '일간' },
            { value: 'week', label: '주간' },
            { value: 'month', label: '월간' },
            { value: 'all', label: '전체' },
          ]}
          value={span}
          onChange={setSpan}
        />
        {span !== 'all' ? (
          <div className="flex min-w-80 items-center rounded-lg border border-line bg-card">
            <button className="px-3 py-2" aria-label="이전 기간" onClick={() => move(-1)}>
              ‹
            </button>
            <b className="min-w-36 flex-1 text-center text-[12px]">
              {periodLabel}
              <small className="ml-2 font-normal text-fg-subtle">
                {span === 'month' ? '한 달' : span === 'week' ? '한 주' : '하루'}
              </small>
            </b>
            <button className="px-3 py-2" aria-label="다음 기간" onClick={() => move(1)}>
              ›
            </button>
            <button className="border-l border-line px-3 py-2 font-bold" onClick={() => setAnchor(todayKst())}>
              오늘
            </button>
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-5 text-[12px]">
          <b className="text-[20px]">
            {q.data?.total ?? '—'}
            <small className="ml-1 text-[11px]">건</small>
          </b>
          <span>
            교재 <b>{q.data?.bookCount ?? '—'}</b>
          </span>
          <span>
            안내 <b>{q.data?.guideCount ?? '—'}</b>
          </span>
        </div>
        <div className="ml-auto w-full sm:w-64">
          <SearchField label="교재 이력 검색" onQueryChange={setSearch} placeholder="학생 · 강사 · 교재" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-inset p-2">
        {/* 상위 두 갈래 — 수는 서버 bookCount · guideCount 그대로 (g4 §40-3) */}
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-fg">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-green" />
          {`교재 ${q.data?.bookCount ?? 0}`}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-fg">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-blue" />
          {`수업 안내 ${q.data?.guideCount ?? 0}`}
        </span>
        <span aria-hidden className="mx-1 h-4 w-px bg-line" />
        <button type="button" onClick={() => setChip(null)}>
          <Chip tone={chip === null ? 'info' : 'neutral'} styleKind={chip === null ? 'solid' : 'soft'}>
            전체
          </Chip>
        </button>
        {(q.data?.actions ?? []).map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => {
              if (isBookHistoryAction(action.key)) setChip(action.key);
            }}
          >
            <Chip tone={chip === action.key ? 'info' : 'neutral'} styleKind={chip === action.key ? 'solid' : 'soft'}>
              {`${withSymbol(action.key, action.label)} ${action.count}`}
            </Chip>
          </button>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
        <Panel title={`이력 ${q.data?.total ?? 0}건`} sub="배부·회수·판 변경·안내가 한 흐름에 남습니다">
          {rows.length === 0 ? (
            <p className="px-1 py-8 text-center text-[12px] text-fg-subtle">
              {q.isLoading ? '불러오는 중…' : '이력이 없습니다'}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map(([day, dayRows]) => (
                <section key={day}>
                  <button
                    type="button"
                    aria-expanded={!closedDays.has(day)}
                    aria-controls={`book-history-${day}`}
                    aria-label={`${longDateLabel(day)} 이력 ${closedDays.has(day) ? '펼치기' : '접기'}`}
                    className="mb-1 flex w-full items-center gap-2 border-b border-line pb-1 text-left text-[12px] font-bold"
                    onClick={() =>
                      setClosedDays((old) => {
                        const next = new Set(old);
                        if (next.has(day)) next.delete(day);
                        else next.add(day);
                        return next;
                      })
                    }
                  >
                    <span>{longDateLabel(day)}</span>
                    <small>{dayRows.length}건</small>
                    {/* 원문 §40 — 「오늘」 배지는 날짜 머리 오른쪽 끝 (g4 §40-5) */}
                    <span className="ml-auto flex items-center gap-2">
                      {day === todayKst() ? <Chip size="compact">오늘</Chip> : null}
                      <span aria-hidden>{closedDays.has(day) ? '▸' : '▾'}</span>
                    </span>
                  </button>
                  {closedDays.has(day) ? null : (
                    <div id={`book-history-${day}`} className="space-y-1">
                      {dayRows.map((row) => (
                        <div
                          key={row.id}
                          data-history-group={actionLook(row.action).group}
                          className={cn(
                            'grid grid-cols-[48px_104px_minmax(180px,1fr)_110px_minmax(120px,1fr)_90px_80px] items-center gap-2 border-l-4 px-2 py-2 text-[11px]',
                            GROUP_STRIPE[actionLook(row.action).group],
                          )}
                        >
                          <span className="font-bold text-fg-subtle">{row.at.slice(11, 16)}</span>
                          <b className={GROUP_TEXT[actionLook(row.action).group]}>{withSymbol(row.action, row.actionLabel)}</b>
                          {/* 대상이 지워진 줄은 서버가 「지워진 배부 #23」이라 적는다 — 흐리게 (g4 §40-2) */}
                          <span className={row.refMissing ? 'italic text-fg-subtle' : 'font-bold text-fg'}>{row.subject ?? '—'}</span>
                          <span>{row.code ? <Chip size="compact">{row.code}</Chip> : '—'}</span>
                          <span className="truncate text-fg-subtle" title={row.memo ?? undefined}>
                            {row.memo ?? '—'}
                          </span>
                          <span>{row.teacherName ? `${row.teacherName} 강사` : '—'}</span>
                          <span>{row.byName ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </Panel>
        <aside className="space-y-3">
          <Panel title={`활동 추이 · ${trend.length}일`}>
            <div className="flex h-24 items-end gap-1">
              {trend.map((day) => (
                <div key={day.key} className="flex min-w-2 flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className="w-full rounded-t bg-primary"
                    style={{ height: `${Math.max(4, Math.round((day.count / trendMax) * TREND_BAR_MAX))}px` }}
                    title={`${day.label} ${day.count}건`}
                  />
                  <small>{Number(day.key.slice(8))}</small>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={`학생별 · ${q.data?.byStudent.length ?? 0}명`}>
            <div className="space-y-1">
              <button
                className={`flex w-full justify-between rounded px-2 py-2 text-[12px] font-bold ${studentId === null ? 'bg-header text-card' : ''}`}
                onClick={() => setStudentId(null)}
              >
                <span>전체</span>
                <b>{q.data?.total ?? 0}</b>
              </button>
              {(q.data?.byStudent ?? []).map((student) => (
                <button
                  key={student.key}
                  className={`flex w-full justify-between rounded px-2 py-2 text-[12px] ${studentId === Number(student.key) ? 'bg-header text-card' : ''}`}
                  onClick={() => setStudentId(Number(student.key))}
                >
                  <span>{student.label}</span>
                  <b>{student.count}</b>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="여기에 남는 것">
            <ul className="list-disc space-y-2 pl-4 text-[11px]">
              <li>교재 배부 · 교체 · 제외 · 업로드</li>
              <li>강사 변경 요청과 처리 결과</li>
              <li>수업 안내 작성 · 발송 · 강사 확인</li>
              <li>강사 교체와 승계 내역</li>
              <li>6시간 마감 초과 기록</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
