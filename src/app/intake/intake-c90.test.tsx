/** @file-guide
 * 목적: intake-c90.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Lead, Ops } from '@/api/types';
import IntakePage from './page';
import { INTAKE_HEAD_FIXTURE } from './intake-head.fixture';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

/**
 * C90 — 유입 경로 칩 줄 · 카드의 「상담 오늘」 칩 · 「사후 관리 임박」 타일 · 「+ 신규 문의」 · 「다음 단계 →」 · 접촉 원장.
 * 낱말·수·판정은 전부 서버 응답이고 화면은 그리기만 한다 — 그래서 픽스처가 서버 모양 그대로다.
 */
const base: Lead = {
  id: 1, name: '노현우', school: '세종고', ownerName: '김범준', reason: null,
  stage: 'first', stopAt: null, ageDays: 3, createdAt: '2026-09-15', studentId: null, ownerId: 3,
  failFrom: null, revivalStage: null, revivalSource: null,
  source: 'kakao', sourceLabel: '카카오채널',
  nextStages: [{ key: 'wait2nd', label: '2차 대기' }, { key: 'second', label: '2차 상담' }, { key: 'hold', label: '보류' }],
  touches: [{ id: 11, kind: 'book', kindLabel: '상담 예약', note: '토 11:00 방문', nextOn: '2026-09-18', byId: 3, byName: '김범준', at: '2026-09-17T10:00:00+09:00' }],
  lastTouchAt: '2026-09-17T10:00:00+09:00', nextOn: '2026-09-18', nextLabel: '상담 오늘', nextTone: 'warning',
};
const leads: Lead[] = [
  base,
  { ...base, id: 2, name: '차서윤', source: 'phone', sourceLabel: '전화', touches: [], lastTouchAt: null, nextOn: null, nextLabel: null, nextTone: null },
  { ...base, id: 3, name: '옛건', source: null, sourceLabel: null, stage: 'hold', nextStages: [{ key: 'second', label: '2차 상담' }], touches: [], lastTouchAt: null, nextOn: null, nextLabel: null, nextTone: null },
  { ...base, id: 4, name: '등록학생', source: null, sourceLabel: null, stage: 'enrolled', nextStages: [], touches: [], lastTouchAt: null, nextOn: null, nextLabel: null, nextTone: null },
];
const response: Ops = {
  leads, complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: false,
  feedback: [], feedbackNeedsFix: 0, canComment: false, planDues: [], planOverdue: 0, planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  intakeHead: {
    ...INTAKE_HEAD_FIXTURE,
    funnel: INTAKE_HEAD_FIXTURE.funnel.map((f) => ({ ...f, count: f.key === 'first' ? 2 : f.key === 'hold' || f.key === 'enrolled' ? 1 : 0 })),
    sources: [
      ...INTAKE_HEAD_FIXTURE.sources.map((s) => ({ ...s, count: s.key === 'kakao' ? 1 : s.key === 'phone' ? 1 : 0 })),
      { key: 'none', label: '경로 없음', count: 2 },
    ],
    owners: [{ id: 3, name: '김범준', count: 4 }],
    followUpSoon: 1,
    alerts: [{ key: 'consultDue', label: '상담 오늘·지남 1', count: 1, amount: null, go: '/intake' }],
    funnelSince: '2026-09-18',
  },
};

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); push.mockReset(); });

async function setup() {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: url === '/ops' ? response : { staff: [{ id: 3, name: '김범준' }], students: [] } }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: '+ 신규 문의' })).toBeTruthy());
  return view;
}

describe('§23 상담 입구 (C90 · N-44 · N-45)', () => {
  it('유입 경로 칩은 서버 낱말·수 그대로(여섯 + 경로 없음) 서고, 누르면 그 경로의 카드만 남는다 — 담당 칩과 겹친다', async () => {
    const view = await setup();
    const chips = ['카카오채널 1', '전화 1', '블로그 0', '인스타그램 0', '소개 0', '워크인 0', '경로 없음 2'];
    for (const c of chips) expect(view.getByRole('button', { name: c })).toBeTruthy();
    expect(view.getByRole('button', { name: /^전체 4$/ })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '경로 없음 2' }));
    expect(view.queryByText('노현우')).toBeNull();
    expect(view.getByText('옛건')).toBeTruthy();
    expect(view.getByText('등록학생')).toBeTruthy();
    // 담당 칩과 겹친다 — 담당 없음이 없으니 김범준 4 를 누르면 그대로 둘
    fireEvent.click(view.getByRole('button', { name: '김범준 4' }));
    expect(view.getByText('옛건')).toBeTruthy();
    fireEvent.click(view.getAllByRole('button', { name: '전체' })[0]);
    expect(view.getByText('노현우')).toBeTruthy();
  });

  it('카드에는 유입 경로와 서버가 만든 「상담 오늘」 칩이 붙고, 「사후 관리 임박」 타일과 경고는 서버 수 그대로다 — 이 화면이 답인 경고는 이동하지 않는다', async () => {
    const view = await setup();
    expect(view.getByText('세종고 · 카카오채널')).toBeTruthy();
    expect(view.getByText('세종고 · 전화')).toBeTruthy();
    // 옛 건·등록 건은 경로가 없다 — 카드에 아무것도 안 붙는다
    expect(view.getAllByText('세종고')).toHaveLength(2);
    expect(view.getAllByText('상담 오늘').length).toBeGreaterThanOrEqual(1);
    expect(view.getByText('사후 관리 임박').previousSibling?.textContent).toBe('1');
    fireEvent.click(view.getByRole('button', { name: '상담 오늘·지남 1' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('카드를 고르면 「다음 단계 →」는 서버의 nextStages 만 보이고, 한 번 더 눌러야 PATCH 가 나가며, 등록 건에는 서지 않는다 (N-45)', async () => {
    const view = await setup();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { ...base, stage: 'wait2nd', nextStages: [{ key: 'second', label: '2차 상담' }, { key: 'hold', label: '보류' }] } } as never);
    fireEvent.click(view.getByText('노현우'));
    const select = view.getByLabelText('다음 단계') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['단계 선택', '2차 대기', '2차 상담', '보류']);
    const btn = view.getByRole('button', { name: '다음 단계 →' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(select, { target: { value: 'wait2nd' } });
    fireEvent.click(btn);
    expect(patch).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 이동' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/ops/leads/1/stage', { to: 'wait2nd' }));
    await waitFor(() => expect(view.getByText(/노현우 → 2차 대기 — 도달 기록에 남겼습니다/)).toBeTruthy());
    // 등록 건 — 갈 곳이 없으니 단추 자체가 없다
    fireEvent.click(view.getByText('등록학생'));
    expect(view.queryByLabelText('다음 단계')).toBeNull();
    expect(view.getByText(/등록 완료된 건입니다/)).toBeTruthy();
  });

  it('접촉 원장은 서버 줄 그대로(최근 것이 앞 · 누가 · 언제 · 어떻게 · 다음은 언제)이고 「+ 기록」은 어떻게·한 줄·날짜를 보낸다 (N-44 · A-03)', async () => {
    const view = await setup();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...base, nextLabel: '사후 관리 D-1', nextTone: 'info' } } as never);
    fireEvent.click(view.getByText('노현우'));
    const log = view.getByRole('region', { name: '접촉 원장' });
    expect(log.textContent).toContain('상담 예약');
    expect(log.textContent).toContain('토 11:00 방문');
    expect(log.textContent).toContain('→ 09/18');
    expect(log.textContent).toContain('김범준 · 09-17 10:00');
    fireEvent.click(within(log).getByRole('button', { name: '+ 기록' }));
    const kind = within(log).getByLabelText('어떻게') as HTMLSelectElement;
    expect([...kind.options].map((o) => o.textContent)).toEqual(['고르세요', '전화', '카카오톡', '문자', '방문', '상담 예약', '예약 불참', '메모']);
    const record = within(log).getByRole('button', { name: '기록' }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);
    fireEvent.change(kind, { target: { value: 'noshow' } });
    fireEvent.change(within(log).getByLabelText('한 줄'), { target: { value: ' 연락 없이 오지 않음 ' } });
    fireEvent.change(within(log).getByLabelText(/다음은 언제/), { target: { value: '2026-09-19' } });
    fireEvent.click(record);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/1/touches', { kind: 'noshow', note: '연락 없이 오지 않음', nextOn: '2026-09-19' }));
    await waitFor(() => expect(view.getByText('기록했습니다 — 사후 관리 D-1')).toBeTruthy());
  });

  it('「+ 신규 문의」는 이름·유입 경로가 있어야 접수가 서고, 단계 없이 이름·경로·담당·첫 접촉 한 줄만 보낸다 (A-01)', async () => {
    const view = await setup();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...base, id: 9, name: '민지수', sourceLabel: '카카오채널' } } as never);
    fireEvent.click(view.getByRole('button', { name: '+ 신규 문의' }));
    const dialog = await view.findByRole('dialog', { name: '신규 문의' });
    const submit = within(dialog).getByRole('button', { name: '접수' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // 「경로 없음」은 고를 수 없다 — 여섯뿐
    expect(within(dialog).getAllByRole('button', { pressed: false }).map((b) => b.textContent)).toEqual(['카카오채널', '전화', '블로그', '인스타그램', '소개', '워크인']);
    fireEvent.change(within(dialog).getByLabelText('이름'), { target: { value: ' 민지수 ' } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: '카카오채널' }));
    expect(submit.disabled).toBe(false);
    await waitFor(() => expect(within(dialog).getByRole('option', { name: '김범준' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText('담당'), { target: { value: '3' } });
    fireEvent.change(within(dialog).getByLabelText(/첫 접촉 한 줄/), { target: { value: 'SAT 여름 특강 문의' } });
    fireEvent.click(submit);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads', { name: '민지수', source: 'kakao', ownerId: 3, note: 'SAT 여름 특강 문의' }));
    await waitFor(() => expect(view.getByText('민지수 신규 문의 접수 — 카카오채널 · 1차 상담 칸')).toBeTruthy());
  });
});
