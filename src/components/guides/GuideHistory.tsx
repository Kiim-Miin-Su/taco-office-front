/** @file-guide
 * 목적: 개발명세서 v2 §45의 기간별 안내 이력과 안내 누락 자동 초안 생성을 제공한다.
 * 책임/재사용: 기간·누락·집계는 GET /guides/history 정본을 사용하고 POST /guides/drafts는 서버 투영 키만 전송한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useCreateGuideDraft, useGuideHistory } from '@/api/queries';
import type { Guide, GuideHistoryEvent, GuideHistorySpan, GuideMissing } from '@/api/types';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Panel } from '@/components/ui/Panel';
import { QueryState } from '@/components/ui/QueryState';
import { Segmented } from '@/components/ui/Segmented';
import { addDays, longDateLabel, todayKst } from '@/lib/calendar';
import { cn } from '@/components/ui/cn';
import { GUIDE_STATE_BAR, GuideReasonChip, GuideStateChip, guideLessonLabel, guideTeacherLabel } from './GuideStatus';
import { GuideWriter } from './GuideWriter';

const SPANS: Array<{ value: GuideHistorySpan; label: string }> = [
  { value: 'day', label: '일별' },
  { value: 'week', label: '주별' },
  { value: 'month', label: '월별' },
];

function shiftAnchor(anchor: string, span: GuideHistorySpan, direction: -1 | 1): string {
  if (span === 'month') {
    const date = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 + direction, 1));
    return date.toISOString().slice(0, 10);
  }
  return addDays(anchor, direction * (span === 'week' ? 7 : 1));
}

function periodLabel(span: GuideHistorySpan, anchor: string): string {
  if (span === 'month') return `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`;
  return `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월 ${Number(anchor.slice(8, 10))}일`;
}

/**
 * 안 한 것 카드 — **카드 전체가 단추**다(원문 §45 「안 한 것 클릭 → 초안 자동 생성 후 편집 창」 · g4 §45-2).
 * 누르면 서버가 다시 검증한 뒤 초안을 만들고 작성 창이 열린다 — 동작은 전과 같다.
 */
function MissingCard({ item, creating, onCreate }: { item: GuideMissing; creating: boolean; onCreate: () => void }) {
  return (
    <button
      type="button"
      disabled={creating}
      onClick={onCreate}
      aria-label={`${item.studentName} ${guideLessonLabel(item)} — 누락 안내 초안 만들기`}
      className="rounded-lg border border-l-[3px] border-red/30 border-l-red bg-red/5 p-2.5 text-left transition hover:bg-red/10 disabled:opacity-60"
    >
      <span className="flex items-center gap-1.5">
        <GuideReasonChip reason={item.reason} />
        <span className="ml-auto text-[11px] text-fg-subtle">{item.eventOn.slice(5)}</span>
      </span>
      <b className="mt-1.5 block truncate text-[13px]" title={item.studentName}>{item.studentName}</b>
      <span className="mt-0.5 block truncate text-[11px] text-fg-subtle" title={guideLessonLabel(item)}>
        {guideLessonLabel(item)}
      </span>
      <span className="block truncate text-[11px] text-fg-subtle">{creating ? '초안 만드는 중…' : (item.teacherName ?? '강사 미정')}</span>
    </button>
  );
}

/**
 * 이력 한 줄 = **사건 하나**(N-90 · W11) — 안내 작성 · 발송 · 강사 확인. 칩은 그 사건 뒤의 상태(원문 §45 「발송 대기」 ·
 * 「발송 완료」)이고 오른쪽 끝 시각은 그 사건의 시각이다. 사건 · 시각 · 한 사람은 서버 원장(hist) 그대로다.
 */
function HistoryRow({ event }: { event: GuideHistoryEvent }) {
  const guide = event.guide;
  const state = event.stateAfter as Guide['state'];
  // 원문 §45 줄 — 상태 색 왼쪽 막대 · 「● 발송 대기」 점 글자 · 이름 · 수업 · 강사 · 오른쪽 끝 시각(사유 칩은 원문 줄에 없다)
  return (
    <li className={cn('flex flex-wrap items-center gap-2 rounded-lg border border-l-[3px] border-line bg-card px-3 py-2.5', GUIDE_STATE_BAR[state])}
      aria-label={`${event.label} · ${guide.studentName ?? '학생 미상'} · ${event.time}`}>
      <GuideStateChip state={state} look="dot" />
      <b className="text-[12.5px]">{guide.studentName ?? '학생 미상'}</b>
      <span className="text-[11.5px] text-fg-subtle">{guideLessonLabel(guide)}</span>
      {/* 강사 칸 — 강사 교체 안내는 「이전 강사 → 지금 강사」(F-62 확인 위치 「수업 안내 → 이력」 · TEACHER-LINEAGE) */}
      <span className="text-[11.5px] text-fg-subtle">{guideTeacherLabel(guide)}</span>
      <time className="ml-auto text-[11px] text-fg-subtle" dateTime={event.at} title={event.byName ? `${event.label} · ${event.byName}` : event.label}>
        {event.time}
      </time>
    </li>
  );
}

export function GuideHistory() {
  const [span, setSpan] = useState<GuideHistorySpan>('month');
  const [anchor, setAnchor] = useState(todayKst);
  const [writing, setWriting] = useState<Guide | null>(null);
  const query = useGuideHistory({ span, anchor });
  const create = useCreateGuideDraft();

  return (
    <div className="space-y-3">
      {/* 요약 칩 셋은 기간 이동 줄 같은 줄 오른쪽 (원문 §45 · g4 §45-3) */}
      <div data-testid="guide-history-bar" className="flex flex-wrap items-center gap-2">
        <Segmented options={SPANS} value={span} onChange={setSpan} />
        <div className="flex min-w-[280px] items-center rounded-lg border border-line bg-card">
          <Button
            className="rounded-r-none border-y-0 border-l-0"
            aria-label="이전 기간"
            onClick={() => setAnchor(shiftAnchor(anchor, span, -1))}
          >
            ‹
          </Button>
          <b className="min-w-36 flex-1 text-center text-[12px]">{periodLabel(span, anchor)}</b>
          <Button
            className="rounded-none border-y-0"
            aria-label="다음 기간"
            onClick={() => setAnchor(shiftAnchor(anchor, span, 1))}
          >
            ›
          </Button>
          <Button className="rounded-l-none border-y-0 border-r-0" onClick={() => setAnchor(todayKst())}>
            오늘
          </Button>
        </div>
        {query.data ? (
          <div className="ml-auto flex flex-wrap gap-2 text-[12px]">
            <Chip tone="info">{query.data.counts.created}건 만듦</Chip>
            <Chip tone="success">{query.data.counts.sent}건 보냄</Chip>
            <Chip tone="danger">안 한 것 {query.data.counts.missing}</Chip>
          </div>
        ) : null}
      </div>

      {create.isError ? <Banner tone="danger">{apiMessage(create.error)}</Banner> : null}
      {writing ? <GuideWriter guide={writing} onClose={() => setWriting(null)} /> : null}

      <QueryState query={query} isEmpty={() => false}>
        {(data) => (
          <>
            {data.missing.length > 0 ? (
              <Panel
                title="안내를 아직 안 했습니다"
                sub="첫 수업이거나 강사가 바뀐 학생만 잡습니다. 누르면 서버가 다시 검증한 뒤 초안을 만듭니다."
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                  {data.missing.map((item) => {
                    const creating =
                      create.isPending &&
                      create.variables?.sourceOccurrenceId === item.sourceOccurrenceId &&
                      create.variables.studentId === item.studentId;
                    return (
                      <MissingCard
                        key={`${item.sourceOccurrenceId}-${item.studentId}`}
                        item={item}
                        creating={creating}
                        onCreate={() =>
                          create.mutate(
                            { sourceOccurrenceId: item.sourceOccurrenceId, studentId: item.studentId },
                            { onSuccess: setWriting },
                          )
                        }
                      />
                    );
                  })}
                </div>
              </Panel>
            ) : (
              <Banner tone="success">이 기간에는 누락된 첫 수업·강사 교체 안내가 없습니다.</Banner>
            )}

            <div className="space-y-2">
              {data.days.length === 0 ? (
                <Panel>
                  <p className="py-4 text-center text-[12px] text-fg-subtle">이 기간의 안내 이력이 없습니다.</p>
                </Panel>
              ) : (
                data.days.map((day) => (
                  <details key={day.date} open className="group overflow-hidden rounded-xl border border-line bg-card">
                    <summary className="flex cursor-pointer list-none items-center gap-2 bg-inset px-4 py-3">
                      <b className="text-[13px]">{longDateLabel(day.date)}</b>
                      <Chip>{day.events.length}건</Chip>
                      {/* 사건 합계 — 서버 tally 그대로(작성 → 발송 → 확인 차례 · 0 은 오지 않는다 · N-90) */}
                      {day.tally.map((entry) => (
                        <GuideStateChip key={entry.action} state={entry.stateAfter as Guide['state']} count={entry.count} look="solid" />
                      ))}
                      <span className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" aria-hidden>
                        ⌄
                      </span>
                    </summary>
                    <ul className="space-y-2 p-3">
                      {day.events.map((event) => (
                        <HistoryRow key={event.id} event={event} />
                      ))}
                    </ul>
                  </details>
                ))
              )}
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
