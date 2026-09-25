/** @file-guide
 * 목적: §39 판 배지 · §40 이력 — 「더 나중 판이 있다」를 화면이 판정하지 않는다 (C52).
 * 책임/재사용: 실제 BookVersionBadge/BookHistory 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Book, BookHistoryRow, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { BookHistory, BookVersionAdder, BookVersionBadge } from './BookVersions';

const me: Me = {
  id: 1,
  name: '관리자',
  role: 'admin',
  roleLabel: '관리자',
  title: null,
  canAdminPage: true,
  canCrudAll: true,
  canSeeProfit: false,
  canCrudAttendance: true,
  canMoney: false,
  canWage: false,
  canApprove: true,
  canHide: true,
  canGpaPack: true,
};

const base: Book = {
  id: 3,
  code: 'ENG-RD-G9-P-001',
  title: 'Between the Lines',
  subKey: 'reading',
  subName: 'Reading',
  level: 'P',
  grade: 'G9',
  pages: 284,
  seTe: 'SE',
  edition: 'v2026.03',
  latestEdition: 'v2026.08',
  hasNewer: true,
  versId: 11,
  latestVersId: 12,
  hasFile: true,
  issueCount: 3,
};

const history: BookHistoryRow[] = [
  {
    id: 9,
    action: 'book_swap',
    actionLabel: '교재 교체',
    entity: 'vers',
    refId: 12,
    subject: 'Between the Lines · v2026.08',
    byName: '김민선',
    at: '2026-09-12T10:00:00+09:00',
    refMissing: false,
  },
  {
    id: 8,
    action: 'book_upload',
    actionLabel: '교재 업로드',
    entity: 'vers',
    refId: 12,
    subject: 'Between the Lines · v2026.08',
    byName: '김범준',
    at: '2026-09-11T09:20:00+09:00',
    refMissing: false,
  },
];

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let patched: string | null = null;
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter;
  useSession.getState().signOut();
  patched = null;
});

const historyBoard = {
  items: history,
  actions: [
    { key: 'book_swap', label: '교재 교체', count: 1 },
    { key: 'book_upload', label: '교재 업로드', count: 1 },
  ],
  byStudent: [],
  byDay: [{ key: '2026-09-12', label: '2026-09-12', count: 1 }],
  total: 2,
  bookCount: 2,
  guideCount: 0,
};

function wrap(node: React.ReactNode, data: unknown = historyBoard) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string }) => {
    if (config.method === 'patch') {
      patched = config.url ?? null;
      return { config, status: 200, statusText: 'OK', headers: {}, data: {} };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

it('⇧ 는 서버가 준 hasNewer 하나만 본다 — 두 낱말을 화면이 비교하지 않는다', () => {
  const view = wrap(<BookVersionBadge book={base} />);
  expect(view.getByText('v2026.03')).toBeTruthy();
  expect(view.getByRole('button', { name: /v2026\.08/ })).toBeTruthy();

  cleanup();
  // 낱말은 그대로 다른데 서버가 hasNewer=false 라고 하면 ⇧ 는 없다
  const same = wrap(<BookVersionBadge book={{ ...base, hasNewer: false }} />);
  expect(same.queryByRole('button', { name: /v2026\.08/ })).toBeNull();
});

it('⇧ 를 누르면 가장 나중 판으로 간다 — 지금 쓰는 판이 아니라', async () => {
  const view = wrap(<BookVersionBadge book={base} />);
  fireEvent.click(view.getByRole('button', { name: /v2026\.08/ }));
  await waitFor(() => expect(patched).not.toBeNull());
  expect(patched).toBe('/books/versions/12/use'); // 11 이 아니다
});

/**
 * 원본 §39 카드 — **지금 판 칩이 곧 바꾸기 단추**다(「v2026.03 ⇧」 하나 · g4 §39-5). 칩과 단추가 따로 서지 않는다.
 * 누르면 가장 나중 판으로 가고, 그 판 이름은 단추 이름이 말한다.
 */
it('더 나중 판이 있으면 지금 판 칩 하나가 ⇧ 단추다 (§39-5)', () => {
  const view = wrap(<BookVersionBadge book={base} />);
  const button = view.getByRole('button', { name: /v2026\.08/ });
  expect(button.textContent).toContain('v2026.03');
  expect(button.textContent).toContain('⇧');
  // 지금 판 낱말은 단추 안 한 번뿐이다 — 옆에 따로 선 칩이 없다
  expect(view.getAllByText('v2026.03')).toHaveLength(1);
  expect(view.getByText('v2026.03').closest('button')).toBe(button);
});

it('판이 없으면 「판 없음」이고 ⇧ 도 없다', () => {
  const view = wrap(
    <BookVersionBadge
      book={{ ...base, edition: null, latestEdition: null, hasNewer: false, versId: null, latestVersId: null }}
    />,
  );
  expect(view.getByText('판 없음')).toBeTruthy();
  expect(view.container.querySelectorAll('button')).toHaveLength(0);
});

it('판 올리기는 파일을 따로 저장하지 않고 판 요청 한 번에 넣는다', async () => {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') {
      posts.push({ url: config.url ?? '', body: JSON.parse(config.data ?? '{}') as Record<string, unknown> });
    }
    return { config, status: 201, statusText: 'Created', headers: {}, data: { id: 31 } };
  }) as never;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <BookVersionAdder book={base} maxBytes={3_000_000} onClose={() => undefined} />
    </QueryClientProvider>,
  );
  const file = {
    name: '학생용.pdf',
    arrayBuffer: async () => new TextEncoder().encode('SE').buffer,
  } as File;
  fireEvent.change(view.getByLabelText('학생용 SE 파일'), { target: { files: [file] } });
  fireEvent.change(view.getByLabelText('판 이름'), { target: { value: 'v2026.09' } });
  fireEvent.click(view.getByRole('button', { name: '올리기' }));

  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0].url).toBe('/books/3/versions');
  expect(posts[0].body).toMatchObject({
    edition: 'v2026.09',
    seFile: { kind: 'lib-se', name: '학생용.pdf' },
  });
});

it('SE+TE 합계가 서버 상한을 넘으면 요청 전에 막는다', () => {
  let postCount = 0;
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { method?: string }) => {
    if (config.method === 'post') postCount += 1;
    return { config, status: 201, statusText: 'Created', headers: {}, data: { id: 31 } };
  }) as never;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <BookVersionAdder book={base} maxBytes={3_000_000} onClose={() => undefined} />
    </QueryClientProvider>,
  );
  const file = (name: string) => ({ name, size: 2_000_000, arrayBuffer: async () => new ArrayBuffer(0) }) as File;
  fireEvent.change(view.getByLabelText('학생용 SE 파일'), { target: { files: [file('se.pdf')] } });
  fireEvent.change(view.getByLabelText('교사용 TE 파일'), { target: { files: [file('te.pdf')] } });
  fireEvent.change(view.getByLabelText('판 이름'), { target: { value: 'v-too-large' } });

  expect(view.getByText(/SE·TE 파일 합계는 3MB/)).toBeTruthy();
  expect(view.getByRole('button', { name: '올리기' })).toHaveProperty('disabled', true);
  fireEvent.click(view.getByRole('button', { name: '올리기' }));
  expect(postCount).toBe(0);
});

it('이력에는 쓰는 단추가 없다 — 다른 쓰기가 남긴 것을 읽기만 한다', async () => {
  const view = wrap(<BookHistory />);
  // 칩과 줄 양쪽에 같은 글자가 나오므로 getAll 로 센다
  await waitFor(() => expect(view.getAllByText('Between the Lines · v2026.08').length).toBeGreaterThan(0));
  const names = [...view.container.querySelectorAll('button')].map((b) => b.textContent ?? '');
  // 칩(필터)만 있고 쓰기 단추는 없다
  expect(names.some((n) => /올리|바꾸|만들|지우|삭제|저장/.test(n))).toBe(false);
});

it('칩 이름은 서버가 준 낱말이다 — 화면에 코드표를 다시 적지 않는다 (D-R18)', async () => {
  const view = wrap(<BookHistory />);
  // 칩·줄 라벨 앞에는 기호가 붙는다(§40) — 낱말 자체는 서버 것 그대로
  await waitFor(() => expect(view.getAllByText(/교재 교체/).length).toBeGreaterThan(0));
  expect(view.getAllByText(/교재 업로드/).length).toBeGreaterThan(0);
  // 영문 코드값은 화면에 없다
  const text = view.container.textContent ?? '';
  expect(text).not.toContain('book_swap');
  expect(text).not.toContain('book_upload');
});

it('서버가 모르는 이력 facet을 보내도 query 계약으로 강제 변환하지 않는다', async () => {
  const view = wrap(<BookHistory />, {
    ...historyBoard,
    actions: [...historyBoard.actions, { key: 'future_action', label: '새 동작', count: 1 }],
  });
  await waitFor(() => expect(view.getByText('새 동작 1')).toBeTruthy());
  const button = view.getByText('새 동작 1').closest('button');
  const before = button?.innerHTML;
  fireEvent.click(button!);
  expect(button?.innerHTML).toBe(before);
});

it('날짜 접기는 제어 대상과 열린 상태를 보조기기에 알린다', async () => {
  const view = wrap(<BookHistory />);
  const toggle = await waitFor(() => view.getByRole('button', { name: /26년 9월 12일.*이력 접기/ }));
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const controls = toggle.getAttribute('aria-controls');
  expect(controls).toBe('book-history-2026-09-12');
  expect(view.container.querySelector(`#${controls}`)).not.toBeNull();
});

it('활동 추이는 가장 최근 14일을 오래된 날 → 오늘 순으로 그리고 제목 일수가 막대 수와 같다 (§40)', async () => {
  // 서버 byDay 는 이력 줄 순서(최신 먼저)로 온다. 오래된 쪽 14일을 자르면 오늘이 빠진다.
  const days = Array.from({ length: 18 }, (_, i) => {
    const key = `2026-09-${String(25 - i).padStart(2, '0')}`;
    return { key, label: key, count: 1 + (i % 3) };
  });
  const view = wrap(<BookHistory />, { ...historyBoard, byDay: days });
  await waitFor(() => expect(view.getByText('활동 추이 · 14일')).toBeTruthy());
  const bars = [...view.container.querySelectorAll('div[title]')]
    .map((bar) => bar.getAttribute('title') ?? '')
    .filter((title) => /^2026-09-\d\d \d+건$/.test(title));
  expect(bars).toHaveLength(14);
  expect(bars[0]).toMatch(/^2026-09-12 /);
  expect(bars[13]).toMatch(/^2026-09-25 /);
  const keys = bars.map((title) => title.slice(0, 10));
  expect([...keys].sort()).toEqual(keys);
});

/**
 * §40 막대 높이 — 건수에 비례하되 **칸(96px) 안**에 든다. 전에는 건수 × 14px 라 7건부터 칸을 뚫고 나갔다.
 */
it('활동 추이 막대는 가장 많은 날을 기준으로 줄여 칸 안에 든다 (§40)', async () => {
  const days = [
    { key: '2026-09-20', label: '2026-09-20', count: 1 },
    { key: '2026-09-21', label: '2026-09-21', count: 12 },
    { key: '2026-09-22', label: '2026-09-22', count: 6 },
  ];
  const view = wrap(<BookHistory />, { ...historyBoard, byDay: days });
  await waitFor(() => expect(view.getByText('활동 추이 · 3일')).toBeTruthy());
  const height = (key: string) =>
    parseFloat((view.container.querySelector(`div[title^="${key} "]`) as HTMLElement).style.height);
  const most = height('2026-09-21');
  expect(most).toBeLessThanOrEqual(72);
  expect(height('2026-09-22')).toBeCloseTo(most / 2, 0);
  expect(height('2026-09-20')).toBeLessThan(height('2026-09-22'));
});

/**
 * §40-3 · §40-4 · §40-5 — 갈래 칩 앞에 상위 둘 「● 교재 N · ● 수업 안내 N」(서버 bookCount·guideCount),
 * 행동 칩과 줄 라벨에 기호, 줄 왼쪽 띠 색이 갈래별, 기간 토글은 알약(Segmented).
 */
it('상위 두 갈래 수 · 행동 기호 · 갈래별 띠 색 · 알약 기간 토글 (§40)', async () => {
  const view = wrap(<BookHistory />);
  await waitFor(() => expect(view.getByText('교재 2')).toBeTruthy());
  expect(view.getByText('수업 안내 0')).toBeTruthy();
  // 행동 칩과 줄 라벨에 기호가 붙는다 — 교체 ⇄ · 업로드 ↑
  expect(view.getByText('⇄ 교재 교체 1')).toBeTruthy();
  const swapLine = view.getAllByText('⇄ 교재 교체').find((el) => el.tagName === 'B')!;
  expect(swapLine.closest('[data-history-group]')?.getAttribute('data-history-group')).toBe('swap');
  const uploadLine = view.getAllByText('↑ 교재 업로드').find((el) => el.tagName === 'B')!;
  expect(uploadLine.closest('[data-history-group]')?.getAttribute('data-history-group')).toBe('book');
  // 기간 토글은 알약 — 눌린 칸이 aria-pressed
  expect(view.getByRole('button', { name: '월간' }).getAttribute('aria-pressed')).toBe('true');
});

/** §40-2 — 가리키던 행이 지워진 줄은 서버 문장(「지워진 배부 #23」)을 흐리게 보인다 — 빈칸(—)이 아니다 */
it('지워진 대상의 이력 줄은 무엇이었는지 서버 문장을 그대로 흐리게 보인다 (§40)', async () => {
  const view = wrap(<BookHistory />, {
    ...historyBoard,
    items: [{ ...history[0], id: 99, action: 'book_issue', actionLabel: '교재 배부', entity: 'issue', refId: 23,
      subject: '지워진 배부 #23', refMissing: true }],
  });
  const line = await waitFor(() => view.getByText('지워진 배부 #23'));
  expect(line.className).toContain('text-fg-subtle');
});
