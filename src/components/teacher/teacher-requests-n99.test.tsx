/** @file-guide
 * 목적: teacher-requests-n99.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { BookChangeRequestButton } from './BookChangeRequestButton';

/**
 * N-99 — 강사가 올리는 두 요청. 눌리는지 · 고를 수 있는 것은 서버가 준 것만이고(플래그 · 목록),
 * 나가는 본문은 `POST /teacher/requests` 의 DTO 모양 그대로다.
 */
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); });

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
const created = { id: 1, reqType: 'book_change', label: '교재 변경', asked: null, state: 'pending', createdOn: '2026-09-26', rejectReason: null };

describe('교재 행 「변경 요청」 (N-99)', () => {
  const book = { issueId: 31, title: 'AP World History Unit 5 · 요약본', changePending: false, changeRequestable: true };

  it('처리 중인 요청이 있으면 단추 대신 「변경 요청 중」이다', () => {
    const view = wrap(<BookChangeRequestButton studentId={4} studentName="고은성" book={{ ...book, changePending: true, changeRequestable: false }} />);
    expect(view.getByText('변경 요청 중')).toBeTruthy();
    expect(view.queryByRole('button', { name: '변경 요청' })).toBeNull();
  });

  it('서버가 요청할 수 없다고 하면 단추가 눌리지 않는다', () => {
    const view = wrap(<BookChangeRequestButton studentId={4} studentName="고은성" book={{ ...book, changeRequestable: false }} />);
    expect((view.getByRole('button', { name: '변경 요청' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('사유를 적어야 올릴 수 있고 학생 · 교재 · 사유가 DTO 모양 그대로 나간다', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: created } as never);
    const view = wrap(<BookChangeRequestButton studentId={4} studentName="고은성" book={book} />);
    fireEvent.click(view.getByRole('button', { name: '변경 요청' }));
    const dialog = view.getByRole('dialog', { name: '교재 변경 요청' });
    expect(dialog.textContent).toContain('고은성');
    expect(dialog.textContent).toContain('AP World History Unit 5 · 요약본');
    const send = within(dialog).getByRole('button', { name: '요청 올리기' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('사유'), { target: { value: '  Unit 6 로 넘어갑니다 ' } });
    fireEvent.click(send);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/teacher/requests', {
      reqType: 'book_change', studentId: 4, issueId: 31, reason: 'Unit 6 로 넘어갑니다',
    }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  });

  it('서버가 거절하면 그 문장을 창 안에 그대로 띄운다', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 409, data: { code: 'REQ_PENDING', message: '이 교재에 올린 변경 요청이 처리 중입니다' } } });
    const view = wrap(<BookChangeRequestButton studentId={4} studentName="고은성" book={book} />);
    fireEvent.click(view.getByRole('button', { name: '변경 요청' }));
    const dialog = view.getByRole('dialog', { name: '교재 변경 요청' });
    fireEvent.change(within(dialog).getByLabelText('사유'), { target: { value: '진도' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '요청 올리기' }));
    await waitFor(() => expect(within(dialog).getByText('이 교재에 올린 변경 요청이 처리 중입니다')).toBeTruthy());
  });
});
