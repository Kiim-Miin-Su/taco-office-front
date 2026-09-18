/** @file-guide
 * 목적: §45 누락 안내 초안의 생성 계약, 성공 후 편집 전이, 범위별 낙관 캐시 격리를 검증한다.
 * 책임/재사용: 실제 GuideHistory와 TanStack Query 캐시를 사용하고 서버의 누락 판정을 테스트에서 재구현하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { qk, sessionQueryKey } from '@/api/queries';
import type { Guide, GuideHistory as GuideHistoryDto, Me } from '@/api/types';
import { todayKst } from '@/lib/calendar';
import { useSession } from '@/store/useSession';
import { GuideHistory } from './GuideHistory';

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

const guide: Guide = {
  id: 12,
  serId: 10,
  studentId: 7,
  teacherId: 3,
  reason: 'new',
  state: 'draft',
  pending: true,
  studentName: '학생1',
  teacherName: '강사1',
  serTitle: 'MAP Reading',
  body: null,
  dueOn: '2026-09-15',
  eventOn: '2026-09-15',
  sourceOccurrenceId: 99,
  createdAt: '2026-09-14T10:00:00+09:00',
  sentAt: null,
  acknowledgedAt: null,
  overdueDays: 0, siblingCount: 0,
};

function history(anchor: string, sourceOccurrenceId = 99): GuideHistoryDto {
  return {
    span: 'month',
    anchor,
    from: `${anchor.slice(0, 7)}-01`,
    to: `${anchor.slice(0, 7)}-30`,
    missing: [
      {
        sourceOccurrenceId,
        eventOn: '2026-09-15',
        serId: 10,
        studentId: 7,
        studentName: '학생1',
        teacherId: 3,
        teacherName: '강사1',
        serTitle: 'MAP Reading',
        reason: 'new',
      },
    ],
    days: [],
    counts: { created: 0, sent: 0, missing: 1 },
  };
}

const clients: QueryClient[] = [];

function setup() {
  const today = todayKst();
  const otherAnchor = `${today.slice(0, 4)}-${today.slice(5, 7) === '01' ? '02' : '01'}-01`;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(sessionQueryKey(qk.guideHistory({ span: 'month', anchor: today }), me.id), history(today));
  client.setQueryData(
    sessionQueryKey(qk.guideHistory({ span: 'month', anchor: otherAnchor }), me.id),
    history(otherAnchor, 222),
  );
  clients.push(client);
  useSession.setState({ me, ready: true });
  const view = render(
    <QueryClientProvider client={client}>
      <GuideHistory />
    </QueryClientProvider>,
  );
  return { client, view, otherAnchor };
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSession.setState({ me: null, ready: false });
  vi.restoreAllMocks();
});

it('누락 카드가 투영 회차와 학생만 보내고 성공 즉시 GuideWriter를 연다', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: guide });
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url === '/guides/templates' ? [] : history(todayKst()),
  }));
  const { view } = setup();

  fireEvent.click(view.getByRole('button', { name: '누락 안내 초안 만들기' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/guides/drafts', {
      sourceOccurrenceId: 99,
      studentId: 7,
    }),
  );
  await waitFor(() => expect(view.getByText('안내 작성 — 학생1')).toBeTruthy());
});

it('낙관 제거는 후보가 실제 들어 있는 기간 캐시만 바꾼다', async () => {
  vi.spyOn(api, 'post').mockImplementation(() => new Promise(() => undefined));
  const { client, view, otherAnchor } = setup();

  fireEvent.click(view.getByRole('button', { name: '누락 안내 초안 만들기' }));
  await waitFor(() => expect(view.queryByRole('button', { name: '누락 안내 초안 만들기' })).toBeNull());

  const untouched = client.getQueryData<GuideHistoryDto>(
    sessionQueryKey(qk.guideHistory({ span: 'month', anchor: otherAnchor }), me.id),
  );
  expect(untouched?.missing).toHaveLength(1);
  expect(untouched?.counts.missing).toBe(1);
});
