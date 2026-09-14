/** @file-guide
 * 목적: §39 서가의 3축 조회와 교재 등록 입력이 Books 계약으로 이어지는지 검증한다.
 * 책임/재사용: 실제 컴포넌트와 Query hook을 사용하고 HTTP 어댑터만 fixture로 대체한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { BookShelf } from './BookShelf';

const me = {
  id: 2,
  name: '김민수',
  role: 'admin',
  roleLabel: '관리자',
  title: '관리자',
  canAdminPage: true,
  canCrudAll: true,
  canSeeProfit: false,
  canCrudAttendance: true,
  canMoney: false,
  canWage: true,
  canApprove: true,
  canHide: false,
  canGpaPack: true,
} satisfies Me;
const original = api.defaults.adapter;
let mutation: { url?: string; body?: unknown } = {};

afterEach(() => {
  cleanup();
  api.defaults.adapter = original;
  useSession.getState().signOut();
  mutation = {};
});

function setup() {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method !== 'get') {
      mutation = { url: config.url, body: JSON.parse(config.data ?? '{}') };
      return { config, status: 201, statusText: 'Created', headers: {}, data: { id: 9, code: 'NEW', title: '신규 교재' } };
    }
    const data =
      config.url === '/books'
        ? {
            items: [
              {
                id: 4,
                code: 'SAT',
                title: 'SAT Reading',
                subKey: 'sat',
                subName: 'SAT',
                level: 'Foundation',
                grade: 'G12',
                pages: 100,
                issueCount: 2,
                hasNewer: false,
                hasFile: true,
                seFileId: 1,
                teFileId: 2,
              },
              {
                id: 5,
                code: 'WR',
                title: 'Writing',
                subKey: 'writing',
                subName: 'Writing',
                level: 'SAT',
                grade: 'G11',
                pages: 80,
                issueCount: 1,
                hasNewer: false,
                hasFile: false,
              },
            ],
            bySub: { SAT: 1, Writing: 1 },
            newerCount: 0,
            noFileCount: 1,
            levels: ['Foundation', 'SAT'],
            grades: ['G11', 'G12'],
          }
        : {
            kinds: [],
            subs: [{ key: 'sat', name: 'SAT', color: '#123456' }],
            rooms: [],
            zaccs: [],
            invTypes: [],
            staff: [],
            students: [],
          };
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <BookShelf />
    </QueryClientProvider>,
  );
}

it('과목·레벨·학년 3축 필터를 서버 값으로 구성한다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('SAT Reading')).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: '과목 SAT 1' }));
  expect(view.queryByRole('heading', { name: 'Writing' })).toBeNull();
  expect(view.getByText('SAT Reading')).toBeTruthy();
});

it('원본 F/P/M 색은 확정 레벨에만 적용하고 다른 서버 레벨은 원문을 보존한다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('SAT Reading')).toBeTruthy());
  const foundationCard = view.getByText('SAT Reading').closest('article');
  const satCard = view.getByRole('heading', { name: 'Writing', level: 4 }).closest('article');
  expect(foundationCard).not.toBeNull();
  expect(satCard).not.toBeNull();
  expect(within(foundationCard!).getByLabelText('레벨 Foundation').parentElement?.classList.contains('bg-red')).toBe(true);
  expect(within(satCard!).getByLabelText('레벨 SAT').parentElement?.classList.contains('bg-fg-2')).toBe(true);
  expect(within(satCard!).queryByText('S')).toBeNull();
});

it('과목 그룹은 서버 이름을 유지하고 공용 과목색 선택기를 쓴다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('heading', { name: 'SAT' })).toBeTruthy());
  const satHeader = view.getByRole('heading', { name: 'SAT' }).parentElement;
  const writingHeader = view.getByRole('heading', { name: 'Writing', level: 3 }).parentElement;
  expect(satHeader?.getAttribute('style')).toContain('border-bottom-color: rgb(18, 52, 86)');
  expect(writingHeader?.getAttribute('style')).toContain('border-bottom-color: var(--sub-writing)');
});

it('교재 등록은 입력값을 BookWrite DTO로 전송한다', async () => {
  const view = setup();
  await waitFor(() => view.getByRole('button', { name: '+ 교재' }));
  fireEvent.click(view.getByRole('button', { name: '+ 교재' }));
  const inputs = view.getAllByRole('textbox');
  fireEvent.change(inputs[0], { target: { value: 'NEW' } });
  fireEvent.change(inputs[1], { target: { value: '신규 교재' } });
  fireEvent.change(view.getByRole('combobox'), { target: { value: 'sat' } });
  fireEvent.change(inputs[2], { target: { value: 'L3' } });
  fireEvent.change(inputs[3], { target: { value: 'G12' } });
  fireEvent.change(view.getByRole('spinbutton'), { target: { value: '120' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(mutation.url).toBe('/books'));
  expect(mutation.body).toEqual({ code: 'NEW', title: '신규 교재', subKey: 'sat', level: 'L3', grade: 'G12', pages: 120 });
});

it('넓은 화면은 원본처럼 한 줄 다섯 권이며 카드 작업 이름에 교재를 붙인다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: 'SAT Reading 편집' })).toBeTruthy());
  expect(view.getByRole('button', { name: 'SAT Reading 새 판 올리기' })).toBeTruthy();
  expect(view.getByText('SAT Reading').closest('section')?.querySelector('.grid')?.className).toContain('2xl:grid-cols-5');
});
