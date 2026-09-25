/** @file-guide
 * 목적: lead-failure.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** §24 실패 지정/되살리기 input (N-25 · C35) — 판정은 서버, 화면은 4어휘와 응답만 그린다. */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Lead, Ops } from '@/api/types';
import IntakePage from './page';
import { INTAKE_HEAD_FIXTURE } from './intake-head.fixture';
import { OPS_HEAD_FIXTURE } from '@/app/ops/ops-head.fixture';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const base: Lead = {
  id: 1, name: '기록있음학생', school: '언주중', ownerName: 'Grace', reason: '연락 두절',
  stage: 'failed', stopAt: 'after_first', ageDays: 0, createdAt: '2026-09-10', studentId: null, ownerId: null,
  failFrom: 'second', revivalStage: 'second', revivalSource: 'explicit',
  nextStages: [], touches: [],
};
const leads: Lead[] = [
  base,
  { ...base, id: 2, name: '예전건학생', failFrom: null, revivalStage: null, revivalSource: null },
  { ...base, id: 3, name: '진행중학생', stage: 'second', stopAt: null, failFrom: null, revivalStage: null, revivalSource: null },
  { ...base, id: 4, name: '등록학생', stage: 'enrolled', stopAt: null, failFrom: null, revivalStage: null, revivalSource: null },
];
const response: Ops = {
  leads, complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: false,
  feedback: [], feedbackNeedsFix: 0, canComment: false, planDues: [], planOverdue: 0, planStages: [], cplStages: [], cplAreas: [], cplSeverities: [],
  ...OPS_HEAD_FIXTURE,
  intakeHead: INTAKE_HEAD_FIXTURE,
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function setup() {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: response });
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: base });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = render(<QueryClientProvider client={client}><IntakePage /></QueryClientProvider>);
  await waitFor(() => expect(view.getByRole('button', { name: /진행중학생/ })).toBeTruthy());
  return { ...view, get, post };
}

describe('§24 실패 지정 — 진행 건', () => {
  it('중단 지점 없이는 확정 못 하고, 2단 확정으로만 서버 4어휘 body를 보낸다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /진행중학생/ }));
    // 실패 전 단계를 기록에 남긴다는 뜻만 업무 문장으로 — 필드명(fail_from)을 보이지 않는다 (23-20)
    expect(view.getByText(/지금 단계 「2차 상담」 — 실패로 분류해도 기록에 남아/)).toBeTruthy();

    const confirm = view.getByRole('button', { name: '실패로 분류' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); // 지점 선택 전

    const select = view.getByLabelText('중단 지점 (필수)') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(
      ['지점 선택', '상담 예약 전 이탈', '1차 상담 전 이탈', '1차 후 미진행', '2차 후 미등록']);
    fireEvent.change(select, { target: { value: 'after_second' } });
    fireEvent.change(view.getByLabelText(/사유 \(선택/), { target: { value: '  시간대 불일치  ' } });

    fireEvent.click(view.getByRole('button', { name: '실패로 분류' }));
    expect(view.post).not.toHaveBeenCalled(); // 1단은 무장만
    fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 실패 확정' }));
    await waitFor(() => expect(view.post).toHaveBeenCalledTimes(1));
    expect(view.post).toHaveBeenCalledWith('/ops/leads/3/fail', { stopAt: 'after_second', reason: '시간대 불일치' });
    await waitFor(() => expect(view.get).toHaveBeenCalledTimes(2)); // 성공 후 재조회
  });

  it('등록 건은 입력 없이 「실패로 바꿀 수 없다」 안내만 보여준다 — 오류 코드는 보이지 않는다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /등록학생/ }));
    expect(view.getByText('등록 완료된 건입니다 — 실패로 바꿀 수 없습니다.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('ENROLLED_LOCKED');
    expect(view.queryByRole('button', { name: '실패로 분류' })).toBeNull();
    expect(view.queryByRole('button', { name: '단계로 되살리기' })).toBeNull();
  });
});

describe('§24 되살리기 — 판정은 서버 응답만 소비', () => {
  it('명시값 건은 판정 근거를 보이고, 지정 없이 2단 되살리기로 빈 body를 보낸다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /기록있음학생/ }));
    expect(view.getByText(/실패로 분류할 때 남긴 단계/)).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: '단계로 되살리기' }));
    fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 되살리기' }));
    await waitFor(() => expect(view.post).toHaveBeenCalledWith('/ops/leads/1/resume', {}));
  });

  it('미분류 레거시 건은 단계를 지정해야만 되살리기가 풀린다 — 추정 이관 없음', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /예전건학생/ }));
    expect(view.getByText(/미분류 — 실패 전 단계 기록이 없는 예전 건입니다/)).toBeTruthy();

    const confirm = view.getByRole('button', { name: '단계로 되살리기' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(view.getByLabelText(/되살릴 단계 \(지정 필수\)/), { target: { value: 'hold' } });
    fireEvent.click(view.getByRole('button', { name: '단계로 되살리기' }));
    fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 되살리기' }));
    await waitFor(() => expect(view.post).toHaveBeenCalledWith('/ops/leads/2/resume', { to: 'hold' }));
  });
});

describe('등록 확정 입구 (C91 · A-05)', () => {
  it('깔때기 안의 건에만 「등록 확정」이 서고 창이 열린다 — 등록·실패 건에는 없다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /진행중학생/ }));
    const open = view.getByRole('button', { name: '등록 확정' });
    fireEvent.click(open);
    const dialog = await view.findByRole('dialog', { name: '등록 확정 — 진행중학생' });
    expect(within(dialog).getByLabelText('이름')).toHaveProperty('value', '진행중학생');
    expect(within(dialog).getByLabelText('학교')).toHaveProperty('value', '언주중');
    fireEvent.click(within(dialog).getByRole('button', { name: '취소 (Esc)' }));
    // 등록 확정 창만 닫힌다 — 카드 상세 서랍(역시 dialog)은 남는다 (23-14)
    await waitFor(() => expect(view.queryByRole('dialog', { name: '등록 확정 — 진행중학생' })).toBeNull());
    // 등록 건 — 입구 없음
    fireEvent.click(view.getByRole('button', { name: /진행중학생/ }));
    fireEvent.click(view.getByRole('button', { name: /등록학생/ }));
    expect(view.queryByRole('button', { name: '등록 확정' })).toBeNull();
  });
});

/**
 * 23-20 (P0) — 상세에 개발 문장이 보이지 않는다.
 * 절 번호(§) · 결정 번호(N-/A-/D-R) · 필드명(fail_from) · 오류 코드(ENROLLED_LOCKED)는 사람의 낱말이 아니다.
 * 화면에 적힌 글과 마우스를 올리면 뜨는 title 둘 다 본다 — 둘 다 사용자에게 보인다.
 */
const INTERNAL = /§|N-\d|A-\d|D-R\d|fail_from|ENROLLED_LOCKED|서버 전이표|명시값|레거시|추정 이관/;
const visibleText = () => [
  document.body.textContent ?? '',
  ...[...document.body.querySelectorAll('[title]')].map((n) => n.getAttribute('title') ?? ''),
].join('\n');

describe('상세 서랍의 사용자 글 (23-20 · P0)', () => {
  it.each(['진행중학생', '기록있음학생', '예전건학생', '등록학생'])('%s 상세에 절 번호·결정 번호·필드명·오류 코드가 없다', async (name) => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: new RegExp(name) }));
    expect(view.getByRole('dialog', { name: new RegExp(name) })).toBeTruthy();
    expect(visibleText()).not.toMatch(INTERNAL);
  });

  it('등록 확정 창의 청구서 체크 글에도 절 번호가 없다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /진행중학생/ }));
    fireEvent.click(view.getByRole('button', { name: '등록 확정' }));
    const dialog = await view.findByRole('dialog', { name: '등록 확정 — 진행중학생' });
    expect(within(dialog).getByLabelText('첫 달 수업료 청구서를 함께 냅니다')).toBeTruthy();
    expect(visibleText()).not.toMatch(INTERNAL);
  });
});

/**
 * 23-14 (P1) — 카드를 누르면 동작이 **첫 화면 안**에 뜬다.
 * 예전에는 보드 아래 패널(1600×1000 에서 y≈960)이라 누른 뒤 한참 내려가야 했다. 공용 `Drawer` 로 옮겼다.
 */
describe('카드 → 상세 서랍 (23-14 · P1)', () => {
  it('진행 건 카드를 누르면 서랍이 열리고 등록 확정·실패 분류·접촉 원장이 그 안에 있으며, Esc 로 닫힌다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /진행중학생/ }));
    const drawer = view.getByRole('dialog', { name: /진행중학생 — 2차 상담/ });
    expect(within(drawer).getByRole('button', { name: '등록 확정' })).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: '실패로 분류' })).toBeTruthy();
    expect(within(drawer).getByRole('region', { name: '접촉 원장' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(view.queryByRole('dialog')).toBeNull();
  });

  it('실패 건 서랍에는 되살리기가 있고 「닫기」로 닫는다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /기록있음학생/ }));
    const drawer = view.getByRole('dialog', { name: /기록있음학생/ });
    expect(within(drawer).getByRole('button', { name: '단계로 되살리기' })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole('button', { name: '닫기' }));
    expect(view.queryByRole('dialog')).toBeNull();
  });

  it('등록 확정 창 위에서 Esc 는 그 창만 닫고 서랍은 남는다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /진행중학생/ }));
    fireEvent.click(view.getByRole('button', { name: '등록 확정' }));
    await view.findByRole('dialog', { name: '등록 확정 — 진행중학생' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(view.queryByRole('dialog', { name: '등록 확정 — 진행중학생' })).toBeNull());
    expect(view.getByRole('dialog', { name: /진행중학생 — 2차 상담/ })).toBeTruthy();
  });
});
