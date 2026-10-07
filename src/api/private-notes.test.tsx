/** @file-guide
 * 목적: BOC-09D-03 강사 특이사항의 실제 query/mutation→HTTP→캐시 갱신 경계를 검증한다.
 * 책임/재사용: 생성 타입과 공용 훅을 사용하고 HTTP client만 대역으로 둔다.
 * 검증/작업 지침: docs/sprint/TBO-55/BOC-09-SCENARIOS-2026-10-07.md · docs/contracts/CONTRACTS.md
 */
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useSession } from '@/store/useSession';
import { api } from './client';
import { family, useTeacherPrivateNoteReceipts, useWriteTeacherPrivateNote } from './queries';
import type { Me, TeacherPrivateNoteReceipt, TeacherPrivateNoteWrite } from './types';

const teacher: Me = { id: 7, name: '강사A', role: 'teacher', roleLabel: '강사', title: null,
  canAdminPage: false, canCrudAll: false, canSeeProfit: false, canCrudAttendance: false,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const receipt: TeacherPrivateNoteReceipt = { id: 91, studentId: 11, studentName: '학생A', serId: 22,
  onDate: '2026-10-07', version: 1, createdAt: '2026-10-08T01:00:00Z', updatedAt: '2026-10-08T01:00:00Z' };
const command: TeacherPrivateNoteWrite = { studentId: 11, serId: 22, onDate: '2026-10-07', body: '관리자 확인 필요',
  expectedVersion: 0, requestKey: '11111111-1111-4111-8111-111111111111' };

afterEach(() => { useSession.getState().signOut(); vi.restoreAllMocks(); });

it('생성 계약 그대로 POST하고 본문 없는 영수증을 받은 뒤 최근 전달·강사 히스토리를 다시 읽는다', async () => {
  useSession.getState().signIn('teacher-private-note-test', teacher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData([...family.teacherHistory, '2026-09'], { marker: 'old history' });
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [receipt] } });
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: receipt });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => ({ receipts: useTeacherPrivateNoteReceipts(), write: useWriteTeacherPrivateNote() }), { wrapper });
  try {
    await waitFor(() => expect(view.result.current.receipts.data?.items).toEqual([receipt]));
    let result: TeacherPrivateNoteReceipt | undefined;
    await act(async () => { result = await view.result.current.write.mutateAsync(command); });
    expect(post).toHaveBeenCalledWith('/teacher/private-notes', command);
    expect(get).toHaveBeenCalledWith('/teacher/private-notes/receipts');
    expect(result).toEqual(receipt);
    expect(result).not.toHaveProperty('body');
    expect(client.getQueryState([...family.teacherHistory, '2026-09'])?.isInvalidated).toBe(true);
    await waitFor(() => expect(get.mock.calls.filter(([path]) => path === '/teacher/private-notes/receipts')).toHaveLength(2));
  } finally {
    view.unmount();
    client.clear();
  }
});
