/** @file-guide
 * 목적: §30 계약 상세이 서버 단계/capability와 합산 파일 제한을 그대로 그리는지 검증한다.
 * 책임/재사용: 실제 도메인 컴포넌트를 렌더하고 Query hook 응답만 경계 fixture로 교체한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsultingDetail, ConsultingFile } from '@/api/types';
import { ConsultingContractWorkflow } from './ConsultingContractWorkflow';

const state = vi.hoisted(() => ({
  detail: {} as ConsultingDetail,
  updateShare: vi.fn(),
  deliver: vi.fn(),
  archive: vi.fn(),
}));
vi.mock('@/api/queries', () => ({
  useConsultingDetail: () => ({ data: state.detail, isPending: false, isError: false, refetch: vi.fn() }),
  useMeta: () => ({ data: { staff: [] } }),
  useUpdateConsultingShare: () => ({ mutate: state.updateShare, mutateAsync: state.updateShare, isPending: false, isError: false, error: null }),
  useAddConsultingContractFile: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useRemoveConsultingContractFile: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useAddConsultingFeedback: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useResolveConsultingFeedback: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useDeliverConsultingContract: () => ({ mutate: state.deliver, mutateAsync: state.deliver, isPending: false, isError: false, error: null }),
  useAddConsultingSignedFile: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useArchiveConsulting: () => ({ mutate: state.archive, mutateAsync: state.archive, isPending: false, isError: false, error: null }),
  useToggleConsultingItem: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
}));

const capabilities: ConsultingDetail['capabilities'] = {
  canEdit: true, canChangeShare: true, canAddContractFile: true, canRemoveContractFile: true,
  canAddFeedback: true, canResolveFeedback: true, canDeliver: false, canAddSignedFile: false,
  canAddPayment: false, canCreateInvoice: false, canArchive: true,
  externalParentSendSupported: false, externalParentSendReason: '외부 수신처 정책 미정',
};

const detail = {
  id: 7, consType: 'essay', consTypeLabel: '에세이 지도', stage: 'contract', contractStep: 3,
  studentIds: [10], studentNames: ['고은성'], requester: 'mother', ownerId: 3, ownerName: '김범준',
  startOn: '2026-09-21', endOn: '2026-10-20', amount: 800000, sessions: 6,
  share: 'all', pickedStaffIds: [], pickedStaffNames: [], createdAt: '2026-09-21T00:00:00.000Z',
  typeCapability: {
    defaultItemsSupported: false,
    reason: '이 유형의 기본 항목 원문이 아직 없습니다.',
    scheduleCreationSupported: false,
    scheduleCreationReason: '요일·시간 정책이 없어 스케줄은 만들지 않습니다.',
  },
  capabilities, contractFiles: [], signedFiles: [], feedback: [], delivery: null,
  payment: { paid: 0, due: 800000, invoiceId: null },
} satisfies ConsultingDetail;

describe('ConsultingContractWorkflow', () => {
  beforeEach(() => {
    state.detail = detail;
    state.updateShare.mockReset().mockResolvedValue(detail);
    state.deliver.mockReset();
    state.archive.mockReset();
  });

  it('서버가 준 3/5 단계·미지원 사유·금액을 표시하고 capability 없는 동작은 막는다', () => {
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(view.getByRole('img', { name: '계약 3/5' })).toBeTruthy();
    expect(view.getByText('이 유형의 기본 항목 원문이 아직 없습니다.')).toBeTruthy();
    expect(view.getByText('800,000원')).toBeTruthy();
    expect(view.getByRole('button', { name: '전달 완료 기록' }).hasAttribute('disabled')).toBe(true);
    expect(view.getByRole('button', { name: '수납·청구서 열기' }).hasAttribute('disabled')).toBe(true);
    expect(view.getByRole('button', { name: /파일 고르기/ })).toBeTruthy();
  });

  it('계약서와 서명본을 합쳐 10개면 두 drop zone을 모두 잠근다', () => {
    const file = (id: number, role: ConsultingFile['role']): ConsultingFile => ({
      id, name: `${id}.pdf`, mime: 'application/pdf', bytes: 10, url: `/files/${id}`, role, uploadedByName: '김민수', uploadedAt: '2026-09-21',
    });
    state.detail = { ...detail, capabilities: { ...capabilities, canAddSignedFile: true }, contractFiles: Array.from({ length: 9 }, (_, index) => file(index + 1, index === 0 ? 'draft' : 'revision')), signedFiles: [file(10, 'signed')] };
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(view.getByText('계약서+서명본 합계 · 10/10')).toBeTruthy();
    expect(view.getByRole('button', { name: /파일 고르기/ }).hasAttribute('disabled')).toBe(true);
    expect(view.getByRole('button', { name: /서명본 고르기/ }).hasAttribute('disabled')).toBe(true);
  });

  it('기존 전달 이력이 있어도 서버가 재전달을 허용하면 기록 버튼을 다시 제공한다', () => {
    state.detail = {
      ...detail,
      delivery: { deliveredAt: '2026-09-22T12:00:00.000Z', deliveredByName: '김민수' },
      capabilities: { ...capabilities, canDeliver: true },
    };
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(view.getByText(/김민수 전달 기록/)).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '다시 전달 완료 기록' }));
    expect(state.deliver).toHaveBeenCalledWith(7);
  });

  it('공개 범위 mutation 중 Segmented를 잠그고 빠른 중복 mutation을 막는다', async () => {
    let finish: (value: ConsultingDetail) => void = () => undefined;
    state.updateShare.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    const moneyOnly = view.getByRole('button', { name: '수납만 공개' });
    const privateShare = view.getByRole('button', { name: '전체 비공개' });
    expect(moneyOnly.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(moneyOnly);
    expect(moneyOnly.hasAttribute('disabled')).toBe(true);
    expect(privateShare.hasAttribute('disabled')).toBe(true);
    state.detail = { ...detail, share: 'money_only' };
    view.rerender(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    const privateAfterOptimistic = view.getByRole('button', { name: '전체 비공개' });
    expect(privateAfterOptimistic.hasAttribute('disabled')).toBe(true);
    fireEvent.click(privateAfterOptimistic);
    expect(state.updateShare).toHaveBeenCalledTimes(1);
    finish({ ...detail, share: 'money_only' });
    await waitFor(() => expect(moneyOnly.hasAttribute('disabled')).toBe(false));
  });

  it('중첩 보관 확인창에서 Escape 한 번은 확인창만 닫고 부모와 초점을 유지한다', () => {
    const onClose = vi.fn();
    const view = render(<ConsultingContractWorkflow consId={7} onClose={onClose} onOpenAccounting={vi.fn()} />);
    const archiveTrigger = view.getByRole('button', { name: '보관 삭제' });
    archiveTrigger.focus();
    fireEvent.click(archiveTrigger);
    expect(view.getAllByRole('dialog')).toHaveLength(2);
    const cancel = view.getByRole('button', { name: '취소' });
    const archiveConfirm = view.getAllByRole('button', { name: '보관 삭제' })[1];
    expect(document.activeElement).toBe(cancel);
    archiveConfirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(archiveConfirm);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(view.getAllByRole('dialog')).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(archiveTrigger);
  });
});
