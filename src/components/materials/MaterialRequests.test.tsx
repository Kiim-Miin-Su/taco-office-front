/** @file-guide
 * 목적: 일반 자료요청의 강사 등록·수신 확인과 관리자 처리 입력이 생성 계약을 그대로 보내는지 검증한다.
 * 책임/재사용: 공용 컴포넌트의 사용자 동작과 payload만 시험하고 서버 권한·제약은 Backend DB 회귀에 맡긴다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-08D2-MATERIAL-REQUEST-PERSISTENCE-2026-10-09.md
 */
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MaterialRequestItem } from '@/api/types';

const mocks = vi.hoisted(() => ({
  options: vi.fn(), mine: vi.fn(), create: vi.fn(), acknowledge: vi.fn(),
  all: vi.fn(), transition: vi.fn(), createAsync: vi.fn(), transitionAsync: vi.fn(),
}));

vi.mock('@/api/queries', () => ({
  useMaterialRequestOptions: () => mocks.options(),
  useMyMaterialRequests: () => mocks.mine(),
  useCreateMaterialRequest: () => mocks.create(),
  useAcknowledgeMaterialRequest: () => mocks.acknowledge(),
  useMaterialRequests: () => mocks.all(),
  useTransitionMaterialRequest: () => mocks.transition(),
}));

vi.mock('@/components/files/FileDownloadButton', () => ({
  FileDownloadButton: ({ label }: { label: string }) => <button type="button">{label} 열기</button>,
}));

import { MaterialRequestBoard, MaterialRequestDraft } from './MaterialRequests';

const query = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: vi.fn() }) as never;

const baseItem: MaterialRequestItem = {
  id: 31,
  kind: 'worksheet',
  kindLabel: '워크시트',
  studentId: 7,
  studentName: '김하늘',
  teacherId: 2,
  teacherName: '강사A',
  neededOn: '2026-10-20',
  body: 'Unit 4 복습용 문제와 정답지를 준비해 주세요.',
  state: 'received',
  stateLabel: '접수',
  version: 1,
  assignedTo: null,
  assignedToName: null,
  deliveredBy: null,
  deliveredByName: null,
  rejectReason: null,
  deliveredAt: null,
  rejectedAt: null,
  acknowledgedAt: null,
  createdAt: '2026-10-09T10:00:00+09:00',
  updatedAt: '2026-10-09T10:00:00+09:00',
  overdue: false,
  files: [],
  events: [{
    id: 1, action: 'created', actionLabel: '요청 접수', fromState: null, toState: 'received', reason: null,
    actorId: 2, actorName: '강사A', resultVersion: 1, at: '2026-10-09T10:00:00+09:00',
  }],
};

const counts = { received: 1, preparing: 0, delivered: 0, rejected: 0 };

beforeEach(() => {
  mocks.options.mockReturnValue(query({ students: [
    { id: 7, name: '김하늘', grade: 'G5', label: '김하늘 · G5' },
    { id: 9, name: '이도윤', grade: null, label: '이도윤 · Kinder' },
  ] }));
  mocks.mine.mockReturnValue(query({ items: [baseItem], counts }));
  mocks.all.mockReturnValue(query({ items: [baseItem], counts }));
  mocks.createAsync.mockResolvedValue({ item: baseItem, replayed: false });
  mocks.create.mockReturnValue({ mutateAsync: mocks.createAsync, isPending: false, isError: false });
  mocks.acknowledge.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
  mocks.transitionAsync.mockResolvedValue({ item: baseItem, replayed: false });
  mocks.transition.mockReturnValue({ mutate: vi.fn(), mutateAsync: mocks.transitionAsync, isPending: false, isError: false });
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it('강사는 전체 담당 학생과 네 종류를 선택해 생성 계약으로 요청한다', async () => {
  const view = render(<MaterialRequestDraft viewerId={2} />);
  expect([...view.getByLabelText('자료 종류 *').querySelectorAll('option')].map((option) => option.textContent)).toEqual([
    '선택', '교재 PDF', '워크시트', '시험지', '그 밖의 자료',
  ]);
  expect([...view.getByLabelText('학생 *').querySelectorAll('option')].map((option) => option.textContent)).toEqual([
    '선택', '김하늘 · G5', '이도윤 · Kinder',
  ]);

  fireEvent.change(view.getByLabelText('자료 종류 *'), { target: { value: 'worksheet' } });
  fireEvent.change(view.getByLabelText('학생 *'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('필요한 날 *'), { target: { value: '2026-10-20' } });
  fireEvent.change(view.getByLabelText('요청 내용 *'), { target: { value: ' Unit 4 복습 자료 ' } });
  fireEvent.click(view.getByRole('button', { name: '자료 요청' }));

  await waitFor(() => expect(mocks.createAsync).toHaveBeenCalledWith({
    kind: 'worksheet', studentId: 7, neededOn: '2026-10-20', body: 'Unit 4 복습 자료', files: [],
    requestKey: '11111111-1111-4111-8111-111111111111',
  }));
  expect(view.getByText('자료 요청을 접수했습니다.')).toBeTruthy();
});

it('전달된 요청은 실제 파일과 수신 확인 동작을 같은 요청에 표시한다', () => {
  const delivered: MaterialRequestItem = {
    ...baseItem,
    state: 'delivered', stateLabel: '전달 완료', version: 3,
    files: [{
      id: 77, kind: 'material-request', name: 'unit4.pdf', mime: 'application/pdf', bytes: 120,
      url: '/files/77', uploaderName: '관리자', uploadedAt: '2026-10-10T09:00:00+09:00',
      purpose: 'delivery', addedByName: '관리자',
    }],
  };
  const ack = vi.fn();
  mocks.mine.mockReturnValue(query({ items: [delivered], counts: { ...counts, received: 0, delivered: 1 } }));
  mocks.acknowledge.mockReturnValue({ mutate: ack, isPending: false, isError: false });
  const view = render(<MaterialRequestDraft viewerId={2} />);

  expect(view.getByRole('button', { name: '전달 · unit4.pdf 열기' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '수신 확인' }));
  expect(ack).toHaveBeenCalledWith(expect.objectContaining({
    id: 31, expectedVersion: 3, requestKey: '11111111-1111-4111-8111-111111111111',
  }), expect.objectContaining({ onSuccess: expect.any(Function) }));
});

it('관리자는 상태별 실제 건수를 보고 첫 준비 작업을 version과 함께 보낸다', () => {
  const transition = vi.fn();
  mocks.transition.mockReturnValue({ mutate: transition, mutateAsync: mocks.transitionAsync, isPending: false, isError: false });
  const view = render(<MaterialRequestBoard focusRequestId={31} />);
  expect(view.getByRole('button', { name: '전체 1' })).toBeTruthy();
  expect(view.getByRole('button', { name: '접수 1' })).toBeTruthy();

  fireEvent.click(view.getByRole('button', { name: '준비 시작' }));
  expect(transition).toHaveBeenCalledWith(expect.objectContaining({
    id: 31, action: 'preparing', expectedVersion: 1,
    requestKey: '11111111-1111-4111-8111-111111111111',
  }), expect.objectContaining({ onSuccess: expect.any(Function) }));
});

it('반려는 사유 두 글자 전까지 확정할 수 없고 입력 뒤 전이 계약을 보낸다', async () => {
  const view = render(<MaterialRequestBoard />);
  fireEvent.click(view.getByRole('button', { name: '반려' }));
  const editor = view.getByLabelText('반려 사유 *').closest('form')!;
  expect(within(editor).getByRole('button', { name: '반려 확정' })).toHaveProperty('disabled', true);
  fireEvent.change(view.getByLabelText('반려 사유 *'), { target: { value: '범위 확인 필요' } });
  fireEvent.click(within(editor).getByRole('button', { name: '반려 확정' }));
  await waitFor(() => expect(mocks.transitionAsync).toHaveBeenCalledWith(expect.objectContaining({
    id: 31, action: 'rejected', expectedVersion: 1, reason: '범위 확인 필요',
  })));
});
