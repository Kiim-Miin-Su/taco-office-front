/** @file-guide
 * 목적: §41 자료 요청의 다학생·다교재 입력과 상태 전이·PNG 출력을 검증한다.
 * 책임/재사용: 실제 컴포넌트와 Query hook을 쓰고 HTTP/PNG 경계만 fixture로 교체한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
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

function setup({ delivered = false, canReceive = false }: { delivered?: boolean; canReceive?: boolean } = {}) {
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
                coordinatorId: 3,
                coordinatorName: '김범준',
                students: [{ id: 10, name: '고은성', grade: 'G12' }],
                books: [{ id: 4, code: 'SAT', title: 'SAT Reading', versId: 3, seFileId: 1, teFileId: 2 }],
                canDeliver: true,
                canReceive,
                deliveryBlockers: [],
              },
            ],
            types: [{ key: 'exam', label: '시험 대비 자료', count: 1 }],
            coordinators: [{ key: '3', label: '김범준', count: 1 }],
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
      <BookPacks />
    </QueryClientProvider>,
  );
}

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
