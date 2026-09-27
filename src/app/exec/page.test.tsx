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
import { MASKED } from '@/lib/money';

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

type Area = Exec['areas'][number];
type Tile = Area['tiles'][number];
const t = (key: string, label: string, value: number | null, unit: '원' | '건', sub: string | null = null, alert = false): Tile =>
  ({ key, label, value, unit, sub, alert, display: null });

type Item = Area['items'][number];
const it8 = (n: number): Item[] => Array.from({ length: n }, (_, i) => (
  { key: `lesson-${i}`, title: `08-21 ${16 + (i % 4)}:00 수업 ${i + 1}`, sub: '교재 · 안내', go: '/board' }));

/**
 * 원본 §69(2026-08-21) 컷의 카드 여섯 — 문장과 타일은 서버가 짓는다(여기서는 응답 모양 그대로 둔다).
 * 펼칠 줄 머리(`itemsLabel`)도 컷 글자 그대로다 — 마케팅은 0 건이라 줄이 없고, 수업은 배지 17 · 줄 8건(N-67).
 */
const areas: Area[] = ([
  { key: 'money', label: '회계', review: '납부 기한이 지난 청구서 수', count: 2, go: '/accounting',
    headline: '못 받은 돈 ₩8,550,000 · 그중 2건은 기한이 지났습니다',
    tiles: [t('in', '오늘 입금', 0, '원', '0건'), t('unpaid', '못 받은 돈', 8_550_000, '원', '5건', true), t('overdue', '기한 지남', 2, '건', '₩3,000,000', true)],
    itemsLabel: '기한 지난 청구서 2건',
    items: [
      { key: 'inv-1', title: '고은설 · 8월 수업료', sub: '₩1,500,000 · 기한 08-10 · 11일 지남', go: '/accounting?tab=inv' },
      { key: 'inv-2', title: '민제인 · 8월 수업료', sub: '₩1,500,000 · 기한 08-14 · 7일 지남', go: '/accounting?tab=inv' },
    ] },
  { key: 'mkt', label: '마케팅', review: '없음 (정보성)', count: 0, go: '/ops',
    headline: '오늘 올린 것이 없습니다',
    tiles: [t('posts', '올린 것', 0, '건', '—', true), t('feedback', '대표 피드백', 0, '건', '없음')],
    itemsLabel: null, items: [] },
  { key: 'ops', label: '운영', review: '결재 대기 + 기한 지난 할 일', count: 1, go: '/ops',
    headline: '기획 1건이 대표 결재를 기다립니다',
    tiles: [t('waiting', '결재 대기', 1, '건', '확인 필요', true), t('running', '진행 중 기획', 2, '건', '오늘 회의 1건'), t('todos', '안 끝난 할 일', 3, '건')],
    itemsLabel: '결재 대기 · 기한 지난 할 일 1건',
    items: [{ key: 'plan-3', title: '봄 설명회 기획', sub: '결재 대기', go: '/ops?tab=plan&plan=3' }] },
  { key: 'consulting', label: '컨설팅', review: '수납 전이라 진행이 잠긴 계약', count: 1, go: '/consulting',
    headline: '1건이 수납 전이라 진행이 잠겨 있습니다',
    tiles: [t('paid', '받은 돈', 400_000, '원', '계약 ₩1,700,000'), t('due', '남은 돈', 1_300_000, '원', '다음 회차 08-24', true)],
    itemsLabel: '수납 전이라 잠긴 컨설팅 1건',
    items: [{ key: 'cons-1', title: '강라율 · 에세이', sub: '계약 2/5단계 · 수납 전', go: '/consulting' }] },
  { key: 'complaint', label: '컴플레인', review: '아직 안 끝난 건', count: 2, go: '/ops',
    headline: '2건이 아직 안 끝났습니다',
    tiles: [t('received', '오늘 접수', 0, '건', '—'), t('open', '안 끝난 것', 2, '건', null, true)],
    itemsLabel: '안 끝난 컴플레인 2건',
    items: [
      { key: 'cpl-1', title: '양찬욱 · 수업', sub: '접수 · 접수 08-18', go: '/ops?tab=complaint' },
      { key: 'cpl-2', title: '고은설 · 수업', sub: '대응 중 · 접수 08-20', go: '/ops?tab=complaint' },
    ] },
  { key: 'lesson', label: '수업', review: '교재·안내·줌·리포트가 덜 된 수업', count: 17, go: '/board',
    headline: '수업 20건 중 17건 준비 덜 됨',
    tiles: [t('lessons', '오늘 수업', 20, '건', '휴강 없음'), t('missing', '준비 안 됨', 17, '건', '교재 · 안내 · 줌', true)],
    itemsLabel: '준비가 덜 된 수업 8건', items: it8(8) },
  // 영역 담당은 처음엔 비어 있다 — 이름을 지어 넣지 않는다 (W11 · N-81)
] satisfies Array<Omit<Area, 'ownerId' | 'ownerName' | 'canSetOwner'>>).map((a) => ({ ...a, ownerId: null, ownerName: null, canSetOwner: false }));

type Head = Exec['head'][number];
const h = (key: string, label: string, value: number | null, unit: string, money: boolean, o: { total?: number; note?: string } = {}): Head =>
  ({ key, label, value, unit, money, total: o.total ?? null, note: o.note ?? null });

const dayHead: Head[] = [
  h('revenue', '오늘 들어온 돈', 0, '원', true), h('unpaid', '못 받은 돈', 8_550_000, '원', true),
  h('waiting', '결재 대기', 1, '건', false), h('complaints', '안 끝난 컴플레인', 2, '건', false),
];

const data: Exec = {
  from: '2026-08-21', to: '2026-08-21',
  periodKind: 'day', sheetTitle: '일일 업무 보고', periodLabel: '26년 8월 21일 금요일',
  head: dayHead,
  stats: [{ key: 'lessons', label: '진행한 수업', value: 20, unit: '회', money: false }],
  reports: [],
  areas,
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
  expect(view.getByRole('region', { name: '마케팅' }).textContent).toContain('✓');
});

/**
 * **K-110** — 원문 §69 는 카드마다 오른쪽 위에 「보기 ›」라 적는다. 제품은 `›` 하나였고 그것이
 * `aria-hidden` 이라 **보조기기에는 이 줄이 눌린다는 말이 하나도 없었다.**
 *
 * 카드가 메모 칸까지 한 벌이 된 뒤로(69-7) 카드 전체는 단추일 수 없다 — 「보기」가 단추다.
 * 0 건의 `✓` 도 같은 종류다. 글리프는 낱말이 아니라 보조기기가 「마케팅 ✓」라고만 읽는다.
 */
it('⭐ 영역 카드마다 「보기」가 글자로 서고, 0 건의 ✓ 는 글자로도 읽힌다 (K-110)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: '회계 보기' })).toBeTruthy());
  for (const a of data.areas) {
    const go = view.getByRole('button', { name: `${a.label} 보기` });
    expect(go.textContent).toContain('보기');
    // 접근 이름에도 들어가야 한다 — 글자가 `aria-hidden` 이면 있으나 마나다
    expect(go.getAttribute('aria-hidden')).toBeNull();
  }
  expect(view.getByRole('region', { name: '마케팅' }).textContent).toContain('살펴볼 것 없음');
});

it('영역의 「보기」를 누르면 그 화면으로 간다 — 대표 보고 안에서 처리하지 않는다 (D-R27)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: '회계 보기' })).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '회계 보기' }));
  expect(nav.push).toHaveBeenCalledWith('/accounting');
});

/* ══ §69 시트 — 머리 · 지표 · 카드 한 벌 (69-1 · 69-2 · 69-6 · 69-7 · 69-8) ══ */

it('보고서 시트 머리에 제목과 기간이 서고, 「살펴볼 것」·「담당 x/6」이 그 오른쪽이다 (69-1)', async () => {
  const view = setup();
  const sheet = await view.findByRole('region', { name: '일일 업무 보고' });
  const head = within(sheet).getByRole('heading', { name: '일일 업무 보고' }).parentElement!;
  expect(head.textContent).toContain('26년 8월 21일 금요일');
  expect(head.textContent).toContain('살펴볼 것 23');
  expect(head.textContent).toContain('담당 0/6 기재');
});

it('「대표께 올리기」는 도구 줄 오른쪽 끝, 「인쇄」 옆이다 — 첫 화면에서 보인다 (69-2)', async () => {
  const view = setupWrite();
  await waitFor(() => expect(view.getByRole('button', { name: '대표께 올리기' })).toBeTruthy());
  const bar = view.getByRole('button', { name: '대표께 올리기' }).closest('[data-print="chrome"]')!;
  expect(within(bar as HTMLElement).getByRole('button', { name: '인쇄' })).toBeTruthy();
  // 시트(보고 본문) 안에 있지 않다 — 인쇄하면 빠진다
  expect((await view.findByRole('region', { name: '일일 업무 보고' })).contains(view.getByRole('button', { name: '대표께 올리기' }))).toBe(false);
});

it('머리 지표 넷은 서버가 준 칸 그대로다 — 일일은 돈 · 결재 대기 · 컴플레인 (69-6)', async () => {
  const view = setup();
  const sheet = await view.findByRole('region', { name: '일일 업무 보고' });
  const text = sheet.textContent ?? '';
  for (const w of ['오늘 들어온 돈₩0', '못 받은 돈₩8,550,000', '결재 대기1건', '안 끝난 컴플레인2건']) expect(text).toContain(w);
  // 옛 여섯 칸(진행한 수업 …)은 원문 머리에 없다
  expect(text).not.toContain('진행한 수업');
});

it('주간 머리의 「수업 준비 6/49」는 서버가 준 분모 그대로이고 부제가 선다 (70-1)', async () => {
  const view = setupWrite({
    periodKind: 'week', sheetTitle: '주간 업무 보고', periodLabel: '08월 17일 ~ 08월 23일',
    head: [
      h('revenue', '이번 주 입금', 0, '원', true), h('leads', '신규 문의', 5, '건', false),
      h('posts', '마케팅 게시', 4, '건', false), h('prep', '수업 준비', 6, '건', false, { total: 49, note: '다 된 것' }),
    ],
  });
  const sheet = await view.findByRole('region', { name: '주간 업무 보고' });
  expect(sheet.textContent).toContain('수업 준비6/49다 된 것');
  expect(sheet.textContent).toContain('신규 문의5건');
});

it('카드 한 장에 한 줄 요약 · 타일 · 메모 칸이 함께 선다 — 문장과 숫자는 서버 것이다 (69-7 · 69-8)', async () => {
  const view = setup();
  const money = await view.findByRole('region', { name: '회계' });
  expect(money.textContent).toContain('못 받은 돈 ₩8,550,000 · 그중 2건은 기한이 지났습니다');
  const tiles = within(money).getByRole('list', { name: '회계 숫자' });
  expect(within(tiles).getAllByRole('listitem').map((li) => li.textContent))
    .toEqual(['오늘 입금₩00건', '못 받은 돈₩8,550,0005건', '기한 지남2건₩3,000,000']);
  expect(within(money).getByRole('textbox', { name: '회계 메모' })).toBeTruthy();
  const lesson = view.getByRole('region', { name: '수업' });
  expect(lesson.textContent).toContain('교재 · 안내 · 줌');
});

/**
 * **N-67 · K-111** — 원본 §69~§71 카드마다 「기한 지난 청구서 2건 펼치기 ▾」. 줄은 서버가 준 것 그대로(배지와 같은 판정 ·
 * 여덟에서 끊음)이고, 줄을 누르면 그 원본 화면으로 **이동만** 한다(D-R27). 줄이 없는 카드에는 펼칠 줄 자체가 없다.
 */
it('⭐ 카드의 펼칠 줄 — 머리를 누르면 줄이 서고, 줄을 누르면 원본 화면으로 간다 · 줄 없는 카드엔 없다 (N-67 · K-111)', async () => {
  const view = setup();
  const money = await view.findByRole('region', { name: '회계' });
  const toggle = within(money).getByRole('button', { name: /기한 지난 청구서 2건 펼치기/ });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(within(money).queryByText('고은설 · 8월 수업료')).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const rows = within(money).getByRole('list', { name: '기한 지난 청구서 2건' });
  // 끝의 「›」는 이동을 뜻하는 글리프(보조기기에는 숨김)다
  expect(within(rows).getAllByRole('listitem').map((li) => li.textContent))
    .toEqual(['고은설 · 8월 수업료₩1,500,000 · 기한 08-10 · 11일 지남›', '민제인 · 8월 수업료₩1,500,000 · 기한 08-14 · 7일 지남›']);
  fireEvent.click(within(rows).getByRole('button', { name: /고은설 · 8월 수업료/ }));
  expect(nav.push).toHaveBeenCalledWith('/accounting?tab=inv');
  // 원본 §69 마케팅 카드에는 펼칠 줄이 없다 — 올린 것이 0 건이다
  expect(within(view.getByRole('region', { name: '마케팅' })).queryByRole('button', { name: /펼치기/ })).toBeNull();
  // 수업은 배지 17 인데 줄 머리는 「8건」이다 — 서버 낱말 그대로
  expect(within(view.getByRole('region', { name: '수업' })).getByRole('button', { name: /준비가 덜 된 수업 8건 펼치기/ })).toBeTruthy();
});

it('주간 머리 셋은 지난주와 견준 낱말을 값 아래에 적는다 — 서버 note 그대로 (§70 · N-66 주간 · K-107)', async () => {
  const view = setupWrite({
    periodKind: 'week', sheetTitle: '주간 업무 보고', periodLabel: '08월 17일 ~ 08월 23일',
    head: [
      h('revenue', '이번 주 입금', 0, '원', true, { note: '지난주 ▼ 100%' }), h('leads', '신규 문의', 5, '건', false, { note: '지난주 ▲ 25%' }),
      h('posts', '마케팅 게시', 4, '건', false, { note: '지난주 신규' }), h('prep', '수업 준비', 6, '건', false, { total: 49, note: '다 된 것' }),
    ],
  });
  const sheet = await view.findByRole('region', { name: '주간 업무 보고' });
  for (const w of ['이번 주 입금₩0지난주 ▼ 100%', '신규 문의5건지난주 ▲ 25%', '마케팅 게시4건지난주 신규', '수업 준비6/49다 된 것']) {
    expect(sheet.textContent).toContain(w);
  }
});

it('타일 값이 null 이면 숨긴 금액 낱말(「비공개」)이다 — 서버가 금액을 안 준 것이지 ₩0 이 아니다 (D-R39)', async () => {
  const masked = areas.map((a) => (a.key === 'money'
    ? { ...a, headline: '못 받은 돈 5건 · 그중 2건은 기한이 지났습니다', tiles: a.tiles.map((x) => (x.unit === '원' ? { ...x, value: null } : x)) }
    : a));
  const view = setupWrite({ areas: masked, canSeeAmounts: false });
  const money = await view.findByRole('region', { name: '회계' });
  expect(money.textContent).toContain(`오늘 입금${MASKED}`);
  expect(money.textContent).not.toContain('₩8,550,000');
});

it('결재함은 상태별로 묶고 되돌아온 것이 먼저다 — 묶음 머리는 상태 띠와 같은 낱말이다 (§75 순서 · 73-2)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('tab', { name: /결재함/ })).toBeTruthy());
  fireEvent.click(view.getByRole('tab', { name: /결재함/ }));
  const text = view.container.textContent ?? '';
  expect(text).toContain('반려1건되돌아왔습니다 — 고쳐서 다시 올려주세요');
  expect(text).toContain('작성 중1건아직 올리지 않았습니다');
  expect(text.indexOf('되돌아왔습니다')).toBeLessThan(text.indexOf('아직 올리지 않았습니다'));
  expect(text).toContain('숫자만으로는 모를 것');
  expect(text).toContain('2/6 적음');
  // 원문에 없는 안내 띠는 서지 않는다 (73-1)
  expect(text).not.toContain('이동만');
  // N-12 — 결재함에는 승인·반려가 없다
  expect(view.queryByRole('button', { name: '승인' })).toBeNull();
  expect(view.queryByRole('button', { name: '반려' })).toBeNull();
});

it('결재함 줄을 누르면 그 기간의 보고로 이동만 한다 (N-12)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('tab', { name: /결재함/ })).toBeTruthy());
  fireEvent.click(view.getByRole('tab', { name: /결재함/ }));
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
  expect(view.getByRole('tab', { name: /주간/ }).getAttribute('aria-selected')).toBe('true');

  nav.search = 'view=month&date=2026-09-01&rpt=3';
  view.rerender(<QueryClientProvider client={view.client}><ExecPage /></QueryClientProvider>);
  await waitFor(() => expect(view.container.textContent).toContain('2026년 9월'));
  expect(view.getByRole('tab', { name: /월간/ }).getAttribute('aria-selected')).toBe('true');
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
  // 잠긴 이유가 화면에 보여야 한다 — 단추가 도구 줄로 옮겨 가며 안내 한 줄이 빠졌다(웹 e2e K-103 · 2026-09-25)
  expect(view.getByText('한 줄이라도 적어야 올릴 수 있습니다')).toBeTruthy();
  expect(view.getByRole('button', { name: '대표께 올리기' }).getAttribute('title')).toBe('한 줄이라도 적어야 올릴 수 있습니다');
  fireEvent.change(view.getByRole('textbox', { name: '운영 메모' }), { target: { value: '한 줄' } });
  expect(view.getByRole('button', { name: '대표께 올리기' }).hasAttribute('disabled')).toBe(false);
  expect(view.queryByText('한 줄이라도 적어야 올릴 수 있습니다')).toBeNull();
});

/**
 * **이미 올린 보고에서는 두 단추도 칸도 닫힌다** (S5 · D-R39).
 *
 * 화면이 `canCrudAll` 이라는 역할 권한만 보고 있어서, 올린 보고(`sent`)·결재된 보고(`ok`)에서도
 * 단추가 선 채 **눌러야만** 409 `RPT_LOCKED` 를 받았다. 이유 문장도 서버가 준 그대로 말한다 —
 * 화면이 상태 낱말로 문장을 지으면 쓰기가 내는 말과 갈린다.
 */
it('이미 올린 보고는 저장·올리기·메모 칸이 모두 닫히고 서버가 준 이유를 말한다 (S5)', async () => {
  const locked: Partial<Exec> = {
    reports: [{
      id: 9, rptType: 'day', onDate: '2026-08-21', state: 'sent',
      memos: data.areas.map((a) => ({ key: a.key as 'money', memo: a.key === 'money' ? '한 줄' : '' })),
      filled: 1, sentAt: null, reviewedAt: null, rejectReason: null,
      sentByName: '김민수', reviewedByName: null, canReview: false,
      canWriteMemo: false, writeBlockedReason: '이미 올린 보고는 고칠 수 없습니다. 반려된 뒤에 다시 적어 주세요', canWithdraw: false,
    }],
  };
  const view = setupWrite(locked);
  await waitFor(() => expect(view.getByRole('textbox', { name: '회계 메모' })).toBeTruthy());
  expect(view.getByRole('button', { name: '작성 중 저장' }).hasAttribute('disabled')).toBe(true);
  expect(view.getByRole('button', { name: '대표께 올리기' }).hasAttribute('disabled')).toBe(true);
  expect((view.getByRole('textbox', { name: '회계 메모' }) as HTMLTextAreaElement).disabled).toBe(true);
  expect(view.container.textContent).toContain('이미 올린 보고는 고칠 수 없습니다');
  cleanup();

  // 반려된 보고는 다시 열린다 — 그러라고 반려한 것이다. 막기만 하고 못 여는 판정은 기능을 죽인다
  const reopened = setupWrite({
    reports: [{ ...locked.reports![0]!, state: 'rej', rejectReason: '수치 근거가 없습니다', canWriteMemo: true, writeBlockedReason: null }],
  });
  await waitFor(() => expect(reopened.getByRole('textbox', { name: '회계 메모' })).toBeTruthy());
  expect((reopened.getByRole('textbox', { name: '회계 메모' }) as HTMLTextAreaElement).disabled).toBe(false);
  expect(reopened.getByRole('button', { name: '대표께 올리기' }).hasAttribute('disabled')).toBe(false);
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
      id: 7, rptType: 'day', onDate: '2026-08-21', state: 'sent',
      memos: data.areas.map((a) => ({ key: a.key as 'money', memo: a.key === 'money' ? '한 줄' : '' })),
      filled: 1, sentAt: null, reviewedAt: null, rejectReason: null,
      sentByName: '김민수', reviewedByName: null, canReview, canWriteMemo: false, writeBlockedReason: '이미 올린 보고는 고칠 수 없습니다. 반려된 뒤에 다시 적어 주세요',
      canWithdraw: false,
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
      // W11 · N-87 — 실패 당시 단계 넷(깔때기 차례) + 판정 없는 옛 건 「미분류」. 키 · 낱말은 서버 `intakeFailStop` 그대로
      lostRows: [
        { key: 'first', label: '1차 상담 중단', count: 2 },
        { key: 'wait2nd', label: '2차 안 옴', count: 1 },
        { key: 'second', label: '2차 상담 중단', count: 1 },
        { key: 'hold', label: '보류 후 무산', count: 1 },
        { key: 'none', label: '미분류', count: 1 },
      ],
    },
  });
  await waitFor(() => expect(view.container.textContent).toContain('어디서 놓쳤나'));
  const text = view.container.textContent ?? '';
  // 머리 한 줄은 원본 §71 그대로 「등록 실패 N건」 (71-6)
  expect(text).toContain('등록 실패 6건');
  // 판정 없는 실패도 「미분류」 제 줄로 선다 — 이 줄을 빼면 머리의 6 과 줄들의 합이 갈린다 (N-25 · N-19)
  for (const w of ['1차 상담 중단', '2차 안 옴', '2차 상담 중단', '보류 후 무산', '미분류']) {
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
      // 원본 §71 컷의 네 줄 그대로 — 「유입 → 1차 → 2차·진단 → 등록」(71-5 · 서버 낱말)
      funnel: [
        { key: 'inflow', label: '유입', count: 15, pct: 100 },
        { key: 'first', label: '1차 상담', count: 15, pct: 100 },
        { key: 'second', label: '2차 · 진단', count: 8, pct: 53 },
        { key: 'enrolled', label: '등록', count: 2, pct: 13 },
      ],
    },
  });
  // 원본 §71 — 제목 「상담 퍼널」 옆에 작게 「유입에서 등록까지」
  const list = await view.findByRole('list', { name: '상담 퍼널' });
  expect(view.container.textContent).toContain('상담 퍼널 유입에서 등록까지');
  expect(within(list).getAllByRole('listitem').map((li) => li.textContent))
    .toEqual(['유입15', '1차 상담15100%', '2차 · 진단853%', '등록213%']);
  expect(view.container.textContent).toContain('도달 기록은 2026-09-18 부터 — 그 전 건은 지금 단계로만 셉니다');
});

it('도달 기록이 아직 없으면 퍼널 부제가 그 사실을 말한다 — 화면이 「언제부터」를 지어내지 않는다', async () => {
  const view = setupWrite({ monthly: { leads: 4, lost: 0, lostRows: [], funnel: [{ key: 'inflow', label: '유입', count: 4, pct: 100 }], funnelSince: null } });
  await view.findByRole('list', { name: '상담 퍼널' });
  expect(view.container.textContent).toContain('도달 기록이 아직 없습니다 — 지금 단계로만 셉니다');
});

/* ══ 머리 돈 칸 — 숨긴 금액 낱말은 권한일 때만 · 강사료·이익은 월간 머리에만 (69-14 · 69-15 · 71-1) ══ */

const monthHead: Head[] = [
  h('revenue', '매출 (입금)', 0, '원', true), h('payout', '강사료', 168_000, '원', true),
  h('expense', '지출', 0, '원', true),
  // 수입이 0 이면 비율이 없다 — 서버가 부제(note)를 비운다. 권한 때문이 아니다
  h('profit', '이익', -168_000, '원', true),
];
const wholeMonth: NonNullable<Exec['monthly']> = { leads: 0, lost: 0, lostRows: [], funnel: [], funnelSince: null };
const monthSeed: Partial<Exec> = { periodKind: 'month', sheetTitle: '월간 업무 보고', periodLabel: '2026년 8월', monthly: wholeMonth };

/** 시트 머리 지표에서 이름으로 칸을 찾아 값 글자를 읽는다 */
const headCard = (view: ReturnType<typeof render>, title: string, label: string): string | null => {
  const sheet = view.getByRole('region', { name: title });
  const el = [...sheet.querySelectorAll('div')].find((d) => d.textContent === label);
  return el ? (el.nextElementSibling?.textContent ?? '') : null;
};

/*
 * 71-1 — 원문 §71 컷은 계산된 적자를 「₩-7,674,692」(하이픈이 ₩ 뒤)로 적지만, 같은 원문 §56 컷이 사람이 적은 차감을
 * 「−₩95,000」(빼기 기호가 ₩ 앞)으로 적는다. 금액 모양은 `lib/money` 한 곳이라(N-92) 음수도 한 모양 — 부호가 맨 앞이다.
 */
it('월간 머리 넷은 돈이고 이익률은 「이익」의 부제다 — 적자는 부호가 맨 앞 「−₩168,000」 (71-1 · N-92)', async () => {
  const view = setupWrite({ ...monthSeed, head: monthHead.map((x) => (x.key === 'profit' ? { ...x, note: '-50%' } : x)) });
  await waitFor(() => expect(headCard(view, '월간 업무 보고', '이익')).not.toBeNull());
  expect(headCard(view, '월간 업무 보고', '매출 (입금)')).toBe('₩0');
  expect(headCard(view, '월간 업무 보고', '이익')).toBe('−₩168,000');
  expect(view.getByRole('region', { name: '월간 업무 보고' }).textContent).toContain('-50%');
});

it('금액을 볼 수 있는데 값이 없으면 「—」다 — 숨긴 금액 낱말은 권한이 없을 때만이다 (69-14)', async () => {
  const view = setupWrite({ ...monthSeed, head: monthHead.map((x) => (x.key === 'payout' ? { ...x, value: null } : x)), canSeeAmounts: true });
  await waitFor(() => expect(headCard(view, '월간 업무 보고', '강사료')).not.toBeNull());
  expect(headCard(view, '월간 업무 보고', '강사료')).toBe('—');
  expect(view.getByRole('region', { name: '월간 업무 보고' }).textContent).not.toContain(MASKED);
});

it('권한이 없어 서버가 금액을 안 주면 그때만 숨긴 금액 낱말(「비공개」)이다', async () => {
  const view = setupWrite({ ...monthSeed, head: monthHead.map((x) => ({ ...x, value: null })), canSeeAmounts: false });
  await waitFor(() => expect(headCard(view, '월간 업무 보고', '매출 (입금)')).not.toBeNull());
  expect(headCard(view, '월간 업무 보고', '매출 (입금)')).toBe(MASKED);
  expect(headCard(view, '월간 업무 보고', '이익')).toBe(MASKED);
});

it('일·주 머리에는 강사료·이익이 없다 — 칸을 정하는 것은 서버다 (69-15)', async () => {
  const view = setup();
  await waitFor(() => expect(headCard(view, '일일 업무 보고', '오늘 들어온 돈')).not.toBeNull());
  for (const hiddenLabel of ['강사료', '이익', '이익률']) expect(headCard(view, '일일 업무 보고', hiddenLabel), hiddenLabel).toBeNull();
});

/* ══ §69 뷰 탭 — 네 장 모두 기간을 적고, 날짜는 결재함 줄과 같은 모양이다 (69-3 · 69-4) ══ */

it('뷰 탭 네 장이 모두 아래 한 줄에 그 기간을 적는다 — 고른 탭만이 아니다 (69-3)', async () => {
  nav.search = 'view=day&date=2026-08-21';
  const view = setup();
  await waitFor(() => expect(view.getByRole('tab', { name: /결재함/ }).textContent).toContain('2건'));
  const tab = (name: RegExp) => view.getByRole('tab', { name }).textContent ?? '';
  expect(tab(/일일/)).toContain('26년 8월 21일 금요일');
  expect(tab(/주간/)).toContain('08-17 ~ 08-23');
  expect(tab(/월간/)).toContain('2026년 8월');
  expect(view.getByRole('tab', { name: /일일/ }).getAttribute('aria-selected')).toBe('true');
});

it('도구 줄의 날짜는 결재함 줄(서버 낱말)과 같은 모양이다 — 한 화면에 날짜가 두 모양이면 안 된다 (69-4)', async () => {
  nav.search = 'view=day&date=2026-08-21';
  const view = setup();
  // 결재함 줄의 낱말 — 서버가 지은 것이다. 도구 줄 날짜도 서버 `periodLabel` 이라 같은 함수에서 나온다
  const serverLabel = data.inbox.find((r) => r.rptType === 'day')!.label;
  await waitFor(() => expect(view.getByRole('button', { name: '오늘' }).parentElement!.textContent).toContain(serverLabel));
  expect(data.periodLabel).toBe(serverLabel);
});

it('사용자 문구에 결정 코드·절 번호를 적지 않는다', async () => {
  const view = setupWrite({ stats: [], monthly: { leads: 1, lost: 0, lostRows: [], funnel: [], funnelSince: null } });
  await waitFor(() => expect(view.getAllByPlaceholderText('숫자만으로는 모를 것').length).toBe(6));
  const visible = `${view.container.textContent ?? ''} ${[...view.container.querySelectorAll('[placeholder]')].map((e) => e.getAttribute('placeholder')).join(' ')}`;
  expect(visible).not.toMatch(/D-R\d|N-\d|§\s?\d/);
  fireEvent.click(view.getByRole('tab', { name: /결재함/ }));
  expect(view.container.textContent ?? '').not.toMatch(/D-R\d|N-\d|§\s?\d/);
});

/* ══ W11 — §73 회수(N-97) · §69 영역 담당(N-81) ══════════════════════════════ */

it('올린 사람에게만 「회수」가 선다 — 서버의 canWithdraw 하나로 · 누르면 그 보고를 되돌리는 경로를 부른다 (N-97)', async () => {
  const sent = (canWithdraw: boolean): Partial<Exec> => ({
    reports: [{
      id: 9, rptType: 'day', onDate: '2026-08-21', state: 'sent',
      memos: data.areas.map((a) => ({ key: a.key as 'money', memo: a.key === 'money' ? '한 줄' : '' })),
      filled: 1, sentAt: null, reviewedAt: null, rejectReason: null,
      sentByName: '대표', reviewedByName: null, canReview: false,
      canWriteMemo: false, writeBlockedReason: '이미 올린 보고는 고칠 수 없습니다. 반려된 뒤에 다시 적어 주세요', canWithdraw,
    }],
  });
  const view = setupWrite(sent(true));
  const back = await waitFor(() => view.getByRole('button', { name: '회수' }));
  fireEvent.click(back);
  await waitFor(() => expect(view.calls).toEqual([{ method: 'post', url: '/exec/report/9/withdraw', body: null }]));
  cleanup();

  // 남이 올린 보고 · 이미 결재된 보고 — 서버가 false 를 주면 단추가 없다
  const other = setupWrite(sent(false));
  await waitFor(() => expect(other.getByRole('textbox', { name: '회계 메모' })).toBeTruthy());
  expect(other.queryByRole('button', { name: '회수' })).toBeNull();
});

it('영역 담당 이름은 메모 칸 위에 서고, 비어 있으면 「담당 없음」 — 이름을 지어 넣지 않는다 (N-81)', async () => {
  const view = setupWrite({ areas: data.areas.map((a) => (a.key === 'money' ? { ...a, ownerId: 7, ownerName: 'Grace' } : a)) });
  const money = await waitFor(() => view.getByRole('region', { name: '회계' }));
  expect(within(money).getByText('Grace').tagName).toBe('B');
  expect(within(view.getByRole('region', { name: '마케팅' })).getByText('담당 없음')).toBeTruthy();
  // 바꿀 수 있는지는 서버의 canSetOwner — 거짓이면 「바꾸기」가 없다
  expect(within(money).queryByRole('button', { name: '회계 담당 바꾸기' })).toBeNull();
});

it('대표는 영역 담당을 고른다 — 「바꾸기」 → 고르기 칸 → 그 영역 하나의 담당만 보낸다 (N-81)', async () => {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  useSession.getState().signIn('fixture', me);
  const areasCeo = data.areas.map((a) => ({ ...a, canSetOwner: true }));
  api.defaults.adapter = vi.fn(async (config) => {
    const method = (config.method ?? 'get').toLowerCase();
    if (method !== 'get') {
      calls.push({ method, url: config.url ?? '', body: config.data ? JSON.parse(String(config.data)) : null });
      return { config, status: 200, statusText: 'OK', headers: {}, data: { key: 'money', ownerId: 8, ownerName: '김범준' } };
    }
    const body = config.url === '/meta' ? { staff: [{ id: 7, name: '홍지승' }, { id: 8, name: '김범준' }] } : { ...data, areas: areasCeo };
    return { config, status: 200, statusText: 'OK', headers: {}, data: body };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><ExecPage /></QueryClientProvider>);

  const money = await waitFor(() => view.getByRole('region', { name: '회계' }));
  fireEvent.click(within(money).getByRole('button', { name: '회계 담당 바꾸기' }));
  const pick = await waitFor(() => {
    const el = within(money).getByRole('combobox', { name: '회계 담당' }) as HTMLSelectElement;
    if (el.options.length < 3) throw new Error('고를 사람이 아직 없다');
    return el;
  });
  fireEvent.change(pick, { target: { value: '8' } });
  await waitFor(() => expect(calls).toEqual([{ method: 'put', url: '/exec/areas/money/owner', body: { staffId: 8 } }]));
});
