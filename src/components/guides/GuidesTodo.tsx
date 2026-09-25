/** @file-guide
 * 목적: 개발명세서 v2 §43의 안내 할 일(한 번 안내와 매번 회차 안내)을 표시한다.
 * 책임/재사용: 서버 집계·capability를 소비한다. 부모는 회차 키만, 같은 파일의 배정 Dialog는 선택·요청 잠금만 소유하며 공용 UI/훅을 재사용한다. 안내 본문은 GuideWriter에 위임하고 GUIDE 발송은 canSend·동기 동작 잠금으로 보호한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Guide, Guides, PerLessonNotice } from '@/api/types';
import { useAssignZoom, useMeta, useSendGuide, useSendZoomNotice } from '@/api/queries';
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
import { GuideReasonChip, GuideStateChip } from './GuideStatus';
import { GuideWriter } from './GuideWriter';

const CHANNEL: Record<PerLessonNotice['channel'], string> = {
  sms: '문자',
  kakao: '카카오',
  email: '이메일',
  app: '앱',
};

type AssignmentTarget = Pick<PerLessonNotice, 'serId' | 'onDate'>;

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

function PerLessonRow({ lesson, parentExternal, parentReason, assignmentOpen, onAssign }: {
  lesson: PerLessonNotice; parentExternal: boolean; parentReason?: string | null;
  assignmentOpen: boolean; onAssign: (target: AssignmentTarget) => void;
}) {
  const parentDisabled = !parentExternal;
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
            {lesson.kindName ?? lesson.serTitle ?? '수업명 미정'} · {lesson.teacherName ?? '강사 미정'}
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
            disabled
            title={parentDisabled ? (parentReason ?? '학부모 외부 발송 미연결') : '발송 API 연결 전'}
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
    ? `${selectedLesson.notices.map((notice) => notice.studentName).join(', ') || selectedLesson.serTitle || selectedLesson.kindName || '수업'} · ${hm(selectedLesson.startMin)} ~ ${hm(selectedLesson.endMin)}`
    : '선택한 수업';
  const capabilityReason = data.deliveryCapabilities.reason ?? '외부 발송 수신처와 제공자 정책이 연결되지 않았습니다.';

  const guideColumns: Array<Column<Guide>> = [
    {
      key: 'state',
      head: '상태',
      width: 112,
      cell: (guide) => (
        <div className="flex flex-col items-start gap-1">
          <GuideStateChip state={guide.state} />
          <GuideReasonChip reason={guide.reason} />
        </div>
      ),
    },
    {
      key: 'people',
      head: '학생 · 강사',
      width: 150,
      cell: (guide) => (
        <span>
          <b className="block text-fg">{guide.studentName ?? '학생 미상'}</b>
          <span className="text-[11px] text-fg-subtle">{guide.teacherName ?? '강사 미정'}</span>
        </span>
      ),
    },
    {
      key: 'lesson',
      head: '수업',
      width: 180,
      cell: (guide) => (
        <span>
          <b className="block text-fg">{guide.eventOn ?? guide.dueOn ?? '날짜 미정'}</b>
          <span className="text-[11px] text-fg-subtle">{guide.serTitle ?? '수업명 미정'}</span>
        </span>
      ),
    },
    {
      key: 'body',
      head: '안내',
      cell: (guide) => <span className="line-clamp-2 min-w-0 max-w-md text-fg-subtle [overflow-wrap:anywhere]">{guide.body ?? '안내 없음'}</span>,
    },
    {
      key: 'due',
      head: '기한',
      width: 120,
      cell: (guide) =>
        guide.overdueDays > 0 ? (
          <Chip tone="danger">{guide.overdueDays}일 지남</Chip>
        ) : (
          <span className="text-fg-subtle">{guide.dueOn ?? '—'}</span>
        ),
    },
    {
      key: 'action',
      head: '',
      width: 160,
      cell: (guide) => (
        <div className="flex flex-col items-start gap-2">
          {guide.pending ? <Button size="sm" variant="ghost" disabled={send.isPending}
            onClick={() => { if (actionLock.current !== 'send') { actionLock.current = 'edit'; setWritingId(guide.id); } }}>안내 작성</Button> : null}
          <Button size="sm" disabled={!guide.canSend || Boolean(writing) || send.isPending}
            onClick={() => sendGuide(guide)}>강사에게 보내기</Button>
          {guide.sendBlockedReason ? <span className="break-words text-[11px] text-fg-subtle">{guide.sendBlockedReason}</span> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="감시 중" value={data.stats.monitoring} />
        <StatCard label="마감 초과" value={data.stats.overdue} tone="danger" />
        <StatCard label="작성 중" value={data.stats.drafting} tone="neutral" />
        <StatCard label="발송 대기" value={data.stats.sendPending} tone="warning" />
        <StatCard label="강사 미확인" value={data.stats.teacherUnconfirmed} tone="info" />
        <StatCard label="반복 교체" value={data.stats.repeatedTeacherChange} tone="purple" />
      </div>

      {send.isError ? <Banner tone="danger">{apiMessage(send.error)}</Banner> : null}
      {writing ? <GuideWriter key={writing.id} guide={writing} onClose={closeWriter} /> : null}
      {assigning ? <ZoomAssignmentDialog key={`${assigning.serId}:${assigning.onDate}`} target={assigning}
        caption={assignmentCaption} initialZaccId={selectedLesson?.zaccId ?? null}
        onClose={() => setAssigning(null)} /> : null}

      <section id="guide-once" aria-labelledby="guide-once-title">
        <Banner tone="neutral">
          <span className="mr-2 inline-flex rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-white">한 번</span>
          신규 학생·강사 교체 안내는 한 번 작성합니다.
        </Banner>
        <Panel className="mt-2" title={<span id="guide-once-title">수업 안내와 교재</span>} sub={`${data.guides.length}건`}>
          <Table columns={guideColumns} rows={data.guides} rowKey={(guide) => guide.id} empty="처리할 한 번 안내가 없습니다." />
        </Panel>
      </section>

      <section aria-labelledby="guide-each-title">
        <Banner tone="warning">
          <span className="mr-2 inline-flex rounded-md bg-amber px-2 py-1 text-[11px] font-bold text-white">매번</span>
          온라인 수업은 수업마다 계정을 배정하고 학부모와 강사 양쪽에 안내합니다.
        </Banner>
        {!data.deliveryCapabilities.parentExternal || !data.deliveryCapabilities.teacherExternal ? (
          <Banner tone="danger" className="mt-2">
            {capabilityReason} 외부 발송 성공으로 표시하지 않으며 현재는 내부 처리 기록만 확인할 수 있습니다.
          </Banner>
        ) : null}
        <Panel className="mt-2" title={<span id="guide-each-title">오늘 온라인 수업</span>} sub={`${data.perLesson.length}건`}>
          {data.perLesson.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-fg-subtle">오늘 처리할 온라인 회차 안내가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {data.perLesson.map((lesson) => (
                <PerLessonRow key={`${lesson.serId}:${lesson.onDate}`} lesson={lesson}
                  parentExternal={data.deliveryCapabilities.parentExternal} parentReason={data.deliveryCapabilities.reason}
                  assignmentOpen={assigning !== null} onAssign={openAssignment} />
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
