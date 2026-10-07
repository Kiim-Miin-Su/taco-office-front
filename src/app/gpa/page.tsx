/** @file-guide
 * 목적: page.tsx — 퇴역한 GPA 신규 업무의 과거 사이클·학생·회차 기록을 읽기 전용으로 조회한다.
 * 책임/재사용: 기존 AppShell/RequireAuth/QueryState, 생성 GpaBoard 타입과 useGpaBoard GET 계약을 재사용하고 mutation을 소유하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, LinkButton, PageHeader, Panel, QueryState, StatCard, Table, type Column } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { useGpaBoard } from '@/api/queries';
import type { GpaBoard, GpaUse } from '@/api/types';
import { hm } from '@/components/teacher/format';
import { GPA_SVC_DOT, GpaPointCard, gpaSvcTone } from '@/components/data/GpaPointCard';

const addD = (iso: string, n: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const mmdd = (iso: string): string => iso.slice(5);

/** 검증 도입 전의 과거 값도 있으므로 읽을 때 HTTP(S)만 활성화한다. */
const safeRecordHref = (value: string | null | undefined): string | null => {
  if (!value || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '\\')) return null;
  const text = value.trim();
  if (!/^https?:\/\/[^/?#]/i.test(text) || /\s/.test(text)) return null;
  try {
    const url = new URL(text);
    return url.hostname && !url.username && !url.password && (url.protocol === 'http:' || url.protocol === 'https:')
      ? text
      : null;
  } catch {
    return null;
  }
};

function HistoricalBoard({ d, anchor, setAnchor }: {
  d: GpaBoard;
  anchor: string | undefined;
  setAnchor: (value: string | undefined) => void;
}) {
  const [pickedId, setPickedId] = useState<number | null>(null);

  if (!d.cycle) {
    return (
      <>
        <PageHeader title="GPA 과거 기록" sub="내부 감사 자료 · 읽기 전용" />
        <Banner tone="info" className="mt-3">신규 등록·배정·승인 업무는 종료됐습니다.</Banner>
        <Panel className="mt-4" title="과거 기록">
          <p className="py-5 text-center text-[13px] text-fg-subtle">보존된 GPA 사이클 기록이 없습니다.</p>
        </Panel>
      </>
    );
  }

  const cycle = d.cycle;
  const picked = d.students.find((student) => student.studentId === pickedId) ?? null;
  const uses = picked ? d.uses.filter((entry) => entry.studentId === picked.studentId) : [];
  const historyCols: Array<Column<GpaUse>> = [
    {
      key: 'at', head: '날짜 · 시간', width: 150,
      cell: (entry) => `${mmdd(entry.onDate)}${entry.startMin != null ? ` ${hm(entry.startMin)}${entry.endMin != null ? `–${hm(entry.endMin)}` : ''}` : ''}`,
    },
    { key: 'who', head: '학생', width: 90, cell: () => picked?.name ?? '—' },
    {
      key: 'svc', head: '서비스',
      cell: (entry) => {
        const service = d.services.find((item) => item.key === entry.svcKey);
        return (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn('h-2 w-2 rounded-sm', GPA_SVC_DOT[gpaSvcTone(entry.svcKey)])} />
            {service?.name ?? entry.svcKey}
          </span>
        );
      },
    },
    { key: 'p', head: 'P', width: 50, cell: (entry) => entry.points },
    { key: 'coord', head: '코디네이터', width: 110, cell: (entry) => entry.coordName ?? '—' },
    {
      key: 'note', head: '기록지', width: 110,
      cell: (entry) => {
        const href = safeRecordHref(entry.noteUrl);
        return href ? (
          <LinkButton
            href={href}
            target="_blank"
            rel="noreferrer"
            size="sm"
            variant="secondary"
            aria-label={`${picked?.name ?? '학생'} ${mmdd(entry.onDate)} 기록지 열기`}
          >
            열기
          </LinkButton>
        ) : entry.noteUrl ? '기록지 있음' : '—';
      },
    },
    {
      key: 'state', head: '상태', width: 110,
      cell: (entry) => (
        <span className={cn('inline-flex items-center gap-1.5 font-bold', entry.state === 'ok' ? 'text-green' : 'text-amber')}>
          <span aria-hidden className={cn('h-2 w-2 rounded-full', entry.state === 'ok' ? 'bg-green' : 'bg-amber')} />
          {entry.state === 'ok' ? '승인' : '승인 대기'}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="GPA 과거 기록" sub="내부 감사 자료 · 읽기 전용" />
      <Banner tone="info" className="mt-3">
        신규 등록·배정·승인 업무는 종료됐습니다. 진행된 사이클과 회차 기록은 감사용으로 보존합니다.
      </Banner>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {anchor !== undefined ? (
          <Button size="sm" variant="ghost" onClick={() => { setAnchor(undefined); setPickedId(null); }}>현재 사이클로</Button>
        ) : null}
        <Chip size="compact" tone="neutral">
          {cycle.closed ? `마감 · ${cycle.closedByName ?? '담당자 미상'}${cycle.closedAt ? ` · ${cycle.closedAt.slice(0, 10)}` : ''}` : '과거 진행 상태'}
        </Chip>
      </div>

      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2 flex items-center gap-1 rounded-xl border border-line bg-card px-2 py-3 sm:col-span-1">
          <Button
            aria-label="이전 사이클"
            size="sm"
            variant="ghost"
            disabled={!d.hasPrev}
            onClick={() => { setAnchor(addD(cycle.from, -1)); setPickedId(null); }}
          >
            ‹
          </Button>
          <span className="min-w-0 grow text-center">
            <span className="block text-[14px] font-bold text-fg">{cycle.no}차 사이클</span>
            <span className="block text-[12px] text-fg-subtle">{cycle.from} ~ {cycle.to}</span>
          </span>
          <Button
            aria-label="다음 사이클"
            size="sm"
            variant="ghost"
            disabled={!d.hasNext}
            onClick={() => { setAnchor(addD(cycle.to, 1)); setPickedId(null); }}
          >
            ›
          </Button>
        </div>
        <StatCard label="배정" value={`${d.totalAlloc}p`} valueFirst />
        <StatCard label="사용" value={`${d.totalUsed}p`} valueFirst />
        <StatCard label="승인 대기" value={`${d.totalWait}p`} valueFirst />
        <StatCard label="잔여" value={`${d.totalRemain}p`} valueFirst />
        <StatCard label="진행" value={`${d.totalUses}회`} valueFirst />
      </div>

      <Panel title={`학생별 과거 포인트 · ${d.students.length}명`} sub="서버가 보존한 사이클 종료 시점의 값을 표시합니다.">
        {d.students.length === 0 ? (
          <p className="py-5 text-center text-[13px] text-fg-subtle">이 사이클에 보존된 학생 기록이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-2 lg:grid-cols-3">
            {d.students.map((student) => (
              <GpaPointCard
                key={student.studentId}
                s={student}
                selected={picked?.studentId === student.studentId}
                onSelect={() => setPickedId(picked?.studentId === student.studentId ? null : student.studentId)}
              />
            ))}
          </div>
        )}
      </Panel>

      {picked ? (
        <Panel className="mt-4" title={<>{picked.name} 회차 내역 <span className="ml-1 text-[12px] font-normal text-fg-subtle">{uses.length}건</span></>}>
          <Table columns={historyCols} rows={uses} rowKey={(entry) => entry.id} empty="이 사이클 회차 기록이 없습니다" />
        </Panel>
      ) : null}
    </>
  );
}

export default function GpaPage() {
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const query = useGpaBoard(anchor);
  return (
    <RequireAuth>
      <AppShell>
        <QueryState query={query} isEmpty={() => false}>
          {(data) => <HistoricalBoard d={data} anchor={anchor} setAnchor={setAnchor} />}
        </QueryState>
      </AppShell>
    </RequireAuth>
  );
}
