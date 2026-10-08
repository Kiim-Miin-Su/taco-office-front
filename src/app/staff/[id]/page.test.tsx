/** @file-guide
 * 목적: page.test.tsx — 관리자 강사 8탭의 actor/target 분리와 생성 계약 경계를 검증한다.
 * 책임/재사용: 생성 StaffDirectoryDetailDto만 fixture로 쓰고 teacher 본인 API를 관리자 대리 조회로 호출하지 않는지 확인한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { components } from '@/api/schema';
import { api } from '@/api/client';
import { useSession } from '@/store/useSession';
import StaffDetailPage from './page';

const replace = vi.fn();
let tab: string | null = null;
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '7' }),
  useSearchParams: () => ({ get: (key: string) => key === 'tab' ? tab : null }),
  useRouter: () => ({ replace }),
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

type Detail = components['schemas']['StaffDirectoryDetailDto'];
const detail: Detail = {
  profile: { id: 7, name: '김강사', englishName: 'Kim', title: '영어', active: true, hiredOn: '2026-01-02', createdAt: '2026-01-01T09:00:00+09:00', email: 'teacher@example.com', phone: '010-0000-0000', timezone: 'Asia/Seoul' },
  wageAccess: true,
  wages: [{ id: 1, fromDate: '2026-01-01', rate: 45000, reason: '입사', approvedByName: '관리자', createdAt: '2026-01-01T09:00:00+09:00' }],
  payouts: [{ id: 2, yearMonth: '2026-09', state: 'confirmed', net: 900000, confirmedByName: '관리자', confirmedAt: '2026-10-02T09:00:00+09:00' }],
  assignments: [{ id: 3, kindName: '1대1 수업', subjectName: '영어', studentNames: ['학생A'], fromDate: '2026-01-01', toDate: null }],
  reports: [{ id: 4, onDate: '2026-09-30', kindName: '1대1 수업', subjectName: '영어', studentNames: ['학생A'] }],
  audit: [{ id: 5, action: 'update', actionLabel: '정보 수정', actorName: '관리자', at: '2026-09-20T09:00:00+09:00', changes: [{ field: '직함', before: '수학', after: '영어' }], privateFields: [] }],
  nextCursor: null,
};
const unavailable: components['schemas']['ScheduleUnavListDto'] = {
  from: '2026-10-08', to: '2026-10-21',
  items: [{ id: 91, teacherId: 7, teacherName: '김강사', date: '2026-10-18', startMin: 600, endMin: 660, reason: '병원 진료로 수업 진행이 어렵습니다' }],
};
const clients: QueryClient[] = [];
function setup(getImpl?: (url: string) => Promise<unknown>) {
  useSession.setState({ me: { id: 2, name: '관리자 김', roleLabel: '관리자' } as never, ready: true });
  const get = vi.spyOn(api, 'get');
  if (getImpl) get.mockImplementation(getImpl as never);
  else get.mockResolvedValue({ data: detail } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><StaffDetailPage /></QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  tab = null;
  replace.mockReset();
  vi.restoreAllMocks();
});

it('실제 관리자 actor와 대상 강사를 분리하고 8탭을 한 허브에 표시한다', async () => {
  const view = setup();
  await view.findByText('조회자 관리자 김 · 대상 강사 김강사');
  expect(view.getAllByRole('tab').map((node) => node.textContent?.trim())).toEqual([
    '홈기본 정보', '캘린더현재 1개', '불가 시간향후 2주', '리포트1건',
    '수업 안내기능 준비 중', '히스토리정산·변경', '건의 사항기능 준비 중', '들어온 것기능 준비 중',
  ]);
  expect(view.getByText('현재 배정 수업·학생')).toBeTruthy();
});

it('생성 projection이 있는 리포트와 히스토리만 표시하고 teacher 본인 API를 대리 호출하지 않는다', async () => {
  const view = setup();
  await view.findByText('현재 배정 수업·학생');
  fireEvent.click(view.getByRole('tab', { name: '리포트 1건' }));
  expect(replace).toHaveBeenLastCalledWith('/staff/7?tab=reports', { scroll: false });

  tab = 'reports';
  view.rerender(<QueryClientProvider client={clients[0]}><StaffDetailPage /></QueryClientProvider>);
  expect(await view.findByText('작성된 수업 리포트')).toBeTruthy();
  expect(view.getByText(/2026-09-30/)).toBeTruthy();

  tab = 'history';
  view.rerender(<QueryClientProvider client={clients[0]}><StaffDetailPage /></QueryClientProvider>);
  expect(await view.findByText('시급 이력')).toBeTruthy();
  expect(view.getByText('정보 변경 감사 이력')).toBeTruthy();
  const urls = vi.mocked(api.get).mock.calls.map(([url]) => String(url));
  expect(urls).toEqual(['/drawer/staff-directory/7']);
  expect(urls.some((url) => url.startsWith('/teacher/'))).toBe(false);
});

it('기존 관리자 일정 계약으로 대상 강사의 불가 시간만 읽고 쓰기 action은 제공하지 않는다', async () => {
  tab = 'unavailable';
  const view = setup(async (url) => ({ data: String(url) === '/schedule/unavailable' ? unavailable : detail }));
  expect(await view.findByText('2026-10-18 · 10:00–11:00')).toBeTruthy();
  expect(view.getByText('병원 진료로 수업 진행이 어렵습니다')).toBeTruthy();
  expect(view.getByText(/등록·삭제는 대상 강사의 본인 화면에서만 수행합니다/)).toBeTruthy();
  expect(view.queryByRole('button', { name: /등록|저장|삭제/ })).toBeNull();
  await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalledWith('/schedule/unavailable', {
    params: expect.objectContaining({ teacherId: 7 }),
  }));
  expect(vi.mocked(api.get).mock.calls.some(([url]) => String(url).startsWith('/teacher/'))).toBe(false);
});
