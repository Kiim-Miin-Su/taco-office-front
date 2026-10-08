/** @file-guide
 * 목적: 일반 강사 자료요청 등록·조회와 관리자 처리 보드를 GPAPACK과 분리해 제공한다.
 * 책임/재사용: 생성 API 계약·공용 Query/file/request-key를 조립한다. 권한·상태 전이·파일 최종 판정은 서버가 소유한다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-08D2-MATERIAL-REQUEST-PERSISTENCE-2026-10-09.md · docs/AGENT.md
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAcknowledgeMaterialRequest,
  useCreateMaterialRequest,
  useMaterialRequestOptions,
  useMaterialRequests,
  useMyMaterialRequests,
  useTransitionMaterialRequest,
} from '@/api/queries';
import type { MaterialRequestItem } from '@/api/types';
import { apiMessage } from '@/api/client';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';
import { Banner, Button, Chip, Input, Label, Panel, QueryState, Select, Textarea } from '@/components/ui';
import { fileUploadBody } from '@/lib/file-upload';
import { useRequestKey } from '@/lib/request-key';

type MaterialRequestKind = MaterialRequestItem['kind'];
type MaterialRequestState = MaterialRequestItem['state'];

const MATERIAL_REQUEST_KINDS: ReadonlyArray<{ key: MaterialRequestKind; label: string }> = [
  { key: 'book_pdf', label: '교재 PDF' },
  { key: 'worksheet', label: '워크시트' },
  { key: 'test_paper', label: '시험지' },
  { key: 'other', label: '그 밖의 자료' },
];

const MATERIAL_REQUEST_STATES: ReadonlyArray<{
  key: MaterialRequestState;
  label: string;
  tone: 'warning' | 'info' | 'success' | 'danger';
}> = [
  { key: 'received', label: '접수', tone: 'warning' },
  { key: 'preparing', label: '준비 중', tone: 'info' },
  { key: 'delivered', label: '전달 완료', tone: 'success' },
  { key: 'rejected', label: '반려', tone: 'danger' },
];

const stateTone = (state: MaterialRequestState) =>
  MATERIAL_REQUEST_STATES.find((item) => item.key === state)?.tone ?? 'neutral';

const kstToday = (): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const stamp = (value: string): string => value.slice(0, 16).replace('T', ' ');

function FilePicker({ files, disabled, onChange, label, inputId }: {
  files: File[];
  disabled?: boolean;
  onChange: (files: File[]) => void;
  label: string;
  inputId: string;
}) {
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type="file"
        multiple
        disabled={disabled}
        onChange={(event) => onChange(Array.from(event.currentTarget.files ?? []).slice(0, 3))}
      />
      <p className="mt-1 text-[12px] text-fg-subtle">
        {files.length > 0 ? files.map((file) => file.name).join(' · ') : '최대 3개'}
      </p>
    </div>
  );
}

function RequestFiles({ item }: { item: MaterialRequestItem }) {
  if (item.files.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label="자료 요청 파일">
      {item.files.map((file) => (
        <FileDownloadButton
          key={file.id}
          id={file.id}
          label={`${file.purpose === 'delivery' ? '전달' : '요청'} · ${file.name}`}
        />
      ))}
    </div>
  );
}

function RequestHistory({ item }: { item: MaterialRequestItem }) {
  return (
    <details className="mt-3 rounded-lg bg-inset px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-bold text-fg">처리 이력 {item.events.length}건</summary>
      <ol className="mt-2 space-y-1 text-[12px] text-fg-subtle">
        {item.events.map((event) => (
          <li key={event.id}>
            {stamp(event.at)} · {event.actorName} · {event.actionLabel}
            {event.reason ? ` · ${event.reason}` : ''}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** 강사 등록과 내 요청 이력. 주간 화면이 아닌 서버의 현재·예정 전체 담당 학생을 사용한다. */
export function MaterialRequestDraft({ viewerId, focusRequestId = null }: {
  viewerId: number | null;
  focusRequestId?: number | null;
}) {
  const options = useMaterialRequestOptions(viewerId !== null);
  const mine = useMyMaterialRequests(viewerId !== null);
  const create = useCreateMaterialRequest();
  const acknowledge = useAcknowledgeMaterialRequest();
  const createKey = useRequestKey();
  const acknowledgeKey = useRequestKey();
  const [kind, setKind] = useState<MaterialRequestKind | ''>('');
  const [studentId, setStudentId] = useState('');
  const [neededOn, setNeededOn] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const itemRefs = useRef<Record<number, HTMLElement | null>>({});
  const ready = Boolean(kind && studentId && neededOn && body.trim());

  useEffect(() => {
    setKind('');
    setStudentId('');
    setNeededOn('');
    setBody('');
    setFiles([]);
    setSuccess(null);
  }, [viewerId]);

  useEffect(() => {
    const students = options.data?.students ?? [];
    if (studentId && !students.some((student) => String(student.id) === studentId)) setStudentId('');
  }, [options.data?.students, studentId]);

  useEffect(() => {
    if (!focusRequestId || !mine.data) return;
    window.requestAnimationFrame(() => itemRefs.current[focusRequestId]?.scrollIntoView?.({ block: 'center' }));
  }, [focusRequestId, mine.data]);

  const submit = async () => {
    if (!ready || !kind) return;
    setSuccess(null);
    const preparedFiles = await Promise.all(files.map((file) => fileUploadBody(file, 'material-request')));
    const content = { kind, studentId: Number(studentId), neededOn, body: body.trim(), files: preparedFiles };
    const result = await create.mutateAsync({ ...content, requestKey: createKey.keyFor(content) });
    createKey.reset();
    setKind('');
    setStudentId('');
    setNeededOn('');
    setBody('');
    setFiles([]);
    setSuccess(result.replayed ? '앞서 접수된 같은 요청을 확인했습니다.' : '자료 요청을 접수했습니다.');
  };

  const acknowledgeItem = (item: MaterialRequestItem) => {
    const content = { id: item.id, expectedVersion: item.version };
    acknowledge.mutate({ ...content, requestKey: acknowledgeKey.keyFor(content) }, {
      onSuccess: () => acknowledgeKey.reset(),
    });
  };

  return (
    <div id="material-request" className="mb-4 scroll-mt-4 space-y-4">
      <Panel title="자료 요청" sub="교재 PDF · 워크시트 · 시험지 · 그 밖의 자료를 관리자에게 요청합니다">
        <QueryState query={options} empty="현재 또는 예정된 내 수업 학생이 없습니다." isEmpty={(data) => data.students.length === 0}>
          {(data) => (
            <form onSubmit={(event) => { event.preventDefault(); void submit().catch(() => undefined); }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <Label htmlFor="material-request-kind">자료 종류 *</Label>
                  <Select id="material-request-kind" required value={kind}
                    onChange={(event) => setKind(event.currentTarget.value as MaterialRequestKind | '')}>
                    <option value="">선택</option>
                    {MATERIAL_REQUEST_KINDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </Select>
                </div>
                <div className="min-w-0">
                  <Label htmlFor="material-request-student">학생 *</Label>
                  <Select id="material-request-student" required value={studentId}
                    onChange={(event) => setStudentId(event.currentTarget.value)}>
                    <option value="">선택</option>
                    {data.students.map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
                  </Select>
                </div>
                <div className="min-w-0">
                  <Label htmlFor="material-request-needed-on">필요한 날 *</Label>
                  <Input id="material-request-needed-on" type="date" min={kstToday()} required value={neededOn}
                    onChange={(event) => setNeededOn(event.currentTarget.value)} />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Label htmlFor="material-request-body" hint={`${body.length} / 2000자`}>요청 내용 *</Label>
                  <Textarea id="material-request-body" required maxLength={2000} value={body}
                    placeholder="필요한 범위·목적·형식을 적어 주세요."
                    onChange={(event) => setBody(event.currentTarget.value)} />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <FilePicker inputId="material-request-files" label="참고 파일" files={files} disabled={create.isPending} onChange={setFiles} />
                </div>
              </div>
              {create.isError ? <Banner tone="danger" className="mt-3">{apiMessage(create.error)}</Banner> : null}
              {success ? <Banner tone="success" className="mt-3">{success}</Banner> : null}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[12px] text-fg-subtle">
                  {ready ? '입력 내용을 확인한 뒤 요청해 주세요.' : '종류·학생·필요일·요청 내용을 입력해 주세요.'}
                </span>
                <Button type="submit" variant="primary" className="ml-auto min-h-11" disabled={!ready || create.isPending}>
                  {create.isPending ? '요청하는 중…' : '자료 요청'}
                </Button>
              </div>
            </form>
          )}
        </QueryState>
      </Panel>

      <Panel title="내 자료 요청" sub="처리 상태와 전달 파일을 확인합니다">
        {acknowledge.isError ? <Banner tone="danger" className="mb-3">{apiMessage(acknowledge.error)}</Banner> : null}
        <QueryState query={mine} empty="아직 요청한 자료가 없습니다." isEmpty={(data) => data.items.length === 0}>
          {(data) => (
            <div className="space-y-3">
              {data.items.map((item) => (
                <article
                  key={item.id}
                  ref={(node) => { itemRefs.current[item.id] = node; }}
                  className={`rounded-xl border p-4 ${focusRequestId === item.id ? 'border-primary bg-primary/5' : 'border-line'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={stateTone(item.state)}>{item.stateLabel}</Chip>
                    <b className="text-[13px] text-fg">{item.studentName} · {item.kindLabel}</b>
                    {item.overdue ? <Chip tone="danger">기한 지남</Chip> : null}
                    <span className="ml-auto text-[12px] text-fg-subtle">필요 {item.neededOn}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] text-fg-2">{item.body}</p>
                  {item.rejectReason ? <Banner tone="danger" className="mt-3">반려 사유 · {item.rejectReason}</Banner> : null}
                  <RequestFiles item={item} />
                  {item.state === 'delivered' && !item.acknowledgedAt ? (
                    <div className="mt-3 flex justify-end">
                      <Button variant="success" disabled={acknowledge.isPending}
                        onClick={() => acknowledgeItem(item)}>수신 확인</Button>
                    </div>
                  ) : item.acknowledgedAt ? (
                    <p className="mt-3 text-right text-[12px] font-bold text-green">{stamp(item.acknowledgedAt)} 수신 확인</p>
                  ) : null}
                  <RequestHistory item={item} />
                </article>
              ))}
            </div>
          )}
        </QueryState>
      </Panel>
    </div>
  );
}

type Editor = { id: number; action: 'delivered' | 'rejected'; reason: string; files: File[] };

/** 관리자 접수→준비→전달/반려 보드. 권고안대로 첫 준비자가 담당자가 되며 화면은 서버 결과만 표시한다. */
export function MaterialRequestBoard({ focusRequestId = null }: { focusRequestId?: number | null }) {
  const query = useMaterialRequests();
  const transition = useTransitionMaterialRequest();
  const requestKey = useRequestKey();
  const [filter, setFilter] = useState<MaterialRequestState | 'all'>('all');
  const [editor, setEditor] = useState<Editor | null>(null);
  const refs = useRef<Record<number, HTMLElement | null>>({});
  const items = useMemo(() => {
    const all = query.data?.items ?? [];
    return filter === 'all' ? all : all.filter((item) => item.state === filter);
  }, [filter, query.data?.items]);

  useEffect(() => {
    if (!focusRequestId || !query.data) return;
    setFilter('all');
    window.requestAnimationFrame(() => refs.current[focusRequestId]?.scrollIntoView?.({ block: 'center' }));
  }, [focusRequestId, query.data]);

  const startPreparing = (item: MaterialRequestItem) => {
    const content = { id: item.id, action: 'preparing' as const, expectedVersion: item.version };
    transition.mutate({ ...content, requestKey: requestKey.keyFor(content) }, {
      onSuccess: () => requestKey.reset(),
    });
  };

  const saveEditor = async (item: MaterialRequestItem) => {
    if (!editor) return;
    const files = editor.action === 'delivered'
      ? await Promise.all(editor.files.map((file) => fileUploadBody(file, 'material-request')))
      : undefined;
    const content = {
      id: item.id,
      action: editor.action,
      expectedVersion: item.version,
      ...(editor.action === 'rejected' ? { reason: editor.reason.trim() } : {}),
      ...(files ? { files } : {}),
    };
    await transition.mutateAsync({ ...content, requestKey: requestKey.keyFor(content) });
    requestKey.reset();
    setEditor(null);
  };

  return (
    <Panel title="강사 자료 요청 보드" sub="강사 요청을 접수하고 준비·전달·반려 이력을 관리합니다">
      <div className="mb-3 flex flex-wrap gap-2" aria-label="자료 요청 상태 필터">
        <Button size="sm" variant={filter === 'all' ? 'dark' : 'secondary'} onClick={() => setFilter('all')}>
          전체 {query.data?.items.length ?? '—'}
        </Button>
        {MATERIAL_REQUEST_STATES.map((state) => (
          <Button key={state.key} size="sm" variant={filter === state.key ? 'dark' : 'secondary'}
            onClick={() => setFilter(state.key)}>
            {state.label} {query.data?.counts[state.key] ?? '—'}
          </Button>
        ))}
      </div>
      {transition.isError ? <Banner tone="danger" className="mb-3">{apiMessage(transition.error)} 목록을 다시 확인해 주세요.</Banner> : null}
      <QueryState query={query} empty="조건에 맞는 자료 요청이 없습니다." isEmpty={() => items.length === 0}>
        {() => (
          <div className="space-y-3">
            {items.map((item) => {
              const open = editor?.id === item.id;
              return (
                <article
                  key={item.id}
                  ref={(node) => { refs.current[item.id] = node; }}
                  data-material-request={item.id}
                  className={`rounded-xl border p-4 ${focusRequestId === item.id ? 'border-primary bg-primary/5' : 'border-line'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={stateTone(item.state)}>{item.stateLabel}</Chip>
                    <b className="text-[13px] text-fg">{item.teacherName} · {item.studentName} · {item.kindLabel}</b>
                    {item.overdue ? <Chip tone="danger">기한 지남</Chip> : null}
                    <span className="ml-auto text-[12px] text-fg-subtle">필요 {item.neededOn}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] text-fg-2">{item.body}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-subtle">
                    <span>요청 {stamp(item.createdAt)}</span>
                    {item.assignedToName ? <span>담당 {item.assignedToName}</span> : null}
                    {item.acknowledgedAt ? <span>강사 수신 확인 {stamp(item.acknowledgedAt)}</span> : null}
                  </div>
                  {item.rejectReason ? <Banner tone="danger" className="mt-3">반려 사유 · {item.rejectReason}</Banner> : null}
                  <RequestFiles item={item} />
                  {item.state === 'received' ? (
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button disabled={transition.isPending} onClick={() => setEditor({ id: item.id, action: 'rejected', reason: '', files: [] })}>반려</Button>
                      <Button variant="primary" disabled={transition.isPending} onClick={() => startPreparing(item)}>준비 시작</Button>
                    </div>
                  ) : item.state === 'preparing' ? (
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button disabled={transition.isPending} onClick={() => setEditor({ id: item.id, action: 'rejected', reason: '', files: [] })}>반려</Button>
                      <Button variant="success" disabled={transition.isPending} onClick={() => setEditor({ id: item.id, action: 'delivered', reason: '', files: [] })}>자료 전달</Button>
                    </div>
                  ) : null}
                  {open ? (
                    <form className="mt-3 rounded-lg border border-line bg-inset p-3"
                      onSubmit={(event) => { event.preventDefault(); void saveEditor(item).catch(() => undefined); }}>
                      {editor.action === 'rejected' ? (
                        <div>
                          <Label htmlFor={`material-request-reason-${item.id}`}>반려 사유 *</Label>
                          <Textarea id={`material-request-reason-${item.id}`} minLength={2} maxLength={500} required
                            value={editor.reason} onChange={(event) => setEditor({ ...editor, reason: event.currentTarget.value })} />
                        </div>
                      ) : (
                        <FilePicker inputId={`material-request-delivery-${item.id}`} label="전달 파일 *" files={editor.files}
                          disabled={transition.isPending} onChange={(files) => setEditor({ ...editor, files })} />
                      )}
                      <div className="mt-3 flex justify-end gap-2">
                        <Button onClick={() => setEditor(null)}>취소</Button>
                        <Button type="submit" variant={editor.action === 'rejected' ? 'danger' : 'success'}
                          disabled={transition.isPending || (editor.action === 'rejected' ? editor.reason.trim().length < 2 : editor.files.length === 0)}>
                          {transition.isPending ? '저장하는 중…' : editor.action === 'rejected' ? '반려 확정' : '전달 완료'}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                  <RequestHistory item={item} />
                </article>
              );
            })}
          </div>
        )}
      </QueryState>
    </Panel>
  );
}
