/** @file-guide
 * 목적: 개발명세서 v2 §45의 기간별 안내 이력과 안내 누락 자동 초안 생성을 제공한다.
 * 책임/재사용: 기간·누락·집계는 GET /guides/history 정본을 사용하고 POST /guides/drafts는 서버 투영 키만 전송한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useCreateGuideDraft, useGuideHistory } from '@/api/queries';
import type { Guide, GuideHistorySpan, GuideMissing } from '@/api/types';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Panel } from '@/components/ui/Panel';
import { QueryState } from '@/components/ui/QueryState';
import { Segmented } from '@/components/ui/Segmented';
import { addDays, dowOf, KO_DOW, todayKst } from '@/lib/calendar';
import { GuideReasonChip, GuideStateChip } from './GuideStatus';
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

function dayLabel(day: string): string {
  return `${day.slice(2, 4)}년 ${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 ${KO_DOW[dowOf(day)]}요일`;
}

function MissingCard({ item, creating, onCreate }: { item: GuideMissing; creating: boolean; onCreate: () => void }) {
  return (
    <article className="rounded-lg border border-l-[3px] border-red/30 border-l-red bg-red/5 p-3">
      <header className="flex items-center gap-2">
        <GuideReasonChip reason={item.reason} />
        <b className="text-[13px]">{item.studentName}</b>
        <span className="ml-auto text-[11px] text-fg-subtle">{item.eventOn.slice(5)}</span>
      </header>
      <div className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-subtle">
        <span className="truncate">{item.serTitle ?? '수업명 미정'}</span>
        <span aria-hidden>·</span>
        <span>{item.teacherName ?? '강사 미정'}</span>
      </div>
      <Button className="mt-3 w-full" size="sm" variant="danger" disabled={creating} onClick={onCreate}>
        {creating ? '초안 만드는 중…' : '누락 안내 초안 만들기'}
      </Button>
    </article>
  );
}

function HistoryRow({ guide }: { guide: Guide }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-l-[3px] border-line border-l-blue bg-card px-3 py-2.5">
      <GuideStateChip state={guide.state} />
      <GuideReasonChip reason={guide.reason} />
      <b className="text-[12.5px]">{guide.studentName ?? '학생 미상'}</b>
      <span className="text-[11.5px] text-fg-subtle">{guide.serTitle ?? '수업명 미정'}</span>
      <span className="text-[11.5px] text-fg-subtle">{guide.teacherName ?? '강사 미정'}</span>
      <time className="ml-auto text-[11px] text-fg-subtle">
        {guide.sentAt?.slice(11, 16) ?? guide.createdAt.slice(11, 16) ?? '—'}
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
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      {create.isError ? <Banner tone="danger">{apiMessage(create.error)}</Banner> : null}
      {writing ? <GuideWriter guide={writing} onClose={() => setWriting(null)} /> : null}

      <QueryState query={query} isEmpty={() => false}>
        {(data) => (
          <>
            <div className="flex flex-wrap justify-end gap-2 text-[12px]">
              <Chip tone="info">{data.counts.created}건 만듦</Chip>
              <Chip tone="success">{data.counts.sent}건 보냄</Chip>
              <Chip tone="danger">안 한 것 {data.counts.missing}</Chip>
            </div>

            {data.missing.length > 0 ? (
              <Panel
                title="안내를 아직 안 했습니다"
                sub="첫 수업이거나 강사가 바뀐 학생만 잡습니다. 누르면 서버가 다시 검증한 뒤 초안을 만듭니다."
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
                      <b className="text-[13px]">{dayLabel(day.date)}</b>
                      <Chip>{day.items.length}건</Chip>
                      <span className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" aria-hidden>
                        ⌄
                      </span>
                    </summary>
                    <ul className="space-y-2 p-3">
                      {day.items.map((guide) => (
                        <HistoryRow key={guide.id} guide={guide} />
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
