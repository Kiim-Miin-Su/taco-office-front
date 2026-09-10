/** @file-guide
 * 목적: page.tsx — IntakePage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §23 상담 단계 보드 · §24 등록 실패 — 중단 지점 분류.
 *
 * 「그냥 실패」로 묶으면 고칠 곳을 못 찾는다. 어디서 멈췄는지를 세어 둔다.
 */
'use client';
import { useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Board, BoardColumn, Chip, Column, PageHeader, Panel, StatCard, Table, Tabs } from '@/components/ui';
import { useOps } from '@/api/queries';
import type { Lead } from '@/api/types';
import { SearchField, type SearchFieldHandle } from '@/components/ui/SearchField';
import { SearchEmpty } from '@/components/ui/SearchEmpty';
import { FAILURE_SEARCH_LABEL, filterLeadsByQuery } from '@/lib/intake-search';

const STAGES: Array<{ key: string; label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = [
  { key: 'first', label: '1차 상담', tone: 'info' },
  { key: 'wait2nd', label: '2차 대기', tone: 'warning' },
  { key: 'second', label: '2차 상담', tone: 'info' },
  { key: 'hold', label: '보류', tone: 'neutral' },
  { key: 'enrolled', label: '등록', tone: 'success' },
  { key: 'failed', label: '실패', tone: 'danger' },
];

/** 기존 저장 코드. 원본 fail.from/at{}와의 이관은 N-25 확정 후 별도 청크에서 처리한다. */
const STOP: Record<string, string> = {
  before_first: '1차 상담 전 이탈',
  after_first: '1차 후 미진행',
  before_book: '상담 예약 전 이탈',
  after_second: '2차 후 미등록',
};

export default function IntakePage() {
  const [tab, setTab] = useState<'board' | 'stop'>('board');
  const [failureQuery, setFailureQuery] = useState('');
  const searchRef = useRef<SearchFieldHandle>(null);
  const q = useOps();
  const leads = useMemo(() => q.data?.leads ?? [], [q.data]);

  const columns: Array<BoardColumn<Lead>> = STAGES.map((s) => ({
    key: s.key, label: s.label, tone: s.tone,
    items: leads.filter((l) => l.stage === s.key),
  }));

  const failed = useMemo(() => leads.filter((l) => l.stage === 'failed'), [leads]);
  const matchingFailed = useMemo(() => filterLeadsByQuery(failed, failureQuery), [failed, failureQuery]);
  const showSearch = tab === 'stop' && !q.isLoading && !q.isError;
  const enrolled = leads.filter((l) => l.stage === 'enrolled');
  const rate = leads.length ? Math.round((enrolled.length / leads.length) * 100) : 0;

  const stopRows = useMemo(() => {
    const g = new Map<string, Lead[]>();
    for (const l of matchingFailed) {
      const k = l.stopAt ?? 'unknown';
      g.set(k, [...(g.get(k) ?? []), l]);
    }
    return [...g.entries()]
      .map(([k, v]) => ({ key: k, label: STOP[k] ?? '분류 안 됨', count: v.length, items: v }))
      .sort((a, b) => b.count - a.count);
  }, [matchingFailed]);

  const stopCols: Array<Column<(typeof stopRows)[number]>> = [
    { key: 'l', head: '중단 지점', width: 200, cell: (r) => <span className="font-bold">{r.label}</span> },
    { key: 'n', head: '건수', width: 80, align: 'right', cell: (r) => <Chip tone="danger">{r.count}건</Chip> },
    { key: 'p', head: '비중', width: 100, align: 'right',
      cell: (r) => `${matchingFailed.length ? Math.round((r.count / matchingFailed.length) * 100) : 0}%` },
    { key: 'r', head: '주된 사유', cell: (r) => r.items.map((i) => i.reason).filter(Boolean).join(' · ') || '—' },
  ];

  return (
    <RequireAuth><AppShell>
      <PageHeader title="상담" sub="1차 → 2차 대기 → 2차 → 보류 → 등록 / 실패. 어느 단계에서 멈췄는지가 그대로 남습니다." />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <StatCard label="전체 상담" value={leads.length} />
        <StatCard label="등록" value={enrolled.length} note={`전환 ${rate}%`} tone="success" />
        <StatCard label="실패" value={failed.length} note="중단 지점 분류됨" tone="danger" />
        <StatCard label="진행 중" value={leads.filter((l) => !['enrolled', 'failed'].includes(l.stage)).length} tone="info" />
      </div>

      <Tabs className="mb-3" value={tab} onChange={setTab}
        options={[{ value: 'board', label: '단계 보드' }, { value: 'stop', label: `중단 지점 ${failed.length}` }]} />

      {/* 탭 왕복·재조회 오류 복구 때 입력과 FQ를 함께 보존하되, 비활성 상태에는 숨긴다. */}
      <div hidden={!showSearch} className={showSearch ? 'mb-3 flex flex-wrap items-center justify-between gap-3' : 'hidden'}>
        <span id="failure-search-status" role="status" className="text-[12px] text-fg-2">
          검색 결과 {matchingFailed.length}건 / 전체 {failed.length}건
        </span>
        <div className="w-full sm:w-[360px]">
          <SearchField ref={searchRef} label={FAILURE_SEARCH_LABEL} placeholder={FAILURE_SEARCH_LABEL}
            onQueryChange={setFailureQuery} controls="failure-search-results" />
        </div>
      </div>

      {q.isLoading ? <Banner tone="neutral">불러오는 중…</Banner>
        : q.isError ? <Banner tone="danger">상담은 매니저 이상만 볼 수 있습니다.</Banner>
        : tab === 'board' ? (
          <Board
            columns={columns}
            itemKey={(l) => l.id}
            renderCard={(l) => (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-bold text-fg">{l.name}</span>
                  <span className="text-[10px] text-fg-subtle">{l.ageDays}일</span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-fg-subtle">{l.school ?? '—'}</div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-fg-subtle">{l.ownerName ?? '미배정'}</span>
                  {l.stopAt ? <Chip tone="danger">{STOP[l.stopAt] ?? l.stopAt}</Chip> : null}
                </div>
              </>
            )}
          />
        ) : (
          <>
            <div id="failure-search-results" aria-describedby="failure-search-status">
              {failureQuery.trim() && matchingFailed.length === 0
                ? <SearchEmpty onClear={() => searchRef.current?.clear()} />
                : <Table columns={stopCols} rows={stopRows} rowKey={(r) => r.key} empty="실패한 상담이 없습니다" />}
            </div>
            <Panel className="mt-4" title="왜 나눠서 세는가">
              <p className="text-[12px] leading-relaxed text-fg-2">
                「그냥 실패 4건」이면 고칠 곳을 못 찾습니다. <b>상담 예약 전 이탈</b>은 회신 속도의 문제이고,
                <b> 2차 후 미등록</b>은 가격·시간대의 문제입니다. 손대야 할 곳이 다릅니다.
              </p>
            </Panel>
          </>
        )}
    </AppShell></RequireAuth>
  );
}
