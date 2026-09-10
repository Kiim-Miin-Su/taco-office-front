/** @file-guide
 * 목적: page.tsx — ConsultingPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 탭 04 컨설팅 — §26 단계 보드 · §27 목록 · §31 회차 기록(5W1H).
 * 금액은 canMoney, 내용은 공개 범위를 따릅니다 — 서버가 마스킹합니다.
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Chip, Column, PageHeader, Panel, StatCard, Table, Tabs } from '@/components/ui';
import { ConsultingStageBoard } from '@/components/consulting/ConsultingStageBoard';
import { ConsultingStageFilters } from '@/components/consulting/ConsultingStageFilters';
import { useConsulting } from '@/api/queries';
import { apiMessage } from '@/api/client';
import type { Consulting } from '@/api/types';
import {
  CONSULTING_CONTRACT_STEPS,
  CONSULTING_SHARES,
  CONSULTING_STAGE_BY_KEY,
  consultingContractStep,
  consultingTypeLabel,
  consultingStageView,
  type ConsultingStageFilterValue,
} from '@/lib/consulting';
import { MASKED, won } from '@/lib/money';
type View = 'board' | 'list';

export default function ConsultingPage() {
  const q = useConsulting();
  const d = q.data;
  const [view, setView] = useState<View>('board');
  const [openId, setOpenId] = useState<number | null>(null);
  const [stage, setStage] = useState<ConsultingStageFilterValue>('all');
  const stageView = consultingStageView(q.isError ? [] : d?.items ?? [], stage);

  const open = q.isError ? null : d?.items.find((c) => c.id === openId && c.canOpen) ?? null;

  const cols: Array<Column<Consulting>> = [
    { key: 't', head: '종류', width: 80, cell: (r) => <Chip tone="purple">{consultingTypeLabel(r.consType)}</Chip> },
    { key: 's', head: '학생', cell: (r) => <span className="font-bold">{r.studentNames.join(' · ') || '—'}</span> },
    {
      key: 'st', head: '단계', width: 90,
      cell: (r) => {
        const s = CONSULTING_STAGE_BY_KEY[r.stage] ?? { label: r.stage, tone: 'neutral' as const };
        return <Chip tone={s.tone}>{s.label}</Chip>;
      },
    },
    {
      key: 'cs', head: '계약 단계', width: 140,
      cell: (r) => {
        const n = consultingContractStep(r.contractStep);
        return n > 0
          ? <span><b>{n}</b>/5 {CONSULTING_CONTRACT_STEPS[n - 1] ?? ''}</span>
          : <span className="text-fg-subtle">—</span>;
      },
    },
    {
      key: 'sh', head: '공개 범위', width: 110,
      cell: (r) => {
        const sh = CONSULTING_SHARES[r.share] ?? { label: r.share, tone: 'neutral' as const };
        return <Chip tone={sh.tone}>{sh.label}</Chip>;
      },
    },
    {
      key: 'n', head: '회차', width: 80, align: 'right',
      // 내용이 안 열리는 건은 기록이 아예 안 내려온다 — 0/N 을 「기록 없음」으로 오해하지 않게 자물쇠를 보인다
      cell: (r) => (r.canOpen ? (r.sessions ? `${r.sessionsLog.length}/${r.sessions}` : `${r.sessionsLog.length}`) : '잠김'),
    },
    { key: 'o', head: '담당', width: 90, cell: (r) => r.ownerName ?? '—' },
    {
      key: 'a', head: '금액', width: 120, align: 'right',
      cell: (r) => (r.amount === null || r.amount === undefined
        ? <span className="text-[11px] text-fg-subtle">{MASKED}</span>
        : won(r.amount)),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="컨설팅"
          sub="계약 → 진행 → 종료. 계약 단계는 5칸, 진행 단계는 완료 회차로 표시합니다."
        />

        <Tabs className="mb-3" value={view} onChange={setView} options={[
          { value: 'board', label: '단계 보드' },
          { value: 'list', label: '목록' },
        ]} />

        {q.isError ? (
          <Banner tone="danger">{apiMessage(q.error)}</Banner>
        ) : view === 'board' ? (
          <>
            <ConsultingStageFilters value={stage} counts={stageView.counts} onChange={(next) => { setStage(next); setOpenId(null); }} />
            <ConsultingStageBoard
              items={stageView.items}
              loading={q.isLoading}
              onOpen={(item) => setOpenId(item.id)}
            />
          </>
        ) : (
          <>
            <Banner tone="info">
              역할 권한과 건별 <b>공개 범위</b>를 모두 통과해야 보입니다. 열람할 수 없는 건은 목록에서도 제외됩니다.
            </Banner>
            {d && !d.canSeeAmounts ? (
              <Banner tone="neutral" className="mt-2">금액은 대표만 볼 수 있으며 서버가 빈 값으로 내려줍니다.</Banner>
            ) : null}
            <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="전체" value={d?.items.length ?? '—'} note="건" />
              <StatCard label="진행 중" value={stageView.counts.running} tone={CONSULTING_STAGE_BY_KEY.running.tone} />
              <StatCard label="계약 중" value={stageView.counts.contract} tone={CONSULTING_STAGE_BY_KEY.contract.tone} />
              <StatCard label="비공개" value={(d?.items ?? []).filter((c) => c.share === 'private' || c.share === 'picked').length} tone="danger" note="공개 범위 제한" />
            </div>
            <Panel title="컨설팅 건">
              <Table
                columns={cols}
                rows={d?.items ?? []}
                rowKey={(r) => r.id}
                onRowClick={(r) => setOpenId(r.canOpen && openId !== r.id ? r.id : null)}
                empty={q.isLoading ? '불러오는 중…' : '컨설팅 건이 없습니다'}
              />
            </Panel>
          </>
        )}

        {open ? (
          <Panel
            className="mt-4"
            title={`회차 기록 — ${open.studentNames.join(' · ') || '학생 미지정'}`}
            sub="누가 · 무엇을 · 왜 · 어떻게 (§31)"
            right={<button type="button" className="text-[12px] text-fg-subtle" onClick={() => setOpenId(null)}>닫기</button>}
          >
            {open.sessionsLog.length === 0 ? (
              <p className="p-4 text-[12px] text-fg-subtle">아직 기록된 회차가 없습니다.</p>
            ) : (
              <ol className="divide-y divide-line">
                {open.sessionsLog.map((s) => (
                  <li key={s.id} className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Chip tone="info">{s.seq}회차</Chip>
                      <span className="text-[12px] text-fg-subtle">{s.onDate ?? '날짜 미정'}</span>
                    </div>
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {([['누가', s.who], ['무엇을', s.what], ['왜', s.why], ['어떻게', s.how]] as const).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-[11px] font-bold text-fg-subtle">{k}</dt>
                          <dd className="text-[12px]">{v ?? '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}
