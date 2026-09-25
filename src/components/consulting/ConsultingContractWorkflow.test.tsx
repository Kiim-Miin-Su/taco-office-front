/** @file-guide
 * 목적: §30 계약 상세이 서버 단계/capability와 합산 파일 제한을 그대로 그리는지 검증한다.
 * 책임/재사용: 실제 도메인 컴포넌트를 렌더하고 Query hook 응답만 경계 fixture로 교체한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsultingDetail, ConsultingFile } from '@/api/types';
import { ConsultingContractWorkflow } from './ConsultingContractWorkflow';
import { CONTRACT_STEPS_FIXTURE, consultingItem } from './consulting.fixture';

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
  // C95 — 회차 잡기·육하원칙·종료·문구 틀. 이 시험은 창을 열지 않으므로 대역만 둔다
  useAddConsultingSessions: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useWriteConsultingSession: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useCloseConsulting: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useGuideTemplates: () => ({ data: [] }),
}));

const capabilities: ConsultingDetail['capabilities'] = {
  // 이 표본은 **대표가 보는** 상세다 — 비공개 지정까지 열려 있다 (S4 · 매니저 화면은 아래 회귀가 따로 본다)
  canEdit: true, canChangeShare: true, canSetPrivate: true, canAddContractFile: true, canRemoveContractFile: true,
  canAddFeedback: true, canResolveFeedback: true, canDeliver: false, canAddSignedFile: false,
  canAddPayment: false, payBlockedReason: null, canCreateInvoice: false, canArchive: true,
  externalParentSendSupported: false, externalParentSendReason: '외부 수신처 정책 미정',
  canAddSession: false, canClose: false, closeBlockedReason: '수납이 끝나 진행 중인 컨설팅만 종료할 수 있습니다',
};

const detail = {
  id: 7, consType: 'essay', consTypeLabel: '에세이 지도', stage: 'contract', contractStep: 3,
  studentIds: [10], studentNames: ['고은성'], requester: 'mother', ownerId: 3, ownerName: '김범준',
  startOn: '2026-09-21', endOn: '2026-10-20', amount: 800000, sessions: 6,
  share: 'all', shareLabel: '전체 공개', shareMeaning: '관리자 누구나 봅니다', contractSteps: CONTRACT_STEPS_FIXTURE,
  pickedStaffIds: [], pickedStaffNames: [], createdAt: '2026-09-21T00:00:00.000Z',
  typeCapability: {
    defaultItemsSupported: false,
    reason: '이 유형의 기본 항목 원문이 아직 없습니다.',
    scheduleCreationSupported: false,
    scheduleCreationReason: '요일·시간 정책이 없어 스케줄은 만들지 않습니다.',
  },
  capabilities, contractFiles: [], signedFiles: [], feedback: [], delivery: null,
  payment: { paid: 0, due: 800000, invoiceId: null },
  sessionsDone: 0, sessionsPlanned: 0, requiredLeft: 0, closedAt: null, closedByName: null,
} satisfies ConsultingDetail;

/** 공개 범위는 한 줄 배너다 — 고르는 칸은 「공개 범위 바꾸기」를 눌러야 열린다 (30-06) */
const openShare = (view: ReturnType<typeof render>) => fireEvent.click(view.getByRole('button', { name: '공개 범위 바꾸기' }));

describe('ConsultingContractWorkflow', () => {
  beforeEach(() => {
    state.detail = detail;
    state.updateShare.mockReset().mockResolvedValue(detail);
    state.deliver.mockReset();
    state.archive.mockReset();
  });

  it('「전체 비공개」는 canSetPrivate 일 때만 고를 수 있다 — 이미 비공개인 건은 그 칸이 남는다 (S4 · §76)', () => {
    // 대표 표본에는 칸이 선다
    const ceo = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    openShare(ceo);
    expect(ceo.getByRole('button', { name: '전체 비공개' })).toBeTruthy();
    cleanup();

    state.detail = { ...detail, capabilities: { ...capabilities, canSetPrivate: false } };
    const mgr = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    openShare(mgr);
    expect(mgr.queryByRole('button', { name: '전체 비공개' })).toBeNull();
    // 범위를 바꾸는 것 자체는 열려 있다 — 다른 층이다
    expect(mgr.getByRole('button', { name: '수납만 공개' })).toBeTruthy();
    cleanup();

    // 이미 비공개인 건에서는 칸을 빼지 않는다 — 빼면 아무것도 안 눌린 것처럼 보인다
    state.detail = { ...detail, share: 'private', capabilities: { ...capabilities, canSetPrivate: false } };
    const owner = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    openShare(owner);
    expect(owner.getByRole('button', { name: '전체 비공개', pressed: true })).toBeTruthy();
  });

  it('서버가 준 3/5 단계·미지원 사유·금액을 표시하고 capability 없는 동작은 막는다', () => {
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(view.getByRole('list', { name: '계약 3/5' })).toBeTruthy();
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
    // 서명본이 있다는 것은 전달이 끝났다는 뜻이다 — 전달 전에는 서명본 칸 대신 「전달 먼저 해주세요」가 선다 (30-13)
    state.detail = { ...detail, delivery: { deliveredAt: '2026-09-22T12:00:00+09:00', deliveredByName: '김민수' }, capabilities: { ...capabilities, canAddSignedFile: true }, contractFiles: Array.from({ length: 9 }, (_, index) => file(index + 1, index === 0 ? 'draft' : 'revision')), signedFiles: [file(10, 'signed')] };
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
    openShare(view);
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
    const archiveTrigger = view.getByRole('button', { name: '지우기' });
    archiveTrigger.focus();
    fireEvent.click(archiveTrigger);
    expect(view.getAllByRole('dialog')).toHaveLength(2);
    const cancel = view.getByRole('button', { name: '취소' });
    const archiveConfirm = view.getAllByRole('button', { name: '지우기' })[1];
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

  /**
   * 30-01 (P1) — 원본 슬라이드 26 「카드 클릭 → 상세 3탭(계약/진행/종료)」.
   * 예전에는 누를 수 없는 표시였고 계약 ①~⑤ · 진행 항목 · 회차가 한 스크롤에 쌓였다. 기본 탭은 서버가 준 지금 단계다.
   */
  it('「1 · 계약 / 2 · 진행 / 3 · 종료」는 누르는 탭이고, 탭마다 본문이 바뀐다 — 기본은 지금 단계(계약)', () => {
    const summary = consultingItem({ id: 7, stage: 'contract', sessions: 6, sessionsDone: 0 });
    const view = render(<ConsultingContractWorkflow consId={7} summary={summary} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    const tabs = view.getByRole('group', { name: '상세 단계' });
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['1 · 계약', '2 · 진행', '3 · 종료']);
    expect(within(tabs).getByRole('button', { name: '1 · 계약', pressed: true })).toBeTruthy();
    expect(view.getByText('① 계약서 준비')).toBeTruthy();
    expect(view.queryByText(/회차 기록 \d+건/)).toBeNull();

    fireEvent.click(within(tabs).getByRole('button', { name: '2 · 진행' }));
    expect(view.queryByText('① 계약서 준비')).toBeNull();
    expect(view.getByText(/회차 기록 0건/)).toBeTruthy();

    fireEvent.click(within(tabs).getByRole('button', { name: '3 · 종료' }));
    expect(view.queryByText(/회차 기록 \d+건/)).toBeNull();
    // 종료 진입은 이 탭에 있다 — 막힌 이유는 서버 문장 그대로 보인다
    expect(view.getByRole('button', { name: '컨설팅 종료' }).hasAttribute('disabled')).toBe(true);
    expect(view.getByText('수납이 끝나 진행 중인 컨설팅만 종료할 수 있습니다')).toBeTruthy();
    // 공개 범위와 바닥 단추는 탭과 상관없이 남는다
    expect(view.getByRole('button', { name: '공개 범위 바꾸기' })).toBeTruthy();
    expect(view.getByRole('button', { name: '지우기' })).toBeTruthy();
  });

  it('진행 중인 건은 「2 · 진행」 탭으로 열린다', () => {
    state.detail = { ...detail, stage: 'running', contractStep: 5 };
    const summary = consultingItem({ id: 7, stage: 'running', sessions: 6, sessionsDone: 2 });
    const view = render(<ConsultingContractWorkflow consId={7} summary={summary} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(view.getByRole('button', { name: '2 · 진행', pressed: true })).toBeTruthy();
    expect(view.getByText(/회차 기록 0건/)).toBeTruthy();
    expect(view.queryByText('① 계약서 준비')).toBeNull();
  });

  it('끝난 건은 「3 · 종료」 탭으로 열리고 종료일 · 처리자를 보인다 — 종료 단추는 없다', () => {
    state.detail = { ...detail, stage: 'done', contractStep: 5, endOn: '2026-09-20', closedAt: '2026-09-20T05:00:00.000Z', closedByName: '김민선' };
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(view.getByRole('button', { name: '3 · 종료', pressed: true })).toBeTruthy();
    expect(view.getByText('종료일 2026-09-20 · 처리 김민선')).toBeTruthy();
    expect(view.queryByRole('button', { name: '컨설팅 종료' })).toBeNull();
  });

  /** 30-06 — 공개 범위는 한 줄 배너(칩 + 뜻 + 「공개 범위 바꾸기」). 개발 설명 문장은 없다 */
  it('공개 범위는 칩과 서버의 뜻 한 줄로 서고, 「공개 범위 바꾸기」를 눌러야 고르는 칸이 열린다 (30-06)', () => {
    state.detail = { ...detail, share: 'money_only', shareLabel: '수납만 공개', shareMeaning: '금액만 보이고 내용은 숨깁니다' };
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(view.getByText('금액만 보이고 내용은 숨깁니다')).toBeTruthy();
    expect(view.queryByText(/즉시 반영하며/)).toBeNull();
    const toggle = view.getByRole('button', { name: '공개 범위 바꾸기' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(view.queryByRole('button', { name: '전체 공개' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(view.getByRole('button', { name: '수납만 공개', pressed: true })).toBeTruthy();
    cleanup();
    // 고른 직후(낙관 갱신) 서버 뜻이 옛 범위의 것이면 뜻을 비워 둔다 — 칩과 뜻이 다른 범위를 말하지 않게
    state.detail = { ...detail, share: 'picked', shareLabel: '수납만 공개', shareMeaning: '금액만 보이고 내용은 숨깁니다' };
    const stale = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(stale.queryByText('금액만 보이고 내용은 숨깁니다')).toBeNull();
    // 바꿀 수 없는 건(계약 뒤)에는 단추가 없다
    cleanup();
    state.detail = { ...detail, capabilities: { ...capabilities, canChangeShare: false } };
    const locked = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(locked.queryByRole('button', { name: '공개 범위 바꾸기' })).toBeNull();
  });

  /** 30-07 — 스테퍼: 끝난 것 ✓ · 지금 것 번호 · 남은 것 회색 + 이름 + 서버의 한 줄 */
  it('계약 5단계는 스테퍼다 — 지금 단계가 표시되고 단계마다 서버의 한 줄이 선다 (30-07)', () => {
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    const stepper = view.getByRole('list', { name: '계약 3/5' });
    const steps = within(stepper).getAllByRole('listitem');
    expect(steps.map((li) => li.getAttribute('aria-current'))).toEqual([null, null, 'step', null, null]);
    expect(steps[0]!.textContent).toBe('✓계약서 준비초안을 올립니다');
    expect(steps[2]!.textContent).toBe('3전달학부모께 보냅니다');
    expect(steps[4]!.textContent).toBe('5수납계약금을 받습니다');
  });

  /** 30-09 · 30-11 · 30-13 · 30-14 — 원문 낱말과 파일 줄의 날짜 */
  it('파일 줄에 올린 날 · 「고친 것 알리기」 · 전달 전 「전달 먼저 해주세요」 · 바닥 「지우기」 (30-09 · 30-11 · 30-13 · 30-14)', () => {
    state.detail = {
      ...detail, contractStep: 2,
      contractFiles: [{ id: 1, name: '계약서 초안.docx', mime: 'application/pdf', bytes: 96_000, url: '/files/1', role: 'draft', uploadedByName: 'Grace', uploadedAt: '2026-08-20T10:00:00+09:00' }],
      feedback: [{ id: 3, body: '에세이 편수를 적어 주세요', createdByName: '김민선', createdAt: '2026-08-20T21:40:00+09:00', resolved: false, resolvedByName: null, resolvedAt: null }],
    };
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(view.getByText('94KB · 2026-08-20 · Grace')).toBeTruthy();
    expect(view.getByRole('button', { name: '고친 것 알리기' })).toBeTruthy();
    expect(view.queryByRole('button', { name: '수정 완료 알리기' })).toBeNull();
    expect(view.getByRole('button', { name: '전달 먼저 해주세요' }).hasAttribute('disabled')).toBe(true);
    expect(view.queryByRole('button', { name: /서명본 고르기/ })).toBeNull();
    expect(view.getByRole('button', { name: '지우기' })).toBeTruthy();
    expect(view.queryByRole('button', { name: '보관 삭제' })).toBeNull();
  });
  it('② 피드백 — 적는 칸은 「+ 의견」을 눌러야 열리고, 의견 카드는 호박 바탕 · 쓴 사람 강조색 · 「08-20 21:40」 시각 (30-10)', () => {
    state.detail = {
      ...detail,
      feedback: [{ id: 1, body: '에세이 편수와 수정 횟수를 명확히 적어주세요.', createdByName: '김민선', createdAt: '2026-08-20T21:40:00+09:00', resolved: false, resolvedAt: null, resolvedByName: null }],
    } as ConsultingDetail;
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    expect(view.queryByLabelText('계약 피드백')).toBeNull();
    const name = view.getByText('김민선');
    expect(name.className).toContain('text-amber');
    expect(view.getByText('08-20 21:40')).toBeTruthy();
    expect(name.closest('li')?.className).toContain('bg-amber/5');
    fireEvent.click(view.getByRole('button', { name: '+ 의견' }));
    expect(view.getByLabelText('계약 피드백')).toBeTruthy();
    expect(view.queryByRole('button', { name: '+ 의견' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '취소' }));
    expect(view.queryByLabelText('계약 피드백')).toBeNull();
  });
  it('계약 절 ①~⑤ 는 한 열로 쌓인 절 머리다 — 올린 계약서가 있으면 ① 옆에 「올림」, 한도 글은 다 찼을 때만 (30-08)', () => {
    state.detail = { ...detail, contractFiles: [{ id: 1, name: '초안.docx', mime: 'application/msword', bytes: 96256, url: '/files/1', role: 'draft', uploadedByName: 'Grace', uploadedAt: '2026-08-20T10:00:00+09:00' }] } as ConsultingDetail;
    const view = render(<ConsultingContractWorkflow consId={7} onClose={vi.fn()} onOpenAccounting={vi.fn()} />);
    const first = view.getByRole('region', { name: '① 계약서 준비' });
    expect(first.querySelector('header')?.textContent).toBe('① 계약서 준비올림');
    for (const t of ['③ 학부모께 전달', '④ 학부모 서명', '⑤ 수납']) expect(view.getByRole('region', { name: t })).toBeTruthy();
    expect(view.getByRole('region', { name: '③ 학부모께 전달' }).parentElement?.className).not.toContain('grid-cols-3');
  });
});
