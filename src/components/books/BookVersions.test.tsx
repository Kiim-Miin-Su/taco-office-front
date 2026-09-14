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
  await waitFor(() => expect(view.getAllByText('교재 교체').length).toBeGreaterThan(0));
  expect(view.getAllByText('교재 업로드').length).toBeGreaterThan(0);
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
