/** @file-guide
 * 목적: BO-Q13 안건 쓰기의 성공/409 캐시 갱신 경계를 검증해 충돌 초안 덮어쓰기를 막는다.
 * 책임/재사용: 실제 useWriteMeetingAgenda와 QueryClient를 사용하고 HTTP adapter만 격리한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/decisions/PLANNING-REQUIRED.md#bo-q13
 */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, expect, it } from 'vitest';
import { api } from './client';
import { family, useWriteMeetingAgenda } from './queries';
import type { MeetingAgenda } from './types';

const originalAdapter = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = originalAdapter; });

const saved: MeetingAgenda = {
  meetingId: 3,
  content: '서버 최신 안건',
  version: 4,
  createdAt: '2026-10-07T09:00:00+09:00',
  createdById: 2,
  createdByName: '김민수',
  updatedAt: '2026-10-07T10:00:00+09:00',
  updatedById: 2,
  updatedByName: '김민수',
  locked: false,
  lockedAt: null,
  canEdit: true,
  editBlockedReason: null,
  canImportToMinutes: true,
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData([...family.ops, 'browser-regression'], { marker: '열어 둔 버전' });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, hook: renderHook(useWriteMeetingAgenda, { wrapper }) };
}

it('BO-Q13 권고안: stale 409는 ops cache를 자동 갱신하지 않아 사용자의 충돌 초안을 보존한다', async () => {
  api.defaults.adapter = async (config) => {
    throw new AxiosError('충돌', undefined, config, undefined,
      { config, status: 409, statusText: 'Conflict', headers: {},
        data: { code: 'MEETING_AGENDA_VERSION_CONFLICT', message: '다른 사람이 먼저 고쳤습니다' } });
  };
  const { client, hook } = setup();
  await act(async () => {
    await expect(hook.result.current.mutateAsync({ id: 3, body: { content: '내 충돌 초안', expectedVersion: 3 } }))
      .rejects.toMatchObject({ status: 409 });
  });
  expect(client.getQueryState([...family.ops, 'browser-regression'])?.isInvalidated).toBe(false);
  hook.unmount(); client.clear();
});

it('BO-Q13 권고안: 저장 성공은 목록과 상세가 새 version을 다시 읽도록 ops cache를 갱신한다', async () => {
  api.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: {}, data: saved });
  const { client, hook } = setup();
  await act(async () => {
    await hook.result.current.mutateAsync({ id: 3, body: { content: saved.content, expectedVersion: 3 } });
  });
  expect(client.getQueryState([...family.ops, 'browser-regression'])?.isInvalidated).toBe(true);
  hook.unmount(); client.clear();
});
