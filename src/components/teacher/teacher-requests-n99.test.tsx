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
import type { TeacherGpaRequestOptions } from '@/api/types';
import { BookChangeRequestButton } from './BookChangeRequestButton';
import { GpaRequestButton } from './GpaRequestButton';

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

describe('「GPA 회차 요청」 (N-99)', () => {
  const options: TeacherGpaRequestOptions = {
    services: [{ key: 'quiz', name: 'Quiz 대비', point: 2 }, { key: 'essay', name: '에세이', point: 3 }],
    occurrences: [
      { serId: 70, onDate: '2026-09-28', startMin: 1200, endMin: 1240, title: 'GPA 관리', subKey: null, kindKey: 'gpa',
        students: [{ id: 4, name: '박하경' }, { id: 5, name: '강라율' }] },
    ],
  };

  it('창을 열 때만 읽고, 서버가 준 회차 · 그날 명단 · 서비스만 고르며 DTO 모양 그대로 보낸다', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) =>
      ({ data: url === '/teacher/gpa-request-options' ? options : { subs: [], kinds: [] } }) as never);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...created, reqType: 'gpa_request' } } as never);
    const view = wrap(<GpaRequestButton />);
    expect(get).not.toHaveBeenCalledWith('/teacher/gpa-request-options');
    fireEvent.click(view.getByRole('button', { name: 'GPA 회차 요청' }));
    const dialog = view.getByRole('dialog', { name: 'GPA 회차 요청' });
    await waitFor(() => expect(within(dialog).getByLabelText('회차')).toBeTruthy());
    expect(get).toHaveBeenCalledWith('/teacher/gpa-request-options');
    const student = within(dialog).getByLabelText('학생') as HTMLSelectElement;
    expect(student.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('회차'), { target: { value: '70|2026-09-28' } });
    expect(Array.from(student.options).map((o) => o.textContent)).toEqual(['선택', '박하경', '강라율']);
    fireEvent.change(student, { target: { value: '5' } });
    const send = within(dialog).getByRole('button', { name: '요청 올리기' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('서비스'), { target: { value: 'quiz' } });
    fireEvent.click(send);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/teacher/requests', {
      reqType: 'gpa_request', serId: 70, onDate: '2026-09-28', studentId: 5, svcKey: 'quiz',
    }));
  });

  it('고를 회차가 없으면 없다고 말하고 올리는 단추가 잠겨 있다', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) =>
      ({ data: url === '/teacher/gpa-request-options' ? { ...options, occurrences: [] } : { subs: [], kinds: [] } }) as never);
    const view = wrap(<GpaRequestButton />);
    fireEvent.click(view.getByRole('button', { name: 'GPA 회차 요청' }));
    const dialog = view.getByRole('dialog', { name: 'GPA 회차 요청' });
    await waitFor(() => expect(dialog.textContent).toContain('요청할 수 있는 GPA 회차가 없습니다'));
    expect((within(dialog).getByRole('button', { name: '요청 올리기' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
