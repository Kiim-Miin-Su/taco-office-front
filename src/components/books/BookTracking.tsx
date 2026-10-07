/** @file-guide
 * 목적: §38 학생별 교재 트래킹과 배부·진도·회수를 한 화면에 조립한다.
 * 책임/재사용: 서버 tracking DTO를 그리며 상태·퍼센트를 다시 판정하지 않는다. 쓰기는 공용 query family로 수렴한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import { apiMessage } from '@/api/client';
import {
  useBookIssueDiag,
  useBooks,
  useBookTracking,
  useMeta,
  useReturnBookIssue,
  useTransitionBookIssue,
  useUpdateBookProgress,
} from '@/api/queries';
import { Banner, Button, Chip, Input, Label, LinkButton, Panel, QueryState, Select, StatCard, Textarea, cn, type StatTone } from '@/components/ui';
import type { Book, BookTrackingStudent, LeadDiag } from '@/api/types';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';
import { bookLevelPresentation, bookLevelUiLabel, issueFormTone } from '@/lib/book-presentation';
import { todayKst } from '@/lib/calendar';
import { educationGradeOption } from '@/lib/education-grades';

/**
 * 머리 여섯 칸의 **자리별 색** — 원문 §38-6 윗줄: 검정 · 호박 · 청록 · 빨강 · 보라 · 초록(컷 실측).
 * 칸 이름·수·차례는 서버 `states` 그대로이고 화면은 자리에 색만 붙인다.
 */
const HEAD_TONE: readonly StatTone[] = ['neutral', 'warning', 'teal', 'danger', 'purple', 'success'];

/**
 * 배부 창의 진단 한 줄 (N-62) — 그 학생의 최신 상담 진단을 **보여 주기만** 한다(배부에 옮겨 적지 않는다 · D-R22).
 * 낱말 · 차례는 §44 진단 카드와 같다(영어 · 수학 · 인터뷰 · 레벨 · 진단고사 날). 적지 않은 점수는 「—」 — 0 을 짓지 않는다.
 */
function diagLine(d: LeadDiag): string {
  const scores = [['영어', d.english], ['수학', d.math], ['인터뷰', d.interview]] as const;
  return [
    scores.map(([label, value]) => `${label} ${value ?? '—'}`).join(' · '),
    d.levelLabel ? `레벨 ${d.levelLabel}` : null,
    d.takenOn ? `${d.takenOn} 진단고사` : null,
  ].filter(Boolean).join(' · ');
}

/** 진도율 카드 왼쪽 띠 — 서가 카드 띠(bookLevelPresentation.bandClass)와 같은 색. 확정 레벨이 아니면 선 색 */
const LEVEL_BORDER: Readonly<Record<string, string>> = { 'bg-red': 'border-l-red', 'bg-amber': 'border-l-amber', 'bg-green': 'border-l-green' };
const BOOK_LEVEL_ORDER: Readonly<Record<string, number>> = { foundation: 0, practice: 1, master: 2 };

function gradeNumber(source: unknown, grade: string | null | undefined): number | null {
  if (!grade) return null;
  if (grade === 'K') return 0;
  const direct = /^G(1[0-2]|[1-9])$/.exec(grade);
  if (direct) return Number(direct[1]);
  const projected = educationGradeOption(source, grade)?.sort;
  return typeof projected === 'number' ? projected : null;
}

/** 최신 배정 창은 학년 범위와 시간표 과목이 둘 다 맞는 교재만 보여 준다. 미분류 값은 맞는 것으로 추정하지 않는다. */
function assignmentBooks(books: readonly Book[], source: unknown, grade: string | null | undefined, subKey: string): Book[] {
  const value = gradeNumber(source, grade);
  if (value === null || !subKey) return [];
  return books
    .filter((book) => book.subKey === subKey && book.gradeFrom != null && book.gradeTo != null
      && book.gradeFrom <= value && value <= book.gradeTo)
    .sort((a, b) => (BOOK_LEVEL_ORDER[a.bookLevel ?? ''] ?? 99) - (BOOK_LEVEL_ORDER[b.bookLevel ?? ''] ?? 99)
      || a.title.localeCompare(b.title, 'ko'));
}

function guideMissing(student: BookTrackingStudent): boolean {
  return student.todos.some((todo) => todo.key === 'guide_missing');
}

/** 서버가 준 학년과 안내 상태를 표시 순서에만 사용한다. 학년 대응이나 안내 상태를 화면에서 새로 판정하지 않는다. */
function trackingGroups(students: readonly BookTrackingStudent[], source: unknown): Array<{ grade: string; students: BookTrackingStudent[] }> {
  const byGrade = new Map<string, BookTrackingStudent[]>();
  for (const student of students) {
    const grade = student.grade ?? '학년 미정';
    const rows = byGrade.get(grade) ?? [];
    rows.push(student);
    byGrade.set(grade, rows);
  }
  return [...byGrade.entries()]
    .sort(([a], [b]) => {
      const left = gradeNumber(source, a);
      const right = gradeNumber(source, b);
      if (left !== null && right !== null) return left - right;
      if (left !== null) return -1;
      if (right !== null) return 1;
      return a.localeCompare(b, 'ko', { numeric: true });
    })
    .map(([grade, rows]) => ({
      grade,
      students: rows.sort((a, b) => Number(guideMissing(b)) - Number(guideMissing(a)) || a.name.localeCompare(b.name, 'ko')),
    }));
}

export function BookTracking({
  view = 'all',
  createRequest = 0,
  showCreateAction = true,
  requestedStudentId = null,
  targetRequested = false,
}: {
  /** 최신 수정사항은 진행도와 학생 트래킹을 별도 보기로 둔다. 단독 사용처는 기존 전체 보기를 유지한다. */
  view?: 'all' | 'progress' | 'tracking';
  createRequest?: number;
  showCreateAction?: boolean;
  requestedStudentId?: number | null;
  targetRequested?: boolean;
}) {
  const q = useBookTracking();
  const meta = useMeta();
  const books = useBooks();
  const progress = useUpdateBookProgress();
  const ret = useReturnBookIssue();
  const transition = useTransitionBookIssue();
  const [adding, setAdding] = useState(false);
  const [teacherId, setTeacherId] = useState('');
  const [subjectKey, setSubjectKey] = useState('');
  const [studentId, setStudentId] = useState('');
  const [libId, setLibId] = useState('');
  const [reason, setReason] = useState('');
  const [form, setForm] = useState('');
  const [reissuedFrom, setReissuedFrom] = useState<number | null>(null);
  const diag = useBookIssueDiag(adding && studentId ? Number(studentId) : null);
  const [pages, setPages] = useState<Record<number, string>>({});
  const [returnDates, setReturnDates] = useState<Record<number, string>>({});
  const [endReasons, setEndReasons] = useState<Record<number, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const requestedStudent = requestedStudentId === null
    ? null
    : meta.data?.students.find((student) => student.id === requestedStudentId) ?? null;
  const targetMissing = targetRequested && meta.data !== undefined && requestedStudent === null;
  const showTracking = view !== 'progress';
  const showProgress = view !== 'tracking';
  const selectedStudent = meta.data?.students.find((student) => student.id === Number(studentId)) ?? null;
  const eligibleBooks = useMemo(() => assignmentBooks(
    books.data?.items ?? [],
    meta.data,
    selectedStudent?.grade,
    subjectKey,
  ), [books.data?.items, meta.data, selectedStudent?.grade, subjectKey]);
  const selectableBooks = reissuedFrom && libId && !eligibleBooks.some((book) => book.id === Number(libId))
    ? [books.data?.items.find((book) => book.id === Number(libId)), ...eligibleBooks].filter((book): book is Book => !!book)
    : eligibleBooks;
  useEffect(() => {
    if (targetRequested && requestedStudent) setExpandedId(requestedStudent.id);
    if (createRequest <= 0) return;
    if (!targetRequested) {
      setAdding(true);
      return;
    }
    if (requestedStudent) {
      setStudentId(String(requestedStudent.id));
      setAdding(true);
    } else if (meta.data !== undefined) {
      setAdding(false);
      setStudentId('');
    }
  }, [createRequest, meta.data, requestedStudent, targetRequested]);
  const resetCreate = () => {
    setAdding(false);
    setTeacherId('');
    setSubjectKey('');
    setStudentId('');
    setLibId('');
    setReason('');
    setForm('');
    setReissuedFrom(null);
  };
  const beginReissue = (student: number, issue: { id: number; libId: number }) => {
    setStudentId(String(student));
    setLibId(String(issue.libId));
    setTeacherId('');
    setSubjectKey('');
    setReissuedFrom(issue.id);
    setReason('');
    setForm('');
    setAdding(true);
  };
  const error = transition.error ?? progress.error ?? ret.error;
  return (
    <div className="space-y-3">
      {showCreateAction ? (
        <div className="flex justify-end">
          <Button aria-expanded={adding} aria-controls="book-issue-create" onClick={() => adding ? resetCreate() : setAdding(true)}>
            + 배정
          </Button>
        </div>
      ) : null}
      {targetMissing ? (
        <Banner tone="warning">
          요청한 학생을 찾을 수 없습니다. 다른 학생을 대신 선택하거나 배부를 등록하지 않습니다.{' '}
          <LinkButton
            href="/students"
            size="sm"
            variant="secondary"
          >
            학생 목록으로 돌아가기
          </LinkButton>
        </Banner>
      ) : null}
      {adding ? (
        <div id="book-issue-create">
          <Panel
            title={reissuedFrom ? '교재 재배정 준비' : '교재 배정 준비'}
            sub="강사와 과목을 먼저 고른 뒤 학생 학년에 맞는 교재를 선택합니다"
          >
            <Banner tone="warning" className="mb-3">
              강사·과목을 함께 저장하는 배정 기능을 준비 중입니다. 선택 정보가 빠진 배부 기록을 만들지 않도록 저장을 잠갔습니다.
            </Banner>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="issue-teacher">강사</Label>
                <Select id="issue-teacher" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
                  <option value="">먼저 선택</option>
                  {meta.data?.staff.filter((staff) => !staff.canAdminPage).map((staff) => (
                    <option key={staff.id} value={staff.id}>{staff.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="issue-subject">과목</Label>
                <Select id="issue-subject" value={subjectKey} onChange={(event) => {
                  setSubjectKey(event.target.value);
                  if (!reissuedFrom) setLibId('');
                }}>
                  <option value="">먼저 선택</option>
                  {meta.data?.subs.map((subject) => (
                    <option key={subject.key} value={subject.key}>{subject.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="issue-student">학생</Label>
                <Select id="issue-student" value={studentId} disabled={reissuedFrom !== null || !teacherId || !subjectKey}
                  onChange={(event) => { setStudentId(event.target.value); setLibId(''); }}>
                  <option value="">선택</option>
                  {meta.data?.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="issue-book">교재</Label>
                <Select id="issue-book" value={libId} disabled={reissuedFrom !== null || !selectedStudent}
                  onChange={(event) => setLibId(event.target.value)}>
                  <option value="">선택</option>
                  {selectableBooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {bookLevelUiLabel(b.bookLevel, b.levelLabel)} · {b.title}
                    </option>
                  ))}
                </Select>
                {selectedStudent && subjectKey && selectableBooks.length === 0 ? (
                  <p className="mt-1 text-[12px] text-danger">{selectedStudent.grade ?? '학년 미정'}과 이 과목에 맞는 교재가 없습니다.</p>
                ) : null}
              </div>
              {/* N-62 — 그 학생의 최신 상담 진단 한 줄(읽기만) */}
              {studentId ? (
                <p data-testid="issue-diag" className="text-[12px] text-fg-subtle sm:col-span-2">
                  <b className="mr-1 text-fg">최근 진단</b>
                  {diag.isPending ? '불러오는 중' : diag.data?.diag ? diagLine(diag.data.diag) : '상담 진단 기록이 없습니다'}
                </p>
              ) : null}
              {/* §38-2 형태(선택) — 낱말은 서버 issueForms 그대로 · 고르지 않으면 칩이 서지 않는다 (W11 A') */}
              <div>
                <Label htmlFor="issue-form">형태</Label>
                <Select id="issue-form" value={form} onChange={(e) => setForm(e.target.value)}>
                  <option value="">—</option>
                  {q.data?.issueForms.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="issue-reason">사유</Label>
                <Textarea
                  id="issue-reason"
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="무슨 교재를 왜 줬는지 남습니다"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {targetRequested && requestedStudent ? (
                <LinkButton href={`/students/${requestedStudent.id}?tab=books`} size="sm" variant="secondary">
                  학생 허브로 돌아가기
                </LinkButton>
              ) : null}
              <Button variant="secondary" onClick={resetCreate}>
                취소
              </Button>
              <Button
                disabled
                title="강사·과목을 함께 저장하는 기능을 준비 중입니다"
              >
                저장 준비 중
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}
      {error ? <Banner tone="danger">{apiMessage(error)}</Banner> : null}
      <QueryState query={q} empty="등록된 학생이 없습니다" isEmpty={(d) => d.students.length === 0}>
        {(d) => (
          <>
            {showTracking ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
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
            </div> : null}
            {showTracking && d.teacherRequests.length ? (
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
            {showTracking && d.students.some(guideMissing) ? (
              <Banner tone="danger">
                <b>교재 안내가 안 나간 학생 {d.students.filter(guideMissing).length}명</b> — 먼저 보내 주세요.
              </Banner>
            ) : null}
            {showTracking ? <Panel title={`트래킹 보드 · 학생 ${d.students.length}명`} sub="교재 안내 미발송 우선 · 학년별 · 학생 이름 순">
              <div className="overflow-x-auto">
                <div className="min-w-[1120px] space-y-2">
                  <div className="grid grid-cols-[30px_150px_minmax(300px,1fr)_180px_220px_120px_64px] px-3 text-[12px] font-bold text-fg-subtle">
                    <span />
                    <span>학생</span>
                    <span>교재</span>
                    <span>진도</span>
                    <span>할 일</span>
                    <span>다음 수업</span>
                    <span>자세히</span>
                  </div>
                  {trackingGroups(d.students, meta.data).flatMap((group) => [
                    <div key={`grade-${group.grade}`} className="flex items-center gap-2 border-b border-line px-3 pb-1 pt-3">
                      <b>{group.grade}</b>
                      {educationGradeOption(meta.data, group.grade)?.equivalenceHint ? (
                        <span className="text-[12px] text-fg-subtle">{educationGradeOption(meta.data, group.grade)?.equivalenceHint}</span>
                      ) : null}
                      <Chip size="compact">{group.students.length}명</Chip>
                    </div>,
                    ...group.students.map((s) => (
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
                          <p className="mt-1 text-[12px] text-fg-subtle">{s.teacherName ?? '담당 미정'}</p>
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
                                    title={bookLevelPresentation(book?.levelLabel).label}
                                    className={cn(
                                      'inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] px-0.5 text-[12px] font-bold text-white',
                                      bookLevelPresentation(book?.levelLabel).bandClass,
                                    )}
                                  >
                                    {bookLevelPresentation(book?.levelLabel).marker.slice(0, 1)}
                                  </span>
                                  <b>
                                    {book?.title ?? `교재 #${issue.libId}`}
                                    {issue.edition ? ` · ${issue.edition}` : ''}
                                  </b>
                                  {issue.seFileId ? <FileDownloadButton id={issue.seFileId} label="SE" /> : null}
                                  {issue.teFileId ? <FileDownloadButton id={issue.teFileId} label="TE" /> : null}
                                  {/* 원문 §38 교재 칸 아래 형태 칩 「PDF」 · 「실물 책」 — 승인 대기 요청 줄에도 선다 (7-3 §38-2 · W11 A') */}
                                  {issue.formLabel ? (
                                    <span data-issue-form className="basis-full">
                                      <Chip size="compact" styleKind="solid" tone={issueFormTone(issue.form)}>{issue.formLabel}</Chip>
                                    </span>
                                  ) : null}
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
                              <p className="text-[12px] text-fg-subtle">{s.nextLesson.slice(5, 10)}</p>
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
                          <div className="mb-3 flex flex-wrap justify-end gap-2">
                            <LinkButton href={`/guides?tab=students&studentId=${s.id}`} size="sm">
                              교재 안내 보내기
                            </LinkButton>
                          </div>
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
                                    {issue.state === 'wait' || issue.state === 'auto' ? (
                                      <>
                                        <Button
                                          size="sm"
                                          aria-label={`${s.name} ${bookTitle} ${issue.state === 'wait' ? '승인' : '전달 완료'}`}
                                          disabled={transition.isPending}
                                          onClick={() => transition.mutate({ id: issue.id, state: issue.state === 'wait' ? 'auto' : 'ok' })}
                                        >
                                          {issue.state === 'wait' ? '승인' : '전달 완료'}
                                        </Button>
                                        <Input
                                          aria-label={`${s.name} ${bookTitle} 종료 사유`}
                                          className="!h-8 !w-48 !px-2"
                                          maxLength={500}
                                          value={endReasons[issue.id] ?? ''}
                                          onChange={(event) => setEndReasons((value) => ({ ...value, [issue.id]: event.target.value }))}
                                          placeholder="취소·반려 사유"
                                        />
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          aria-label={`${s.name} ${bookTitle} 반려`}
                                          disabled={!endReasons[issue.id]?.trim() || transition.isPending}
                                          onClick={() => transition.mutate({ id: issue.id, state: 'rejected', reason: endReasons[issue.id].trim() })}
                                        >
                                          반려
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          aria-label={`${s.name} ${bookTitle} 취소`}
                                          disabled={!endReasons[issue.id]?.trim() || transition.isPending}
                                          onClick={() => transition.mutate({ id: issue.id, state: 'canceled', reason: endReasons[issue.id].trim() })}
                                        >
                                          취소
                                        </Button>
                                      </>
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
                                        <Input
                                          aria-label={`${s.name} ${bookTitle} 회수일`}
                                          className="!h-8 !w-36 !px-2"
                                          type="date"
                                          min={issue.issuedOn ?? undefined}
                                          value={returnDates[issue.id] ?? todayKst()}
                                          onChange={(event) => setReturnDates((value) => ({ ...value, [issue.id]: event.target.value }))}
                                        />
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          aria-label={`${s.name} ${bookTitle} 회수`}
                                          disabled={ret.isPending}
                                          onClick={() => ret.mutate({ id: issue.id, returnedOn: returnDates[issue.id] ?? todayKst() })}
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
                            {s.reissueCandidates?.length ? (
                              <div className="border-t border-line pt-2">
                                <p className="mb-2 font-bold">종료된 교재 재배부</p>
                                <div className="space-y-2">
                                  {s.reissueCandidates.map((issue) => {
                                    const book = books.data?.items.find((item) => item.id === issue.libId);
                                    const bookTitle = book?.title ?? `교재 #${issue.libId}`;
                                    return (
                                      <div key={issue.id} className="flex flex-wrap items-center gap-2">
                                        <b className="min-w-56">{bookTitle}</b>
                                        <Chip size="compact">{issue.stateLabel}</Chip>
                                        <span className="text-fg-subtle">
                                          {issue.endedReason ?? (issue.returnedOn ? `${issue.returnedOn} 회수` : '종료')}
                                          {issue.endedByName ? ` · ${issue.endedByName}` : ''}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          aria-label={`${s.name} ${bookTitle} 재배부`}
                                          onClick={() => beginReissue(s.id, issue)}
                                        >
                                          재배부
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </article>
                    )),
                  ])}
                </div>
              </div>
            </Panel> : null}
            {showProgress ? <section aria-label="교재 진행도">
              <h3 className="mb-2 text-[13px] font-bold">
                교재별 진행도 <span className="font-normal text-fg-subtle">{d.books.length}종 · 현재 ISSUE 진행 쪽 기준</span>
              </h3>
              <Banner tone="info" className="mb-3">
                현재 계약은 교재별 현재 쪽과 평균 진도만 제공합니다. 리포트의 수업별 진도·숙제 원장이 연결되기 전에는 2주 멈춤, 최근 4주 숙제, 완료 예상일을 계산하지 않습니다.
              </Banner>
              {/*
                원본 §38 「교재별 진도율」 카드(g4 §38-7) — 제목줄 = 레벨 배지 + 제목 + 오른쪽 「N명」, 막대 오른쪽 큰 %,
                막대 위 평균 표시선, 레벨색 왼쪽 띠, 넓은 화면 3열. 평균·범위·학생별 % 는 서버 값 그대로다(D-R37).
              */}
              {d.books.length === 0 ? (
                <Banner tone="neutral">학생에게 배부된 교재가 없어 진도율을 표시할 수 없습니다.</Banner>
              ) : (
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
                            className="grid grid-cols-[1fr_2fr_44px_36px] items-center gap-2 text-[12px]"
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
              )}
            </section> : null}
          </>
        )}
      </QueryState>
    </div>
  );
}
