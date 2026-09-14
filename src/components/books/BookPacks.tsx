/** @file-guide
 * 목적: 개발명세서 §41 자료 전달의 생성·전달·수령 카드와 전달문 PNG를 구현한다.
 * 책임/재사용: GPAPACK DTO의 다학생·다교재와 서버 상태 문구를 소비하며 공용 PNG exporter를 재사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiMessage } from '@/api/client';
import {
  useBooks,
  useBookPacks,
  useCreateBookPack,
  useDeliverBookPack,
  useMeta,
  usePatchBookPack,
  useReceiveBookPack,
} from '@/api/queries';
import type { BookPack, BookPackWrite } from '@/api/types';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';
import { Banner, Button, Checkbox, Chip, Input, Label, Panel, QueryState, Select, Textarea } from '@/components/ui';
import { downloadElementPng } from '@/lib/png-export';

export function BookPacks({ focusPackId = null }: { focusPackId?: number | null }) {
  const q = useBookPacks();
  const meta = useMeta();
  const books = useBooks();
  const create = useCreateBookPack();
  const deliver = useDeliverBookPack();
  const receive = useReceiveBookPack();
  const [open, setOpen] = useState(false);
  const error = create.error ?? deliver.error ?? receive.error;
  const activeCount = q.data?.items.filter((item) => item.state !== 'received').length ?? 0;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
      <main className="space-y-3">
        <Banner tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <b>전달 {activeCount}건 진행 중</b>
              <span className="ml-2">GPA 코디네이터에게 학생별 교재 묶음을 넘깁니다 · 코디가 수령을 확인하면 완료됩니다</span>
            </span>
            <Button aria-expanded={open} aria-controls="book-pack-create" onClick={() => setOpen((value) => !value)}>
              + 전달 만들기
            </Button>
          </div>
        </Banner>

        {open ? (
          <div id="book-pack-create">
            <Panel title="전달 만들기" sub="시험 대비·자습 두 종류, 학생과 교재는 여러 개 선택할 수 있습니다">
              <BookPackEditor
                idPrefix="pack-create"
                staff={meta.data?.staff ?? []}
                students={meta.data?.students ?? []}
                books={books.data?.items ?? []}
                busy={create.isPending}
                onCancel={() => setOpen(false)}
                onSubmit={(body) => create.mutate(body, { onSuccess: () => setOpen(false) })}
              />
            </Panel>
          </div>
        ) : null}

        {error ? <Banner tone="danger">{apiMessage(error)}</Banner> : null}
        <QueryState query={q} empty="자료 전달이 없습니다" isEmpty={(data) => data.items.length === 0}>
          {(data) => (
            <div className="space-y-4">
              {(['active', 'received'] as const).map((section) => {
                const rows = data.items.filter((item) =>
                  section === 'active' ? item.state !== 'received' : item.state === 'received',
                );
                return (
                  <section key={section}>
                    <h3 className="mb-2 text-[13px] font-bold">
                      {section === 'active' ? '진행 중' : '수령 완료'} · {rows.length}건
                    </h3>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {rows.map((pack) => (
                        <BookPackAnchor key={pack.id} packId={pack.id} focused={pack.id === focusPackId}>
                          <BookPackCard
                            pack={pack}
                            onDeliver={() => deliver.mutate(pack.id)}
                            onReceive={() => receive.mutate(pack.id)}
                            busy={deliver.isPending || receive.isPending}
                          />
                        </BookPackAnchor>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </QueryState>
      </main>

      <aside className="space-y-3">
        <Panel title="전달 종류">
          {q.data?.types.map((type) => (
            <div key={type.key} className="mb-2 rounded-lg border-l-4 border-red bg-card p-3 text-[12px]">
              <div className="flex justify-between">
                <b>{type.label}</b>
                <b>{type.count}건</b>
              </div>
              <p className="mt-1 text-fg-subtle">{type.key === 'exam' ? '내신 · 퀴즈 대비로 쓸 자료' : '자습실에서 쓸 자료'}</p>
            </div>
          ))}
        </Panel>
        <Panel title="코디네이터가 받는 것">
          <ul className="list-disc space-y-2 pl-4 text-[12px]">
            <li>학생 명단과 학년</li>
            <li>교재 목록 · SE·TE 링크와 코드</li>
            <li>적용 시점과 전달 메모</li>
            <li>수령을 확인하면 담당 관리자에게 알림이 갑니다</li>
          </ul>
        </Panel>
        <Panel title="코디네이터">
          {q.data?.coordinators.map((coordinator) => (
            <div key={coordinator.key} className="mb-2 flex justify-between text-[12px]">
              <span>{coordinator.label}</span>
              <b>{coordinator.count}건</b>
            </div>
          ))}
        </Panel>
      </aside>
    </div>
  );
}

function BookPackAnchor({ packId, focused, children }: { packId: number; focused: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused || !ref.current) return;
    ref.current.scrollIntoView?.({ block: 'center' });
    ref.current.focus({ preventScroll: true });
  }, [focused]);
  return (
    <div
      ref={ref}
      id={`book-pack-${packId}`}
      tabIndex={-1}
      data-focused={focused || undefined}
      className={focused ? 'rounded-xl outline outline-2 outline-offset-2 outline-blue' : undefined}
    >
      {children}
    </div>
  );
}

function BookPackCard({
  pack,
  onDeliver,
  onReceive,
  busy,
}: {
  pack: BookPack;
  onDeliver: () => void;
  onReceive: () => void;
  busy: boolean;
}) {
  const noteRef = useRef<HTMLDivElement>(null);
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [editing, setEditing] = useState(false);
  const patch = usePatchBookPack();
  const meta = useMeta();
  const books = useBooks();

  const savePng = async () => {
    if (!noteRef.current) return;
    setExportState('busy');
    try {
      const safeTitle = pack.title.replace(/[\\/:*?"<>|]/g, '-');
      await downloadElementPng(noteRef.current, `자료전달-${pack.id}-${safeTitle}.png`);
      setExportState('done');
    } catch {
      setExportState('error');
    }
  };

  return (
    <Panel
      title={pack.title}
      right={
        <Chip tone={pack.state === 'received' ? 'success' : pack.state === 'delivered' ? 'info' : 'warning'}>
          {pack.stateLabel}
        </Chip>
      }
    >
      <div ref={noteRef} className="space-y-2 bg-card text-[12px]">
        <p>
          <b>{pack.packTypeLabel}</b> · {pack.students.map((student) => `${student.name} ${student.grade ?? ''}`).join(' · ')}
        </p>
        <div className="rounded-lg bg-inset p-2">
          {pack.books.map((book) => (
            <div key={book.id} className="flex flex-wrap items-center gap-1">
              <b>{book.title}</b>
              <FileDownloadButton id={book.seFileId} label="SE" />
              <FileDownloadButton id={book.teFileId} label="TE" />
              <span className="text-fg-subtle">{book.code}</span>
            </div>
          ))}
        </div>
        {pack.memo ? <p>{pack.memo}</p> : null}
        <p className="text-fg-subtle">
          코디네이터 {pack.coordinatorName ?? '—'} · 전달 {pack.deliveredAt ?? '—'} · 적용 {pack.effectiveOn ?? '—'} · 수령{' '}
          {pack.receivedAt ?? '—'}
        </p>
      </div>
      {exportState === 'done' ? (
        <p className="mt-2 text-[11px] text-green" role="status">
          PNG 저장을 시작했습니다.
        </p>
      ) : null}
      {exportState === 'error' ? (
        <p className="mt-2 text-[11px] text-red" role="alert">
          PNG를 만들지 못했습니다.
        </p>
      ) : null}
      {pack.state === 'pending' && pack.deliveryBlockers.length > 0 ? (
        <Banner className="mt-2" tone="danger">
          전달 전 확인: {pack.deliveryBlockers.join(' · ')}
        </Banner>
      ) : null}
      <div className="mt-2 flex gap-2">
        {pack.state !== 'received' ? (
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={editing}
            aria-controls={`book-pack-${pack.id}-editor`}
            aria-label={`${pack.title} ${editing ? '수정 닫기' : '열기·수정'}`}
            onClick={() => setEditing((value) => !value)}
          >
            열기·수정
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          aria-label={`${pack.title} 전달문 PNG`}
          disabled={exportState === 'busy'}
          onClick={() => void savePng()}
        >
          전달문 PNG
        </Button>
        {pack.state === 'pending' ? (
          <Button size="sm" aria-label={`${pack.title} 전달`} disabled={busy || !pack.canDeliver} onClick={onDeliver}>
            전달
          </Button>
        ) : null}
        {pack.state === 'delivered' && pack.canReceive ? (
          <Button size="sm" aria-label={`${pack.title} 수령 확인`} disabled={busy} onClick={onReceive}>
            수령 확인
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div id={`book-pack-${pack.id}-editor`} className="mt-3 border-t border-line pt-3">
          <BookPackEditor
            idPrefix={`pack-edit-${pack.id}`}
            staff={meta.data?.staff ?? []}
            students={meta.data?.students ?? []}
            books={books.data?.items ?? []}
            initial={{
              packType: pack.packType,
              title: pack.title,
              memo: pack.memo ?? undefined,
              effectiveOn: pack.effectiveOn ?? undefined,
              coordinatorId: pack.coordinatorId ?? 0,
              studentIds: pack.students.map((student) => student.id),
              libIds: pack.books.map((book) => book.id),
            }}
            busy={patch.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(body) => patch.mutate({ id: pack.id, ...body }, { onSuccess: () => setEditing(false) })}
          />
          {patch.isError ? (
            <Banner className="mt-2" tone="danger">
              {apiMessage(patch.error)}
            </Banner>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function BookPackEditor({
  idPrefix,
  staff,
  students,
  books,
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  staff: Array<{ id: number; name: string; canGpaPack: boolean }>;
  students: Array<{ id: number; name: string; grade?: string | null }>;
  books: Array<{ id: number; title: string }>;
  initial?: Omit<BookPackWrite, 'effectiveOn'> & { effectiveOn?: string };
  busy: boolean;
  onCancel: () => void;
  onSubmit: (body: BookPackWrite) => void;
}) {
  const [kind, setKind] = useState<'exam' | 'self'>((initial?.packType as 'exam' | 'self') ?? 'exam');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [effectiveOn, setEffectiveOn] = useState(initial?.effectiveOn ?? '');
  const [coordinatorId, setCoordinatorId] = useState(initial?.coordinatorId ? String(initial.coordinatorId) : '');
  const [studentIds, setStudentIds] = useState<number[]>(initial?.studentIds ?? []);
  const [libIds, setLibIds] = useState<number[]>(initial?.libIds ?? []);
  const coordinators = staff.filter((member) => member.canGpaPack);
  const toggle = (values: number[], id: number, set: (next: number[]) => void) =>
    set(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  const valid = title.trim() && effectiveOn && coordinatorId && studentIds.length && libIds.length;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-kind`}>종류</Label>
          <Select id={`${idPrefix}-kind`} value={kind} onChange={(event) => setKind(event.target.value as 'exam' | 'self')}>
            <option value="exam">시험 대비 자료</option>
            <option value="self">자습 자료</option>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-coordinator`}>받는 코디네이터</Label>
          <Select
            id={`${idPrefix}-coordinator`}
            value={coordinatorId}
            onChange={(event) => setCoordinatorId(event.target.value)}
          >
            <option value="">선택</option>
            {coordinators.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-effective`}>적용일</Label>
          <Input
            id={`${idPrefix}-effective`}
            type="date"
            value={effectiveOn}
            onChange={(event) => setEffectiveOn(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-title`}>제목</Label>
          <Input id={`${idPrefix}-title`} value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${idPrefix}-memo`}>전달 메모</Label>
          <Textarea id={`${idPrefix}-memo`} value={memo} onChange={(event) => setMemo(event.target.value)} />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Panel title="학생">
          <div className="grid max-h-40 grid-cols-2 gap-2 overflow-auto">
            {students.map((student) => (
              <Checkbox
                key={student.id}
                checked={studentIds.includes(student.id)}
                onChange={() => toggle(studentIds, student.id, setStudentIds)}
                label={`${student.name} ${student.grade ?? ''}`}
              />
            ))}
          </div>
        </Panel>
        <Panel title="교재">
          <div className="max-h-40 space-y-2 overflow-auto">
            {books.map((book) => (
              <Checkbox
                key={book.id}
                checked={libIds.includes(book.id)}
                onChange={() => toggle(libIds, book.id, setLibIds)}
                label={book.title}
              />
            ))}
          </div>
        </Panel>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Button
          disabled={!valid || busy}
          onClick={() =>
            onSubmit({
              packType: kind,
              title: title.trim(),
              memo: memo.trim() || undefined,
              effectiveOn,
              coordinatorId: Number(coordinatorId),
              studentIds,
              libIds,
            })
          }
        >
          저장
        </Button>
      </div>
    </>
  );
}
