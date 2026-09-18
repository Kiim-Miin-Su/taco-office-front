/** @file-guide
 * 목적: §44 학생 레일 선택이 서버가 준 latestGuide·교재·진단 projection을 그대로 전환하는지 검증한다.
 * 책임/재사용: 실제 GuideStudents와 QueryClient를 사용하며 최신 안내 선정 규칙을 테스트에서 다시 만들지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Guide, GuideStudent, GuideStudents as GuideStudentsDto, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { GuideStudents } from './GuideStudents';

const me: Me = {
  id: 4,
  name: '대표',
  role: 'ceo',
  roleLabel: '대표',
  title: null,
  canAdminPage: true,
  canCrudAll: true,
  canSeeProfit: true,
  canCrudAttendance: true,
  canMoney: true,
  canWage: true,
  canApprove: true,
  canHide: true,
  canGpaPack: true,
};

function student(studentId: number, name: string): GuideStudent {
  const latestGuide: Guide = {
    id: studentId,
    serId: 10 + studentId,
    studentId,
    teacherId: 3,
    reason: 'new',
    state: 'ready',
    pending: true,
    studentName: name,
    teacherName: '강사1',
    serTitle: `${name} 수업`,
    body: `${name} 서버 최신 안내`,
    dueOn: null,
    eventOn: '2026-09-15',
    sourceOccurrenceId: 90 + studentId,
    createdAt: '2026-09-14T10:00:00+09:00',
    sentAt: null,
    acknowledgedAt: null,
    overdueDays: 0, siblingCount: 0,
  };
  return {
    studentId,
    studentName: name,
    grade: 'G7',
    guidance: '엄격 + 관리',
    lang: 'mix',
    guideCount: studentId,
    latestGuide,
    books: [
      {
        issueId: studentId,
        libId: 20,
        versId: null,
        code: `BOOK-${studentId}`,
        title: `${name} 교재`,
        edition: '2026',
        seTe: 'SE',
        subKey: 'eng',
      },
    ],
    diagnostic: {
      id: studentId,
      levelSummary: `${name} 수준`,
      strengths: '리딩',
      weaknesses: '라이팅',
      curriculum: '주 2회',
      createdAt: '2026-09-13T10:00:00+09:00',
    },
  };
}

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  vi.restoreAllMocks();
});

it('학생을 고르면 그 학생의 서버 최신 안내·진단·교재로 함께 전환한다', async () => {
  const response: GuideStudentsDto = { items: [student(1, '강라율'), student(2, '고은설')] };
  vi.spyOn(api, 'get').mockResolvedValue({ data: response });
  useSession.setState({ me, ready: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <GuideStudents />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(view.getByText('강라율 서버 최신 안내')).toBeTruthy());
  fireEvent.click(view.getByRole('button', { name: /고은설.*안내 2건/ }));
  expect(view.getByText('고은설 서버 최신 안내')).toBeTruthy();
  expect(view.getByText('고은설 수준')).toBeTruthy();
  expect(view.getByText('고은설 교재')).toBeTruthy();
});
