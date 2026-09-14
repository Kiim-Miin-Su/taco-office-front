/** @file-guide
 * 목적: §47~§50 리포트 route의 capability 분기·4탭·미확정 경계를 검증한다.
 * 책임/재사용: route 조립만 확인하고 강사 선택/독촉 상세는 도메인 컴포넌트 테스트에 맡긴다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';

const nav = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
const mocks = vi.hoisted(() => ({
  permissions: { canCrudAll: false, canApprove: false },
  unwritten: vi.fn(), reports: vi.fn(), deliveryQuery: vi.fn(), historyQuery: vi.fn(), reminder: vi.fn(), detail: vi.fn(),
  board: vi.fn(), deliveryView: vi.fn(), historyView: vi.fn(), weeklyView: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/store/useSession', () => ({ useCan: (name: keyof typeof mocks.permissions) => mocks.permissions[name] }));
vi.mock('@/api/queries', () => ({
  useMeta: () => ({ data: { subs: [] } }),
  useUnwritten: mocks.unwritten,
  useReports: mocks.reports,
  useReportDelivery: mocks.deliveryQuery,
  useReportDeliveryHistory: mocks.historyQuery,
  useReportReminder: mocks.reminder,
  useReportDetail: mocks.detail,
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/report/UnwrittenReportBoard', () => ({ UnwrittenReportBoard: mocks.board }));
vi.mock('@/components/report/ReportDeliveryQueue', () => ({ ReportDeliveryQueue: mocks.deliveryView }));
vi.mock('@/components/report/ReportDeliveryHistory', () => ({ ReportDeliveryHistory: mocks.historyView }));
vi.mock('@/components/report/ReportWeeklyTrackingBoundary', () => ({ ReportWeeklyTrackingBoundary: mocks.weeklyView }));
vi.mock('@/components/report/ReportForm', () => ({ ReportEditor: () => null }));
vi.mock('@/components/report/ReportExportPanel', () => ({ ReportExportPanel: () => null }));

import ReportsPage from './page';

describe('리포트 역할별 화면', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.search = '';
    mocks.permissions.canCrudAll = false;
    mocks.permissions.canApprove = false;
    mocks.unwritten.mockReturnValue({ data: { total: 2, byTeacher: [], items: [] }, isLoading: false, isError: false });
    mocks.reports.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false });
    mocks.deliveryQuery.mockReturnValue({ data: { remaining: 5 }, isLoading: false, isError: false });
    mocks.historyQuery.mockReturnValue({ data: { total: 1, items: [{ id: 1 }] }, isLoading: false, isError: false });
    mocks.reminder.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.detail.mockReturnValue({});
    mocks.board.mockReturnValue(<div>강사별 조치 보드</div>);
    mocks.deliveryView.mockReturnValue(<div>어제 보내기 화면</div>);
    mocks.historyView.mockReturnValue(<div>보낸 내역 화면</div>);
    mocks.weeklyView.mockReturnValue(<div>주간 기준 미확정</div>);
  });

  it('강사는 전체 추적·독촉·발송 탭 없이 자기 작성 목록만 본다', () => {
    const view = render(<ReportsPage />);
    expect(view.getByRole('button', { name: '작성할 것 2' })).toBeTruthy();
    expect(view.queryByRole('tab', { name: /어제 보내기/ })).toBeNull();
    expect(view.queryByText('강사별 조치 보드')).toBeNull();
    expect(mocks.deliveryQuery).not.toHaveBeenCalled();
    expect(mocks.reminder).not.toHaveBeenCalled();
  });

  it('대표·관리자·매니저 capability는 원본 4탭과 같은 서버 배지를 공유한다', () => {
    mocks.permissions.canCrudAll = true;
    const view = render(<ReportsPage />);
    expect(view.getAllByRole('tab')).toHaveLength(4);
    expect(view.getByRole('tab', { name: /안 쓴 리포트 2건/ })).toBeTruthy();
    expect(view.getByRole('tab', { name: /어제 보내기 5명 남음/ })).toBeTruthy();
    expect(view.getByRole('tab', { name: /주간 트래킹 상세 기준 미확정/ })).toBeTruthy();
    expect(view.getByRole('tab', { name: /보낸 내역 1건/ })).toBeTruthy();
    expect(view.getByText('강사별 조치 보드')).toBeTruthy();
  });

  it('탭 전환은 URL과 본문을 함께 바꾸고 주간 상세를 발명하지 않는다', () => {
    mocks.permissions.canCrudAll = true;
    const view = render(<ReportsPage />);
    fireEvent.click(view.getByRole('tab', { name: /어제 보내기/ }));
    expect(view.getByText('어제 보내기 화면')).toBeTruthy();
    expect(nav.replace).toHaveBeenLastCalledWith('/reports?section=delivery', { scroll: false });
    fireEvent.click(view.getByRole('tab', { name: /주간 트래킹/ }));
    expect(view.getByText('주간 기준 미확정')).toBeTruthy();
    expect(nav.replace).toHaveBeenLastCalledWith('/reports?section=weekly', { scroll: false });
  });

  it('transport 실패 후 수동 재시도는 같은 requestKey를 써서 독촉 중복을 막는다', async () => {
    mocks.permissions.canCrudAll = true;
    const mutateAsync = vi.fn().mockRejectedValue(new ApiError('TIMEOUT', '응답 시간 초과', 0));
    mocks.reminder.mockReturnValue({ mutateAsync, isPending: false });
    render(<ReportsPage />);
    const props = mocks.board.mock.calls.at(-1)?.[0] as { onRemind: (teacherId?: number) => Promise<void> };
    await act(async () => { await props.onRemind(7); });
    await act(async () => { await props.onRemind(7); });
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync.mock.calls[0][0].requestKey).toBe(mutateAsync.mock.calls[1][0].requestKey);
  });

  it('직접 weekly URL을 복원하고 권한을 잃으면 즉시 강사 화면으로 바꾼다', () => {
    nav.search = 'section=weekly';
    mocks.permissions.canCrudAll = true;
    const view = render(<ReportsPage />);
    expect(view.getByText('주간 기준 미확정')).toBeTruthy();
    mocks.permissions.canCrudAll = false;
    view.rerender(<ReportsPage />);
    expect(view.queryByText('주간 기준 미확정')).toBeNull();
    expect(view.getByRole('button', { name: '작성할 것 2' })).toBeTruthy();
  });

  it('§14 승인 서랍 deep link는 4탭과 섞지 않고 전건 검토 큐로 연다', () => {
    nav.search = 'review=approval&serId=51&onDate=2026-09-01';
    mocks.permissions.canCrudAll = true;
    mocks.permissions.canApprove = true;
    mocks.reports.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false });
    const view = render(<ReportsPage />);
    expect(view.getByRole('heading', { name: '리포트 승인 대기' })).toBeTruthy();
    expect(view.queryByRole('tab')).toBeNull();
    expect(mocks.reports).toHaveBeenCalledWith({ state: 'wait' }, true);
    fireEvent.click(view.getByRole('button', { name: '안 쓴 리포트로 돌아가기' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/reports', { scroll: false });
  });

  it('승인 예외만 있는 강사는 승인 큐만 열고 관리 화면을 열지 않는다', () => {
    mocks.permissions.canApprove = true;
    const view = render(<ReportsPage />);
    fireEvent.click(view.getByRole('button', { name: '승인 대기' }));
    expect(mocks.reports).toHaveBeenLastCalledWith({ state: 'wait' }, true);
    expect(view.queryByRole('tab', { name: /어제 보내기/ })).toBeNull();
  });
});
