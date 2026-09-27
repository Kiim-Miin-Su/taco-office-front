/** @file-guide
 * 목적: §34~§36 수업 현황판 — 제목과 탭 낱말은 컷의 것이다 (C68).
 * 책임/재사용: 실제 BoardPage 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me } from '@/api/types';
import { todayKst } from '@/lib/calendar';
import { useSession } from '@/store/useSession';
import BoardPage from './page';

// 주별·월별 칸은 오늘이 든 주·달에 놓인다 — 표본 수업 날짜를 오늘로 둔다
const TODAY = todayKst();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

const mount = async () => {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: unknown) => ({
    config, status: 200, statusText: 'OK', headers: {},
    data: { from: '2026-09-13', to: '2026-09-13', rows: [], weeks: [], teachers: [], summary: null },
  })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const v = render(<QueryClientProvider client={client}><BoardPage /></QueryClientProvider>);
  await waitFor(() => expect(v.getByText('수업 현황판')).toBeTruthy());
  return v;
};

/**
 * 컷 §34·§35·§36 은 **셋 다 같은 제목과 부제**를 쓴다. 우리는 탭마다 바꿔 달고 있었고,
 * 그래서 탭 이름이 「주간」인데 바로 위 제목은 「주별 현황판」이라 **한 화면에서 낱말이 갈렸다.**
 */
it('탭을 바꿔도 제목과 부제는 그대로다 — 컷 셋이 같은 한 줄을 쓴다', async () => {
  const v = await mount();
  const sub = '수업마다 교재 · 안내 · 줌 · 리포트가 다 됐는지 한눈에 봅니다';
  expect(v.getByText(sub)).toBeTruthy();
  fireEvent.click(v.getByRole('button', { name: '주별' }));
  expect(v.getByText('수업 현황판')).toBeTruthy();
  expect(v.getByText(sub)).toBeTruthy();
  fireEvent.click(v.getByRole('button', { name: '월별' }));
  expect(v.getByText('수업 현황판')).toBeTruthy();
  // 제목이 탭을 따라가면 여기서 「월별 현황판」이 잡힌다
  expect(v.queryByText('월별 현황판')).toBeNull();
});

it('탭 이름은 컷의 「일별 · 주별 · 월별」이다', async () => {
  const v = await mount();
  for (const word of ['일별', '주별', '월별']) expect(v.getByRole('button', { name: word })).toBeTruthy();
  for (const word of ['일간', '주간', '월간']) expect(v.queryByRole('button', { name: word })).toBeNull();
});

/**
 * 원본 §34~§36 의 머리는 **세 탭 공통 여섯 칸**이다 — 「3/20 다 됐음 · 16 교재 안 됨 ·
 * 3 안내 안 됨 · 2 줌 없음 · 0 리포트 안 씀 · 0 휴강」. 「완료율 %」 하나로는
 * *무엇이* 덜 됐는지를 말하지 못한다.
 */
it('머리 여섯 칸은 세 탭에 다 서고, 숫자는 서버가 센 것을 그대로 쓴다 (§34~§36)', async () => {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: unknown) => ({
    config, status: 200, statusText: 'OK', headers: {},
    data: {
      from: '2026-09-13', to: '2026-09-13', rows: [], weeks: [], teacherRows: [],
      missingCount: 17, computedAt: '2026-09-13T00:00:00.000Z',
      summary: {
        lessons: 20, doneLessons: 3, canceled: 0, missing: 21, completionRate: 74,
        marks: [
          { key: 'book', done: 4, total: 20, missing: 16 },
          { key: 'guide', done: 17, total: 20, missing: 3 },
          { key: 'zoom', done: 5, total: 7, missing: 2 },
          { key: 'report', done: 20, total: 20, missing: 0 },
        ],
      },
    },
  })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const v = render(<QueryClientProvider client={client}><BoardPage /></QueryClientProvider>);
  await waitFor(() => expect(v.getByText('3/20')).toBeTruthy());

  const head = () => {
    const t = v.container.textContent ?? '';
    return ['다 됐음', '교재 안 됨', '안내 안 됨', '줌 없음', '리포트 안 씀', '휴강'].every((w) => t.includes(w));
  };
  expect(head()).toBe(true);
  expect(v.getByText('16')).toBeTruthy();   // 교재 안 됨
  expect(v.getByText('3')).toBeTruthy();    // 안내 안 됨
  expect(v.getByText('2')).toBeTruthy();    // 줌 없음

  // 세 탭 공통 — 탭을 바꿔도 같은 여섯 칸이 선다
  fireEvent.click(v.getByRole('button', { name: '주별' }));
  await waitFor(() => expect(v.getByText('3/20')).toBeTruthy());
  expect(head()).toBe(true);
  fireEvent.click(v.getByRole('button', { name: '월별' }));
  await waitFor(() => expect(v.getByText('3/20')).toBeTruthy());
  expect(head()).toBe(true);
});

const mark = (key: 'book' | 'guide' | 'zoom' | 'report', done: boolean, na = false) => ({ key, done, na, note: null });
const row = (occId: number, subName: string, over: Record<string, unknown>) => ({
  occId, serId: occId, date: TODAY, onDate: TODAY, startAt: '10:00', endAt: '11:00',
  teacherId: 3, teacherName: '김재훈', roomName: '1호', mode: 'offline', kindKey: 'class', kindName: '수업',
  subKey: 'writing', subName, studentNames: ['학생'], canceled: false,
  marks: [mark('book', true), mark('guide', true), mark('zoom', false, true), mark('report', true)], missing: 0, ...over,
});

const mountWith = async (
  onBoard: (params: Record<string, unknown>) => void = () => undefined,
  extra: Record<string, unknown> = {},
) => {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; params?: Record<string, unknown> }) => {
    if (config.url === '/board') onBoard(config.params ?? {});
    const data = config.url === '/meta'
      ? {
          kinds: [], rooms: [], zaccs: [], invTypes: [], students: [],
          subs: [{ key: 'writing', name: 'Writing', color: '#123456' }, { key: 'vocab', name: 'Vocabulary', color: '#654321' }],
          staff: [{ id: 3, name: '김재훈' }, { id: 5, name: '김범준' }, { id: 9, name: '대표' }],
        }
      : {
          from: '2026-09-13', to: '2026-09-13', missingCount: 1, computedAt: '2026-09-13T00:00:00.000Z',
          rows: [
            row(1, '교재빠진수업', { marks: [mark('book', false), mark('guide', true), mark('zoom', false, true), mark('report', true)], missing: 1 }),
            row(2, '다된수업', {}),
            row(3, '휴강수업', { canceled: true }),
          ],
          teacherRows: [], weeks: [],
          days: [{ date: TODAY, lessons: 2, remaining: 1, canceled: 1, subKeys: ['writing'] }],
          // 그 기간에 나온 과목·강사만 — meta 의 Vocabulary · 대표는 이 기간에 없다
          facets: { subjects: [{ key: 'writing', name: 'Writing', lessons: 2 }], teachers: [{ id: 3, name: '김재훈', lessons: 2 }, { id: 5, name: '김범준', lessons: 1 }] },
          summary: {
            lessons: 2, doneLessons: 1, canceled: 1, missing: 1, completionRate: 83,
            marks: [
              { key: 'book', done: 1, total: 2, missing: 1 },
              { key: 'guide', done: 2, total: 2, missing: 0 },
              { key: 'zoom', done: 0, total: 0, missing: 0 },
              { key: 'report', done: 2, total: 2, missing: 0 },
            ],
          },
          ...extra,
        };
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const v = render(<QueryClientProvider client={client}><BoardPage /></QueryClientProvider>);
  await waitFor(() => expect(v.getByText('교재빠진수업')).toBeTruthy());
  return v;
};

/**
 * §34-3 — 필터는 Select 둘이 아니라 **칩 줄 둘**(과목 · 강사)이다. 과목 칩 앞에는 과목색 점.
 * 칩은 **그 기간에 나온** 과목·강사만 선다 — 서버 facet 그대로(21과목·전 직원을 늘어놓지 않는다).
 * 고른 값은 그대로 서버 조회 인자가 된다(화면이 rows 를 다시 거르지 않는다).
 */
it('과목·강사 칩은 그 기간 facet 만 서고, 과목 칩에 과목색 점이 있으며 고른 값을 서버에 보낸다 (§34)', async () => {
  const params: Array<Record<string, unknown>> = [];
  const v = await mountWith((p) => params.push(p));
  expect(v.queryByRole('combobox')).toBeNull();
  const subjects = v.getByRole('group', { name: '과목' });
  await waitFor(() => expect(within(subjects).getByRole('button', { name: 'Writing' })).toBeTruthy());
  // meta 에는 있지만 이 기간에 수업이 없는 과목·직원은 칩이 없다
  expect(within(subjects).queryByRole('button', { name: 'Vocabulary' })).toBeNull();
  // 원문 §34 — 눌린 「전체」는 진한 채움(W11 컷 재대조)
  expect(within(subjects).getByRole('button', { name: '전체' }).querySelector('[data-chip-pressed="ink"]')).toBeTruthy();
  const writing = within(subjects).getByRole('button', { name: 'Writing' });
  expect(writing.getAttribute('aria-pressed')).toBe('false');
  const dot = writing.querySelector('[data-chip-dot]') as HTMLElement | null;
  expect(dot?.style.backgroundColor).toBe('rgb(18, 52, 86)');
  fireEvent.click(writing);
  await waitFor(() => expect(params.some((p) => p.subKey === 'writing')).toBe(true));
  expect(within(subjects).getByRole('button', { name: 'Writing' }).getAttribute('aria-pressed')).toBe('true');

  const teachers = v.getByRole('group', { name: '강사' });
  expect(within(teachers).queryByRole('button', { name: '대표' })).toBeNull();
  fireEvent.click(within(teachers).getByRole('button', { name: '김범준' }));
  await waitFor(() => expect(params.some((p) => p.teacherId === 5)).toBe(true));
});

/**
 * §34-4 — 「상단 요약 클릭 → 해당 항목만 필터」. 머리 칸이 눌리는 단추가 되고,
 * 거르는 근거는 서버가 준 marks·missing·canceled 그대로다(판정 복제 없음). 「미완료만」 체크는 이것으로 대체.
 */
it('머리 칸을 누르면 그 항목만 남고 다시 누르면 풀린다 — 「미완료만」 체크는 없다 (§34)', async () => {
  const v = await mountWith();
  expect(v.queryByRole('checkbox', { name: '미완료만' })).toBeNull();
  const card = (name: RegExp) => v.getByRole('button', { name });
  fireEvent.click(card(/교재 안 됨/));
  expect(card(/교재 안 됨/).getAttribute('aria-pressed')).toBe('true');
  expect(v.getByText('교재빠진수업')).toBeTruthy();
  expect(v.queryByText('다된수업')).toBeNull();
  expect(v.queryByText('휴강수업')).toBeNull();

  fireEvent.click(card(/^휴강/));
  expect(v.getByText('휴강수업')).toBeTruthy();
  expect(v.queryByText('교재빠진수업')).toBeNull();

  fireEvent.click(card(/다 됐음/));
  expect(v.getByText('다된수업')).toBeTruthy();
  expect(v.queryByText('휴강수업')).toBeNull();

  fireEvent.click(card(/다 됐음/));
  expect(card(/다 됐음/).getAttribute('aria-pressed')).toBe('false');
  for (const name of ['교재빠진수업', '다된수업', '휴강수업']) expect(v.getByText(name)).toBeTruthy();
});

/**
 * §34-6 · §34-7 · §34-8 · §34-9 — 날짜 이동은 탭 옆 한 상자 「‹ 26년 9월 13일 일요일 › 오늘」,
 * 원문에 없는 범례 띠 · 머리 칸 부가 줄은 없다. §35-4 주 기간은 「09-07 ~ 09-13」.
 */
it('날짜 상자는 머리에 긴 날짜로, 범례 띠·부가 줄은 없고, 주 기간은 「MM-DD ~ MM-DD」다 (§34 · §35)', async () => {
  const v = await mountWith();
  expect(v.queryByText('색 = 원장에서 매번 다시 판정')).toBeNull();
  expect(v.queryByText('네 축이 전부 선 수업')).toBeNull();
  // 오늘 날짜의 긴 표기 — 「YY년 M월 D일 X요일」
  expect(v.getByText(/^\d{2}년 \d{1,2}월 \d{1,2}일 [일월화수목금토]요일$/)).toBeTruthy();
  fireEvent.click(v.getByRole('button', { name: '주별' }));
  expect(v.getByText(/^\d{2}-\d{2} ~ \d{2}-\d{2}$/)).toBeTruthy();
});

/**
 * §35-1 · §35-2 — 주별은 요일 7칸 카드이고 머리 칸 거르기가 그대로 먹는다(휴강 칸도 — 휴강 카드가 선다).
 * 카드를 누르면 §34 와 같은 수업 상세가 열린다(강사 일별로 이동하지 않는다).
 */
it('주별은 요일 7칸 카드이고 같은 머리 칸으로 거른다 — 휴강 칸도 눌린다 (§34~§35)', async () => {
  const v = await mountWith();
  fireEvent.click(v.getByRole('button', { name: '주별' }));
  await waitFor(() => expect(v.getAllByRole('region')).toHaveLength(7));
  expect(v.queryByRole('table')).toBeNull();
  const cards = () => v.getAllByRole('button', { name: /수업 상세/ });
  await waitFor(() => expect(cards()).toHaveLength(3));
  fireEvent.click(v.getByRole('button', { name: /교재 안 됨/ }));
  expect(cards()).toHaveLength(1);
  expect(cards()[0].getAttribute('aria-label')).toContain('교재빠진수업');
  fireEvent.click(v.getByRole('button', { name: /^휴강/ }));
  expect(v.getByRole('button', { name: /^휴강/ })).toHaveProperty('disabled', false);
  expect(cards()).toHaveLength(1);
  expect(cards()[0].getAttribute('data-state')).toBe('canceled');
});

/**
 * §36-1 · §36-2 · §36-4 — 월별은 머리 여섯 칸 다음 바로 달력. 둘째 숫자 줄(「리포트 미작성」 등 다른 낱말의 같은 수)은 없다.
 * 날짜를 누르면 그날 일별로 간다.
 */
it('월별은 달력이고 둘째 숫자 줄이 없으며, 날짜를 누르면 그날 일별로 간다 (§36)', async () => {
  const params: Array<Record<string, unknown>> = [];
  const v = await mountWith((p) => params.push(p));
  fireEvent.click(v.getByRole('button', { name: '월별' }));
  await waitFor(() => expect(v.getByRole('grid')).toBeTruthy());
  for (const word of ['리포트 미작성', '안내 미발송', '교재 미배부', '완료율']) expect(v.queryByText(word)).toBeNull();
  const first = v.getAllByRole('gridcell').find((cell) => cell.getAttribute('data-date')?.endsWith('-01'))!;
  const date = first.getAttribute('data-date')!;
  fireEvent.click(within(first).getByRole('button'));
  await waitFor(() => expect(params.some((p) => p.from === date && p.to === date)).toBe(true));
  expect(v.getByRole('button', { name: '일별' }).getAttribute('aria-pressed')).toBe('true');
});

/**
 * §34-9 — 0 보다 큰 「안 됨」 칸은 **분홍 채움** + 붉은 수(공용 StatCard `fill`). 0 인 칸 · 「다 됐음」 · 「휴강」은 흰 카드다.
 */
it('0 보다 큰 「안 됨」 머리 칸만 분홍 채움이다 (§34-9)', async () => {
  const v = await mountWith();
  const box = (name: RegExp) => v.getByRole('button', { name }).firstElementChild as HTMLElement;
  expect(box(/교재 안 됨/).className).toContain('bg-red/10');
  expect(box(/다 됐음/).className).toContain('bg-card');
  expect(box(/^휴강/).className).toContain('bg-card');
});
