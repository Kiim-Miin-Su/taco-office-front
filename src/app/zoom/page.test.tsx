/** @file-guide
 * 목적: §21 목적지 「줌 계정 관리」 — 서버가 센 값을 그대로 그리고, 비밀은 화면에 오지 않는다 (C48).
 * 책임/재사용: 실제 ZoomAccountsPage/useZoom 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/api/client';
import type { Me, ZoomBoard } from '@/api/types';
import { useSession } from '@/store/useSession';
import { RouteAccess } from '@/components/shell/RequireAuth';
import ZoomAccountsPage from './page';

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/zoom', useRouter: () => nav }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const board: ZoomBoard = {
  onDate: '2026-08-21', fromHour: 8, toHour: 21,
  accounts: [
    { id: 1, label: 'Boarding', loginEmail: 'a@tn.kr', joinUrl: 'https://zoom.us/j/1', meetingId: '111 2222', active: true, usedCount: 3, hasSecret: true },
    { id: 2, label: 'Study', loginEmail: 'b@tn.kr', joinUrl: 'https://zoom.us/j/2', meetingId: null, active: false, usedCount: 0, hasSecret: false },
  ],
  rows: [
    { zaccId: 1, label: 'Boarding', slots: Array.from({ length: 14 }, (_, i) => ({ hour: 8 + i, busy: i === 2 ? 1 : 0 })) },
  ],
  nowHour: 10, freeNow: 5, freeLabels: ['Boarding', 'Consulting', 'TN', 'Study', 'Jkim'], fullHours: 1,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  vi.restoreAllMocks();
  nav.replace.mockClear(); nav.push.mockClear();
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

function setup(data: ZoomBoard = board, access?: { viewer: Me; guarded: true }, onRender?: ProfilerOnRenderCallback) {
  useSession.getState().signIn('fixture', access?.viewer ?? me);
  api.defaults.adapter = (async (config: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const page = access?.guarded
    ? <RouteAccess><ZoomAccountsPage /></RouteAccess>
    : <ZoomAccountsPage />;
  return render(<QueryClientProvider client={client}>{onRender
    ? <Profiler id="zoom-account-page" onRender={onRender}>{page}</Profiler>
    : page}</QueryClientProvider>);
}

it('머리 숫자는 서버가 센 값을 그대로 쓴다 — 화면이 다시 세지 않는다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('a@tn.kr')).toBeTruthy());
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('5개');   // 지금 가능
  expect(text).toContain('만석 시간대');  // 단위 없이 숫자만 — 컷의 「1」
  expect(text).toContain('2개');   // 계정 수 (꺼진 것 포함)
  expect(text).toContain('2026-08-21');
});

it('비밀은 **저장돼 있는가**만 말한다 — 값은 어디에도 없다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('a@tn.kr')).toBeTruthy());
  expect(view.getByText('저장됨')).toBeTruthy();
  expect(view.getByText('없음')).toBeTruthy();
  expect(JSON.stringify(board)).not.toContain('loginSecret');
});

it('꺼진 계정도 목록에 남는다 — 이미 붙은 회차가 있기 때문이다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('b@tn.kr')).toBeTruthy());
  expect(view.getByText('꺼짐')).toBeTruthy();
  expect(view.getByRole('button', { name: '켜기' })).toBeTruthy();
});

it('격자는 서버가 준 시간 범위를 그대로 쓴다 — 8시부터 21시까지 14칸', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('a@tn.kr')).toBeTruthy());
  const grid = view.container.querySelectorAll('table')[0];
  const heads = [...grid.querySelectorAll('th')].map((h) => h.textContent);
  expect(heads).toEqual(['계정', ...Array.from({ length: 14 }, (_, i) => String(8 + i).padStart(2, '0'))]);
});

it('참가 링크는 펼쳐야 보인다 — 서랍(§21)이 격자가 되면서 옮겨 온 자리다 (C72)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('a@tn.kr')).toBeTruthy());
  expect(view.container.textContent).not.toContain('https://zoom.us/j/1');
  fireEvent.click(view.getAllByRole('button', { name: '보기' })[0]);
  expect(view.container.textContent).toContain('https://zoom.us/j/1');
  fireEvent.click(view.getAllByRole('button', { name: '숨기기' })[0]);
  expect(view.container.textContent).not.toContain('https://zoom.us/j/1');
});

it('지금 쓸 수 있는 계정 이름은 서버가 준 그대로다 — 화면이 격자를 보고 고르지 않는다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('a@tn.kr')).toBeTruthy());
  // 격자에 그려진 계정은 Boarding 하나뿐인데, 이름줄은 서버가 준 다섯을 그대로 적는다
  expect((view.container.textContent ?? '').replace(/\s+/g, ' '))
    .toContain('지금 쓸 수 있는 계정 — Boarding · Consulting · TN · Study · Jkim');
});

it('오늘이 아닌 날은 「지금 가능」을 비운다', async () => {
  const view = setup({ ...board, nowHour: null, freeNow: 0, freeLabels: [] });
  await waitFor(() => expect(view.getByText('a@tn.kr')).toBeTruthy());
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('오늘만 셉니다');
  expect(text).not.toContain('지금 쓸 수 있는 계정');
});

it('추가에서 고치기로 전환하면 같은 여섯 입력만 보이고 이전 비밀 초안을 버린다', async () => {
  const view = setup();
  await view.findByText('a@tn.kr');
  fireEvent.click(view.getByRole('button', { name: '+ 계정 추가' }));
  fireEvent.change(view.getByLabelText('로그인 비밀'), { target: { value: 'unsaved-fixture' } });
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[0]);
  expect(view.queryByRole('button', { name: '만들기' })).toBeNull();
  expect(view.container.querySelectorAll('input')).toHaveLength(7); // 기준일 + 공용 6필드
  expect((view.getByLabelText('로그인 비밀') as HTMLInputElement).value).toBe('');
  fireEvent.click(view.getByRole('button', { name: '취소' }));
  fireEvent.click(view.getByRole('button', { name: '+ 계정 추가' }));
  expect((view.getByLabelText('이름') as HTMLInputElement).value).toBe('');
});

it('긴 목록의 마지막 계정에서 고치기를 누르면 이름 입력으로 초점을 옮긴다', async () => {
  const accounts = Array.from({ length: 16 }, (_, index) => ({
    ...board.accounts[0], id: index + 1, label: `Account ${index + 1}`, loginEmail: `account${index + 1}@example.test`,
  }));
  const view = setup({ ...board, accounts });
  await view.findByText('account16@example.test');
  const edit = view.getAllByRole('button', { name: '고치기' }).at(-1)!;
  edit.focus();
  expect(document.activeElement).toBe(edit);
  fireEvent.click(edit);
  const name = view.getByLabelText('이름') as HTMLInputElement;
  expect(name.value).toBe('Account 16');
  expect(document.activeElement).toBe(name);
  expect(view.container.querySelectorAll('input')).toHaveLength(7);
});

it.each(['이름', '로그인 계정', '참가 링크'])('고치기에서도 필수 %s가 공백이면 요청하지 않는다', async (label) => {
  const view = setup();
  await view.findByText('a@tn.kr');
  const patch = vi.spyOn(api, 'patch');
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[0]);
  fireEvent.change(view.getByLabelText(label), { target: { value: '   ' } });
  expect((view.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  expect(patch).not.toHaveBeenCalled();
});

it('편집 실패 초안을 보존하고 재시도 시 회의 ID 비우기와 비밀 생략을 그대로 전송한다', async () => {
  const view = setup();
  await view.findByText('a@tn.kr');
  const patch = vi.spyOn(api, 'patch').mockRejectedValueOnce(new ApiError('DUPLICATE', '같은 이름이 있습니다', 409))
    .mockResolvedValueOnce({ data: board.accounts[0] });
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[0]);
  fireEvent.change(view.getByLabelText('이름'), { target: { value: ' 새 계정 ' } });
  fireEvent.change(view.getByLabelText('회의 ID'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await view.findByText('같은 이름이 있습니다');
  expect((view.getByLabelText('이름') as HTMLInputElement).value).toBe(' 새 계정 ');
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(view.queryByLabelText('이름')).toBeNull());
  expect(patch).toHaveBeenLastCalledWith('/zoom/accounts/1', {
    label: '새 계정', loginEmail: 'a@tn.kr', joinUrl: 'https://zoom.us/j/1', meetingId: '',
  });
});

it('편집창을 열지 않은 활성 변경 실패도 보이고 다시 시도할 수 있다', async () => {
  const view = setup();
  await view.findByText('a@tn.kr');
  const patch = vi.spyOn(api, 'patch').mockRejectedValueOnce(new ApiError('FAILED', '계정 상태를 저장하지 못했습니다', 500))
    .mockResolvedValueOnce({ data: board.accounts[0] });
  fireEvent.click(view.getByRole('button', { name: '끄기' }));
  await view.findByText('계정 상태를 저장하지 못했습니다');
  fireEvent.click(view.getByRole('button', { name: '끄기' }));
  await waitFor(() => expect(view.queryByText('계정 상태를 저장하지 못했습니다')).toBeNull());
  expect(patch).toHaveBeenLastCalledWith('/zoom/accounts/1', { active: false });
});

it.each([
  [false, false], [true, false], [false, true], [true, true],
])('실제 RouteAccess는 관리=%s·쓰기=%s 조합으로 조회와 입력을 함께 방어한다', async (canAdminPage, canCrudAll) => {
  const get = vi.spyOn(api, 'get');
  const view = setup(board, { viewer: { ...me, canAdminPage, canCrudAll }, guarded: true });
  if (canAdminPage && canCrudAll) {
    await view.findByText('a@tn.kr');
    expect(view.getByRole('button', { name: '+ 계정 추가' })).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/zoom', expect.anything());
    expect(nav.replace).not.toHaveBeenCalled();
  } else {
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/schedule'));
    expect(view.queryByRole('button', { name: '+ 계정 추가' })).toBeNull();
    expect(view.queryByText('a@tn.kr')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  }
});

it.each(['canAdminPage', 'canCrudAll'] as const)('열린 계정 폼에서 %s 회수 시 비밀 초안을 폐기하고 복구 후 재사용하지 않는다', async (flag) => {
  const view = setup(board, { viewer: me, guarded: true });
  await view.findByText('a@tn.kr');
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[0]);
  fireEvent.change(view.getByLabelText('로그인 비밀'), { target: { value: 'discard-on-revoke' } });
  const post = vi.spyOn(api, 'post');
  const patch = vi.spyOn(api, 'patch');
  act(() => useSession.getState().setMe({ ...me, [flag]: false }));
  expect(view.queryByLabelText('로그인 비밀')).toBeNull();
  expect(view.queryByText('a@tn.kr')).toBeNull();
  expect(nav.replace).toHaveBeenCalledWith('/schedule');
  expect(post).not.toHaveBeenCalled();
  expect(patch).not.toHaveBeenCalled();
  act(() => useSession.getState().setMe(me));
  await view.findByText('a@tn.kr');
  expect(view.queryByLabelText('로그인 비밀')).toBeNull();
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[0]);
  expect((view.getByLabelText('로그인 비밀') as HTMLInputElement).value).toBe('');
});

it.each([false, true])('생성 payload는 필수값을 다듬고 비밀은 입력 여부=%s에 따라 원문 또는 생략으로 보낸다', async (withSecrets) => {
  const view = setup();
  await view.findByText('a@tn.kr');
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: board.accounts[0] });
  fireEvent.click(view.getByRole('button', { name: '+ 계정 추가' }));
  fireEvent.change(view.getByLabelText('이름'), { target: { value: ' 새 계정 ' } });
  fireEvent.change(view.getByLabelText('로그인 계정'), { target: { value: ' new@example.test ' } });
  fireEvent.change(view.getByLabelText('참가 링크'), { target: { value: 'https://example.test/join' } });
  if (withSecrets) {
    fireEvent.change(view.getByLabelText('로그인 비밀'), { target: { value: ' secret with spaces ' } });
    fireEvent.change(view.getByLabelText('회의 비밀번호'), { target: { value: ' room password ' } });
  }
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(view.queryByLabelText('이름')).toBeNull());
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/zoom/accounts', {
    label: '새 계정', loginEmail: 'new@example.test', joinUrl: 'https://example.test/join', meetingId: '',
    ...(withSecrets ? { loginSecret: ' secret with spaces ', meetingPw: ' room password ' } : {}),
  });
});

it('저장 중에는 폼·취소·모드전환·활성변경을 잠그고 늦은 응답이 다른 초안을 닫지 않는다', async () => {
  const view = setup();
  await view.findByText('a@tn.kr');
  let finish!: () => void;
  const patch = vi.spyOn(api, 'patch').mockImplementation(() => new Promise((resolve) => {
    finish = () => resolve({ data: board.accounts[0] });
  }));
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[0]);
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  // React Query의 pending 렌더 전에도 다른 초안으로 전환하지 않는다.
  fireEvent.click(view.getByRole('button', { name: '+ 계정 추가' }));
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[1]);
  fireEvent.click(view.getByRole('button', { name: '취소' }));
  await waitFor(() => expect((view.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true));
  expect((view.container.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  for (const label of ['취소', '+ 계정 추가', '끄기', '켜기']) {
    const button = view.getByRole('button', { name: label }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
  }
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[1]);
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  expect(patch).toHaveBeenCalledTimes(1);
  expect((view.getByLabelText('로그인 계정') as HTMLInputElement).value).toBe('a@tn.kr');
  await act(async () => finish());
  await waitFor(() => expect(view.queryByLabelText('이름')).toBeNull());
});

it.each(['create', 'active'] as const)('%s 연속 클릭은 한 번 저장하고 실패 뒤 잠금을 풀어 재시도한다', async (kind) => {
  const view = setup();
  await view.findByText('a@tn.kr');
  let rejectFirst!: () => void;
  const response = new Promise<never>((_, reject) => {
    rejectFirst = () => reject(new ApiError('FAILED', '저장 실패 — 재시도', 500));
  });
  const write = kind === 'create'
    ? vi.spyOn(api, 'post').mockReturnValueOnce(response).mockResolvedValueOnce({ data: board.accounts[0] })
    : vi.spyOn(api, 'patch').mockReturnValueOnce(response).mockResolvedValueOnce({ data: board.accounts[0] });
  if (kind === 'create') {
    fireEvent.click(view.getByRole('button', { name: '+ 계정 추가' }));
    fireEvent.change(view.getByLabelText('이름'), { target: { value: '새 계정' } });
    fireEvent.change(view.getByLabelText('로그인 계정'), { target: { value: 'new@example.test' } });
    fireEvent.change(view.getByLabelText('참가 링크'), { target: { value: 'https://example.test/join' } });
    fireEvent.change(view.getByLabelText('로그인 비밀'), { target: { value: 'retry-fixture' } });
  }
  const buttonName = kind === 'create' ? '만들기' : '끄기';
  fireEvent.click(view.getByRole('button', { name: buttonName }));
  fireEvent.click(view.getByRole('button', { name: buttonName }));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  await act(async () => rejectFirst());
  await view.findByText('저장 실패 — 재시도');
  expect((view.getByRole('button', { name: buttonName }) as HTMLButtonElement).disabled).toBe(false);
  if (kind === 'create') expect((view.getByLabelText('로그인 비밀') as HTMLInputElement).value).toBe('retry-fixture');
  fireEvent.click(view.getByRole('button', { name: buttonName }));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(view.queryByText('저장 실패 — 재시도')).toBeNull());
  if (kind === 'create') expect(view.queryByLabelText('이름')).toBeNull();
});

it('실제 Profiler에서 계정 이름 입력 한 번은 페이지 commit 1회·추가 GET 0회다', async () => {
  const commits: string[] = [];
  const get = vi.spyOn(api, 'get');
  const view = setup(board, undefined, (_id, phase) => { commits.push(phase); });
  await view.findByText('a@tn.kr');
  fireEvent.click(view.getByRole('button', { name: '+ 계정 추가' }));
  await act(async () => {});
  const before = { commits: commits.length, gets: get.mock.calls.length };
  fireEvent.change(view.getByLabelText('이름'), { target: { value: '측정용 계정' } });
  await act(async () => {});
  const measured = { pageCommits: commits.length - before.commits, additionalGets: get.mock.calls.length - before.gets };
  expect(measured).toEqual({ pageCommits: 1, additionalGets: 0 });
  console.info('S3-a non-secret account-name input measured', measured);
});
