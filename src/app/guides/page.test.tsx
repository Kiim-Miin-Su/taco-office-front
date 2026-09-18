/** @file-guide
 * 목적: §43 안내 할 일의 서버 집계 단일 진실원과 QueryState 로딩·오류 회귀를 검증한다.
 * 책임/재사용: 실제 GuidesPage와 QueryClient를 사용하며 제품 집계 규칙을 테스트에서 다시 계산하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Guide, Guides, Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import GuidesPage from './page';

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

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

const guide = (id: number, state: Guide['state'], pending: boolean): Guide => ({
  id,
  serId: 10,
  studentId: id,
  teacherId: 3,
  reason: 'new',
  state,
  pending,
  studentName: `학생${id}`,
  teacherName: '강사',
  serTitle: 'MAP Reading',
  body: null,
  dueOn: '2026-09-20',
  eventOn: '2026-09-20',
  sourceOccurrenceId: 99 + id,
  createdAt: '2026-09-01T10:00:00+09:00',
  sentAt: null,
  acknowledgedAt: null,
  overdueDays: 0, siblingCount: 0,
});

const response: Guides = {
  guides: [guide(1, 'draft', false), guide(2, 'sent', true)],
  perLesson: [
    {
      id: 501,
      sourceOccurrenceId: 501,
      serId: 50,
      onDate: '2026-09-14',
      startMin: 600,
      endMin: 660,
      teacherId: 3,
      teacherName: '강사',
      kindName: 'MAP Reading',
      zaccId: null,
      zaccLabel: null,
      zoomAssigned: false,
      notices: [
        { id: null, studentId: 1, studentName: '학생1', channel: null, body: null, sentAt: null },
      ],
      parentDeliveryRecorded: false,
      teacherDeliveryRecorded: false, canSendTeacher: false, sendBlockedReason: null,
      channel: 'app',
      studentName: '학생1',
      serTitle: 'MAP Reading',
      body: '',
      sentAt: null,
    },
  ],
  todoCount: 17,
  scopedTeacherId: null,
  stats: {
    monitoring: 3,
    overdue: 1,
    drafting: 0,
    sendPending: 1,
    teacherUnconfirmed: 1,
    repeatedTeacherChange: 0,
  },
  deliveryCapabilities: {
    parentExternal: false,
    teacherExternal: false,
    reason: '외부 발송 미연결',
  },
};

const clients: QueryClient[] = [];

function setup() {
  useSession.setState({ me, ready: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <GuidesPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  vi.restoreAllMocks();
});

describe('안내 할 일 — GET /guides 서버 projection이 단일 진실원', () => {
  it('상태 배열을 다시 세지 않고 서버의 여섯 집계와 탭 배지를 표시한다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: response });
    const view = setup();
    await waitFor(() => expect(view.getAllByText('학생1').length).toBeGreaterThan(0));

    const stat = (label: string) => view.getAllByText(label)[0]?.parentElement?.textContent ?? '';
    expect(stat('감시 중')).toContain('3');
    expect(stat('마감 초과')).toContain('1');
    expect(stat('작성 중')).toContain('0');
    expect(stat('발송 대기')).toContain('1');
    expect(stat('강사 미확인')).toContain('1');
    expect(stat('반복 교체')).toContain('0');
    expect(view.getByRole('tab', { name: /할 일/ }).parentElement?.textContent).toContain('17');
    expect(view.getByText('계정 배정 필요')).toBeTruthy();
    expect(view.getByRole('button', { name: '학부모 안내' })).toHaveProperty('disabled', true);
    expect(view.getByRole('button', { name: '강사 안내' })).toHaveProperty('disabled', true);
  });

  it('응답을 기다리는 동안 공용 로딩 상태를 표시한다', () => {
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    const view = setup();
    expect(view.getByRole('status', { name: '불러오는 중' })).toBeTruthy();
  });

  it('조회 실패를 빈 목록으로 위장하지 않고 공용 오류와 재시도를 표시한다', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('network'));
    const view = setup();
    await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
    expect(view.getByText('불러오지 못했습니다')).toBeTruthy();
    expect(view.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });
});
