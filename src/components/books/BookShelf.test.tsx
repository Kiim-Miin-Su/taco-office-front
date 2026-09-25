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

function setup(books: (base: Record<string, unknown>) => Record<string, unknown> = (base) => base) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method !== 'get') {
      mutation = { url: config.url, body: JSON.parse(config.data ?? '{}') };
      return { config, status: 201, statusText: 'Created', headers: {}, data: { id: 9, code: 'NEW', title: '신규 교재' } };
    }
    const data =
      config.url === '/books'
        ? books({
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
          })
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
  fireEvent.click(within(view.getByRole('group', { name: '과목 필터' })).getByRole('button', { name: 'SAT 1' }));
  expect(view.queryByRole('heading', { name: 'Writing' })).toBeNull();
  expect(view.getByText('SAT Reading')).toBeTruthy();
});

/**
 * 원본 §39 — 연초록 필터 판이 **경고 띠 위**에 있고, 1줄 = 과목 칩 + 레벨 칩, 2줄 = 학년 칩이다. 칩 앞에 색 점, 뒤에 건수(g4 §39-2).
 * 과목 점은 공용 과목색, 레벨 점은 카드 띠와 같은 F/P/M 색이다 — 확정 레벨이 아닌 서버 원문 레벨에는 점을 짓지 않는다.
 */
it('필터 판은 경고 띠 위에 두 줄로 서고 칩마다 색 점과 건수가 붙는다 (§39-2)', async () => {
  const view = setup((base) => ({ ...base, levelCounts: [{ key: 'Foundation', label: 'Foundation', count: 1 }, { key: 'SAT', label: 'SAT', count: 1 }],
    gradeCounts: [{ key: 'G11', label: 'G11', count: 1 }, { key: 'G12', label: 'G12', count: 1 }] }));
  await waitFor(() => expect(view.getByText('SAT Reading')).toBeTruthy());
  const filters = view.getByTestId('shelf-filters');
  const band = view.getByText('TE 없는 교재 1종');
  // 문서 차례 — 필터 판이 경고 띠보다 앞선다
  expect(filters.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const rows = filters.querySelectorAll('[data-filter-row]');
  expect(rows.length).toBe(2);
  expect(within(rows[0] as HTMLElement).getByRole('group', { name: '과목 필터' })).toBeTruthy();
  expect(within(rows[0] as HTMLElement).getByRole('group', { name: '레벨 필터' })).toBeTruthy();
  expect(within(rows[1] as HTMLElement).getByRole('group', { name: '학년 필터' })).toBeTruthy();
  const subjectChip = within(view.getByRole('group', { name: '과목 필터' })).getByRole('button', { name: 'SAT 1' });
  expect(subjectChip.querySelector('[data-chip-dot]')).toBeTruthy();
  const foundation = within(view.getByRole('group', { name: '레벨 필터' })).getByRole('button', { name: 'Foundation 1' });
  expect((foundation.querySelector('[data-chip-dot]') as HTMLElement).style.backgroundColor).toBe('var(--red)');
  // 확정 레벨이 아닌 원문 레벨(SAT)에는 점을 짓지 않는다
  expect(within(view.getByRole('group', { name: '레벨 필터' })).getByRole('button', { name: 'SAT 1' }).querySelector('[data-chip-dot]')).toBeNull();
  expect(within(view.getByRole('group', { name: '학년 필터' })).getByRole('button', { name: 'G12 1' })).toBeTruthy();
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

it('교재 수정에서 비운 선택 정보는 null로 보내 저장된 값을 지운다', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: 'SAT Reading 편집' }));
  fireEvent.change(view.getByLabelText('과목'), { target: { value: '' } });
  fireEvent.change(view.getByLabelText('레벨'), { target: { value: '' } });
  fireEvent.change(view.getByLabelText('학년'), { target: { value: '' } });
  fireEvent.change(view.getByLabelText('쪽수'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(mutation.url).toBe('/books/4'));
  expect(mutation.body).toEqual({
    code: 'SAT', title: 'SAT Reading', subKey: null, level: null, grade: null, pages: null,
  });
});

it('교재 생성에서 비운 선택 정보는 기존처럼 생략한다', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '+ 교재' }));
  fireEvent.change(view.getByLabelText('코드'), { target: { value: 'NEW' } });
  fireEvent.change(view.getByLabelText('교재명'), { target: { value: '신규 교재' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(mutation.url).toBe('/books'));
  expect(mutation.body).toEqual({ code: 'NEW', title: '신규 교재' });
});

/*
 * §39-5 (wave 6) — 원문 카드 아래 줄은 「코드 · 작은 SE · TE 배지」다(누르면 내려받기). 배지 이름에 교재를 붙여
 * 스무 권의 「SE」가 한 이름이 되지 않게 하고, 파일이 없으면 누를 수 없는 「TE 없음」으로 남는다.
 */
it('카드 아래 줄은 코드와 작은 「SE」「TE」 배지다 — 이름에 교재를 붙이고 없는 파일은 누를 수 없다 (§39-5)', async () => {
  const view = setup();
  const se = await view.findByRole('button', { name: 'SAT Reading SE 내려받기' });
  expect(se.textContent).toBe('SE');
  expect(view.getByRole('button', { name: 'SAT Reading TE 내려받기' }).textContent).toBe('TE');
  const line = se.closest('[data-book-file-line]') as HTMLElement;
  expect(line.querySelector('[data-book-code]')?.textContent).toBe('SAT');
  const writing = view.getByRole('heading', { name: 'Writing', level: 4 }).closest('article') as HTMLElement;
  expect(within(writing).queryByRole('button', { name: /Writing (SE|TE) 내려받기/ })).toBeNull();
  expect(within(writing).getByText('TE 없음')).toBeTruthy();
  // 옛 「SE 열기」 단추 모양은 카드에 없다 (공용 단추의 기본 모양은 계약서 화면이 그대로 쓴다)
  expect(view.queryByRole('button', { name: 'SE 열기' })).toBeNull();
});

it('넓은 화면은 원본처럼 한 줄 다섯 권이며 카드 작업 이름에 교재를 붙인다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: 'SAT Reading 편집' })).toBeTruthy());
  expect(view.getByRole('button', { name: 'SAT Reading 새 판 올리기' })).toBeTruthy();
  expect(view.getByText('SAT Reading').closest('section')?.querySelector('.grid')?.className).toContain('2xl:grid-cols-5');
});

it('경고 띠 둘은 어느 교재인지와 판 이동을 응답에 있는 값으로 적는다 (§39)', async () => {
  const view = setup((base) => ({
    ...base,
    items: (base.items as Array<Record<string, unknown>>).map((book) =>
      book.id === 4 ? { ...book, edition: 'v2026.03', latestEdition: 'v2026.08', hasNewer: true } : book,
    ),
    newerCount: 1,
    noFileCount: 1,
  }));
  const newer = (await view.findByText('더 최신 판이 있는 교재 1종')).closest('div') as HTMLElement;
  expect(newer.textContent).toContain('SAT Reading v2026.03→v2026.08');
  expect(newer.textContent).toContain('판 버튼을 눌러 바꿉니다');
  const noTe = view.getByText('TE 없는 교재 1종').closest('div') as HTMLElement;
  // 서버 noFileCount 와 같은 칸(teFileId 없음)으로 고른다 — Writing 만 TE 가 없다
  expect(noTe.textContent).toContain('Writing');
  expect(noTe.textContent).not.toContain('SAT Reading');
  expect(noTe.textContent).toContain('강사에게 보낼 파일이 없습니다');
});
