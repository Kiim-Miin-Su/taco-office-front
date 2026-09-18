/** @file-guide
 * 목적: 개발명세서 v2 §43의 안내 할 일(한 번 안내와 매번 회차 안내)을 표시한다.
 * 책임/재사용: 서버 GuidesDto의 집계·pending·capability만 소비하고, 안내 본문 편집은 GuideWriter에 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useState } from 'react';
import type { Guide, Guides, PerLessonNotice } from '@/api/types';
import { useSendZoomNotice } from '@/api/queries';
import { apiMessage } from '@/api/client';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
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

function PerLessonRow({ lesson, data }: { lesson: PerLessonNotice; data: Guides }) {
  const parentDisabled = !data.deliveryCapabilities.parentExternal;
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
        <div>
          {lesson.zoomAssigned ? (
            <Chip tone="info" styleKind="solid">
              {lesson.zaccLabel ?? '줌 배정 완료'}
            </Chip>
          ) : (
            <Chip tone="danger">계정 배정 필요</Chip>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            disabled
            title={parentDisabled ? (data.deliveryCapabilities.reason ?? '학부모 외부 발송 미연결') : '발송 API 연결 전'}
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
  const [writing, setWriting] = useState<Guide | null>(null);
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
      cell: (guide) => <span className="line-clamp-2 text-fg-subtle">{guide.body ?? '안내 없음'}</span>,
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
      width: 104,
      cell: (guide) =>
        guide.pending ? (
          <Button size="sm" variant="primary" onClick={() => setWriting(guide)}>
            안내 작성
          </Button>
        ) : (
          <span className="text-fg-subtle">완료</span>
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

      {writing ? <GuideWriter guide={writing} onClose={() => setWriting(null)} /> : null}

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
                <PerLessonRow key={lesson.sourceOccurrenceId} lesson={lesson} data={data} />
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
