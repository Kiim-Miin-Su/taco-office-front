/** @file-guide
 * 목적: §38 학생별 교재 트래킹과 배부·진도·회수를 한 화면에 조립한다.
 * 책임/재사용: 서버 tracking DTO를 그리며 상태·퍼센트를 다시 판정하지 않는다. 쓰기는 공용 query family로 수렴한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useState } from 'react';
import { apiMessage } from '@/api/client';
import {
  useBooks,
  useBookTracking,
  useCreateBookIssue,
  useMeta,
  useReturnBookIssue,
  useTransitionBookIssue,
  useUpdateBookProgress,
} from '@/api/queries';
import { Banner, Button, Chip, Input, Label, Panel, QueryState, Select, StatCard, cn, type StatTone } from '@/components/ui';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';
import { bookLevelPresentation } from '@/lib/book-presentation';
import { todayKst } from '@/lib/calendar';

/**
 * 머리 여섯 칸의 **자리별 색** — 원문 §38-6 윗줄: 검정 · 호박 · 청록 · 빨강 · 보라 · 초록(컷 실측).
 * 칸 이름·수·차례는 서버 `states` 그대로이고 화면은 자리에 색만 붙인다.
 */
const HEAD_TONE: readonly StatTone[] = ['neutral', 'warning', 'teal', 'danger', 'purple', 'success'];

/** 진도율 카드 왼쪽 띠 — 서가 카드 띠(bookLevelPresentation.bandClass)와 같은 색. 확정 레벨이 아니면 선 색 */
const LEVEL_BORDER: Readonly<Record<string, string>> = { 'bg-red': 'border-l-red', 'bg-amber': 'border-l-amber', 'bg-green': 'border-l-green' };

export function BookTracking({
  createRequest = 0,
  showCreateAction = true,
}: {
  createRequest?: number;
  showCreateAction?: boolean;
}) {
  const q = useBookTracking();
  const meta = useMeta();
  const books = useBooks();
  const create = useCreateBookIssue();
  const progress = useUpdateBookProgress();
  const ret = useReturnBookIssue();
  const transition = useTransitionBookIssue();
  const [adding, setAdding] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [libId, setLibId] = useState('');
  const [pages, setPages] = useState<Record<number, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  useEffect(() => {
    if (createRequest > 0) setAdding(true);
  }, [createRequest]);
  const error = create.error ?? transition.error ?? progress.error ?? ret.error;
  return (
    <div className="space-y-3">
      {showCreateAction ? (
        <div className="flex justify-end">
          <Button aria-expanded={adding} aria-controls="book-issue-create" onClick={() => setAdding((x) => !x)}>
            + 배부
          </Button>
        </div>
      ) : null}
      {adding ? (
        <div id="book-issue-create">
          <Panel title="교재 배부" sub="학생과 교재는 DB 식별자로 연결하며 중복 배부는 서버가 막습니다">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="issue-student">학생</Label>
                <Select id="issue-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">선택</option>
                  {meta.data?.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.grade ?? '학년 미정'}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="issue-book">교재</Label>
                <Select id="issue-book" value={libId} onChange={(e) => setLibId(e.target.value)}>
                  <option value="">선택</option>
                  {books.data?.items.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdding(false)}>
                취소
              </Button>
              <Button
                disabled={!studentId || !libId || create.isPending}
                onClick={() =>
                  create.mutate(
                    { studentId: Number(studentId), libId: Number(libId), state: 'ok' },
                    {
                      onSuccess: () => {
                        setAdding(false);
                        setStudentId('');
                        setLibId('');
                      },
                    },
                  )
                }
              >
                배부 완료
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}
      {error ? <Banner tone="danger">{apiMessage(error)}</Banner> : null}
      <QueryState query={q} empty="등록된 학생이 없습니다" isEmpty={(d) => d.students.length === 0}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {d.states.map((s, n) => (
                <StatCard
                  key={s.key}
                  label={s.label}
                  value={s.count}
                  tone={HEAD_TONE[n] ?? 'neutral'}
                  // 원문 §38-6: 칸마다 색 윗줄 · 0 인 칸 흐림 · 「정상」(마지막 칸)은 0 이어도 초록 채움
                  accent={HEAD_TONE[n] ?? 'neutral'}
                  fill={n === 5}
                  dim={s.count === 0 && n !== 5}
                />
              ))}
            </div>
            {d.teacherRequests.length ? (
              <Banner tone="warning">
                <div className="flex flex-wrap items-center gap-2">
                  <b>강사 교재 변경 요청 {d.teacherRequests.length}건</b>
                  {d.teacherRequests.map((request) => (
                    <Chip key={request.id}>
                      {request.studentName ? `${request.studentName} ` : ''}
                      {request.message}
                    </Chip>
                  ))}
                </div>
              </Banner>
            ) : null}
            <Panel title={`학생 ${d.students.length}명`} sub="학생마다 어디까지 갔는지 한 줄로 봅니다">
              <div className="overflow-x-auto">
                <div className="min-w-[1120px] space-y-2">
                  <div className="grid grid-cols-[30px_150px_minmax(300px,1fr)_180px_220px_120px_64px] px-3 text-[11px] font-bold text-fg-subtle">
                    <span />
                    <span>학생</span>
                    <span>교재</span>
                    <span>진도</span>
                    <span>할 일</span>
                    <span>다음 수업</span>
                    <span>자세히</span>
                  </div>
                  {d.students.map((s) => (
                    <article key={s.id} className="overflow-hidden rounded-xl border border-line bg-card text-[12px]">
                      <div className="grid grid-cols-[30px_150px_minmax(300px,1fr)_180px_220px_120px_64px] items-center gap-2 px-3 py-3">
                        <button
                          type="button"
                          aria-expanded={expandedId === s.id}
                          aria-controls={`book-student-${s.id}-detail`}
                          aria-label={`${s.name} ${expandedId === s.id ? '접기' : '펼치기'}`}
                          onClick={() => setExpandedId((value) => (value === s.id ? null : s.id))}
                          className="font-bold text-fg-subtle"
                        >
                          <span aria-hidden>{expandedId === s.id ? '▾' : '▸'}</span>
                        </button>
                        <div>
                          <b>{s.name}</b> <Chip size="compact">{s.grade ?? '—'}</Chip>
                          <p className="mt-1 text-[10px] text-fg-subtle">{s.teacherName ?? '담당 미정'}</p>
                        </div>
                        <div className="space-y-1">
                          {s.issues.length ? (
                            s.issues.map((issue) => {
                              const book = books.data?.items.find((item) => item.id === issue.libId);
                              return (
                                <div key={issue.id} className="flex flex-wrap items-center gap-1">
                                  {/* 레벨 글자 사각 — §39 서가와 같은 선택기(M 초록 · P 주황 · F 빨강 · 그 밖은 중립) (g4 §38-3) */}
                                  <span
                                    data-level-marker
                                    title={bookLevelPresentation(book?.level).label}
                                    className={cn(
                                      'inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] px-0.5 text-[10px] font-bold text-white',
                                      bookLevelPresentation(book?.level).bandClass,
                                    )}
                                  >
                                    {bookLevelPresentation(book?.level).marker.slice(0, 1)}
                                  </span>
                                  <b>
                                    {book?.title ?? `교재 #${issue.libId}`}
                                    {issue.edition ? ` · ${issue.edition}` : ''}
                                  </b>
                                  {issue.seFileId ? <FileDownloadButton id={issue.seFileId} label="SE" /> : null}
                                  {issue.teFileId ? <FileDownloadButton id={issue.teFileId} label="TE" /> : null}
                                </div>
                              );
                            })
                          ) : (
                            <Chip tone="danger">교재 없음</Chip>
                          )}
                        </div>
                        <div className="space-y-1">
                          {s.issues.length ? (
                            s.issues.map((issue) => {
                              const book = books.data?.items.find((item) => item.id === issue.libId);
                              return (
                                // 교재 이름은 옆 교재 열과 줄을 맞춰 한 번만 적는다 — 여기는 % 만 (g4 §38-4)
                                <div key={issue.id} className="flex items-center gap-2" title={book?.title ?? `교재 #${issue.libId}`}>
                                  <b>{issue.progressPercent == null ? '—' : `${issue.progressPercent}%`}</b>
                                </div>
                              );
                            })
                          ) : (
                            <b>—</b>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {s.todos.map((todo) => (
                            <Chip
                              key={todo.key}
                              size="compact"
                              tone={
                                todo.key === 'teacher_request'
                                  ? 'purple'
                                  : todo.key === 'guide_done'
                                    ? 'info'
                                    : todo.key === 'guide_missing'
                                      ? 'danger'
                                      : 'warning'
                              }
                            >
                              {todo.label}
                              {todo.count > 1 ? ` ${todo.count}` : ''}
                            </Chip>
                          ))}
                        </div>
                        <div className="font-bold">
                          {s.nextLesson ? (
                            <>
                              {/* 원문 「오늘 / 08-21」 — 둘째 줄은 날짜 (g4 §38-5) */}
                              <span>{s.nextLesson.slice(0, 10) === todayKst() ? '오늘' : s.nextLesson.slice(11, 16)}</span>
                              <p className="text-[10px] text-fg-subtle">{s.nextLesson.slice(5, 10)}</p>
                            </>
                          ) : (
                            '예정 없음'
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-expanded={expandedId === s.id}
                          aria-controls={`book-student-${s.id}-detail`}
                          aria-label={`${s.name} 자세히 ${expandedId === s.id ? '접기' : '펼치기'}`}
                          onClick={() => setExpandedId((value) => (value === s.id ? null : s.id))}
                        >
                          자세히
                        </Button>
                      </div>
                      {expandedId === s.id ? (
                        <div id={`book-student-${s.id}-detail`} className="border-t border-line bg-inset px-4 py-3">
                          <div className="space-y-2">
                            {s.issues.length ? (
                              s.issues.map((issue) => {
                                const book = books.data?.items.find((item) => item.id === issue.libId);
                                const bookTitle = book?.title ?? `교재 #${issue.libId}`;
                                return (
                                  <div key={issue.id} className="flex flex-wrap items-center gap-2">
                                    <b className="min-w-56">
                                      {bookTitle}
                                      {issue.edition ? ` · ${issue.edition}` : ''}
                                    </b>
                                    <Chip size="compact" tone={issue.state === 'ok' ? 'success' : 'warning'}>
                                      {issue.stateLabel}
                                    </Chip>
                                    {issue.state === 'wait' ? (
                                      <Button
                                        size="sm"
                                        aria-label={`${s.name} ${bookTitle} 승인`}
                                        disabled={transition.isPending}
                                        onClick={() => transition.mutate({ id: issue.id, state: 'auto' })}
                                      >
                                        승인
                                      </Button>
                                    ) : issue.state === 'auto' ? (
                                      <Button
                                        size="sm"
                                        aria-label={`${s.name} ${bookTitle} 전달 완료`}
                                        disabled={transition.isPending}
                                        onClick={() => transition.mutate({ id: issue.id, state: 'ok' })}
                                      >
                                        전달 완료
                                      </Button>
                                    ) : issue.state === 'ok' ? (
                                      <>
                                        <Input
                                          aria-label={`${s.name} ${bookTitle} 진도 쪽수`}
                                          className="!h-8 !w-20 !px-2"
                                          type="number"
                                          min={0}
                                          max={book?.pages ?? undefined}
                                          value={pages[issue.id] ?? issue.progressPage ?? ''}
                                          onChange={(event) =>
                                            setPages((value) => ({ ...value, [issue.id]: event.target.value }))
                                          }
                                        />
                                        <span>/ {book?.pages ?? '—'}쪽</span>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          aria-label={`${s.name} ${bookTitle} 진도 저장`}
                                          disabled={!pages[issue.id] || progress.isPending}
                                          onClick={() =>
                                            progress.mutate({ id: issue.id, progressPage: Number(pages[issue.id]) })
                                          }
                                        >
                                          저장
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          aria-label={`${s.name} ${bookTitle} 회수`}
                                          disabled={ret.isPending}
                                          onClick={() => ret.mutate({ id: issue.id })}
                                        >
                                          회수
                                        </Button>
                                      </>
                                    ) : null}
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-fg-subtle">배부된 교재가 없습니다.</p>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            </Panel>
            <section>
              <h3 className="mb-2 text-[13px] font-bold">
                교재별 진도율 <span className="font-normal text-fg-subtle">{d.books.length}종 · 숙제 페이지 기준</span>
              </h3>
              {/*
                원본 §38 「교재별 진도율」 카드(g4 §38-7) — 제목줄 = 레벨 배지 + 제목 + 오른쪽 「N명」, 막대 오른쪽 큰 %,
                막대 위 평균 표시선, 레벨색 왼쪽 띠, 넓은 화면 3열. 평균·범위·학생별 % 는 서버 값 그대로다(D-R37).
              */}
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {d.books.map((book) => {
                  const level = bookLevelPresentation(book.level);
                  return (
                    <article key={book.libId} data-testid="book-progress-card"
                      className={`rounded-xl border border-l-4 border-line bg-card p-4 ${LEVEL_BORDER[level.bandClass] ?? 'border-l-line'}`}>
                      <header className="flex items-center gap-2">
                        {book.level ? (
                          <span data-level-marker title={level.label}
                            className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-[12px] font-black text-white ${level.bandClass}`}>
                            {level.marker}
                          </span>
                        ) : null}
                        <h4 className="min-w-0 flex-1 text-[14px] font-bold text-fg">{book.title}</h4>
                        <span className="shrink-0 text-[12px] font-bold text-fg-subtle">{`${book.studentCount}명`}</span>
                      </header>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="relative h-2 flex-1 rounded bg-inset">
                          <div className="h-full rounded bg-green" style={{ width: `${book.averagePercent ?? 0}%` }} />
                          {book.averagePercent == null ? null : (
                            <span data-average-mark aria-hidden className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-fg"
                              style={{ left: `${book.averagePercent}%` }} />
                          )}
                        </div>
                        <b data-progress-average className="w-14 shrink-0 text-right text-[20px] text-green">
                          {book.averagePercent == null ? '—' : `${book.averagePercent}%`}
                        </b>
                      </div>
                      <div className="mt-1 flex justify-between text-[12px] text-fg-subtle">
                        <span>
                          {book.averagePercent == null ? '진도 미입력' : `${book.minPercent ?? '—'}–${book.maxPercent ?? '—'}%`}
                        </span>
                        <span>{book.pages ?? '—'}쪽</span>
                      </div>
                      <div className="mt-2 space-y-1 border-t border-line pt-2">
                        {book.students.map((student) => (
                          <div
                            key={student.studentId}
                            className="grid grid-cols-[1fr_2fr_44px_36px] items-center gap-2 text-[11px]"
                          >
                            <b>{student.name}</b>
                            <div className="h-1.5 rounded bg-inset">
                              <div className="h-full rounded bg-green" style={{ width: `${student.percent ?? 0}%` }} />
                            </div>
                            <b>{student.percent == null ? '—' : `${student.percent}%`}</b>
                            <span>{student.elapsedDays == null ? '—' : `${student.elapsedDays}일`}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}
