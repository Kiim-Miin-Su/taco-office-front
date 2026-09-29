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
  canSend: false, canAck: false, sendBlockedReason: null, acknowledgedAfterSeconds: null, kindLabel: '포괄 안내',
  previousTeacherId: null, previousTeacherName: null,
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
  overdueDays: 0, siblingCount: 0, deadline: null,
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
        overdueDays: 0,
        deadline: null,
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

  fireEvent.click(view.getByRole('button', { name: /누락 안내 초안 만들기/ }));
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

  fireEvent.click(view.getByRole('button', { name: /누락 안내 초안 만들기/ }));
  await waitFor(() => expect(view.queryByRole('button', { name: /누락 안내 초안 만들기/ })).toBeNull());

  const untouched = client.getQueryData<GuideHistoryDto>(
    sessionQueryKey(qk.guideHistory({ span: 'month', anchor: otherAnchor }), me.id),
  );
  expect(untouched?.missing).toHaveLength(1);
  expect(untouched?.counts.missing).toBe(1);
});

/**
 * g4 §45-2 · §45-3 · §45-4 — 안 한 것 카드는 **카드 전체가 단추**(누르면 초안 → 작성 창),
 * 요약 칩 셋(만듦 · 보냄 · 안 한 것)은 기간 이동 줄 **같은 줄 오른쪽**, 날짜 머리에 사건 합계 칩.
 * N-90(W11) — 줄 하나 = 사건 하나(작성 · 발송 · 확인) · 칩은 사건 뒤 상태 · 시각은 사건 시각 · 합계는 서버 tally 그대로.
 */
it('안 한 것 카드 전체가 단추이고, 요약 칩은 기간 줄에, 날짜 머리에 사건 합계가 선다 (§45 · N-90)', async () => {
  const today = todayKst();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const sentGuide = { ...guide, id: 14, state: 'sent' as const, pending: false };
  const data: GuideHistoryDto = {
    ...history(today),
    days: [{
      date: '2026-09-15',
      events: [
        { id: 903, action: 'guide_send', label: '안내 발송', stateAfter: 'sent', at: '2026-09-15T16:40:00+09:00', time: '16:40', byId: 4, byName: '대표', guide: sentGuide },
        { id: 902, action: 'guide_write', label: '안내 작성', stateAfter: 'ready', at: '2026-09-15T11:00:00+09:00', time: '11:00', byId: 4, byName: '대표', guide: { ...guide, id: 13, state: 'ready' } },
        { id: 901, action: 'guide_write', label: '안내 작성', stateAfter: 'ready', at: '2026-09-15T09:10:00+09:00', time: '09:10', byId: 4, byName: '대표', guide: sentGuide },
      ],
      tally: [
        { action: 'guide_write', stateAfter: 'ready', label: '안내 작성', count: 2 },
        { action: 'guide_send', stateAfter: 'sent', label: '안내 발송', count: 1 },
      ],
    }],
    counts: { created: 2, sent: 1, missing: 1 },
  };
  client.setQueryData(sessionQueryKey(qk.guideHistory({ span: 'month', anchor: today }), me.id), data);
  clients.push(client);
  useSession.setState({ me, ready: true });
  const view = render(<QueryClientProvider client={client}><GuideHistory /></QueryClientProvider>);
  const card = view.getByRole('button', { name: /학생1.*누락 안내 초안 만들기/ });
  expect(card.textContent).toContain('MAP Reading');
  const bar = view.getByTestId('guide-history-bar');
  expect(bar.textContent).toContain('2건 만듦');
  expect(bar.textContent).toContain('1건 보냄');
  expect(bar.textContent).toContain('안 한 것 1');
  const head = view.getByText('26년 9월 15일 화요일').closest('summary') as HTMLElement;
  expect(head.textContent).toContain('3건');
  expect(head.textContent).toContain('발송 대기 2');
  expect(head.textContent).toContain('발송 완료 1');
  // 같은 안내의 작성 · 발송이 각자 한 줄이다 — 시각은 그 사건의 시각(원문 §45 줄 끝 「11:00」 · 「16:40」)
  const rows = view.getAllByRole('listitem').filter((row) => row.getAttribute('aria-label')?.includes('학생1'));
  expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
    '안내 발송 · 학생1 · 16:40', '안내 작성 · 학생1 · 11:00', '안내 작성 · 학생1 · 09:10',
  ]);
  expect(rows[0].textContent).toContain('발송 완료');
  expect(rows[1].textContent).toContain('발송 대기');
  // 원문 §45 줄 — 상태 색 왼쪽 막대(발송 완료 파랑 · 발송 대기 주황) · 사유 칩 없음(W11 재대조)
  expect(rows[0].className).toContain('border-l-blue');
  expect(rows[1].className).toContain('border-l-amber');
  expect(rows[1].textContent).not.toContain('첫 수업');
});

it('이력 줄의 강사 칸은 강사 교체 안내에서 「이전 강사 → 지금 강사」다 — F-62 「확인 위치 수업 안내 → 이력」 (TEACHER-LINEAGE)', async () => {
  const today = todayKst();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const swapped: Guide = { ...guide, id: 21, reason: 'teacher_change', kindLabel: '간이 안내', state: 'read', pending: false, teacherName: '강사B', previousTeacherId: 7, previousTeacherName: '강사A' };
  const data: GuideHistoryDto = {
    ...history(today),
    days: [{
      date: '2026-09-15',
      events: [
        { id: 911, action: 'guide_ack', label: '강사 확인', stateAfter: 'read', at: '2026-09-15T17:00:00+09:00', time: '17:00', byId: 9, byName: '강사B', guide: swapped },
        { id: 910, action: 'guide_send', label: '안내 발송', stateAfter: 'sent', at: '2026-09-15T16:40:00+09:00', time: '16:40', byId: 4, byName: '대표', guide: { ...guide, id: 22, state: 'sent', pending: false } },
      ],
      tally: [
        { action: 'guide_ack', stateAfter: 'read', label: '강사 확인', count: 1 },
        { action: 'guide_send', stateAfter: 'sent', label: '안내 발송', count: 1 },
      ],
    }],
    counts: { created: 0, sent: 1, missing: 1 },
  };
  client.setQueryData(sessionQueryKey(qk.guideHistory({ span: 'month', anchor: today }), me.id), data);
  clients.push(client);
  useSession.setState({ me, ready: true });
  const view = render(<QueryClientProvider client={client}><GuideHistory /></QueryClientProvider>);
  const rows = view.getAllByRole('listitem').filter((row) => row.getAttribute('aria-label')?.includes('학생1'));
  expect(rows[0].getAttribute('aria-label')).toBe('강사 확인 · 학생1 · 17:00');
  expect(rows[0].textContent).toContain('강사A → 강사B');
  // 첫 수업 안내의 줄은 지금 강사만 — 화살표가 없다
  expect(rows[1].textContent).toContain('강사1');
  expect(rows[1].textContent).not.toContain('→');
});
