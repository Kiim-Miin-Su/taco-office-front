/** @file-guide
 * 목적: §82 GPA 머리·학생 카드·사이클과 S3-c 기록지 URL 입력/저장 전이 회귀.
 * 책임/재사용: 실제 GpaPage·QueryClient·API 훅을 쓰며 Axios adapter로 응답만 통제한다. RequireAuth mock은 실제 권한 검증이 아니다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { GpaBoard, GpaUse, GpaUseCreate } from '@/api/types';
import { family } from '@/api/queries';
import GpaPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

/** 원본 §82 의 수를 그대로 옮긴 한 벌 — 56p 배정 · 32p 사용 · 3p 대기 · 21p 잔여 · 18회 진행 */
const board: GpaBoard = {
  cycle: { id: 3, no: 3, from: '2026-07-27', to: '2026-08-23', closed: false, closedAt: null, closedByName: null, canClose: false, closeBlockedReason: '사이클 끝(8/23)이 지나야 마감할 수 있습니다' },
  hasPrev: true, hasNext: false,
  services: [
    { key: 'hw', name: '숙제 지원', point: 1 },
    { key: 'prj', name: '프로젝트 피드백', point: 2 },
    { key: 'quiz', name: 'Quiz 대비', point: 2 },
    { key: 'test', name: 'Test 대비', point: 4 },
    { key: 'self', name: '자습 지원', point: 6 },
  ],
  totalAlloc: 56, totalUsed: 32, totalWait: 3, totalRemain: 21, totalUses: 18,
  students: [
    { studentId: 5, name: '이하린', grade: null, coordName: 'Hoon', alloc: 12, used: 16, wait: 0, remain: -4, over: true,
      svcs: [{ key: 'test', name: 'Test 대비', count: 4, points: 16 }] },
    { studentId: 4, name: '박하경', grade: null, coordName: '김범준', alloc: 8, used: 8, wait: 2, remain: -2, over: true,
      svcs: [{ key: 'hw', name: '숙제 지원', count: 8, points: 8 }, { key: 'quiz', name: 'Quiz 대비', count: 1, points: 2 }] },
    { studentId: 3, name: '민제인', grade: null, coordName: 'Sophia', alloc: 14, used: 8, wait: 0, remain: 6, over: false,
      svcs: [{ key: 'hw', name: '숙제 지원', count: 4, points: 4 }, { key: 'prj', name: '프로젝트 피드백', count: 2, points: 4 }] },
    { studentId: 2, name: '강라울', grade: null, coordName: 'Kim', alloc: 10, used: 0, wait: 1, remain: 9, over: false,
      svcs: [{ key: 'hw', name: '숙제 지원', count: 1, points: 1 }] },
    { studentId: 1, name: '고은성', grade: null, coordName: null, alloc: 12, used: 0, wait: 0, remain: 12, over: false, svcs: [] },
  ],
  uses: [],
  // 기록 창 「수업 연결」 줄 — 이 사이클 창 안의 GPA 회차와 그날 명단(서버가 준다 · wave 5)
  lessons: [
    { serId: 15, onDate: '2026-08-21', startMin: 1080, endMin: 1125, name: 'GPA 케어', studentIds: [2, 4] },
    { serId: 16, onDate: '2026-08-22', startMin: 1140, endMin: 1200, name: 'GPA 자습', studentIds: [3] },
  ],
};

const originalAdapter = api.defaults.adapter;
const writeClients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of writeClients.splice(0)) client.clear();
  api.defaults.adapter = originalAdapter;
});

function setup(seed: Partial<GpaBoard> = {}) {
  api.defaults.adapter = vi.fn(async (config) => (
    { config, status: 200, statusText: 'OK', headers: {}, data: { ...board, ...seed } }
  )) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><GpaPage /></QueryClientProvider>);
}

it('머리는 다섯 칸이고 다섯째는 포인트가 아니라 **회수**다 (§82)', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('56p'));
  const text = view.container.textContent ?? '';
  for (const w of ['56p', '32p', '3p', '21p', '18회']) expect(text).toContain(w);
  // 「진행」은 승인 대기도 센 값이라 서버가 준 그대로 쓴다 — 화면이 uses 를 세지 않는다
  expect(text).toContain('승인 대기 포함');
});

it('포인트 규정은 갈래마다 칩 하나이고 이월 규칙이 **닫히기 전에도** 보인다', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('포인트 규정'));
  const text = view.container.textContent ?? '';
  for (const w of ['1p 숙제 지원', '2p 프로젝트 피드백', '2p Quiz 대비', '4p Test 대비', '6p 자습 지원']) {
    expect(text).toContain(w);
  }
  expect(text).toContain('이월 없음 · 사이클 종료 시 소멸');
});

it('넘긴 학생을 위에 모아 세고 줄마다 배정·사용·초과를 적는다 (§82 붉은 경고)', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('배정 포인트를 넘긴 학생 2명'));
  const text = view.container.textContent ?? '';
  // 사용은 승인 + 대기다 — 대기도 이미 잔여에서 빠져 있다
  expect(text).toContain('박하경 — 배정 8p / 사용 10p · 2p 초과');
  expect(text).toContain('이하린 — 배정 12p / 사용 16p · 4p 초과');
});

it('포인트 규정 칩은 서비스 색이다 — 숙제 지원 청록 · Quiz 대비 주황 (82-2) · 경고는 굵은 제목 + 점 목록 (86-4)', async () => {
  const view = setup();
  const hw = await view.findByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '1p 숙제 지원');
  expect(hw.className).toContain('text-teal');
  expect(view.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '2p Quiz 대비').className).toContain('text-orange');
  expect(view.getByText('⛔ 배정 포인트를 넘긴 학생 2명').className).toContain('text-red');
  expect(view.getAllByRole('listitem').some((li) => li.textContent?.startsWith('박하경 — 배정 8p'))).toBe(true);
});

it('카드는 서버가 준 순서 그대로 서고 화면이 다시 정렬하지 않는다 — 넘긴 학생이 먼저다', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('학생별 포인트 · 5명'));
  const names = [...view.container.querySelectorAll('input[type=number]')]
    .map((n) => n.getAttribute('aria-label'));
  expect(names).toEqual(['이하린 배정 포인트', '박하경 배정 포인트', '민제인 배정 포인트',
    '강라울 배정 포인트', '고은성 배정 포인트']);
});

it('카드의 서비스 칩은 서버가 준 회수·합계를 그대로 쓰고, 없으면 「사용 없음」이다', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('학생별 포인트 · 5명'));
  const text = view.container.textContent ?? '';
  expect(text).toContain('숙제 지원 8·8p');
  expect(text).toContain('Test 대비 4·16p');
  expect(text).toContain('사용 없음');
  // 초과는 칩이 아니라 남은 값으로 말한다 — 「2p 초과」·「9p 남음」
  expect(text).toContain('2p 초과');
  expect(text).toContain('9p 남음');
});

/* ══ C95 · O-150 사이클 마감 — 서는지·막힌 이유는 서버, 소멸·다음 사이클은 응답 ══ */
it('마감 단추는 서버 canClose 로만 서고 막힌 이유를 title 에 그대로 적는다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByRole('button', { name: '사이클 마감' })).toBeTruthy());
  const btn = view.getByRole('button', { name: '사이클 마감' }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  expect(btn.title).toBe('사이클 끝(8/23)이 지나야 마감할 수 있습니다');
});

it('마감이 열리면 확인 창 → POST /gpa/cycles/{id}/close → 응답의 소멸 포인트와 새 사이클을 띠로 말한다 (O-150)', async () => {
  const posts: string[] = [];
  const cycle = { ...board.cycle!, canClose: true, closeBlockedReason: null };
  api.defaults.adapter = vi.fn(async (config: { url?: string; method?: string }) => {
    if (config.method === 'post') {
      posts.push(config.url ?? '');
      return { config, status: 201, statusText: 'Created', headers: {}, data: {
        cycle: { ...cycle, closed: true, closedAt: '2026-09-18T10:00:00+09:00', closedByName: '김민선', canClose: false, closeBlockedReason: '이미 마감된 사이클입니다' },
        opened: { id: 4, no: 4, from: '2026-08-24', to: '2026-09-20', closed: false, closedAt: null, closedByName: null, canClose: false, closeBlockedReason: '끝 전' },
        expiredPoints: 27, students: [],
      } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: { ...board, cycle } };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><GpaPage /></QueryClientProvider>);
  await waitFor(() => expect((view.getByRole('button', { name: '사이클 마감' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(view.getByRole('button', { name: '사이클 마감' }));
  const dialog = await view.findByRole('dialog', { name: '3차 사이클을 마감할까요?' });
  expect(dialog.textContent).toContain('이월 없음');
  fireEvent.click(within(dialog).getByRole('button', { name: '마감' }));
  await waitFor(() => expect(posts).toEqual(['/gpa/cycles/3/close']));
  await waitFor(() => expect(view.container.textContent).toContain('3차 사이클 마감 — 소멸 27p · 4차 사이클을 열었습니다 (8월 24일 – 9월 20일)'));
});

/**
 * 승인 단추가 서는 조건은 **서버가 준 `canApprove` 하나**다 (S1 · D-R39).
 *
 * 2026-09-20 에 「기록한 사람은 자기 기록을 승인하지 못한다」가 서버와 DB CHECK 에 붙었다.
 * 화면이 대기 상태만 보고 단추를 열면 적은 사람에게는 열려 보이고 누르면 거절당한다 —
 * 그래서 단추와 서버가 같은 질문을 하는지를 여기서 못 박는다.
 */
it('승인 단추는 서버가 준 canApprove 를 따른다 — 적은 사람에게는 서지 않는다 (S1)', async () => {
  const use = (id: number, canApprove: boolean) => ({
    id, studentId: 1, svcKey: 'hw', points: 1, onDate: '2026-08-10', startMin: null, endMin: null, serId: null,
    coordName: '코디', noteUrl: null, state: 'wait' as const, approvedByName: null, approvedOn: null, canApprove,
  });
  const view = setup({ uses: [use(11, true), use(12, false)] });
  await waitFor(() => expect(view.container.textContent).toContain('56p'));
  // 카드를 누르면 그 학생이 골라진다 (82-4)
  fireEvent.click(view.getByRole('button', { name: /^고은성/ }));

  // 「초과」 안내도 목록이라 타임라인 목록 안의 줄만 골라낸다
  const list = await view.findByRole('list', { name: '고은성 소비 타임라인' });
  const rows = within(list).getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByRole('button', { name: '승인' })).toBeTruthy();
  expect(within(rows[1]).queryByRole('button', { name: '승인' })).toBeNull();
  expect(rows[1].textContent).toContain('적은 사람은 승인 못 함');
  // 되돌림·삭제는 자기도 할 수 있다 — 승인이 아니라 취소다
  expect(within(rows[1]).getByRole('button', { name: '삭제' })).toBeTruthy();
});

/*
 * 원문 §82 선택 학생 상세 머리 — 이름 옆 미니 지표 넷 「배정 10p · 쓴 것 0p · 대기 1p · 남은 것 9p」(82-6).
 * 값은 서버가 이미 학생 줄에 준 것이다(alloc · used · wait · remain) — 화면이 uses 를 다시 더하지 않는다.
 */
it('타임라인을 열면 그 학생의 배정 · 쓴 것 · 대기 · 남은 것을 서버 값 그대로 보인다 (82-6)', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('56p'));
  // 강라울 — 배정 10 · 사용 0 · 대기 1 · 잔여 9 · 담당 Kim. 카드를 누르면 골라진다 (82-4)
  fireEvent.click(view.getByRole('button', { name: /^강라울/ }));
  const panel = await waitFor(() => view.getByRole('heading', { name: /강라울 · 소비 타임라인/ }).closest('section')!);
  const stat = (label: string) => {
    const el = [...panel.querySelectorAll('div')].find((d) => d.textContent === label);
    return el?.nextElementSibling?.textContent ?? null;
  };
  expect(stat('배정')).toBe('10p');
  expect(stat('쓴 것')).toBe('0p');
  expect(stat('대기')).toBe('1p');
  expect(stat('남은 것')).toBe('9p');
  expect(panel.textContent).toContain('담당 Kim');
});

/* ══ §82 원문 배치 — 사이클 이동기 · 카드 고르기 · 회차 내역 (82-1 · 82-3 · 82-4 · 82-8) ══ */

it('머리 첫 칸이 사이클 이동기다 — 「‹ 3차 사이클 [진행 중] 2026-07-27 ~ 2026-08-23 ›」 (82-1)', async () => {
  const view = setup();
  const prev = await view.findByRole('button', { name: '이전 사이클' });
  const card = prev.parentElement!;
  expect(card.textContent).toBe('‹3차 사이클진행 중2026-07-27 ~ 2026-08-23›');
  // 이전·다음이 있는지는 서버가 말한다 — hasPrev · hasNext
  expect((prev as HTMLButtonElement).disabled).toBe(false);
  expect((view.getByRole('button', { name: '다음 사이클' }) as HTMLButtonElement).disabled).toBe(true);
});

it('부제는 원문 그대로 「4주 사이클 · 포인트제 · 내부 자료 · 학부모 비공개」이고 뒤 둘만 붉다 (82-3)', async () => {
  const view = setup();
  const sub = await view.findByText((_, el) => el?.tagName === 'P' && el.textContent === '4주 사이클 · 포인트제 · 내부 자료 · 학부모 비공개');
  expect(within(sub).getByText('내부 자료 · 학부모 비공개').className).toBe('text-red');
});

it('카드를 누르면 그 학생이 골라지고 다시 누르면 풀린다 — 카드가 단추다 (82-4)', async () => {
  const view = setup();
  const card = await view.findByRole('button', { name: /^강라울/ });
  expect(card.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(card);
  expect(view.getByRole('button', { name: /^강라울/ }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByRole('heading', { name: /강라울 · 소비 타임라인/ })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: /^강라울/ }));
  expect(view.queryByRole('heading', { name: /강라울 · 소비 타임라인/ })).toBeNull();
  // 배정 편집 줄은 카드 **밖**이다 — 단추 안에 입력칸을 넣을 수 없다
  expect(card.querySelector('input')).toBeNull();
});

it('고른 학생의 「회차 내역」은 읽는 표다 — 날짜·시간(끝은 서버 값)·서비스·P·코디·기록지·상태 (82-8)', async () => {
  const use = (id: number, o: Partial<GpaUse>): GpaUse => ({
    id, studentId: 2, svcKey: 'hw', points: 1, onDate: '2026-08-21', startMin: 1080, endMin: 1125, serId: 9,
    coordName: 'Kim', noteUrl: null, state: 'wait', approvedByName: null, approvedOn: null, canApprove: true, ...o,
  });
  const view = setup({ uses: [use(21, {}), use(22, { onDate: '2026-08-22', endMin: null, noteUrl: 'http://example.test/n', state: 'ok', svcKey: 'prj', points: 2 })] });
  fireEvent.click(await view.findByRole('button', { name: /^강라울/ }));
  const panel = view.getByRole('heading', { name: /강라울 회차 내역/ }).closest('section')!;
  expect(panel.textContent).toContain('2건');
  const heads = [...panel.querySelectorAll('th')].map((th) => th.textContent);
  expect(heads).toEqual(['날짜 · 시간', '학생', '서비스', 'P', '코디네이터', '기록지', '상태']);
  const rows = [...panel.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
  expect(rows).toEqual([
    ['08-21 18:00–18:45', '강라울', '숙제 지원', '1', 'Kim', '—', '승인 대기'],
    // 연결 회차가 없으면 끝을 지어내지 않는다 · 안전한 기록지 URL은 열기 링크다
    ['08-22 18:00', '강라울', '프로젝트 피드백', '2', 'Kim', '열기', '승인'],
  ]);
  const link = within(panel).getByRole('link', { name: '강라울 08-22 기록지 열기' });
  expect(link.getAttribute('href')).toBe('http://example.test/n');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noreferrer');
});

it.each([
  ['javascript', 'javascript:alert(1)'],
  ['data', 'data:text/html,test'],
  ['credentials', 'https://user:password@example.test/n'],
  ['backslash', 'https://example.test\\note'],
] as const)('검증 도입 전의 %s 기록지 URL은 링크로 활성화하지 않는다', async (_name, noteUrl) => {
  const unsafe: GpaUse = {
    id: 23, studentId: 2, svcKey: 'hw', points: 1, onDate: '2026-08-21', startMin: 1080, endMin: 1125, serId: 9,
    coordName: 'Kim', noteUrl, state: 'wait', approvedByName: null, approvedOn: null, canApprove: true,
  };
  const view = setup({ uses: [unsafe] });
  fireEvent.click(await view.findByRole('button', { name: /^강라울/ }));
  const panel = view.getByRole('heading', { name: /강라울 회차 내역/ }).closest('section')!;
  expect(within(panel).getByText('기록지 있음')).toBeTruthy();
  expect(within(panel).queryByRole('link')).toBeNull();
});

it('GPA 화면 문구에 결정 코드를 적지 않는다 — 부제는 「학부모 비공개 — 내부 자료」다', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('내부 자료'));
  expect(view.container.textContent ?? '').not.toMatch(/D-R\d|N-\d|§\s?\d/);
});

/** S3-c: 실제 페이지·mutation·무효화를 함께 실행하고 HTTP 응답만 통제한다. */
async function setupUseWrite(rejectWrite = false) {
  let latest: GpaBoard = { ...board };
  let gets = 0;
  const posts: GpaUseCreate[] = [];
  const adapter: AxiosAdapter = async (config) => {
    const response = (data: unknown, status = 200) => ({
      config, status, statusText: String(status), headers: {}, data,
    });
    if (config.method === 'get' && config.url === '/gpa') {
      gets += 1;
      return response(latest);
    }
    if (config.method === 'post' && config.url === '/gpa/uses') {
      const body = JSON.parse(config.data as string) as GpaUseCreate;
      posts.push(body);
      if (rejectWrite) {
        throw new AxiosError('Bad Request', 'ERR_BAD_REQUEST', config, undefined,
          response({ code: 'BAD_REQUEST', message: '기록지 URL을 확인해 주세요' }, 400));
      }
      const created: GpaUse = {
        id: 31, studentId: body.studentId, svcKey: body.svcKey,
        points: board.services.find((service) => service.key === body.svcKey)!.point,
        onDate: body.onDate, startMin: body.startMin ?? null, endMin: null, serId: null,
        coordName: '코디', noteUrl: body.noteUrl ?? null, state: 'wait',
        approvedByName: null, approvedOn: null, canApprove: true,
      };
      latest = { ...latest, uses: [created], totalUses: latest.totalUses + 1 };
      return response(created, 201);
    }
    throw new Error(`Unexpected GPA request: ${config.method} ${config.url}`);
  };
  api.defaults.adapter = adapter;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  writeClients.push(client);
  const view = render(<QueryClientProvider client={client}><GpaPage /></QueryClientProvider>);
  await view.findByLabelText('기록지 URL (선택)');
  const panel = view.getByRole('heading', { name: '회차 소비 기록' }).closest('section')!;
  const fields = {
    student: within(panel).getByLabelText('학생') as HTMLSelectElement,
    service: within(panel).getByLabelText('서비스') as HTMLSelectElement,
    date: within(panel).getByLabelText('날짜 (사이클 안)') as HTMLInputElement,
    start: within(panel).getByLabelText('시작 (선택)') as HTMLInputElement,
    url: within(panel).getByLabelText('기록지 URL (선택)') as HTMLInputElement,
  };
  return {
    view, panel, fields, client, posts, gets: () => gets,
    receive(next: GpaBoard) { latest = next; },
    fill(noteUrl: string) {
      fireEvent.change(fields.student, { target: { value: '1' } });
      fireEvent.change(fields.service, { target: { value: 'prj' } });
      fireEvent.change(fields.date, { target: { value: '2026-08-10' } });
      fireEvent.change(fields.start, { target: { value: '14:30' } });
      fireEvent.change(fields.url, { target: { value: noteUrl } });
    },
    submit() { fireEvent.click(within(panel).getByRole('button', { name: '기록 (대기)' })); },
  };
}

const url500 = 'https://example.test/' + 'a'.repeat(500 - 'https://example.test/'.length);
it.each([
  ['일반 URL 앞뒤 공백', '  https://example.test/record  ', 'https://example.test/record'],
  ['원문502자/trim후500자', ` ${url500} `, url500],
  ['빈 문자열', '', undefined],
  ['trim-empty', ' \t\n ', undefined],
] as const)('S3-c URL 입력 %s: 기존 trim/생략 payload와 입력(5 + 수업 연결)을 보존한다', async (_name, raw, expected) => {
  const w = await setupUseWrite();
  // 입력은 여섯이다 — 다섯(S3-c) + 「수업 연결」(qa-w3 관찰 · wave 5). 회차를 고르지 않으면 payload 에 serId 가 없다
  expect(w.panel.querySelectorAll('input,select,textarea')).toHaveLength(6);
  expect(w.fields.url.hasAttribute('maxlength')).toBe(false); // raw 제한으로 trim 후500 허용을 줄이지 않는다.
  w.fill(raw);
  w.submit();
  await waitFor(() => expect(w.posts).toHaveLength(1));
  expect(w.posts[0]).toEqual({
    cycleId: 3, studentId: 1, svcKey: 'prj', onDate: '2026-08-10', startMin: 870,
    ...(expected === undefined ? {} : { noteUrl: expected }),
  });
  await waitFor(() => expect(w.fields.date.value).toBe(''));
  expect(w.gets()).toBe(2);
});

it('S3-c 400은 서버 문장과 초안을 보존하고 정상 새 GET도 입력을 덮지 않는다', async () => {
  const w = await setupUseWrite(true);
  const raw = '  javascript:alert(1)  ';
  w.fill(raw);
  w.submit();
  await within(w.panel).findByText('기록지 URL을 확인해 주세요');
  await waitFor(() => expect(w.gets()).toBe(2)); // 기존 onSettled의 실패 후 재조회.
  expect(w.fields.url.value).toBe(raw);
  expect(w.fields.date.value).toBe('2026-08-10');
  expect(w.fields.start.value).toBe('14:30');
  expect(w.fields.student.value).toBe('1');
  expect(w.fields.service.value).toBe('prj');
  w.receive({ ...board, totalUses: 19 });
  await act(async () => { await w.client.invalidateQueries({ queryKey: family.gpa }); });
  await w.view.findByText('19회');
  expect(w.gets()).toBe(3);
  expect(w.posts).toHaveLength(1);
  expect(within(w.panel).getByLabelText('기록지 URL (선택)')).toBe(w.fields.url);
  expect(w.fields.url.value).toBe(raw);
  expect(w.fields.date.value).toBe('2026-08-10');
  expect(within(w.panel).getByText('기록지 URL을 확인해 주세요')).toBeTruthy();
});

it('S3-c 성공은 날짜/시각/URL만 비우고 새 GET의 기록지를 안전한 새 탭 링크로 표시한다', async () => {
  const w = await setupUseWrite();
  w.fill('  https://example.test/record  ');
  fireEvent.click(w.view.getByRole('button', { name: /^고은성/ }));
  expect(w.view.queryByRole('link', { name: '고은성 08-10 기록지 열기' })).toBeNull();
  w.submit();
  const link = await w.view.findByRole('link', { name: '고은성 08-10 기록지 열기' });
  expect(link.getAttribute('href')).toBe('https://example.test/record');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noreferrer');
  await waitFor(() => expect(w.fields.url.value).toBe(''));
  expect(w.gets()).toBe(2);
  expect(w.posts).toHaveLength(1);
  expect(w.fields.date.value).toBe('');
  expect(w.fields.start.value).toBe('');
  expect(w.fields.student.value).toBe('1');
  expect(w.fields.service.value).toBe('prj');
  // 다섯(S3-c) + 「수업 연결」(wave 5)
  expect(w.panel.querySelectorAll('input,select,textarea')).toHaveLength(6);
});

/*
 * 원본 §82 타임라인 줄 「08-21 18:00 · 숙제 지원 [대기] · −1p · 10p 남음」 — 배정 10p · 쓴 것 0p · 대기 1p 인 학생의
 * 대기 줄이 「10p 남음」이다. 슬라이드 글 「대기는 점선」: 대기는 아직 깎이지 않은 줄이고, 승인되면 그때 빠진다(82-7 · D-R44).
 * 머리의 「남은 것 9p」(배정 − 쓴 것 − 대기)는 서버 값 그대로다 — 둘은 다른 질문에 답한다.
 */
it('타임라인의 대기 줄은 아직 깎지 않는다 — 원본 「−1p · 10p 남음」 · 승인 줄만 잔여에서 빠진다 (82-7)', async () => {
  const use = (id: number, state: 'wait' | 'ok', onDate: string) => ({
    id, studentId: 2, svcKey: 'hw', points: 1, onDate, startMin: 1080, endMin: 1125, serId: 15,
    coordName: 'Kim', noteUrl: null, state, approvedByName: null, approvedOn: null, canApprove: true,
  });
  const view = setup({ uses: [use(21, 'wait', '2026-08-21'), use(22, 'ok', '2026-08-22')] });
  await waitFor(() => expect(view.container.textContent).toContain('56p'));
  fireEvent.click(view.getByRole('button', { name: /^강라울/ }));
  const list = await view.findByRole('list', { name: '강라울 소비 타임라인' });
  const rows = within(list).getAllByRole('listitem');
  expect(rows[0].textContent).toContain('−1p10p 남음');
  expect(rows[1].textContent).toContain('−1p9p 남음');
});

/*
 * qa-w3 관찰 「GPA 기록 창에 수업 연결 칸이 없다」 — 서버는 `serId` 를 받는데 화면이 보낼 줄이 없어, 회차 내역의 끝 시각이
 * 화면에서 만든 기록에는 한 번도 서지 않았다. 고른 학생이 든 GPA 회차만 보이고, 고르면 날짜·시작이 그 회차로 채워진다.
 */
it('기록 창의 「수업 연결」 — 고른 학생의 GPA 회차만 보이고, 고르면 날짜·시작이 채워져 serId 와 함께 간다', async () => {
  const w = await setupUseWrite();
  const link = within(w.panel).getByLabelText('수업 연결 (선택)') as HTMLSelectElement;
  fireEvent.change(w.fields.student, { target: { value: '2' } });
  expect([...link.options].map((o) => o.textContent)).toEqual(['연결 안 함', '08-21 18:00–18:45 GPA 케어']);
  fireEvent.change(link, { target: { value: '15|2026-08-21' } });
  expect(w.fields.date.value).toBe('2026-08-21');
  expect(w.fields.start.value).toBe('18:00');
  // 날짜·시작은 회차가 정한다 — 따로 고치면 회차와 기록이 갈린다
  expect(w.fields.date.disabled).toBe(true);
  expect(w.fields.start.disabled).toBe(true);
  w.submit();
  await waitFor(() => expect(w.posts).toHaveLength(1));
  expect(w.posts[0]).toEqual({ cycleId: 3, studentId: 2, svcKey: 'hw', onDate: '2026-08-21', startMin: 1080, serId: 15 });
  // 다른 학생을 고르면 그 학생의 회차가 아니므로 연결이 풀린다
  fireEvent.change(w.fields.student, { target: { value: '3' } });
  expect(link.value).toBe('');
});

/* 원본 §82 머리 다섯 칸은 **숫자가 위 · 라벨이 아래**다(「56p / 배정」 · 86-7 · 공용 `StatCard` 의 `valueFirst`). 선택 학생 미니 지표는 라벨이 위다(82-6 시험). */
it('머리 다섯 칸은 숫자가 위 · 라벨이 아래다 — 원본 §82 「56p / 배정」 (86-7)', async () => {
  const view = setup();
  await waitFor(() => expect(view.container.textContent).toContain('56p'));
  for (const [label, value] of [['배정', '56p'], ['사용', '32p'], ['승인 대기', '3p'], ['잔여', '21p'], ['진행', '18회']]) {
    const el = [...view.container.querySelectorAll('div')].find((d) => d.textContent === label && d.previousElementSibling?.textContent === value);
    expect(el, label).toBeTruthy();
  }
});
