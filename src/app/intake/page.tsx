/** @file-guide
 * 목적: page.tsx — IntakePage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §23 상담 단계 보드 · §24 등록 실패 — 중단 지점 분류 + 실패 지정/되살리기 input (N-25 · C35).
 *
 * 「그냥 실패」로 묶으면 고칠 곳을 못 찾는다. 어디서 멈췄는지를 세어 둔다.
 * 실패 전이 순간의 이전 단계는 서버가 fail_from 으로 명시 기록한다 — 화면은 추정하지 않는다.
 */
'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Board, BoardColumn, Button, Chip, Column, Label, PageHeader, Panel, Select, Table, Tabs, Textarea } from '@/components/ui';
import { useFailLead, useOps, useResumeLead } from '@/api/queries';
import { apiMessage } from '@/api/client';
import type { Lead, LeadFail, LeadResume } from '@/api/types';
import { SearchField, type SearchFieldHandle } from '@/components/ui/SearchField';
import { SearchEmpty } from '@/components/ui/SearchEmpty';
import { FAILURE_SEARCH_LABEL, filterLeadsByQuery } from '@/lib/intake-search';

/**
 * 칸의 **색만** 화면이 정한다 — 이름도 순서도 서버의 `intakeHead.funnel` 이 쥔다 (D-R18 · D-R25).
 * 여기 이름을 한 벌 더 두면 퍼널 띠와 보드가 **같은 화면에서 다른 낱말**을 쓰게 된다 (C86-b).
 */
const STAGE_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  first: 'info', wait2nd: 'warning', second: 'info', hold: 'neutral', enrolled: 'success', failed: 'danger',
};

/**
 * 중단 지점 4어휘의 **낱말과 순서는 서버가 준다**(`intakeHead.stops` · C86-b).
 * 원본 fail.from/at{} 대응은 N-25 채택(§4-17 · C35)으로 종결 — from 은 lead.fail_from(전이 순간
 * 서버 기록), at 은 stop_at 이고 레거시 건은 추정 이관 없이 미분류로 둔다.
 */
type StopKey = LeadFail['stopAt'];
type ResumeKey = NonNullable<LeadResume['to']>;
const UNCLASSIFIED = '분류 안 됨';
/** 되살릴 단계 판정 근거 라벨 — 판정 자체는 서버 응답(revivalStage/Source)만 그린다 */
const REVIVAL_SOURCE: Record<string, string> = {
  explicit: '실패 때 서버가 기록한 명시값',
  log: '도달 기록 역순 판정',
};

export default function IntakePage() {
  const [tab, setTab] = useState<'board' | 'stop'>('board');
  const [failureQuery, setFailureQuery] = useState('');
  const searchRef = useRef<SearchFieldHandle>(null);
  const q = useOps();
  const router = useRouter();
  const head = q.data?.intakeHead;
  const all = useMemo(() => q.data?.leads ?? [], [q.data]);
  /** 담당 칩 — 0 은 「담당 없음」, null 은 「전체」. 좁히는 일이라 서버에 다시 묻지 않는다 */
  const [owner, setOwner] = useState<number | null>(null);
  const leads = useMemo(
    () => (owner === null ? all : all.filter((l) => (l.ownerId ?? 0) === owner)),
    [all, owner],
  );

  // §24 실패 지정/되살리기 초안 — 서버 판정(코드) 결과만 소비하고, 성공하면 재조회로 갈아탄다.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [stopAt, setStopAt] = useState<StopKey | ''>('');
  const [reason, setReason] = useState('');
  const [resumeTo, setResumeTo] = useState<ResumeKey | ''>('');
  const [armed, setArmed] = useState<'fail' | 'resume' | null>(null);
  const fail = useFailLead();
  const resume = useResumeLead();
  const selected = leads.find((l) => l.id === selectedId) ?? null;

  const pick = (l: Lead) => {
    setSelectedId((cur) => (cur === l.id ? null : l.id));
    setStopAt(''); setReason(''); setResumeTo(''); setArmed(null);
    fail.reset(); resume.reset();
  };

  // 칸의 이름·순서는 서버의 퍼널 그대로다 — 화면은 색과 담을 것만 정한다 (D-R18 · D-R25)
  const stages = head?.funnel ?? [];
  const columns: Array<BoardColumn<Lead>> = stages.map((s) => ({
    key: s.key, label: s.label, tone: STAGE_TONE[s.key] ?? 'neutral',
    // 칸 아래 한 줄은 **다음에 무엇을 하는지**다 (원본 §23) — 문장도 서버가 쥔다
    sub: s.sub,
    items: leads.filter((l) => l.stage === s.key),
  }));
  /** 되살릴 수 있는 단계 — 깔때기 안(결과 칸이 아닌 것)만이다. 그 판정도 서버가 준 값이다 */
  const activeStages = stages.filter((s) => s.funnel);
  const stageLabel = (key: string | null | undefined) =>
    stages.find((s) => s.key === key)?.label ?? key ?? '—';
  const stopLabel = (key: string | null | undefined) =>
    (head?.stops ?? []).find((t) => t.key === key)?.label ?? UNCLASSIFIED;

  const failed = useMemo(() => leads.filter((l) => l.stage === 'failed'), [leads]);
  const matchingFailed = useMemo(() => filterLeadsByQuery(failed, failureQuery), [failed, failureQuery]);
  const showSearch = tab === 'stop' && !q.isLoading && !q.isError;

  const stopRows = useMemo(() => {
    const g = new Map<string, Lead[]>();
    for (const l of matchingFailed) {
      const k = l.stopAt ?? 'unknown';
      g.set(k, [...(g.get(k) ?? []), l]);
    }
    return [...g.entries()]
      .map(([k, v]) => ({ key: k, label: stopLabel(k), count: v.length, items: v }))
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
      <PageHeader title="상담" sub="유입 즉시 1차 카드 생성 → 2차(진단고사) → 보류 · 등록 · 등록 실패" />

      {/*
        원본 §23 의 퍼널 띠 — 「1차 상담 › 2차 대기 › 2차 상담 › 보류 ⇒ 등록 | 등록 실패」.
        화살표가 `⇒` 로 바뀌는 자리에 뜻이 있다: 앞 넷은 아직 깔때기 안이고 뒤 둘은 끝난 결과다.
        칸 이름·순서·수는 전부 **서버가 준 것**이다 — 화면은 세지 않는다 (D-R18 · D-R37).
      */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(head?.funnel ?? []).map((step, i, all) => (
          <span key={step.key} className="flex items-center gap-1.5">
            {i > 0 ? (
              <span aria-hidden className="px-0.5 text-[13px] text-line-2">
                {all[i - 1].funnel && !step.funnel ? '⇒' : step.funnel ? '›' : '|'}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5">
              <b className="text-[15px] text-fg">{step.count}</b>
              <span className="text-[12px] text-fg-subtle">{step.label}</span>
            </span>
          </span>
        ))}
        <span className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-inset px-3 py-1.5">
          <b className="text-[15px] text-fg">{head?.enrollRate ?? 0}%</b>
          <span className="text-[12px] text-fg-subtle">등록률</span>
        </span>
      </div>

      {/* 담당 칩 — 「전체」만 화면이 붙인다. 사람과 수는 서버가 센다 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] text-fg-subtle">담당</span>
        <Chip tone={owner === null ? 'info' : 'neutral'}>
          <button type="button" onClick={() => setOwner(null)}>전체 {leads.length}</button>
        </Chip>
        {(head?.owners ?? []).map((o) => (
          <Chip key={String(o.id ?? 'none')} tone={owner === (o.id ?? 0) ? 'info' : 'neutral'}>
            <button type="button" onClick={() => setOwner(o.id ?? 0)}>{o.name} {o.count}</button>
          </Chip>
        ))}
      </div>

      {/* 경고 줄 — 누르면 그 화면으로 간다 (D-R27). 문장도 서버가 만든다 (D-R18 · D-R39) */}
      {(head?.alerts ?? []).some((a) => a.count > 0) ? (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-1.5">
          {(head?.alerts ?? []).filter((a) => a.count > 0).map((a) => (
            <button key={a.key} type="button" onClick={() => router.push(a.go)}
              className="rounded-lg border border-red/35 bg-red/5 px-2.5 py-1 text-[12px] font-bold text-red transition-colors hover:border-red/60">
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

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
              <button
                type="button"
                aria-pressed={selectedId === l.id}
                onClick={() => pick(l)}
                className={`block w-full rounded text-left ${selectedId === l.id ? 'outline outline-2 outline-blue' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-bold text-fg">{l.name}</span>
                  <span className="text-[10px] text-fg-subtle">{l.ageDays}일</span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-fg-subtle">{l.school ?? '—'}</div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-fg-subtle">{l.ownerName ?? '미배정'}</span>
                  {l.stopAt ? <Chip tone="danger">{stopLabel(l.stopAt)}</Chip> : null}
                </div>
              </button>
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

      {selected ? (
        <Panel
          className="mt-4"
          title={`실패 이력 — ${selected.name}`}
          sub="이전 단계는 전이 순간에 서버가 명시값으로 기록합니다 — 화면은 추정하지 않습니다 (§24 · N-25)"
          right={<button type="button" className="text-[12px] text-fg-subtle" onClick={() => pick(selected)}>닫기</button>}
        >
          {selected.stage === 'enrolled' ? (
            <p className="p-1 text-[12.5px] text-fg-2">
              등록 완료된 건입니다 — 실패 전환은 서버가 막습니다 (ENROLLED_LOCKED).
            </p>
          ) : selected.stage === 'failed' ? (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] text-fg-2">
                중단 지점 <b>{stopLabel(selected.stopAt)}</b>
                {selected.reason ? <> · 사유 「{selected.reason}」</> : null}
              </p>
              {selected.revivalStage ? (
                <Banner tone="info">
                  되살리면 <b>{stageLabel(selected.revivalStage)}</b> 단계로 돌아갑니다 —
                  근거: {REVIVAL_SOURCE[selected.revivalSource ?? ''] ?? '—'}.
                </Banner>
              ) : (
                <Banner tone="warning">
                  미분류 — 실패 전 단계 이력이 없는 레거시 건입니다. 추정 이관을 하지 않으므로(N-25) 되살릴 단계를 직접 지정해야 합니다.
                </Banner>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                  <Label htmlFor="lead-resume-to">되살릴 단계{selected.revivalStage ? ' (비우면 판정값)' : ' (지정 필수)'}</Label>
                  <Select id="lead-resume-to" value={resumeTo}
                    onChange={(e) => { setResumeTo(e.target.value as ResumeKey | ''); setArmed(null); }}>
                    <option value="">{selected.revivalStage ? `판정값 — ${stageLabel(selected.revivalStage)}` : '단계 선택'}</option>
                    {activeStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant={armed === 'resume' ? 'primary' : 'secondary'}
                  disabled={resume.isPending || (!selected.revivalStage && !resumeTo)}
                  title={!selected.revivalStage && !resumeTo ? '미분류 — 단계를 지정해야 합니다' : undefined}
                  onClick={() => {
                    if (armed === 'resume') {
                      resume.mutate({ id: selected.id, ...(resumeTo ? { to: resumeTo } : {}) }, { onSettled: () => setArmed(null) });
                    } else setArmed('resume');
                  }}
                >
                  {armed === 'resume' ? '한 번 더 누르면 되살리기' : '되살리기'}
                </Button>
              </div>
              {resume.isError ? <Banner tone="danger">{apiMessage(resume.error)}</Banner> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                  <Label htmlFor="lead-stop-at">중단 지점 (필수)</Label>
                  <Select id="lead-stop-at" value={stopAt}
                    onChange={(e) => { setStopAt(e.target.value as StopKey | ''); setArmed(null); }}>
                    <option value="">지점 선택</option>
                    {(head?.stops ?? []).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </Select>
                </div>
                <div className="min-w-60 grow">
                  <Label htmlFor="lead-fail-reason" hint="비우면 기존 사유 유지">사유 (선택 · 500자)</Label>
                  <Textarea id="lead-fail-reason" rows={2} maxLength={500} className="min-h-[44px]"
                    value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={armed === 'fail' ? 'danger' : 'secondary'}
                  disabled={fail.isPending || !stopAt}
                  title={!stopAt ? '중단 지점을 먼저 고릅니다 (§24 4어휘)' : undefined}
                  onClick={() => {
                    if (armed === 'fail' && stopAt) {
                      fail.mutate(
                        { id: selected.id, stopAt, ...(reason.trim() ? { reason: reason.trim() } : {}) },
                        { onSettled: () => setArmed(null) },
                      );
                    } else setArmed('fail');
                  }}
                >
                  {armed === 'fail' ? '한 번 더 누르면 실패 확정' : '실패로 분류'}
                </Button>
                <span className="text-[11px] text-fg-subtle">
                  현재 단계 「{stageLabel(selected.stage)}」를 서버가 명시값(fail_from)으로 보존합니다.
                </span>
              </div>
              {fail.isError ? <Banner tone="danger">{apiMessage(fail.error)}</Banner> : null}
            </div>
          )}
        </Panel>
      ) : null}
    </AppShell></RequireAuth>
  );
}
