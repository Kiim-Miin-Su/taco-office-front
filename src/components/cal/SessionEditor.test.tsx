/** @file-guide
 * 목적: 새 일정 창 — 겹침으로 막히면 「누구와 · 어느 수업」까지 말한다 (QA-a · B-17 · B-18 · D-R43).
 * 책임/재사용: 실제 SessionEditor/useScheduleWrite/conflictLines 를 쓰고 네트워크만 어댑터로 갈아 끼운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Meta } from '@/api/types';
import { SessionEditor } from './SessionEditor';

const meta = {
  kinds: [{ key: 'class', name: '수업', cap: 4, rep: true, grp: 'lesson', grpLabel: '수업', color: '#111', extra: false }],
  subs: [{ key: 'vocab', name: 'Vocabulary', color: '#222' }],
  staff: [{ id: 7, name: '김재훈', role: 'teacher', canAdminPage: false, canGpaPack: false, title: null }],
  rooms: [{ id: 1, name: '1호' }],
  students: [{ id: 1, name: '김민준', grade: '고1' }],
  zaccs: [], invTypes: [], cancelReasons: [], cancelTreats: [],
} as unknown as Meta;

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const got: string[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); api.defaults.adapter = originalAdapter; got.length = 0; });

function setup(conflicts: unknown[]) {
  api.defaults.adapter = (async (config: { url?: string; method?: string }) => {
    if (config.method === 'post') {
      return Promise.reject(Object.assign(new Error('conflict'), {
        response: { status: 409, data: { code: 'RESOURCE_CONFLICT', message: '같은 시간에 강사·강의실·줌이 이미 잡혀 있습니다' } },
      }));
    }
    got.push(config.url ?? '');
    return { config, status: 200, statusText: 'OK', headers: {}, data: { conflicts } };
  }) as never;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(qc);
  const view = render(
    <QueryClientProvider client={qc}>
      <SessionEditor
        draft={{ date: '2026-09-28', startMin: 570, endMin: 660, roomId: 1 }}
        meta={meta}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return view;
}

it('겹쳐서 막히면 원래 문구 뒤에 누구와·어느 수업인지 붙는다 (B-17·B-18)', async () => {
  const view = setup([
    { serId: 9, onDate: '2026-09-28', startMin: 570, endMin: 660, title: 'MAP Reading', with: 'room', whoName: '1호' },
  ]);
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(view.getByText(/같은 시간에/)).toBeTruthy());
  await waitFor(() => expect(view.getByText(/\[강의실\] 1호 · 2026-09-28 09:30–11:00 · MAP Reading/)).toBeTruthy());
  // 설명은 **막힌 뒤 한 번**만 묻는다 — 미리 물어 비었다고 저장을 건너뛰면 그 사이에 남이 그 자리를 잡는다
  expect(got.filter((u) => u === '/schedule/conflicts').length).toBe(1);
});

it('설명을 못 가져와도 원래 문구는 남는다 — 실패가 실패를 덮지 않는다', async () => {
  const view = setup([]);
  fireEvent.click(view.getByRole('button', { name: '만들기' }));
  await waitFor(() => expect(view.getByText(/같은 시간에/)).toBeTruthy());
  expect(view.queryByText(/\[강의실\]/)).toBeNull();
});
