/** @file-guide
 * 목적: §38의 여섯 통계·강사 요청·배부 진도 회수 입력이 생성 계약과 연결되는지 검증한다.
 * 책임/재사용: 실제 컴포넌트와 Query hook을 쓰고 HTTP 어댑터만 fixture로 바꾼다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { BookTracking } from './BookTracking';

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
      return {
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { id: 10, libId: 4, studentId: 3, state: 'ok', stateLabel: '배부 완료' },
      };
    }
    const data =
      config.url === '/books/tracking'
        ? {
            students: [
              {
                id: 3,
                name: '고은성',
                grade: 'G12',
                teacherName: '김재훈',
                nextLesson: '2026-09-14 16:00',
                todoLabel: '확인 필요',
                todos: [{ key: 'teacher_request', label: '강사 요청', count: 1 }],
                issues: [
                  {
                    id: 10,
                    libId: 4,
                    studentId: 3,
                    state: 'ok',
                    stateLabel: '배부 완료',
                    progressPage: 20,
                    progressPercent: 20,
                  },
                  {
                    id: 12,
                    libId: 5,
                    studentId: 3,
                    state: 'ok',
                    stateLabel: '배부 완료',
                    progressPage: 60,
                    progressPercent: 75,
                  },
                  { id: 11, libId: 4, studentId: 3, state: 'wait', stateLabel: '승인 대기', edition: 'v1' },
                ],
              },
            ],
            books: [
              {
                libId: 4,
                title: 'SAT Reading',
                studentCount: 1,
                minPercent: 20,
                maxPercent: 20,
                averagePercent: 20,
                pages: 100,
                students: [{ studentId: 3, name: '고은성', percent: 20, elapsedDays: 1 }],
              },
            ],
            states: ['학생', '승인 대기', '전달 대기', '수업 임박', '강사 요청', '정상'].map((label, index) => ({
              key: String(index),
              label,
              count: index === 4 ? 1 : 0,
            })),
            teacherRequests: [{ id: 7, requesterName: '김재훈', studentName: '고은성', message: '다 풀었습니다' }],
          }
        : config.url === '/books'
          ? {
              items: [
                { id: 4, code: 'SAT', title: 'SAT Reading', pages: 100, hasNewer: false, hasFile: true, issueCount: 1 },
                { id: 5, code: 'WR', title: 'Writing', pages: 80, hasNewer: false, hasFile: true, issueCount: 1 },
              ],
              bySub: {},
              newerCount: 0,
              noFileCount: 0,
              levels: [],
              grades: [],
            }
          : {
              kinds: [],
              subs: [],
              rooms: [],
              zaccs: [],
              invTypes: [],
              staff: [],
              students: [{ id: 3, name: '고은성', grade: 'G12' }],
            };
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <BookTracking />
    </QueryClientProvider>,
  );
}

it('원본 여섯 통계와 DB 강사 요청을 표시한다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getAllByText('강사 요청').length).toBeGreaterThanOrEqual(1));
  expect(view.getByText('고은성 다 풀었습니다')).toBeTruthy();
  expect(view.getAllByText('SAT Reading').length).toBeGreaterThanOrEqual(2);
});

it('진도 입력은 페이지 숫자만 DTO로 보내고 퍼센트는 보내지 않는다', async () => {
  const view = setup();
  await waitFor(() => view.getByRole('button', { name: '고은성 펼치기' }));
  const toggle = view.getByRole('button', { name: '고은성 펼치기' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(view.getByRole('button', { name: '고은성 접기' }).getAttribute('aria-expanded')).toBe('true');
  fireEvent.change(view.getByLabelText('고은성 SAT Reading 진도 쪽수'), { target: { value: '55' } });
  fireEvent.click(view.getByRole('button', { name: '고은성 SAT Reading 진도 저장' }));
  await waitFor(() => expect(mutation.url).toBe('/books/issues/10/progress'));
  expect(mutation.body).toEqual({ progressPage: 55 });
});

it('승인 대기는 공용 전이 hook으로 auto 상태만 보낸다', async () => {
  const view = setup();
  await waitFor(() => view.getByRole('button', { name: '고은성 펼치기' }));
  fireEvent.click(view.getByRole('button', { name: '고은성 펼치기' }));
  fireEvent.click(view.getByRole('button', { name: '고은성 SAT Reading 승인' }));
  await waitFor(() => expect(mutation.url).toBe('/books/issues/11/state'));
  expect(mutation.body).toEqual({ state: 'auto' });
});

it('학생 한 줄의 진도는 각 교재와 짝지어 표시한다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('75%')).toBeTruthy());
  expect(view.getAllByTitle('SAT Reading')[0].textContent).toContain('20%');
  expect(view.getByTitle('Writing').textContent).toContain('75%');
});
