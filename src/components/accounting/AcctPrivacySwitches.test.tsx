/** @file-guide
 * 목적: 회계 탭 줄 「시급 비공개 · 컨설팅 비공개」 (N-94) — 켜짐 상태 · 눌리는가(canSet) · 무엇이 가려지는가 문장은 서버 값, 쓰기는 key 와 켬/끔만 보낸다.
 * 책임/재사용: 실제 AcctPrivacySwitches 와 useAcctPrivacy/useSetAcctPrivacy 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { AcctPrivacy, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { AcctPrivacySwitches } from './AcctPrivacySwitches';

const ceo: Me = {
  id: 1, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true,
  canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true,
  canApprove: true, canHide: true, canGpaPack: true,
};
const WAGE_SCOPE = '강사료 정산 줄의 시급 · 금액과 시급 이력이 비공개 열람 권한자에게만 보입니다 — 합계는 그대로입니다';
const privacy: AcctPrivacy = {
  canSet: true, canSeeHidden: true,
  switches: [
    { key: 'wage', label: '시급 비공개', private: false, scope: WAGE_SCOPE, setByName: null, setAt: null },
    { key: 'consulting', label: '컨설팅 비공개', private: true, scope: '컨설팅비 줄의 금액이 가려집니다 — 합계는 그대로입니다', setByName: '김민선', setAt: '2026-09-27 10:00' },
  ],
};

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let patches: Array<{ url?: string; body: unknown }> = [];
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); patches = [];
});

function setup(data: AcctPrivacy = privacy, onPatch: () => { status: number; data: unknown } = () => ({ status: 200, data })) {
  useSession.getState().signIn('fixture', ceo);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'patch') {
      patches.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      const r = onPatch();
      if (r.status >= 400) return Promise.reject(Object.assign(new Error('fail'), { response: { status: r.status, data: r.data } }));
      return { config, status: r.status, statusText: 'OK', headers: {}, data: r.data };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AcctPrivacySwitches /></QueryClientProvider>);
}

it('두 스위치는 서버 낱말 · 켜짐 상태 그대로 선다 — 원문 탭 줄 「시급 비공개 · 컨설팅 비공개」', async () => {
  const view = setup();
  const wage = await view.findByRole('button', { name: '시급 비공개' });
  const cons = view.getByRole('button', { name: '컨설팅 비공개' });
  expect(wage.getAttribute('aria-pressed')).toBe('false');
  expect(cons.getAttribute('aria-pressed')).toBe('true');
  expect(wage.getAttribute('title')).toBe(WAGE_SCOPE);
});

it('켜기 전에 무엇이 가려지는지 먼저 말하고 key 와 켬만 보낸다 · 끄기는 마지막으로 바꾼 사람을 보인다', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '시급 비공개' }));
  const on = view.getByRole('dialog', { name: '시급 비공개 켜기' });
  expect(on.textContent).toContain(`켜면 ${WAGE_SCOPE}`);
  expect(on.textContent).toContain('아직 켠 적이 없습니다');
  fireEvent.click(within(on).getByRole('button', { name: '켜기' }));
  await waitFor(() => expect(patches).toHaveLength(1));
  expect(patches[0]).toEqual({ url: '/accounting/privacy', body: { key: 'wage', private: true } });
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());

  fireEvent.click(view.getByRole('button', { name: '컨설팅 비공개' }));
  const off = view.getByRole('dialog', { name: '컨설팅 비공개 끄기' });
  expect(off.textContent).toContain('마지막으로 바꾼 사람 · 김민선 · 2026-09-27 10:00');
  fireEvent.click(within(off).getByRole('button', { name: '끄기' }));
  await waitFor(() => expect(patches).toHaveLength(2));
  expect(patches[1]!.body).toEqual({ key: 'consulting', private: false });
});

it('대표 판정이 아니면(canSet=false) 누를 수 없다 · 거절은 서버 문장 그대로 창에 남는다 (D-R39)', async () => {
  const locked = setup({ ...privacy, canSet: false });
  const wage = await locked.findByRole('button', { name: '시급 비공개' });
  expect((wage as HTMLButtonElement).disabled).toBe(true);
  expect(wage.getAttribute('title')).toContain('대표만');
  cleanup();

  const view = setup(privacy, () => ({ status: 403, data: { code: 'ACCT_PRIVACY_FORBIDDEN', message: '비공개 지정은 대표만 합니다' } }));
  fireEvent.click(await view.findByRole('button', { name: '시급 비공개' }));
  fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: '켜기' }));
  await waitFor(() => expect(view.getByText('비공개 지정은 대표만 합니다')).toBeTruthy());
  expect(view.getByRole('dialog')).toBeTruthy();
});
