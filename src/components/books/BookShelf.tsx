/** @file-guide
 * 목적: §39 서가의 3축 필터·과목 묶음 카드·교재 등록/수정·판 관리를 구현한다.
 * 책임/재사용: BooksDto의 필터·배부 수·파일 사실을 소비하고 공용 폼/BookVersion 컴포넌트를 재사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useBooks, useCreateBook, useMeta, usePatchBook } from '@/api/queries';
import type { Book } from '@/api/types';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';
import { Banner, Button, Chip, Input, Label, Panel, QueryState, Select, cn } from '@/components/ui';
import { bookLevelPresentation } from '@/lib/book-presentation';
import { subjectColor } from '@/lib/tokens';
import { BookVersionAdder, BookVersionBadge } from './BookVersions';

type Form = { code: string; title: string; subKey: string; level: string; grade: string; pages: string };
const EMPTY: Form = { code: '', title: '', subKey: '', level: '', grade: '', pages: '' };

export function BookShelf({
  createRequest = 0,
  showCreateAction = true,
}: {
  createRequest?: number;
  showCreateAction?: boolean;
}) {
  const q = useBooks();
  const meta = useMeta();
  const create = useCreateBook();
  const patch = usePatchBook();
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [grade, setGrade] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<Book | null>(null);
  const [version, setVersion] = useState<Book | null>(null);
  useEffect(() => {
    if (createRequest > 0) {
      setEditing(null);
      setForm(EMPTY);
    }
  }, [createRequest]);
  const rows = useMemo(
    () =>
      (q.data?.items ?? []).filter(
        (b) => (!subject || b.subName === subject) && (!level || b.level === level) && (!grade || b.grade === grade),
      ),
    [q.data, subject, level, grade],
  );
  const subjectCodes = useMemo(() => new Map((meta.data?.subs ?? []).map((item) => [item.key, item])), [meta.data?.subs]);
  const groups = useMemo(() => {
    const grouped = new Map<string, { subKey: string | null; name: string; items: Book[] }>();
    for (const book of rows) {
      const key = book.subKey ?? '__unclassified__';
      const group = grouped.get(key);
      if (group) group.items.push(book);
      else grouped.set(key, { subKey: book.subKey ?? null, name: book.subName ?? '미분류', items: [book] });
    }
    return [...grouped.values()];
  }, [rows]);
  const openEdit = (b: Book) => {
    setEditing(b);
    setForm({
      code: b.code,
      title: b.title,
      subKey: b.subKey ?? '',
      level: b.level ?? '',
      grade: b.grade ?? '',
      pages: b.pages == null ? '' : String(b.pages),
    });
  };
  const field = (key: keyof Form, value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const save = () => {
    if (!form) return;
    const body = {
      code: form.code.trim(),
      title: form.title.trim(),
      ...(form.subKey ? { subKey: form.subKey } : {}),
      ...(form.level ? { level: form.level } : {}),
      ...(form.grade ? { grade: form.grade } : {}),
      ...(form.pages ? { pages: Number(form.pages) } : {}),
    };
    const done = () => {
      setForm(null);
      setEditing(null);
    };
    if (editing) {
      // PATCH에서 생략은 보존이다. 비운 선택 칸은 null로 보내야 저장된 값도 지워진다.
      patch.mutate({
        id: editing.id, ...body,
        subKey: form.subKey || null,
        level: form.level.trim() || null,
        grade: form.grade.trim() || null,
        pages: form.pages ? Number(form.pages) : null,
      }, { onSuccess: done });
    } else create.mutate(body, { onSuccess: done });
  };
  const error = create.error ?? patch.error;
  return (
    <div className="space-y-3">
      {q.data && q.data.newerCount > 0 ? (
        <Banner tone="warning">
          더 최신 판이 있는 교재 <b>{q.data.newerCount}종</b> — 판 버튼을 눌러 바꿉니다.
        </Banner>
      ) : null}
      {q.data && q.data.noFileCount > 0 ? (
        <Banner tone="danger">
          TE 파일이 없는 교재 <b>{q.data.noFileCount}종</b> — 강사에게 보낼 파일을 확인해 주세요.
        </Banner>
      ) : null}
      <Panel
        title="서가 필터"
        right={
          showCreateAction ? (
            <Button
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
              }}
            >
              + 교재
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-2 text-[12px]">
          <Filter
            label="과목"
            value={subject}
            options={Object.entries(q.data?.bySub ?? {}).map(([label, count]) => ({ label, count }))}
            onChange={setSubject}
          />
          <Filter
            label="레벨"
            value={level}
            options={q.data?.levelCounts ?? (q.data?.levels ?? []).map((label) => ({ key: label, label, count: 0 }))}
            onChange={setLevel}
          />
          <Filter
            label="학년"
            value={grade}
            options={q.data?.gradeCounts ?? (q.data?.grades ?? []).map((label) => ({ key: label, label, count: 0 }))}
            onChange={setGrade}
          />
        </div>
      </Panel>
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
              <Select id="book-subject" value={form.subKey} onChange={(e) => field('subKey', e.target.value)}>
                <option value="">미분류</option>
                {meta.data?.subs.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="book-level">레벨</Label>
              <Input id="book-level" value={form.level} onChange={(e) => field('level', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="book-grade">학년</Label>
              <Input id="book-grade" value={form.grade} onChange={(e) => field('grade', e.target.value)} />
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
          </div>
          {error ? (
            <Banner className="mt-3" tone="danger">
              {apiMessage(error)}
            </Banner>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setForm(null);
                setEditing(null);
              }}
            >
              취소
            </Button>
            <Button disabled={!form.code.trim() || !form.title.trim() || create.isPending || patch.isPending} onClick={save}>
              저장
            </Button>
          </div>
        </Panel>
      ) : null}
      {version && q.data ? (
        <BookVersionAdder book={version} maxBytes={q.data.versionUploadMaxBytes} onClose={() => setVersion(null)} />
      ) : null}
      <QueryState query={q} empty="등록된 교재가 없습니다" isEmpty={(d) => d.items.length === 0}>
        {() => (
          <div className="space-y-5">
            {groups.map((group) => {
              const color = subjectColor(group.subKey, subjectCodes) ?? 'var(--fg-subtle)';
              return (
                <section key={group.subKey ?? '__unclassified__'}>
                  <div className="mb-2 flex items-center gap-2 border-b-2 pb-1" style={{ borderBottomColor: color }}>
                    <span className="h-3 w-3 rounded" style={{ backgroundColor: color }} />
                    <h3 className="text-[15px] font-bold">{group.name}</h3>
                    <span className="text-[11px] text-fg-subtle">{group.items.length}종</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                    {group.items.map((b) => {
                      const levelPresentation = bookLevelPresentation(b.level);
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
                              <p className="text-[11px] font-bold text-blue">{b.subName ?? '미분류'}</p>
                              <h4 className="mt-1 min-h-10 text-[14px] font-bold">{b.title}</h4>
                              <div className="mt-2 flex flex-wrap gap-1">
                                <Chip size="compact">{b.grade ?? '—'}</Chip>
                                <Chip size="compact">{b.pages ? `${b.pages}쪽` : '쪽수 —'}</Chip>
                                <Chip size="compact">배부 {b.issueCount}</Chip>
                              </div>
                              <div className="mt-2">
                                <BookVersionBadge book={b} />
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-1">
                                <FileDownloadButton id={b.seFileId} label="SE" />
                                <FileDownloadButton id={b.teFileId} label="TE" />
                              </div>
                              <p className="mt-2 text-[10px] text-fg-subtle">{b.code}</p>
                            </div>
                            <div className="flex w-12 flex-col border-l border-line">
                              <button
                                type="button"
                                aria-label={`${b.title} 편집`}
                                className="flex flex-1 items-center justify-center text-[11px] font-bold hover:bg-inset"
                                onClick={() => openEdit(b)}
                              >
                                편집
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
              );
            })}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; count: number }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <b className="w-10 text-fg-subtle">{label}</b>
      <button type="button" aria-label={`${label} 전체`} onClick={() => onChange('')}>
        <Chip tone={!value ? 'info' : 'neutral'} styleKind={!value ? 'solid' : 'soft'}>
          전체
        </Chip>
      </button>
      {options.map((option) => (
        <button
          type="button"
          aria-label={`${label} ${option.label}${option.count > 0 ? ` ${option.count}` : ''}`}
          key={option.label}
          onClick={() => onChange(option.label)}
        >
          <Chip tone={value === option.label ? 'info' : 'neutral'} styleKind={value === option.label ? 'solid' : 'soft'}>
            {option.label}
            {option.count > 0 ? ` ${option.count}` : ''}
          </Chip>
        </button>
      ))}
    </div>
  );
}
