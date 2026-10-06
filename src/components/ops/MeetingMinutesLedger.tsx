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

export function MeetingMinutesLedger({ meetings, onOpen }: { meetings: Meeting[]; onOpen: (id: number) => void }) {
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
          <span className="text-[11px] text-fg-subtle">지난 7일 ~ 앞으로 7일 · 속기록 없는 회의</span>
        </div>
        {writeRows.length === 0 ? <Banner tone="neutral">이 기간에 작성할 속기록이 없습니다.</Banner> : (
          <ul className="flex flex-col gap-2">
            {writeRows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
                <Chip size="compact" styleKind="solid" tone={TONE[m.mtType] ?? 'neutral'}>{m.mtTypeShort}</Chip>
                <div className="min-w-44 flex-1">
                  <b className="block text-[13px] text-fg">{m.title ?? m.mtTypeLabel}</b>
                  <span className="text-[11.5px] text-fg-subtle">{m.onDate ? longDateLabel(m.onDate) : '날짜 없음'}{m.startMin == null || m.endMin == null ? '' : ` · ${hhmm(m.startMin)}–${hhmm(m.endMin)}`}</span>
                </div>
                <Button size="sm" variant="secondary" disabled title="사전 안건 쓰기 계약은 DTO·Backend 단계에서 연결합니다"
                  aria-label={`${m.title ?? m.mtTypeLabel} 미리 안건 쓰기`}>미리 안건 쓰기</Button>
                <Button size="sm" onClick={() => onOpen(m.id)} aria-label={`${m.title ?? m.mtTypeLabel} 속기록 쓰기`}>속기록 쓰기</Button>
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
        <Banner tone="neutral" className="mb-2">작성자 · 본문 전문 · 결정 · 할 일 요약은 목록 계약 반영 전까지 회의 상세에서 확인합니다.</Banner>
        {historyRows.length === 0 ? <Banner tone="neutral">이 달에 저장한 속기록이 없습니다.</Banner> : (
          <ul className="flex flex-col gap-2">
            {historyRows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
                <Chip size="compact" styleKind="solid" tone={TONE[m.mtType] ?? 'neutral'}>{m.mtTypeShort}</Chip>
                <div className="min-w-44 flex-1">
                  <b className="block text-[13px] text-fg">{m.title ?? m.mtTypeLabel}</b>
                  <span className="text-[11.5px] text-fg-subtle">{m.onDate ? longDateLabel(m.onDate) : '날짜 없음'} · 참석 {m.confirmed}/{m.attendees}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onOpen(m.id)} aria-label={`${m.title ?? m.mtTypeLabel} 열기`}>열기</Button>
                <Button size="sm" onClick={() => onOpen(m.id)} aria-label={`${m.title ?? m.mtTypeLabel} 고치기`}>고치기</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
