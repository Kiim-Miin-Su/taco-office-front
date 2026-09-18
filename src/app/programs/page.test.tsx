/** @file-guide
 * 목적: §18 목적지 「프로그램 · 과목 관리」 — 코드는 못 바꾸고 지우기는 없다 (C48).
 * 책임/재사용: 실제 ProgramsPage/useCatalog 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Catalog, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import ProgramsPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const catalog: Catalog = {
  kinds: [
    { key: 'class', name: '정규 수업', color: '#7C6A58', cap: 4, grp: 'lesson', grpLabel: '수업', rep: true, repForm: 'dev', sort: 1, extra: false, serCount: 12 },
    { key: 'intake', name: '입학 상담', color: '#4A6FA5', cap: 1, grp: 'intake', grpLabel: '상담·진단', rep: false, repForm: null, sort: 2, extra: false, serCount: 0 },
  ],
  subs: [
    { key: 'ap-chem', name: 'AP Chemistry', color: '#8C5A3C', active: true, sort: 1, serCount: 5 },
    { key: 'old-sat', name: '구 SAT', color: '#777777', active: false, sort: 2, serCount: 0 },
  ],
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

function setup(data: Catalog = catalog) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><ProgramsPage /></QueryClientProvider>);
}

it('지우기 단추가 어디에도 없다 — 시간표가 이 낱말로 저장돼 있다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('정규 수업')).toBeTruthy());
  const names = [...view.container.querySelectorAll('button')].map((b) => b.textContent ?? '');
  expect(names.some((n) => n.includes('지우기') || n.includes('삭제'))).toBe(false);

  fireEvent.click(view.getByRole('button', { name: /과목 2/ }));
  await waitFor(() => expect(view.getByText('AP Chemistry')).toBeTruthy());
  const subNames = [...view.container.querySelectorAll('button')].map((b) => b.textContent ?? '');
  expect(subNames.some((n) => n.includes('지우기') || n.includes('삭제'))).toBe(false);
});

it('묶음 이름은 서버가 준 낱말을 그대로 쓴다 — 화면에 코드표를 다시 적지 않는다 (D-R18)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('정규 수업')).toBeTruthy());
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('상담·진단');
  expect(text).toContain('12개');
});

it('고치기는 코드를 건드리지 않는다 — 왜 못 바꾸는지 숫자로 말한다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('정규 수업')).toBeTruthy());
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[0]);
  await waitFor(() => expect(view.container.querySelector('#e-name')).toBeTruthy());
  expect(view.queryByDisplayValue('class')).toBeNull();
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('코드 class 는 바꾸지 않습니다');
  expect(text).toContain('수업 12개가 이 낱말로 저장돼 있습니다');
});

it('과목은 끄고 켠다 — 꺼진 과목도 목록에 남는다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('정규 수업')).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: /과목 2/ }));
  await waitFor(() => expect(view.getByText('구 SAT')).toBeTruthy());
  expect(view.getByRole('button', { name: '끄기' })).toBeTruthy();
  expect(view.getByRole('button', { name: '켜기' })).toBeTruthy();
});

it('코드와 이름이 비면 만들기를 누를 수 없다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('정규 수업')).toBeTruthy());
  const make = view.getByRole('button', { name: '만들기' }) as HTMLButtonElement;
  expect(make.disabled).toBe(true);
  fireEvent.change(view.getByLabelText('코드'), { target: { value: 'camp' } });
  expect((view.getByRole('button', { name: '만들기' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('이름'), { target: { value: '캠프' } });
  expect((view.getByRole('button', { name: '만들기' }) as HTMLButtonElement).disabled).toBe(false);
});

/** 추가 수업 (C94-d · C-38) — KIND 한 줄의 깃발이다. 원문 KIND 8종은 그대로고, 만들 때 `extra` 를 함께 보낸다 */
it('「추가 수업」을 켜고 만들면 extra: true 가 함께 간다 — 목록에는 「추가」 칩이 선다', async () => {
  useSession.getState().signIn('fixture', me);
  const posted: Array<{ url?: string; body: unknown }> = [];
  const data: Catalog = { ...catalog, kinds: [...catalog.kinds, { key: 'extra', name: '추가 수업', color: '#B45309', cap: 4, grp: 'lesson', grpLabel: '수업', rep: true, repForm: 'dev', sort: 3, extra: true, serCount: 0 }] };
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'post') { posted.push({ url: config.url, body: JSON.parse(config.data ?? '{}') }); return { config, status: 201, statusText: 'OK', headers: {}, data: {} }; }
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><ProgramsPage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText('추가 수업')).toBeTruthy());
  const extraRow = view.getByText('추가 수업').closest('tr')!;
  expect(extraRow.textContent).toContain('추가');
  expect(view.getByText('정규 수업').closest('tr')!.textContent).not.toMatch(/추가(?! 수업)/);
  fireEvent.change(view.getByLabelText('코드'), { target: { value: 'camp' } });
  fireEvent.change(view.getByLabelText('이름'), { target: { value: '방학 특강' } });
  fireEvent.click(view.getByLabelText(/^추가 수업 — 정규 밖의 수업이라 청구서에 따로 잡힙니다 \(단가는/));
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ url: '/catalog/kinds', body: expect.objectContaining({ key: 'camp', name: '방학 특강', extra: true }) });
});
