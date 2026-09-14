/** @file-guide
 * 목적: §29·§30 TanStack Query 연결과 공개범위 낙관 갱신 rollback/reconcile을 검증한다.
 * 책임/재사용: 실제 query key/hook과 공용 Axios만 사용하며 서버 단계 전이를 프론트 fixture 계산으로 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Consulting, ConsultingDetail, ConsultingList, Me } from '@/api/types';
import { qk, sessionQueryKey, useUpdateConsultingShare } from './queries';
import { useSession } from '@/store/useSession';
import { CONSULTING_STAGE_FIXTURE, consultingItem } from '@/components/consulting/consulting.fixture';

const me = {
  id: 2, name: '김민수', role: 'admin', roleLabel: '관리자', title: '관리자',
  canAdminPage: true, canCrudAll: true, canSeeProfit: false, canCrudAttendance: true,
  canMoney: false, canWage: true, canApprove: true, canHide: false, canGpaPack: true,
} satisfies Me;

const summary: Consulting = consultingItem({
  id: 7, consType: 'admissions', stage: 'contract', contractStep: 1, studentNames: ['고은성'],
  ownerName: '김범준', sessions: 6, endOn: '2026-10-20', createdAt: '2026-09-21', amount: null,
  share: 'all', canOpen: true, sessionsLog: [], items: [], contractStepLabel: '계약서 준비',
});

const detail = {
  id: 7, consType: 'admissions', consTypeLabel: '국제학교 지원', stage: 'contract', contractStep: 1,
  studentIds: [10], studentNames: ['고은성'], requester: 'mother', ownerId: 3, ownerName: '김범준',
  startOn: '2026-09-21', endOn: '2026-10-20', amount: 800000, sessions: 6,
  share: 'all', pickedStaffIds: [], pickedStaffNames: [], createdAt: '2026-09-21T00:00:00.000Z',
  typeCapability: { defaultItemsSupported: true, reason: null, scheduleCreationSupported: false, scheduleCreationReason: '일정 정책 미정' },
  capabilities: {
    canEdit: true, canChangeShare: true, canAddContractFile: true, canRemoveContractFile: true,
    canAddFeedback: true, canResolveFeedback: true, canDeliver: false, canAddSignedFile: false,
    canAddPayment: false, canCreateInvoice: false, canArchive: true,
    externalParentSendSupported: false, externalParentSendReason: '수신처 정책 미정',
  },
  contractFiles: [], signedFiles: [], feedback: [], delivery: null,
  payment: { paid: null, due: null, invoiceId: null },
} satisfies ConsultingDetail;

const originalAdapter = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = originalAdapter; useSession.getState().signOut(); vi.restoreAllMocks(); });

function setup() {
  useSession.getState().signIn('fixture', me);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const detailKey = sessionQueryKey(qk.consultingDetail(7), me.id);
  const listKey = sessionQueryKey(qk.consulting, me.id);
  client.setQueryData(detailKey, detail);
  client.setQueryData<ConsultingList>(listKey, { items: [summary, { ...summary, id: 8 }], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, detailKey, listKey, wrapper };
}

describe('컨설팅 공개범위 낙관 갱신', () => {
  it('대상 건만 먼저 바꾸고 실패하면 detail/list snapshot을 모두 복원한다', async () => {
    const { client, detailKey, listKey, wrapper } = setup();
    let rejectRequest: (reason: unknown) => void = () => undefined;
    vi.spyOn(api, 'patch').mockImplementation(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
    const hook = renderHook(() => useUpdateConsultingShare(), { wrapper });
    const mutation = hook.result.current;
    hook.unmount();
    const pending = mutation.mutateAsync({ consId: 7, share: 'picked', pickedStaffIds: [2] }).catch(() => undefined);
    await waitFor(() => expect(client.getQueryData<ConsultingDetail>(detailKey)?.share).toBe('picked'));
    const optimistic = client.getQueryData<ConsultingList>(listKey)?.items ?? [];
    expect(optimistic.map((item) => [item.id, item.share])).toEqual([[7, 'picked'], [8, 'all']]);
    rejectRequest(new Error('denied'));
    await pending;
    expect(client.getQueryData<ConsultingDetail>(detailKey)).toEqual(detail);
    expect(client.getQueryData<ConsultingList>(listKey)?.items.map((item) => item.share)).toEqual(['all', 'all']);
    client.clear();
  });

  it('성공하면 서버가 돌려준 detail 단계로 교체하고 단계 숫자를 로컬에서 올리지 않는다', async () => {
    const { client, detailKey, wrapper } = setup();
    const returned = { ...detail, share: 'private' as const, contractStep: 4 };
    vi.spyOn(api, 'patch').mockResolvedValue({ data: returned } as never);
    const hook = renderHook(() => useUpdateConsultingShare(), { wrapper });
    const mutation = hook.result.current;
    hook.unmount();
    await mutation.mutateAsync({ consId: 7, share: 'private' });
    expect(client.getQueryData<ConsultingDetail>(detailKey)?.contractStep).toBe(4);
    client.clear();
  });
});
