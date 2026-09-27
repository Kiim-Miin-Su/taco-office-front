/** @file-guide
 * 목적: intake-w3.test.tsx (test) · §23·§24 1:1 대조 wave 3 — 머리 7탭 · 카드 배지·학년·기한 띠 · 실패 카드 · 사유 막대 · 바로 수업 등록.
 * 책임/재사용: 실제 IntakePage·useOps 캐시를 쓰고 네트워크만 대역으로 바꾼다. 낱말·날짜 셈은 서버 픽스처 그대로다(화면이 짓지 않는다).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Lead, Me, Ops } from '@/api/types';
import { useSession } from '@/store/useSession';
import IntakePage from './page';
import { INTAKE_HEAD_FIXTURE } from './intake-head.fixture';
import { OPS_HEAD_FIXTURE } from '@/app/ops/ops-head.fixture';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const base: Lead = {
  id: 1, name: '백승우', school: '압구정중', ownerName: 'Grace', reason: null, grade: 'G8',
  stage: 'first', stopAt: null, ageDays: 1, createdAt: '2026-09-24', studentId: null, ownerId: 3,
  source: 'referral', sourceLabel: '소개', nextStages: [], touches: [], nextOn: null, nextLabel: null, nextTone: null,
  stageDue: { task: '2차 일정 + 진단고사 잡기', dueOn: '2026-09-25', dueLabel: '오늘', tone: 'warning' },
};
const failedLead: Lead = {
  ...base, id: 2, name: '신유나', school: '역삼중', stage: 'failed', stopAt: 'after_first', failFrom: 'hold',
  source: 'instagram', sourceLabel: '인스타그램', stageDue: null,
  reason: '비용 · 타 학원 등록', reasonKind: 'other_academy', reasonKindLabel: '타 학원 등록', failedAt: '2026-08-18',
  recontact: { done: true, label: '재연락 완료', tone: 'info', on: '2026-09-18', dueLabel: 'D-28' },
  touches: [{ id: 5, kind: 'call', kindLabel: '전화', note: '9월 중간고사 끝나고 다시', nextOn: '2026-09-18', byId: 3, byName: 'Grace', at: '2026-08-25T11:20:00+09:00' }],
  nextOn: '2026-09-18',
};
const legacyFailed: Lead = { ...base, id: 3, name: '장서우', grade: null, stage: 'failed', stopAt: null, stageDue: null, source: null, sourceLabel: null };
const overdue: Lead = { ...base, id: 4, name: '정하윤', stage: 'hold', stageDue: { task: '배치안 수락 여부 확인', dueOn: '2026-09-24', dueLabel: '1일 지남', tone: 'danger' }, nextOn: '2026-09-20', nextLabel: '사후 관리 5일 밀림', nextTone: 'danger' };

const response: Ops = {
  leads: [base, failedLead, legacyFailed, overdue],
  complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: false,
  feedback: [], feedbackNeedsFix: 0, canComment: false, planDues: [], planOverdue: 0, planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: {
    ...INTAKE_HEAD_FIXTURE,
    failReasons: [
      ...INTAKE_HEAD_FIXTURE.failReasons.map((r) => (r.key === 'other_academy' ? { ...r, count: 1, names: ['신유나'] } : r)),
      { key: 'none', label: '분류 안 됨', count: 1, names: ['장서우'] },
    ],
  },
};

const meWithMoney = { id: 9, name: '대표', role: 'ceo', roleLabel: '대표', title: null, canAdminPage: true, canCrudAll: true, canSeeProfit: true, canCrudAttendance: true, canMoney: true, canWage: true, canApprove: true, canHide: true, canGpaPack: true } satisfies Me;

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); push.mockReset(); useSession.setState({ me: null }); });

async function setup(me: Me | null = null) {
  useSession.setState({ me, ready: true });
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({ data: url === '/ops' ? response : { staff: [{ id: 3, name: 'Grace' }], students: [], lib: [] } }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByText('백승우')).toBeTruthy());
  return view;
}

describe('§23 머리 7탭 (23-01 · 24-01)', () => {
  it('원본 차례 그대로 서고, 컷이 없는 탭은 이미 있는 화면으로 간다 — 미수·결제는 금액 권한이 있을 때만', async () => {
    const view = await setup(meWithMoney);
    const tabs = view.getByRole('group', { name: '상담 보기' });
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '단계 보드', '상담 일정', '사후 관리', '미수 · 결제', '등록 실패 내역', '표', '마케팅 유입',
    ]);
    expect(within(tabs).getByRole('button', { name: '단계 보드', pressed: true })).toBeTruthy();
    fireEvent.click(within(tabs).getByRole('button', { name: '상담 일정' }));
    fireEvent.click(within(tabs).getByRole('button', { name: '미수 · 결제' }));
    fireEvent.click(within(tabs).getByRole('button', { name: '마케팅 유입' }));
    expect(push.mock.calls.map((c) => c[0])).toEqual(['/schedule', '/accounting', '/ops?tab=mkt']);
    // 이동 탭은 이 화면의 보기를 바꾸지 않는다
    expect(within(tabs).getByRole('button', { name: '단계 보드', pressed: true })).toBeTruthy();
    cleanup();
    const noMoney = await setup(null);
    expect(within(noMoney.getByRole('group', { name: '상담 보기' })).queryByRole('button', { name: '미수 · 결제' })).toBeNull();
  });

  it('「사후 관리」는 다음 날짜가 적힌 건을 날짜 순으로, 「표」는 같은 응답의 모든 건을 한 줄씩 — 새로 묻지 않는다', async () => {
    const view = await setup();
    const tabs = view.getByRole('group', { name: '상담 보기' });
    fireEvent.click(within(tabs).getByRole('button', { name: '사후 관리' }));
    const follow = view.getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(follow).toHaveLength(2);
    expect(follow[0]).toContain('2026-09-18');
    expect(follow[0]).toContain('신유나');
    expect(follow[1]).toContain('정하윤');
    fireEvent.click(within(tabs).getByRole('button', { name: '표' }));
    expect(view.getByText('상담 4건')).toBeTruthy();
    expect(view.getAllByRole('row')).toHaveLength(5);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe('§23 카드 (23-10 · 23-12 · 23-13)', () => {
  it('이름 옆 학년 칩 · 오른쪽 위 유입 경로 배지 · 서버의 기한 띠(오늘 = 호박 · 지남 = 빨강) — 접수 경과 「N일」은 없다', async () => {
    const view = await setup();
    const card = view.getByText('백승우').closest('button')!;
    expect(within(card).getByText('G8')).toBeTruthy();
    expect(within(card).getByRole('img', { name: '유입 경로 소개' }).textContent).toBe('R');
    expect(within(card).getByText('2차 일정 + 진단고사 잡기')).toBeTruthy();
    expect(within(card).getByText('오늘').parentElement?.className).toContain('bg-amber');
    // 카드 바탕은 카드 한 장(몸통 단추 + 단추 줄을 감싼 자리)에 칠한다 — wave 6(23-14)에서 몸통 단추와 단추 줄이 형제가 됐다
    expect(card.parentElement?.className).toContain('bg-amber/10');
    expect(within(card).queryByText('1일')).toBeNull();
    const late = view.getByText('정하윤').closest('button')!;
    expect(within(late).getByText('1일 지남').parentElement?.className).toContain('bg-red');
    expect(late.parentElement?.className).toContain('bg-red/5');
  });

  it('실패 카드 — 사유(기울임) 아래 「상태 · 재연락 완료 · 09-18」 한 줄 · 중단 지점 칩은 없다 · 재연락 판정이 없는 옛 건은 줄이 없다 (원본 §23 · W11 1:1)', async () => {
    const view = await setup();
    const yuna = view.getByText('신유나').closest('button')!;
    const row = within(yuna).getByText('상태').parentElement!;
    expect(row.textContent).toBe('상태재연락 완료 · 09-18');
    expect(within(yuna).queryByText(/중단|안 옴|무산|미분류/)).toBeNull();
    const legacy = view.getByText('장서우').closest('button')!;
    expect(within(legacy).queryByText('상태')).toBeNull();
  });
});

describe('§24 등록 실패 내역 (24-04 · 24-05 · 24-06 · 24-07 · 24-08)', () => {
  const openFailed = (view: Awaited<ReturnType<typeof setup>>) =>
    fireEvent.click(within(view.getByRole('group', { name: '상담 보기' })).getByRole('button', { name: '등록 실패 내역' }));

  it('실패 카드는 실패한 날 · 그 전 단계 · 재연락 칩과 날짜 · 사유 분류를 서버 값 그대로 적고, 옛 건은 날짜를 짓지 않는다', async () => {
    const view = await setup();
    openFailed(view);
    const list = view.getByRole('list', { name: '실패한 상담' });
    const [yuna, seowoo] = within(list).getAllByRole('listitem');
    const text = (yuna!.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('G8 · 역삼중');
    expect(within(yuna!).getByRole('img', { name: '유입 경로 인스타그램' })).toBeTruthy();
    expect(within(yuna!).getByText('재연락 완료')).toBeTruthy();
    expect(within(yuna!).getByText('타 학원 등록')).toBeTruthy();
    expect(text).toContain('2026-08-18 · 보류 단계');
    expect(text).toContain('2026-09-18 (D-28)');
    expect(text).toContain('Grace · 08-25 11:20 — 9월 중간고사 끝나고 다시');
    expect((seowoo!.textContent ?? '')).toContain('날짜 기록 없음');
    // 실패 시각을 모르는 옛 건은 재연락을 판정하지 않는다 — 칩이 없고 날짜 칸은 「—」
    expect(within(seowoo!).queryByText(/재연락 (완료|대기)/)).toBeNull();
  });

  it('오른쪽 「실패 사유 N건」 막대는 서버 분류와 이름 칩 그대로 · 원문 안내 상자 둘이 선다', async () => {
    const view = await setup();
    openFailed(view);
    expect(view.getByText('실패 사유 2건')).toBeTruthy();
    const reasons = within(view.getByRole('list', { name: '실패 사유' })).getAllByRole('listitem');
    expect(reasons.map((li) => li.querySelector('span')?.textContent)).toEqual(['연락 두절', '타 학원 등록', '일정 안 맞음', '비용', '시기 안 맞음', '분류 안 됨']);
    expect(within(reasons[1]!).getByText('신유나')).toBeTruthy();
    expect(within(reasons[5]!).getByText('장서우')).toBeTruthy();
    expect(view.getByText('사유마다 다시 여는 방법이 다릅니다')).toBeTruthy();
    expect(view.getByText('되살리기 없이 등록 확정 화면으로 바로 갑니다')).toBeTruthy();
    expect(view.queryByText('왜 나눠서 세는가')).toBeNull();
  });

  it('「바로 수업 등록」은 되살리지 않고 등록 확정 창을 연다 (24-07)', async () => {
    const view = await setup();
    openFailed(view);
    const list = view.getByRole('list', { name: '실패한 상담' });
    const yuna = within(list).getAllByRole('listitem')[0]!;
    fireEvent.click(within(yuna).getByRole('button', { name: '바로 수업 등록' }));
    await waitFor(() => expect(view.getByRole('dialog', { name: '등록 확정 — 신유나' })).toBeTruthy());
    // 되살리기 요청은 가지 않았다
    const post = vi.spyOn(api, 'post');
    expect(post).not.toHaveBeenCalled();
  });

  it('실패로 분류할 때 사유 분류(서버 낱말 다섯)를 함께 보낸다 (24-05)', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...base, stage: 'failed' } } as never);
    const view = await setup();
    fireEvent.click(view.getByText('백승우'));
    const drawer = view.getByRole('dialog', { name: /백승우/ });
    const kind = within(drawer).getByLabelText('사유 분류') as HTMLSelectElement;
    expect([...kind.options].map((o) => o.textContent)).toEqual(['분류 선택', '연락 두절', '타 학원 등록', '일정 안 맞음', '비용', '시기 안 맞음']);
    fireEvent.change(kind, { target: { value: 'cost' } });
    fireEvent.click(within(drawer).getByRole('button', { name: '실패로 분류' }));
    fireEvent.click(within(drawer).getByRole('button', { name: '한 번 더 누르면 실패 확정' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    // 중단 지점은 보내지 않는다 — 서버가 실패 순간의 단계에서 판정한다 (N-87)
    expect(post.mock.calls[0]).toEqual(['/ops/leads/1/fail', { reasonKind: 'cost' }]);
  });

  it('A-08 실패 확정과 재연락 예정일을 한 요청으로 보낸다', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...base, stage: 'failed' } } as never);
    const view = await setup();
    fireEvent.click(view.getByText('백승우'));
    const drawer = view.getByRole('dialog', { name: /백승우/ });
    fireEvent.change(within(drawer).getByLabelText('사유 분류'), { target: { value: 'cost' } });
    fireEvent.change(within(drawer).getByLabelText('재연락 예정일 (선택)'), { target: { value: '2026-10-10' } });
    fireEvent.click(within(drawer).getByRole('button', { name: '실패로 분류' }));
    fireEvent.click(within(drawer).getByRole('button', { name: '한 번 더 누르면 실패 확정' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ops/leads/1/fail', {
      reasonKind: 'cost', nextOn: '2026-10-10',
    }));
  });
});

describe('§23 단계색 (23-03 · 23-04 · 23-09) — 공용 Chip 청록·주황 톤 · Board 윗선', () => {
  it('보드 칸 윗선이 원문 단계색이고, 「등록」 칸만 초록 바탕 · 그 앞에 구분선 · 건수는 이름 옆 숫자다', async () => {
    const view = await setup();
    const col = (key: string) => view.container.querySelector(`[data-board-column="${key}"]`) as HTMLElement;
    expect(col('first').className).toContain('border-t-blue');
    expect(col('wait2nd').className).toContain('border-t-teal');
    expect(col('second').className).toContain('border-t-orange');
    expect(col('hold').className).toContain('border-t-red');
    expect(col('enrolled').className).toContain('border-t-green');
    expect(col('failed').className).toContain('border-t-fg-subtle');
    expect(col('enrolled').className).toContain('bg-green/5');
    expect(col('hold').className).toContain('bg-inset');
    // 구분선은 서버 funnel 경계(보류 → 등록)에만 선다
    expect(col('enrolled').className).toContain("before:content-['']");
    expect(col('failed').className).not.toContain('before:');
    expect(within(col('first')).getByText('1', { selector: 'span.text-blue' })).toBeTruthy();
  });

  it('「표」의 단계 칩도 같은 톤 한 벌을 쓴다 — 보류 빨강', async () => {
    const view = await setup();
    fireEvent.click(within(view.getByRole('group', { name: '상담 보기' })).getByRole('button', { name: '표' }));
    const row = view.getAllByRole('row').find((r) => r.textContent?.includes('정하윤'))!;
    expect(within(row).getByText('보류').className).toContain('text-red');
  });
});
