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
});
