/** @file-guide
 * 목적: 개발명세서 v2 §43의 안내 할 일(한 번 안내와 매번 회차 안내)을 표시한다.
 * 책임/재사용: 서버 집계·capability를 소비한다. 부모는 회차 키만, 같은 파일의 배정 Dialog는 선택·요청 잠금만 소유하며 공용 UI/훅을 재사용한다. 안내 본문은 GuideWriter에 위임하고 GUIDE 발송은 canSend·동기 동작 잠금으로 보호한다. 회차 학부모 안내는 GuardianSendDialog(보호자 선택 발송)에 위임한다. 매번 머리 「강사 N명 한 번에」는 서버 zoomBatch(N·막힌 이유)와 일괄 결과(건너뛴 줄의 서버 이유)를 그대로 적는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Guide, GuideMissing, Guides, PerLessonNotice, ZoomNoticeBatchResult } from '@/api/types';
import { useAssignZoom, useCreateGuideDraft, useMeta, useSendGuide, useSendZoomNotice, useSendZoomNoticeBatch } from '@/api/queries';
import { apiMessage } from '@/api/client';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Label, Select } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { StatCard } from '@/components/ui/StatCard';
import { Table, type Column } from '@/components/ui/Table';
import { hm } from '@/components/teacher/format';
import { longDateLabel, todayKst } from '@/lib/calendar';
import { GuideReasonChip, GuideStateChip, guideLessonLabel } from './GuideStatus';
import { GuideWriter } from './GuideWriter';
import { GuardianSendDialog } from '@/components/guardians/GuardianSendDialog';

const CHANNEL: Record<PerLessonNotice['channel'], string> = {
  sms: '문자',
  kakao: '카카오',
  email: '이메일',
  app: '앱',
};

type AssignmentTarget = Pick<PerLessonNotice, 'serId' | 'onDate'>;
type ParentNotice = PerLessonNotice['notices'][number];

/**
 * 「한 번」 표의 한 줄 — 이미 있는 안내(pending) 또는 **필요한데 아직 없는 안내**(서버 missing · g4 §43-2).
 * 두 갈래 모두 서버가 판정해 준 줄이고, 화면은 한 표에 놓기만 한다.
 */
type OnceRow = { kind: 'guide'; key: string; guide: Guide } | { kind: 'missing'; key: string; missing: GuideMissing };

/**
 * 기한 칸의 긴급도 낱말 — 원문 §43 「마감 지남」·「오늘 안에」 (g4 §43-10).
 * 판정은 서버 overdueDays(지난 날 수) 그대로이고, 「오늘 안에」는 기한 날짜가 오늘인 줄이다.
 */
function DueCell({ overdueDays, dueOn }: { overdueDays: number; dueOn: string | null | undefined }) {
  if (overdueDays > 0) return <Chip tone="danger">{`마감 지남 · ${overdueDays}일`}</Chip>;
  if (dueOn && dueOn === todayKst()) return <Chip tone="warning">오늘 안에</Chip>;
  return <span className="text-fg-subtle">{dueOn ?? '—'}</span>;
}

/** 학부모 안내 줄(PNOTI parent)이 아직 없을 때 — 강사 줌 안내를 남기는 순간 학생별로 만들어진다 */
const PARENT_NO_ROW = '학부모 안내 줄이 아직 없습니다 — 강사 안내를 남기면 학생별로 만들어집니다';

/** 한 회차의 선택만 소유한다. 목록 재조회/재투영으로 sourceOccurrenceId가 바뀌어도 초안을 유지한다. */
function ZoomAssignmentDialog({ target, caption, initialZaccId, onClose }: {
  target: AssignmentTarget; caption: string; initialZaccId: number | null; onClose: () => void;
}) {
  const id = useId();
  const [selectedId, setSelectedId] = useState(initialZaccId === null ? '' : String(initialZaccId));
  // 이 컴포넌트는 창이 열린 동안만 mount된다. 선택 입력은 부모 목록의 state를 바꾸지 않는다.
  const meta = useMeta();
  const assign = useAssignZoom();
  const writing = useRef(false);
  const accounts = meta.data?.zaccs ?? [];
  const selected = accounts.find((account) => String(account.id) === selectedId);
  const pending = assign.isPending;
  const canSubmit = !pending && !meta.isPending && !meta.isError
    && selected !== undefined && Number.isSafeInteger(selected.id) && selected.id > 0;
  const close = () => { if (!writing.current) onClose(); };
  const submit = () => {
    if (writing.current || !canSubmit || !selected) return;
    writing.current = true;
    assign.mutate({ serId: target.serId, onDate: target.onDate, zaccId: selected.id }, {
      onSuccess: () => { writing.current = false; onClose(); },
      onSettled: () => { writing.current = false; },
    });
  };

  return (
    <Dialog open onClose={close} title="줌 계정 배정" footer={(
      <>
        <Button variant="ghost" onClick={close} disabled={pending}>취소</Button>
        <Button onClick={submit} disabled={!canSubmit}>{pending ? '배정 중…' : '배정'}</Button>
      </>
    )}>
      <p className="mb-2 text-[13px] font-bold">{caption}</p>
      <p className="mb-3 text-[12px] text-fg-subtle">이 회차의 계정만 바꿉니다. 같은 시간에 쓰는 계정은 저장할 때 확인합니다.</p>
      <Label htmlFor={id}>줌 계정</Label>
      <Select id={id} data-dialog-autofocus value={selectedId} disabled={pending}
        onChange={(event) => { if (!writing.current) setSelectedId(event.target.value); }}>
        <option value="">계정을 고르세요</option>
        {selectedId && !selected ? <option value={selectedId} disabled>선택한 계정 · 현재 후보에 없음</option> : null}
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
      </Select>
      {meta.isPending ? <p role="status" className="mt-2 text-[12px] text-fg-subtle">계정을 불러오는 중입니다.</p> : null}
      {meta.isError ? <Banner tone="danger" className="mt-3">
        <p>{apiMessage(meta.error)}</p>
        <Button size="sm" className="mt-2" onClick={() => void meta.refetch()} disabled={meta.isFetching}>다시 시도</Button>
      </Banner> : !meta.isPending && accounts.length === 0 ? (
        <Banner tone="warning" className="mt-3">배정할 수 있는 활성 계정이 없습니다.</Banner>
      ) : null}
      {!meta.isPending && !meta.isError && selectedId && !selected ? (
        <Banner tone="warning" className="mt-3">선택한 계정이 현재 후보에 없습니다. 다른 계정을 고르세요.</Banner>
      ) : null}
      {assign.isError ? <Banner tone="danger" className="mt-3">{apiMessage(assign.error)}</Banner> : null}
    </Dialog>
  );
}

/**
 * 「강사 N명 한 번에」의 결과 띠 (wave 6 §43-6) — 몇 명에게 몇 건이 나갔는지와 건너뛴 회차의 **서버 이유**를 그대로 적는다.
 * 줄마다 제 트랜잭션이라 일부만 나갈 수 있다 — 건너뛴 줄을 숨기면 「다 보냈다」로 읽힌다.
 */
function ZoomBatchResultBanner({ result }: { result: ZoomNoticeBatchResult }) {
  const head = result.sent.length > 0
    ? `강사 ${result.teacherCount}명에게 줌 안내 ${result.sent.length}건을 남겼습니다.`
    : '새로 보낸 줌 안내가 없습니다.';
  return (
    <Banner tone={result.sent.length > 0 ? 'success' : 'warning'} className="mb-2">
      <div data-testid="zoom-batch-result" role="status">
        <p>{head}{result.skipped.length > 0 ? ` 건너뜀 ${result.skipped.length}건` : ''}</p>
        {result.skipped.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {result.skipped.map((row) => (
              <li key={`${row.serId}:${row.onDate}`}>
                {`${hm(row.startMin)} ${row.studentNames} · ${row.teacherName ?? '강사 미정'} — ${row.reason ?? '보내지 못했습니다'}`}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Banner>
  );
}

function PerLessonRow({ lesson, assignmentOpen, onAssign }: {
  lesson: PerLessonNotice; assignmentOpen: boolean; onAssign: (target: AssignmentTarget) => void;
}) {
  /*
   * 학부모는 **보호자 선택 발송**으로 보낸다 (DQ3 대표 답변 2026-09-25 · N-42) — 그 학생의 안내 줄(PNOTI)과 본문을
   * `GuardianSendDialog` 에 넘긴다. 받는 사람·채널·보낼 수 있는지는 창이 서버에서 읽고, 「기록됨」은 실제로
   * 나간 것이 있을 때만 서버가 찍는다. 학생이 여럿이면 누구의 보호자에게 보낼지 먼저 고른다.
   */
  const [choosing, setChoosing] = useState(false);
  const [parentTarget, setParentTarget] = useState<ParentNotice | null>(null);
  const parentRows = lesson.notices.filter((notice) => notice.id != null);
  const openParent = () => {
    if (parentRows.length === 1) setParentTarget(parentRows[0]);
    else setChoosing((open) => !open);
  };
  /*
   * 강사는 **내부 사용자**라 실제로 보낼 수 있다 (C98 · F-63) — 외부 발송 계약(N-42)과 다른 길이다.
   * 설 수 있는지는 서버 `canSendTeacher` 하나가 정한다: 화면이 온라인·줌 계정·강사를 다시 보면
   * 눌리는데 거절당하는 단추가 생긴다 (D-R39).
   */
  const send = useSendZoomNotice();
  return (
    <article className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[78px_minmax(180px,1fr)_180px_290px]">
        <div>
          <b className="block text-[14px]">{hm(lesson.startMin)}</b>
          <span className="text-[11px] text-fg-subtle">{hm(lesson.endMin)}</span>
        </div>
        <div className="min-w-0">
          <b className="block truncate text-[13.5px]">
            {lesson.notices.map((notice) => notice.studentName).join(', ') || '학생 없음'}
          </b>
          <span className="text-[11.5px] text-fg-subtle">
            {guideLessonLabel({ serTitle: lesson.serTitle, subName: lesson.subName, kindName: lesson.kindName, roomName: lesson.roomName })} · {lesson.teacherName ?? '강사 미정'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lesson.zoomAssigned ? (
            <Chip tone="info" styleKind="solid">
              {lesson.zaccLabel ?? '줌 배정 완료'}
            </Chip>
          ) : (
            <Button size="sm" variant="ghost" disabled={assignmentOpen} onClick={() => onAssign(lesson)}>계정 배정 →</Button>
          )}
          {lesson.zoomAssigned ? <Button size="sm" variant="ghost" disabled={assignmentOpen} onClick={() => onAssign(lesson)}>계정 변경</Button> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            disabled={parentRows.length === 0}
            title={parentRows.length === 0 ? PARENT_NO_ROW : '보호자를 골라 보냅니다'}
            aria-expanded={parentRows.length > 1 ? choosing : undefined}
            onClick={openParent}
          >
            {lesson.parentDeliveryRecorded ? '학부모 기록 완료' : '학부모 안내'}
          </Button>
          <Button
            size="sm"
            disabled={!lesson.canSendTeacher || send.isPending}
            title={lesson.sendBlockedReason ?? '강사 수신함에 줌 안내를 남깁니다'}
            onClick={() => send.mutate({ serId: lesson.serId, onDate: lesson.onDate })}
          >
            {lesson.teacherDeliveryRecorded ? '강사 보냄' : '강사 안내'}
          </Button>
          <Button size="sm" variant="danger" disabled>
            안내문
          </Button>
        </div>
      </div>
      {send.isError ? <Banner tone="danger" className="mt-2">{apiMessage(send.error)}</Banner> : null}
      {choosing && parentRows.length > 1 ? (
        <div role="group" aria-label="보낼 학생" className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-fg-subtle">누구의 보호자에게 보낼까요?</span>
          {parentRows.map((notice) => (
            <Button key={notice.id} size="sm" variant="ghost"
              onClick={() => { setChoosing(false); setParentTarget(notice); }}>{notice.studentName}</Button>
          ))}
        </div>
      ) : null}
      {parentTarget ? (
        <GuardianSendDialog open student={{ id: parentTarget.studentId, name: parentTarget.studentName }}
          pnotiId={parentTarget.id ?? null} defaultBody={parentTarget.body ?? ''}
          title={`학부모 안내 — ${parentTarget.studentName}`} onClose={() => setParentTarget(null)} />
      ) : null}
      {lesson.notices.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
          {lesson.notices.map((notice) => (
            <li key={`${notice.studentId}-${notice.id ?? 'new'}`}>
              <Chip tone={notice.sentAt ? 'success' : 'warning'}>
                {notice.studentName} · {notice.channel ? CHANNEL[notice.channel] : '채널 미정'} ·{' '}
                {notice.sentAt ? '기록됨' : '처리 전'}
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function GuidesTodo({ data }: { data: Guides }) {
  const [writingId, setWritingId] = useState<number | null>(null);
  // 「안내 없음」 줄에서 방금 만든 초안 — 목록 재조회 전에도 바로 쓴다(§45 누락 카드와 같은 흐름)
  const [drafted, setDrafted] = useState<Guide | null>(null);
  const createDraft = useCreateGuideDraft();
  const writing = data.guides.find((guide) => guide.id === writingId && guide.pending);
  const send = useSendGuide();
  const actionLock = useRef<'edit' | 'send' | null>(null);
  // 동일 id 재조회는 초안을 보존하되 발송된 안내에는 이전 편집 세션을 남기지 않는다.
  useEffect(() => {
    if (writingId !== null && !writing) {
      setWritingId(null);
      if (actionLock.current === 'edit') actionLock.current = null;
    }
  }, [writingId, writing]);
  const closeWriter = () => { actionLock.current = null; setWritingId(null); };
  const sendGuide = (guide: Guide) => {
    if (actionLock.current || writing || !guide.canSend) return;
    actionLock.current = 'send';
    send.mutate(guide.id, { onSettled: () => { actionLock.current = null; } });
  };
  const [assigning, setAssigning] = useState<AssignmentTarget | null>(null);
  const openAssignment = ({ serId, onDate }: AssignmentTarget) => {
    if (assigning === null) setAssigning({ serId, onDate });
  };
  const selectedLesson = assigning
    ? data.perLesson.find((lesson) => lesson.serId === assigning.serId && lesson.onDate === assigning.onDate)
    : undefined;
  const assignmentCaption = selectedLesson
    ? `${selectedLesson.notices.map((notice) => notice.studentName).join(', ') || selectedLesson.serTitle || selectedLesson.subName || selectedLesson.kindName || '수업'} · ${hm(selectedLesson.startMin)} ~ ${hm(selectedLesson.endMin)}`
    : '선택한 수업';
  const capabilityReason = data.deliveryCapabilities.reason ?? '외부 발송 수신처와 제공자 정책이 연결되지 않았습니다.';
  /*
   * 「한 번」 목록은 **할 일만** 세운다 (원본 §43 · P0). 탭 배지 `todoCount` 가 서버 `pending` 으로 세므로
   * 목록도 같은 칸으로 걸러야 배지와 「N건」이 같은 수를 말한다. 보낸 것·강사가 확인한 것은 §45 이력에 남는다.
   * 판정은 다시 하지 않는다 — 서버 `GuideDto.pending`(GUIDE_PENDING_DB 파생)을 그대로 읽는다.
   */
  /*
   * 「안내 없음」(필요한데 GUIDE 가 없는 학생)도 같은 표에 선다 (g4 §43-2). 탭 배지 todoCount 가 이 수까지 세므로
   * 목록과 배지가 같은 수를 말한다. 누락 판정은 §45 와 같은 서버 함수다 — 화면은 받은 줄을 놓기만 한다.
   */
  const missingRows = data.missing ?? [];
  const onceRows: OnceRow[] = [
    ...missingRows.map((missing) => ({ kind: 'missing' as const, key: `m-${missing.sourceOccurrenceId}-${missing.studentId}`, missing })),
    ...data.guides.filter((guide) => guide.pending).map((guide) => ({ kind: 'guide' as const, key: `g-${guide.id}`, guide })),
  ];
  const startDraft = (missing: GuideMissing) => {
    if (actionLock.current || createDraft.isPending) return;
    createDraft.mutate(
      { sourceOccurrenceId: missing.sourceOccurrenceId, studentId: missing.studentId },
      { onSuccess: (guide) => setDrafted(guide) },
    );
  };

  const guideColumns: Array<Column<OnceRow>> = [
    {
      key: 'state',
      head: '상태',
      width: 112,
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          {row.kind === 'guide' ? <GuideStateChip state={row.guide.state} /> : <Chip tone="danger">안내 없음</Chip>}
          <GuideReasonChip reason={row.kind === 'guide' ? row.guide.reason : (row.missing.reason as Guide['reason'])} />
        </div>
      ),
    },
    {
      key: 'people',
      head: '학생 · 강사',
      width: 150,
      cell: (row) => {
        const item = row.kind === 'guide' ? row.guide : row.missing;
        return (
          <span>
            <b className="block text-fg">{item.studentName ?? '학생 미상'}</b>
            <span className="text-[11px] text-fg-subtle">{item.teacherName ?? '강사 미정'}</span>
          </span>
        );
      },
    },
    {
      key: 'lesson',
      head: '수업',
      width: 180,
      cell: (row) => {
        const on = row.kind === 'guide' ? (row.guide.eventOn ?? row.guide.dueOn) : row.missing.eventOn;
        return (
          <span>
            <b className="block text-fg">{on ?? '날짜 미정'}</b>
            <span className="text-[11px] text-fg-subtle">{guideLessonLabel(row.kind === 'guide' ? row.guide : row.missing)}</span>
          </span>
        );
      },
    },
    {
      key: 'body',
      head: '안내',
      cell: (row) =>
        row.kind === 'guide' ? (
          <span className="line-clamp-2 min-w-0 max-w-md text-fg-subtle [overflow-wrap:anywhere]">{row.guide.body ?? '아직 쓰지 않았습니다'}</span>
        ) : (
          <span className="text-fg-subtle">아직 만들지 않았습니다</span>
        ),
    },
    {
      key: 'due',
      head: '기한',
      width: 130,
      cell: (row) =>
        row.kind === 'guide' ? (
          <DueCell overdueDays={row.guide.overdueDays} dueOn={row.guide.dueOn} />
        ) : (
          // 안내 기한 = 그 수업 날 (서버가 초안의 due_on 을 수업 날로 둔다)
          <DueCell overdueDays={row.missing.overdueDays} dueOn={row.missing.eventOn} />
        ),
    },
    {
      key: 'action',
      head: '',
      width: 160,
      cell: (row) => {
        if (row.kind === 'missing') {
          const creating = createDraft.isPending
            && createDraft.variables?.sourceOccurrenceId === row.missing.sourceOccurrenceId
            && createDraft.variables.studentId === row.missing.studentId;
          return (
            <Button size="sm" variant="ghost" disabled={createDraft.isPending || Boolean(drafted)}
              aria-label={`${row.missing.studentName} 안내 작성`} onClick={() => startDraft(row.missing)}>
              {creating ? '초안 만드는 중…' : '안내 작성'}
            </Button>
          );
        }
        const guide = row.guide;
        return (
          <div className="flex flex-col items-start gap-2">
            {guide.pending ? <Button size="sm" variant="ghost" disabled={send.isPending}
              onClick={() => { if (actionLock.current !== 'send') { actionLock.current = 'edit'; setWritingId(guide.id); } }}>안내 작성</Button> : null}
            <Button size="sm" disabled={!guide.canSend || Boolean(writing) || send.isPending}
              onClick={() => sendGuide(guide)}>강사에게 보내기</Button>
            {guide.sendBlockedReason ? <span className="break-words text-[11px] text-fg-subtle">{guide.sendBlockedReason}</span> : null}
          </div>
        );
      },
    },
  ];
  // 매번 머리 오른쪽 「처리할 것 N」 — 서버 기록 플래그 둘 중 하나라도 비어 있는 회차 (g4 §43-11)
  const perLessonTodo = data.perLesson.filter((lesson) => !lesson.parentDeliveryRecorded || !lesson.teacherDeliveryRecorded).length;
  /*
   * 원문 §43 매번 머리 오른쪽 「강사 9명 한 번에」 (wave 6 §43-6). N·누를 수 있는지·막힌 이유는 서버 zoomBatch 그대로다 —
   * 화면이 perLesson 을 다시 세면 단추의 N 과 서버가 실제로 고르는 회차가 갈린다(D-R37 · D-R39). 옛 응답(칸 없음)이면 서지 않는다.
   */
  const zoomBatch = data.zoomBatch;
  const batch = useSendZoomNoticeBatch();
  const batchAction = zoomBatch ? (
    <>
      {!zoomBatch.canSend && zoomBatch.blockedReason ? (
        <span className="max-w-xs text-right text-[11px] text-fg-subtle">{zoomBatch.blockedReason}</span>
      ) : null}
      <Button
        size="sm"
        variant="primary"
        disabled={!zoomBatch.canSend || batch.isPending}
        title={zoomBatch.blockedReason ?? `오늘 온라인 수업 ${zoomBatch.lessonCount}건의 줌 안내를 강사 ${zoomBatch.teacherCount}명에게 한 번에 남깁니다`}
        onClick={() => { if (!batch.isPending) batch.mutate(); }}
      >
        {batch.isPending ? '보내는 중…' : `강사 ${zoomBatch.teacherCount}명 한 번에`}
      </Button>
    </>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {/* 원문 §43-12: 칸마다 색 윗줄(검정 · 빨강 · 회색 · 호박 · 청록 · 보라) · 0 인 칸 흐림 — 값은 서버 stats 그대로 */}
        {([
          ['감시 중', data.stats.monitoring, 'neutral'],
          ['마감 초과', data.stats.overdue, 'danger'],
          ['작성 중', data.stats.drafting, 'neutral'],
          ['발송 대기', data.stats.sendPending, 'warning'],
          ['강사 미확인', data.stats.teacherUnconfirmed, 'teal'],
          ['반복 교체', data.stats.repeatedTeacherChange, 'purple'],
        ] as const).map(([label, value, tone]) => (
          <StatCard key={label} label={label} value={value} tone={tone} accent={tone} dim={value === 0} />
        ))}
      </div>

      {send.isError ? <Banner tone="danger">{apiMessage(send.error)}</Banner> : null}
      {/* 보낸 안내는 「한 번」 목록에서 빠지므로(할 일만) 어디로 갔는지 한 줄로 알린다 */}
      {send.isSuccess ? (
        <Banner tone="success"><p role="status">안내를 강사에게 보냈습니다. 보낸 안내는 이력 탭에 남습니다.</p></Banner>
      ) : null}
      {createDraft.isError ? <Banner tone="danger">{apiMessage(createDraft.error)}</Banner> : null}
      {writing ? <GuideWriter key={writing.id} guide={writing} onClose={closeWriter} /> : null}
      {drafted && !writing ? <GuideWriter key={`draft-${drafted.id}`} guide={drafted} onClose={() => setDrafted(null)} /> : null}
      {assigning ? <ZoomAssignmentDialog key={`${assigning.serId}:${assigning.onDate}`} target={assigning}
        caption={assignmentCaption} initialZaccId={selectedLesson?.zaccId ?? null}
        onClose={() => setAssigning(null)} /> : null}

      <section id="guide-once" aria-labelledby="guide-once-title">
        {/* 원문 §43 띠 한 줄 — 「한 번 · 신규 학생 · 강사 교체 — [수업 안내와 교재]를 한 번 보냅니다 · N건」 (g4 §43-9) */}
        <Banner tone="neutral">
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-white">한 번</span>
            <span>
              신규 학생 · 강사 교체 — <b id="guide-once-title">수업 안내와 교재</b>를 한 번 보냅니다
            </span>
            <b className="ml-auto text-[13px]">{`${onceRows.length}건`}</b>
          </span>
        </Banner>
        <Panel className="mt-2">
          <Table columns={guideColumns} rows={onceRows} rowKey={(row) => row.key} empty="처리할 한 번 안내가 없습니다." />
        </Panel>
      </section>

      <section aria-labelledby="guide-each-title">
        <Banner tone="warning">
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-md bg-amber px-2 py-1 text-[11px] font-bold text-white">매번</span>
            <span>온라인 수업은 수업마다 계정을 배정하고 학부모와 강사 양쪽에 안내합니다.</span>
            <b className="ml-auto text-[13px]">{`처리할 것 ${perLessonTodo}`}</b>
          </span>
        </Banner>
        {/* 강사 안내는 앱 안 알림이 전달이다(외부 채널 없음 — 막힌 것이 아니다). 막힌 이유는 학부모 채널 설정이 없을 때만 서버가 준다 (DQ3) */}
        {!data.deliveryCapabilities.parentExternal ? (
          <Banner tone="danger" className="mt-2">
            {capabilityReason}
          </Banner>
        ) : null}
        {/* 원문 매번 머리 「26년 8월 21일 금요일 · 온라인 14건 · 오늘」 — 공용 긴 날짜 (g4 §43-11) */}
        <Panel className="mt-2" title={<span id="guide-each-title">{`${longDateLabel(todayKst())} · 온라인 ${data.perLesson.length}건 · 오늘`}</span>}
          right={batchAction}>
          {batch.data ? <ZoomBatchResultBanner result={batch.data} /> : null}
          {batch.isError ? <Banner tone="danger" className="mb-2">{apiMessage(batch.error)}</Banner> : null}
          {data.perLesson.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-fg-subtle">오늘 처리할 온라인 회차 안내가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {data.perLesson.map((lesson) => (
                <PerLessonRow key={`${lesson.serId}:${lesson.onDate}`} lesson={lesson}
                  assignmentOpen={assigning !== null} onAssign={openAssignment} />
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
