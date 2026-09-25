/** @file-guide
 * 목적: §41 자료 요청의 다학생·다교재 입력과 상태 전이·PNG 출력을 검증한다.
 * 책임/재사용: 실제 컴포넌트와 Query hook을 쓰고 HTTP/PNG 경계만 fixture로 교체한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { downloadElementPng } from '@/lib/png-export';
import { BookPacks } from './BookPacks';

vi.mock('@/lib/png-export', () => ({ downloadElementPng: vi.fn().mockResolvedValue(undefined) }));

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
const mutations: Array<{ url?: string; body?: unknown }> = [];

afterEach(() => {
  cleanup();
  api.defaults.adapter = original;
  useSession.getState().signOut();
  mutations.length = 0;
  vi.clearAllMocks();
});

function setup({ delivered = false, canReceive = false, focusPackId = null, deliveredAt = null, receivedAt = null }: {
  delivered?: boolean; canReceive?: boolean; focusPackId?: number | null;
  deliveredAt?: string | null; receivedAt?: string | null;
} = {}) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method !== 'get') {
      mutations.push({ url: config.url, body: config.data ? JSON.parse(config.data) : undefined });
      return { config, status: 200, statusText: 'OK', headers: {}, data: { id: 7, title: '자료', state: 'delivered' } };
    }
    const data =
      config.url === '/books/deliveries'
        ? {
            items: [
              {
                id: 7,
                packType: 'exam',
                packTypeLabel: '시험 대비 자료',
                state: delivered ? 'delivered' : 'pending',
                stateLabel: delivered ? '전달 완료' : '준비 중',
                title: 'SAT 9월 대비',
                memo: '반드시 확인',
                effectiveOn: '2026-09-20',
                deliveredAt,
                receivedAt,
                deliveredByName: deliveredAt ? '강민지' : null,
                receivedByName: receivedAt ? '김범준' : null,
                coordinatorId: 3,
                coordinatorName: '김범준',
                students: [{ id: 10, name: '고은성', grade: 'G12' }],
                books: [{ id: 4, code: 'SAT', title: 'SAT Reading', level: 'Practice', versId: 3, seFileId: 1, teFileId: 2 }],
                canDeliver: true,
                canReceive,
                deliveryBlockers: [],
              },
            ],
            types: [{ key: 'exam', label: '시험 대비 자료', count: 1 }],
            coordinators: [{ key: '3', label: '김범준', count: 1, unreceived: delivered && !receivedAt ? 1 : 0 }],
          }
        : config.url === '/books'
          ? {
              items: [
                { id: 4, title: 'SAT Reading' },
                { id: 5, title: 'Writing' },
              ],
              bySub: {},
              newerCount: 0,
              noFileCount: 0,
              levels: [],
              grades: [],
              levelCounts: [],
              gradeCounts: [],
              versionUploadMaxBytes: 3_000_000,
            }
          : {
              kinds: [],
              subs: [],
              rooms: [],
              zaccs: [],
              invTypes: [],
              staff: [
                { id: 2, name: '김민수', canGpaPack: true },
                { id: 3, name: '김범준', canGpaPack: true },
                { id: 6, name: '김재훈', canGpaPack: false },
              ],
              students: [
                { id: 10, name: '고은성', grade: 'G12' },
                { id: 11, name: '강라율', grade: 'G11' },
              ],
            };
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <BookPacks focusPackId={focusPackId} />
    </QueryClientProvider>,
  );
}

it('pack identity가 있으면 데이터 도착 뒤 해당 카드 anchor를 식별·포커스한다', async () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  const view = setup({ focusPackId: 7 });
  const anchor = await waitFor(() => {
    const found = view.container.querySelector<HTMLElement>('#book-pack-7');
    expect(found).toBeTruthy();
    expect(document.activeElement).toBe(found);
    return found!;
  });
  expect(anchor.dataset.focused).toBe('true');
  expect(scroll).toHaveBeenCalledWith({ block: 'center' });
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

it('다학생·다교재와 관리 권한 코디네이터만 BookPackWrite로 보낸다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('SAT 9월 대비')).toBeTruthy());
  const createToggle = view.getByRole('button', { name: '+ 전달 만들기' });
  expect(createToggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(createToggle);
  expect(view.getByRole('button', { name: '+ 전달 만들기' }).getAttribute('aria-expanded')).toBe('true');
  expect(view.queryByRole('option', { name: '김재훈' })).toBeNull();
  fireEvent.change(view.getByLabelText('받는 코디네이터'), { target: { value: '3' } });
  fireEvent.change(view.getByLabelText('적용일'), { target: { value: '2026-09-21' } });
  fireEvent.change(view.getByLabelText('제목'), { target: { value: '신규 요청' } });
  fireEvent.click(view.getByLabelText('고은성 G12'));
  fireEvent.click(view.getByLabelText('강라율 G11'));
  fireEvent.click(view.getByLabelText('SAT Reading'));
  fireEvent.click(view.getByLabelText('Writing'));
  fireEvent.click(view.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(mutations[0]?.url).toBe('/books/deliveries'));
  expect(mutations[0]?.body).toEqual({
    packType: 'exam',
    title: '신규 요청',
    effectiveOn: '2026-09-21',
    coordinatorId: 3,
    studentIds: [10, 11],
    libIds: [4, 5],
  });
});

it('대기 카드의 전달 상태 전이와 공용 PNG exporter를 호출한다', async () => {
  const view = setup();
  await waitFor(() => view.getByRole('button', { name: 'SAT 9월 대비 전달' }));
  fireEvent.click(view.getByRole('button', { name: 'SAT 9월 대비 전달' }));
  await waitFor(() => expect(mutations.some((item) => item.url === '/books/deliveries/7/deliver')).toBe(true));
  fireEvent.click(view.getByRole('button', { name: 'SAT 9월 대비 전달문 PNG' }));
  await waitFor(() => expect(downloadElementPng).toHaveBeenCalledTimes(1));
});

it('알림 대상은 폐기된 직책명이 아니라 현재 권한 용어로 설명한다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText(/담당 관리자에게 알림/)).toBeTruthy());
  expect(view.queryByText(/교수실장/)).toBeNull();
});

it('수령 확인은 서버가 지정 코디네이터로 판정한 사용자에게만 보인다', async () => {
  const admin = setup({ delivered: true, canReceive: false });
  await waitFor(() => expect(admin.getByText('SAT 9월 대비')).toBeTruthy());
  expect(admin.queryByRole('button', { name: 'SAT 9월 대비 수령 확인' })).toBeNull();
  cleanup();

  const coordinator = setup({ delivered: true, canReceive: true });
  await waitFor(() => expect(coordinator.getByRole('button', { name: 'SAT 9월 대비 수령 확인' })).toBeTruthy());
});

it('전달·수령 시각은 ISO 원문이 아니라 KST 날짜·시각으로 적는다 (§41)', async () => {
  const view = setup({ delivered: true, deliveredAt: '2026-09-17T19:00:00+09:00', receivedAt: '2026-09-18T01:20:00Z' });
  await waitFor(() => expect(view.getByText('SAT 9월 대비')).toBeTruthy());
  const text = view.container.textContent ?? '';
  expect(text).toContain('전달 2026-09-17 19:00');
  expect(text).toContain('수령 2026-09-18 10:20');
  expect(text).not.toContain('T19:00:00');
  expect(text).not.toContain('+09:00');
});

/** §41-2 · §41-5 — 전달 뒤에 전달한 사람, 코디네이터 레일에 미확인 수 (원문 「Sophia 2건 미확인 1」) */
it('전달한 사람 이름과 코디네이터별 미확인 수를 서버 값 그대로 적는다 (§41)', async () => {
  const view = setup({ delivered: true, deliveredAt: '2026-09-17T19:00:00+09:00' });
  await waitFor(() => expect(view.getByText('SAT 9월 대비')).toBeTruthy());
  const text = view.container.textContent ?? '';
  expect(text).toContain('전달 2026-09-17 19:00 · 강민지');
  expect(view.getByText('미확인 1')).toBeTruthy();
});

/**
 * g4 §41-3 — 원문 카드: 머리 「● 시험 대비 자료」(종류색 점) + 제목, 오른쪽 「● 전달 완료 Sophia」(상태 + 코디네이터),
 * 학생 칩 「이유찬 G9」, 교재 줄 = 레벨 글자 사각 + 제목 + SE/TE + 코드, 메모는 💬 연보라 상자, 단추는 같은 폭.
 */
it('자료 카드는 종류 점 · 상태와 코디네이터 · 학생 칩 · 레벨 사각 · 메모 상자 · 같은 폭 단추로 선다 (§41-3)', async () => {
  const view = setup({ delivered: true, deliveredAt: '2026-09-17T19:00:00+09:00' });
  await waitFor(() => expect(view.getByText('SAT 9월 대비')).toBeTruthy());
  const card = view.getByTestId('book-pack-card');
  const head = card.querySelector('[data-pack-head]') as HTMLElement;
  expect(head.querySelector('[data-pack-type="exam"]')?.textContent).toContain('시험 대비 자료');
  expect(head.textContent).toContain('SAT 9월 대비');
  expect(head.textContent).toContain('전달 완료');
  expect(head.textContent).toContain('김범준');
  const students = card.querySelectorAll('[data-pack-student]');
  expect(students.length).toBe(1);
  expect(students[0]?.textContent).toContain('고은성');
  expect(students[0]?.textContent).toContain('G12');
  expect(card.querySelector('[data-level-marker]')?.textContent).toBe('P');
  // 교재 줄의 SE/TE 는 원문처럼 작은 배지 — 누르면 내려받고 이름에 교재를 붙인다 (§41-3 · wave 6)
  expect(within(card).getByRole('button', { name: 'SAT Reading SE 내려받기' }).textContent).toBe('SE');
  expect(within(card).getByRole('button', { name: 'SAT Reading TE 내려받기' }).textContent).toBe('TE');
  expect(within(card).queryByRole('button', { name: 'SE 열기' })).toBeNull();
  const memo = card.querySelector('[data-pack-memo]') as HTMLElement;
  expect(memo.textContent).toContain('💬');
  expect(memo.textContent).toContain('반드시 확인');
  expect((card.querySelector('[data-pack-actions]') as HTMLElement).className).toContain('auto-cols-fr');
});
