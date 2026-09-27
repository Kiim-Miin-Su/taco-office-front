/** @file-guide
 * 목적: intake-w5.test.tsx (test) · §23 1:1 대조 wave 5 — 등록 카드의 사후 관리 줄(청구서 · 교재 · 안내 · 23-18).
 * 책임/재사용: 실제 IntakePage·useOps 캐시를 쓰고 네트워크만 대역으로 바꾼다. 낱말·판정은 서버 픽스처 그대로다(화면이 짓지 않는다).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Lead, Ops } from '@/api/types';
import { useSession } from '@/store/useSession';
import IntakePage from './page';
import { INTAKE_HEAD_FIXTURE } from './intake-head.fixture';
import { OPS_HEAD_FIXTURE } from '@/app/ops/ops-head.fixture';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const enrolled: Lead = {
  id: 11, name: '박시온', school: null, ownerName: '김민선', reason: null, grade: 'G8',
  stage: 'enrolled', stopAt: null, ageDays: 9, createdAt: '2026-09-16', studentId: 21, ownerId: 1,
  source: 'kakao', sourceLabel: '카카오채널', nextStages: [], touches: [], nextOn: null, nextLabel: null, nextTone: null,
  // 서버가 담당의 사후 관리 할 일(해피콜 · 첫 월간 · W11 N-86)과 그 학생의 청구서 · 교재 · 안내 원장을 읽어 만든 줄 — 화면은 그대로 그린다
  aftercare: [
    { key: 'happycall', label: '해피콜', value: '완료 08-15', done: true },
    { key: 'monthly', label: '월간', value: '완료', done: true },
    { key: 'invoice', label: '청구서', value: '없음', done: false },
    { key: 'book', label: '교재', value: '1권', done: true },
    { key: 'guide', label: '안내', value: '보냄', done: true },
  ],
  // 해피콜 · 첫 월간을 다 마친 등록 카드의 띠 — 날이 없다(원문 §23 박시온 카드 「정기 관리 중」)
  stageDue: { task: '정기 관리 중', dueOn: null, dueLabel: null, tone: 'neutral' },
};
const noStudent: Lead = { ...enrolled, id: 12, name: '홍채원', studentId: null, aftercare: null, stageDue: null };

const response: Ops = {
  leads: [enrolled, noStudent],
  complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: false,
  feedback: [], feedbackNeedsFix: 0, canComment: false, planDues: [], planOverdue: 0, planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: INTAKE_HEAD_FIXTURE,
};

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); useSession.setState({ me: null }); });

async function setup() {
  useSession.setState({ me: null, ready: true });
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: url === '/ops' ? response : { staff: [], students: [], lib: [] } }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText('박시온')).toBeTruthy());
  return view;
}

describe('§23 등록 카드의 사후 관리 줄 (23-18)', () => {
  it('원본 차례(해피콜 · 월간 · 청구서 · 교재 · 안내)로 서버 낱말 그대로 선다 — 됨은 초록 · 아직은 회색', async () => {
    const view = await setup();
    const rows = within(view.getByRole('list', { name: '박시온 사후 관리' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['해피콜완료 08-15', '월간완료', '청구서없음', '교재1권', '안내보냄']);
    expect(rows[2]!.className).toContain('bg-inset');
    expect(rows[0]!.className).toContain('bg-green');
  });

  it('해피콜 · 첫 월간을 다 마친 카드의 띠는 「정기 관리 중」 — 날이 없으면 날 칸을 비운다 (N-86)', async () => {
    const view = await setup();
    const band = view.getByText('정기 관리 중');
    expect(band.parentElement?.textContent).toBe('정기 관리 중');
  });

  it('학생이 안 붙은 등록 건(서버 null)은 줄이 없다 — 지어내지 않는다', async () => {
    const view = await setup();
    expect(view.queryByRole('list', { name: '홍채원 사후 관리' })).toBeNull();
  });
});
