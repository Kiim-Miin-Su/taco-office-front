/**
 * 탭 04 컨설팅 — §29 건 목록 · §30 회차 기록(5W1H).
 * 금액과 배분율은 대표만 봅니다 (D-R39) — 서버가 null 로 내려줍니다.
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Chip, Column, PageHeader, Panel, StatCard, Table } from '@/components/ui';
import { useConsulting } from '@/api/queries';
import type { Consulting } from '@/api/types';
import { MASKED, won } from '@/lib/money';

/** 서버가 내려주는 낱말 그대로 — 화면이 제 낱말을 만들면 새 값이 들어올 때 원문이 그대로 뜬다. */
const TYPE: Record<string, string> = { admissions: '입시', essay: '에세이', roadmap: '로드맵' };
const STAGE: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' }> = {
  contract: { label: '계약', tone: 'info' },
  running: { label: '진행', tone: 'success' },
  done: { label: '종료', tone: 'neutral' },
};
/** 공개 범위 4단계 — 역할 권한과 **독립된 두 번째 층** (DEV-SPEC §4.4) */
const SHARE: Record<string, { label: string; tone: 'neutral' | 'info' | 'warning' | 'danger' }> = {
  all: { label: '전체 공개', tone: 'neutral' },
  money_only: { label: '수납만 공개', tone: 'info' },
  picked: { label: '지정 공개', tone: 'warning' },
  private: { label: '전체 비공개', tone: 'danger' },
};
/** 계약 5단계 — 계약서 → 피드백 → 학부모 전달 → 서명본 → 수납 */
const CONTRACT_STEPS = ['계약서', '피드백', '학부모 전달', '서명본', '수납'];


export default function ConsultingPage() {
  const q = useConsulting();
  const d = q.data;
  const [openId, setOpenId] = useState<number | null>(null);

  const open = d?.items.find((c) => c.id === openId) ?? null;

  const cols: Array<Column<Consulting>> = [
    { key: 't', head: '종류', width: 80, cell: (r) => <Chip tone="purple">{TYPE[r.consType] ?? r.consType}</Chip> },
    { key: 's', head: '학생', cell: (r) => <span className="font-bold">{r.studentNames.join(' · ') || '—'}</span> },
    {
      key: 'st', head: '단계', width: 90,
      cell: (r) => {
        const s = STAGE[r.stage] ?? { label: r.stage, tone: 'neutral' as const };
        return <Chip tone={s.tone}>{s.label}</Chip>;
      },
    },
    {
      key: 'cs', head: '계약 단계', width: 140,
      cell: (r) => {
        const n = r.contractStep ?? 0;
        return n > 0
          ? <span><b>{n}</b>/5 {CONTRACT_STEPS[n - 1] ?? ''}</span>
          : <span className="text-fg-subtle">—</span>;
      },
    },
    {
      key: 'sh', head: '공개 범위', width: 110,
      cell: (r) => {
        const sh = SHARE[r.share] ?? { label: r.share, tone: 'neutral' as const };
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
          sub="§29 건 목록 · §30 회차 기록 — 줄을 누르면 5W1H 기록이 열립니다"
        />

        <Banner tone="info">
          권한이 <b>두 층</b>입니다 (DEV-SPEC §4.4). 역할 권한과 건별 <b>공개 범위</b>는 서로 독립이라
          둘 다 통과해야 보입니다 — 볼 수 없는 건은 화면에서 가려지는 게 아니라 <b>목록에서 빠집니다</b>.
        </Banner>
        {d && !d.canSeeAmounts ? (
          <Banner tone="neutral" className="mt-2">금액은 대표만 볼 수 있습니다 (D-R39). 서버에서 빈 값으로 내려옵니다.</Banner>
        ) : null}

        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="전체" value={d?.items.length ?? '—'} note="건" />
          <StatCard label="진행 중" value={(d?.items ?? []).filter((c) => c.stage === 'running').length} tone="success" />
          <StatCard label="계약 중" value={(d?.items ?? []).filter((c) => c.stage === 'contract').length} tone="warning" />
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

        {open ? (
          <Panel
            className="mt-4"
            title={`회차 기록 — ${open.studentNames.join(' · ') || '학생 미지정'}`}
            sub="누가 · 무엇을 · 왜 · 어떻게 (§30)"
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
                      <span className="text-[12px] text-fg-subtle">{s.onDate}</span>
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
