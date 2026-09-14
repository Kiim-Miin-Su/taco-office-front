/** @file-guide
 * 목적: page.tsx — ExecPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 탭 11 대표 보고 — §69 일일 · §70 주간 · §71 월간 · **§73 결재함**.
 *
 * 현황판과 같은 규칙입니다 — **집계는 저장하지 않습니다** (D-R4).
 * 보고서 본문만 원장에 남고 숫자는 매번 다시 셉니다.
 *
 * 결재함은 **이동만 합니다** (N-12 채택 원문 그대로 · D-R27 · 원칙 22).
 * 줄을 누르면 그 기간의 보고로 갈 뿐, 여기서 승인·반려하지 않습니다 — 그것은 각 화면에서 합니다.
 *
 * 「살펴볼 것」은 6영역 배지의 합이고, 그 판정은 서버 한 곳(lib/exec-areas)에 있습니다.
 * 금액 칸은 대표가 아니면 서버가 아예 빈 값으로 내려줍니다 (D-R39).
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Chip, Column, PageHeader, Panel, StatCard, Table } from '@/components/ui';
import { useExec } from '@/api/queries';
import type { ExecInbox, ExecReport } from '@/api/types';
import { won } from '@/lib/money';
import { addDays, mondayOf, monthBounds, todayKst } from '@/lib/calendar';
import { queryEnum, queryIsoDate } from '@/lib/url-state';

/** 원문 §69~§73 의 네 뷰. 결재함은 기간이 없다 — 목록이다 */
type View = 'day' | 'week' | 'month' | 'inbox';

const TYPE: Record<string, string> = { day: '일일', week: '주간', month: '월간' };
/** RPT 의 낱말이다 — 수업 리포트(REP)의 rep_state_t 와 다르다 */
const STATE: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  draft: { label: '작성 중', tone: 'neutral' },
  sent: { label: '제출', tone: 'info' },
  wait: { label: '승인 대기', tone: 'info' },
  ok: { label: '승인', tone: 'success' },
  rej: { label: '반려', tone: 'danger' },
};

/** 결재함 묶음 — 되돌아온 것 → 기다리는 것 → 끝난 것 (§75 순서 · apFlow 낱말) */
const GROUPS: Array<{ key: string; title: string; sub: string; tone: 'danger' | 'neutral' | 'success' }> = [
  { key: 'back', title: '되돌아온 것', sub: '고쳐서 다시 올려주세요', tone: 'danger' },
  { key: 'waiting', title: '작성 중 · 올린 것', sub: '아직 올리지 않았거나 대표 검토를 기다립니다', tone: 'neutral' },
  { key: 'done', title: '승인된 것', sub: '끝났습니다', tone: 'success' },
];

const KO_DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = KO_DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 ${dow}요일`;
};

export default function ExecPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryView = queryEnum(searchParams.get('view'), ['day', 'week', 'month'] as const) ?? 'day';
  const queryDate = queryIsoDate(searchParams.get('date')) ?? todayKst();
  const [view, setView] = useState<View>(queryView);
  const [anchor, setAnchor] = useState<string>(queryDate);

  // §75 deep link와 브라우저 앞/뒤 이동은 같은 화면 상태를 복원한다. rpt는 서버 identity라 여기서 다시 찾지 않는다.
  useEffect(() => {
    setView(queryView);
    setAnchor(queryDate);
  }, [queryDate, queryView]);

  /** 뷰가 기간을 정한다 — 결재함은 목록이라 기간이 필요 없고, 서버 계산을 아끼려 그날로 둔다 */
  const range = useMemo(() => {
    if (view === 'week') {
      const mon = mondayOf(anchor);
      return { from: mon, to: addDays(mon, 6) };
    }
    if (view === 'month') return monthBounds(anchor);
    return { from: anchor, to: anchor };
  }, [view, anchor]);

  const q = useExec(range);
  const d = q.data;
  const inbox = d?.inbox ?? [];

  const periodLabel =
    view === 'week' ? `${range.from.slice(5)} ~ ${range.to.slice(5)}`
      : view === 'month' ? `${range.from.slice(0, 4)}년 ${Number(range.from.slice(5, 7))}월`
        : dayLabel(anchor);

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

  /** 결재함 줄 → 그 기간의 보고로 **이동만** 한다 (N-12) */
  const goTo = (row: ExecInbox) => {
    setAnchor(row.onDate);
    setView(row.rptType as View);
  };

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="대표 보고"
          sub="회계 · 마케팅 · 운영 · 컨설팅 · 컴플레인 · 수업을 한 장으로 올리고 결재받습니다"
          right={
            <div className="flex flex-wrap gap-1.5">
              {(['day', 'week', 'month', 'inbox'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-lg border px-3 py-1.5 text-left transition-colors ${
                    view === v ? 'border-fg bg-fg text-card' : 'border-line bg-card text-fg hover:border-primary/50'
                  }`}
                >
                  <span className="block text-[12.5px] font-bold">
                    {v === 'inbox' ? '결재함' : TYPE[v]}
                  </span>
                  <span className={`block text-[11px] ${view === v ? 'opacity-80' : 'text-fg-subtle'}`}>
                    {v === 'inbox' ? `${inbox.length}건` : v === view ? periodLabel : ''}
                  </span>
                </button>
              ))}
            </div>
          }
        />

        {view === 'inbox' ? (
          <>
            <Banner tone="info" className="mt-3">
              결재함은 <b>이동만</b> 합니다 (N-12). 줄을 누르면 그 기간의 보고로 갈 뿐, 여기서 승인·반려하지 않습니다 — 그것은 각 화면에서
              합니다.
            </Banner>
            {GROUPS.map((g) => {
              const rows = inbox.filter((r) => r.apState === g.key);
              if (rows.length === 0) return null;
              return (
                <Panel key={g.key} className="mt-4" title={`${g.title} · ${rows.length}건`} sub={g.sub}>
                  <ol className="flex flex-col gap-1.5">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => goTo(r)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                            g.tone === 'danger' ? 'border-red/40 bg-red/5' : 'border-line bg-card'
                          } hover:border-primary/50`}
                        >
                          <Chip size="compact" tone={STATE[r.state]?.tone ?? 'neutral'}>{TYPE[r.rptType] ?? r.rptType}</Chip>
                          <span className="min-w-0 grow truncate text-[13px] font-bold text-fg">{r.label}</span>
                          <span className="shrink-0 text-[11.5px] text-fg-subtle">{r.filled}/6 적음</span>
                          <Chip size="compact" tone={r.reviewCount > 0 ? 'warning' : 'neutral'}>살펴볼 것 {r.reviewCount}</Chip>
                          {r.state === 'rej' && r.rejectReason ? (
                            <span className="max-w-[220px] shrink-0 truncate text-[11.5px] text-red">{r.rejectReason}</span>
                          ) : null}
                          <span aria-hidden className="shrink-0 text-fg-subtle">›</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </Panel>
              );
            })}
            {inbox.length === 0 ? (
              <Panel className="mt-4" title="결재함"><p className="px-1 py-6 text-center text-[13px] text-fg-subtle">올라온 보고가 없습니다.</p></Panel>
            ) : null}
          </>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button size="sm" onClick={() => setAnchor(addDays(range.from, -1))}>‹ 이전</Button>
              <Button size="sm" onClick={() => setAnchor(todayKst())}>오늘</Button>
              <Button size="sm" onClick={() => setAnchor(addDays(range.to, 1))}>다음 ›</Button>
              <span className="ml-1 text-[13px] font-bold text-fg">{periodLabel}</span>
              <span className="ml-auto flex items-center gap-2">
                <Chip tone={(d?.reviewCount ?? 0) > 0 ? 'warning' : 'neutral'}>살펴볼 것 {d?.reviewCount ?? 0}</Chip>
                <span className="text-[12px] text-fg-subtle">담당 {d?.filled ?? 0}/6 기재</span>
              </span>
            </div>

            <Banner tone="info" className="mt-3">
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

            <Panel title="살펴볼 것" sub="대표 관심순 — 회계 → 마케팅 → 운영 → 컨설팅 → 컴플레인 → 수업 (D-R25). 누르면 그 화면으로 갑니다">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(d?.areas ?? []).map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => router.push(a.go)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-primary/50 ${
                      a.count > 0 ? 'border-amber/50 bg-amber/5' : 'border-line bg-card'
                    }`}
                  >
                    <span className="text-[13px] font-bold text-fg">{a.label}</span>
                    <Chip size="compact" tone={a.count > 0 ? 'warning' : 'success'}>{a.count > 0 ? a.count : '✓'}</Chip>
                    <span className="min-w-0 grow truncate text-[11.5px] text-fg-subtle">{a.review}</span>
                    <span aria-hidden className="shrink-0 text-fg-subtle">›</span>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel
              className="mt-4"
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
                        : won(s.value)
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
          </>
        )}
      </AppShell>
    </RequireAuth>
  );
}
