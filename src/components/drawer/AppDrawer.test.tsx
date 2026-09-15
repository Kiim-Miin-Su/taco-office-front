/** @file-guide
 * 목적: AppDrawer.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { AppDrawer } from './AppDrawer';

const mocks = vi.hoisted(() => ({ drawer: vi.fn(), meta: vi.fn(), write: vi.fn(), zoom: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useDrawer: mocks.drawer,
  useMeta: mocks.meta,
  useDrawerWrite: () => ({ mutate: mocks.write, mutateAsync: mocks.write, isPending: false }),
  useZoom: mocks.zoom,
}));
vi.mock('@/store/useSession', () => ({
  useSession: (select: (state: { me: { id: number } }) => unknown) => select({ me: { id: 1 } }),
}));
vi.mock('./panes', async (importOriginal) => ({
  ...await importOriginal<typeof import('./panes')>(),
  ApprovalsPane: () => <div>승인 내용</div>,
  KindsPane: () => <div>종류 내용</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.drawer.mockReturnValue({
    data: {
      approvals: { count: 2, inboxCount: 2 }, notis: [], notiCategories: [], kinds: [], zoomAccounts: [], members: [],
      tz: 'Asia/Seoul', tzGroups: [{ id: 1, name: '한국 (KST)', tz: 'Asia/Seoul' }],
    },
    isLoading: false, isError: false,
  });
  mocks.meta.mockReturnValue({ data: { staff: [], rooms: [], zaccs: [] } });
  mocks.zoom.mockReturnValue({ data: undefined, isLoading: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('공용 서랍의 제어형 선택', () => {
  it('외부 선택을 본문과 접근성 활성 표시가 함께 따른다', () => {
    const view = render(<AppDrawer open pane="kinds" onPaneChange={() => undefined} onClose={() => undefined} />);
    const nav = within(view.getByRole('navigation', { name: '서랍 메뉴' }));
    const active = nav.getByRole('button', { name: '프로그램' });
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(active.classList.contains('bg-primary')).toBe(true);
    expect(active.classList.contains('bg-blue')).toBe(false);
    expect(nav.getByRole('button', { name: '승인 대기함 2' }).getAttribute('aria-pressed')).toBe('false');
    expect(view.getByText('종류 내용')).toBeTruthy();
    expect(view.queryByText('승인 내용')).toBeNull();
  });

  it('탭 클릭은 변경 의도만 전달하고 부모가 바꾼 선택을 렌더한다', () => {
    const change = vi.fn();
    const view = render(<AppDrawer open pane="approvals" onPaneChange={change} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '프로그램' }));
    expect(change).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledWith('kinds');
    expect(view.getByText('승인 내용')).toBeTruthy();
    view.rerender(<AppDrawer open pane="kinds" onPaneChange={change} onClose={() => undefined} />);
    expect(view.getByText('종류 내용')).toBeTruthy();
    expect(view.queryByText('승인 내용')).toBeNull();
  });

  it('서랍 읽기 실패 뒤 다른 탭을 누르면 같은 snapshot을 다시 읽고 브라우저에 복구 과정을 남긴다', async () => {
    const change = vi.fn();
    const refetch = vi.fn().mockResolvedValue({ isError: false, error: null });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mocks.drawer.mockReturnValue({
      data: undefined, isLoading: false, isError: true, isFetching: true, refetch,
    });

    const view = render(<AppDrawer open pane="approvals" onPaneChange={change} onClose={() => undefined} />);
    expect(view.getByText('서랍을 읽지 못했습니다. 잠시 뒤 다시 열어 주세요.')).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: '프로그램' }));
    view.rerender(<AppDrawer open pane="kinds" onPaneChange={change} onClose={() => undefined} />);

    expect(change).toHaveBeenCalledWith('kinds');
    await waitFor(() => expect(refetch).toHaveBeenCalledOnce());
    await waitFor(() => expect(info).toHaveBeenCalledWith(
      '[TACO] drawer.fetch.retry.succeeded',
      { fromPane: 'approvals', toPane: 'kinds', notiWindow: 'month' },
    ));
    expect(info).toHaveBeenCalledWith(
      '[TACO] drawer.fetch.retry.requested',
      { fromPane: 'approvals', toPane: 'kinds', notiWindow: 'month' },
    );
  });

  it('탭 전환 재시도도 실패하면 토큰·헤더 없이 오류 코드와 상태만 경고로 남긴다', async () => {
    const refetch = vi.fn().mockResolvedValue({
      isError: true,
      error: new ApiError('DRAWER_UNAVAILABLE', '내부 원인은 로그에 남기지 않는다', 503),
    });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.drawer.mockReturnValue({
      data: undefined, isLoading: false, isError: true, isFetching: false, refetch,
    });

    const view = render(<AppDrawer open pane="approvals" onPaneChange={() => undefined} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '알림' }));
    view.rerender(<AppDrawer open pane="notis" onPaneChange={() => undefined} onClose={() => undefined} />);

    await waitFor(() => expect(warn).toHaveBeenCalledWith(
      '[TACO] drawer.fetch.retry.failed',
      {
        fromPane: 'approvals', toPane: 'notis', notiWindow: 'month',
        errorCode: 'DRAWER_UNAVAILABLE', status: 503,
      },
    ));
  });

  it('닫고 승인으로 다시 열어도 기존 변경 요청 초안을 보존하고 닫힌 조회를 끈다', () => {
    const change = vi.fn();
    const close = vi.fn();
    const view = render(<AppDrawer open pane="chreqNew" onPaneChange={change} onClose={close} />);
    const placeholder = '왜 바꿔야 하는지 한 줄이라도 적어 주세요';
    fireEvent.change(view.getByPlaceholderText(placeholder), { target: { value: '저장하지 않은 변경 사유' } });
    fireEvent.click(view.getByRole('button', { name: '닫기' }));
    expect(close).toHaveBeenCalledOnce();
    view.rerender(<AppDrawer open={false} pane="chreqNew" onPaneChange={change} onClose={close} />);
    expect(view.queryByRole('dialog')).toBeNull();
    // C38 — 서랍은 알림 조회 범위(기본 month)를 함께 넘긴다. 닫히면 여전히 조회를 끈다
    expect(mocks.drawer).toHaveBeenLastCalledWith(false, 'month');
    expect(mocks.meta).toHaveBeenLastCalledWith(false);
    view.rerender(<AppDrawer open pane="approvals" onPaneChange={change} onClose={close} />);
    expect(view.getByText('승인 내용')).toBeTruthy();
    expect(view.queryByPlaceholderText(placeholder)).toBeNull();
    view.rerender(<AppDrawer open pane="chreqNew" onPaneChange={change} onClose={close} />);
    expect((view.getByPlaceholderText(placeholder) as HTMLTextAreaElement).value).toBe('저장하지 않은 변경 사유');
    expect(mocks.meta).toHaveBeenLastCalledWith(true);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  /*
   * C72 — §21 격자는 서랍 payload 에 없다. 칸을 **열 때만** 부른다.
   * 여덟 칸에 얹으면 §21 을 안 쓰는 사람도 서랍을 열 때마다 점유 질의를 치른다 (C50 의 교훈).
   */
  it('§21 점유는 그 칸을 열 때만 부른다 — 서랍을 여는 것만으로는 부르지 않는다', () => {
    const view = render(<AppDrawer open pane="approvals" onPaneChange={() => undefined} onClose={() => undefined} />);
    expect(mocks.zoom).toHaveBeenLastCalledWith(undefined, false);
    view.rerender(<AppDrawer open pane="zoom" onPaneChange={() => undefined} onClose={() => undefined} />);
    expect(mocks.zoom).toHaveBeenLastCalledWith(undefined, true);
    view.rerender(<AppDrawer open={false} pane="zoom" onPaneChange={() => undefined} onClose={() => undefined} />);
    expect(mocks.zoom).toHaveBeenLastCalledWith(undefined, false);
  });
});
