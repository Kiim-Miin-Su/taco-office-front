/** @file-guide
 * 목적: BO-Q13 권고안의 별도 안건·잠금·version 충돌·명시적 속기록 가져오기 회귀를 검증한다.
 * 책임/재사용: 실제 MeetingAgendaPanel과 생성 타입을 사용하고 HTTP 함수만 props로 대체한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import type { MeetingAgenda } from '@/api/types';
import { MeetingAgendaPanel } from './MeetingAgendaPanel';

const agenda: MeetingAgenda = {
  meetingId: 4, content: '가격 정책 결정', version: 3,
  createdAt: '2026-10-07T09:00:00+09:00', createdById: 2, createdByName: '김민수',
  updatedAt: '2026-10-07T10:00:00+09:00', updatedById: 3, updatedByName: '김민선',
  locked: false, lockedAt: null, canEdit: true, editBlockedReason: null, canImportToMinutes: true,
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('제품 저장 경로가 연결되기 전에는 생성 계약 내용을 읽되 저장 성공을 만들지 않는다', () => {
  const view = render(<MeetingAgendaPanel agenda={agenda} canPrepare onUseMinutesDraft={() => {}} />);
  expect((view.getByLabelText('사전 안건 내용') as HTMLTextAreaElement).readOnly).toBe(true);
  expect((view.getByRole('button', { name: '사전 안건 저장' }) as HTMLButtonElement).disabled).toBe(true);
  expect(view.getByText(/저장 기능을 연결하는 중/)).toBeTruthy();
  expect(view.queryByText('사전 안건을 저장했습니다.')).toBeNull();
});

it('현재 version과 본문을 보내고 반환된 작성자·시각·version으로 기준을 갱신한다', async () => {
  const saveAgenda = vi.fn(async (body) => ({ ...agenda, ...body, expectedVersion: undefined, version: 4,
    updatedAt: '2026-10-07T11:00:00+09:00', updatedById: 4, updatedByName: '대표' }) as MeetingAgenda);
  const view = render(<MeetingAgendaPanel agenda={agenda} canPrepare saveAgenda={saveAgenda} onUseMinutesDraft={() => {}} />);
  fireEvent.change(view.getByLabelText('사전 안건 내용'), { target: { value: '가격 정책과 일정 결정' } });
  fireEvent.click(view.getByRole('button', { name: '사전 안건 저장' }));
  await waitFor(() => expect(saveAgenda).toHaveBeenCalledWith({ content: '가격 정책과 일정 결정', expectedVersion: 3 }));
  expect((await view.findByRole('status')).textContent).toBe('사전 안건을 저장했습니다.');
  expect(view.getByText(/마지막 수정 2026-10-07 11:00 · 대표/)).toBeTruthy();
});

it('회의가 시작되어 잠긴 안건은 서버 사유를 보이고 수정할 수 없다', () => {
  const view = render(<MeetingAgendaPanel agenda={{ ...agenda, locked: true, canEdit: false,
    editBlockedReason: '이미 시작한 회의의 사전 안건은 고칠 수 없습니다' }} canPrepare saveAgenda={vi.fn()} onUseMinutesDraft={() => {}} />);
  expect(view.getByText('이미 시작한 회의의 사전 안건은 고칠 수 없습니다')).toBeTruthy();
  expect((view.getByLabelText('사전 안건 내용') as HTMLTextAreaElement).readOnly).toBe(true);
  expect(view.queryByRole('button', { name: '사전 안건 저장' })).toBeNull();
});

it('stale 409는 초안을 덮지 않고 최신 안건 재조회 행동을 제공한다', async () => {
  const saveAgenda = vi.fn(async () => { throw new ApiError('MEETING_AGENDA_VERSION_CONFLICT', '다른 사람이 먼저 고쳤습니다', 409); });
  const reloadAgenda = vi.fn(async () => ({ ...agenda, content: '서버 최신 안건', version: 4 }));
  const view = render(<MeetingAgendaPanel agenda={agenda} canPrepare saveAgenda={saveAgenda}
    reloadAgenda={reloadAgenda} onUseMinutesDraft={() => {}} />);
  fireEvent.change(view.getByLabelText('사전 안건 내용'), { target: { value: '내가 쓰던 초안' } });
  fireEvent.click(view.getByRole('button', { name: '사전 안건 저장' }));
  expect(await view.findByText(/최신 내용을 다시 불러온 뒤/)).toBeTruthy();
  expect((view.getByLabelText('사전 안건 내용') as HTMLTextAreaElement).value).toBe('내가 쓰던 초안');
  fireEvent.click(view.getByRole('button', { name: '최신 안건 다시 불러오기' }));
  await waitFor(() => expect(reloadAgenda).toHaveBeenCalledTimes(1));
  expect((view.getByLabelText('사전 안건 내용') as HTMLTextAreaElement).value).toBe('서버 최신 안건');
});

it('안건 가져오기는 현재 version을 확인하고 미저장 속기록 초안만 넘긴다', async () => {
  const useDraft = vi.fn();
  const importAgenda = vi.fn(async () => ({ meetingId: 4, agendaVersion: 3, minutesDraft: '[사전 안건]\n가격 정책 결정',
    sourceUpdatedAt: agenda.updatedAt, sourceUpdatedById: agenda.updatedById, sourceUpdatedByName: agenda.updatedByName, saved: false as const }));
  const view = render(<MeetingAgendaPanel agenda={agenda} canPrepare saveAgenda={vi.fn()}
    importAgenda={importAgenda} onUseMinutesDraft={useDraft} />);
  fireEvent.click(view.getByRole('button', { name: '안건 가져오기' }));
  await waitFor(() => expect(importAgenda).toHaveBeenCalledWith({ expectedVersion: 3 }));
  expect(useDraft).toHaveBeenCalledWith('[사전 안건]\n가격 정책 결정');
  expect(view.getByRole('status').textContent).toContain('확인한 뒤 저장해 주세요.');
});
