/** @file-guide
 * 목적: §39 서가의 3축 필터(서버가 거름)·두 층 분류 카드·교재 등록(첫 판)/수정 입력이 Books 계약으로 이어지는지 검증한다.
 * 책임/재사용: 실제 컴포넌트와 Query hook을 사용하고 HTTP 어댑터만 fixture로 대체한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Book, Books, Me } from '@/api/types';
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
let mutation: { url?: string; method?: string; body?: unknown } = {};
let gets: Array<Record<string, unknown>> = [];

afterEach(() => {
  cleanup();
  api.defaults.adapter = original;
  useSession.getState().signOut();
  mutation = {};
  gets = [];
});

const book = (over: Partial<Book>): Book => ({
  id: 0, code: '', title: '', hasNewer: false, hasFile: true, issueCount: 0,
  subKey: null, subName: null, level: null, grade: null, pages: null,
  bookSubjectKey: null, bookSubjectName: null, bookSubjectColor: null, bookCategoryKey: null, bookCategoryName: null,
  bookLevel: null, levelLabel: null, gradeFrom: null, gradeTo: null, gradeLabel: null, examTag: null, examTagLabel: null,
  ...over,
});

/** 원문 §39 컷 모양의 서가 — 분류된 두 권(English · Math)과 아직 「미분류」인 옛 교재 한 권 */
const ITEMS: Book[] = [
  book({
    id: 4, code: 'SAT-FND-001', title: 'SAT Reading Foundation', subKey: 'sat', subName: 'SAT', level: 'AP', grade: '11',
    bookSubjectKey: 'english', bookSubjectName: 'English', bookSubjectColor: '#2563EB', bookCategoryKey: 'reading', bookCategoryName: 'Reading',
    bookLevel: 'foundation', levelLabel: 'Foundation', gradeFrom: 9, gradeTo: 10, gradeLabel: 'G9·G10', examTag: 'sat', examTagLabel: 'SAT',
    pages: 364, issueCount: 11, seFileId: 1, teFileId: 2,
  }),
  book({
    id: 5, code: 'MTH-PA-G6-F-001', title: 'Pre-Algebra 기초 다지기',
    bookSubjectKey: 'math', bookSubjectName: 'Math', bookSubjectColor: '#DC2626', bookCategoryKey: 'pre_algebra', bookCategoryName: 'Pre-Algebra',
    bookLevel: 'practice', levelLabel: 'Practice', gradeFrom: 6, gradeTo: 7, gradeLabel: 'G6·G7', examTag: 'map', examTagLabel: 'MAP',
    pages: 180, issueCount: 10, seFileId: 3, teFileId: 4,
  }),
  book({
    id: 6, code: 'WR', title: 'Writing Builder', subKey: 'writing', subName: 'Writing', level: 'SAT', grade: '11',
    levelLabel: 'SAT', gradeLabel: '11', pages: 80, issueCount: 1, hasFile: false,
  }),
];

const grades = ['K', ...Array.from({ length: 12 }, (_, n) => `G${n + 1}`)];
const SHELF: Books = {
  items: ITEMS,
  bySub: {},
  newerCount: 1,
  noFileCount: 1,
  // 띠의 이름은 서버가 서가 전체에서 고른 줄이다 — 지금 보이는 카드에 없어도 적는다
  newerBooks: [{ id: 30, title: 'Between the Lines · Year 9 Literary Edition', edition: 'v2026.03', latestEdition: 'v2026.08' }],
  noTeBooks: [{ id: 31, title: 'GED Social Studies 커리큘럼' }],
  levels: [],
  grades: [],
  subjects: [
    { key: 'english', label: 'English', color: '#2563EB', count: 9, categories: [
      { key: 'reading', label: 'Reading' }, { key: 'ela', label: 'ELA' }, { key: 'grammar', label: 'Grammar' },
      { key: 'speaking_interview', label: 'Speaking & Interview' }, { key: 'writing', label: 'Writing' },
    ] },
    { key: 'math', label: 'Math', color: '#DC2626', count: 2, categories: [{ key: 'general_math', label: 'General Math' }, { key: 'pre_algebra', label: 'Pre-Algebra' }] },
    { key: 'science', label: 'Science', color: '#16A34A', count: 0, categories: [{ key: 'biology', label: 'Biology' }] },
    { key: 'social_studies', label: 'Social Studies', color: '#D97706', count: 2, categories: [] },
  ],
  unclassified: { key: 'none', label: '미분류', count: 1 },
  levelCounts: [
    { key: 'foundation', label: 'Foundation', count: 5 },
    { key: 'practice', label: 'Practice', count: 7 },
    { key: 'master', label: 'Master', count: 0 },
  ],
  gradeCounts: grades.map((key, grade) => ({ key, label: key, grade, count: grade < 2 ? 0 : 3 })),
  examTags: [{ key: 'sat', label: 'SAT' }, { key: 'map', label: 'MAP' }, { key: 'isee_ssat', label: 'ISEE / SSAT' }],
  versionUploadMaxBytes: 3_000_000,
};

function setup(shelf: (params: Record<string, unknown>) => Books = () => SHELF) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string; params?: Record<string, unknown> }) => {
    if (config.method !== 'get') {
      mutation = { url: config.url, method: config.method, body: JSON.parse(config.data ?? '{}') };
      return { config, status: 201, statusText: 'Created', headers: {}, data: { id: 9, code: 'NEW', title: '신규 교재' } };
    }
    if (config.url === '/books') {
      gets.push(config.params ?? {});
      return { config, status: 200, statusText: 'OK', headers: {}, data: shelf(config.params ?? {}) };
    }
    const meta = {
      kinds: [], subs: [{ key: 'sat', name: 'SAT', color: '#123456' }], rooms: [], zaccs: [], invTypes: [], staff: [], students: [],
    };
    return { config, status: 200, statusText: 'OK', headers: {}, data: meta };
  }) as never;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <BookShelf />
    </QueryClientProvider>,
  );
}

const chip = (view: ReturnType<typeof setup>, group: string, name: string) =>
  within(view.getByRole('group', { name: `${group} 필터` })).getByRole('button', { name });

it('필터는 서버가 건다 — 칩을 누르면 키만 보내고 서버가 준 목록을 그대로 그린다 (N-47)', async () => {
  // 가짜 서버: English 를 고르면 English 한 권만 준다. 화면이 스스로 거른다면 이 응답과 달라진다
  const view = setup((params) => (params.subject === 'english' ? { ...SHELF, items: [ITEMS[0]] } : SHELF));
  await waitFor(() => expect(view.getByText('Pre-Algebra 기초 다지기')).toBeTruthy());
  expect(gets[0]).toEqual({});
  fireEvent.click(chip(view, '과목', 'English 9'));
  await waitFor(() => expect(view.queryByText('Pre-Algebra 기초 다지기')).toBeNull());
  expect(gets.at(-1)).toEqual({ subject: 'english' });
  expect(view.getByText('SAT Reading Foundation')).toBeTruthy();
  // 레벨 · 학년도 키로 간다 — 학년 칩 키는 서버 gradeCounts 의 key 다
  fireEvent.click(chip(view, '레벨', 'Practice 7'));
  await waitFor(() => expect(gets.at(-1)).toEqual({ subject: 'english', level: 'practice' }));
  fireEvent.click(chip(view, '학년', 'G9 3'));
  await waitFor(() => expect(gets.at(-1)).toEqual({ subject: 'english', level: 'practice', grade: 'G9' }));
  // 「전체」는 그 축을 뺀다
  fireEvent.click(within(view.getByRole('group', { name: '과목 필터' })).getByRole('button', { name: '전체' }));
  await waitFor(() => expect(gets.at(-1)).toEqual({ level: 'practice', grade: 'G9' }));
});

it('0 인 칩은 흐리게 선다(K · G1 · Science) — 「미분류」 칩은 분류 안 된 교재가 있을 때만 선다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('SAT Reading Foundation')).toBeTruthy());
  expect(chip(view, '학년', 'K')).toHaveProperty('disabled', true);
  expect(chip(view, '학년', 'G1')).toHaveProperty('disabled', true);
  expect(chip(view, '과목', 'Science')).toHaveProperty('disabled', true);
  expect(chip(view, '과목', '미분류 1')).toHaveProperty('disabled', false);
  // 원문 §39 — 눌린 「전체」는 진한 채움
  expect(within(view.getByRole('group', { name: '과목 필터' })).getByRole('button', { name: '전체' }).querySelector('[data-chip-pressed="ink"]')).toBeTruthy();
  cleanup();
  const none = setup(() => ({ ...SHELF, unclassified: { key: 'none', label: '미분류', count: 0 } }));
  await waitFor(() => expect(none.getByText('SAT Reading Foundation')).toBeTruthy());
  expect(within(none.getByRole('group', { name: '과목 필터' })).queryByRole('button', { name: /미분류/ })).toBeNull();
});

/**
 * 원본 §39 — 연초록 필터 판이 **경고 띠 위**에 있고, 1줄 = 과목 칩 + 레벨 칩, 2줄 = 학년 칩이다. 칩 앞에 색 점, 뒤에 건수(g4 §39-2).
 * 과목 점은 코드표 색, 레벨 점은 카드 띠와 같은 F/P/M 색이다.
 */
it('필터 판은 경고 띠 위에 두 줄로 서고 칩마다 색 점과 건수가 붙는다 (§39-2)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('SAT Reading Foundation')).toBeTruthy());
  const filters = view.getByTestId('shelf-filters');
  const band = view.getByText('TE 없는 교재 1종');
  expect(filters.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const rows = filters.querySelectorAll('[data-filter-row]');
  expect(rows.length).toBe(2);
  expect(within(rows[0] as HTMLElement).getByRole('group', { name: '과목 필터' })).toBeTruthy();
  expect(within(rows[0] as HTMLElement).getByRole('group', { name: '레벨 필터' })).toBeTruthy();
  expect(within(rows[1] as HTMLElement).getByRole('group', { name: '학년 필터' })).toBeTruthy();
  expect((chip(view, '과목', 'English 9').querySelector('[data-chip-dot]') as HTMLElement).style.backgroundColor).toBe('rgb(37, 99, 235)');
  expect((chip(view, '레벨', 'Foundation 5').querySelector('[data-chip-dot]') as HTMLElement).style.backgroundColor).toBe('var(--red)');
  expect((chip(view, '레벨', 'Practice 7').querySelector('[data-chip-dot]') as HTMLElement).style.backgroundColor).toBe('var(--amber)');
});

it('카드는 원문 모양이다 — 소분류(과목 색) · 학년 범위 · 시험 태그 · F/P/M 띠, 옛 교재는 옛 원문을 중립색으로 (N-47)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('SAT Reading Foundation')).toBeTruthy());
  const sat = view.getByRole('heading', { name: 'SAT Reading Foundation', level: 4 }).closest('article') as HTMLElement;
  expect(within(sat).getByLabelText('레벨 Foundation').parentElement?.classList.contains('bg-red')).toBe(true);
  expect((sat.querySelector('[data-book-category]') as HTMLElement).textContent).toBe('Reading');
  expect((sat.querySelector('[data-book-category]') as HTMLElement).style.color)
    .toBe('color-mix(in srgb, #2563EB 30%, var(--fg))');
  expect(within(sat).getByText('G9·G10')).toBeTruthy();
  expect(within(sat).getByText('SAT').closest('span')?.className).toContain('bg-fg-2');
  const math = view.getByRole('heading', { name: 'Pre-Algebra 기초 다지기', level: 4 }).closest('article') as HTMLElement;
  expect(within(math).getByLabelText('레벨 Practice').parentElement?.classList.contains('bg-amber')).toBe(true);
  expect(within(math).getByText('MAP').closest('span')?.className).toContain('bg-teal');
  const old = view.getByRole('heading', { name: 'Writing Builder', level: 4 }).closest('article') as HTMLElement;
  expect(within(old).getByLabelText('레벨 SAT').parentElement?.classList.contains('bg-fg-2')).toBe(true);
  expect(within(old).getByText('11')).toBeTruthy();
  expect(old.querySelector('[data-book-category]')).toBeNull();
});

it('묶음은 서버 차례의 과목마다 서고 머리에 과목 색 · 보이는 소분류 · 권수를 적는다 — 「미분류」는 맨 뒤 (§39)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('heading', { name: 'English', level: 3 })).toBeTruthy());
  const groups = [...view.container.querySelectorAll('[data-book-group]')].map((g) => g.getAttribute('data-book-group'));
  expect(groups).toEqual(['english', 'math', '__unclassified__']);
  const english = view.getByRole('heading', { name: 'English', level: 3 });
  expect(english.style.color).toBe('color-mix(in srgb, #2563EB 30%, var(--fg))');
  expect(english.parentElement?.getAttribute('style')).toContain('border-bottom-color: rgb(37, 99, 235)');
  expect(english.parentElement?.textContent).toContain('Reading');
  expect(english.parentElement?.textContent).toContain('1종');
  expect(view.getByRole('heading', { name: '미분류', level: 3 }).parentElement?.getAttribute('style')).toContain('var(--fg-subtle)');
});

it('교재 등록은 과목 → 소분류 · 레벨 · 학년 범위 · 시험 태그를 코드표 키로 보낸다 (N-47)', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '+ 교재' }));
  fireEvent.change(view.getByLabelText('코드'), { target: { value: 'NEW' } });
  fireEvent.change(view.getByLabelText('교재명'), { target: { value: '신규 교재' } });
  expect(view.getByLabelText('소분류')).toHaveProperty('disabled', true);
  fireEvent.change(view.getByLabelText('과목'), { target: { value: 'english' } });
  expect([...(view.getByLabelText('소분류') as HTMLSelectElement).options].map((o) => o.textContent))
    .toEqual(['—', 'Reading', 'ELA', 'Grammar', 'Speaking & Interview', 'Writing']);
  fireEvent.change(view.getByLabelText('소분류'), { target: { value: 'grammar' } });
  fireEvent.change(view.getByLabelText('레벨'), { target: { value: 'practice' } });
  fireEvent.change(view.getByLabelText('학년 시작'), { target: { value: '0' } });
  fireEvent.change(view.getByLabelText('학년 끝'), { target: { value: '2' } });
  fireEvent.change(view.getByLabelText('시험'), { target: { value: 'isee_ssat' } });
  fireEvent.change(view.getByLabelText('쪽수'), { target: { value: '120' } });
  fireEvent.change(view.getByLabelText('시간표 과목'), { target: { value: 'sat' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(mutation.url).toBe('/books'));
  expect(mutation.body).toEqual({
    code: 'NEW', title: '신규 교재', pages: 120, subKey: 'sat',
    bookSubjectKey: 'english', bookCategoryKey: 'grammar', bookLevel: 'practice', gradeFrom: 0, gradeTo: 2, examTag: 'isee_ssat',
  });
});

it('과목을 바꾸면 소분류가 비워진다 — 다른 과목의 소분류를 보내지 않는다', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '+ 교재' }));
  fireEvent.change(view.getByLabelText('과목'), { target: { value: 'english' } });
  fireEvent.change(view.getByLabelText('소분류'), { target: { value: 'reading' } });
  fireEvent.change(view.getByLabelText('과목'), { target: { value: 'science' } });
  expect((view.getByLabelText('소분류') as HTMLSelectElement).value).toBe('');
  // 컷에 소분류가 안 보이는 과목(Social Studies)은 고를 소분류가 없다
  fireEvent.change(view.getByLabelText('과목'), { target: { value: 'social_studies' } });
  expect(view.getByLabelText('소분류')).toHaveProperty('disabled', true);
});

it('등록 창의 첫 판 · SE/TE 파일은 교재와 한 요청으로 간다 (N-61)', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '+ 교재' }));
  fireEvent.change(view.getByLabelText('코드'), { target: { value: 'NEW' } });
  fireEvent.change(view.getByLabelText('교재명'), { target: { value: '신규 교재' } });
  const file = (name: string, text: string) => ({ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer }) as File;
  fireEvent.change(view.getByLabelText('학생용 SE 파일'), { target: { files: [file('학생용.pdf', 'SE')] } });
  fireEvent.change(view.getByLabelText('교사용 TE 파일'), { target: { files: [file('교사용.pdf', 'TE')] } });
  // 판 이름이 없으면 파일이 갈 곳이 없다 — 저장을 막고 까닭을 적는다
  expect(view.getByText('판 이름을 적어야 첫 판 · 파일이 함께 올라갑니다')).toBeTruthy();
  expect(view.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true);
  fireEvent.change(view.getByLabelText('판 이름'), { target: { value: 'v2026.09' } });
  fireEvent.change(view.getByLabelText('언제부터'), { target: { value: '2026-09-01' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(mutation.url).toBe('/books'));
  expect(mutation.body).toEqual({
    code: 'NEW', title: '신규 교재',
    firstVersion: {
      edition: 'v2026.09', fromDate: '2026-09-01',
      seFile: { kind: 'lib-se', name: '학생용.pdf', base64: btoa('SE') },
      teFile: { kind: 'lib-te', name: '교사용.pdf', base64: btoa('TE') },
    },
  });
});

it('첫 판 SE+TE 합계가 서버 상한을 넘으면 요청 전에 막는다 (N-61)', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '+ 교재' }));
  fireEvent.change(view.getByLabelText('코드'), { target: { value: 'NEW' } });
  fireEvent.change(view.getByLabelText('교재명'), { target: { value: '신규 교재' } });
  fireEvent.change(view.getByLabelText('판 이름'), { target: { value: 'v1' } });
  const big = (name: string) => ({ name, size: 2_000_000, arrayBuffer: async () => new ArrayBuffer(0) }) as File;
  fireEvent.change(view.getByLabelText('학생용 SE 파일'), { target: { files: [big('se.pdf')] } });
  fireEvent.change(view.getByLabelText('교사용 TE 파일'), { target: { files: [big('te.pdf')] } });
  expect(view.getByText(/SE·TE 파일 합계는 3MB/)).toBeTruthy();
  expect(view.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true);
});

it('교재 수정은 바꾼 칸만 보낸다 — 비운 칸은 null, 과목을 바꾸면 소분류 비움도 함께 (N-47)', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: 'SAT Reading Foundation 편집' }));
  // 옛 칸(레벨 · 학년 원문) 입력은 창에 없다 — 고치지 않고 그대로 남는다(N-25)
  expect((view.getByLabelText('레벨') as HTMLSelectElement).value).toBe('foundation');
  expect((view.getByLabelText('학년 시작') as HTMLSelectElement).value).toBe('9');
  fireEvent.change(view.getByLabelText('레벨'), { target: { value: '' } });
  fireEvent.change(view.getByLabelText('과목'), { target: { value: 'math' } });
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(mutation.url).toBe('/books/4'));
  expect(mutation.method).toBe('patch');
  expect(mutation.body).toEqual({ bookSubjectKey: 'math', bookCategoryKey: null, bookLevel: null });
});

it('교재 수정에서 아무것도 안 바꾸면 요청 없이 닫는다', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: 'SAT Reading Foundation 편집' }));
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(view.queryByText(/교재 수정 —/)).toBeNull());
  expect(mutation.url).toBeUndefined();
});

it('교재 생성에서 비운 선택 정보는 생략한다', async () => {
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
  const se = await view.findByRole('button', { name: 'SAT Reading Foundation SE 내려받기' });
  expect(se.textContent).toBe('SE');
  expect(view.getByRole('button', { name: 'SAT Reading Foundation TE 내려받기' }).textContent).toBe('TE');
  const line = se.closest('[data-book-file-line]') as HTMLElement;
  expect(line.querySelector('[data-book-code]')?.textContent).toBe('SAT-FND-001');
  const writing = view.getByRole('heading', { name: 'Writing Builder', level: 4 }).closest('article') as HTMLElement;
  expect(within(writing).queryByRole('button', { name: /Writing Builder (SE|TE) 내려받기/ })).toBeNull();
  expect(within(writing).getByText('TE 없음')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'SE 열기' })).toBeNull();
});

it('넓은 화면은 원본처럼 한 줄 다섯 권이며 카드 작업 이름에 교재를 붙인다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: 'SAT Reading Foundation 편집' })).toBeTruthy());
  expect(view.getByRole('button', { name: 'SAT Reading Foundation 새 판 올리기' })).toBeTruthy();
  expect(view.getByText('SAT Reading Foundation').closest('section')?.querySelector('.grid')?.className).toContain('2xl:grid-cols-5');
});

it('경고 띠 둘은 서버가 서가 전체에서 고른 이름을 적는다 — 필터로 좁혀도 흔들리지 않는다 (§39)', async () => {
  const view = setup((params) => (params.subject === 'math' ? { ...SHELF, items: [ITEMS[1]] } : SHELF));
  const newer = (await view.findByText('더 최신 판이 있는 교재 1종')).closest('div') as HTMLElement;
  expect(newer.textContent).toContain('Between the Lines · Year 9 Literary Edition v2026.03→v2026.08');
  expect(newer.textContent).toContain('판 버튼을 눌러 바꿉니다');
  const noTe = view.getByText('TE 없는 교재 1종').closest('div') as HTMLElement;
  expect(noTe.textContent).toContain('GED Social Studies 커리큘럼');
  expect(noTe.textContent).toContain('강사에게 보낼 파일이 없습니다');
  fireEvent.click(chip(view, '과목', 'Math 2'));
  await waitFor(() => expect(view.queryByText('SAT Reading Foundation')).toBeNull());
  expect(view.getByText('TE 없는 교재 1종').closest('div')?.textContent).toContain('GED Social Studies 커리큘럼');
});

it('고른 칩에 맞는 교재가 없으면 그렇게 말한다 — 칩 줄은 그대로 선다', async () => {
  const view = setup((params) => (params.level === 'foundation' ? { ...SHELF, items: [] } : SHELF));
  await waitFor(() => expect(view.getByText('SAT Reading Foundation')).toBeTruthy());
  fireEvent.click(chip(view, '레벨', 'Foundation 5'));
  expect(await view.findByText('고른 칩에 맞는 교재가 없습니다')).toBeTruthy();
  expect(view.getByRole('group', { name: '레벨 필터' })).toBeTruthy();
});
