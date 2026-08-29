/**
 * 탭 05 수업 현황판 — §34.
 *
 * 네 마크(교재 · 안내 · 줌 · 리포트)는 **저장된 값이 아닙니다** (D-R4 · `clChk()`).
 * 요청할 때마다 서버가 원장을 다시 보고 판정합니다. 그래서 캐시도 짧게 잡습니다 —
 * 교재를 방금 배부했는데 마크가 그대로면 화면을 아무도 믿지 않게 됩니다.
 */
'use client';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Chip, Column, PageHeader, Panel, Segmented, StatCard, Table } from '@/components/ui';
import { useBoard } from '@/api/queries';
import type { BoardRow, CheckMark } from '@/api/types';

const MARK_LABEL: Record<string, string> = { book: '교재', guide: '안내', zoom: '줌', report: '리포트' };
type Span = 'today' | 'week';

/** KST 기준 오늘. 화면 시각은 전부 KST 고정입니다 (D-R12). */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function plusDays(d: string, n: number): string {
  return new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

function Marks({ marks }: { marks: CheckMark[] }) {
  return (
    <div className="flex gap-1">
      {marks.map((m) => (
        <span
          key={m.key}
          title={m.note ?? MARK_LABEL[m.key]}
          className={
            m.na ? 'rounded border border-line px-1.5 py-0.5 text-[10px] text-line-2'
              : m.done ? 'rounded border border-green bg-green-weak px-1.5 py-0.5 text-[10px] font-bold text-green'
              : 'rounded border border-red bg-red-weak px-1.5 py-0.5 text-[10px] font-bold text-red'
          }
        >
          {MARK_LABEL[m.key] ?? m.key}
        </span>
      ))}
    </div>
  );
}

export default function BoardPage() {
  const [span, setSpan] = useState<Span>('today');
  const range = useMemo(() => {
    const t = todayKst();
    return span === 'today' ? { from: t, to: t } : { from: t, to: plusDays(t, 6) };
  }, [span]);

  const q = useBoard(range);
  const d = q.data;
  const [onlyMissing, setOnlyMissing] = useState(false);

  const rows = (d?.rows ?? []).filter((r) => !onlyMissing || (!r.canceled && r.missing > 0));

  const cols: Array<Column<BoardRow>> = [
    { key: 'd', head: '날짜', width: 100, cell: (r) => r.onDate },
    { key: 't', head: '시각', width: 110, cell: (r) => `${r.startAt}–${r.endAt}` },
    {
      key: 'k', head: '수업', cell: (r) => (
        <div>
          <span className={r.canceled ? 'font-bold line-through text-fg-subtle' : 'font-bold'}>
            {r.kindName ?? r.kindKey}
          </span>
          <span className="ml-2 text-fg-subtle">{r.studentNames.join(' · ') || '학생 없음'}</span>
        </div>
      ),
    },
    { key: 'te', head: '선생님', width: 90, cell: (r) => r.teacherName ?? '—' },
    {
      key: 'rm', head: '장소', width: 100,
      cell: (r) => (r.mode === 'online' ? <Chip tone="info">온라인</Chip> : (r.roomName ?? '—')),
    },
    { key: 'm', head: '교재 · 안내 · 줌 · 리포트', width: 220, cell: (r) => <Marks marks={r.marks} /> },
    {
      key: 'x', head: '', width: 70, align: 'right',
      cell: (r) => (r.canceled ? <Chip>취소</Chip> : r.missing > 0 ? <Chip tone="danger">{r.missing}</Chip> : <Chip tone="success">완료</Chip>),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="수업 현황판"
          sub="§34 — 교재 · 안내 · 줌 · 리포트를 매번 다시 판정합니다"
          right={
            <Segmented
              options={[{ value: 'today', label: '오늘' }, { value: 'week', label: '이번 주' }]}
              value={span}
              onChange={setSpan}
            />
          }
        />

        <Banner tone="info">
          이 화면은 <b>아무것도 저장하지 않습니다</b> (D-R4). 마크는 요청할 때마다 원장에서 다시 셉니다 —
          저장해 두면 원장이 바뀌었는데 마크만 그대로인 상태가 반드시 생깁니다.
          {d?.computedAt ? <span className="ml-1 text-fg-subtle">({new Date(d.computedAt).toLocaleTimeString('ko-KR')} 기준)</span> : null}
        </Banner>

        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="수업" value={d?.rows.length ?? '—'} note={span === 'today' ? '오늘' : '이번 주'} />
          <StatCard label="덜 된 수업" value={d?.missingCount ?? '—'} tone={d?.missingCount ? 'danger' : 'success'} />
          <StatCard label="취소·휴강" value={(d?.rows ?? []).filter((r) => r.canceled).length} />
          <StatCard label="온라인" value={(d?.rows ?? []).filter((r) => r.mode === 'online').length} tone="info" />
        </div>

        <Panel
          title="수업별 확인"
          sub="마크에 마우스를 올리면 왜 그렇게 판정했는지 보입니다"
          right={
            <button type="button" onClick={() => setOnlyMissing((v) => !v)}>
              <Chip tone={onlyMissing ? 'danger' : 'neutral'} styleKind={onlyMissing ? 'solid' : 'soft'}>
                덜 된 것만
              </Chip>
            </button>
          }
        >
          <Table
            columns={cols}
            rows={rows}
            rowKey={(r) => r.occId}
            empty={q.isLoading ? '불러오는 중…' : onlyMissing ? '덜 된 수업이 없습니다' : '수업이 없습니다'}
          />
        </Panel>
      </AppShell>
    </RequireAuth>
  );
}
