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
import { Banner, Button, Chip, Column, PageHeader, Panel, StatCard, TabCards, Table } from '@/components/ui';
import { ConsultingStageBoard } from '@/components/consulting/ConsultingStageBoard';
import { ConsultingStageFilters } from '@/components/consulting/ConsultingStageFilters';
import { useConsulting, useConsAccounting, useConsStudents, useToggleConsultingItem } from '@/api/queries';
import { apiMessage } from '@/api/client';
import { ConsultingProgress } from '@/components/consulting/ConsultingProgress';
import { ConsultingAccounting } from '@/components/consulting/ConsultingAccounting';
import { ConsultingStudents } from '@/components/consulting/ConsultingStudents';
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

/**
 * 원문 §26~§28 탭 머리 넷 — 「단계 보드 · 학생별 · 이력 · 회계」.
 *
 * 「이력」은 새 질의가 아니다. 이미 받은 `items` 를 **끝난 것만** 거르는 화면 선택이고,
 * 그 선례는 C5-a 의 단계 필터다 — `all` 이 DB/API stage 가 아니었던 것과 같은 자리.
 */
type View = 'board' | 'students' | 'history' | 'money';

export default function ConsultingPage() {
  const q = useConsulting();
  const toggle = useToggleConsultingItem();
  const d = q.data;
  const [view, setView] = useState<View>('board');
  /**
   * §28 은 다른 질의다. **탭을 안 열어도 부른다** — 원문 컷의 탭 머리가 어느 보기에서든
   * 「회계 · ₩1,300,000 남음」을 이미 달고 있기 때문이다. 그 한 줄이 이 질의의 값이다.
   */
  const money = useConsAccounting();
  // §27 은 그 탭을 열 때만 부른다 — 탭 머리의 「N명」도 이 질의가 센 값이라 열기 전에는 비워 둔다
  const students = useConsStudents(view === 'students');
  const [openId, setOpenId] = useState<number | null>(null);
  const [stage, setStage] = useState<ConsultingStageFilterValue>('all');
  const stageView = consultingStageView(q.isError ? [] : d?.items ?? [], stage);
  /** 「이력」 — 끝난 것만. 같은 응답을 거를 뿐 질의를 늘리지 않는다 (C5-a 선례) */
  const done = (q.isError ? [] : d?.items ?? []).filter((c) => c.stage === 'done');

  const detailView = view === 'board' || view === 'history';
  const open = q.isError || !detailView ? null : d?.items.find((c) => c.id === openId && c.canOpen) ?? null;

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
      key: 'n', head: '회차 기록', width: 110, align: 'right',
      // 기록 행 수 ≠ 완료 회차 (N-18 §4-17 — 기록과 완료를 구분). 잠긴 건은 기록이 아예 안 내려온다.
      cell: (r) => (r.canOpen ? `기록 ${r.sessionsLog.length}건${r.sessions ? ` / 약정 ${r.sessions}회` : ''}` : '잠김'),
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
          sub="계약 → 진행 → 종료. 계약 단계는 5칸, 진행은 기록 회차와 진행 항목으로 표시합니다."
        />

        <TabCards
          className="mb-3" label="컨설팅 보기" value={view} onChange={setView}
          options={[
            { value: 'board', label: '단계 보드', sub: `${stageView.counts.all}건`, badge: stageView.counts.running },
            // 학생 수는 §27 질의가 센 값이다 — 목록의 이름을 모아 세지 않는다 (D-R37)
            { value: 'students', label: '학생별', sub: students.data ? `${students.data.items.length}명` : undefined },
            { value: 'history', label: '이력', sub: `${stageView.counts.done}건 끝남` },
            // 「남음」도 서버가 뺀 값이다. 아직 없으면 자리를 비운다
            { value: 'money', label: '회계', sub: money.data ? `${won(money.data.totalDue)} 남음` : undefined },
          ]}
        />

        {q.isError ? (
          <Banner tone="danger">{apiMessage(q.error)}</Banner>
        ) : view === 'money' ? (
          money.isError
            ? <Banner tone="danger">{apiMessage(money.error)}</Banner>
            : <ConsultingAccounting data={money.data} loading={money.isLoading} />
        ) : view === 'students' ? (
          students.isError
            ? <Banner tone="danger">{apiMessage(students.error)}</Banner>
            : (
              <ConsultingStudents
                items={students.data?.items}
                loading={students.isLoading}
                // 「열기」는 그 건의 항목·회차로 간다 — 이력 탭이 그 자리다 (§31)
                onOpen={(consId) => { setView('history'); setOpenId(consId); }}
              />
            )
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
              끝난 컨설팅입니다. 역할 권한과 건별 <b>공개 범위</b>를 모두 통과해야 보이며, 열람할 수 없는 건은 목록에서도 제외됩니다.
            </Banner>
            {d && !d.canSeeAmounts ? (
              <Banner tone="neutral" className="mt-2">금액은 대표만 볼 수 있으며 서버가 빈 값으로 내려줍니다.</Banner>
            ) : null}
            <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="끝남" value={stageView.counts.done} tone={CONSULTING_STAGE_BY_KEY.done.tone} note="건" />
              <StatCard label="전체" value={d?.items.length ?? '—'} note="건" />
              <StatCard label="진행 중" value={stageView.counts.running} tone={CONSULTING_STAGE_BY_KEY.running.tone} />
              <StatCard label="계약 중" value={stageView.counts.contract} tone={CONSULTING_STAGE_BY_KEY.contract.tone} />
            </div>
            <Panel title="끝난 컨설팅">
              <Table
                columns={cols}
                rows={done}
                rowKey={(r) => r.id}
                onRowClick={(r) => setOpenId(r.canOpen && openId !== r.id ? r.id : null)}
                empty={q.isLoading ? '불러오는 중…' : '끝난 컨설팅이 없습니다'}
              />
            </Panel>
          </>
        )}

        {open ? (
          <Panel
            className="mt-4"
            title={`진행 항목 — ${open.items.filter((i) => i.done).length}/${open.items.length}`}
            sub="기록과 완료는 다릅니다 — 항목은 이 원장, 회차는 아래 기록으로 셉니다 (§31)"
          >
            {open.items.length === 0 ? (
              <p className="p-4 text-[12px] text-fg-subtle">
                이 유형의 기본 항목표는 확정 전입니다 (N-18-a) — 원문 §31 이 항목을 주는 유형은 국제학교 지원뿐입니다.
              </p>
            ) : (
              <>
                <div className="px-1 pb-3">
                  <ConsultingProgress
                    value={open.items.filter((i) => i.done).length}
                    max={open.items.length}
                    label={`진행 항목 ${open.items.filter((i) => i.done).length}/${open.items.length}`}
                  />
                </div>
                <ul className="divide-y divide-line">
                  {open.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-1 py-2">
                      <button
                        type="button"
                        aria-pressed={i.done}
                        disabled={toggle.isPending || open.stage === 'done'}
                        title={open.stage === 'done' ? '종료된 컨설팅 — 항목이 잠겨 있습니다' : i.done ? '완료 해제' : '완료 처리'}
                        onClick={() => toggle.mutate({ consId: open.id, itemId: i.id, done: !i.done })}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-bold ${i.done ? 'border-green bg-green text-card' : 'border-line bg-card text-transparent'}`}
                      >
                        ✓
                      </button>
                      <span className={`min-w-0 grow truncate text-[12.5px] ${i.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>{i.label}</span>
                      {i.required ? <Chip tone="warning">필수</Chip> : null}
                      {i.done ? (
                        <span className="shrink-0 text-[11px] text-fg-subtle">{i.doneBy ?? ''} · {i.doneOn ?? ''}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {toggle.isError ? <Banner tone="danger" className="mt-2">{apiMessage(toggle.error)}</Banner> : null}
            <div className="mt-3 border-t border-line pt-2">
              <Button size="sm" disabled title="학생별 추가·제외 규칙 확정 전 (N-18-a) — 표시만">항목 추가</Button>
            </div>
          </Panel>
        ) : null}

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
