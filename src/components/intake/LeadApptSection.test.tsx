/** @file-guide
 * 목적: LeadApptSection.test.tsx — §23 상담 서랍 「2차 · 진단 일정」 지우기 (23-15 · impl3-w8) 회귀 (test)
 * 책임/재사용: 실제 LeadApptSection/useDeleteLeadAppt 를 쓰고 네트워크만 갈아 끼운다. 제품 규칙(시간표에 만든 줄은 못 지움)은 서버 문장을 그대로 본다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { LeadApptSection } from './LeadApptSection';
import type { Lead, LeadAppt } from '@/api/types';

const KINDS = [{ key: 'diag', label: '진단' }, { key: 'second', label: '2차' }];
const diag: LeadAppt = {
  kind: 'diag', kindLabel: '진단', onDate: '2026-09-28', startMin: 600, endMin: 660, mode: 'offline',
  roomId: 3, placeLabel: '3층 컨설팅룸', serId: null, scheduled: false,
};
const second: LeadAppt = {
  kind: 'second', kindLabel: '2차', onDate: '2026-09-30', startMin: 870, endMin: 930, mode: 'online',
  roomId: null, placeLabel: '온라인 줌', serId: 41, scheduled: true,
};
const lead = { id: 5, name: '표은결', stage: 'wait2nd', appts: [diag, second] } as unknown as Lead;

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const view = render(
    <QueryClientProvider client={client}><LeadApptSection lead={lead} kinds={KINDS} editable onDone={onDone} /></QueryClientProvider>,
  );
  return { onDone, section: view.getByRole('region', { name: '2차 · 진단 일정' }) };
}

it('미생성 줄만 「지우기」가 서고, 두 번 눌러야 서버에 지우기를 보낸다 — 「두기」는 되돌린다', async () => {
  const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: { ...lead, appts: [second] } } as never);
  const { section, onDone } = setup();
  // 시간표에 만든 2차 줄에는 지우기가 없다(시간표가 정본)
  expect(within(section).queryByRole('button', { name: '2차 일정 지우기' })).toBeNull();

  fireEvent.click(within(section).getByRole('button', { name: '진단 일정 지우기' }));
  expect(del).not.toHaveBeenCalled();
  expect(within(section).getByRole('button', { name: '진단 일정 지우기 확인' }).textContent).toBe('한 번 더 누르면 지움');
  fireEvent.click(within(section).getByRole('button', { name: '두기' }));
  expect(within(section).queryByRole('button', { name: '진단 일정 지우기 확인' })).toBeNull();

  fireEvent.click(within(section).getByRole('button', { name: '진단 일정 지우기' }));
  fireEvent.click(within(section).getByRole('button', { name: '진단 일정 지우기 확인' }));
  await waitFor(() => expect(del).toHaveBeenCalledWith('/ops/leads/5/appts/diag'));
  await waitFor(() => expect(onDone).toHaveBeenCalledWith('진단 일정을 지웠습니다'));
});

it('서버가 막으면(409) 그 문장을 그대로 보인다', async () => {
  const message = '진단 일정은 이미 시간표에 만들었습니다 — 시간표에서 그 회차를 지우면 여기서도 지울 수 있습니다';
  vi.spyOn(api, 'delete').mockRejectedValue(Object.assign(new Error('409'), {
    isAxiosError: true, response: { status: 409, data: { code: 'LEAD_APPT_SCHEDULED', message } },
  }));
  const { section, onDone } = setup();
  fireEvent.click(within(section).getByRole('button', { name: '진단 일정 지우기' }));
  fireEvent.click(within(section).getByRole('button', { name: '진단 일정 지우기 확인' }));
  await waitFor(() => expect(section.textContent).toContain(message));
  expect(onDone).not.toHaveBeenCalled();
});
