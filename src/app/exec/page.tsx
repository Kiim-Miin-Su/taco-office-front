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
import { Banner, Button, Chip, Input, PageHeader, Panel, StatCard, TabCards, type Tone } from '@/components/ui';
import { ExecAreaCard, execWon } from '@/components/exec/ExecAreaCard';
import { useExec, useExecReportWrite } from '@/api/queries';
import { apiMessage } from '@/api/client';
import { useCan } from '@/store/useSession';
import type { Exec, ExecInbox, ExecMemoWrite } from '@/api/types';
import { MASKED } from '@/lib/money';
import { addDays, longDateLabel, mondayOf, monthBounds, todayKst } from '@/lib/calendar';
import { queryEnum, queryIsoDate } from '@/lib/url-state';

/** 원문 §69~§73 의 네 뷰. 결재함은 기간이 없다 — 목록이다 */
type View = 'day' | 'week' | 'month' | 'inbox';

const TYPE: Record<string, string> = { day: '일일', week: '주간', month: '월간' };
/** RPT 의 낱말이다 — 수업 리포트(REP)의 rep_state_t 와 다르다 */
/** 비어서 못 올리는 까닭 — 서버 `RPT_EMPTY`(exec.service) 문장의 앞 절 그대로 (D-R14) */
const EMPTY_REPORT_HINT = '한 줄이라도 적어야 올릴 수 있습니다';

const STATE: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  draft: { label: '작성 중', tone: 'neutral' },
  sent: { label: '제출', tone: 'info' },
  wait: { label: '승인 대기', tone: 'info' },
  ok: { label: '승인', tone: 'success' },
  rej: { label: '반려', tone: 'danger' },
};

/**
 * 결재함 묶음 — **RPT 상태별**이다(73-2). 묶음 머리는 §69 상태 띠와 **같은 낱말**을 쓴다 —
 * 「작성 중」 칩 + 「N건」 + 「아직 올리지 않았습니다」. 차례는 §75 와 같다 — 되돌아온 것이 먼저다.
 * 작성 중(draft)과 올린 것(sent)을 한 묶음으로 두면 「아직 안 올린 것」과 「대표를 기다리는 것」이 섞인다.
 */
const INBOX_ORDER = ['rej', 'draft', 'sent', 'ok'] as const;

/** 상태 한 줄 — 도구 줄 상태 띠와 결재함 묶음 머리가 같은 문장을 쓴다 */
const STATE_NOTE: Record<string, string> = {
  draft: '아직 올리지 않았습니다',
  sent: '대표 결재를 기다립니다',
  rej: '되돌아왔습니다 — 고쳐서 다시 올려주세요',
  ok: '결재가 끝났습니다',
};

/** 결재함 줄의 종류 칩 색 — **종류**가 정한다(원본 §73: 일일 갈색 · 주간 보라 · 73-3). 상태는 묶음 머리가 말한다 */
const TYPE_TONE: Record<string, Tone> = { day: 'neutral', week: 'purple', month: 'info' };

/**
 * 머리 지표 넷의 빛깔 — **표시 전용**이다(원본 §69~§71 컷의 색 글자). 칸과 값은 서버가 정한다(69-6).
 * 이익·적자처럼 값에 따라 바뀌는 것만 값을 본다.
 */
function headTone(key: string, value: number | null | undefined): Tone {
  if (key === 'profit') return (value ?? 0) >= 0 ? 'success' : 'danger';
  if (key === 'revenue') return 'success';
  if (key === 'unpaid' || key === 'complaints' || key === 'expense') return 'danger';
  if (key === 'waiting' || key === 'leads' || key === 'payout') return 'warning';
  if (key === 'posts') return 'purple';
  if (key === 'prep') return 'info';
  return 'neutral';
}

/** 머리 지표 값 — 금액은 원화, 분모가 있으면 「6/49」, 아니면 「N건」. null 은 권한이 없을 때만 「가려짐」이다(69-14) */
function headValue(h: Exec['head'][number], canSeeAmounts: boolean): string {
  if (h.value === null || h.value === undefined) return canSeeAmounts ? '—' : MASKED;
  if (h.money) return execWon(h.value);
  if (h.total !== null && h.total !== undefined) return `${h.value}/${h.total}`;
  return `${h.value}${h.unit ?? ''}`;
}

/**
 * 뷰마다 그 기간 한 줄 — 도구 줄과 탭 카드가 같은 함수를 쓴다(두 곳이 따로 지으면 갈린다).
 *
 * 날짜는 **결재함 줄과 같은 모양**이다 — 「26년 9월 23일 수요일」 (69-4). 결재함 줄의 낱말은 서버
 * (`ExecService.periodLabel`)가 짓고, 화면 쪽 긴 날짜는 `lib/calendar` 의 `longDateLabel` 한 벌을 쓴다.
 * 한동안 이 화면이 제 식으로 「9월 25일 금요일」을 지어 **한 화면 안에서 날짜가 두 모양**이었다. 주·달은 원래 같았다.
 */
function periodOf(view: Exclude<View, 'inbox'>, anchor: string): string {
  if (view === 'week') {
    const mon = mondayOf(anchor);
    return `${mon.slice(5)} ~ ${addDays(mon, 6).slice(5)}`;
  }
  if (view === 'month') return `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`;
  return longDateLabel(anchor);
}

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

  /* ── §69 쓰기 — 여섯 칸과 서명 (C85-a) ─────────────────────────── */
  const canWrite = useCan('canCrudAll');
  const write = useExecReportWrite();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [writeError, setWriteError] = useState<string | null>(null);

  /** 이 기간의 보고 — 서버가 준 것만 본다. 없으면 아직 아무도 안 적었다 */
  const report = (d?.reports ?? []).find((r) => r.rptType === view) ?? null;
  /** 초안(화면)이 서버 값을 덮는다. 다른 기간으로 옮기면 초안을 버린다 */
  const memoOf = (key: string) =>
    draft[key] ?? report?.memos.find((m) => m.key === key)?.memo ?? '';
  const dirty = Object.keys(draft).length > 0;
  /* 아직 고칠 수 있는 보고인가 — **서버 판정**이다 (S5 · D-R39). 보고가 아직 없으면 새로 적는 중이라 열려 있다 */
  const writable = report === null || report.canWriteMemo;
  const filledNow = (d?.areas ?? []).filter((a) => memoOf(a.key).trim() !== '').length;
  /** 올릴 수 있는 사람·보고인데 **비어서만** 막힌 때 — 다른 잠금은 서버의 writeBlockedReason 이 따로 말한다 */
  const emptyBlocked = canWrite && writable && filledNow === 0;
  const stateNote = STATE_NOTE[report?.state ?? 'draft'] ?? '';

  // 기간·뷰가 바뀌면 남의 기간 초안을 들고 가지 않는다
  useEffect(() => { setDraft({}); setReason(''); setWriteError(null); }, [view, range.from, range.to]);

  const run = (w: Parameters<typeof write.mutate>[0]) => {
    setWriteError(null);
    write.mutate(w, {
      onSuccess: () => { setDraft({}); setReason(''); },
      onError: (e) => setWriteError(apiMessage(e)),
    });
  };
  /** 영역 키는 서버가 준 것을 그대로 돌려보낸다 — 화면이 목록을 만들지 않는다 (D-R18) */
  const memoBody = (): ExecMemoWrite => ({
    rptType: (view === 'inbox' ? 'day' : view) as ExecMemoWrite['rptType'],
    onDate: range.from,
    memos: (d?.areas ?? []).map((a) => ({
      key: a.key as ExecMemoWrite['memos'][number]['key'],
      memo: memoOf(a.key),
    })),
  });
  const save = () => run({ kind: 'memo', body: memoBody() });
  /** 올리기는 **적은 것을 먼저 저장하고** 올린다 — 화면의 초안이 서버에 없으면 「빈 보고」로 막힌다 */
  const submit = () => {
    setWriteError(null);
    write.mutate({ kind: 'memo', body: memoBody() }, {
      onSuccess: () => run({ kind: 'submit', body: { rptType: memoBody().rptType, onDate: range.from } }),
      onError: (e) => setWriteError(apiMessage(e)),
    });
  };
  const review = (action: 'ok' | 'rej') => {
    if (!report) return;
    run({ kind: 'review', id: report.id, body: { action, ...(action === 'rej' ? { reason } : {}) } });
  };

  /**
   * 도구 줄·시트 머리의 기간 낱말은 **서버가 짓는다**(`periodLabel` · 69-4) — 결재함 줄과 같은 함수다.
   * 응답이 오기 전에는 비워 둔다 — 화면이 제 식으로 지어 두 모양이 섞이지 않게.
   */
  const periodLabel = d?.periodLabel ?? '';
  const canSeeAmounts = d?.canSeeAmounts ?? false;

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
            /* 원본 §69 의 뷰 탭 넷 — **네 장 모두** 아래 한 줄에 그 기간을 적는다 (69-3).
               손으로 만든 단추 넷 대신 공용 상자 탭(`TabCards`)을 쓴다 — §26·§64 가 쓰는 그 탭이다. */
            <TabCards
              label="보고 보기"
              value={view}
              onChange={setView}
              options={[
                { value: 'day', label: TYPE.day, sub: periodOf('day', anchor) },
                { value: 'week', label: TYPE.week, sub: periodOf('week', anchor) },
                { value: 'month', label: TYPE.month, sub: periodOf('month', anchor) },
                { value: 'inbox', label: '결재함', sub: `${inbox.length}건` },
              ]}
            />
          }
        />

        {view === 'inbox' ? (
          <>
            {/* 결재함은 **이동만** 한다 — 줄을 누르면 그 기간의 보고로 갈 뿐 승인·반려는 각 화면에서 한다(N-12 · 원칙 22).
                원문에는 이 규칙을 말하는 띠가 없다(73-1) — 규칙은 여기 주석과 서버에 있다. */}
            {INBOX_ORDER.map((state) => {
              const rows = inbox.filter((r) => r.state === state);
              if (rows.length === 0) return null;
              const s = STATE[state];
              return (
                <Panel
                  key={state}
                  className="mt-4"
                  title={(
                    <span className="flex items-center gap-2">
                      <Chip tone={s.tone}>{s.label}</Chip>
                      <span>{rows.length}건</span>
                      <span className="text-[12px] font-normal text-fg-subtle">{STATE_NOTE[state]}</span>
                    </span>
                  )}
                >
                  <ol className="flex flex-col gap-1.5">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => goTo(r)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                            r.apState === 'back' ? 'border-red/40 bg-red/5' : 'border-line bg-card'
                          } hover:border-primary/50`}
                        >
                          <Chip size="compact" tone={TYPE_TONE[r.rptType] ?? 'neutral'}>{TYPE[r.rptType] ?? r.rptType}</Chip>
                          <span className="min-w-0 grow truncate text-[13px] font-bold text-fg">{r.label}</span>
                          <span className="shrink-0 text-[11.5px] text-fg-subtle">{r.filled}/6 적음</span>
                          {/* 원본 §73 오른쪽의 빨강 숫자 — 그 기간의 살펴볼 것 (73-3) */}
                          {r.reviewCount > 0 ? (
                            <Chip size="compact" tone="danger" styleKind="solid" title={`살펴볼 것 ${r.reviewCount}`}>
                              <span className="sr-only">살펴볼 것 </span>{r.reviewCount}
                            </Chip>
                          ) : null}
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
            {/*
              도구 줄은 **문서가 아니다** — 인쇄하면 빠진다 (C100 · P-160).
              원본 §69: 왼쪽에 날짜 이동기 한 덩어리 「‹ 26년 8월 21일 금요일 › 　오늘」 + 상태 띠,
              오른쪽 끝에 「인쇄」와 강조 단추 「대표께 올리기」(69-2 · 69-5).
            */}
            <div data-print="chrome" className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-line bg-card px-1.5 py-1">
                <button type="button" aria-label="이전 기간" className="rounded-md px-2 py-1 text-[13px] text-fg-2 hover:bg-inset"
                  onClick={() => setAnchor(addDays(range.from, -1))}>‹</button>
                <span className="min-w-[10rem] px-2 text-center text-[14px] font-bold text-fg">{periodLabel}</span>
                <button type="button" aria-label="다음 기간" className="rounded-md px-2 py-1 text-[13px] text-fg-2 hover:bg-inset"
                  onClick={() => setAnchor(addDays(range.to, 1))}>›</button>
                <Button size="sm" variant="ghost" onClick={() => setAnchor(todayKst())}>오늘</Button>
              </div>
              {/* 원본 §69 의 상태 띠 — 「작성 중 · 아직 올리지 않았습니다」 */}
              <Chip tone={STATE[report?.state ?? 'draft']?.tone ?? 'neutral'}>
                {STATE[report?.state ?? 'draft']?.label ?? '작성 중'}
              </Chip>
              <span className="text-[12px] text-fg-subtle">{stateNote}</span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {/* 아직 고칠 수 있는 보고인지는 **서버가** 말한다 (S5 · D-R39) — 막힌 이유를 단추 옆에 적는다 */}
                {report && !report.canWriteMemo && report.writeBlockedReason ? (
                  <span className="text-[12px] text-fg-subtle">{report.writeBlockedReason}</span>
                ) : null}
                {/* 「작성 중 저장」은 원문에 없다 — 자동 저장이 정해지기 전까지 둔다 */}
                <Button size="sm" disabled={!canWrite || !writable || write.isPending || !dirty}
                  onClick={() => save()}>작성 중 저장</Button>
                <Button size="sm" onClick={() => window.print()}>인쇄</Button>
                {/* 판정은 그대로다 — 서버의 canWriteMemo 와 한 줄이라도 적었는가(D-R14). 자리만 원문대로 도구 줄로.
                    비어서 잠겼으면 **왜 잠겼는지**를 단추 옆과 title 에 적는다 — 단추를 도구 줄로 옮길 때 안내가 빠져
                    눌리지 않는 이유가 화면 어디에도 없었다(웹 e2e K-103 · 2026-09-25). 문장은 서버 RPT_EMPTY 의 앞 절과 같다. */}
                {emptyBlocked ? <span className="text-[12px] text-fg-subtle">{EMPTY_REPORT_HINT}</span> : null}
                <Button size="sm" variant="primary" disabled={!canWrite || !writable || write.isPending || filledNow === 0}
                  title={emptyBlocked ? EMPTY_REPORT_HINT : undefined}
                  onClick={() => submit()}>대표께 올리기</Button>
              </span>
            </div>

            {/*
              보고서 시트 — 원본 §69~§71 은 이 한 장이 곧 보고다(인쇄물의 첫 줄이 제목이 된다 · 69-1).
              제목·기간 낱말·머리 지표·카드의 문장은 전부 서버가 준다 — 화면은 칸을 만들지 않는다 (D-R18).
            */}
            <section aria-labelledby="exec-sheet-title" className="mt-3 rounded-xl border border-line bg-card p-4">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-fg pb-2.5">
                <h2 id="exec-sheet-title" className="text-[18px] font-bold text-fg">{d?.sheetTitle ?? ''}</h2>
                <span className="text-[13px] text-fg-2">{periodLabel}</span>
                <span className="ml-auto flex items-center gap-2">
                  {/* 「살펴볼 것」은 6영역 배지의 합이다 — 서버가 센 수 그대로 */}
                  <Chip tone={(d?.reviewCount ?? 0) > 0 ? 'danger' : 'neutral'} styleKind={(d?.reviewCount ?? 0) > 0 ? 'solid' : 'soft'}>
                    살펴볼 것 {d?.reviewCount ?? 0}
                  </Chip>
                  <span className="text-[12px] font-bold text-fg-2">담당 {filledNow}/6 기재</span>
                </span>
              </header>

              {/* 머리 지표 넷 — **기간마다 원문 칸이 다르다**(일일 돈·결재·컴플레인 · 주간 입금·문의·게시·준비 · 월간 돈 넷).
                  칸과 값은 서버(`head`)가 정한다 — 강사료·이익은 달 전체일 때만 서버가 준다(69-15). */}
              <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {(d?.head ?? []).map((h) => (
                  <StatCard
                    key={h.key}
                    label={h.label}
                    value={headValue(h, canSeeAmounts)}
                    note={h.note ?? undefined}
                    tone={h.value === null || h.value === undefined ? 'neutral' : headTone(h.key, h.value)}
                  />
                ))}
              </div>

              {/*
                §71 월간 두 판 — **월간에만** 선다(일간·주간 컷에는 없다). 세울지 말지도 서버가 정한다 —
                기간이 달력 한 달 전체가 아니면 `monthly` 가 null 이다. 원본처럼 머리 바로 아래 한 줄에 나란히 (71-4).
              */}
              {d?.monthly ? (
                <div className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-[2fr_1fr]">
                  <Panel className="!p-3" title={<>상담 퍼널 <span className="ml-1 text-[11px] font-normal text-fg-subtle">유입에서 등록까지</span></>}>
                    <ol className="flex flex-col gap-1.5" aria-label="상담 퍼널">
                      {d.monthly.funnel.map((r) => (
                        <li key={r.key} className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-[12px] font-bold text-fg">{r.label}</span>
                          {/* 막대는 유입 대비 — 첫 줄이 100% 다. 비율도 서버가 낸 값이다 (D-R37) */}
                          <span aria-hidden className="h-2 grow overflow-hidden rounded-full bg-inset">
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${r.pct}%` }} />
                          </span>
                          <b className="w-8 shrink-0 text-right text-[13px] text-fg">{r.count}</b>
                          {/* 유입 줄은 수만 — 원본 §71 (자기 자신 대비 100% 는 말할 것이 없다) */}
                          <span className="w-10 shrink-0 text-right text-[11px] text-fg-subtle">{r.key === 'inflow' ? '' : `${r.pct}%`}</span>
                        </li>
                      ))}
                    </ol>
                    {/* 옛 건은 도달 기록이 없다(보정 0) — **언제부터의 값인지** 한 줄로 남긴다 */}
                    <p className="mt-2 text-[10.5px] text-fg-subtle">
                      {d.monthly.funnelSince
                        ? `도달 기록은 ${d.monthly.funnelSince} 부터 — 그 전 건은 지금 단계로만 셉니다`
                        : '도달 기록이 아직 없습니다 — 지금 단계로만 셉니다'}
                    </p>
                  </Panel>
                  <Panel className="!p-3" title={<>어디서 놓쳤나 <span className="ml-1 text-[11px] font-normal text-fg-subtle">등록 실패 {d.monthly.lost}건</span></>}>
                    {d.monthly.lostRows.length === 0 ? (
                      <p className="px-1 py-2 text-[12px] text-fg-subtle">이번 달 들어온 문의 중 놓친 건이 없습니다</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {/* 줄들의 합이 머리의 수와 같다 (N-19) — 원본처럼 이름과 빨강 숫자만 (71-6) */}
                        {d.monthly.lostRows.map((r) => (
                          <li key={r.key} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-1.5">
                            <span className="text-[12px] text-fg">{r.label}</span>
                            <b className="ml-auto text-[13px] text-red">{r.count}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                </div>
              ) : null}

              {/*
                영역 카드 여섯 — 원본은 숫자와 「숫자만으로는 모를 것」이 **한 카드**다 (69-7).
                칸 목록·순서·낱말은 서버가 준 것 그대로다 (D-R18 · D-R25) — 화면이 표를 들면
                「담당 x/6 기재」의 x 와 실제 칸이 갈린다.
              */}
              <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {(d?.areas ?? []).map((a) => (
                  <ExecAreaCard
                    key={a.key}
                    area={a}
                    memo={memoOf(a.key)}
                    memoDisabled={!canWrite || !writable}
                    onMemoChange={(next) => setDraft((prev) => ({ ...prev, [a.key]: next }))}
                    onGo={() => router.push(a.go)}
                    onOpenItem={(go) => router.push(go)}
                  />
                ))}
              </div>

              {report?.state === 'rej' && report.rejectReason ? (
                <p className="mt-3 text-[12px] text-red">반려 — {report.rejectReason}</p>
              ) : null}

              {/* §73 결재 — 단추가 열리는지는 **서버가 정한다** — 권한·상태에 더해 「내가 올린 보고인가」까지
                  같은 줄에서 판정한다. 화면이 조합하면 올린 사람에게 열린 채 눌렀을 때만 거절당한다 (D-R39 · S1) */}
              {report?.canReview ? (
                <div data-print="chrome" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber/40 bg-amber/5 p-3">
                  <span className="text-[12px] font-bold text-fg">올라온 보고입니다 — 결재해 주세요</span>
                  <Input
                    className="min-w-40 grow"
                    aria-label="반려 사유"
                    placeholder="반려하려면 사유를 적어 주세요"
                    value={reason}
                    onChange={(e) => setReason(e.currentTarget.value)}
                  />
                  <Button size="sm" disabled={write.isPending || reason.trim() === ''}
                    onClick={() => review('rej')}>반려</Button>
                  <Button size="sm" variant="primary" disabled={write.isPending}
                    onClick={() => review('ok')}>승인</Button>
                </div>
              ) : null}

              {/* 원본 §69 아래 두 칸 — 시각만 있는 서명은 서명이 아니라 사람 이름을 적는다 */}
              <div className="mt-3 grid grid-cols-1 rounded-lg border border-line sm:grid-cols-2">
                <p className="px-3 py-3 text-center text-[12px] text-fg-2 sm:border-r sm:border-line">
                  올린 사람 <b className="ml-1 text-fg">{report?.sentByName ?? '—'}</b>
                </p>
                <p className="px-3 py-3 text-center text-[12px] text-fg-2">
                  대표 승인 <b className="ml-1 text-fg">{report?.reviewedByName ?? '—'}</b>
                </p>
              </div>

              {writeError ? <Banner tone="danger" className="mt-3">{writeError}</Banner> : null}
              {q.isLoading ? <p className="mt-3 text-[12px] text-fg-subtle">불러오는 중…</p> : null}
            </section>
          </>
        )}
      </AppShell>
    </RequireAuth>
  );
}
