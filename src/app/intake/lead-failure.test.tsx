/** @file-guide
 * 목적: lead-failure.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** §24 실패 지정/되살리기 input (N-25 · C35) — 판정은 서버, 화면은 4어휘와 응답만 그린다. */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Lead, Ops } from '@/api/types';
import IntakePage from './page';

vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const base: Lead = {
  id: 1, name: '명시값학생', school: '언주중', ownerName: 'Grace', reason: '연락 두절',
  stage: 'failed', stopAt: 'after_first', ageDays: 0, createdAt: '2026-09-10', studentId: null, ownerId: null,
  failFrom: 'second', revivalStage: 'second', revivalSource: 'explicit',
};
const leads: Lead[] = [
  base,
  { ...base, id: 2, name: '레거시학생', failFrom: null, revivalStage: null, revivalSource: null },
  { ...base, id: 3, name: '진행중학생', stage: 'second', stopAt: null, failFrom: null, revivalStage: null, revivalSource: null },
  { ...base, id: 4, name: '등록학생', stage: 'enrolled', stopAt: null, failFrom: null, revivalStage: null, revivalSource: null },
];
const response: Ops = {
  leads, complaints: [], todos: [], plans: [], meetings: [], marketing: [], suggestions: [], canSeeAmounts: false,
  feedback: [], feedbackNeedsFix: 0, canComment: false, planDues: [], planOverdue: 0, planStages: [],
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
    expect(view.getByText(/현재 단계 「2차 상담」를 서버가 명시값/)).toBeTruthy();

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

  it('등록 건은 입력 없이 ENROLLED_LOCKED 안내만 보여준다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /등록학생/ }));
    expect(view.getByText(/실패 전환은 서버가 막습니다 \(ENROLLED_LOCKED\)/)).toBeTruthy();
    expect(view.queryByRole('button', { name: '실패로 분류' })).toBeNull();
    expect(view.queryByRole('button', { name: '되살리기' })).toBeNull();
  });
});

describe('§24 되살리기 — 판정은 서버 응답만 소비', () => {
  it('명시값 건은 판정 근거를 보이고, 지정 없이 2단 되살리기로 빈 body를 보낸다', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /명시값학생/ }));
    expect(view.getByText(/실패 때 서버가 기록한 명시값/)).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: '되살리기' }));
    fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 되살리기' }));
    await waitFor(() => expect(view.post).toHaveBeenCalledWith('/ops/leads/1/resume', {}));
  });

  it('미분류 레거시 건은 단계를 지정해야만 되살리기가 풀린다 — 추정 이관 없음', async () => {
    const view = await setup();
    fireEvent.click(view.getByRole('button', { name: /레거시학생/ }));
    expect(view.getByText(/미분류 — 실패 전 단계 이력이 없는 레거시 건/)).toBeTruthy();

    const confirm = view.getByRole('button', { name: '되살리기' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(view.getByLabelText(/되살릴 단계 \(지정 필수\)/), { target: { value: 'hold' } });
    fireEvent.click(view.getByRole('button', { name: '되살리기' }));
    fireEvent.click(view.getByRole('button', { name: '한 번 더 누르면 되살리기' }));
    await waitFor(() => expect(view.post).toHaveBeenCalledWith('/ops/leads/2/resume', { to: 'hold' }));
  });
});
