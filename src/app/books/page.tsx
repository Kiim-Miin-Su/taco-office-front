/** @file-guide
 * 목적: page.tsx — BooksPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 탭 06 교재 — §38 트래킹 보드 · §39 서가 · §40 이력 · §41 자료 요청.
 * (한동안 「§36」이라 적혀 있었다. §36 은 월별 현황판이다 — 번호 하나가 다음 사람을 딴 컷으로 보낸다.)
 *
 * 강사도 봅니다. 자기 수업에 무엇을 쓰는지 알아야 하니 권한을 걸지 않았습니다.
 */
'use client';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, Column, PageHeader, Panel, StatCard, Table, Tabs } from '@/components/ui';
import { useBooks } from '@/api/queries';
import { BookHistory, BookVersionAdder, BookVersionBadge } from '@/components/books/BookVersions';
import type { Book } from '@/api/types';

const SE_TE: Record<string, { label: string; tone: 'info' | 'purple' }> = {
  SE: { label: '학생용', tone: 'info' },
  TE: { label: '교사용', tone: 'purple' },
};

export default function BooksPage() {
  const [tab, setTab] = useState<'shelf' | 'history'>('shelf');
  const [adding, setAdding] = useState<Book | null>(null);
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
      key: 'v', head: '판', width: 170,
      // 「더 나중 판이 있다」는 서버가 판정한다 — 여기서 두 낱말을 비교하지 않는다 (D-R39)
      cell: (r) => <BookVersionBadge book={r} />,
    },
    {
      key: 'up', head: '', width: 90,
      cell: (r) => <Button size="sm" variant="secondary" onClick={() => setAdding(r)}>판 올리기</Button>,
    },
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
        <PageHeader title="교재" sub="서가 · 판 · 이력 — 코드 · 과목 · 쪽수 · 학생용/교사용" />

        {/* 원본 §39 머리의 띠 둘 — 숫자는 서버가 센다. 화면이 다시 세면 카드 배지와 갈린다 */}
        {d && d.newerCount > 0 ? (
          <Banner tone="warning" className="mb-2">
            더 최신 판이 있는 교재 <b>{d.newerCount}종</b> — 판 옆의 <b>⇧</b> 를 눌러 바꿉니다.
          </Banner>
        ) : null}
        {d && d.noFileCount > 0 ? (
          <Banner tone="danger" className="mb-2">
            파일이 없는 교재 <b>{d.noFileCount}종</b> — 강사에게 보낼 파일이 없습니다.
          </Banner>
        ) : null}

        <Tabs
          className="mb-3"
          options={[
            { value: 'shelf', label: `서가 ${d?.items.length ?? 0}` },
            { value: 'history', label: '이력' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'history' ? <BookHistory /> : null}

        {adding ? <BookVersionAdder book={adding} onClose={() => setAdding(null)} /> : null}

        <div className={`mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 ${tab === 'history' ? 'hidden' : ''}`}>
          <StatCard label="전체" value={d?.items.length ?? '—'} note="권" />
          <StatCard label="과목 수" value={subs.length || '—'} tone="info" />
          <StatCard label="학생용" value={(d?.items ?? []).filter((b) => b.seTe === 'SE').length} tone="info" note="SE" />
          <StatCard label="교사용" value={(d?.items ?? []).filter((b) => b.seTe === 'TE').length} tone="purple" note="TE" />
        </div>

        <Panel
          className={tab === 'history' ? 'hidden' : undefined}
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
