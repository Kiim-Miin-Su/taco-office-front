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
// 「오늘」과 날짜 더하기는 lib/calendar.ts 가 갖는다 — 화면마다 KST 를 다시 적지 않는다 (D-R12)
import { addDays as plusDays, todayKst } from '@/lib/calendar';

const MARK_LABEL: Record<string, string> = { book: '교재', guide: '안내', zoom: '줌', report: '리포트' };
type Span = 'today' | 'week';


/**
 * 4마크 — 교재 · 안내 · 줌 · 리포트 (§34 · D-R4).
 *
 * `Chip` 을 쓴다. 손으로 그렸다가 **없는 색 이름**(`bg-green-weak` · `bg-red-weak`)을 적어
 * 칠이 통째로 빠져 있었다 — 「됨」과 「안 됨」이 가는 테두리 하나로만 갈렸다.
 * 한눈에 보라고 있는 화면인데 그 한눈이 안 됐다. 있는 컴포넌트를 쓰면 이런 일이 안 생긴다.
 */
function Marks({ marks }: { marks: CheckMark[] }) {
  return (
    <div className="flex gap-1">
      {marks.map((m) => (
        <Chip
          key={m.key}
          tone={m.na ? 'neutral' : m.done ? 'success' : 'danger'}
          styleKind={m.na ? 'outline' : 'soft'}
          className={m.na ? 'opacity-60' : undefined}
          title={m.note ?? MARK_LABEL[m.key]}
        >
          {MARK_LABEL[m.key] ?? m.key}
        </Chip>
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
