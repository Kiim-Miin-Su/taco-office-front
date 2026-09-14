/** @file-guide
 * 목적: `/books`가 이전 2탭이 아니라 명세서 §38~§41 네 화면을 올바른 순서로 조립하는지 검증한다.
 * 책임/재사용: route 조립만 시험하고 도메인 동작은 각 컴포넌트 테스트에 맡긴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  canGpaPack: true, search: '', replace: vi.fn(), packsEnabled: vi.fn(), packFocus: vi.fn(),
}));

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock('@/api/queries', () => ({
  useBooks: () => ({ data: { items: Array(14).fill({}), newerCount: 20, noFileCount: 10 } }),
  useBookTracking: () => ({ data: { students: Array(5).fill({}), states: [{ key: 'wait', count: 9 }] } }),
  useBookPacks: (enabled: boolean) => {
    state.packsEnabled(enabled);
    return { data: { items: [{ state: 'delivered' }, { state: 'received' }] } };
  },
  useBookHistory: () => ({ data: { total: 18 } }),
  useDrawer: () => ({ data: { workSummary: { total: 16, now: 6, items: [] } } }),
}));
vi.mock('@/store/useSession', () => ({
  useSession: (select: (session: { me: { canGpaPack: boolean } }) => unknown) => select({ me: state }),
}));
vi.mock('@/components/books/BookTracking', () => ({ BookTracking: () => <p>트래킹 본문</p> }));
vi.mock('@/components/books/BookShelf', () => ({ BookShelf: () => <p>서가 본문</p> }));
vi.mock('@/components/books/BookPacks', () => ({
  BookPacks: ({ focusPackId }: { focusPackId?: number | null }) => {
    state.packFocus(focusPackId);
    return <p>자료 요청 본문</p>;
  },
}));
vi.mock('@/components/books/BookVersions', () => ({ BookHistory: () => <p>이력 본문</p> }));

import BooksPage from './page';

afterEach(() => {
  cleanup();
  state.canGpaPack = true;
  state.search = '';
  state.replace.mockReset();
  state.packsEnabled.mockReset();
  state.packFocus.mockReset();
});

it('원본 순서의 네 탭과 서버 건수를 표시하고 화면을 전환한다', () => {
  const view = render(<BooksPage />);
  expect([...view.getAllByRole('tab')].map((tab) => tab.textContent)).toEqual([
    expect.stringContaining('트래킹 보드'),
    expect.stringContaining('서가'),
    expect.stringContaining('자료 요청'),
    expect.stringContaining('이력'),
  ]);
  expect(view.getByRole('button', { name: '경고 6' })).toBeTruthy();
  expect(view.queryByRole('button', { name: '경고 39' })).toBeNull();
  expect(view.getByText('트래킹 본문')).toBeTruthy();
  fireEvent.click(view.getByRole('tab', { name: /자료 요청/ }));
  expect(view.getByText('자료 요청 본문')).toBeTruthy();
  expect(state.replace).toHaveBeenLastCalledWith('/books?tab=requests', { scroll: false });
  fireEvent.click(view.getByRole('tab', { name: /이력/ }));
  expect(view.getByText('이력 본문')).toBeTruthy();
  expect(state.replace).toHaveBeenLastCalledWith('/books?tab=history', { scroll: false });
});

it('canGpaPack이 없으면 자료 요청 탭과 조회를 두지 않는다', () => {
  state.canGpaPack = false;
  state.search = 'tab=requests';
  const view = render(<BooksPage />);
  expect(view.queryByRole('tab', { name: /자료 요청/ })).toBeNull();
  expect(view.getByText('트래킹 본문')).toBeTruthy();
  expect(state.packsEnabled).toHaveBeenCalledWith(false);
  expect(view.queryByText('자료 요청 본문')).toBeNull();
});

it('URL tab을 첫 화면에 반영하고 선택·브라우저 이동을 양방향 동기화한다', () => {
  state.search = 'student=3&tab=requests';
  const view = render(<BooksPage />);
  expect(view.getByText('자료 요청 본문')).toBeTruthy();
  fireEvent.click(view.getByRole('tab', { name: /서가/ }));
  expect(state.replace).toHaveBeenLastCalledWith('/books?student=3&tab=shelf', { scroll: false });
  state.search = 'student=3&tab=history';
  view.rerender(<BooksPage />);
  expect(view.getByText('이력 본문')).toBeTruthy();
});

it('잘못된 URL tab은 안전하게 트래킹으로 되돌린다', () => {
  state.search = 'tab=unknown';
  const view = render(<BooksPage />);
  expect(view.getByText('트래킹 본문')).toBeTruthy();
});

it('자료 요청 deep link의 pack identity를 도메인 컴포넌트에 전달한다', () => {
  state.search = 'tab=requests&pack=7';
  render(<BooksPage />);
  expect(state.packFocus).toHaveBeenLastCalledWith(7);
});
