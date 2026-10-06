/** @file-guide
 * 목적: MarketingChannelOverview.tsx — 관리자 수정사항 p117 최근 30일 마케팅 요약과 4개 채널 보드.
 * 책임/재사용: 기존 GET /ops의 기간 투영·서버 채널 낱말·MarketingDto와 기존 수정 다이얼로그 진입을 재사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Marketing } from '@/api/types';
import { Banner, StatCard, cn } from '@/components/ui';

/** 최종 관리자 수정사항 p117의 채널 보드 차례. 보이는 이름은 GET /ops가 준 label만 쓴다. */
const BOARD_ORDER = ['naver_blog', 'instagram', 'naver_ad', 'kakao'] as const;

const recentRows = (rows: readonly Marketing[]): Marketing[] => rows
  // 기간 조회에는 날짜를 모르는 옛 행도 보존된다. 그 행을 “최근 30일”이라고 단정하지 않는다.
  .filter((row): row is Marketing & { onDate: string } => Boolean(row.onDate))
  .sort((a, b) => b.onDate.localeCompare(a.onDate) || b.id - a.id);

export function MarketingChannelOverview({
  rows, channels, from, to, loading = false, failed = false, onEdit,
}: {
  rows: readonly Marketing[] | undefined;
  channels: ReadonlyArray<{ key: string; label: string }>;
  from: string;
  to: string;
  loading?: boolean;
  failed?: boolean;
  onEdit: (row: Marketing) => void;
}) {
  if (loading && !rows) return <Banner tone="neutral">최근 30일 요약을 불러오는 중…</Banner>;
  if (failed && !rows) {
    return <Banner tone="danger">최근 30일 요약을 불러오지 못했습니다. 아래 기간별 목록은 계속 사용할 수 있습니다.</Banner>;
  }

  const dated = recentRows(rows ?? []);
  const byChannel = new Map(channels.map((channel) => [channel.key, channel]));
  const boards = BOARD_ORDER.map((key) => byChannel.get(key)).filter((channel): channel is { key: string; label: string } => Boolean(channel));
  const currentKeys = new Set(boards.map((channel) => channel.key));
  const moved = new Set(dated.filter((row) => currentKeys.has(row.channel)).map((row) => row.channel)).size;
  const people = new Set(dated.flatMap((row) => row.byId == null ? [] : [row.byId])).size;
  const latest = dated[0];

  return (
    <section aria-labelledby="mkt-30-title" className="mb-4">
      <header className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="mkt-30-title" className="text-[14px] font-bold text-fg">최근 30일 채널 한눈에</h2>
          <p className="mt-0.5 text-[11px] text-fg-subtle">{from} ~ {to} · 날짜가 없는 옛 활동은 아래 기간별 목록에서 확인합니다</p>
        </div>
        {loading ? <span className="text-[11px] text-fg-subtle">새로 받는 중…</span> : null}
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="최근 30일 한 것" value={`${dated.length}건`} tone="info" accent="info" dim={dated.length === 0} />
        <StatCard label="움직인 채널" value={`${moved}/${boards.length}`} tone="teal" accent="teal" dim={moved === 0} />
        <StatCard label="누가" value={`${people}명`} tone="purple" accent="purple" dim={people === 0} />
        <StatCard label="마지막 활동" value={latest?.onDate?.slice(5) ?? '없음'}
          note={latest?.name} tone="orange" accent="orange" dim={!latest} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {boards.map((channel) => {
          const latestFour = dated.filter((row) => row.channel === channel.key).slice(0, 4);
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
                        <span className="mt-0.5 block text-[10.5px] text-fg-subtle">
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
