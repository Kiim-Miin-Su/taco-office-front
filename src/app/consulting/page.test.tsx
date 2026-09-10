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

const query = vi.hoisted(() => ({ data: undefined as unknown, isError: false, isLoading: false, error: null as unknown }));
vi.mock('@/api/queries', () => ({ useConsulting: () => query }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));

const item: Consulting = {
  id: 1, consType: 'future_type', stage: 'contract', contractStep: null, studentNames: ['테스트 학생'],
  createdAt: '2026-09-07', share: 'all', canOpen: true, sessions: null,
  sessionsLog: [{ id: 1, seq: 1, onDate: null }],
};

describe('§26 조회 계약 통합', () => {
  beforeEach(() => { Object.assign(query, { data: { items: [item], canSeeAmounts: false }, isError: false, isLoading: false, error: null }); });

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
    query.data = { items: [{ ...item, canOpen: false, sessionsLog: [] }], canSeeAmounts: false };
    view.rerender(<ConsultingPage />);
    expect(view.queryByText('회차 기록 — 테스트 학생')).toBeNull();
  });

  it('단계 선택은 표시만 바꾸고 전체 건수·잠긴 카드의 권한은 유지한다', () => {
    query.data = { items: [item, { ...item, id: 2, stage: 'running', studentNames: ['진행 학생'], canOpen: false }], canSeeAmounts: false };
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
    query.data = { items: [{ ...item, stage: 'running' }], canSeeAmounts: false };
    view.rerender(<ConsultingPage />);
    expect(view.getByRole('button', { name: '진행 1', pressed: true })).toBeTruthy();
    expect(view.getByRole('button', { name: '테스트 학생 컨설팅 상세' })).toBeTruthy();
    query.isError = true;
    query.error = new ApiError('INTERNAL', '조회 실패', 500);
    view.rerender(<ConsultingPage />);
    expect(view.queryByRole('group', { name: '컨설팅 단계 필터' })).toBeNull();
    expect(view.queryByRole('button', { name: /컨설팅 상세/ })).toBeNull();
    query.isError = false;
    query.data = { items: [], canSeeAmounts: false };
    view.rerender(<ConsultingPage />);
    expect(view.getByRole('button', { name: '진행 0', pressed: true })).toBeTruthy();
  });
});
