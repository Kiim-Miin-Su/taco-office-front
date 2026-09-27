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
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, Column, PageHeader, Panel, QueryState, StatCard, TabCards, Table } from '@/components/ui';
import { ConsultingStageBoard } from '@/components/consulting/ConsultingStageBoard';
import { ConsultingStageFilters } from '@/components/consulting/ConsultingStageFilters';
import { useConsulting, useConsAccounting, useConsStudents, useCreateConsulting, useMeta } from '@/api/queries';
import { apiMessage } from '@/api/client';
import { ConsultingAccounting } from '@/components/consulting/ConsultingAccounting';
import { ConsultingContractWorkflow } from '@/components/consulting/ConsultingContractWorkflow';
import { ConsultingStartForm } from '@/components/consulting/ConsultingStartForm';
import { WideDialog } from '@/components/ui/WideDialog';
import { ConsultingStudents } from '@/components/consulting/ConsultingStudents';
import type { Consulting } from '@/api/types';
import {
  CONSULTING_CONTRACT_STEPS,
  CONSULTING_SHARES,
  CONSULTING_STAGE_BY_KEY,
  consultingContractStep,
  consultingStageView,
  type ConsultingStageFilterValue,
} from '@/lib/consulting';
import { MASKED, won } from '@/lib/money';
import { positiveQueryId } from '@/lib/url-state';
import { useCan } from '@/store/useSession';

/**
 * 원문 §26~§28 탭 머리 넷 — 「단계 보드 · 학생별 · 이력 · 회계」.
 *
 * 「이력」은 새 질의가 아니다. 이미 받은 `items` 를 **끝난 것만** 거르는 화면 선택이고,
 * 그 선례는 C5-a 의 단계 필터다 — `all` 이 DB/API stage 가 아니었던 것과 같은 자리.
 */
type View = 'board' | 'students' | 'history' | 'money';

export default function ConsultingPage() {
  const q = useConsulting();
  const canMoney = useCan('canMoney');
  const d = q.data;
  const [view, setView] = useState<View>('board');
  /** §28 회계는 canMoney capability가 있을 때만 탭과 요청을 함께 연다. */
  const money = useConsAccounting(canMoney);
  // §27 은 그 탭을 열 때만 부른다. 탭 머리의 「N명」은 목록 응답이 같은 셈으로 준다(studentCount · 26-03) — 열기 전에도 선다
  const students = useConsStudents(view === 'students');
  const studentCount = students.data?.items.length ?? d?.studentCount;
  // 알림 「수납 · 진행 가능」 · 「회차 기록 요청」이 그 건을 `?id=` 로 연다 (W11 · N-65). 형식만 본다 —
  // 열 수 있는 건인지는 아래 목록의 canOpen(서버 판정)이 정하고, 없거나 잠긴 건이면 조용히 보드만 보인다
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<number | null>(() => positiveQueryId(searchParams.get('id')));
  const [startOpen, setStartOpen] = useState(false);
  const meta = useMeta(startOpen);
  const create = useCreateConsulting();
  const [stage, setStage] = useState<ConsultingStageFilterValue>('all');
  const stageView = consultingStageView(q.isError ? [] : d?.items ?? [], stage);
  /** 「이력」 — 끝난 것만. 같은 응답을 거를 뿐 질의를 늘리지 않는다 (C5-a 선례) */
  const done = (q.isError ? [] : d?.items ?? []).filter((c) => c.stage === 'done');

  // 학생별에서 「열기」도 그 자리에서 연다 — 이력 탭으로 옮겨 가면 닫은 뒤 진행 중인 건이 끝난 것만 있는 탭에 남는다 (27-07)
  const detailView = view === 'board' || view === 'history' || view === 'students';
  const openSummary = q.isError || !detailView ? null : d?.items.find((c) => c.id === openId && c.canOpen) ?? null;
  const open = q.isError || !detailView
    ? null
    : openSummary?.id ?? (create.data?.id === openId ? create.data.id : null);

  const cols: Array<Column<Consulting>> = [
    // 종류 이름은 서버 낱말이다 — 화면이 종류 표를 들지 않는다 (29-02 · D-R18)
    { key: 't', head: '종류', width: 80, cell: (r) => <Chip tone="purple">{r.typeLabel}</Chip> },
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
      cell: (r) => (r.canOpen ? `회차 ${r.sessionsDone}${r.sessions ? ` / 약정 ${r.sessions}회` : ''} · 기록 ${r.sessionsLog.length}건` : '잠김'),
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
        {/* 탭 카드 넷은 제목과 **같은 줄** 오른쪽이다 — 공용 PageHeader 가운데 자리(26-01) */}
        <PageHeader
          title="컨설팅"
          sub="계약서 · 회차 진행 · 종료 안내를 한 곳에서 봅니다"
          right={<Button variant="primary" onClick={() => { create.reset(); setStartOpen(true); }}>+ 컨설팅 시작</Button>}
          center={(
            <TabCards
              label="컨설팅 보기" value={view} onChange={setView}
              options={[
                // 동그라미는 **열린 건**(계약 + 진행)이다 — 원본 §26 「2」 = 계약 1 + 진행 1 (26-04)
                { value: 'board', label: '단계 보드', sub: `${stageView.counts.all}건`, badge: stageView.counts.contract + stageView.counts.running },
                // 학생 수는 서버가 센 값이다(§27 질의 · 없으면 목록의 studentCount — 같은 셈) — 이름을 모아 세지 않는다 (D-R37 · 26-03)
                { value: 'students', label: '학생별', sub: studentCount != null ? `${studentCount}명` : undefined },
                { value: 'history', label: '이력', sub: `${stageView.counts.done}건 끝남` },
                // 「남음」도 서버가 뺀 값이다. 아직 없으면 자리를 비운다
                ...(canMoney ? [{ value: 'money' as const, label: '회계', sub: money.data ? `${won(money.data.totalDue)} 남음` : undefined }] : []),
              ]}
            />
          )}
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
                // 「열기」는 그 건의 상세(계약 · 진행 · 종료)를 학생별 위에 연다 (§31 · 27-07)
                onOpen={(consId) => setOpenId(consId)}
              />
            )
        ) : view === 'board' ? (
          <>
            <ConsultingStageFilters value={stage} counts={stageView.counts} onChange={(next) => { setStage(next); setOpenId(null); }} />
            <ConsultingStageBoard
              items={stageView.items}
              stages={d?.stages ?? []}
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

        {startOpen ? (
          // 시작 창은 원본 §29 대로 좁은 가운데 창(약 800px)이다 — 창 틀은 공용 WideDialog (29-01)
          <WideDialog open width={800} onClose={() => setStartOpen(false)} title="컨설팅 시작" sub="계약서부터 만듭니다">
            <QueryState query={meta}>{(data) => (
              <ConsultingStartForm
                meta={data}
                canSetPrivate={d?.canSetPrivate ?? false}
                shareWords={d?.shares}
                // 종류 10 · 요청자 둘 — 서버 낱말 그대로(29-02)
                typeWords={d?.types}
                requesterWords={d?.requesters}
                pending={create.isPending}
                error={create.error}
                onCancel={() => setStartOpen(false)}
                onSubmit={(body) => create.mutate(body, { onSuccess: (detail) => { setStartOpen(false); setOpenId(detail.id); } })}
              />
            )}</QueryState>
          </WideDialog>
        ) : null}

        {open !== null ? (
          <ConsultingContractWorkflow
            consId={open}
            summary={openSummary ?? undefined}
            onClose={() => { setOpenId(null); create.reset(); }}
            onOpenAccounting={() => { setOpenId(null); create.reset(); setView('money'); }}
          />
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}
