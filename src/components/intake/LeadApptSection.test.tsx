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

function setup(row: Lead = lead) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const view = render(
    <QueryClientProvider client={client}><LeadApptSection lead={row} kinds={KINDS} editable onDone={onDone} /></QueryClientProvider>,
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

/* ── A-02 「상담 일정 잡기」 — ② 날짜 · 시각 ③ 담당 지정 · 방식 현장 ④ 저장 → 시간표 · 단계 · 접촉이 서버 한 번 ── */
const firstLead = { id: 6, name: '카카오학생', stage: 'first', ownerId: null, ownerName: null, appts: [] } as unknown as Lead;

function setupFirst(row: Lead = firstLead) {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
    data: url === '/meta' ? { staff: [{ id: 3, name: '김범준' }, { id: 4, name: 'Grace' }], rooms: [{ id: 7, name: '본원 상담실' }], students: [], kinds: [], subs: [], lib: [] } : {},
  }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onDone = vi.fn();
  const view = render(
    <QueryClientProvider client={client}><LeadApptSection lead={row} kinds={KINDS} editable onDone={onDone} /></QueryClientProvider>,
  );
  return { onDone, section: view.getByRole('region', { name: '2차 · 진단 일정' }) };
}

async function fillSecond(section: HTMLElement) {
  fireEvent.click(within(section).getByRole('button', { name: '2차 일정 잡기' }));
  fireEvent.change(within(section).getByLabelText('2차 날짜'), { target: { value: '2026-08-25' } });
  fireEvent.change(within(section).getByLabelText('시작'), { target: { value: '16:00' } });
  fireEvent.change(within(section).getByLabelText('끝'), { target: { value: '17:00' } });
  await waitFor(() => expect(within(section).getByRole('option', { name: '본원 상담실' })).toBeTruthy());
  fireEvent.change(within(section).getByLabelText('강의실'), { target: { value: '7' } });
}

it('A-02 — 담당을 고르기 전에는 「시간표에 넣기」가 잠기고, 고르면 날짜 · 시각 · 방식 · 강의실 · 담당을 한 번에 보낸다 · 결과 문장은 서버가 돌려준 줄', async () => {
  const booked = {
    ...firstLead, stage: 'wait2nd', ownerId: 3, ownerName: '김범준',
    appts: [{ kind: 'second', kindLabel: '2차', onDate: '2026-08-25', startMin: 960, endMin: 1020, mode: 'offline', roomId: 7, placeLabel: '본원 상담실', serId: 90, scheduled: true }],
  };
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { lead: booked, created: 1, unavailable: [] } } as never);
  const { section, onDone } = setupFirst();
  await fillSecond(section);
  const bookBtn = within(section).getByRole('button', { name: '저장 · 시간표에 넣기' }) as HTMLButtonElement;
  expect(bookBtn.disabled).toBe(true);
  // 카드에만 적는 길은 담당 없이도 선다
  expect((within(section).getByRole('button', { name: '적어만 두기' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(within(section).getByLabelText('담당'), { target: { value: '3' } });
  expect(bookBtn.disabled).toBe(false);
  fireEvent.click(bookBtn);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/6/appts/book', {
    kind: 'second', onDate: '2026-08-25', startMin: 960, endMin: 1020, mode: 'offline', roomId: 7, ownerId: 3,
  }));
  await waitFor(() => expect(onDone).toHaveBeenCalledWith('2차 일정을 시간표에 넣었습니다 — 08-25 16:00 · 본원 상담실 · 담당 김범준 · 2차 대기로 옮겼습니다'));
});

it('A-02 — 겹치면 서버 문장(409)을 그대로 보이고 폼을 닫지 않는다', async () => {
  const message = '같은 시간에 담당·강의실이 이미 잡혀 있습니다 — 2차 · 2026-08-25 16:00';
  vi.spyOn(api, 'post').mockRejectedValue(Object.assign(new Error('409'), {
    isAxiosError: true, response: { status: 409, data: { code: 'RESOURCE_CONFLICT', message } },
  }));
  const { section, onDone } = setupFirst();
  await fillSecond(section);
  fireEvent.change(within(section).getByLabelText('담당'), { target: { value: '4' } });
  fireEvent.click(within(section).getByRole('button', { name: '저장 · 시간표에 넣기' }));
  await waitFor(() => expect(section.textContent).toContain(message));
  expect(onDone).not.toHaveBeenCalled();
  expect(within(section).getByRole('button', { name: '저장 · 시간표에 넣기' })).toBeTruthy();
});

it('UX-13C3a — 기존 24:00 종료를 다시 열면 native time 대신 읽을 수 있는 종료 출력이 선다', () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { staff: [], rooms: [] } } as never);
  const midnight = { ...diag, startMin: 1380, endMin: 1440 };
  const { section } = setup({ ...lead, appts: [midnight, second] } as Lead);
  fireEvent.click(within(section).getByRole('button', { name: '진단 일정 고치기' }));
  const start = within(section).getByLabelText('시작') as HTMLInputElement;
  const end = section.querySelector('input[type="time"]:not([id$="-s"])') as HTMLInputElement | null;
  expect(start.type).toBe('time');
  expect(start.step).toBe('60');
  expect(start.value).toBe('23:00');
  expect((within(section).getByRole('checkbox', { name: '24:00 (자정에 종료)' }) as HTMLInputElement).checked).toBe(true);
  expect(within(section).getByRole('status', { name: '끝 시각' }).textContent).toBe('24:00');
  expect(end?.hidden).toBe(true);
  expect(end?.tabIndex).toBe(-1);
});

it('UX-13C3a — 날짜는 좁은 화면 한 행, 시작·끝은 native 1분 선택기이며 자정 해제 후에는 저장 요청이 없다', async () => {
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: firstLead } as never);
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} } as never);
  const { section } = setupFirst();
  await fillSecond(section);
  const date = within(section).getByLabelText('2차 날짜') as HTMLInputElement;
  const start = within(section).getByLabelText('시작') as HTMLInputElement;
  const end = within(section).getByLabelText('끝') as HTMLInputElement;
  expect(date.parentElement?.className).toContain('col-span-2');
  expect(date.parentElement?.parentElement?.className).toContain('grid-cols-2');
  expect(start.type).toBe('time');
  expect(end.type).toBe('time');
  expect(start.step).toBe('60');
  expect(end.step).toBe('60');
  const midnight = within(section).getByRole('checkbox', { name: '24:00 (자정에 종료)' });
  fireEvent.click(midnight);
  expect(within(section).getByRole('status', { name: '끝 시각' }).textContent).toBe('24:00');
  fireEvent.click(midnight);
  expect((within(section).getByLabelText('끝') as HTMLInputElement).value).toBe('');
  expect((within(section).getByRole('button', { name: '적어만 두기' }) as HTMLButtonElement).disabled).toBe(true);
  expect((within(section).getByRole('button', { name: '저장 · 시간표에 넣기' }) as HTMLButtonElement).disabled).toBe(true);
  expect(put).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

it('UX-13C3a — 적어만 두기는 1분 23:59–24:00도 기존 계약대로 PUT 1440을 보낸다', async () => {
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: firstLead } as never);
  const { section } = setupFirst();
  await fillSecond(section);
  fireEvent.change(within(section).getByLabelText('시작'), { target: { value: '23:59' } });
  fireEvent.click(within(section).getByRole('checkbox', { name: '24:00 (자정에 종료)' }));
  fireEvent.click(within(section).getByRole('button', { name: '적어만 두기' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/ops/leads/6/appts', {
    kind: 'second', onDate: '2026-08-25', startMin: 1439, endMin: 1440, mode: 'offline', roomId: 7,
  }));
});

it('UX-13C3a — 시간표에 넣기는 23:00–24:00과 담당을 POST 1440으로 보낸다', async () => {
  const booked = { ...firstLead, stage: 'wait2nd', ownerId: 3, ownerName: '담당', appts: [] };
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { lead: booked, created: 1, unavailable: [] } } as never);
  const { section } = setupFirst();
  await fillSecond(section);
  fireEvent.change(within(section).getByLabelText('시작'), { target: { value: '23:00' } });
  fireEvent.click(within(section).getByRole('checkbox', { name: '24:00 (자정에 종료)' }));
  fireEvent.change(within(section).getByLabelText('담당'), { target: { value: '3' } });
  fireEvent.click(within(section).getByRole('button', { name: '저장 · 시간표에 넣기' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/6/appts/book', {
    kind: 'second', onDate: '2026-08-25', startMin: 1380, endMin: 1440, mode: 'offline', roomId: 7, ownerId: 3,
  }));
});
