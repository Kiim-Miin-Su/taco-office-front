/** @file-guide
 * 목적: AppDrawer.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import type { Occurrence } from '@/api/types';
import { WorkspaceRail } from '@/components/shell/WorkspaceRail';
import { useWorkspace } from '@/store/useWorkspace';
import { AppDrawer } from './AppDrawer';

const mocks = vi.hoisted(() => ({
  drawer: vi.fn(), meta: vi.fn(), write: vi.fn(), zoom: vi.fn(), occ: vi.fn(), myExpenses: vi.fn(), history: vi.fn(),
}));
vi.mock('@/api/queries', () => ({
  useDrawer: mocks.drawer,
  useMeta: mocks.meta,
  useDrawerWrite: () => ({ mutate: mocks.write, mutateAsync: mocks.write, isPending: false }),
  useZoom: mocks.zoom,
  useOccurrences: mocks.occ,
  // N-52 「내 지출 신청」 — 「변경 요청 · 이력」 칸을 열 때만 읽는다
  useMyExpenses: mocks.myExpenses,
  // §20 「최근 변경 이력」 — 같은 칸을 열 때만 읽는다 (W11 A' 후속)
  useScheduleHistory: mocks.history,
}));
vi.mock('@/store/useSession', () => ({
  useSession: (select: (state: { me: { id: number } }) => unknown) => select({ me: { id: 1 } }),
}));
vi.mock('./panes', async (importOriginal) => ({
  ...await importOriginal<typeof import('./panes')>(),
  ApprovalsPane: ({ onReview }: { onReview?: (v: { id: number; kind: string; decision: 'approve' | 'reject' }) => void }) => (
    <div>
      승인 내용
      <button type="button" onClick={() => onReview?.({ id: 1, kind: 'req', decision: 'approve' })}>시험 승인</button>
    </div>
  ),
  KindsPane: () => <div>종류 내용</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspace.getState().clearDrawer();
  mocks.drawer.mockReturnValue({
    data: {
      approvals: { count: 2, inboxCount: 2 }, notis: [], notiCategories: [], kinds: [], zoomAccounts: [], members: [],
      tz: 'Asia/Seoul', tzGroups: [{ id: 1, name: '한국 (KST)', tz: 'Asia/Seoul' }], changeReqs: [],
      myExpenses: { total: 3, pending: 1, rejected: 1 },
    },
    isLoading: false, isError: false,
  });
  mocks.meta.mockReturnValue({ data: { staff: [], rooms: [], zaccs: [], subs: [], kinds: [] } });
  mocks.zoom.mockReturnValue({ data: undefined, isLoading: false });
  mocks.occ.mockReturnValue({ data: undefined, isLoading: false });
  mocks.myExpenses.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  mocks.history.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('공용 서랍의 제어형 선택', () => {
  function readyChangeReq(view: ReturnType<typeof render>, reason = '첫 요청') {
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    const ownerKey = useWorkspace.getState().drawer.ownerKey!;
    const draft = useWorkspace.getState().drawer.draft!;
    act(() => useWorkspace.getState().setChangeReqDraft(ownerKey, {
      ...draft, serId: '41', onDate: '2026-09-25', startMin: '600', endMin: '660', reason,
    }));
    expect(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }).hasAttribute('disabled'))
      .toBe(false);
    return ownerKey;
  }

  it('라우트 재마운트 중 진행 중인 변경 요청은 다시 제출되지 않는다', async () => {
    let resolve!: (value: { id: number; conflicts: [] }) => void;
    mocks.write.mockReturnValue(new Promise((done) => { resolve = done; }));
    const first = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    readyChangeReq(first);
    fireEvent.click(within(first.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    expect(mocks.write).toHaveBeenCalledOnce();
    first.unmount();

    const next = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    const submit = within(next.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: /요청 넣기|보내는 중/ });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.click(submit);
    expect(mocks.write).toHaveBeenCalledOnce();
    await act(async () => resolve({ id: 9, conflicts: [] }));
  });

  it('성공 응답이 라우트 재마운트 후 도착해도 새 서랍에 접수 결과를 남긴다', async () => {
    let resolve!: (value: { id: number; conflicts: [] }) => void;
    mocks.write.mockReturnValue(new Promise((done) => { resolve = done; }));
    const first = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    readyChangeReq(first);
    fireEvent.click(within(first.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    first.unmount();
    const next = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);

    await act(async () => resolve({ id: 9, conflicts: [] }));
    expect(next.queryByRole('dialog', { name: '변경 요청' })).toBeNull();
    expect(next.getByText('요청을 넣었습니다 — 승인은 그 화면에서 이뤄집니다')).toBeTruthy();
  });

  it('겹침·서버 오류가 라우트 재마운트 후 도착해도 같은 초안에서 이유를 보여 준다', async () => {
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    mocks.write.mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
      .mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }));
    const first = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    readyChangeReq(first);
    fireEvent.click(within(first.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    first.unmount();
    const next = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);

    await act(async () => resolve({ id: null, conflicts: [
      { serId: 12, onDate: '2026-09-24', startMin: 1230, endMin: 1290, title: 'SAT Math', with: 'teacher', whoName: '김재훈' },
    ] }));
    expect(within(next.getByRole('dialog', { name: '변경 요청' })).getByText(/1건과 겹칩니다/)).toBeTruthy();

    fireEvent.click(within(next.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    next.unmount();
    const again = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    await act(async () => reject(new ApiError('CHANGE_REQUEST_FAILED', '변경 요청을 넣지 못했습니다', 409)));
    expect(within(again.getByRole('dialog', { name: '변경 요청' })).getByText('변경 요청을 넣지 못했습니다')).toBeTruthy();
  });

  it('타임아웃은 실패 확정으로 말하지 않고 접수 여부 미확인과 같은 요청 재확인을 안내한다', async () => {
    mocks.write.mockRejectedValueOnce(new ApiError('TIMEOUT', '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.', 0));
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    readyChangeReq(view);
    fireEvent.click(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    expect(await within(view.getByRole('dialog', { name: '변경 요청' })).findByText(/접수 여부를 확인하지 못했습니다/)).toBeTruthy();
    expect(within(view.getByRole('dialog', { name: '변경 요청' })).getByText(/같은 요청을 다시 보내/)).toBeTruthy();
    expect(within(view.getByRole('dialog', { name: '변경 요청' })).queryByText(/시간이나 자원을 바꿔 주세요/)).toBeNull();
  });

  it('타임아웃 후 라우트가 재마운트되어도 같은 본문 재확인은 동일 요청 키를 보낸다', async () => {
    mocks.write.mockRejectedValueOnce(new ApiError('TIMEOUT', '서버 응답 시간이 초과되었습니다.', 0))
      .mockResolvedValueOnce({ id: 9, conflicts: [] });
    const first = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    readyChangeReq(first);
    fireEvent.click(within(first.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    expect(await within(first.getByRole('dialog', { name: '변경 요청' })).findByText(/접수 여부를 확인하지 못했습니다/)).toBeTruthy();
    first.unmount();

    const next = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    fireEvent.click(within(next.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2));
    const firstBody = mocks.write.mock.calls[0][0].body;
    const retryBody = mocks.write.mock.calls[1][0].body;
    expect(firstBody.requestKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(retryBody).toEqual(firstBody);
  });

  it('타임아웃 뒤 입력을 바꾸면 새 키를 보내고 원래 내용으로 되돌리면 첫 키로 재확인한다', async () => {
    const timeout = new ApiError('TIMEOUT', '서버 응답 시간이 초과되었습니다.', 0);
    mocks.write.mockRejectedValue(timeout);
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    readyChangeReq(view);
    const dialog = within(view.getByRole('dialog', { name: '변경 요청' }));
    const reason = dialog.getByRole('textbox', { name: '왜 바꾸나요' });
    const submit = dialog.getByRole('button', { name: '요청 넣기' });

    fireEvent.click(submit);
    await waitFor(() => expect(dialog.getByText(/접수 여부를 확인하지 못했습니다/)).toBeTruthy());
    const firstKey = mocks.write.mock.calls[0][0].body.requestKey;
    fireEvent.change(reason, { target: { value: '수정한 요청' } });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2));
    expect(mocks.write.mock.calls[1][0].body.requestKey).not.toBe(firstKey);

    await waitFor(() => expect(dialog.getByText(/접수 여부를 확인하지 못했습니다/)).toBeTruthy());
    fireEvent.change(reason, { target: { value: '첫 요청' } });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(3));
    expect(mocks.write.mock.calls[2][0].body.requestKey).toBe(firstKey);
  });

  it('이전 요청의 늦은 성공은 취소 후 다시 쓴 초안을 닫지 않는다', async () => {
    let resolve!: (value: { id: number; conflicts: [] }) => void;
    mocks.write.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    readyChangeReq(view);
    fireEvent.click(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    fireEvent.click(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '취소' }));
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    fireEvent.change(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('textbox', { name: '왜 바꾸나요' }),
      { target: { value: '새로 작성 중인 사유' } });

    await act(async () => resolve({ id: 9, conflicts: [] }));
    expect((within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('textbox', { name: '왜 바꾸나요' }) as HTMLInputElement).value)
      .toBe('새로 작성 중인 사유');
  });

  it('전송 중 취소·재열기는 서버 전송을 취소하지 않으며 이전 성공을 확인하기 전 재제출을 막는다', async () => {
    let resolve!: (value: { id: number; conflicts: [] }) => void;
    mocks.write.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    const ownerKey = readyChangeReq(view);
    fireEvent.click(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    fireEvent.click(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '취소' }));
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    const draft = useWorkspace.getState().drawer.draft!;
    act(() => useWorkspace.getState().setChangeReqDraft(ownerKey, {
      ...draft, serId: '41', onDate: '2026-09-25', startMin: '600', endMin: '660', reason: '새 요청',
    }));
    let dialog = within(view.getByRole('dialog', { name: '변경 요청' }));
    expect(dialog.getByText(/서버 전송을 멈추지 않습니다/)).toBeTruthy();
    expect(dialog.getByRole('button', { name: '보내는 중…' }).hasAttribute('disabled')).toBe(true);

    await act(async () => resolve({ id: 9, conflicts: [] }));
    dialog = within(view.getByRole('dialog', { name: '변경 요청' }));
    expect(dialog.getByText(/이전 변경 요청이 접수되었습니다/)).toBeTruthy();
    expect(dialog.getByRole('button', { name: '요청 넣기' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(dialog.getByRole('button', { name: '결과 확인' }));
    expect(dialog.getByRole('button', { name: '요청 넣기' }).hasAttribute('disabled')).toBe(false);
    expect(mocks.write).toHaveBeenCalledOnce();
  });

  it.each(['Escape', '창 닫기'])('전송 중 %s로 모달을 닫아도 재열기 때 중복 전송을 막는다', async (dismiss) => {
    let resolve!: (value: { id: number; conflicts: [] }) => void;
    mocks.write.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    readyChangeReq(view);
    fireEvent.click(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    if (dismiss === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else fireEvent.click(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '창 닫기' }));
    expect(view.queryByRole('dialog', { name: '변경 요청' })).toBeNull();

    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    const dialog = within(view.getByRole('dialog', { name: '변경 요청' }));
    expect(dialog.getByText(/서버 전송을 멈추지 않습니다/)).toBeTruthy();
    expect(dialog.getByRole('button', { name: '보내는 중…' }).hasAttribute('disabled')).toBe(true);
    expect(mocks.write).toHaveBeenCalledOnce();
    await act(async () => resolve({ id: 9, conflicts: [] }));
    expect(dialog.getByText(/이전 변경 요청이 접수되었습니다/)).toBeTruthy();
  });

  it('인증 상태를 비운 뒤 같은 계정에서 새로 쓴 초안도 이전 요청의 늦은 실패와 분리한다', async () => {
    let reject!: (error: unknown) => void;
    mocks.write.mockReturnValue(new Promise((_done, fail) => { reject = fail; }));
    const first = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    readyChangeReq(first);
    fireEvent.click(within(first.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '요청 넣기' }));
    first.unmount();
    useWorkspace.getState().clearDrawer();

    const next = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    fireEvent.click(next.getByRole('button', { name: '+ 변경 요청' }));
    fireEvent.change(within(next.getByRole('dialog', { name: '변경 요청' })).getByRole('textbox', { name: '왜 바꾸나요' }),
      { target: { value: '새 로그인 세션 초안' } });
    await act(async () => reject(new ApiError('OLD_ERROR', '이전 세션 오류', 409)));

    const dialog = within(next.getByRole('dialog', { name: '변경 요청' }));
    expect((dialog.getByRole('textbox', { name: '왜 바꾸나요' }) as HTMLInputElement).value).toBe('새 로그인 세션 초안');
    expect(dialog.queryByText('이전 세션 오류')).toBeNull();
  });

  it('라우트 전환으로 서랍 컴포넌트가 재마운트돼도 진행 중인 변경 요청 초안을 복원한다', () => {
    const first = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    fireEvent.click(first.getByRole('button', { name: '+ 변경 요청' }));
    fireEvent.change(within(first.getByRole('dialog', { name: '변경 요청' })).getByRole('textbox', { name: '왜 바꾸나요' }),
      { target: { value: '저장 전 초안' } });
    first.unmount();

    const next = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    expect((within(next.getByRole('dialog', { name: '변경 요청' })).getByRole('textbox', { name: '왜 바꾸나요' }) as HTMLInputElement).value)
      .toBe('저장 전 초안');
  });
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

  it('§19 창은 취소·Esc·X 뒤 다시 열면 이전 입력을 비우고, 닫힌 조회를 끈다 (P-157)', () => {
    const change = vi.fn();
    const close = vi.fn();
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={change} onClose={close} />);
    // 창이 닫혀 있으면 코드표·그날 일정을 부르지 않는다
    expect(mocks.meta).toHaveBeenLastCalledWith(false);
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    const dialog = view.getByRole('dialog', { name: '변경 요청' });
    expect(mocks.meta).toHaveBeenLastCalledWith(true);
    fireEvent.change(within(dialog).getByRole('textbox', { name: '왜 바꾸나요' }), { target: { value: '저장하지 않은 변경 사유' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(view.queryByRole('dialog', { name: '변경 요청' })).toBeNull();

    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    let reopened = within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('textbox', { name: '왜 바꾸나요' }) as HTMLInputElement;
    expect(reopened.value).toBe('');
    fireEvent.change(reopened, { target: { value: 'Esc 전에 쓴 사유' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(view.queryByRole('dialog', { name: '변경 요청' })).toBeNull();

    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    reopened = within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('textbox', { name: '왜 바꾸나요' }) as HTMLInputElement;
    expect(reopened.value).toBe('');
    fireEvent.change(reopened, { target: { value: 'X 전에 쓴 사유' } });
    fireEvent.click(within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('button', { name: '창 닫기' }));
    expect(view.queryByRole('dialog', { name: '변경 요청' })).toBeNull();

    fireEvent.click(view.getByRole('button', { name: '닫기' }));
    expect(close).toHaveBeenCalledOnce();
    view.rerender(<AppDrawer open={false} pane="chreqs" onPaneChange={change} onClose={close} />);
    expect(view.queryByRole('dialog')).toBeNull();
    // C38 — 서랍은 알림 조회 범위(기본 month)를 함께 넘긴다. 닫히면 여전히 조회를 끈다
    expect(mocks.drawer).toHaveBeenLastCalledWith(false, 'month');
    expect(mocks.meta).toHaveBeenLastCalledWith(false);
    view.rerender(<AppDrawer open pane="approvals" onPaneChange={change} onClose={close} />);
    expect(view.getByText('승인 내용')).toBeTruthy();
    view.rerender(<AppDrawer open pane="chreqs" onPaneChange={change} onClose={close} />);
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    expect((within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('textbox', { name: '왜 바꾸나요' }) as HTMLInputElement).value)
      .toBe('');
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('탭 02 서랍은 화면 전체가 아니라 셸이 준 칸에 붙는다 — 투명 클릭 받이·비모달 (g2 C-1)', () => {
    const view = render(<AppDrawer open pane="approvals" onPaneChange={() => undefined} onClose={() => undefined} />);
    const drawer = view.getByRole('dialog', { name: '승인 대기함' });
    expect(drawer.parentElement?.className).toContain('absolute');
    expect(drawer.parentElement?.className).not.toContain('fixed');
    expect(drawer.getAttribute('aria-modal')).toBeNull();
  });

  /* g2 대조 C-4 — 원문 서랍 머리는 어두운 바(머리줄 색) + 흰 제목 + × 이고, 부제가 없다(건수는 레일 배지가 말한다) */
  it('머리는 어두운 바에 흰 제목과 × 뿐이다 — 부제를 달지 않는다', () => {
    const view = render(<AppDrawer open pane="approvals" onPaneChange={() => undefined} onClose={() => undefined} />);
    const drawer = view.getByRole('dialog', { name: '승인 대기함' });
    const head = within(drawer).getByRole('heading', { name: '승인 대기함' });
    expect(head.className).toContain('text-white');
    expect(head.closest('header')!.className).toContain('bg-header');
    expect(within(drawer).queryByText(/안 읽은 알림|모든 시각/)).toBeNull();
    expect(within(drawer).getByRole('button', { name: '닫기' })).toBeTruthy();
  });

  /*
   * g2 대조 C-3 — 원문 서랍 안에는 칸 전환 줄이 없다. 레일이 그 일을 한다.
   * 레일이 없는 화면(운영의 결재 바로가기 등)에서는 서랍 안 줄이 유일한 전환 수단이라 남긴다.
   */
  it('레일이 떠 있으면 서랍 안 칸 전환 줄을 그리지 않고, 레일이 없으면 남긴다', () => {
    const drawerOnly = render(<AppDrawer open pane="approvals" onPaneChange={() => undefined} onClose={() => undefined} />);
    expect(drawerOnly.getByRole('navigation', { name: '서랍 메뉴' })).toBeTruthy();
    drawerOnly.unmount();
    const withRail = render(
      <>
        <AppDrawer open pane="approvals" onPaneChange={() => undefined} onClose={() => undefined} />
        <WorkspaceRail approvals={2} unread={0} onOpen={() => undefined} activePane="approvals" />
      </>,
    );
    expect(withRail.queryByRole('navigation', { name: '서랍 메뉴' })).toBeNull();
    expect(withRail.getByRole('navigation', { name: '워크스페이스 바로가기' })).toBeTruthy();
  });

  /* 원문 §19 창 머리 — 「변경 요청」 + 부제 + × */
  it('§19 창 머리에 부제와 × 가 서고, × 는 서랍을 닫지 않지만 초안은 비운다 (P-157)', () => {
    const close = vi.fn();
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={close} />);
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    const dialog = within(view.getByRole('dialog', { name: '변경 요청' }));
    expect(dialog.getByText(/겹치면 넣을 수 없습니다/)).toBeTruthy();
    fireEvent.change(dialog.getByRole('textbox', { name: '왜 바꾸나요' }), { target: { value: '초안 사유' } });
    fireEvent.click(dialog.getByRole('button', { name: '창 닫기' }));
    expect(view.queryByRole('dialog', { name: '변경 요청' })).toBeNull();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    expect((within(view.getByRole('dialog', { name: '변경 요청' })).getByRole('textbox', { name: '왜 바꾸나요' }) as HTMLInputElement).value)
      .toBe('');
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

/**
 * §19 변경 요청 넣기 — **「어느 일정」을 고른다** (g2 대조 19-2 · P0).
 *
 * 전에는 「수업 번호」 숫자를 직접 치게 했다 — 사용자는 SER id 를 알 수 없다.
 * 이제 「어느 날」(기본 오늘)의 일정을 시간표와 같은 질의로 받아 고르고, 보내는 계약(`serId`·`onDate`)은 그대로다.
 */
/*
 * N-84 — §14 처리가 성공해 서버가 되돌리기 토큰을 주면 상단바 「되돌리기」와 **같은 목록**에 쌓는다(`kind: 'approval'`).
 * 이름은 누른 줄의 사람 · 분류 그대로다. 토큰이 없는 처리(줌 계정 갈래)는 쌓지 않는다.
 */
describe('§14 결재 되돌리기 — 상단바 되돌리기 목록에 쌓는다', () => {
  const inboxRow = { kind: 'req', id: 1, byName: '이다현', categoryLabel: '시급 변경' };
  beforeEach(() => {
    useWorkspace.setState({ undoStack: [] });
    mocks.drawer.mockReturnValue({
      data: {
        approvals: { count: 1, inboxCount: 1, inbox: [inboxRow] }, notis: [], notiCategories: [], kinds: [], zoomAccounts: [],
        members: [], tz: 'Asia/Seoul', tzGroups: [], changeReqs: [],
      },
      isLoading: false, isError: false,
    });
  });

  it('토큰이 오면 「사람 · 분류 승인」 이름과 서버 만료 그대로 결재 갈래로 쌓는다', () => {
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    mocks.write.mockImplementation((_w: unknown, opts?: { onSuccess?: (res: unknown) => void }) => {
      opts?.onSuccess?.({ id: 1, state: 'approved', applied: null, undoToken: 'tok-1', undoExpiresAt: expiresAt });
    });
    const view = render(<AppDrawer open pane="approvals" onPaneChange={() => undefined} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '시험 승인' }));
    expect(mocks.write.mock.calls[0]![0]).toEqual({ kind: 'reqReview', id: 1, decision: 'approve', reason: undefined });
    expect(useWorkspace.getState().undoStack).toEqual([
      { token: 'tok-1', label: '이다현 · 시급 변경 승인', expiresAt, kind: 'approval' },
    ]);
  });

  it('토큰이 없는 처리는 쌓지 않는다 — 못 되돌리는 것을 되돌릴 수 있다고 말하지 않는다', () => {
    mocks.write.mockImplementation((_w: unknown, opts?: { onSuccess?: (res: unknown) => void }) => {
      opts?.onSuccess?.({ id: 1, state: 'approved', applied: '줌 계정 → A', undoToken: null, undoExpiresAt: null });
    });
    const view = render(<AppDrawer open pane="approvals" onPaneChange={() => undefined} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '시험 승인' }));
    expect(useWorkspace.getState().undoStack).toEqual([]);
  });
});

/* N-52 — 「변경 요청 · 이력」 칸 아래 「내 지출 신청」: 건수는 서랍이 센 값, 목록은 그 칸을 열 때만 읽는다 */
describe('서랍 「내 지출 신청」 (N-52)', () => {
  it('「변경 요청 · 이력」 칸에서만 목록을 읽고, 머리 건수는 서랍이 센 값 그대로다', () => {
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    const section = view.getByRole('region', { name: '내 지출 신청' });
    expect(section.textContent).toContain('심사 대기 1 · 반려 1');
    expect(mocks.myExpenses).toHaveBeenLastCalledWith(true);
    view.rerender(<AppDrawer open pane="kinds" onPaneChange={() => undefined} onClose={() => undefined} />);
    expect(view.queryByRole('region', { name: '내 지출 신청' })).toBeNull();
  });
});

/* 원문 §20 「최근 변경 이력」 — 스케줄 쓰기 감사 줄의 서버 문장 세 줄(누가 — 언제 · 앞 → 뒤 · 무엇을) (W11 A' 후속) */
describe('§20 「최근 변경 이력」', () => {
  it('요청 목록 아래 · 지출 신청 위에 서고, 서버 문장을 그대로 그린다 — 모르는 앞뒤는 「—」 · 칸을 열 때만 읽는다', () => {
    mocks.history.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        rows: [
          { id: 12, at: '2026-08-28T14:20:00+09:00', actorName: '김민선', summary: 'SAT Reading 8/28 → 20:00 이동 (이 주만)', from: null, to: '20:00' },
          { id: 11, at: '2026-08-27T09:05:00+09:00', actorName: '김범준', summary: 'Interview 8/28 휴강 (이 주만)', from: '수업', to: '휴강' },
        ],
      },
    });
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    const section = view.getByRole('region', { name: '최근 변경 이력' });
    const cards = within(section).getAllByRole('listitem').map((li) => [...li.children].map((c) => c.textContent));
    expect(cards).toEqual([
      ['김민선 — 8/28 14:20', '— → 20:00', 'SAT Reading 8/28 → 20:00 이동 (이 주만)'],
      ['김범준 — 8/27 09:05', '수업 → 휴강', 'Interview 8/28 휴강 (이 주만)'],
    ]);
    expect(mocks.history).toHaveBeenLastCalledWith(true, undefined);
    // 차례 — 변경 요청 목록 → 최근 변경 이력 → 내 지출 신청
    const expenses = view.getByRole('region', { name: '내 지출 신청' });
    expect(section.compareDocumentPosition(expenses) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.rerender(<AppDrawer open pane="kinds" onPaneChange={() => undefined} onClose={() => undefined} />);
    expect(view.queryByRole('region', { name: '최근 변경 이력' })).toBeNull();
  });

  it('줄이 없으면 빈 문장 한 줄이다', () => {
    mocks.history.mockReturnValue({ isLoading: false, isError: false, data: { rows: [] } });
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    expect(within(view.getByRole('region', { name: '최근 변경 이력' })).getByText('바뀐 일정이 없습니다')).toBeTruthy();
  });
});

describe('§19 변경 요청 창 — 어느 날 · 어느 일정 · 무엇을 · 왜', () => {
  const occ = (over: Partial<Occurrence>): Occurrence => ({
    serId: 41, date: '2026-09-25', onDate: '2026-09-25', startMin: 1200, endMin: 1260, kindKey: 'class', extra: false,
    subKey: 'map-read', title: null, teacherId: 7, teacherName: '김재훈', roomId: null, roomName: null, zaccId: null,
    mode: 'offline', canceled: false, hasException: false, recurring: true, repState: 'plan', ended: false,
    written: false, attendanceMode: 'unavailable', attendance: null, students: [],
    ...over,
  } as Occurrence);

  beforeEach(() => {
    // 오늘(KST)만 고정한다 — 타이머까지 가짜로 쓰면 testing-library 의 대기가 멈춘다
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T03:00:00Z')); // KST 2026-09-25 12:00
    mocks.meta.mockReturnValue({
      data: {
        staff: [{ id: 3, name: '김범준', title: null }], rooms: [], zaccs: [], kinds: [],
        subs: [{ key: 'map-read', name: 'MAP Reading', color: 'var(--sub-map-read)' }],
      },
    });
    mocks.occ.mockReturnValue({
      isLoading: false,
      data: {
        from: '2026-09-25', to: '2026-09-25',
        items: [
          // 9/24 회차를 9/25 20:00 으로 옮긴 것 — 그려지는 날(date)과 원래 날(onDate)이 다르다
          occ({ serId: 41, date: '2026-09-25', onDate: '2026-09-24' }),
          occ({ serId: 7, startMin: 600, endMin: 660, subKey: null, title: '자습실', canceled: true }),
        ],
      },
    });
  });
  afterEach(() => vi.useRealTimers());

  function openDialog() {
    const view = render(<AppDrawer open pane="chreqs" onPaneChange={() => undefined} onClose={() => undefined} />);
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    return { view, dialog: within(view.getByRole('dialog', { name: '변경 요청' })) };
  }

  it('어느 날은 오늘로 열리고 그날 일정을 시간표 질의로 부른다 — 수업 번호를 치는 칸은 없다', () => {
    const { dialog } = openDialog();
    expect((dialog.getByLabelText(/어느 날/) as HTMLInputElement).value).toBe('2026-09-25');
    expect(mocks.occ).toHaveBeenLastCalledWith({ from: '2026-09-25', to: '2026-09-25' }, true);
    expect(dialog.queryByPlaceholderText('예: 12')).toBeNull();
    expect(dialog.queryByText('수업 번호')).toBeNull();
    const pick = dialog.getByRole('combobox', { name: '어느 일정' });
    const options = within(pick).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      '고르세요', '10:00–11:00 · 자습실 · 김재훈 · 휴강', '20:00–21:00 · MAP Reading · 김재훈',
    ]);
    // 휴강한 회차는 보이되 고를 수 없다
    expect((options[1] as HTMLOptionElement).disabled).toBe(true);
    // 원문 차례 — 어느 날 → 어느 일정 → 무엇을 → 왜 바꾸나요
    const order = ['어느 날', '어느 일정', '무엇을', '왜 바꾸나요']
      .map((name) => dialog.getByText(name, { selector: 'label' }));
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('고른 일정의 두 키(serId · 원래 날)로 보내고, 시:분 입력은 분으로 옮긴다 — 계약 불변', async () => {
    mocks.write.mockResolvedValue({ id: 9, conflicts: [] });
    const { view, dialog } = openDialog();
    const submit = dialog.getByRole('button', { name: '요청 넣기' });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.change(dialog.getByRole('combobox', { name: '어느 일정' }), { target: { value: '41|2026-09-24' } });
    expect(dialog.getByRole('button', { name: '시간 옮기기' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(dialog.getByLabelText('새 시작'), { target: { value: '20:30' } });
    fireEvent.change(dialog.getByLabelText('새 끝'), { target: { value: '21:30' } });
    fireEvent.change(dialog.getByRole('textbox', { name: '왜 바꾸나요' }), { target: { value: '어머니 요청' } });
    expect(submit.hasAttribute('disabled')).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.write).toHaveBeenCalledWith({
      kind: 'changeReq',
      body: {
        reqType: 'time_move', serId: 41, onDate: '2026-09-24', startMin: 1230, endMin: 1290,
        reason: '어머니 요청', applyAll: undefined,
        requestKey: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      },
    }));
    // 넣었으면 창이 닫히고 칸이 알린다
    await waitFor(() => expect(view.queryByRole('dialog', { name: '변경 요청' })).toBeNull());
    expect(view.getByText(/요청을 넣었습니다/)).toBeTruthy();
    // 새 초안은 다시 오늘로 열린다
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    const again = within(view.getByRole('dialog', { name: '변경 요청' }));
    expect((again.getByRole('combobox', { name: '어느 일정' }) as HTMLSelectElement).value).toBe('');
    expect((again.getByLabelText(/어느 날/) as HTMLInputElement).value).toBe('2026-09-25');
  });

  it('날을 바꾸면 고른 일정이 비고 그날로 다시 묻는다', () => {
    const { dialog } = openDialog();
    const pick = dialog.getByRole('combobox', { name: '어느 일정' }) as HTMLSelectElement;
    fireEvent.change(pick, { target: { value: '41|2026-09-24' } });
    expect(pick.value).toBe('41|2026-09-24');
    fireEvent.change(dialog.getByLabelText(/어느 날/), { target: { value: '2026-09-26' } });
    expect(pick.value).toBe('');
    expect(mocks.occ).toHaveBeenLastCalledWith({ from: '2026-09-26', to: '2026-09-26' }, true);
    // 날을 비우면 부르지 않는다 — 조각 날짜로 묻지 않는다
    fireEvent.change(dialog.getByLabelText(/어느 날/), { target: { value: '' } });
    expect(mocks.occ.mock.lastCall?.[1]).toBe(false);
  });

  it('무엇을은 칩 넷이다 — 강사 쪽을 누르면 바꿀 강사 칸이 선다', () => {
    const { dialog } = openDialog();
    const group = within(dialog.getByRole('group', { name: '무엇을' }));
    expect(group.getAllByRole('button').map((b) => b.textContent)).toEqual(['시간 옮기기', '강사 바꾸기', '강의실 바꾸기', '휴강']);
    fireEvent.click(group.getByRole('button', { name: '강사 바꾸기' }));
    expect(group.getByRole('button', { name: '강사 바꾸기' }).getAttribute('aria-pressed')).toBe('true');
    expect(dialog.getByLabelText('바꿀 강사')).toBeTruthy();
    expect(dialog.queryByLabelText('새 시작')).toBeNull();
  });

  it('겹치면 창을 닫지 않고 누구와 겹치는지 창 안에서 말한다', async () => {
    mocks.write.mockResolvedValue({
      id: null,
      conflicts: [{ serId: 12, onDate: '2026-09-24', startMin: 1230, endMin: 1290, title: 'SAT Math', with: 'teacher', whoName: '김재훈' }],
    });
    const { view, dialog } = openDialog();
    fireEvent.change(dialog.getByRole('combobox', { name: '어느 일정' }), { target: { value: '41|2026-09-24' } });
    fireEvent.change(dialog.getByLabelText('새 시작'), { target: { value: '20:30' } });
    fireEvent.change(dialog.getByLabelText('새 끝'), { target: { value: '21:30' } });
    fireEvent.change(dialog.getByRole('textbox', { name: '왜 바꾸나요' }), { target: { value: '어머니 요청' } });
    fireEvent.click(dialog.getByRole('button', { name: '요청 넣기' }));
    await waitFor(() => expect(dialog.getByText(/1건과 겹칩니다/)).toBeTruthy());
    expect(view.getByRole('dialog', { name: '변경 요청' })).toBeTruthy();

    fireEvent.click(dialog.getByRole('button', { name: '취소' }));
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    const reopened = within(view.getByRole('dialog', { name: '변경 요청' }));
    expect(reopened.queryByText(/1건과 겹칩니다/)).toBeNull();
    expect((reopened.getByRole('textbox', { name: '왜 바꾸나요' }) as HTMLInputElement).value).toBe('');
  });

  it('서버 오류 뒤 취소하고 다시 열면 오류와 초안을 비운다 (P-157)', async () => {
    mocks.write.mockRejectedValue(new ApiError('CHANGE_REQUEST_FAILED', '변경 요청을 넣지 못했습니다', 409));
    const { view, dialog } = openDialog();
    fireEvent.change(dialog.getByRole('combobox', { name: '어느 일정' }), { target: { value: '41|2026-09-24' } });
    fireEvent.change(dialog.getByLabelText('새 시작'), { target: { value: '20:30' } });
    fireEvent.change(dialog.getByLabelText('새 끝'), { target: { value: '21:30' } });
    fireEvent.change(dialog.getByRole('textbox', { name: '왜 바꾸나요' }), { target: { value: '오류가 난 초안' } });
    fireEvent.click(dialog.getByRole('button', { name: '요청 넣기' }));
    await waitFor(() => expect(dialog.getByText('변경 요청을 넣지 못했습니다')).toBeTruthy());

    fireEvent.click(dialog.getByRole('button', { name: '취소' }));
    fireEvent.click(view.getByRole('button', { name: '+ 변경 요청' }));
    const reopened = within(view.getByRole('dialog', { name: '변경 요청' }));
    expect(reopened.queryByText('변경 요청을 넣지 못했습니다')).toBeNull();
    expect((reopened.getByRole('textbox', { name: '왜 바꾸나요' }) as HTMLInputElement).value).toBe('');
  });
});
