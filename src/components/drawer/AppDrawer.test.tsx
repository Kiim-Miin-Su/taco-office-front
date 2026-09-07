import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDrawer } from './AppDrawer';

const mocks = vi.hoisted(() => ({ drawer: vi.fn(), meta: vi.fn(), write: vi.fn() }));
vi.mock('@/api/queries', () => ({
  useDrawer: mocks.drawer,
  useMeta: mocks.meta,
  useDrawerWrite: () => ({ mutate: mocks.write, mutateAsync: mocks.write, isPending: false }),
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
    data: { approvals: { count: 2 }, notis: [], kinds: [], tz: 'Asia/Seoul' },
    isLoading: false, isError: false,
  });
  mocks.meta.mockReturnValue({ data: { staff: [], rooms: [], zaccs: [] } });
});
afterEach(cleanup);

describe('공용 서랍의 제어형 선택', () => {
  it('외부 선택을 본문과 접근성 활성 표시가 함께 따른다', () => {
    const view = render(<AppDrawer open pane="kinds" onPaneChange={() => undefined} onClose={() => undefined} />);
    const nav = within(view.getByRole('navigation', { name: '서랍 메뉴' }));
    const active = nav.getByRole('button', { name: '종류' });
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(active.classList.contains('bg-primary')).toBe(true);
    expect(active.classList.contains('bg-blue')).toBe(false);
    expect(nav.getByRole('button', { name: '승인 2' }).getAttribute('aria-pressed')).toBe('false');
    expect(view.getByText('종류 내용')).toBeTruthy();
    expect(view.queryByText('승인 내용')).toBeNull();
  });

  it('탭 클릭은 변경 의도만 전달하고 부모가 바꾼 선택을 렌더한다', () => {
    const change = vi.fn();
    const view = render(<AppDrawer open pane="approvals" onPaneChange={change} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '종류' }));
    expect(change).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledWith('kinds');
    expect(view.getByText('승인 내용')).toBeTruthy();
    view.rerender(<AppDrawer open pane="kinds" onPaneChange={change} onClose={() => undefined} />);
    expect(view.getByText('종류 내용')).toBeTruthy();
    expect(view.queryByText('승인 내용')).toBeNull();
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
    expect(mocks.drawer).toHaveBeenLastCalledWith(false);
    expect(mocks.meta).toHaveBeenLastCalledWith(false);
    view.rerender(<AppDrawer open pane="approvals" onPaneChange={change} onClose={close} />);
    expect(view.getByText('승인 내용')).toBeTruthy();
    expect(view.queryByPlaceholderText(placeholder)).toBeNull();
    view.rerender(<AppDrawer open pane="chreqNew" onPaneChange={change} onClose={close} />);
    expect((view.getByPlaceholderText(placeholder) as HTMLTextAreaElement).value).toBe('저장하지 않은 변경 사유');
    expect(mocks.meta).toHaveBeenLastCalledWith(true);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
