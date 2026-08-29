/**
 * 탭 07 수업 안내 — §41 안내(한 번만) · §42 회차 안내(매번).
 *
 * 이 둘을 한 표에 섞지 않는 것이 이 화면의 요점입니다.
 * 섞으면 「줌 링크는 지난주에 보냈으니 됐다」가 되어 버립니다 (D-R5).
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Chip, Column, PageHeader, Panel, StatCard, Table, Tabs } from '@/components/ui';
import { useGuides } from '@/api/queries';
import type { Guide, PerLessonNotice } from '@/api/types';

type Tab = 'once' | 'each';

const REASON: Record<string, string> = { new: '첫 수업', teacher_change: '강사 교체' };
/** guide_state_t 그대로. draft·ready 가 「아직 안 보냄」이다 — 서버와 같은 낱말을 쓴다. */
const STATE: Record<string, { label: string; tone: 'danger' | 'warning' | 'success' | 'info' }> = {
  draft: { label: '작성 중', tone: 'danger' },
  ready: { label: '보낼 준비', tone: 'warning' },
  sent: { label: '보냄', tone: 'success' },
  read: { label: '읽음', tone: 'info' },
};
const PENDING = ['draft', 'ready'];
const CHANNEL: Record<string, string> = { sms: '문자', kakao: '카카오', email: '이메일', app: '앱' };

export default function GuidesPage() {
  const [tab, setTab] = useState<Tab>('once');
  const q = useGuides();
  const d = q.data;

  const onceCols: Array<Column<Guide>> = [
    { key: 'r', head: '사유', width: 100, cell: (r) => <Chip tone="info">{REASON[r.reason] ?? r.reason}</Chip> },
    { key: 's', head: '학생', width: 100, cell: (r) => <span className="font-bold">{r.studentName ?? '—'}</span> },
    { key: 't', head: '선생님', width: 100, cell: (r) => r.teacherName ?? '—' },
    { key: 'b', head: '내용', cell: (r) => <span className="text-fg-subtle">{r.body ?? '—'}</span> },
    {
      key: 'st', head: '상태', width: 110,
      cell: (r) => {
        const s = STATE[r.state] ?? { label: r.state, tone: 'info' as const };
        return <Chip tone={s.tone}>{s.label}</Chip>;
      },
    },
    {
      key: 'd', head: '기한', width: 110,
      cell: (r) => (r.overdueDays > 0 ? <Chip tone="danger">{r.overdueDays}일 지남</Chip> : (r.dueOn ?? '—')),
    },
  ];

  const eachCols: Array<Column<PerLessonNotice>> = [
    { key: 'd', head: '날짜', width: 110, cell: (r) => r.onDate },
    { key: 'c', head: '채널', width: 90, cell: (r) => <Chip>{CHANNEL[r.channel] ?? r.channel}</Chip> },
    { key: 's', head: '학생', width: 100, cell: (r) => <span className="font-bold">{r.studentName ?? '—'}</span> },
    { key: 'b', head: '내용', cell: (r) => <span className="text-fg-subtle">{r.body}</span> },
    {
      key: 'st', head: '발송', width: 110,
      cell: (r) => (r.sentAt ? <Chip tone="success">보냄</Chip> : <Chip tone="danger">아직</Chip>),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="수업 안내"
          sub="§41 한 번만 나가는 안내 · §42 회차마다 나가는 안내"
          right={d?.todoCount ? <Chip tone="danger" styleKind="solid">{d.todoCount}건 남음</Chip> : null}
        />

        <Banner tone="info">
          <b>안내는 한 번</b>(첫 수업 · 강사 교체), <b>회차 안내는 매번</b>(온라인 줌 링크 등)입니다.
          같은 표에 두면 「지난번에 보냈으니 됐다」가 되어 버립니다 (D-R5).
        </Banner>

        {d?.scopedTeacherId ? (
          <Banner tone="neutral" className="mt-2">본인 수업의 안내만 보입니다.</Banner>
        ) : null}

        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="안내 — 보내야 함" value={(d?.guides ?? []).filter((g) => PENDING.includes(g.state)).length} tone="danger" />
          <StatCard label="안내 — 보냄" value={(d?.guides ?? []).filter((g) => !PENDING.includes(g.state)).length} tone="success" />
          <StatCard label="회차 안내 — 아직" value={(d?.perLesson ?? []).filter((p) => !p.sentAt).length} tone="warning" />
          <StatCard label="회차 안내 — 보냄" value={(d?.perLesson ?? []).filter((p) => p.sentAt).length} tone="success" />
        </div>

        <Tabs
          options={[
            { value: 'once', label: `안내 (한 번) ${d?.guides.length ?? 0}` },
            { value: 'each', label: `회차 안내 (매번) ${d?.perLesson.length ?? 0}` },
          ]}
          value={tab}
          onChange={setTab}
        />

        <Panel className="mt-3" title={tab === 'once' ? '안내 — 보내면 끝' : '회차 안내 — 회차마다 다시'}>
          {tab === 'once' ? (
            <Table columns={onceCols} rows={d?.guides ?? []} rowKey={(r) => r.id}
              empty={q.isLoading ? '불러오는 중…' : '안내가 없습니다'} />
          ) : (
            <Table columns={eachCols} rows={d?.perLesson ?? []} rowKey={(r) => r.id}
              empty={q.isLoading ? '불러오는 중…' : '회차 안내가 없습니다'} />
          )}
        </Panel>
      </AppShell>
    </RequireAuth>
  );
}
