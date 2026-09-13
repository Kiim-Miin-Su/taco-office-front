/** @file-guide
 * 목적: §43 목적지 「문구 관리」 — 틀을 고쳐도 이미 쓴 안내는 안 바뀐다 (C51).
 * 책임/재사용: 실제 PhrasesPage/useGuideTemplates 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { GuideTemplate, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import PhrasesPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const me: Me = {
  id: 1, name: '관리자', role: 'admin', roleLabel: '관리자', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: false, canCrudAttendance: true, canMoney: false, canWage: false,
  canApprove: true, canHide: true, canGpaPack: true,
};

const rows: GuideTemplate[] = [
  { id: 1, name: '첫 수업 안내', body: '안녕하세요. 첫 수업은 9월 10일입니다.' },
  { id: 2, name: '강사 교체 안내', body: '선생님이 바뀌었습니다.' },
];

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut();
});

function setup() {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: unknown) => ({ config, status: 200, statusText: 'OK', headers: {}, data: rows })) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><PhrasesPage /></QueryClientProvider>);
}

it('지우기 단추가 없다 — 원문에 지우는 자리도 끄는 자리도 없다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('첫 수업 안내')).toBeTruthy());
  const names = [...view.container.querySelectorAll('button')].map((b) => b.textContent ?? '');
  expect(names.some((n) => n.includes('지우기') || n.includes('삭제') || n.includes('끄기'))).toBe(false);
});

it('틀과 안내가 끊어져 있다는 것을 화면이 말한다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('첫 수업 안내')).toBeTruthy());
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('본문을 복사해');
  expect(text).toContain('이미 보낸 안내의 말은 그대로');
});

it('이름과 문구가 비면 만들기를 누를 수 없다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('첫 수업 안내')).toBeTruthy());
  const make = () => view.getByRole('button', { name: '만들기' }) as HTMLButtonElement;
  expect(make().disabled).toBe(true);
  fireEvent.change(view.getByLabelText('이름'), { target: { value: '보강 안내' } });
  expect(make().disabled).toBe(true);
  fireEvent.change(view.getByLabelText('문구'), { target: { value: '보강은 토요일입니다' } });
  expect(make().disabled).toBe(false);
});

it('고치기는 이름과 문구를 그 자리에 채워 연다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('첫 수업 안내')).toBeTruthy());
  fireEvent.click(view.getAllByRole('button', { name: '고치기' })[0]);
  await waitFor(() => expect(view.container.querySelector('#e-name')).toBeTruthy());
  expect((view.container.querySelector('#e-name') as HTMLInputElement).value).toBe('첫 수업 안내');
  expect((view.container.querySelector('#e-body') as HTMLTextAreaElement).value).toBe(rows[0].body);
});
