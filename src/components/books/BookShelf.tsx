/** @file-guide
 * 목적: §39 서가의 3축 필터·과목 묶음 카드·교재 등록/수정(두 층 분류 · 첫 판)·판 관리를 구현한다.
 * 책임/재사용: BooksDto의 필터 결과·칩 건수·배부 수·파일 사실을 소비하고 공용 폼/BookVersion 컴포넌트를 재사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useBookShelf, useCreateBook, useMeta, usePatchBook } from '@/api/queries';
import type { Book, BookPatch, BookShelfQuery, BookWrite, Books } from '@/api/types';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';
import { Banner, Button, Chip, ChipButton, Input, Label, Panel, QueryState, Select, cn } from '@/components/ui';
import { bookExamTagTone, bookLevelPresentation, bookSubjectColor } from '@/lib/book-presentation';
import { fileSelectionIssue, fileUploadBody } from '@/lib/file-upload';
import { readableAccentColor } from '@/lib/tokens';
import { BookVersionAdder, BookVersionBadge } from './BookVersions';

/**
 * 편집 창 — §39 두 층 분류(N-47)는 코드표 값을 **고른다**(과목 → 소분류 · 레벨 · 학년 범위 · 시험 태그).
 * 옛 칸(레벨 · 학년 원문)은 창에 두지 않는다 — 고치지 않고 그대로 남는다(N-25). 시간표 과목(SUB)은 수업의 교재 요구와
 * 맞춰 보는 다른 축이라 따로 둔다.
 */
type Form = {
  code: string; title: string; pages: string; subKey: string;
  bookSubjectKey: string; bookCategoryKey: string; bookLevel: string; gradeFrom: string; gradeTo: string; examTag: string;
  /** 첫 판(N-61) — 등록 때만 */
  edition: string; fromDate: string;
};
const EMPTY: Form = {
  code: '', title: '', pages: '', subKey: '',
  bookSubjectKey: '', bookCategoryKey: '', bookLevel: '', gradeFrom: '', gradeTo: '', examTag: '',
  edition: '', fromDate: '',
};
/** 레벨 칩 점 — 카드 띠(bookLevelPresentation.bandClass)와 같은 토큰 */
const LEVEL_DOT: Readonly<Record<string, string>> = { 'bg-red': 'var(--red)', 'bg-amber': 'var(--amber)', 'bg-green': 'var(--green)' };
const UNCLASSIFIED_GROUP = '__unclassified__';

type Facet = { key: string; label: string; count: number; dot?: string };

/**
 * 한 줄의 필터 칩 — 원문 §39: 눌린 칩은 진한 채움, **0 인 칩은 흐리게 세워 둔다**(K · G1).
 * 건수는 서버가 센 서가 전체 값 그대로다(D-R37). 눌려 있는 칩은 0 이어도 끌 수 있게 열어 둔다.
 */
function ShelfChips({ label, facets, value, onChange }: {
  label: string; facets: Facet[]; value: string; onChange: (next: string) => void;
}) {
  return (
    <div role="group" aria-label={`${label} 필터`} className="flex flex-wrap items-center gap-1.5">
      <ChipButton pressed={value === ''} pressedTone="ink" onClick={() => onChange('')}>전체</ChipButton>
      {facets.map((f) => (
        <ChipButton key={f.key} pressed={value === f.key} pressedTone="ink" dot={f.dot}
          disabled={f.count === 0 && value !== f.key} onClick={() => onChange(value === f.key ? '' : f.key)}>
          {f.label}{f.count > 0 ? ` ${f.count}` : ''}
        </ChipButton>
      ))}
    </div>
  );
}

const formOf = (b: Book): Form => ({
  ...EMPTY,
  code: b.code, title: b.title, pages: b.pages == null ? '' : String(b.pages), subKey: b.subKey ?? '',
  bookSubjectKey: b.bookSubjectKey ?? '', bookCategoryKey: b.bookCategoryKey ?? '', bookLevel: b.bookLevel ?? '',
  gradeFrom: b.gradeFrom == null ? '' : String(b.gradeFrom), gradeTo: b.gradeTo == null ? '' : String(b.gradeTo),
  examTag: b.examTag ?? '',
});

/** 폼 → PATCH/POST 값. 빈 칸은 null(비움)이다 */
const valuesOf = (f: Form) => ({
  code: f.code.trim(), title: f.title.trim(),
  pages: f.pages ? Number(f.pages) : null, subKey: f.subKey || null,
  bookSubjectKey: f.bookSubjectKey || null, bookCategoryKey: f.bookCategoryKey || null,
  bookLevel: (f.bookLevel || null) as BookPatch['bookLevel'],
  gradeFrom: f.gradeFrom === '' ? null : Number(f.gradeFrom), gradeTo: f.gradeTo === '' ? null : Number(f.gradeTo),
  examTag: (f.examTag || null) as BookPatch['examTag'],
});

export function BookShelf({
  createRequest = 0,
  showCreateAction = true,
}: {
  createRequest?: number;
  showCreateAction?: boolean;
}) {
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [grade, setGrade] = useState('');
  // 거르기는 서버가 한다 — 고른 칩의 키만 보낸다(N-47)
  const q = useBookShelf({
    ...(subject ? { subject } : {}),
    ...(level ? { level: level as BookShelfQuery['level'] } : {}),
    ...(grade ? { grade: grade as BookShelfQuery['grade'] } : {}),
  });
  const meta = useMeta();
  const create = useCreateBook();
  const patch = usePatchBook();
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<Book | null>(null);
  const [version, setVersion] = useState<Book | null>(null);
  const [seFile, setSeFile] = useState<File | null>(null);
  const [teFile, setTeFile] = useState<File | null>(null);
  const openCreate = () => {
    setEditing(null);
    setSeFile(null);
    setTeFile(null);
    setForm(EMPTY);
  };
  useEffect(() => {
    if (createRequest > 0) {
      setEditing(null);
      setSeFile(null);
      setTeFile(null);
      setForm(EMPTY);
    }
  }, [createRequest]);
  /*
   * 묶음 — 서버가 준 차례(과목 → 소분류 → 코드) 그대로 과목이 바뀌는 곳에서 끊는다.
   * 머리 줄의 소분류 이름은 그 묶음에 **보이는 카드의** 소분류다(원문 「Reading · ELA · …」).
   */
  const groups = useMemo(() => {
    const grouped = new Map<string, { key: string; name: string; color: string; categories: string[]; items: Book[] }>();
    for (const book of q.data?.items ?? []) {
      const key = book.bookSubjectKey ?? UNCLASSIFIED_GROUP;
      const group = grouped.get(key) ?? {
        key,
        name: book.bookSubjectName ?? q.data?.unclassified.label ?? '',
        color: book.bookSubjectKey ? bookSubjectColor(book.bookSubjectColor) : 'var(--fg-subtle)',
        categories: [],
        items: [],
      };
      group.items.push(book);
      if (book.bookCategoryName && !group.categories.includes(book.bookCategoryName)) group.categories.push(book.bookCategoryName);
      grouped.set(key, group);
    }
    return [...grouped.values()];
  }, [q.data]);
  const subjectFacets = (d: Books | undefined): Facet[] => [
    ...(d?.subjects ?? []).map((s) => ({ key: s.key, label: s.label, count: s.count, dot: bookSubjectColor(s.color) })),
    // 「미분류」는 과목을 아직 정하지 않은 교재가 있을 때만 선다 — 사람이 골라 분류하러 가는 칩이다
    ...(d && (d.unclassified.count > 0 || subject === d.unclassified.key)
      ? [{ key: d.unclassified.key, label: d.unclassified.label, count: d.unclassified.count }]
      : []),
  ];
  const categoriesOf = (key: string) => q.data?.subjects.find((s) => s.key === key)?.categories ?? [];
  const openEdit = (b: Book) => {
    setEditing(b);
    setForm(formOf(b));
  };
  const field = (key: keyof Form, value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const done = () => {
    setForm(null);
    setEditing(null);
    setSeFile(null);
    setTeFile(null);
  };
  // 첫 판(N-61) — 판 이름을 적어야 파일 · 언제부터가 함께 올라간다(이름을 지어 넣지 않는다)
  const firstVersionOpen = !editing && Boolean(form && (form.edition.trim() || form.fromDate || seFile || teFile));
  const firstVersionIssue = firstVersionOpen && !form?.edition.trim() ? '판 이름을 적어야 첫 판 · 파일이 함께 올라갑니다' : null;
  const fileIssue = !editing ? fileSelectionIssue([seFile, teFile], q.data?.versionUploadMaxBytes ?? Number.POSITIVE_INFINITY) : null;
  const save = async () => {
    if (!form) return;
    const next = valuesOf(form);
    if (editing) {
      // PATCH 는 **바꾼 칸만** 보낸다 — 원장(log)의 앞뒤가 실제로 바뀐 칸만 되게(생략은 보존 · null 은 비움)
      const before = valuesOf(formOf(editing));
      const changed = Object.fromEntries(
        Object.entries(next).filter(([key, value]) => before[key as keyof typeof before] !== value),
      ) as BookPatch;
      if (Object.keys(changed).length === 0) return done();
      patch.mutate({ id: editing.id, ...changed }, { onSuccess: done });
      return;
    }
    const body: BookWrite = {
      code: next.code, title: next.title,
      ...(next.pages != null ? { pages: next.pages } : {}),
      ...(next.subKey ? { subKey: next.subKey } : {}),
      ...(next.bookSubjectKey ? { bookSubjectKey: next.bookSubjectKey } : {}),
      ...(next.bookCategoryKey ? { bookCategoryKey: next.bookCategoryKey } : {}),
      ...(next.bookLevel ? { bookLevel: next.bookLevel } : {}),
      ...(next.gradeFrom != null ? { gradeFrom: next.gradeFrom } : {}),
      ...(next.gradeTo != null ? { gradeTo: next.gradeTo } : {}),
      ...(next.examTag ? { examTag: next.examTag } : {}),
    };
    try {
      if (form.edition.trim()) {
        body.firstVersion = {
          edition: form.edition.trim(),
          ...(form.fromDate ? { fromDate: form.fromDate } : {}),
          ...(seFile ? { seFile: await fileUploadBody(seFile, 'lib-se') } : {}),
          ...(teFile ? { teFile: await fileUploadBody(teFile, 'lib-te') } : {}),
        };
      }
      await create.mutateAsync(body);
      done();
    } catch {
      /* mutation 상태의 공용 오류 문구를 표시한다 */
    }
  };
  const error = create.error ?? patch.error;
  const filtered = Boolean(subject || level || grade);
  return (
    <div className="space-y-3">
      {/*
        원본 §39 — 연초록 필터 판이 **경고 띠 위**에 있고 1줄 = 과목 + 레벨, 2줄 = 학년이다(g4 §39-2).
        칩 앞 색 점(과목 = 코드표 색 · 레벨 = 카드 띠와 같은 F/P/M 색), 뒤에 서버가 센 서가 전체 건수 — 화면은 세지 않는다(D-R37).
      */}
      <section data-testid="shelf-filters" aria-label="서가 필터" className="space-y-2 rounded-xl border border-green/20 bg-green/5 p-3 text-[12px]">
        <div data-filter-row className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <b className="w-10 text-fg-subtle">과목</b>
            <ShelfChips label="과목" facets={subjectFacets(q.data)} value={subject} onChange={setSubject} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <b className="w-10 text-fg-subtle">레벨</b>
            <ShelfChips
              label="레벨"
              facets={(q.data?.levelCounts ?? []).map((o) => ({
                key: o.key, label: o.label, count: o.count, dot: LEVEL_DOT[bookLevelPresentation(o.label).bandClass],
              }))}
              value={level}
              onChange={setLevel}
            />
          </div>
          {showCreateAction ? (
            <Button className="ml-auto" onClick={openCreate}>
              + 교재
            </Button>
          ) : null}
        </div>
        <div data-filter-row className="flex flex-wrap items-center gap-1.5">
          <b className="w-10 text-fg-subtle">학년</b>
          <ShelfChips
            label="학년"
            facets={(q.data?.gradeCounts ?? []).map((o) => ({ key: o.key, label: o.label, count: o.count }))}
            value={grade}
            onChange={setGrade}
          />
        </div>
      </section>
      {/* 경고 띠 — 수와 이름은 서버가 서가 전체에서 고른 같은 줄이다(필터와 상관없다) */}
      {q.data && q.data.newerCount > 0 ? (
        <Banner tone="warning">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span aria-hidden>⇧</span>
            <b>{`더 최신 판이 있는 교재 ${q.data.newerCount}종`}</b>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {q.data.newerBooks
                .map((b) => (b.edition && b.latestEdition ? `${b.title} ${b.edition}→${b.latestEdition}` : b.title))
                .join(', ')}
            </span>
            <span className="text-fg-subtle">판 버튼을 눌러 바꿉니다</span>
          </div>
        </Banner>
      ) : null}
      {q.data && q.data.noFileCount > 0 ? (
        <Banner tone="danger">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span aria-hidden>⚠</span>
            <b>{`TE 없는 교재 ${q.data.noFileCount}종`}</b>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{q.data.noTeBooks.map((b) => b.title).join(', ')}</span>
            <span className="text-fg-subtle">강사에게 보낼 파일이 없습니다</span>
          </div>
        </Banner>
      ) : null}
      {form ? (
        <Panel title={editing ? `교재 수정 — ${editing.title}` : '교재 등록'}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="book-code">코드</Label>
              <Input id="book-code" value={form.code} onChange={(e) => field('code', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="book-title">교재명</Label>
              <Input id="book-title" value={form.title} onChange={(e) => field('title', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="book-subject">과목</Label>
              <Select
                id="book-subject"
                value={form.bookSubjectKey}
                // 과목이 바뀌면 소분류는 다른 과목의 것이 되므로 비운다 — 서버도 그 짝을 막는다
                onChange={(e) => setForm((f) => (f ? { ...f, bookSubjectKey: e.target.value, bookCategoryKey: '' } : f))}
              >
                <option value="">{q.data?.unclassified.label ?? ''}</option>
                {q.data?.subjects.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="book-category">소분류</Label>
              <Select
                id="book-category"
                value={form.bookCategoryKey}
                disabled={categoriesOf(form.bookSubjectKey).length === 0}
                onChange={(e) => field('bookCategoryKey', e.target.value)}
              >
                <option value="">—</option>
                {categoriesOf(form.bookSubjectKey).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="book-level">레벨</Label>
              <Select id="book-level" value={form.bookLevel} onChange={(e) => field('bookLevel', e.target.value)}>
                <option value="">—</option>
                {q.data?.levelCounts.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="book-grade-from">학년 시작</Label>
              <Select id="book-grade-from" value={form.gradeFrom} onChange={(e) => field('gradeFrom', e.target.value)}>
                <option value="">—</option>
                {q.data?.gradeCounts.map((g) => (
                  <option key={g.key} value={String(g.grade)}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="book-grade-to">학년 끝</Label>
              <Select id="book-grade-to" value={form.gradeTo} onChange={(e) => field('gradeTo', e.target.value)}>
                <option value="">—</option>
                {q.data?.gradeCounts.map((g) => (
                  <option key={g.key} value={String(g.grade)}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="book-exam">시험</Label>
              <Select id="book-exam" value={form.examTag} onChange={(e) => field('examTag', e.target.value)}>
                <option value="">—</option>
                {q.data?.examTags.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="book-pages">쪽수</Label>
              <Input
                id="book-pages"
                type="number"
                min={1}
                value={form.pages}
                onChange={(e) => field('pages', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="book-sub">시간표 과목</Label>
              <Select id="book-sub" value={form.subKey} onChange={(e) => field('subKey', e.target.value)}>
                <option value="">—</option>
                {meta.data?.subs.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {!editing ? (
            /* N-61 — 등록 창에서 첫 판 · SE/TE 파일까지 한 번에 (「+ 판 올리기」와 같은 칸 · 같은 검사) */
            <fieldset className="mt-3 rounded-lg border border-line p-3">
              <legend className="px-1 text-[12px] font-bold text-fg-subtle">첫 판</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="book-edition">판 이름</Label>
                  <Input id="book-edition" value={form.edition} onChange={(e) => field('edition', e.target.value)} placeholder="v2026.08" />
                </div>
                <div>
                  <Label htmlFor="book-from">언제부터</Label>
                  <Input id="book-from" type="date" value={form.fromDate} onChange={(e) => field('fromDate', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="book-se">학생용 SE 파일</Label>
                  <Input id="book-se" type="file" onChange={(event) => setSeFile(event.currentTarget.files?.[0] ?? null)} />
                </div>
                <div>
                  <Label htmlFor="book-te">교사용 TE 파일</Label>
                  <Input id="book-te" type="file" onChange={(event) => setTeFile(event.currentTarget.files?.[0] ?? null)} />
                </div>
              </div>
              {(firstVersionIssue ?? fileIssue) ? (
                <Banner tone="warning" className="mt-3">
                  {firstVersionIssue ?? fileIssue}
                </Banner>
              ) : null}
            </fieldset>
          ) : null}
          {error ? (
            <Banner className="mt-3" tone="danger">
              {apiMessage(error)}
            </Banner>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={done}>
              취소
            </Button>
            <Button
              disabled={!form.code.trim() || !form.title.trim() || create.isPending || patch.isPending
                || firstVersionIssue !== null || fileIssue !== null}
              onClick={() => void save()}
            >
              저장
            </Button>
          </div>
        </Panel>
      ) : null}
      {version && q.data ? (
        <BookVersionAdder book={version} maxBytes={q.data.versionUploadMaxBytes} onClose={() => setVersion(null)} />
      ) : null}
      <QueryState query={q} empty={filtered ? '고른 칩에 맞는 교재가 없습니다' : '등록된 교재가 없습니다'} isEmpty={(d) => d.items.length === 0}>
        {() => (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.key} data-book-group={group.key}>
                <div className="mb-2 flex items-baseline gap-2 border-b-2 pb-1" style={{ borderBottomColor: group.color }}>
                  <span className="h-3 w-3 self-center rounded" style={{ backgroundColor: group.color }} />
                  <h3 className="text-[15px] font-bold" style={{ color: readableAccentColor(group.color) }}>{group.name}</h3>
                  {group.categories.length ? (
                    <span className="text-[11px] text-fg-subtle">{group.categories.join(' · ')}</span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-fg-subtle">{group.items.length}종</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                  {group.items.map((b) => {
                    const levelPresentation = bookLevelPresentation(b.levelLabel);
                    return (
                      <article key={b.id} className="overflow-hidden rounded-xl border border-line bg-card">
                        <div className="flex min-h-40">
                          <div
                            className={cn(
                              'flex w-10 items-center justify-center px-1 text-[12px] font-black text-white',
                              levelPresentation.bandClass,
                            )}
                          >
                            <span
                              role="img"
                              aria-label={`레벨 ${levelPresentation.label}`}
                              title={levelPresentation.label}
                              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                            >
                              {levelPresentation.marker}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 p-3">
                            {/* 원문 §39 카드 윗줄 — 소분류(과목 색) */}
                            {b.bookCategoryName ? (
                              <p data-book-category className="text-[11px] font-bold"
                                style={{ color: readableAccentColor(bookSubjectColor(b.bookSubjectColor)) }}>
                                {b.bookCategoryName}
                              </p>
                            ) : null}
                            <h4 className="mt-1 min-h-10 text-[14px] font-bold">{b.title}</h4>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <Chip size="compact">{b.gradeLabel ?? '—'}</Chip>
                              {b.examTagLabel ? (
                                <Chip size="compact" styleKind="solid" tone={bookExamTagTone(b.examTag)}>{b.examTagLabel}</Chip>
                              ) : null}
                              <Chip size="compact">{b.pages ? `${b.pages}쪽` : '쪽수 —'}</Chip>
                              <Chip size="compact">배부 {b.issueCount}</Chip>
                            </div>
                            <div className="mt-2">
                              <BookVersionBadge book={b} />
                            </div>
                            {/* 원문 §39 카드 아래 줄 — 왼쪽 코드 · 오른쪽 작은 SE/TE 배지(누르면 내려받기) (g4 §39-5 · wave 6) */}
                            <div data-book-file-line className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t border-line pt-2">
                              <span data-book-code className="font-mono text-[10.5px] text-fg-subtle">{b.code}</span>
                              <span className="inline-flex items-center gap-1">
                                <FileDownloadButton id={b.seFileId} label="SE" variant="badge" itemTitle={b.title} />
                                <FileDownloadButton id={b.teFileId} label="TE" variant="badge" tone="violet" itemTitle={b.title} />
                              </span>
                            </div>
                          </div>
                          <div className="flex w-12 flex-col border-l border-line">
                            <button
                              type="button"
                              aria-label={`${b.title} 편집`}
                              className="flex flex-1 items-center justify-center text-[11px] font-bold hover:bg-inset"
                              title="교재 정보 고치기"
                              onClick={() => openEdit(b)}
                            >
                              {/* 원본 §39 카드 오른쪽 ✎ (g4 §39-5) — 이름은 aria-label 이 말한다 */}
                              <span aria-hidden className="text-[15px]">✎</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`${b.title} 새 판 올리기`}
                              className="flex flex-1 items-center justify-center border-t border-line text-[18px] hover:bg-inset"
                              onClick={() => setVersion(b)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
