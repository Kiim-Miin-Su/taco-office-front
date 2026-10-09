/** @file-guide
 * 목적: MarketingChannelOverview.test.tsx — 관리자 수정사항 p117 최근 30일 요약·채널별 최신 4건 회귀.
 * 책임/재사용: 생성 MarketingDto와 서버 채널 어휘를 입력으로 사용하고 화면 정렬·빈 상태·수정 진입만 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Marketing, MarketingOverview } from '@/api/types';
import { MarketingChannelOverview } from './MarketingChannelOverview';

const row = (id: number, channel: string, channelLabel: string, onDate: string | null, byId = 2): Marketing => ({
  id, channel, channelLabel, item: 'post', itemLabel: '글 발행', title: `활동 ${id}`, name: `활동 ${id}`,
  onDate, byId, byName: byId === 2 ? '김관리' : '박운영', url: null, impressions: null, clicks: null,
  inquiries: null, enrolled: 0, cost: null, costPerEnroll: null, memo: null, version: 1,
});

const rows: Marketing[] = [
  row(1, 'naver_blog', '네이버 블로그', '2026-10-01'),
  row(2, 'naver_blog', '네이버 블로그', '2026-10-07', 3),
  row(3, 'naver_blog', '네이버 블로그', '2026-10-03'),
  row(4, 'naver_blog', '네이버 블로그', '2026-10-05'),
  row(5, 'naver_blog', '네이버 블로그', '2026-10-02'),
  row(6, 'instagram', '인스타그램', '2026-10-06'),
  row(7, 'naver_ad', '네이버 광고', '2026-10-04'),
  row(8, 'kakao', '카카오채널', '2026-10-03'),
  row(9, 'naver', '네이버', null),
];

const overview: MarketingOverview = {
  from: '2026-09-08', to: '2026-10-07', activityCount: 8, activeChannelCount: 4, channelCount: 4, actorCount: 2,
  latest: rows[1]!, canSeeAmounts: false,
  channels: [
    { key: 'naver_blog', label: '네이버 블로그', latest: [rows[1]!, rows[3]!, rows[2]!, rows[4]!] },
    { key: 'instagram', label: '인스타그램', latest: [rows[5]!] },
    { key: 'naver_ad', label: '네이버 광고', latest: [rows[6]!] },
    { key: 'kakao', label: '카카오채널', latest: [rows[7]!] },
  ],
};

describe('MarketingChannelOverview — 최종 관리자 수정사항 p117', () => {
  it('최근 30일 사실 네 칸과 최신 수정 진입을 표시하고 날짜 없는 옛 행은 최근 집계에서 제외한다', () => {
    const onEdit = vi.fn();
    const view = render(<MarketingChannelOverview
      overview={overview} onEdit={onEdit}
    />);

    expect(view.getByText('최근 30일 한 것').parentElement?.textContent).toContain('8건');
    expect(view.getByText('움직인 채널').parentElement?.textContent).toContain('4/4');
    expect(view.getByText('누가').parentElement?.textContent).toContain('2명');
    expect(view.getByText('마지막 활동').parentElement?.textContent).toContain('10-07');
    expect(view.getByText('마지막 활동').parentElement?.textContent).toContain('활동 2');

    fireEvent.click(view.getByRole('button', { name: '활동 2 수정' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it('채널 보드는 PPT 순서이며 채널마다 날짜 최신순 네 건만 표시한다', () => {
    const view = render(<MarketingChannelOverview
      overview={overview} onEdit={() => undefined}
    />);
    expect(view.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent))
      .toEqual(['네이버 블로그', '인스타그램', '네이버 광고', '카카오채널']);

    const blog = view.getByRole('heading', { name: '네이버 블로그' }).closest('section')!;
    expect(within(blog).getAllByRole('button').map((button) => button.textContent))
      .toEqual(expect.arrayContaining(['활동 210-07 · 글 발행 · 박운영', '활동 410-05 · 글 발행 · 김관리']));
    expect(within(blog).getAllByRole('button')).toHaveLength(4);
    expect(within(blog).queryByText('활동 1')).toBeNull();
  });

  it('로딩·오류·빈 채널을 별도로 말하고 기존 기간별 목록을 막지 않는다', () => {
    const loading = render(<MarketingChannelOverview overview={undefined} loading onEdit={() => undefined} />);
    expect(loading.getByText('최근 30일 요약을 불러오는 중…')).toBeTruthy();
    loading.unmount();

    const failed = render(<MarketingChannelOverview overview={undefined} failed onEdit={() => undefined} />);
    expect(failed.getByText(/아래 기간별 목록은 계속 사용할 수 있습니다/)).toBeTruthy();
    failed.unmount();

    const empty = render(<MarketingChannelOverview overview={{ ...overview, activityCount: 0, activeChannelCount: 0, actorCount: 0, latest: null,
      channels: overview.channels.map((channel) => ({ ...channel, latest: [] })) }} onEdit={() => undefined} />);
    expect(empty.getAllByText('최근 30일 활동 없음')).toHaveLength(4);
  });
});
