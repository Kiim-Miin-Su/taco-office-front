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
import { BookHistory, BookVersionBadge } from './BookVersions';

const me: Me = {
  id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const base: Book = {
  id: 3, code: 'ENG-RD-G9-P-001', title: 'Between the Lines', subKey: 'reading', subName: 'Reading',
  level: 'P', grade: 'G9', pages: 284, seTe: 'SE',
  edition: 'v2026.03', latestEdition: 'v2026.08', hasNewer: true, versId: 11, latestVersId: 12, hasFile: true,
};

const history: BookHistoryRow[] = [
  { id: 9, action: 'book_swap', actionLabel: '교재 교체', entity: 'vers', refId: 12, subject: 'Between the Lines · v2026.08', byName: '김민선', at: '2026-09-12T10:00:00+09:00' },
  { id: 8, action: 'book_upload', actionLabel: '교재 업로드', entity: 'vers', refId: 12, subject: 'Between the Lines · v2026.08', byName: '김범준', at: '2026-09-11T09:20:00+09:00' },
];

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let patched: string | null = null;
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); patched = null;
});

function wrap(node: React.ReactNode, data: unknown = history) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string }) => {
    if (config.method === 'patch') { patched = config.url ?? null; return { config, status: 200, statusText: 'OK', headers: {}, data: {} }; }
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
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
  expect(patched).toBe('/books/versions/12/use');   // 11 이 아니다
});

it('판이 없으면 「판 없음」이고 ⇧ 도 없다', () => {
  const view = wrap(<BookVersionBadge book={{ ...base, edition: null, latestEdition: null, hasNewer: false, versId: null, latestVersId: null }} />);
  expect(view.getByText('판 없음')).toBeTruthy();
  expect(view.container.querySelectorAll('button')).toHaveLength(0);
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
