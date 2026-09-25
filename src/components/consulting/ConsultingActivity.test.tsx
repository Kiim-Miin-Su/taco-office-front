/** @file-guide
 * 목적: §31 회차 기록 패널 — 「+ 회차 기록」은 서버 canAddSession 에만 서고, 육하원칙은 바뀐 칸만 보내며, 앞으로 잡아 둔 날짜는 「앞으로」로 갈린다 (C95).
 * 책임/재사용: 실제 ConsultingActivity/useWriteConsultingSession 을 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { ConsultingDetail } from '@/api/types';
import { ConsultingActivity } from './ConsultingActivity';
import { consultingItem } from './consulting.fixture';

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const patched: Array<{ url?: string; body: unknown }> = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; patched.length = 0; });

const item = consultingItem({
  id: 2, stage: 'running', contractStep: 5, sessions: 8, sessionsDone: 1,
  sessionsLog: [
    {
      id: 31, seq: 3, onDate: '2026-09-16', who: '김재훈 · 정하람', what: 'Body Paragraph 논거 재배치', why: null, how: null, serId: 15, done: true,
      startMin: 960, endMin: 1020, staffName: '김범준', roomName: '4호', recorded: false, result: null, nextUntil: null,
    },
    {
      id: 32, seq: 4, onDate: '2026-12-01', who: '김재훈 · 정하람', what: null, why: null, how: null, serId: 90, done: false,
      startMin: null, endMin: null, staffName: null, roomName: null, recorded: false, result: null, nextUntil: null,
    },
  ],
});
const capabilities = {
  canEdit: false, canChangeShare: false, canSetPrivate: false, canAddContractFile: false, canRemoveContractFile: false, canAddFeedback: false, canResolveFeedback: false,
  canDeliver: false, canAddSignedFile: false, canAddPayment: false, payBlockedReason: null, canCreateInvoice: false, canArchive: true,
  externalParentSendSupported: false, externalParentSendReason: null, canAddSession: true, canClose: false, closeBlockedReason: '남았다',
} satisfies ConsultingDetail['capabilities'];

function setup(detail?: Partial<ConsultingDetail>) {
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    if (config.method === 'patch') {
      patched.push({ url: config.url, body: JSON.parse(config.data ?? '{}') });
      return { config, status: 200, statusText: 'OK', headers: {}, data: { ...item.sessionsLog[0], why: '주제문 순서', how: '문단 단위 교정' } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: {} };
  }) as never;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const onAddSession = vi.fn();
  const view = render(<QueryClientProvider client={client}>
    <ConsultingActivity item={item} detail={detail ? { capabilities, ...detail } as ConsultingDetail : undefined} onAddSession={onAddSession} />
  </QueryClientProvider>);
  return { view, onAddSession };
}

it('머리는 서버의 「한 회차」이고 잡아 둔 날짜는 「앞으로」 · 「+ 회차 기록」은 canAddSession 에만 선다 (31-01)', () => {
  const { view, onAddSession } = setup({ capabilities });
  const text = (view.container.textContent ?? '').replace(/\s+/g, ' ');
  // 원본 §31 머리 「2 / 6회 진행한 회차」 — 수는 서버의 sessionsDone
  expect(text).toContain('1 / 8회 진행한 회차');
  expect(text).toContain('회차 기록 2건');
  expect(view.getAllByText('앞으로')).toHaveLength(1);
  fireEvent.click(view.getByRole('button', { name: '+ 회차 기록' }));
  expect(onAddSession).toHaveBeenCalled();
  cleanup();
  const locked = setup({ capabilities: { ...capabilities, canAddSession: false } });
  expect(locked.view.queryByRole('button', { name: '+ 회차 기록' })).toBeNull();
});

it('「고치기」를 펼쳐 왜·어떻게만 적으면 그 둘만 보낸다 (보낸 칸만 · C93 PATCH 규약 · 31-10)', async () => {
  const { view } = setup({ capabilities });
  fireEvent.click(view.getByRole('button', { name: '3회차 고치기' }));
  const form = view.getByLabelText('3회차 육하원칙');
  expect((within(form).getByLabelText('무엇을') as HTMLTextAreaElement).value).toBe('Body Paragraph 논거 재배치');
  const save = within(form).getByRole('button', { name: '저장' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true); // 바뀐 것이 없다
  fireEvent.change(within(form).getByLabelText('왜'), { target: { value: ' 주제문 순서 ' } });
  fireEvent.change(within(form).getByLabelText('어떻게'), { target: { value: '문단 단위 교정' } });
  fireEvent.click(save);
  await waitFor(() => expect(patched).toHaveLength(1));
  expect(patched[0]).toEqual({ url: '/consulting/2/sessions/31', body: { why: '주제문 순서', how: '문단 단위 교정' } });
  await waitFor(() => expect(view.queryByLabelText('3회차 육하원칙')).toBeNull());
});

/**
 * 31-04 (P1) — 끝낸 항목 아래에 「처리일 · 처리자」. `ConsItemDto.doneOn · doneBy` 는 이미 응답에 실려 온다 — 화면이 그리기만 한다.
 * 안 끝낸 항목에는 아무것도 적지 않는다(기한 칸은 아직 없다 — 없는 값을 지어내지 않는다).
 */
it('끝낸 항목 아래에 처리 시각 · 처리자를, 안 끝낸 항목에는 「기한 없음」을 적는다 · 머리는 「4 / 7 · 57%」 (31-02 · 31-03 · 31-04)', () => {
  const withItems = consultingItem({
    id: 2, stage: 'running', contractStep: 5,
    items: [
      { id: 1, seq: 1, label: '지원서 작성', required: true, done: true, doneBy: '김범준', doneOn: '2026-07-22', doneAt: '2026-07-22T14:00:00+09:00', source: 'template' },
      { id: 2, seq: 2, label: '추천서 2부', required: false, done: false, doneBy: null, doneOn: null, doneAt: null, source: 'template' },
      // 처리 시각이 없는 옛 줄은 처리일만 적는다 — 시각을 지어내지 않는다
      { id: 3, seq: 3, label: '여권 사본', required: false, done: true, doneBy: null, doneOn: '2026-07-24', doneAt: null, source: 'template' },
    ],
  });
  const client = new QueryClient();
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><ConsultingActivity item={withItems} /></QueryClientProvider>);
  const grid = view.getByRole('region', { name: '해야 할 항목' });
  const text = (grid.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('해야 할 항목 2 / 3');
  expect(text).toContain('67%');
  const rows = within(grid).getAllByRole('listitem');
  expect(rows.map((li) => li.textContent)).toEqual([
    expect.stringContaining('2026-07-22 14:00 · 김범준'),
    expect.stringContaining('기한 없음'),
    expect.stringContaining('2026-07-24'),
  ]);
  expect(view.getByText('2026-07-22 14:00 · 김범준')).toBeTruthy();
  expect(view.getByText('2026-07-24')).toBeTruthy();
  // 개발 설명(「서버 원장」)은 사용자 글에 없다
  expect(view.queryByText(/서버 원장/)).toBeNull();
});

/**
 * 31-07 · 31-08 · 31-09 (P1) — 회차 머리는 「3회차 · 26년 9월 16일 수요일 · 16:00–17:00 · 김범준 · 4호 · 기록됨」,
 * 본문은 무엇을 · 왜 · 어떻게 3열 · 「결과」 인용 · 「다음까지」 줄. 값은 전부 서버가 준 것이다(시각·담당·강의실은 시간표 회차에서 · 「기록됨」은 서버 판정).
 */
it('회차 머리에 날짜 낱말 · 시각 · 담당 · 강의실 · 「기록됨」을 적고 결과와 다음까지를 보인다 · 「일정」은 그날 시간표로 간다 (31-07 · 31-08 · 31-10)', () => {
  const recorded = consultingItem({
    id: 2, stage: 'running', contractStep: 5, sessions: 6, sessionsDone: 1,
    sessionsLog: [{
      id: 41, seq: 1, onDate: '2026-09-16', who: '김범준 · 고은성', what: '학교 3곳 후보 정리', why: '지원 범위를 좁히기 위해', how: '성적표와 활동 목록을 함께 보며',
      serId: 15, done: true, startMin: 960, endMin: 1020, staffName: '김범준', roomName: '4호', recorded: true,
      result: 'BHA · KIS · Chadwick 3곳으로 좁혔습니다.', nextUntil: '각 학교 원서 항목 정리',
    }],
  });
  const client = new QueryClient();
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><ConsultingActivity item={recorded} /></QueryClientProvider>);
  const card = within(view.getByRole('region', { name: '회차 기록' })).getAllByRole('listitem')[0]!;
  const text = (card.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).toContain('1회차');
  expect(text).toContain('26년 9월 16일 수요일');
  expect(text).toContain('16:00–17:00');
  expect(text).toContain('김범준');
  expect(within(card).getByText('4호')).toBeTruthy();
  expect(within(card).getByText('기록됨')).toBeTruthy();
  expect(within(card).getByText('BHA · KIS · Chadwick 3곳으로 좁혔습니다.')).toBeTruthy();
  expect(within(card).getByText('각 학교 원서 항목 정리')).toBeTruthy();
  // 「누가」는 본문 칸이 아니다 — 머리의 담당 이름이 그 자리다 (31-09)
  expect(within(card).queryByText('누가')).toBeNull();
  expect(within(card).getByRole('link', { name: '1회차 일정' }).getAttribute('href')).toBe('/schedule?date=2026-09-16');
});

it('「다음까지」·「결과」도 바뀐 칸만 보낸다 — 다음까지는 담당의 할 일이 된다는 안내가 선다 (31-08)', async () => {
  const { view } = setup({ capabilities });
  fireEvent.click(view.getByRole('button', { name: '3회차 고치기' }));
  const form = view.getByLabelText('3회차 육하원칙');
  expect(within(form).getByText(/담당자의 할 일로 올라가고 알림이 갑니다/)).toBeTruthy();
  fireEvent.change(within(form).getByLabelText('결과'), { target: { value: '논거 순서 확정' } });
  fireEvent.change(within(form).getByLabelText('다음까지'), { target: { value: ' 결론 문단 초안 ' } });
  fireEvent.click(within(form).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(patched).toHaveLength(1));
  expect(patched[0]).toEqual({ url: '/consulting/2/sessions/31', body: { result: '논거 순서 확정', nextUntil: '결론 문단 초안' } });
});
