/**
 * 탭 06 교재 — §36.
 * 강사도 봅니다. 자기 수업에 무엇을 쓰는지 알아야 하니 권한을 걸지 않았습니다.
 */
'use client';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Chip, Column, PageHeader, Panel, StatCard, Table } from '@/components/ui';
import { useBooks } from '@/api/queries';
import type { Book } from '@/api/types';

const SE_TE: Record<string, { label: string; tone: 'info' | 'purple' }> = {
  SE: { label: '학생용', tone: 'info' },
  TE: { label: '교사용', tone: 'purple' },
};

export default function BooksPage() {
  const q = useBooks();
  const d = q.data;
  const [sub, setSub] = useState<string | null>(null);

  const rows = useMemo(
    () => (d?.items ?? []).filter((b) => sub === null || (b.subName ?? '미분류') === sub),
    [d, sub],
  );

  const cols: Array<Column<Book>> = [
    { key: 'code', head: '코드', width: 130, cell: (r) => <span className="font-bold">{r.code}</span> },
    { key: 'title', head: '교재명', cell: (r) => r.title },
    { key: 'sub', head: '과목', width: 140, cell: (r) => <Chip>{r.subName ?? '미분류'}</Chip> },
    { key: 'lv', head: '레벨', width: 90, cell: (r) => r.level ?? '—' },
    { key: 'gr', head: '학년', width: 80, cell: (r) => r.grade ?? '—' },
    { key: 'pg', head: '쪽수', width: 80, align: 'right', cell: (r) => (r.pages ? `${r.pages}쪽` : '—') },
    {
      key: 'se', head: '구분', width: 90,
      cell: (r) => {
        const t = r.seTe ? SE_TE[r.seTe] : undefined;
        return t ? <Chip tone={t.tone}>{t.label}</Chip> : <span className="text-fg-subtle">—</span>;
      },
    },
  ];

  const subs = Object.entries(d?.bySub ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader title="교재" sub="§36 — 코드 · 과목 · 쪽수 · 학생용/교사용" />

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="전체" value={d?.items.length ?? '—'} note="권" />
          <StatCard label="과목 수" value={subs.length || '—'} tone="info" />
          <StatCard label="학생용" value={(d?.items ?? []).filter((b) => b.seTe === 'SE').length} tone="info" note="SE" />
          <StatCard label="교사용" value={(d?.items ?? []).filter((b) => b.seTe === 'TE').length} tone="purple" note="TE" />
        </div>

        <Panel
          title="교재 목록"
          sub={sub ? `${sub} 만 보는 중` : '과목 칩을 눌러 좁힐 수 있습니다'}
          right={
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => setSub(null)}>
                <Chip tone={sub === null ? 'info' : 'neutral'} styleKind={sub === null ? 'solid' : 'soft'}>전체</Chip>
              </button>
              {subs.map(([name, n]) => (
                <button key={name} type="button" onClick={() => setSub(name)}>
                  <Chip tone={sub === name ? 'info' : 'neutral'} styleKind={sub === name ? 'solid' : 'soft'}>
                    {name} {n}
                  </Chip>
                </button>
              ))}
            </div>
          }
        >
          <Table
            columns={cols}
            rows={rows}
            rowKey={(r) => r.id}
            empty={q.isLoading ? '불러오는 중…' : '교재가 없습니다'}
          />
        </Panel>
      </AppShell>
    </RequireAuth>
  );
}
