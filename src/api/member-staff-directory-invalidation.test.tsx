/** @file-guide
 * 목적: member-staff-directory-invalidation.test.tsx — 서랍 구성원 쓰기가 `/staff` 목록·상세(staff-directory 갈래)도 다시 읽게 하는지
 * 책임/재사용: 실제 훅(queries.ts)·qk·sessionQueryKey 를 그대로 쓰고 네트워크만 spy 로 갈아 끼운다. 키 모양을 시험 안에 다시 적지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 구성원 쓰기(만들기·수정·비밀번호 초기화·사용 중지·삭제)는 서랍(`family.drawer`)과 `/meta` 만 버렸다.
 * 그래서 `/staff` 목록과 `/staff/{id}` 상세는 과목·학력·영어 전용·생년월일·사용 상태를 고쳐도 새로 고침 전까지 옛 값을 보였다.
 * 여기서는 현재 사용자의 두 화면 캐시가 모두 무효가 되고, 상관없는 갈래(교재)는 그대로인지를 본다.
 */
import { createElement, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { useSession } from '@/store/useSession';
import {
  qk, sessionQueryKey, useCreateMember, useDeleteMember, useResetMemberPassword, useSetMemberActive, useUpdateMember,
} from './queries';

const viewerId = useSession.getState().me?.id ?? 'anonymous';
const staffKeys = [qk.staffDirectoryList(1, 'all', ''), qk.staffDirectoryDetail(7)];
const alreadyFollowed = [qk.drawer(), qk.meta];
const untouched = [qk.books];

const FIRE: Record<string, () => () => Promise<unknown>> = {
  '만들기': () => { const m = useCreateMember(); return () => m.mutateAsync({ username: 'new.teacher', password: 'pw-for-test', name: '새 강사', role: 'teacher' } as never); },
  '수정': () => { const m = useUpdateMember(); return () => m.mutateAsync({ id: 7, body: { name: '수정 강사' } as never }); },
  '비밀번호 초기화': () => { const m = useResetMemberPassword(); return () => m.mutateAsync({ id: 7, body: { password: 'pw-for-test' } as never }); },
  '사용 중지': () => { const m = useSetMemberActive(); return () => m.mutateAsync({ id: 7, active: false }); },
  '삭제': () => { const m = useDeleteMember(); return () => m.mutateAsync(7); },
};

describe('구성원 쓰기 → /staff 목록·상세 무효화', () => {
  it.each(Object.keys(FIRE))('%s 뒤 staff-directory 목록·상세를 다시 읽고 서랍·meta 갱신은 그대로이며 교재는 건드리지 않는다', async (name) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    [...staffKeys, ...alreadyFollowed, ...untouched].forEach((key) => client.setQueryData(sessionQueryKey(key, viewerId), { marker: 'before' }));
    const stale = (key: readonly unknown[]) => client.getQueryState(sessionQueryKey(key, viewerId))?.isInvalidated;
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 7 } });
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { id: 7 } });
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: { ok: true } });
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
    const view = renderHook(FIRE[name], { wrapper });
    try {
      await act(async () => { await view.result.current(); });
      for (const key of [...alreadyFollowed, ...staffKeys]) expect(stale(key), JSON.stringify(key)).toBe(true);
      for (const key of untouched) expect(stale(key), JSON.stringify(key)).toBe(false);
    } finally { view.unmount(); client.clear(); post.mockRestore(); patch.mockRestore(); del.mockRestore(); }
  });
});
