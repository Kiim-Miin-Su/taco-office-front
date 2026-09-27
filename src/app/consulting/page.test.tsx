/** @file-guide
 * 목적: page.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import type { Consulting } from '@/api/types';
import ConsultingPage from './page';
import { CONSULTING_STAGE_FIXTURE, consultingItem } from '@/components/consulting/consulting.fixture';

const query = vi.hoisted(() => ({ data: undefined as unknown, isError: false, isLoading: false, error: null as unknown }));
const create = vi.hoisted(() => ({ data: undefined as { id: number } | undefined, mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as unknown }));
const empty = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };
vi.mock('@/api/queries', () => ({
  useConsulting: () => query,
  // §28 은 그 탭을 열 때만 도는 다른 질의다 — 이 시험은 §26 쪽만 본다
  useConsAccounting: () => ({ data: undefined, isError: false, isLoading: false, error: null }),
  useConsStudents: () => ({ data: undefined, isError: false, isLoading: false, error: null }),
  useToggleConsultingItem: () => empty,
  useMeta: () => ({ data: { staff: [], students: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  useCreateConsulting: () => create,
  useAddConsPayment: () => empty,
  useConsToInvoice: () => empty,
}));
vi.mock('@/store/useSession', () => ({ useCan: () => false }));
const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/consulting/ConsultingStartForm', () => ({
  ConsultingStartForm: ({ onSubmit }: { onSubmit: (body: never) => void }) => <button type="button" onClick={() => onSubmit({} as never)}>테스트 시작 제출</button>,
}));
vi.mock('@/components/consulting/ConsultingContractWorkflow', () => ({
  ConsultingContractWorkflow: ({ consId, summary }: { consId: number; summary?: Consulting }) => <div>
    <span>워크플로 #{consId}</span>
    {summary ? <><span>회차 기록 — {summary.studentNames.join(' · ')}</span><span>{summary.sessionsLog[0]?.onDate ?? '날짜 미정'}</span></> : null}
  </div>,
}));

const item: Consulting = consultingItem({
  id: 1, consType: 'future_type', stage: 'contract', contractStep: null, contractStepLabel: null,
  studentNames: ['테스트 학생'], typeLabel: 'future_type',
  createdAt: '2026-09-07', share: 'all', canOpen: true, sessions: null,
  sessionsLog: [{ id: 1, seq: 1, onDate: null }],
  items: [],
});

describe('§26 조회 계약 통합', () => {
  beforeEach(() => {
    nav.search = '';
    Object.assign(query, { data: { items: [item], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE }, isError: false, isLoading: false, error: null });
    Object.assign(create, { data: undefined, mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null });
  });

  it('알림 링크의 `?id=` 는 그 건 상세를 바로 연다 — 잠긴 건 · 형식이 틀린 값이면 보드만 보인다 (W11 알림 링크)', () => {
    nav.search = '?id=1';
    const opened = render(<ConsultingPage />);
    expect(opened.getByText('워크플로 #1')).toBeTruthy();
    opened.unmount();

    query.data = { items: [{ ...item, canOpen: false, sessionsLog: [], items: [] }], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE };
    const locked = render(<ConsultingPage />);
    expect(locked.queryByText(/워크플로 #/)).toBeNull();
    locked.unmount();

    query.data = { items: [item], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE };
    nav.search = '?id=1abc';
    const bad = render(<ConsultingPage />);
    expect(bad.queryByText(/워크플로 #/)).toBeNull();
  });

  it('§29 생성 성공 응답 id로 즉시 §30 상세을 연다', () => {
    create.mutate.mockImplementation((_body, options) => {
      create.data = { id: 99 };
      options.onSuccess({ id: 99 });
    });
    const view = render(<ConsultingPage />);
    fireEvent.click(view.getByRole('button', { name: '+ 컨설팅 시작' }));
    fireEvent.click(view.getByRole('button', { name: '테스트 시작 제출' }));
    expect(view.getByText('워크플로 #99')).toBeTruthy();
  });

  it('알 수 없는 종류와 날짜 미정을 손실 없이 표시한다', () => {
    const view = render(<ConsultingPage />);
    expect(view.getByText('future_type')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '테스트 학생 컨설팅 상세' }));
    expect(view.getByText('날짜 미정')).toBeTruthy();
    expect(view.queryByText('null')).toBeNull();
  });

  it('무결성 오류를 권한 오류로 오표시하지 않고 이전 상세도 닫는다', () => {
    const view = render(<ConsultingPage />);
    fireEvent.click(view.getByRole('button', { name: '테스트 학생 컨설팅 상세' }));
    query.isError = true;
    query.error = new ApiError('INTERNAL', '컨설팅 데이터 무결성 오류', 500);
    view.rerender(<ConsultingPage />);
    expect(view.getByText('컨설팅 데이터 무결성 오류')).toBeTruthy();
    expect(view.queryByText('날짜 미정')).toBeNull();
  });

  it('재조회 후 열람 권한이 사라지면 이미 연 상세도 닫는다', () => {
    const view = render(<ConsultingPage />);
    fireEvent.click(view.getByRole('button', { name: '테스트 학생 컨설팅 상세' }));
    query.data = { items: [{ ...item, canOpen: false, sessionsLog: [], items: [] }], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE };
    view.rerender(<ConsultingPage />);
    expect(view.queryByText('회차 기록 — 테스트 학생')).toBeNull();
  });

  it('「단계 보드」 동그라미는 열린 건(계약 + 진행) 수다 — 원본 §26 「2」 (26-04)', () => {
    query.data = { items: [item, { ...item, id: 2, stage: 'running' }, { ...item, id: 3, stage: 'done' }], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE };
    const view = render(<ConsultingPage />);
    const tab = view.getByRole('tab', { name: /단계 보드/ });
    expect(tab.parentElement?.querySelector('[aria-hidden]')?.textContent).toBe('2');
  });

  it('「학생별 · N명」은 탭을 열기 전에도 선다 — 목록 응답의 서버 수(studentCount)다 (26-03)', () => {
    query.data = { items: [item], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE, studentCount: 2 };
    const view = render(<ConsultingPage />);
    expect(view.getByRole('tab', { name: /학생별/ }).textContent).toContain('2명');
  });

  it('이력 표의 종류는 서버 낱말(typeLabel)이다 — 화면이 종류 표를 들지 않는다 (29-02)', () => {
    query.data = { items: [{ ...item, stage: 'done', consType: 'transfer', typeLabel: '편입 · 전학' }], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE };
    const view = render(<ConsultingPage />);
    fireEvent.click(view.getByRole('tab', { name: /이력/ }));
    expect(view.getByText('편입 · 전학')).toBeTruthy();
  });

  it('탭 카드는 제목과 같은 줄(머리 가운데 자리)에 선다 (26-01)', () => {
    query.data = { items: [item], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE };
    const view = render(<ConsultingPage />);
    const center = view.container.querySelector('[data-page-header-center]') as HTMLElement;
    expect(center.contains(view.getByRole('tab', { name: /단계 보드/ }))).toBe(true);
    expect(center.parentElement?.contains(view.getByRole('heading', { name: '컨설팅' }))).toBe(true);
  });

  it('단계 선택은 표시만 바꾸고 전체 건수·잠긴 카드의 권한은 유지한다', () => {
    query.data = { items: [item, { ...item, id: 2, stage: 'running', studentNames: ['진행 학생'], canOpen: false }], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE };
    const view = render(<ConsultingPage />);
    expect(view.getByRole('button', { name: '전체 2', pressed: true })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '진행 1' }));
    expect(view.getByRole('button', { name: '진행 1', pressed: true })).toBeTruthy();
    expect(view.queryByRole('button', { name: '테스트 학생 컨설팅 상세' })).toBeNull();
    expect(view.getByRole('button', { name: '진행 학생 컨설팅 상세 잠김' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(view.getByRole('button', { name: '종료 0' }));
    expect(view.queryByRole('button', { name: /컨설팅 상세/ })).toBeNull();
    expect(view.getByRole('button', { name: '전체 2' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '전체 2' }));
    expect(view.getByRole('button', { name: '테스트 학생 컨설팅 상세' })).toBeTruthy();
  });

  it('새 응답과 오류는 선택 상태를 유지하되 과거 결과·건수를 재사용하지 않는다', () => {
    const view = render(<ConsultingPage />);
    fireEvent.click(view.getByRole('button', { name: '진행 0' }));
    query.data = { items: [{ ...item, stage: 'running' }], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE };
    view.rerender(<ConsultingPage />);
    expect(view.getByRole('button', { name: '진행 1', pressed: true })).toBeTruthy();
    expect(view.getByRole('button', { name: '테스트 학생 컨설팅 상세' })).toBeTruthy();
    query.isError = true;
    query.error = new ApiError('INTERNAL', '조회 실패', 500);
    view.rerender(<ConsultingPage />);
    expect(view.queryByRole('group', { name: '컨설팅 단계 필터' })).toBeNull();
    expect(view.queryByRole('button', { name: /컨설팅 상세/ })).toBeNull();
    query.isError = false;
    query.data = { items: [], canSeeAmounts: false, stages: CONSULTING_STAGE_FIXTURE };
    view.rerender(<ConsultingPage />);
    expect(view.getByRole('button', { name: '진행 0', pressed: true })).toBeTruthy();
  });
});
