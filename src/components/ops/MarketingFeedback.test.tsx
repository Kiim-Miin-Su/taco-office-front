/** @file-guide
 * 목적: §60 대표 피드백 — 칩과 「고쳐야 할 것 N건」을 화면이 세지 않는다 (C53).
 * 책임/재사용: 실제 MarketingFeedback 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Marketing, MfbThread } from '@/api/types';
import { MarketingFeedback } from './MarketingFeedback';

const marketing: Marketing[] = [
  { id: 1, channel: 'naver', item: 'blog', channelLabel: '네이버', itemLabel: '블로그 글',
    title: '로드맵 글', name: '로드맵 글', byId: 2, byName: '담당', enrolled: 0 },
];

/** 서버가 「확인 필요」라고 보낸 카드. 답이 이미 하나 달려 있어도 칩은 서버 말을 따른다 */
const needsFix: MfbThread = {
  mktId: 1, name: '로드맵 글', channelLabel: '네이버', itemLabel: '블로그 글',
  url: 'https://blog.naver.com/tnacad', byName: '담당',
  state: 'needs_fix', stateLabel: '확인 필요', at: '2026-08-20T21:15:00+09:00',
  canReply: true,
  posts: [
    { id: 5, kind: 'reply', kindLabel: '담당자 답변', body: '옛 답', byId: 2, byName: '담당', at: '2026-08-19T09:00:00+09:00' },
    { id: 7, kind: 'comment', kindLabel: '대표 코멘트', body: '제목이 길어 검색에 안 걸립니다', byId: 1, byName: '대표', at: '2026-08-20T21:15:00+09:00' },
  ],
};

const clients: QueryClient[] = [];
function setup(threads: MfbThread[], opts?: { needsFix?: number; canComment?: boolean; viewerId?: number | null }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MarketingFeedback
        threads={threads}
        needsFix={opts?.needsFix ?? 1}
        canComment={opts?.canComment ?? false}
        viewerId={opts?.viewerId ?? 2}
        marketing={marketing}
      />
    </QueryClientProvider>,
  );
}
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); });

it('칩과 머리의 숫자는 서버가 준 값 그대로다 — 답이 있어도 화면이 뒤집지 않는다', () => {
  const view = setup([needsFix], { needsFix: 3 });
  expect(view.getByText('확인 필요')).toBeTruthy();
  expect(view.getByText('고쳐야 할 것 3건')).toBeTruthy();
  // 답이 한 줄 있는데도 서버가 needs_fix 라고 했으므로 「아직 답이 없습니다」가 그대로 붙는다
  expect(view.getByText('아직 답이 없습니다')).toBeTruthy();
});

it('낱말은 서버가 만든 것을 쓴다 — 코드값이 화면으로 새지 않는다 (D-R18)', () => {
  const view = setup([needsFix]);
  expect(view.getByText('네이버')).toBeTruthy();
  expect(view.getByText('블로그 글 · 담당 담당')).toBeTruthy();
  expect(view.queryByText(/needs_fix|comment|reply/)).toBeNull();
});

it('대표가 아니면 「+ 코멘트 남기기」가 없다 — 서버도 CEO_ONLY 로 막는다', () => {
  expect(setup([needsFix], { canComment: false }).queryByRole('button', { name: '+ 코멘트 남기기' })).toBeNull();
  cleanup();
  expect(setup([needsFix], { canComment: true }).getByRole('button', { name: '+ 코멘트 남기기' })).toBeTruthy();
});

it('답은 **가장 나중 코멘트**에 붙는다 — 옛 코멘트에 붙으면 카드가 안 고쳐진다', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: [] });
  const view = setup([needsFix]);
  fireEvent.click(view.getByRole('button', { name: '고친 것 알리기' }));
  fireEvent.change(view.getByLabelText('고친 것 알리기'), { target: { value: '키워드를 앞으로 뺐습니다' } });
  fireEvent.click(view.getByRole('button', { name: '알리기' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/marketing/1/replies', {
    parentId: 7, body: '키워드를 앞으로 뺐습니다',
  }));
});

it('담당자가 아니면 답 단추가 없다 — canReply 는 서버가 정한다', () => {
  const view = setup([{ ...needsFix, canReply: false }]);
  expect(view.queryByRole('button', { name: '고친 것 알리기' })).toBeNull();
  expect(view.getByRole('button', { name: 'URL' })).toBeTruthy();
});

it('자기가 쓴 글만 「답 고치기」가 뜬다', () => {
  const mine = setup([needsFix], { viewerId: 2 });
  expect(mine.getAllByRole('button', { name: '답 고치기' })).toHaveLength(1);
  cleanup();
  const other = setup([needsFix], { viewerId: 9 });
  expect(other.queryByRole('button', { name: '답 고치기' })).toBeNull();
});

it('고친 카드에는 「아직 답이 없습니다」도 답 단추도 없다', () => {
  const view = setup([{ ...needsFix, state: 'fixed', stateLabel: '고쳤습니다' }], { needsFix: 0 });
  expect(view.getByText('고쳤습니다')).toBeTruthy();
  expect(view.queryByText('아직 답이 없습니다')).toBeNull();
  expect(view.queryByRole('button', { name: '고친 것 알리기' })).toBeNull();
});

it('코멘트는 고른 활동에 붙는다', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: [] });
  const view = setup([], { canComment: true, needsFix: 0 });
  fireEvent.click(view.getByRole('button', { name: '+ 코멘트 남기기' }));
  fireEvent.change(view.getByLabelText('어느 활동에'), { target: { value: '1' } });
  fireEvent.change(view.getByLabelText('코멘트'), { target: { value: '제목을 줄여 주세요' } });
  fireEvent.click(view.getByRole('button', { name: '남기기' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/marketing/1/comments', { body: '제목을 줄여 주세요' }));
});

it('코멘트가 없으면 빈 상태를 보인다', () => {
  expect(setup([], { needsFix: 0 }).getByText('아직 코멘트가 없습니다')).toBeTruthy();
});
