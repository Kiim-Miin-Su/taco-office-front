/** @file-guide
 * 목적: BO-09E-01 Kinder 관리자 입력이 생성 계약·KST 변환·version·409 충돌 정보를 그대로 쓰는지 검증한다.
 * 책임/재사용: 실제 query/mutation hook과 화면을 쓰고 HTTP client만 대역으로 둔다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-09E1-KINDER-ROSTER-GUARD-2026-10-08.md · docs/contracts/CONTRACTS.md
 */
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/api/client';
import type { StudentKinderMarker, StudentKinderMarkerHistory } from '@/api/students';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { KinderMarkerPanel } from './KinderMarkerPanel';

const admin: Me = { id: 3, name: '관리자', role: 'manager', roleLabel: '매니저', title: null,
  canAdminPage: true, canCrudAll: true, canSeeProfit: false, canCrudAttendance: false,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const history: StudentKinderMarkerHistory = { studentId: 21, currentVersion: 0, current: null, items: [] };
const marker: StudentKinderMarker = { id: 51, studentId: 21, version: 1, marked: true,
  effectiveFrom: '2026-10-20T01:00:00.000Z', reason: '학부모 확인', setBy: 3, setByName: '관리자', createdAt: '2026-10-08T01:00:00.000Z' };
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  useSession.getState().signIn('kinder-marker-test', admin);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); useSession.getState().signOut(); vi.restoreAllMocks(); });

describe('KinderMarkerPanel', () => {
  it('서버 version과 KST 미래 시각·사유를 생성 DTO 그대로 POST하고 재조회한다', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: history });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: marker });
    const view = render(<KinderMarkerPanel studentId={21} />, { wrapper });
    await view.findByText('현재 상태: 표식 없음');
    fireEvent.change(view.getByLabelText('효력 시작 (KST)'), { target: { value: '2026-10-20T10:00' } });
    fireEvent.change(view.getByLabelText('변경 사유'), { target: { value: '  학부모 확인  ' } });
    fireEvent.click(view.getByRole('button', { name: 'version 1 예약' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/students/21/kinder-marker', {
      marked: true, effectiveFrom: '2026-10-20T01:00:00.000Z', expectedVersion: 0, reason: '학부모 확인',
    }));
    await view.findByText('표식을 예약했습니다. 수업 명단은 자동으로 바꾸지 않았습니다.');
    await waitFor(() => expect(get.mock.calls.filter(([path]) => path === '/students/21/kinder-marker').length).toBeGreaterThan(1));
  });

  it('409는 자동 분리하지 않고 원래 회차일·실제일·충돌기간을 표시한다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: history });
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(
      'KINDER_GROUP_CONFLICT', 'Kinder 수업에는 학생 한 명만 참여할 수 있습니다', 409,
      { code: 'KINDER_GROUP_CONFLICT', message: 'Kinder 수업에는 학생 한 명만 참여할 수 있습니다',
        serId: 91, onDate: '2028-01-03', date: '2028-01-04', conflictFrom: '2028-01-03', conflictTo: null,
        studentIds: [21, 22] },
    ));
    const view = render(<KinderMarkerPanel studentId={21} />, { wrapper });
    await view.findByText('현재 상태: 표식 없음');
    fireEvent.click(view.getByRole('button', { name: 'version 1 예약' }));
    await view.findByText('Kinder 수업에는 학생 한 명만 참여할 수 있습니다');
    expect(view.getByText(/수업 #91 · 원래 2028-01-03 · 실제 2028-01-04 · 충돌기간 2028-01-03~종료 없음/)).toBeTruthy();
    expect(view.getByRole('button', { name: '최신 이력 다시 불러오기' })).toBeTruthy();
  });
});
