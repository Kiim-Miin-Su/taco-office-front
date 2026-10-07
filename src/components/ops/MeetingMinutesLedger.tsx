/** @file-guide
 * 목적: 관리자 수정사항 p120의 회의 속기록 작성 대상과 월별 이력을 한 화면에 연결한다.
 * 책임/재사용: MeetingDto만 표시하고 실제 읽기·쓰기는 기존 MeetingDetail에 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useState } from 'react';
import type { Meeting } from '@/api/types';
import { addDays, hhmm, longDateLabel, step, summaryBoundsOf, todayKst } from '@/lib/calendar';
import { Banner, Button, Chip } from '@/components/ui';
import type { ChipTone } from '@/components/ui';

const TONE: Record<string, ChipTone> = {
  plan: 'purple', consulting: 'teal', marketing: 'danger', dev: 'info', general: 'orange',
};

/**
 * BO-Q13 (2026-10-07 사용자가 권고안을 채택해 확정): 사전 안건은 minutes에 섞지 않는 별도 versioned agenda다.
 * 관리자·매니저가 회의 시작 전까지 쓰고 참석자는 읽으며, 속기록에는 명시적 「안건 가져오기」로만 복사한다.
 * 생성 계약의 agenda·expectedVersion·잠금·actor/audit를 표시하되, 실제 endpoint 전에는 가짜 저장을 만들지 않는다.
 * 정책을 바꿀 때는 docs/decisions/PLANNING-REQUIRED.md의 BO-Q13과 이 경계를 함께 수정한다.
 */
export type MeetingLedgerView = 'agenda' | 'minutes';

export function MeetingMinutesLedger({ meetings, onOpen }: { meetings: Meeting[]; onOpen: (id: number, view: MeetingLedgerView) => void }) {
  const [anchor, setAnchor] = useState(todayKst);
  const today = todayKst();
  const writeRows = meetings
    .filter((m) => !m.hasMinutes && m.onDate && m.onDate >= addDays(today, -7) && m.onDate <= addDays(today, 7))
    .sort((a, b) => (a.onDate ?? '').localeCompare(b.onDate ?? ''));
  const month = summaryBoundsOf('month', anchor);
  const historyRows = meetings
    .filter((m) => m.hasMinutes && m.onDate && m.onDate >= month.from && m.onDate <= month.to)
    .sort((a, b) => (b.onDate ?? '').localeCompare(a.onDate ?? ''));

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="minutes-write-title">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="minutes-write-title" className="text-[15px] font-bold text-fg">속기록을 쓸 회의</h2>
          <span className="text-[12px] text-fg-subtle">지난 7일 ~ 앞으로 7일 · 속기록 없는 회의</span>
        </div>
        {writeRows.length === 0 ? <Banner tone="neutral">이 기간에 작성할 속기록이 없습니다.</Banner> : (
          <ul className="flex flex-col gap-2">
            {writeRows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
                <Chip size="compact" styleKind="solid" tone={TONE[m.mtType] ?? 'neutral'}>{m.mtTypeShort}</Chip>
                <div className="min-w-44 flex-1">
                  <b className="block text-[13px] text-fg">{m.title ?? m.mtTypeLabel}</b>
                  <span className="text-[12px] text-fg-subtle">{m.onDate ? longDateLabel(m.onDate) : '날짜 없음'}{m.startMin == null || m.endMin == null ? '' : ` · ${hhmm(m.startMin)}–${hhmm(m.endMin)}`}</span>
                  {m.agenda ? <span className="mt-1 block text-[12px] text-fg-2">안건 · {m.agenda.preview} · {m.agenda.updatedByName}</span> : null}
                </div>
                <Button size="sm" variant="secondary" onClick={() => onOpen(m.id, 'agenda')}
                  aria-label={`${m.title ?? m.mtTypeLabel} ${m.agenda ? '안건 보기' : '미리 안건 쓰기'}`}>{m.agenda ? '안건 보기' : '미리 안건 쓰기'}</Button>
                <Button size="sm" onClick={() => onOpen(m.id, 'minutes')} aria-label={`${m.title ?? m.mtTypeLabel} 속기록 쓰기`}>속기록 쓰기</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="minutes-history-title">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 id="minutes-history-title" className="text-[15px] font-bold text-fg">월별 속기록 이력</h2>
          <div className="ml-auto flex items-center rounded-lg border border-line bg-card px-1">
            <Button size="sm" variant="ghost" aria-label="이전 달" onClick={() => setAnchor((v) => step('month', v, -1))}>‹</Button>
            <b className="min-w-24 text-center text-[12px] text-fg">{Number(anchor.slice(0, 4))}년 {Number(anchor.slice(5, 7))}월</b>
            <Button size="sm" variant="ghost" aria-label="다음 달" onClick={() => setAnchor((v) => step('month', v, 1))}>›</Button>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(todayKst())}>이번 달</Button>
          </div>
        </div>
        {historyRows.some((m) => !m.minutesSummary) ? (
          <Banner tone="neutral" className="mb-2">요약이 없는 이전 기록은 회의 상세에서 확인합니다.</Banner>
        ) : null}
        {historyRows.length === 0 ? <Banner tone="neutral">이 달에 저장한 속기록이 없습니다.</Banner> : (
          <ul className="flex flex-col gap-2">
            {historyRows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
                <Chip size="compact" styleKind="solid" tone={TONE[m.mtType] ?? 'neutral'}>{m.mtTypeShort}</Chip>
                <div className="min-w-44 flex-1">
                  <b className="block text-[13px] text-fg">{m.title ?? m.mtTypeLabel}</b>
                  <span className="text-[12px] text-fg-subtle">{m.onDate ? longDateLabel(m.onDate) : '날짜 없음'} · 참석 {m.confirmed}/{m.attendees}</span>
                  {m.minutesSummary ? (
                    <>
                      <span className="mt-1 block text-[12px] text-fg-2">{m.minutesSummary.preview}</span>
                      <span className="block text-[12px] text-fg-subtle">{m.minutesSummary.writtenByName} · 결정 {m.minutesSummary.decisionCount} · 할 일 {m.minutesSummary.taskDone}/{m.minutesSummary.taskCount}</span>
                    </>
                  ) : null}
                </div>
                <Button size="sm" variant="secondary" onClick={() => onOpen(m.id, 'minutes')} aria-label={`${m.title ?? m.mtTypeLabel} 열기`}>열기</Button>
                <Button size="sm" onClick={() => onOpen(m.id, 'minutes')} aria-label={`${m.title ?? m.mtTypeLabel} 고치기`}>고치기</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
