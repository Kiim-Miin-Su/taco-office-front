/** @file-guide
 * 목적: 대표 보고 4뷰와 §73 결재함 — 이동만(N-12)·살펴볼 것 합계·x/6 기재 회귀.
 * 책임/재사용: 실제 ExecPage/useExec 를 쓰고 셸의 다른 조회만 어댑터로 막는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Exec, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import ExecPage from './page';

const nav = vi.hoisted(() => ({ push: vi.fn(), search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};

const data: Exec = {
  from: '2026-08-21', to: '2026-08-21',
  stats: [{ key: 'lessons', label: '진행한 수업', value: 20, unit: '회', money: false }],
  reports: [],
  areas: [
    { key: 'money', label: '회계', review: '납부 기한이 지난 청구서 수', count: 2, go: '/accounting' },
    { key: 'mkt', label: '마케팅', review: '없음 (정보성)', count: 0, go: '/ops' },
    { key: 'ops', label: '운영', review: '결재 대기 + 기한 지난 할 일', count: 1, go: '/ops' },
    { key: 'consulting', label: '컨설팅', review: '수납 전이라 진행이 잠긴 계약', count: 1, go: '/consulting' },
    { key: 'complaint', label: '컴플레인', review: '아직 안 끝난 건', count: 2, go: '/ops' },
    { key: 'lesson', label: '수업', review: '교재·안내·줌·리포트가 덜 된 수업', count: 17, go: '/board' },
  ],
  reviewCount: 23,
  filled: 0,
  inbox: [
    { id: 1, rptType: 'day', onDate: '2026-08-21', label: '26년 8월 21일 금요일', state: 'draft', apState: 'waiting', filled: 0, reviewCount: 23, rejectReason: null, go: 'day' },
    { id: 2, rptType: 'week', onDate: '2026-08-17', label: '08-17 ~ 08-23', state: 'rej', apState: 'back', filled: 2, reviewCount: 49, rejectReason: '숫자만으로는 모를 것', go: 'week' },
  ],
  canSeeAmounts: true,
  computedAt: '2026-08-21T00:00:00.000Z',
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); nav.push.mockClear(); nav.search = '';
});

function setup() {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = vi.fn(async (config) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return { ...render(<QueryClientProvider client={client}><ExecPage /></QueryClientProvider>), client };
}

it('머리의 살펴볼 것은 6영역 배지의 합이고, 정보성 영역은 ✓ 로 보인다 (§69 — 23 = 2+0+1+1+2+17)', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('살펴볼 것 23'));
  expect(view.container.textContent).toContain('담당 0/6 기재');
  const sum = data.areas.reduce((a, x) => a + x.count, 0);
  expect(sum).toBe(data.reviewCount);
  // 마케팅은 0 이라 숫자 대신 ✓
  expect(view.getByRole('button', { name: /마케팅/ }).textContent).toContain('✓');
});

it('영역을 누르면 그 화면으로 간다 — 대표 보고 안에서 처리하지 않는다 (D-R27)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: /회계/ })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: /회계/ }));
  expect(nav.push).toHaveBeenCalledWith('/accounting');
});

it('결재함은 되돌아온 것을 먼저 보이고 사유를 그대로 적는다 (§75 순서)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: /결재함/ })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: /결재함/ }));
  expect(view.container.textContent).toContain('되돌아온 것 · 1건');
  expect(view.container.textContent).toContain('숫자만으로는 모를 것');
  expect(view.container.textContent).toContain('2/6 적음');
  // N-12 — 결재함에는 승인·반려가 없다
  expect(view.queryByRole('button', { name: '승인' })).toBeNull();
  expect(view.queryByRole('button', { name: '반려' })).toBeNull();
});

it('결재함 줄을 누르면 그 기간의 보고로 이동만 한다 (N-12)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: /결재함/ })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: /결재함/ }));
  fireEvent.click(view.getByRole('button', { name: /08-17 ~ 08-23/ }));
  await waitFor(() => expect(view.container.textContent).toContain('08-17 ~ 08-23'));
  // 주간 뷰로 옮겨 왔다 — 기간 내비가 보인다
  expect(view.getByRole('button', { name: '오늘' })).toBeTruthy();
  expect(nav.push).not.toHaveBeenCalled();
});

it('§75 report deep link의 view/date를 초기화하고 브라우저 URL 변경에도 동기화한다', async () => {
  nav.search = 'view=week&date=2026-08-17&rpt=2';
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('08-17 ~ 08-23'));
  expect(view.getByRole('button', { name: /주간/ }).getAttribute('aria-pressed')).toBe('true');

  nav.search = 'view=month&date=2026-09-01&rpt=3';
  view.rerender(<QueryClientProvider client={view.client}><ExecPage /></QueryClientProvider>);
  await waitFor(() => expect(view.container.textContent).toContain('2026년 9월'));
  expect(view.getByRole('button', { name: /월간/ }).getAttribute('aria-pressed')).toBe('true');
});

/* ══ §69 쓰기 — 「숫자만으로는 모를 것」과 서명 (C85-a) ══════════════ */

/** GET 은 고정 응답, 쓰기는 **기록만** 하고 같은 모양을 돌려준다 */
function setupWrite(seed: Partial<Exec> = {}, who: Me = me) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  useSession.getState().signIn('fixture', who);
  api.defaults.adapter = vi.fn(async (config) => {
    const method = (config.method ?? 'get').toLowerCase();
    if (method !== 'get') {
      calls.push({ method, url: config.url ?? '', body: config.data ? JSON.parse(String(config.data)) : null });
      return { config, status: 200, statusText: 'OK', headers: {},
        data: { id: 1, state: 'sent', onDate: '2026-08-21', filled: 1, sentByName: '대표', reviewedByName: null } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: { ...data, ...seed } };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return { ...render(<QueryClientProvider client={client}><ExecPage /></QueryClientProvider>), calls };
}

it('여섯 칸은 서버가 준 순서·낱말 그대로 서고, 적으면 「담당 x/6」이 따라 센다', async () => {
  const view = setupWrite();
  await waitFor(() => expect(view.getByRole('textbox', { name: '회계 메모' })).toBeTruthy());
  // 순서는 대표 관심순 고정 (D-R25) — 화면이 목록을 만들지 않는다
  const labels = view.getAllByPlaceholderText('숫자만으로는 모를 것');
  expect(labels.length).toBe(6);
  expect(view.container.textContent).toContain('담당 0/6 기재');

  fireEvent.change(view.getByRole('textbox', { name: '회계 메모' }), { target: { value: '기한 지난 청구서 2건' } });
  expect(view.container.textContent).toContain('담당 1/6 기재');
});

it('하나도 안 적으면 올릴 수 없다 (D-R14) — 숫자는 이 화면이 이미 보여 준다', async () => {
  const view = setupWrite();
  await waitFor(() => expect(view.getByRole('textbox', { name: '운영 메모' })).toBeTruthy());
  expect(view.getByRole('button', { name: '대표께 올리기' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(view.getByRole('textbox', { name: '운영 메모' }), { target: { value: '한 줄' } });
  expect(view.getByRole('button', { name: '대표께 올리기' }).hasAttribute('disabled')).toBe(false);
});

it('올리기는 적은 것을 **먼저 저장하고** 올린다 — 화면의 초안이 서버에 없으면 빈 보고로 막힌다', async () => {
  const view = setupWrite();
  await waitFor(() => expect(view.getByRole('textbox', { name: '회계 메모' })).toBeTruthy());
  fireEvent.change(view.getByRole('textbox', { name: '회계 메모' }), { target: { value: '한 줄' } });
  fireEvent.click(view.getByRole('button', { name: '대표께 올리기' }));

  await waitFor(() => expect(view.calls.length).toBe(2));
  expect(view.calls[0]).toMatchObject({ method: 'patch', url: '/exec/report' });
  // 여섯 칸을 다 보낸다 — 서버가 보낸 칸만 합치므로 안 적은 칸도 그대로 간다
  expect((view.calls[0].body as { memos: unknown[] }).memos.length).toBe(6);
  expect(view.calls[1]).toMatchObject({ method: 'post', url: '/exec/report/submit' });
});

/**
 * 결재 단추가 서는 조건은 **서버가 한 줄로 준다** (`canReview`). 화면이 역할과 상태를 다시
 * 조합하면 조건이 늘어날 때마다 두 답이 생긴다 — 실제로 2026-09-20 에 「내가 올린 보고는
 * 내가 결재하지 못한다」가 서버에 붙었고, 조합하던 화면은 그것을 알 길이 없었다 (D-R39 · S1).
 */
it('결재 단추는 서버가 준 canReview 하나로 선다 (§73)', async () => {
  const report = (canReview: boolean): Partial<Exec> => ({
    reports: [{
      id: 7, rptType: 'day', onDate: '2026-08-21', state: 'sent', memo: '',
      memos: data.areas.map((a) => ({ key: a.key as 'money', memo: a.key === 'money' ? '한 줄' : '' })),
      filled: 1, sentAt: null, reviewedAt: null, rejectReason: null,
      sentByName: '김민수', reviewedByName: null, canReview,
    }],
  });
  const ceo = setupWrite(report(true));
  await waitFor(() => expect(ceo.container.textContent).toContain('올라온 보고입니다'));
  expect(ceo.getByRole('button', { name: '승인' })).toBeTruthy();
  // 반려는 사유가 있어야 눌린다 (D-R13)
  expect(ceo.getByRole('button', { name: '반려' }).hasAttribute('disabled')).toBe(true);
  expect(ceo.container.textContent).toContain('올린 사람');
  expect(ceo.container.textContent).toContain('김민수');
  cleanup();

  // 서버가 닫으면 화면도 닫는다 — 권한이 없을 때도, 내가 올린 보고일 때도 같은 false 하나다
  const manager: Me = { ...me, role: 'manager', roleLabel: '매니저', canSeeProfit: false, canMoney: false };
  const mgr = setupWrite(report(false), manager);
  await waitFor(() => expect(mgr.getByRole('textbox', { name: '회계 메모' })).toBeTruthy());
  expect(mgr.queryByText('올라온 보고입니다 — 결재해 주세요')).toBeNull();
  expect(mgr.queryByRole('button', { name: '승인' })).toBeNull();
  cleanup();

  // 대표여도 자기가 올린 보고면 서버가 false 를 준다 — 화면은 역할을 다시 묻지 않는다
  const mine = setupWrite(report(false));
  await waitFor(() => expect(mine.getByRole('textbox', { name: '회계 메모' })).toBeTruthy());
  expect(mine.queryByRole('button', { name: '승인' })).toBeNull();
});

/**
 * §71 월간 「어디서 놓쳤나」 — C86-b.
 *
 * 이 판은 **월간에만** 선다. 세울지 말지를 화면이 기간으로 다시 판정하지 않는다 —
 * 서버가 `monthly` 를 null 로 주면 그것으로 끝이다 (D-R37 · D-R39 와 같은 이유로, 판정이
 * 두 곳에 있으면 두 답이 생긴다).
 */
it('월간 판은 서버가 준 줄만 세우고 머리의 수와 줄들의 합이 같다 (§71 · N-19)', async () => {
  const view = setupWrite({
    monthly: {
      leads: 15,
      lost: 6,
      funnel: [], funnelSince: null,
      lostRows: [
        { key: 'before_book', label: '상담 예약 전 이탈', count: 1 },
        { key: 'after_first', label: '1차 후 미진행', count: 2 },
        { key: 'after_second', label: '2차 후 미등록', count: 2 },
        { key: 'none', label: '분류 안 됨', count: 1 },
      ],
    },
  });
  await waitFor(() => expect(view.container.textContent).toContain('어디서 놓쳤나'));
  const text = view.container.textContent ?? '';
  expect(text).toContain('이번 달 들어온 문의 15건 중 등록 실패 6건');
  // 분류 안 된 실패도 제 줄로 선다 — 이 줄을 빼면 머리의 6 과 줄들의 합이 갈린다 (N-25)
  for (const w of ['상담 예약 전 이탈', '1차 후 미진행', '2차 후 미등록', '분류 안 됨']) {
    expect(text).toContain(w);
  }
});

it('서버가 월간 판을 안 주면 화면은 기간으로 다시 판정하지 않는다 — 판이 아예 없다', async () => {
  const view = setupWrite({ monthly: null });
  await waitFor(() => expect(view.container.textContent).toContain('살펴볼 것'));
  expect(view.queryByText('어디서 놓쳤나')).toBeNull();
});

it('놓친 건이 없으면 판은 서되 줄 대신 한 줄로 말한다 — 빈 표는 「빠뜨렸나」로 읽힌다', async () => {
  const view = setupWrite({ monthly: { leads: 4, lost: 0, lostRows: [], funnel: [], funnelSince: null } });
  await waitFor(() => expect(view.container.textContent).toContain('어디서 놓쳤나'));
  expect(view.container.textContent).toContain('이번 달 들어온 문의 중 놓친 건이 없습니다');
});

/**
 * §71 「상담 퍼널 — 유입에서 등록까지」 (C90 · N-45 · K-108) — 도달 기록으로 센 수와 비율을 서버가 주고 화면은 그대로 그린다.
 * 옛 건은 기록이 없으므로 「언제부터의 값」인지 부제가 말한다 (N-25 보정 0).
 */
it('월간 퍼널은 서버 줄·비율 그대로이고 부제가 도달 기록 시작일을 말한다 (§71 · N-45)', async () => {
  const view = setupWrite({
    monthly: {
      leads: 15, lost: 0, lostRows: [], funnelSince: '2026-09-18',
      funnel: [
        { key: 'inflow', label: '유입', count: 15, pct: 100 },
        { key: 'first', label: '1차 상담', count: 15, pct: 100 },
        { key: 'wait2nd', label: '2차 대기', count: 9, pct: 60 },
        { key: 'second', label: '2차 상담', count: 8, pct: 53 },
        { key: 'enrolled', label: '등록', count: 2, pct: 13 },
      ],
    },
  });
  await waitFor(() => expect(view.container.textContent).toContain('상담 퍼널 — 유입에서 등록까지'));
  const list = view.getByRole('list', { name: '상담 퍼널' });
  expect(within(list).getAllByRole('listitem').map((li) => li.textContent))
    .toEqual(['유입15100%', '1차 상담15100%', '2차 대기960%', '2차 상담853%', '등록213%']);
  expect(view.container.textContent).toContain('도달 기록은 2026-09-18 부터 — 그 전 건은 지금 단계로만 셉니다');
});

it('도달 기록이 아직 없으면 퍼널 부제가 그 사실을 말한다 — 화면이 「언제부터」를 지어내지 않는다', async () => {
  const view = setupWrite({ monthly: { leads: 4, lost: 0, lostRows: [], funnel: [{ key: 'inflow', label: '유입', count: 4, pct: 100 }], funnelSince: null } });
  await waitFor(() => expect(view.container.textContent).toContain('상담 퍼널 — 유입에서 등록까지'));
  expect(view.container.textContent).toContain('도달 기록이 아직 없습니다 — 지금 단계로만 셉니다');
});
