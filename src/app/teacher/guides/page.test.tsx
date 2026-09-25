/** @file-guide
 * 목적: S4 강사 수신 안내·명시 확인·안전 URL·주별 학생 자료 분리·세션 격리를 검증한다.
 * 책임/재사용: 실제 page/RouteAccess/QueryClient/Axios와 생성 DTO를 사용하고 이동·네트워크만 격리한다.
 * 검증/작업 지침: docs/AGENT.md · docs/sprint/evidence/TBO-52/s4-guide/plan.md
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Guide, Me, TeacherGuides } from '@/api/types';
import type { components } from '@/api/schema';
import { RouteAccess } from '@/components/shell/RequireAuth';
import { useSession } from '@/store/useSession';
import TeacherGuidesPage from './page';

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
const nav = vi.hoisted(() => ({ search: '', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/teacher/guides', useRouter: () => nav, useSearchParams: () => new URLSearchParams(nav.search) }));
const teacher: Me = { id: 2, name: '강사A', role: 'teacher', roleLabel: '강사', title: null,
  canAdminPage: false, canCrudAll: false, canSeeProfit: false, canCrudAttendance: true,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const initial: Guide = { id: 5, serId: 8, studentId: 4, teacherId: 2, reason: 'new', state: 'sent', pending: false,
  studentName: '수신 학생', teacherName: '강사A', serTitle: '수신 수업', body: '<img src=x onerror=alert(1)>\nhttps://example.test/'+ 'a'.repeat(400),
  dueOn: null, eventOn: '2026-09-24', sourceOccurrenceId: 55, createdAt: '2026-09-24T09:00:00+09:00',
  sentAt: '2026-09-24T10:00:00+09:00', acknowledgedAt: null, overdueDays: 0, siblingCount: 0,
  canSend: false, canAck: true, sendBlockedReason: '권한이 없습니다', acknowledgedAfterSeconds: null };
type Received = components['schemas']['ReceivedGuidesDto'];
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; useSession.getState().signOut(); nav.search = ''; vi.clearAllMocks(); });

function setup(options: { search?: string; weeklyError?: boolean; receivedError?: boolean; items?: Guide[]; viewer?: Me } = {}) {
  nav.search = options.search ?? '';
  let items = options.items ?? [initial];
  let status = 200;
  let hold = false;
  let release: (() => void) | undefined;
  const calls: Array<{ method?: string; url?: string; body?: unknown; viewer?: number }> = [];
  const weekly: TeacherGuides = { weekFrom: '2026-09-21', weekTo: '2026-09-27', students: [] };
  api.defaults.adapter = async (config) => {
    const viewer = useSession.getState().me?.id;
    calls.push({ method: config.method, url: config.url, body: config.data ? JSON.parse(config.data as string) : undefined, viewer });
    const error = (code: number, message: string) => new AxiosError(message, undefined, config, undefined,
      { config, status: code, statusText: 'Error', headers: {}, data: { code: 'REJECTED', message } });
    if (config.url === '/teacher/guides' && options.weeklyError) throw error(500, '학생 자료를 불러오지 못했습니다.');
    if (config.url === '/teacher/guides/received' && options.receivedError) throw error(500, '수신 안내를 불러오지 못했습니다.');
    if (config.method === 'post') {
      if (hold) await new Promise<void>((resolve) => { release = resolve; });
      if (status !== 200) throw error(status, '안내 확인을 다시 시도해 주세요.');
      items = items.map((g) => ({ ...g, state: 'read', canAck: false, acknowledgedAt: '2026-09-24T10:01:05+09:00', acknowledgedAfterSeconds: 65 }));
    }
    const received: Received = { items: items.filter((g) => g.teacherId === viewer) };
    return { config, status: 200, statusText: 'OK', headers: {}, data: config.url === '/teacher/guides' ? weekly
      : config.url === '/teacher/guides/received' ? received : config.url === '/auth/me' ? useSession.getState().me : items[0] };
  };
  useSession.getState().signIn('fixture', options.viewer ?? teacher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } }); clients.push(client);
  const tree = () => <QueryClientProvider client={client}><RouteAccess><TeacherGuidesPage /></RouteAccess></QueryClientProvider>;
  const view = render(tree());
  nav.replace.mockImplementation((url: string) => { nav.search = url.split('?')[1] ?? ''; view.rerender(tree()); });
  return { view, calls, hold: () => { hold = true; }, release: () => { hold = false; release?.(); }, fail: (next: number) => { status = next; },
    navigate: (search: string) => { nav.search = search; view.rerender(tree()); } };
}

it.each([false, true])('현재 주 학생 자료 오류=%s와 독립해 수신 본문을 먼저 표시하고 명시 확인한다', async (weeklyError) => {
  const { view, calls } = setup({ weeklyError, search: 'guideId=5' });
  const button = await view.findByRole('button', { name: '확인했습니다' });
  const title = view.getByRole('heading', { name: '수업 안내', level: 1 });
  const inbox = view.getByRole('heading', { name: '받은 안내', level: 2 });
  expect(title.compareDocumentPosition(inbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const paragraph = view.getByText(/<img src=x/);
  expect(paragraph.textContent).toBe(initial.body);
  expect(paragraph.className).toContain('break-words'); expect(view.container.querySelector('img')).toBeNull();
  const weeklyMessage = await view.findByText(weeklyError ? '불러오지 못했습니다' : '이 주에는 담당 수업이 없습니다.');
  expect(paragraph.compareDocumentPosition(weeklyMessage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
  fireEvent.click(button);
  await view.findByText('1분 5초');
  expect(calls.filter((c) => c.method === 'post')).toEqual([{ method: 'post', url: '/teacher/guides/5/ack', body: {}, viewer: 2 }]);
  expect(calls.filter((c) => c.url === '/teacher/guides')).toHaveLength(1);
  expect(calls.filter((c) => c.url === '/teacher/guides/received')).toHaveLength(2);
});

it('수신 조회 실패는 주별 학생 영역을 지우지 않고 확인 요청0이다', async () => {
  const { view, calls } = setup({ receivedError: true });
  await view.findByText('불러오지 못했습니다');
  expect(await view.findByText('이 주에는 담당 수업이 없습니다.')).toBeTruthy();
  expect(view.queryByRole('button', { name: '확인했습니다' })).toBeNull();
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it.each(['guideId=0', 'guideId=-1', 'guideId=1.5', 'guideId=1e2', 'guideId=9007199254740992', 'guideId=5&guideId=5', 'guideId=999', 'guideId=%3Cscript%3E'])('누락·타인·잘못된 query %s는 다른 안내를 대신 열거나 확인하지 않는다', async (search) => {
  const { view, calls } = setup({ search });
  await view.findByRole('heading', { name: '받은 안내' });
  await view.findByText('선택한 안내를 확인할 수 없습니다. 목록에서 안내를 골라 주세요.');
  expect(view.queryByText(/<img src=x/)).toBeNull();
  expect(view.queryByRole('button', { name: '확인했습니다' })).toBeNull();
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
  expect(calls.some((c) => c.url?.startsWith('/guides'))).toBe(false);
});

it('같은 tick 확인은 한 요청이며 409 오류에도 선택·본문을 유지하고 재시도한다', async () => {
  const { view, calls, hold, release, fail } = setup({ search: 'guideId=5' });
  hold(); fail(409);
  const button = await view.findByRole('button', { name: '확인했습니다' });
  act(() => { button.click(); button.click(); });
  await waitFor(() => expect(calls.filter((c) => c.method === 'post')).toHaveLength(1));
  release(); await view.findByText('안내 확인을 다시 시도해 주세요.');
  expect(view.getByText(/<img src=x/).textContent).toBe(initial.body);
  fail(200); fireEvent.click(view.getByRole('button', { name: '확인했습니다' }));
  await view.findByText('1분 5초');
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(2);
});

it('로그인 A→B와 URL 뒤로가기는 본인 수신 id만 선택하며 이전 본문을 노출하지 않는다', async () => {
  const second = { ...initial, id: 9, teacherId: 3, body: 'B만 받는 본문', studentName: '다른 학생' };
  const { view, calls, navigate } = setup({ search: 'guideId=5', items: [initial, second] });
  await view.findByText(/<img src=x/);
  act(() => useSession.getState().signIn('other-fixture', { ...teacher, id: 3, name: '강사B' }));
  await view.findByText('선택한 안내를 확인할 수 없습니다. 목록에서 안내를 골라 주세요.');
  expect(view.queryByText(/<img src=x/)).toBeNull();
  navigate('guideId=9'); await view.findByText('B만 받는 본문');
  const getCount = calls.filter((c) => c.url === '/teacher/guides/received').length;
  navigate('guideId=5'); await view.findByText('선택한 안내를 확인할 수 없습니다. 목록에서 안내를 골라 주세요.');
  expect(view.queryByText('B만 받는 본문')).toBeNull();
  expect(calls.filter((c) => c.url === '/teacher/guides/received')).toHaveLength(getCount);
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it('이미 확인했거나 canAck=false면 새 확인을 만들지 않고 legacy 시각을 발명하지 않는다', async () => {
  const { view, calls } = setup({ items: [{ ...initial, state: 'read', canAck: false, acknowledgedAt: null, acknowledgedAfterSeconds: null }] });
  await view.findByRole('heading', { name: '받은 안내' });
  await view.findByText(/<img src=x/);
  expect(view.getByRole('button', { name: '확인 완료' })).toHaveProperty('disabled', true);
  expect(view.queryByText('1분 5초')).toBeNull();
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it('관리 화면 권한 부여로 개인 경로가 닫히면 이전 확인 입력도 제거된다', async () => {
  const { view, calls } = setup();
  await view.findByRole('button', { name: '확인했습니다' });
  await act(async () => { useSession.getState().setMe({ ...teacher, canAdminPage: true }); });
  expect(view.queryByRole('button', { name: '확인했습니다' })).toBeNull();
  expect(nav.replace).toHaveBeenCalledWith('/schedule');
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it('목록 선택 뒤 URL 뒤로가기는 이전 명시 id를 복원하고 추가 GET/POST가 없다', async () => {
  const second = { ...initial, id: 9, body: '두 번째 안내', studentName: '둘째 학생' };
  const { view, calls, navigate } = setup({ search: 'guideId=5', items: [initial, second] });
  await view.findByText(/<img src=x/);
  fireEvent.click(view.getByRole('button', { name: '둘째 학생 · 2026-09-24' }));
  await view.findByText('두 번째 안내');
  navigate('guideId=5');
  await view.findByText(/<img src=x/);
  expect(view.queryByText('두 번째 안내')).toBeNull();
  expect(calls.filter((c) => c.url === '/teacher/guides/received')).toHaveLength(1);
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it('sent여도 서버 canAck=false면 명시 확인 요청을 만들지 않는다', async () => {
  const { view, calls } = setup({ items: [{ ...initial, canAck: false }] });
  const button = await view.findByRole('button', { name: '확인했습니다' });
  expect(button).toHaveProperty('disabled', true);
  fireEvent.click(button);
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});

it('수신 목록이 비어 있어도 현재 주 자료와 빈 수신 안내가 독립적으로 표시된다', async () => {
  const { view, calls } = setup({ items: [] });
  await view.findByText('받은 안내가 없습니다.');
  await view.findByText('이 주에는 담당 수업이 없습니다.');
  expect(view.queryByRole('button', { name: '확인했습니다' })).toBeNull();
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0);
});
