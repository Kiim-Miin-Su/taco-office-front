/** @file-guide
 * 목적: MarketingChannelOverview.tsx — 관리자 수정사항 p117 최근 30일 마케팅 요약과 4개 채널 보드.
 * 책임/재사용: GET /ops/marketing-overview의 기간·정렬·서버 채널 낱말과 기존 수정 다이얼로그 진입을 재사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Marketing, MarketingOverview } from '@/api/types';
import { Banner, StatCard, cn } from '@/components/ui';

export function MarketingChannelOverview({
  overview, loading = false, failed = false, onEdit,
}: {
  overview: MarketingOverview | undefined;
  loading?: boolean;
  failed?: boolean;
  onEdit: (row: Marketing) => void;
}) {
  if (loading && !overview) return <Banner tone="neutral">최근 30일 요약을 불러오는 중…</Banner>;
  if (failed && !overview) {
    return <Banner tone="danger">최근 30일 요약을 불러오지 못했습니다. 아래 기간별 목록은 계속 사용할 수 있습니다.</Banner>;
  }

  const from = overview?.from ?? '';
  const to = overview?.to ?? '';
  const latest = overview?.latest;
  const boards = overview?.channels ?? [];

  return (
    <section aria-labelledby="mkt-30-title" className="mb-4">
      <header className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="mkt-30-title" className="text-[14px] font-bold text-fg">최근 30일 채널 한눈에</h2>
          <p className="mt-0.5 text-[12px] text-fg-subtle">{from} ~ {to} · 날짜가 없는 옛 활동은 아래 기간별 목록에서 확인합니다</p>
        </div>
        {loading ? <span className="text-[12px] text-fg-subtle">새로 받는 중…</span> : null}
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="최근 30일 한 것" value={`${overview?.activityCount ?? 0}건`} tone="info" accent="info" dim={!overview?.activityCount} />
        <StatCard label="움직인 채널" value={`${overview?.activeChannelCount ?? 0}/${overview?.channelCount ?? 4}`} tone="teal" accent="teal" dim={!overview?.activeChannelCount} />
        <StatCard label="누가" value={`${overview?.actorCount ?? 0}명`} tone="purple" accent="purple" dim={!overview?.actorCount} />
        <StatCard label="마지막 활동" value={latest?.onDate?.slice(5) ?? '없음'}
          note={latest?.name} tone="orange" accent="orange" dim={!latest} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {boards.map((channel) => {
          const latestFour = channel.latest;
          return (
            <section key={channel.key} aria-labelledby={`mkt-board-${channel.key}`}
              className="rounded-xl border border-line bg-card p-3">
              <h3 id={`mkt-board-${channel.key}`} className="text-[13px] font-bold text-fg">{channel.label}</h3>
              {latestFour.length === 0 ? (
                <p className="mt-3 rounded-lg bg-inset px-3 py-4 text-center text-[12px] text-fg-subtle">최근 30일 활동 없음</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {latestFour.map((row) => (
                    <li key={row.id}>
                      <button type="button" aria-label={`${row.name} 수정`} onClick={() => onEdit(row)}
                        className={cn('min-h-11 w-full rounded-lg border border-line px-2.5 py-2 text-left hover:bg-inset',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg')}>
                        <b className="block truncate text-[12px] text-fg">{row.name}</b>
                        <span className="mt-0.5 block text-[12px] text-fg-subtle">
                          {row.onDate?.slice(5)} · {row.itemLabel} · {row.byName ?? '담당 없음'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
