/** @file-guide
 * 목적: ScheduleHistory.tsx — ScheduleHistory (component · 서랍 「변경 요청 · 이력」 칸의 「최근 변경 이력」)
 * 책임/재사용: useScheduleHistory(GET /drawer/schedule-history)의 서버 문장을 그대로 그린다. 문장 · 볼 수 있는 범위는 서버가 정한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원문 §20 「최근 변경 이력」 (W11 A' 후속 · N-73 의 읽는 쪽) — 요청 목록 아래 제목 한 줄 · 가는 선 · 카드 목록.
 * 카드 한 장은 원문 컷 그대로 세 줄이다 — 「누가 —」(굵게) · 「앞 → 뒤」 · 무엇을(「SAT Reading 8/28 → 20:00 이동 (이 주만)」).
 * 누가 · 언제 옆에 적는 시각만 화면이 줄인다(서버가 준 한국 시각에서 「월/일 시:분」). 문장은 한 글자도 짓지 않는다.
 */
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useScheduleHistory } from '@/api/queries';
import { Banner } from '@/components/ui';

/** 서버 시각('YYYY-MM-DDTHH:MM:SS+09:00') → 「9/28 14:20」 */
const when = (at: string): string => `${Number(at.slice(5, 7))}/${Number(at.slice(8, 10))} ${at.slice(11, 16)}`;

export function ScheduleHistory({ enabled }: { enabled: boolean }) {
  const [cursors, setCursors] = useState<Array<number | undefined>>([undefined]);
  const page = cursors.length - 1;
  const q = useScheduleHistory(enabled, cursors[page]);
  // 칸을 다시 열면 staleTime=0 조회가 즉시 다시 돈다. 그 짧은 동안 캐시된 옛 1쪽을 최신처럼 보여 주지 않는다.
  const data = q.isFetching ? undefined : q.data;
  const rows = data?.rows ?? [];
  useEffect(() => {
    if (!enabled) setCursors([undefined]);
  }, [enabled]);
  return (
    <section aria-label="최근 변경 이력" className="mt-6">
      <h3 className="text-[13px] font-bold text-fg">최근 변경 이력</h3>
      <hr className="my-2 border-line" />
      {q.isLoading || q.isFetching ? <p className="py-4 text-center text-[12px] text-fg-subtle">읽는 중…</p> : null}
      {q.isError ? <Banner tone="danger">변경 이력을 읽지 못했습니다. 잠시 뒤 다시 열어 주세요.</Banner> : null}
      {data && rows.length === 0 ? <p className="py-4 text-center text-[12px] text-fg-subtle">바뀐 일정이 없습니다</p> : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-0.5 rounded-[7px] border border-line bg-card p-2">
              <span className="text-[12px] font-bold leading-[18px] text-fg">{r.actorName ?? '—'} — {when(r.at)}</span>
              <span className="text-[11px] leading-[15px] text-fg-subtle">{r.from ?? '—'} → {r.to ?? '—'}</span>
              <span className="flex items-center justify-between gap-2 text-[11px] font-medium leading-[17px] text-fg-subtle">
                <span>{r.summary}</span>
                {r.go ? <Link href={r.go} className="shrink-0 font-bold text-primary hover:underline">회차 열기 ›</Link> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {data && (page > 0 || data.nextBeforeId) ? (
        <nav aria-label="변경 이력 페이지" className="mt-2 flex items-center justify-between gap-2">
          <button type="button" disabled={page === 0 || q.isFetching}
            onClick={() => setCursors([undefined])}
            className="rounded border border-line px-2 py-1 text-[11px] font-bold text-fg disabled:opacity-40">
            최신 이력
          </button>
          <span className="text-[11px] text-fg-subtle">{page + 1}쪽</span>
          <button type="button" disabled={!data.nextBeforeId || q.isFetching}
            onClick={() => {
              if (data.nextBeforeId) setCursors((value) => [...value, data.nextBeforeId!]);
            }}
            className="rounded border border-line px-2 py-1 text-[11px] font-bold text-fg disabled:opacity-40">
            이전 이력
          </button>
        </nav>
      ) : null}
    </section>
  );
}
