/**
 * 탭 11 대표 보고 — §69.
 *
 * 현황판과 같은 규칙입니다 — **집계는 저장하지 않습니다** (D-R4).
 * 보고서 본문만 원장에 남고 숫자는 매번 다시 셉니다.
 * 금액 칸은 대표가 아니면 서버가 아예 빈 값으로 내려줍니다 (D-R39).
 */
'use client';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Chip, Column, PageHeader, Panel, Segmented, StatCard, Table } from '@/components/ui';
import { useExec } from '@/api/queries';
import type { ExecReport } from '@/api/types';

type Span = 'week' | 'month';

const TYPE: Record<string, string> = { day: '일일', week: '주간', month: '월간' };
/** rep_state_t 를 그대로 쓴다 — 서버가 내려주는 낱말과 화면의 낱말이 달라지면 색이 어긋난다. */
const STATE: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  draft: { label: '작성 중', tone: 'neutral' },
  sent: { label: '제출', tone: 'info' },
  wait: { label: '승인 대기', tone: 'info' },
  ok: { label: '승인', tone: 'success' },
  rej: { label: '반려', tone: 'danger' },
};

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function plusDays(d: string, n: number): string {
  return new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

export default function ExecPage() {
  const [span, setSpan] = useState<Span>('month');
  const range = useMemo(() => {
    const t = todayKst();
    return span === 'week' ? { from: plusDays(t, -6), to: t } : { from: `${t.slice(0, 7)}-01`, to: t };
  }, [span]);

  const q = useExec(range);
  const d = q.data;

  const cols: Array<Column<ExecReport>> = [
    { key: 't', head: '종류', width: 80, cell: (r) => <Chip tone="info">{TYPE[r.rptType] ?? r.rptType}</Chip> },
    { key: 'd', head: '날짜', width: 110, cell: (r) => r.onDate },
    { key: 'm', head: '내용', cell: (r) => <span className="text-fg-subtle">{r.memo || '—'}</span> },
    {
      key: 's', head: '상태', width: 90,
      cell: (r) => {
        const s = STATE[r.state] ?? { label: r.state, tone: 'neutral' as const };
        return <Chip tone={s.tone}>{s.label}</Chip>;
      },
    },
    {
      key: 'rr', head: '반려 사유', width: 180,
      // D-R13 — 반려하면 사유가 반드시 있습니다. 없으면 그 사실이 보여야 합니다.
      cell: (r) =>
        r.state === 'rej'
          ? <span className="text-red">{r.rejectReason ?? '사유 없음 — 확인 필요'}</span>
          : <span className="text-fg-subtle">—</span>,
    },
  ];

  const money = (d?.stats ?? []).filter((s) => s.money);
  const counts = (d?.stats ?? []).filter((s) => !s.money);

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="대표 보고"
          sub={`§69 — ${range.from} ~ ${range.to}`}
          right={
            <Segmented
              options={[{ value: 'week', label: '최근 7일' }, { value: 'month', label: '이번 달' }]}
              value={span}
              onChange={setSpan}
            />
          }
        />

        <Banner tone="info">
          숫자는 <b>저장하지 않습니다</b> (D-R4). 이 화면을 열 때마다 원장에서 다시 셉니다.
          {d?.computedAt ? <span className="ml-1 text-fg-subtle">({new Date(d.computedAt).toLocaleTimeString('ko-KR')} 기준)</span> : null}
        </Banner>

        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {counts.map((s) => (
            <StatCard
              key={s.key}
              label={s.label}
              value={s.value ?? '—'}
              note={s.unit ?? undefined}
              tone={s.key === 'unwritten' && (s.value ?? 0) > 0 ? 'danger' : 'neutral'}
            />
          ))}
        </div>

        <Panel
          title="돈"
          sub={d?.canSeeAmounts ? '수입 · 지출 · 이익' : '대표만 볼 수 있습니다 (D-R39)'}
        >
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            {money.map((s) => (
              <StatCard
                key={s.key}
                label={s.label}
                value={
                  s.value === null || s.value === undefined
                    ? <span className="text-[14px] text-fg-subtle">가려짐</span>
                    : `${s.value.toLocaleString('ko-KR')}원`
                }
                tone={s.key === 'profit' ? ((s.value ?? 0) >= 0 ? 'success' : 'danger') : s.key === 'expense' ? 'warning' : 'info'}
              />
            ))}
          </div>
        </Panel>

        <Panel className="mt-4" title="제출된 보고" sub="D-R14 — 한 줄이라도 적어야 제출됩니다">
          <Table
            columns={cols}
            rows={d?.reports ?? []}
            rowKey={(r) => r.id}
            empty={q.isLoading ? '불러오는 중…' : '이 기간에 제출된 보고가 없습니다'}
          />
        </Panel>
      </AppShell>
    </RequireAuth>
  );
}
